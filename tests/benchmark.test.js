// Pruebas del tablero comparativo (% de la meta y zona) y de los rankings entre empresas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EA, makeProject, synth, close } = require('./helpers');
require('../src/core/benchmark.js');
require('../src/ui/benchmark-views.js');
const BM = EA.benchmark, D = EA.dataset;

/** Empresa sintética: 24 meses base + 12 de seguimiento con un cambio de consumo conocido. */
function company(name, change, seed, extra) {
  const base = synth(24, '2021-01', 2000, 1.5, 15, seed);
  const seg = synth(12, '2023-01', 2000, 1.5, 15, seed + 1).map(r => [r[0], (2000 + 1.5 * r[2]) * (1 - change), r[2], 'seguimiento']);
  const p = makeProject(base.concat(seg), extra);
  p.id = name; p.company.name = name;
  return p;
}

test('Zonas: verde ≤ 100 %, amarilla hasta la línea base, roja por encima', () => {
  assert.equal(BM.zoneOf(98, 103), 'verde');
  assert.equal(BM.zoneOf(100, 103), 'verde');
  assert.equal(BM.zoneOf(101.5, 103), 'amarilla');
  assert.equal(BM.zoneOf(104, 103), 'roja');
  assert.equal(BM.zoneOf(null, 103), null);
});

test('% de la meta consumido = ΣE / ΣE_meta(P) y ahorro = (ΣÊ − ΣE)/ΣÊ en el seguimiento', () => {
  const p = company('A', 0.08, 5);
  const r = BM.evaluateCompany(p);
  const R = r.R, seg = R.baseline.monthly.filter(m => m.period === 'seguimiento');
  const sE = seg.reduce((s, m) => s + m.E, 0), sLB = seg.reduce((s, m) => s + m.Eest, 0), sM = seg.reduce((s, m) => s + R.target.model.predict(m.P), 0);
  assert.equal(r.evidence, 'medido');
  assert.equal(r.evalPeriod.months, 12);
  assert.ok(close(r.pctMeta, sE / sM * 100, 1e-12));
  assert.ok(close(r.savingsPct, (sLB - sE) / sLB * 100, 1e-12));
  assert.ok(Math.abs(r.savingsPct - 8) < 0.5);
  assert.equal(r.zone, 'verde');
});

test('Ranking por ahorro: medidos primero (mayor a menor), luego indicativos; sin línea base no se ranquea', () => {
  const a = company('Ahorra 3 %', 0.03, 11), b = company('Ahorra 9 %', 0.09, 21), c = company('Empeora 4 %', -0.04, 31);
  const ind = makeProject(synth(18, '2022-01', 500, 2, 3, 41)); ind.id = 'ind'; ind.company.name = 'Indicativa';
  const few = makeProject(synth(4, '2024-01', 500, 2, 3, 51)); few.id = 'few'; few.company.name = 'Pocos datos';
  const B = BM.compare([a, b, c, ind, few]);
  assert.deepEqual(B.savingsRanking.map(r => r.name), ['Ahorra 9 %', 'Ahorra 3 %', 'Empeora 4 %', 'Indicativa']);
  assert.equal(B.savingsRanking[3].evidence, 'indicativo');
  assert.equal(B.notRanked.length, 1); assert.equal(B.notRanked[0].name, 'Pocos datos');
  assert.equal(B.rows.find(r => r.name === 'Empeora 4 %').zone, 'roja');
  // El CSV del ranking se genera
  const csv = EA.benchmarkViews.rankingCSV(B);
  assert.match(csv, /Ahorra 9 %/);
});

test('Ranking por factor de emisión: de menor a mayor factor normalizado a t CO₂/kWh', () => {
  const a = company('A', 0.02, 61), b = company('B', 0.02, 71), c = company('C', 0.02, 81);
  a.config.emissionFactor = 0.5; b.config.emissionFactor = 0.3;
  c.config.emissionFactor = 400; c.config.emissionFactorMass = 'kg'; c.config.emissionFactorPer = 'MWh'; // 0,0004 t/kWh
  const B = BM.compare([a, b, c]);
  assert.deepEqual(B.feRanking.map(r => r.name), ['C', 'B', 'A']);
  assert.ok(close(B.feRanking[0].feTPerKWh, 0.0004, 1e-12));
  assert.ok(B.feRanking.every(r => r.tco2 > 0 && r.ha > 0));
});

test('Tablero y ranking se generan sin errores con la demostración de 4 empresas', () => {
  const cs = EA.demo.buildCompanies().map(p => { p.id = p.id || D.uid('e'); return p; });
  const B = BM.compare(cs);
  assert.equal(B.rows.length, 4);
  assert.equal(B.savingsRanking[0].name.startsWith('Plásticos'), true);
  const html = EA.benchmarkViews.dashboard(B, 600) + EA.benchmarkViews.ranking(B, 600);
  assert.ok(!/undefined|NaN/.test(html.replace(/data-tip="[^"]*"/g, '')));
});

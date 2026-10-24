// Pruebas del motor de análisis: número variable de observaciones, línea base, línea meta,
// indicadores base 100, CUSUM, seguimiento, presupuesto y meta corporativa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EA, makeProject, synth, close } = require('./helpers');
const A = EA.analysis, D = EA.dataset;

/** Implementación independiente (sumas sin centrar, como las fórmulas clásicas de Excel) para contrastar. */
function naiveOLS(xs, ys) {
  const n = xs.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  let sse = 0, sst = 0; const ym = sy / n;
  for (let i = 0; i < n; i++) { sse += (ys[i] - a - b * xs[i]) ** 2; sst += (ys[i] - ym) ** 2; }
  return { slope: b, intercept: a, r2: 1 - sse / sst, s: Math.sqrt(sse / (n - 2)) };
}

test('Funciona con 12, 17, 24, 36 y 60 meses sin supuestos de 12 meses', () => {
  for (const n of [12, 17, 24, 36, 60]) {
    const rows = synth(n, '2019-01', 5000, 3.2, 300, n);
    const R = A.runAnalysis(makeProject(rows));
    assert.equal(R.ok, true, `n=${n}`);
    assert.equal(R.counts.monthsEntered, n);
    assert.equal(R.counts.used, n);
    assert.equal(R.counts.baseline, n);
    assert.equal(R.baseline.model.n, n);
    assert.equal(R.baseline.monthly.length, n);
    assert.equal(R.indicators.monthly.length, n);
    const ref = naiveOLS(rows.map(r => r[2]), rows.map(r => r[1]));
    assert.ok(close(R.baseline.model.slope, ref.slope, 1e-8), `pendiente n=${n}`);
    assert.ok(close(R.baseline.model.intercept, ref.intercept, 1e-8));
    assert.ok(close(R.baseline.model.r2, ref.r2, 1e-8));
    assert.ok(close(R.baseline.model.s, ref.s, 1e-8));
    assert.equal(R.baseline.assessment.annualCycle, n >= 12);
  }
});

test('Pocos datos: no se calcula la línea base y se explica por qué', () => {
  const R5 = A.runAnalysis(makeProject(synth(5, '2024-01', 100, 2, 5)));
  assert.equal(R5.baseline.status, 'insufficient');
  assert.match(R5.baseline.reasons[0], /mínimo configurado es 6/);
  assert.equal(R5.baseline.model, undefined);
  assert.equal(R5.target.status, 'no_baseline');
  assert.equal(R5.indicators.available, false);
  assert.equal(R5.descriptive.n, 5); // los descriptivos sí se calculan
  const R2 = A.runAnalysis(makeProject(synth(2, '2024-01', 100, 2, 5)));
  assert.match(R2.baseline.reasons[0], /al menos 3/);
  // El mínimo es configurable
  const p = makeProject(synth(5, '2024-01', 100, 2, 5)); p.config.minObsBaseline = 4;
  assert.equal(A.runAnalysis(p).baseline.status, 'ok');
});

test('Producción constante: la pendiente no es estimable', () => {
  const rows = []; for (let i = 0; i < 8; i++) rows.push([D.addMonths('2023-01', i), 100 + i, 50]);
  const R = A.runAnalysis(makeProject(rows));
  assert.equal(R.baseline.status, 'invalid');
});

test('Valores de referencia de los datos de demostración (prueba de regresión)', () => {
  const golden = {
    17: { slope: 0.03606525967043581, intercept: 185286.2481123712, r2: 0.9628265207043921, nT: 10, tSlope: 0.03740846319362298, tInt: 168150.96001162578, icw: 0.05560737296311347 },
    24: { slope: 0.03571839082396552, intercept: 188226.41575899074, r2: 0.9542015583451596, nT: 13, tSlope: 0.03633362874758393, tInt: 177053.59263176593, icw: 0.05497788589685542 },
    36: { slope: 0.03555550173205648, intercept: 194913.92356100155, r2: 0.952278587569479, nT: 11, tSlope: 0.037164341260950924, tInt: 172781.1805814181, icw: 0.05427939571948789 }
  };
  for (const k of Object.keys(golden)) {
    const g = golden[k], R = A.runAnalysis(EA.demo.build(k));
    assert.ok(close(R.baseline.model.slope, g.slope, 1e-9), `pendiente demo ${k}`);
    assert.ok(close(R.baseline.model.intercept, g.intercept, 1e-9));
    assert.ok(close(R.baseline.model.r2, g.r2, 1e-9));
    assert.equal(R.target.n, g.nT);
    assert.ok(close(R.target.model.slope, g.tSlope, 1e-9));
    assert.ok(close(R.target.model.intercept, g.tInt, 1e-9));
    assert.ok(close(R.descriptive.IC.weighted, g.icw, 1e-12));
  }
});

test('Índice de consumo: ponderado = ΣE/ΣP y se omite producción cero', () => {
  const rows = [['2024-01', 100, 10], ['2024-02', 300, 20], ['2024-03', 50, 0]];
  const R = A.runAnalysis(makeProject(rows));
  assert.ok(close(R.descriptive.IC.weighted, 400 / 30));
  assert.ok(close(R.descriptive.IC.simpleMean, (10 + 15) / 2));
  assert.equal(R.descriptive.IC.n, 2);
  assert.equal(R.descriptive.monthly[2].IC, null);
});

test('Línea meta: usa exactamente los meses bajo la línea base', () => {
  const R = A.runAnalysis(EA.demo.build('24'));
  const lb = R.baseline.model;
  const below = R.baseline.monthly.filter(m => m.E < lb.predict(m.P));
  assert.equal(R.target.n, below.length);
  const ref = naiveOLS(below.map(m => m.P), below.map(m => m.E));
  assert.ok(close(R.target.model.slope, ref.slope, 1e-8));
  assert.ok(close(R.target.model.intercept, ref.intercept, 1e-8));
  assert.ok(R.target.monthly.every(m => close(m.Emeta, ref.intercept + ref.slope * m.P, 1e-9)));
});

test('Línea meta: muy pocos puntos bajo la línea base → no se calcula', () => {
  const rows = synth(6, '2024-01', 100, 2, 20, 3);
  const p = makeProject(rows); p.config.minObsTarget = 6;
  const R = A.runAnalysis(p);
  assert.equal(R.target.status, 'insufficient');
  assert.match(R.target.reasons[0], /se requieren al menos 6/);
});

test('Indicadores base 100: ambas convenciones y CUSUM del periodo base ≈ 0', () => {
  const p = EA.demo.build('17');
  const R = A.runAnalysis(p);
  R.indicators.monthly.forEach(m => assert.ok(close(m.iLB, m.Eest / m.E * 100, 1e-12)));
  assert.ok(Math.abs(R.indicators.cusum[R.indicators.cusum.length - 1].cusum) < 1e-6);
  assert.ok(close(R.indicators.summary.aggregateLB, 100, 1e-9)); // en el periodo base ΣÊ = ΣE
  p.config.base100Convention = 'real_sobre_ref';
  const R2 = A.runAnalysis(p);
  R2.indicators.monthly.forEach(m => { assert.ok(close(m.iLB, m.E / m.Eest * 100, 1e-12)); assert.equal(m.favLB, m.iLB <= 100); });
});

test('Seguimiento: recupera un ahorro conocido y su intervalo', () => {
  // Base: E = 1000 + 2P (+ruido pequeño); seguimiento: 10 % menos
  const base = synth(24, '2020-01', 1000, 2, 4, 11);
  const seg = synth(12, '2022-01', 1000, 2, 4, 12).map(r => [r[0], (1000 + 2 * r[2]) * 0.9, r[2], 'seguimiento']);
  const R = A.runAnalysis(makeProject(base.concat(seg)));
  assert.equal(R.counts.baseline, 24);
  assert.equal(R.followup.status, 'ok');
  assert.ok(Math.abs(R.followup.total.pct - 10) < 0.3, 'ahorro ≈ 10 %');
  assert.ok(R.followup.total.significant);
  assert.ok(R.followup.total.ci[0] < R.followup.total.saving && R.followup.total.saving < R.followup.total.ci[1]);
  // La línea base solo usa meses base
  const ref = naiveOLS(base.map(r => r[2]), base.map(r => r[1]));
  assert.ok(close(R.baseline.model.slope, ref.slope, 1e-8));
});

test('Presupuesto: la descomposición suma la desviación total (con y sin línea base)', () => {
  const R = A.runAnalysis(EA.demo.build('36'));
  const d = R.budget.totals.decomposition;
  assert.ok(close(d.productionEffect + d.performance + d.budgetVsModel, d.total, 1e-9));
  R.budget.monthly.forEach(r => assert.ok(close(r.productionEffect + r.performance + r.budgetVsModel, r.dE, 1e-9)));
  assert.equal(R.budget.method, 'linea_base');
  // Sin línea base válida (pocos datos) → método del IC presupuestado
  const rows = synth(4, '2024-01', 100, 2, 5);
  const p = makeProject(rows, { budget: rows.map(r => [r[0], r[1] * 0.95, r[2] * 1.02]) });
  const R2 = A.runAnalysis(p);
  assert.equal(R2.budget.method, 'ic_presupuesto');
  R2.budget.monthly.forEach(r => assert.ok(close(r.productionEffect + r.performance, r.dE, 1e-9)));
});

test('Presupuesto: sin división por cero, opcional y con desviación ajustada', () => {
  const rows = synth(12, '2024-01', 1000, 2, 5);
  const p = makeProject(rows, { budget: [[rows[0][0], 0, 0], [rows[1][0], 3000, ''], [rows[2][0], '', 1200]] });
  const R = A.runAnalysis(p);
  const [a, b, c] = R.budget.monthly;
  assert.equal(a.dEpct, null); assert.equal(a.dPpct, null); assert.equal(a.ICp, null);
  assert.ok(b.dE != null && b.dP == null && b.ICp == null);
  assert.ok(c.dE == null && c.dP != null);
  // Sin presupuesto, el análisis no se bloquea
  const R0 = A.runAnalysis(makeProject(rows));
  assert.equal(R0.budget.status, 'none'); assert.equal(R0.baseline.status, 'ok');
});

test('Presupuesto: más consumo que el presupuesto por mayor producción NO se clasifica como desfavorable', () => {
  const rows = []; for (let i = 0; i < 12; i++) { const P = 1000 + 50 * i; rows.push([D.addMonths('2023-01', i), 500 + 0.5 * P + (i % 2 ? 3 : -3), P]); }
  // Último mes: producción 20 % sobre lo presupuestado, consumo exactamente el esperado por la línea base
  const last = rows[11]; const Pp = last[2] / 1.2;
  const p = makeProject(rows, { budget: [[last[0], 500 + 0.5 * Pp, Pp]] });
  const R = A.runAnalysis(p);
  const m = R.budget.monthly[0];
  assert.ok(m.dE > 0, 'consumo bruto sobre presupuesto');
  assert.equal(m.classRaw, 'desfavorable');
  assert.equal(m.classAdj, 'en_linea');
  assert.match(m.explanation, /mayor nivel de producción|en línea/);
});

test('Meta corporativa: IC objetivo y reducción frente a la línea base', () => {
  const p36 = EA.demo.build('36'); p36.config.corporateTarget = { type: 'reduccion', value: 3 };
  const R = A.runAnalysis(p36);
  assert.equal(R.corporateTarget.status, 'ok');
  assert.equal(R.corporateTarget.scope, 'seguimiento');
  assert.equal(R.corporateTarget.summary.achieved, R.followup.total.pct >= 3);
  const p = EA.demo.build('17'); p.config.corporateTarget = { type: 'ic', value: '0,055' };
  const R2 = A.runAnalysis(p);
  assert.equal(R2.corporateTarget.status, 'ok');
  assert.equal(R2.corporateTarget.summary.achieved, R2.descriptive.IC.weighted <= 0.055);
});

test('Oportunidades: separa estimaciones, mediciones y presupuesto', () => {
  const R = A.runAnalysis(EA.demo.build('36'));
  const keys = R.opportunities.items.map(i => i.key);
  assert.deepEqual(keys, ['evitable_lb', 'potencial_meta', 'ahorro_medido', 'desv_presupuesto']);
  const kinds = R.opportunities.items.map(i => i.kind);
  assert.ok(kinds.includes('estimación') && kinds.includes('medición frente a modelo') && kinds.includes('comparación presupuestal'));
  const ev = R.opportunities.items[0];
  assert.ok(close(ev.energy, R.baseline.monthly.filter(m => m.resid > 0).reduce((s, m) => s + m.resid, 0), 1e-9));
  assert.equal(R.opportunities.items[0].money, null); // sin precio configurado no se valora en dinero
  assert.ok(close(ev.co2, ev.energy * R.footprint.kE, 1e-12));
});

test('Huella: factores por defecto del Excel, conversión de unidades y fórmulas', () => {
  const p = EA.demo.build('24');
  assert.equal(p.config.emissionFactor, 0.4341667);
  assert.equal(p.config.footprintFactor, 0.000383);
  const R = A.runAnalysis(p);
  const f = R.footprint, m = f.monthly[0];
  assert.equal(f.status, 'ok');
  assert.ok(close(m.tco2, m.E * 0.4341667, 1e-12));          // t CO₂ = kWh × t CO₂/kWh
  assert.ok(close(m.ha, m.E * 0.4341667 * 0.000383, 1e-12)); // ha = t CO₂ × ha/t CO₂
  assert.ok(close(f.total.tco2, R.descriptive.E.sum * 0.4341667, 1e-12));
  // Consumo en MWh con factor por kWh → se convierte (×1000)
  const q = makeProject(synth(12, '2023-01', 100, 0.3, 2), { config: { energyUnit: 'MWh' } });
  const Rq = A.runAnalysis(q);
  assert.ok(close(Rq.footprint.monthly[0].tco2, Rq.footprint.monthly[0].E * 1000 * 0.4341667, 1e-12));
  // Factor en kg CO₂/kWh
  q.config.emissionFactorMass = 'kg'; q.config.emissionFactor = 126;
  assert.ok(close(A.runAnalysis(q).footprint.monthly[0].tco2, Rq.footprint.monthly[0].E * 1000 * 0.126, 1e-12));
  // Gas en m³ con factor por kWh → no convertible, se informa
  const g = makeProject(synth(12, '2023-01', 100, 0.3, 2), { config: { energyType: 'gas_natural', energyUnit: 'm³ gas' } });
  const Rg = A.runAnalysis(g);
  assert.equal(Rg.footprint.status, 'units');
  // Huella evitada en seguimiento = ahorro × factor
  const R36 = A.runAnalysis(EA.demo.build('36'));
  assert.ok(close(R36.footprint.avoided.tco2, R36.followup.total.saving * 0.4341667, 1e-12));
});

test('Tabla única: presupuesto en las mismas filas que los datos reales', () => {
  const rows = synth(12, '2023-01', 1000, 2, 5);
  const p = makeProject(rows);
  p.real.forEach((r, i) => { if (i % 2 === 0) { r.Eb = r.E * 0.98; r.Pb = r.P; } });
  p.real.push(Object.assign(D.newRealRow('2024-01'), { Eb: 3000, Pb: 1000 })); // mes solo con presupuesto
  const ap = D.toAnalysisProject(p);
  assert.equal(ap.real.length, 12);   // la fila solo-presupuesto no cuenta como dato real incompleto
  assert.equal(ap.budget.length, 7);
  const R = A.runAnalysis(p);
  assert.equal(R.counts.monthsEntered, 12);
  assert.equal(R.budget.status, 'ok');
  assert.equal(R.budget.n, 6);
  assert.ok(!R.validation.issues.some(i => i.code === 'INCOMPLETE'));
  // Fusión desde el formato anterior (presupuesto separado)
  const merged = D.mergeBudgetIntoRows([D.newRealRow('2023-01')], [Object.assign(D.newBudgetRow('2023-01'), { E: 5, P: 6 }), Object.assign(D.newBudgetRow('2023-02'), { E: 7, P: 8 })]);
  assert.equal(merged.length, 2); assert.equal(merged[0].Eb, 5); assert.equal(merged[1].Pb, 8);
});

test('Mes faltante: se informa y no se imputa', () => {
  const R = A.runAnalysis(EA.demo.build('36'));
  assert.deepEqual(R.period.coverage.missing, ['2022-08']);
  assert.equal(R.counts.used, 35);
  assert.ok(R.indicators.cusum.some(c => c.afterGap));
});

// Pruebas de interpretación de meses/números y de validación de datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EA, makeProject } = require('./helpers');
const D = EA.dataset, U = EA.units;

test('Meses en múltiples formatos', () => {
  const cases = { '2024-01': '2024-01', '2024/1': '2024-01', '01/2024': '2024-01', '1-2024': '2024-01', '15/03/2024': '2024-03', 'ene-2024': '2024-01', 'Enero 2024': '2024-01', 'enero de 2024': '2024-01', 'Sep. 23': '2023-09', 'sept 2023': '2023-09', 'Dec 2023': '2023-12', '202312': '2023-12', '2023-12-31': '2023-12' };
  for (const [k, v] of Object.entries(cases)) assert.equal(D.parseMonth(k), v, k);
  assert.equal(D.parseMonth(45292), '2024-01'); // número de serie de Excel (2024-01-01)
  assert.equal(D.parseMonth('2024-13'), null);
  assert.equal(D.parseMonth('hola'), null);
  assert.equal(D.parseMonth(''), null);
});

test('Números con convenciones colombiana e inglesa', () => {
  const v = (s, d) => D.parseNumber(s, d).value;
  assert.equal(v('1.234.567,89', ','), 1234567.89);
  assert.equal(v('1,234,567.89', ','), 1234567.89);
  assert.equal(v('484455', ','), 484455);
  assert.equal(v('0,0361', ','), 0.0361);
  assert.equal(v('0.0361', ','), 0.0361);   // un solo punto que no agrupa miles → decimal
  assert.equal(v('1.234', ','), 1234);      // agrupación de miles con decimal coma
  assert.equal(v('1.234', '.'), 1.234);     // ambigüedad resuelta por la configuración
  assert.equal(v('1,5', ','), 1.5);
  assert.equal(v('-12,5', ','), -12.5);
  assert.equal(v('(12,5)', ','), -12.5);
  assert.ok(D.parseNumber('', ',').empty);
  assert.ok(D.parseNumber('N/A', ',').empty);
  assert.ok(D.parseNumber('12a', ',').error);
  assert.ok(D.parseNumber('1.2.3,4.5', ',').error);
});

test('Unidades: conversiones válidas e incompatibilidades', () => {
  assert.equal(U.convert(1, 'MWh', 'kWh'), 1000);
  assert.ok(Math.abs(U.convert(1, 'GJ', 'kWh') - 277.7777778) < 1e-6);
  assert.equal(U.convert(2, 't', 'kg'), 2000);
  assert.equal(U.convert(1, 'hL', 'L'), 100);
  assert.equal(U.factor('m³ gas', 'kWh'), null); // sin poder calorífico no se convierte
  assert.equal(U.factor('L', 'kg'), null);
  assert.equal(U.normalizeUnit('Toneladas'), 't');
  assert.equal(U.normalizeUnit('kwh'), 'kWh');
});

test('Validación: no reemplaza ausentes por cero y distingue introducidos vs usados', () => {
  const p = makeProject([['2024-01', 100, 10], ['2024-02', '', 12], ['2024-04', 130, 13]]);
  const v = D.validateProject(p);
  assert.equal(v.counts.realEntered, 3);
  assert.equal(v.counts.realUsed, 2);
  assert.equal(v.counts.realIncomplete, 1);
  assert.deepEqual(v.real.coverage.missing, ['2024-03']);
  assert.ok(v.issues.some(i => i.code === 'INCOMPLETE'));
  assert.ok(v.issues.some(i => i.code === 'MISSING_MONTHS'));
  assert.ok(!v.real.usable.some(r => r.E === 0));
});

test('Validación: duplicados bloquean; negativos y consumo cero con producción son errores', () => {
  const p = makeProject([['2024-01', 100, 10], ['2024-01', 110, 11], ['2024-02', -5, 10], ['2024-03', 0, 10], ['2024-04', 50, 0]]);
  const v = D.validateProject(p);
  assert.ok(v.blocking.some(b => b.code === 'DUPLICATE'));
  assert.ok(v.issues.some(i => i.code === 'NEGATIVE'));
  assert.ok(v.issues.some(i => i.code === 'E_ZERO_WITH_P'));
  assert.ok(v.issues.some(i => i.code === 'P_ZERO'));
  const R = EA.analysis.runAnalysis(p);
  assert.equal(R.ok, false); // no se analiza con meses duplicados
});

test('Validación: unidades por fila se convierten; incompatibles se rechazan', () => {
  const p = makeProject([['2024-01', 1, 10], ['2024-02', 100, 10]]);
  p.real[0].eUnit = 'MWh';
  let v = D.validateProject(p);
  assert.equal(v.real.usable[0].E, 1000);
  assert.ok(v.issues.some(i => i.code === 'UNIT_CONVERTED'));
  p.real[0].eUnit = 'm3 gas';
  v = D.validateProject(p);
  assert.ok(v.issues.some(i => i.code === 'UNIT_INCOMPATIBLE'));
  assert.equal(v.counts.realUsed, 1);
});

test('Validación: unidades del presupuesto incompatibles desactivan solo la comparación presupuestal', () => {
  const rows = []; for (let i = 0; i < 12; i++) rows.push([D.addMonths('2023-01', i), 100 + 2 * (10 + i) + (i % 3), 10 + i]);
  const p = makeProject(rows, { budget: [['2023-01', 120, 10]] });
  p.config.budgetProductionUnit = 'kg'; // producción real en L
  const v = D.validateProject(p);
  assert.equal(v.budgetUnitsOk, false);
  const R = EA.analysis.runAnalysis(p);
  assert.equal(R.ok, true);
  assert.equal(R.budget.status, 'units');
  assert.equal(R.baseline.status, 'ok');
});

test('Exclusión manual: se informa y no se usa en los cálculos', () => {
  const rows = []; for (let i = 0; i < 10; i++) rows.push([D.addMonths('2023-01', i), 100 + 2 * (10 + i) + (i % 3), 10 + i]);
  const p = makeProject(rows); p.real[3].include = false; p.real[3].note = 'Parada por mantenimiento';
  const R = EA.analysis.runAnalysis(p);
  assert.equal(R.counts.used, 9); assert.equal(R.counts.excludedByUser, 1); assert.equal(R.counts.baseline, 9);
  assert.ok(R.validation.issues.some(i => i.code === 'EXCLUDED_BY_USER' && /mantenimiento/.test(i.message)));
});

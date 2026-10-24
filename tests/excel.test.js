// Comparación automática con el Excel de referencia del estudio original.
// Se activa al completar tests/referencia_excel.json (ver instrucciones en ese archivo).
const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('./referencia_excel.json');
const { EA, makeProject } = require('./helpers');

const hasData = Array.isArray(ref.observaciones) && ref.observaciones.length > 0;

test('Comparación con el Excel de referencia', { skip: hasData ? false : 'Pendiente: complete tests/referencia_excel.json con los datos y resultados del Excel' }, () => {
  const p = makeProject(ref.observaciones, { config: { energyUnit: ref.unidad_energia || 'kWh', productionUnit: ref.unidad_produccion || 'L' } });
  const R = EA.analysis.runAnalysis(p);
  assert.equal(R.ok, true);
  const tol = ref.tolerancia_relativa || 1e-6;
  const rx = ref.resultados_excel || {};
  const checks = [
    ['pendiente_linea_base', R.baseline.model && R.baseline.model.slope],
    ['intercepto_linea_base', R.baseline.model && R.baseline.model.intercept],
    ['r2_linea_base', R.baseline.model && R.baseline.model.r2],
    ['error_tipico_linea_base', R.baseline.model && R.baseline.model.s],
    ['n_puntos_linea_meta', R.target.n],
    ['pendiente_linea_meta', R.target.model && R.target.model.slope],
    ['intercepto_linea_meta', R.target.model && R.target.model.intercept],
    ['r2_linea_meta', R.target.model && R.target.model.r2],
    ['ic_promedio', R.descriptive.IC.simpleMean]
  ];
  const diffs = [];
  for (const [k, app] of checks) {
    if (rx[k] == null) continue;
    const rel = Math.abs(app - rx[k]) / Math.max(1e-12, Math.abs(rx[k]));
    diffs.push(`${k}: Excel=${rx[k]} App=${app} dif.rel=${rel.toExponential(2)}`);
    assert.ok(rel <= tol, `Diferencia en ${k}: Excel=${rx[k]}, aplicación=${app}`);
  }
  console.log('Comparación con Excel:\n  ' + diffs.join('\n  '));
});

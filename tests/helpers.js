// Carga todos los módulos de la aplicación en Node (comparten el espacio global EA como en el navegador).
const path = require('path');
const src = p => require(path.join(__dirname, '..', 'src', p));
['core/stats.js', 'core/units.js', 'core/format.js', 'core/dataset.js', 'core/analysis.js', 'core/benchmark.js', 'io/csv.js', 'io/xlsx.js', 'io/importer.js',
  'ui/charts.js', 'ui/views.js', 'ui/benchmark-views.js', 'io/report.js', 'io/exporter.js', 'data/demo.js'].forEach(src);
const EA = globalThis.EA;

/** Crea un proyecto a partir de filas [mes, E, P] (y opcionalmente periodo). */
function makeProject(rows, opts) {
  const D = EA.dataset; const p = D.newProject();
  p.company.name = 'Prueba';
  Object.assign(p.config, opts && opts.config || {});
  p.real = rows.map(r => Object.assign(D.newRealRow(r[0]), { E: r[1], P: r[2], period: r[3] || 'base' }));
  if (opts && opts.budget) p.budget = opts.budget.map(b => Object.assign(D.newBudgetRow(b[0]), { E: b[1], P: b[2] }));
  return p;
}
/** Serie mensual sintética determinista: E = a + b·P + ruido pseudoaleatorio acotado. */
function synth(n, start, a, b, noise, seed) {
  let s = seed || 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = EA.dataset.addMonths(start || '2020-01', i);
    const P = Math.round(1000 + 400 * Math.sin(i / 2) + 300 * rnd());
    rows.push([m, Math.round((a + b * P + noise * rnd()) * 100) / 100, P]);
  }
  return rows;
}
const close = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(b));

module.exports = { EA, makeProject, synth, close };

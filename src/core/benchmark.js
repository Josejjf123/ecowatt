/*
 * benchmark.js — Comparación entre empresas: tablero (% de la meta consumido y zona) y rankings.
 *
 * Periodo evaluado de cada empresa:
 *   - Si tiene meses de seguimiento: esos meses (ahorro DEMOSTRADO con mediciones frente a la línea base).
 *   - Si no: los últimos 12 meses disponibles (o todos si hay menos). El resultado es INDICATIVO porque esos
 *     meses también se usaron para ajustar la línea base.
 *
 * % de la meta consumido = ΣE_real / ΣE_meta(P_real) × 100   (línea meta evaluada con la producción real).
 * Zonas: verde ≤ 100 % (cumple la meta) · amarilla entre la meta y la línea base · roja por encima de la línea base.
 * Ahorro % = (ΣÊ_línea base(P_real) − ΣE_real) / ΣÊ × 100.
 * Los porcentajes no tienen unidades, por lo que son comparables entre empresas con productos y unidades distintas.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const A = EA.analysis || req('./analysis.js');
  const D = EA.dataset || req('./dataset.js');
  const U = EA.units || req('./units.js');

  const BUDGET_YELLOW_PCT = 105; // con el presupuesto como referencia: amarilla hasta +5 %

  function sum(a, f) { let s = 0; for (const x of a) s += f(x); return s; }
  function zoneOf(pct, yellowLimit) {
    if (pct == null || !isFinite(pct)) return null;
    if (pct <= 100) return 'verde';
    if (pct <= Math.max(100, yellowLimit)) return 'amarilla';
    return 'roja';
  }

  function evaluateCompany(project) {
    const c = project.company || {};
    const R = A.runAnalysis(project);
    const row = { id: project.id, name: c.name || 'Empresa sin nombre', sector: c.sector || '', site: c.site || '', R, status: 'ok', reasons: [] };
    if (!R.ok) { row.status = 'bloqueada'; row.reasons.push('Datos con errores bloqueantes (p. ej. meses duplicados).'); return row; }
    row.units = R.units; row.counts = R.counts; row.period = R.period;
    if (!R.counts.used) { row.status = 'sin_datos'; row.reasons.push('Sin consumos registrados.'); return row; }
    if (R.baseline.status !== 'ok') {
      row.status = 'sin_linea_base'; row.reasons.push(R.baseline.reasons[0] || 'Sin línea base.');
      const dm = R.descriptive.monthly, ev = R.counts.followup ? dm.filter(m => m.period === 'seguimiento') : dm.slice(-12);
      row.evalPeriod = { start: ev[0].month, end: ev[ev.length - 1].month, months: ev.length };
      addFootprint(row, R, new Set(ev.map(m => m.month)));
      return row;
    }
    const lb = R.baseline.model, tm = R.target.status === 'ok' ? R.target.model : null;
    const mon = R.baseline.monthly;
    const measured = R.counts.followup > 0;
    const evalRows = measured ? mon.filter(m => m.period === 'seguimiento') : mon.slice(-12);
    row.evidence = measured ? 'medido' : 'indicativo';
    row.evalPeriod = { start: evalRows[0].month, end: evalRows[evalRows.length - 1].month, months: evalRows.length };
    const sE = sum(evalRows, m => m.E), sLB = sum(evalRows, m => m.Eest);
    row.E = sE; row.Eexp = sLB;
    row.savings = sLB - sE; row.savingsPct = sLB > 0 ? (sLB - sE) / sLB * 100 : null;
    const toKWh = U.factor(D.energyUnit(project.config), 'kWh');
    row.savingsKWh = toKWh != null ? row.savings * toKWh : null;
    if (measured && R.followup.status === 'ok') { row.significant = R.followup.total.significant; row.ci = R.followup.total.ci; }
    row.r2 = lb.r2; row.modelValid = R.baseline.valid && R.baseline.assessment.r2Ok;
    if (tm) {
      const sM = sum(evalRows, m => tm.predict(m.P));
      row.Emeta = sM;
      row.pctMeta = sM > 0 ? sE / sM * 100 : null;
      row.pctLBRef = sM > 0 ? sLB / sM * 100 : null; // límite superior de la zona amarilla
      row.zone = zoneOf(row.pctMeta, row.pctLBRef);
    } else row.reasons.push('Sin línea meta: no se calcula el % de la meta consumido.');
    // Presupuesto (si existe) en el mismo periodo
    if (R.budget.status === 'ok') {
      const evalSet = new Set(evalRows.map(m => m.month));
      const b = R.budget.monthly.filter(r => evalSet.has(r.month) && r.Ep != null);
      const sEp = sum(b, r => r.Ep), sEr = sum(b, r => r.E);
      if (b.length && sEp > 0) { row.pctBudget = sEr / sEp * 100; row.budgetMonths = b.length; row.budgetZone = zoneOf(row.pctBudget, BUDGET_YELLOW_PCT); }
    }
    // Indicador base 100 mensual (para la gráfica comparativa)
    row.ieb = R.indicators.monthly.map(m => ({ month: m.month, v: m.iLB }));
    addFootprint(row, R, new Set(evalRows.map(m => m.month)));
    if (row.tco2 != null) { row.tco2Avoided = row.savings * R.footprint.kE; row.haAvoided = row.fh != null ? row.tco2Avoided * row.fh : null; }
    return row;
  }
  /** Huella de carbono y ecológica del periodo evaluado. */
  function addFootprint(row, R, monthSet) {
    const fp = R.footprint;
    if (fp.status !== 'ok') return;
    const fr = fp.monthly.filter(m => monthSet.has(m.month));
    const sP = sum(fr, m => m.P);
    row.tco2 = sum(fr, m => m.tco2); row.ha = fp.fh != null ? row.tco2 * fp.fh : null;
    row.tco2PerP = sP > 0 ? row.tco2 / sP : null; row.haPerP = fp.fh != null && sP > 0 ? row.tco2 * fp.fh / sP : null;
    row.fe = fp.fe; row.feLabel = fp.feLabel; row.feTPerKWh = fp.feTPerKWh; row.fh = fp.fh;
  }

  /** Evalúa todas las empresas y construye los rankings. */
  function compare(projects) {
    const rows = (projects || []).map(evaluateCompany);
    const evaluable = rows.filter(r => r.status === 'ok');
    // Ranking por ahorro demostrado: 1) medido, 2) indicativo; dentro de cada grupo, mayor ahorro % primero
    const tier = r => r.evidence === 'medido' ? 0 : 1;
    const savingsRanking = evaluable.slice().sort((a, b) => tier(a) - tier(b) || (b.savingsPct - a.savingsPct));
    savingsRanking.forEach((r, i) => { r.rankSavings = i + 1; });
    // Ranking por factor de emisión: menor factor (t CO₂/kWh) primero; empate → menores emisiones del periodo
    const withFe = rows.filter(r => r.fe != null);
    const feRanking = withFe.slice().sort((a, b) => {
      const fa = a.feTPerKWh != null ? a.feTPerKWh : Infinity, fb = b.feTPerKWh != null ? b.feTPerKWh : Infinity;
      return fa - fb || ((a.tco2 || 0) - (b.tco2 || 0));
    });
    feRanking.forEach((r, i) => { r.rankFe = i + 1; });
    return { rows, evaluable, savingsRanking, feRanking, notRanked: rows.filter(r => r.status !== 'ok') };
  }

  const api = { compare, evaluateCompany, zoneOf, BUDGET_YELLOW_PCT };
  EA.benchmark = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

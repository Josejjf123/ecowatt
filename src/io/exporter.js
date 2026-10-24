/*
 * exporter.js — Exportación de datos y resultados a CSV, Excel (.xlsx con fórmulas de verificación) y JSON.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = EA.dataset || req('../core/dataset.js');
  const U = EA.units || req('../core/units.js');
  const F = EA.format || req('../core/format.js');
  const CSV = EA.csv || req('./csv.js');
  const X = EA.xlsx || req('./xlsx.js');
  const V = EA.views || req('../ui/views.js');

  const csvNum = (v) => v == null || !isFinite(v) ? '' : String(Number(v.toPrecision(12))).replace('.', ',');

  /** Datos de entrada combinados por mes (formato reimportable por la aplicación). */
  function dataCSV(project) {
    project = D.toAnalysisProject(project);
    const cfg = project.config;
    const eu = U.unitLabel(D.energyUnit(cfg)), pu = U.unitLabel(D.productionUnit(cfg));
    const beu = U.unitLabel(D.budgetEnergyUnit(cfg)), bpu = U.unitLabel(D.budgetProductionUnit(cfg));
    const months = new Map();
    const key = r => D.parseMonth(r.month) || String(r.month || '');
    (project.real || []).forEach(r => { const k = key(r); const o = months.get(k) || {}; o.real = r; months.set(k, o); });
    (project.budget || []).forEach(r => { const k = key(r); const o = months.get(k) || {}; o.bud = r; months.set(k, o); });
    const ks = Array.from(months.keys()).sort();
    const cell = v => typeof v === 'number' ? csvNum(v) : (v == null ? '' : String(v));
    const rows = [[`Mes`, `Consumo real (${eu})`, `Producción real (${pu})`, 'Tipo de periodo', 'Incluir', 'Observaciones', `Consumo presupuestado (${beu})`, `Producción presupuestada (${bpu})`]];
    ks.forEach(k => { const o = months.get(k); const r = o.real || {}, b = o.bud || {}; rows.push([k, cell(r.E), cell(r.P), o.real ? (r.period === 'seguimiento' ? 'seguimiento' : 'base') : '', o.real ? (r.include === false ? 'no' : 'sí') : '', r.note || '', cell(b.E), cell(b.P)]); });
    return CSV.stringify(rows, ';');
  }

  function monthlyResults(R) {
    const lbm = new Map((R.baseline.monthly || []).map(x => [x.month, x]));
    const lmm = new Map((R.target.monthly || []).map(x => [x.month, x]));
    const inm = new Map((R.indicators.monthly || []).map(x => [x.month, x]));
    const cum = new Map((R.indicators.cusum || []).map(x => [x.month, x]));
    const bum = new Map(((R.budget && R.budget.monthly) || []).map(x => [x.month, x]));
    const fpm = new Map(((R.footprint && R.footprint.monthly) || []).map(x => [x.month, x]));
    return R.descriptive.monthly.map(m => {
      const b = lbm.get(m.month) || {}, t = lmm.get(m.month) || {}, i = inm.get(m.month) || {}, c = cum.get(m.month) || {}, p = bum.get(m.month) || {}, h = fpm.get(m.month) || {};
      return { month: m.month, period: m.period, E: m.E, P: m.P, IC: m.IC, tco2: h.tco2, ha: h.ha, Eest: b.Eest, resid: b.resid, residPct: b.residPct, stdResid: b.stdResid, piLow: b.piLow, piHigh: b.piHigh, Emeta: t.Emeta, iLB: i.iLB, iMeta: i.iMeta, cusum: c.cusum, Ep: p.Ep, Pp: p.Pp, dE: p.dE, dEpct: p.dEpct, dP: p.dP, dPpct: p.dPpct, ICp: p.ICp, Eflex: p.Eflex, dFlex: p.dFlex, dFlexPct: p.dFlexPct, classAdj: p.classAdj, explanation: p.explanation };
    });
  }
  const RES_COLS = (u, conv) => [
    ['month', 'Mes'], ['period', 'Periodo'], ['E', `Consumo real (${u.energy})`], ['P', `Producción real (${u.production})`], ['IC', `IC (${u.ic})`],
    ['tco2', 'Huella de carbono (t CO2)'], ['ha', 'Huella ecológica (ha)'],
    ['Eest', `Consumo estimado línea base (${u.energy})`], ['resid', 'Residuo (E − Ê)'], ['residPct', 'Residuo %'], ['stdResid', 'Residuo estandarizado'],
    ['piLow', 'Intervalo predicción 95 % inferior'], ['piHigh', 'Intervalo predicción 95 % superior'], ['Emeta', `Consumo línea meta (${u.energy})`],
    ['iLB', conv === 'ref_sobre_real' ? 'IEB100 vs línea base' : 'IDEn100 vs línea base'], ['iMeta', conv === 'ref_sobre_real' ? 'IEB100 vs línea meta' : 'IDEn100 vs línea meta'], ['cusum', 'CUSUM'],
    ['Ep', `Consumo presupuestado (${u.energy})`], ['Pp', `Producción presupuestada (${u.production})`], ['dE', 'ΔE real − presupuesto'], ['dEpct', 'ΔE %'], ['dP', 'ΔP real − presupuesto'], ['dPpct', 'ΔP %'],
    ['ICp', 'IC presupuestado'], ['Eflex', 'Presupuesto ajustado a producción real'], ['dFlex', 'Desviación ajustada'], ['dFlexPct', 'Desviación ajustada %'], ['classAdj', 'Clasificación (ajustada)'], ['explanation', 'Explicación']
  ];

  function resultsCSV(R) {
    const cols = RES_COLS(R.units, R.indicators.convention);
    const rows = [cols.map(c => c[1])];
    monthlyResults(R).forEach(m => rows.push(cols.map(([k]) => typeof m[k] === 'number' ? csvNum(m[k]) : (m[k] == null ? '' : String(m[k])))));
    return CSV.stringify(rows, ';');
  }

  /** Libro Excel con datos, resultados y hojas de verificación con fórmulas. */
  function workbook(project, R) {
    const c = project.company || {}, u = R.units;
    const sheets = [];
    const H = t => ({ v: t, s: 'header' });
    const nv = (v, s) => v == null || !isFinite(v) ? null : { v, s: s || 'dec2' };
    // Resumen
    const sum = [[{ v: 'Informe de desempeño energético', s: 'title' }], ['Empresa', c.name || ''], ['NIT', c.nit || ''], ['Sede', c.site || ''],
      ['Periodo', R.period ? `${R.period.start} a ${R.period.end}` : ''], ['Unidad de consumo', u.energy], ['Unidad de producción', u.production], ['Generado', new Date().toISOString()], [],
      [H('Indicador'), H('Valor'), H('Nota')]];
    const b = R.baseline;
    sum.push(['Meses introducidos', R.counts.monthsEntered], ['Observaciones usadas', R.counts.used], ['Observaciones en línea base', R.counts.baseline], ['Puntos en línea meta', R.counts.target]);
    sum.push(['IC ponderado (ΣE/ΣP)', nv(R.descriptive.IC.weighted, 'dec6'), u.ic]);
    if (b.status === 'ok') {
      sum.push(['Ecuación línea base', b.equation], ['Pendiente m', nv(b.model.slope, 'dec6')], ['Intercepto E0', nv(b.model.intercept)], ['R²', nv(b.model.r2, 'dec6')], ['p-value pendiente', nv(b.model.pSlope, 'dec6')], ['Error típico s', nv(b.model.s)]);
    } else sum.push(['Línea base', 'No calculada', b.reasons.join(' ')]);
    if (R.target.status === 'ok') sum.push(['Ecuación línea meta', R.target.equation], ['R² línea meta (descriptivo)', nv(R.target.model.r2, 'dec6')]);
    (R.opportunities.items || []).forEach(i => sum.push([i.title, nv(i.energy, 'int'), i.kind]));
    sum.push([], [{ v: 'Datos ficticios de demostración si la empresa se identifica como "Demo". Este archivo no constituye una certificación.', s: 'note' }]);
    sheets.push({ name: 'Resumen', rows: sum, colWidths: [42, 40, 40] });

    // Datos de entrada (en unidades del proyecto)
    const dRows = [[H('Mes'), H(`Consumo real (${u.energy})`), H(`Producción real (${u.production})`), H('Periodo'), H('Incluido'), H('Estado'), H('Observación')]];
    R.validation.real.parsed.filter(r => r.status !== 'empty').forEach(r => dRows.push([r.month || String(r.raw.month || ''), nv(r.E, 'int'), nv(r.P, 'int'), r.raw.period === 'seguimiento' ? 'seguimiento' : 'base', r.raw.include === false ? 'no' : 'sí', r.status + (r.reasons.length ? ': ' + r.reasons.join('; ') : ''), r.raw.note || '']));
    sheets.push({ name: 'Datos reales', rows: dRows, colWidths: [10, 20, 22, 12, 9, 30, 30], freezeRow: 1 });
    if (R.validation.budget) {
      const bRows = [[H('Mes'), H(`Consumo presupuestado (${u.energy})`), H(`Producción presupuestada (${u.production})`), H('Estado')]];
      R.validation.budget.parsed.filter(r => r.status !== 'empty').forEach(r => bRows.push([r.month || String(r.raw.month || ''), nv(r.E, 'int'), nv(r.P, 'int'), r.status]));
      sheets.push({ name: 'Presupuesto', rows: bRows, colWidths: [10, 26, 28, 14], freezeRow: 1 });
    }

    // Verificación de la línea base con fórmulas nativas de Excel
    if (b.status === 'ok') {
      const base = b.monthly.filter(x => x.period === 'base');
      const n = base.length, last = n + 1;
      const rngP = `B2:B${last}`, rngE = `C2:C${last}`;
      const m = b.model;
      const conv = R.indicators.convention;
      const rows = [[H('Mes'), H(`P (${u.production})`), H(`E (${u.energy})`), H('Ê = m·P + E0'), H('Residuo E − Ê'), H('Bajo línea base (1/0)'), H(conv === 'ref_sobre_real' ? 'IEB100 = Ê/E·100' : 'IDEn100 = E/Ê·100'), null, null, H('Parámetro'), H('Fórmula Excel'), H('Valor de la aplicación'), H('Diferencia')]];
      base.forEach((x, i) => {
        const r = i + 2;
        rows.push([x.month, { v: x.P, s: 'int' }, { v: x.E, s: 'int' }, { f: `$K$2*B${r}+$K$3`, v: x.Eest, s: 'dec2' }, { f: `C${r}-D${r}`, v: x.resid, s: 'dec2' }, { f: `IF(C${r}<D${r},1,0)`, v: x.E < x.Eest ? 1 : 0 }, { f: conv === 'ref_sobre_real' ? `D${r}/C${r}*100` : `C${r}/D${r}*100`, v: conv === 'ref_sobre_real' ? x.Eest / x.E * 100 : x.E / x.Eest * 100, s: 'dec2' }]);
      });
      const params = [
        ['Pendiente m', `SLOPE(${rngE},${rngP})`, m.slope, 'dec6'], ['Intercepto E0', `INTERCEPT(${rngE},${rngP})`, m.intercept, 'dec2'], ['R²', `RSQ(${rngE},${rngP})`, m.r2, 'dec6'],
        ['Error típico s', `STEYX(${rngE},${rngP})`, m.s, 'dec2'], ['n', `COUNT(${rngP})`, m.n, 'int'], ['EE de la pendiente', `K5/SQRT(DEVSQ(${rngP}))`, m.seSlope, 'dec6'],
        ['t de la pendiente', 'K2/K7', m.tSlope, 'dec2'], ['p-value pendiente (bilateral)', 'TDIST(ABS(K8),K6-2,2)', m.pSlope, 'dec6'],
        ['EE del intercepto', `K5*SQRT(1/K6+AVERAGE(${rngP})^2/DEVSQ(${rngP}))`, m.seIntercept, 'dec2'], ['p-value intercepto', 'TDIST(ABS(K3/K10),K6-2,2)', m.pIntercept, 'dec6'],
        ['CV(RMSE) %', `K5/AVERAGE(${rngE})*100`, m.cvrmse, 'dec2'], ['Suma de residuos (≈ 0)', `SUM(E2:E${last})`, 0, 'dec2'], ['t crítico (α)', `TINV(${R.settings.alpha},K6-2)`, m.tCrit, 'dec6']
      ];
      params.forEach((p, i) => {
        const r = i + 2; rows[r - 1] = rows[r - 1] || [];
        while (rows[r - 1].length < 9) rows[r - 1].push(null);
        rows[r - 1][9] = p[0]; rows[r - 1][10] = { f: p[1], v: p[2], s: p[3] }; rows[r - 1][11] = { v: p[2], s: p[3] }; rows[r - 1][12] = { f: `K${r}-L${r}`, v: 0, s: 'dec6' };
      });
      rows.push([], [{ v: 'Las columnas D–G y la columna K contienen fórmulas de Excel que se recalculan al abrir el archivo. La columna M compara con los valores calculados por la aplicación (debe ser ≈ 0).', s: 'note' }]);
      sheets.push({ name: 'Verificación línea base', rows, colWidths: [10, 14, 14, 14, 14, 12, 14, 3, 3, 30, 22, 18, 12], freezeRow: 1 });
    }
    if (R.target.status === 'ok') {
      const pts = R.target.selection.filter(s => s.selected); const last = pts.length + 1; const m = R.target.model;
      const rows = [[H('Mes'), H(`P (${u.production})`), H(`E (${u.energy})`), null, H('Parámetro'), H('Fórmula Excel'), H('Valor de la aplicación'), H('Diferencia')]];
      pts.forEach(p => rows.push([p.month, { v: p.P, s: 'int' }, { v: p.E, s: 'int' }]));
      [['Pendiente m′', `SLOPE(C2:C${last},B2:B${last})`, m.slope, 'dec6'], ['Intercepto E0′', `INTERCEPT(C2:C${last},B2:B${last})`, m.intercept, 'dec2'], ['R² (descriptivo)', `RSQ(C2:C${last},B2:B${last})`, m.r2, 'dec6'], ['n', `COUNT(B2:B${last})`, m.n, 'int']].forEach((p, i) => {
        const r = i + 2; rows[r - 1] = rows[r - 1] || []; while (rows[r - 1].length < 4) rows[r - 1].push(null);
        rows[r - 1][4] = p[0]; rows[r - 1][5] = { f: p[1], v: p[2], s: p[3] }; rows[r - 1][6] = { v: p[2], s: p[3] }; rows[r - 1][7] = { f: `F${r}-G${r}`, v: 0, s: 'dec6' };
      });
      rows.push([], [{ v: 'Puntos seleccionados: meses del periodo base con consumo real menor que el estimado por la línea base (ver columna F de la hoja de verificación de la línea base).', s: 'note' }]);
      sheets.push({ name: 'Verificación línea meta', rows, colWidths: [10, 14, 14, 3, 22, 22, 18, 12], freezeRow: 1 });
    }
    // Resultados mensuales
    const cols = RES_COLS(u, R.indicators.convention);
    const rr = [cols.map(c => H(c[1]))];
    monthlyResults(R).forEach(m => rr.push(cols.map(([k]) => typeof m[k] === 'number' ? { v: m[k], s: Math.abs(m[k]) >= 100 ? 'dec2' : 'dec6' } : (m[k] == null ? null : String(m[k])))));
    sheets.push({ name: 'Resultados mensuales', rows: rr, colWidths: cols.map((c, i) => i === cols.length - 1 ? 80 : 16), freezeRow: 1 });
    // Advertencias
    const wr = [[H('Nivel'), H('Área'), H('Mensaje')]];
    R.validation.issues.forEach(i => wr.push([i.level, 'Datos', i.message]));
    (R.quality || []).forEach(q => wr.push([q.level, q.area, q.message]));
    V.LIMITATIONS.forEach(l => wr.push(['limitación', 'General', l]));
    sheets.push({ name: 'Advertencias', rows: wr, colWidths: [12, 18, 120] });
    return X.write(sheets);
  }

  function projectJSON(project) { return JSON.stringify(Object.assign({}, project, { exportedAt: new Date().toISOString() }), null, 2); }

  const api = { dataCSV, resultsCSV, workbook, projectJSON, monthlyResults };
  EA.exporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

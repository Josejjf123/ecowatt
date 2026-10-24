/*
 * views.js — Generación de HTML de resultados (compartido por la interfaz y el informe técnico).
 * Cada función recibe el resultado de EA.analysis.runAnalysis() y devuelve una cadena HTML.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const F = EA.format || req('../core/format.js');
  const D = EA.dataset || req('../core/dataset.js');
  const C = EA.charts || req('./charts.js');
  const esc = F.escapeHtml;

  const COL = { real: 'var(--s1)', base: 'var(--s2)', meta: 'var(--s3)', budget: 'var(--neutral)', pos: 'var(--neg-bar)', neg: 'var(--pos-bar)' };
  const shortM = m => { const [y, mm] = m.split('-'); return D.MONTH_ABBR[Number(mm) - 1] + ' ' + y.slice(2); };
  const fm = m => D.formatMonth(m);
  const E0 = v => F.num(v, 0);
  // w puede ser un número o { half, full }: ancho para gráficos en cuadrícula de dos columnas o a ancho completo
  const HW = w => (w && typeof w === 'object') ? w.half : w;
  const FW = w => (w && typeof w === 'object') ? w.full : w;

  // ---------- Piezas ----------
  function table(headers, rows, opts) {
    opts = opts || {};
    return `<div class="table-wrap"><table class="data${opts.compact ? ' compact' : ''}">${opts.caption ? `<caption>${esc(opts.caption)}</caption>` : ''}<thead><tr>${headers.map(h => `<th${typeof h === 'object' && h.num ? ' class="num"' : ''}>${typeof h === 'object' ? h.html || esc(h.t) : esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.cells || r).map(c => c && typeof c === 'object' ? `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.html != null ? c.html : esc(c.t)}</td>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const n_ = (t, cls) => ({ t, num: true, cls });
  const h_ = (html, cls) => ({ html, cls });
  function kpi(label, value, sub, tone) { return `<div class="kpi${tone ? ' kpi-' + tone : ''}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`; }
  function callout(level, html, title) {
    const icon = { error: '⛔', warning: '⚠️', info: 'ℹ️', ok: '✅' }[level] || 'ℹ️';
    return `<div class="callout callout-${level}" role="note"><span class="callout-icon" aria-hidden="true">${icon}</span><div>${title ? `<strong>${esc(title)}</strong> ` : ''}${html}</div></div>`;
  }
  function badge(kind, text) { return `<span class="badge badge-${kind}">${esc(text)}</span>`; }
  function classBadge(c) {
    if (!c) return '—';
    return c === 'favorable' ? badge('good', '▼ Favorable') : c === 'desfavorable' ? badge('bad', '▲ Desfavorable') : badge('neutral', '≈ En línea');
  }
  function check(ok, text) { return `<li class="check ${ok ? 'ok' : 'no'}"><span aria-hidden="true">${ok ? '✔' : '✖'}</span> ${text}</li>`; }
  function section(title, body, id) { return `<section class="result-section"${id ? ` id="${id}"` : ''}><h3>${esc(title)}</h3>${body}</section>`; }
  function reasons(list, level) { return (list || []).map(r => callout(level || 'warning', esc(r))).join(''); }

  // ---------- Resumen ----------
  function summary(R, P, w) {
    if (!R.ok) return callout('error', 'El análisis no puede ejecutarse: ' + R.blocking.map(b => esc(b.message)).join(' '));
    const u = R.units, d = R.descriptive, b = R.baseline;
    const cards = [];
    cards.push(kpi('Periodo analizado', `${esc(fm(R.period.start))} – ${esc(fm(R.period.end))}`, `${R.counts.used} meses usados de ${R.counts.monthsEntered} introducidos${R.period.coverage && R.period.coverage.missing.length ? ` · ${R.period.coverage.missing.length} mes(es) faltante(s)` : ''}`));
    cards.push(kpi('Consumo total', `${E0(d.E.sum)} <small>${esc(u.energy)}</small>`, `Promedio mensual ${E0(d.E.mean)} ${esc(u.energy)}`));
    cards.push(kpi('Producción total', `${E0(d.P.sum)} <small>${esc(u.production)}</small>`, `Promedio mensual ${E0(d.P.mean)} ${esc(u.production)}`));
    cards.push(kpi('Índice de consumo (ponderado)', `${F.auto(d.IC.weighted)} <small>${esc(u.ic)}</small>`, 'ΣE / ΣP del periodo'));
    if (b.status === 'ok') cards.push(kpi('Línea base: R²', F.num(b.model.r2, 3), `p (pendiente) ${F.pEq(b.model.pSlope)} · n = ${b.n}`, b.assessment.r2Ok && b.assessment.slopeSignificant ? 'good' : 'warn'));
    else cards.push(kpi('Línea base', 'No calculada', esc(b.reasons[0] || ''), 'warn'));
    const pot = R.opportunities.items.find(i => i.key === 'potencial_meta');
    if (pot) cards.push(kpi('Mejora potencial (línea meta)', F.pct(pot.pctOfTotal), `≈ ${E0(pot.energy)} ${esc(u.energy)} en el periodo base · estimación`));
    if (R.followup.status === 'ok') cards.push(kpi('Ahorro medido (seguimiento)', `${E0(R.followup.total.saving)} <small>${esc(u.energy)}</small>`, `${F.pct(R.followup.total.pct)} · IC95 % ${E0(R.followup.total.ci[0])} a ${E0(R.followup.total.ci[1])}`, R.followup.total.significant && R.followup.total.saving > 0 ? 'good' : 'warn'));
    if (R.budget.status === 'ok' && R.budget.totals.dFlex != null) cards.push(kpi('Desviación vs presupuesto', F.signedPct(R.budget.totals.dEpct), `Ajustada por producción: ${F.signedPct(R.budget.totals.dFlexPct)}`, R.budget.totals.dFlex > 0 ? 'warn' : 'good'));

    const findings = [];
    if (b.status === 'ok') {
      findings.push(`Línea base: <b>${esc(b.equation)}</b>. Cada ${esc(u.production)} adicional se asocia con ${F.auto(b.model.slope)} ${esc(u.energy)}.`);
      if (b.nonProduction.interpretable) findings.push(`Consumo no asociado a la producción (intercepto): ≈ ${E0(b.nonProduction.E0)} ${esc(u.energy)}/mes (${F.pct(b.nonProduction.sharePct, 0)} del consumo medio del periodo base).`);
      findings.push(b.assessment.r2Ok && b.assessment.slopeSignificant ? `El modelo es estadísticamente adecuado como referencia (R² ≥ ${F.num(R.settings.r2Threshold, 2)} y pendiente significativa).` : `El modelo tiene limitaciones (ver pestaña Línea base y Calidad).`);
    }
    if (R.target.status === 'ok') findings.push(`Línea meta (${R.target.n} meses bajo la línea base): <b>${esc(R.target.equation)}</b>.`);
    if (R.indicators.available) findings.push(`${R.indicators.summary.favorableLB} de ${R.indicators.summary.monthsLB} meses tuvieron consumo igual o inferior a la línea base.`);
    if (R.budget.status === 'ok') findings.push(`Presupuesto: ${R.budget.counts.unfavorableAdj} mes(es) con desviación desfavorable y ${R.budget.counts.favorableAdj} favorable(s) tras ajustar por producción (tolerancia ±${F.num(R.settings.tolerancePct, 1)} %).`);

    const countsRows = [
      ['Meses introducidos (filas con datos)', R.counts.monthsEntered, ''],
      ['Observaciones válidas', R.counts.validObservations, R.counts.incomplete + R.counts.invalid ? `${R.counts.incomplete} incompleta(s) y ${R.counts.invalid} inválida(s) no se usan` : 'Todas las filas son válidas'],
      ['Excluidas manualmente', R.counts.excludedByUser, R.counts.excludedByUser ? 'Ver motivos en Calidad de datos' : ''],
      ['Estadística descriptiva', R.counts.descriptive, 'Todas las observaciones usadas'],
      ['Índice de consumo', R.counts.ic, R.descriptive.IC.zeroProduction ? 'Se omiten meses con producción 0' : 'Meses con producción > 0'],
      ['Línea base (regresión)', R.counts.baseline, 'Solo meses del periodo base'],
      ['Línea meta', R.counts.target, 'Meses del periodo base bajo la línea base'],
      ['Seguimiento (ahorro medido)', R.counts.followupUsed, 'Meses marcados como seguimiento'],
      ['Comparación presupuestal', R.counts.budget, 'Meses con dato real y presupuesto']
    ];
    return `<div class="kpi-grid">${cards.join('')}</div>
      ${section('Diagnóstico', `<ul class="findings">${findings.map(f => `<li>${f}</li>`).join('')}</ul>`)}
      ${section('Recomendaciones (hipótesis a verificar)', `<ul class="recs">${R.recommendations.map(r => `<li>${badge(r.priority === 'alta' ? 'bad' : r.priority === 'media' ? 'warn' : 'neutral', r.priority)} ${esc(r.text)}</li>`).join('')}</ul>`)}
      ${section('Observaciones usadas en cada cálculo', table(['Cálculo', { t: 'Observaciones', num: true }, 'Nota'], countsRows.map(r => [r[0], n_(String(r[1])), r[2]]), { compact: true }))}`;
  }

  // ---------- Descriptiva ----------
  function descriptive(R, P, w) {
    const d = R.descriptive, u = R.units;
    const m = d.monthly;
    const statRow = (name, s, unit, dec) => [name, n_(String(s.n)), n_(dec ? F.auto(s.mean) : E0(s.mean)), n_(dec ? F.auto(s.sd) : E0(s.sd)), n_(F.pct(s.cv)), n_((dec ? F.auto(s.min) : E0(s.min)) + ''), n_((dec ? F.auto(s.max) : E0(s.max)) + ''), n_(dec ? F.auto(s.median) : E0(s.median)), unit];
    const icObs = m.filter(x => x.IC != null);
    const stats = table(['Variable', { t: 'n', num: true }, { t: 'Media', num: true }, { t: 'Desv. estándar (n−1)', num: true }, { t: 'CV', num: true }, { t: 'Mínimo', num: true }, { t: 'Máximo', num: true }, { t: 'Mediana', num: true }, 'Unidad'], [
      statRow('Consumo energético (E)', d.E, u.energy), statRow('Producción (P)', d.P, u.production), statRow('Índice de consumo (IC = E/P)', d.IC, u.ic, true)
    ]);
    const ext = `<p class="muted">Consumo mínimo en ${fm(m[d.E.iMin].month)}, máximo en ${fm(m[d.E.iMax].month)}. Producción mínima en ${fm(m[d.P.iMin].month)}, máxima en ${fm(m[d.P.iMax].month)}.${icObs.length ? ` IC mínimo en ${fm(icObs[d.IC.iMin].month)}, máximo en ${fm(icObs[d.IC.iMax].month)}.` : ''}</p>`;
    const icNote = callout('info', `<b>IC ponderado = ΣE / ΣP = ${F.auto(d.IC.weighted)} ${esc(u.ic)}</b> es el índice representativo del periodo. El promedio simple de los IC mensuales (${F.auto(d.IC.simpleMean)} ${esc(u.ic)}) da el mismo peso a meses de baja y alta producción y por eso puede diferir.${d.corrEP != null ? ` Correlación lineal entre P y E: r = ${F.num(d.corrEP, 3)}.` : ''}`);
    const cats = m.map(x => shortM(x.month)), tips = m.map(x => fm(x.month));
    const chE = C.categoryChart({ title: 'Consumo energético mensual', subtitle: u.energy, categories: cats, tipTitle: tips, unit: u.energy, fmt: E0, width: HW(w), series: [{ name: 'Consumo real', color: COL.real, values: m.map(x => x.E), kind: 'bar' }], yLabel: u.energy });
    const chP = C.categoryChart({ title: 'Producción mensual', subtitle: u.production, categories: cats, tipTitle: tips, unit: u.production, fmt: E0, width: HW(w), series: [{ name: 'Producción real', color: COL.real, values: m.map(x => x.P), kind: 'bar' }], yLabel: u.production });
    const chIC = C.categoryChart({ title: 'Índice de consumo mensual', subtitle: u.ic, categories: cats, tipTitle: tips, unit: u.ic, width: HW(w), series: [{ name: 'IC real', color: COL.real, values: m.map(x => x.IC) }], refLines: [{ y: d.IC.weighted, label: 'IC ponderado ' + F.auto(d.IC.weighted) }], yLabel: u.ic });
    let chICP = '';
    if (R.baseline.status === 'ok') {
      const lb = R.baseline.model;
      chICP = C.scatterChart({ uid: 'icp', title: 'Índice de consumo frente a producción', subtitle: 'Curva teórica de la línea base: IC = m + E0/P', width: HW(w), xLabel: 'Producción (' + u.production + ')', yLabel: u.ic,
        points: m.filter(x => x.IC != null).map(x => ({ x: x.P, y: x.IC, hollow: x.period === 'seguimiento', tip: `${fm(x.month)}\nP: ${E0(x.P)} ${u.production}\nIC: ${F.auto(x.IC)} ${u.ic}` })),
        lines: [{ name: 'IC teórico (línea base)', color: COL.base, fn: p => lb.slope + lb.intercept / p, curve: true }],
        legendPoints: [{ name: 'IC mensual', color: COL.real, type: 'dot' }].concat(R.counts.followup ? [{ name: 'Seguimiento', color: COL.real, type: 'dot', hollow: true }] : []) });
    }
    const rows = m.map(x => [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', n_(E0(x.E)), n_(E0(x.P)), n_(F.auto(x.IC)), n_(F.signedPct(x.dE)), n_(F.signedPct(x.dP)), n_(F.signedPct(x.dIC)), n_(F.signedPct(x.icVsMean), x.icVsMean != null && Math.abs(x.icVsMean) > R.settings.icChangePct ? 'flag' : '')]);
    const notable = d.notable.length ? `<ul class="compact-list">${d.notable.map(n => `<li><b>${fm(n.month)}</b>: ${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">No hay variaciones del IC superiores al umbral configurado.</p>';
    let byPeriod = '';
    if (R.descriptiveByPeriod) {
      const b = R.descriptiveByPeriod.base, s = R.descriptiveByPeriod.seguimiento;
      byPeriod = section('Comparación base vs seguimiento (descriptiva)', table(['Periodo', { t: 'Meses', num: true }, { t: 'Consumo medio', num: true }, { t: 'Producción media', num: true }, { t: 'IC ponderado', num: true }], [
        ['Base', n_(String(b.n)), n_(E0(b.E.mean)), n_(E0(b.P.mean)), n_(F.auto(b.IC.weighted))], ['Seguimiento', n_(String(s.n)), n_(E0(s.E.mean)), n_(E0(s.P.mean)), n_(F.auto(s.IC.weighted))]
      ], { compact: true }) + '<p class="muted">Comparación descriptiva: no ajusta por diferencias de producción. Para el ahorro use la pestaña Seguimiento.</p>');
    }
    return section('Estadística descriptiva', stats + ext + icNote) +
      `<div class="chart-grid">${chE}${chP}</div><div class="chart-grid">${chIC}${chICP}</div>` +
      byPeriod +
      section(`Variaciones relevantes del índice de consumo (umbral ±${F.num(R.settings.icChangePct, 0)} %)`, notable) +
      section('Tabla mensual', table(['Mes', 'Periodo', { t: `E (${u.energy})`, num: true }, { t: `P (${u.production})`, num: true }, { t: `IC (${u.ic})`, num: true }, { t: 'ΔE vs mes anterior', num: true }, { t: 'ΔP vs mes anterior', num: true }, { t: 'ΔIC vs mes anterior', num: true }, { t: 'IC vs ponderado', num: true }], rows, { compact: true }));
  }

  // ---------- Línea base ----------
  function baseline(R, P, w) {
    const b = R.baseline, u = R.units;
    if (b.status !== 'ok') return section('Línea base energética', reasons(b.reasons, 'error'));
    const m = b.model, a = b.assessment;
    const eq = `<div class="equation"><div class="eq-main">${esc(b.equation)}</div><div class="eq-sub">Pendiente m = ${F.auto(m.slope)} ${esc(u.ic)} (consumo marginal por unidad producida) · Intercepto E0 = ${E0(m.intercept)} ${esc(u.energy)}/mes · n = ${m.n} meses del periodo base</div></div>`;
    const checks = `<ul class="checks">${check(a.slopePositive, 'Pendiente positiva (el consumo aumenta con la producción)')}${check(a.slopeSignificant, `Pendiente significativa (p ${F.pEq(m.pSlope)} &lt; α = ${F.num(R.settings.alpha, 2)})`)}${check(a.r2Ok, `R² = ${F.num(m.r2, 3)} ≥ umbral de referencia ${F.num(R.settings.r2Threshold, 2)}`)}${check(a.annualCycle, `Al menos 12 meses en el periodo base (${m.n})`)}${check(m.cvrmse <= 15, `CV(RMSE) = ${F.pct(m.cvrmse)} ≤ 15 % (referencia ASHRAE G14, mensual)`)}${check(!b.diagnostics.outliers.length, `Sin residuos estandarizados |r| &gt; 2 (${b.diagnostics.outliers.length} mes(es))`)}</ul>`;
    const stats = table(['Estadístico', { t: 'Valor', num: true }, 'Interpretación'], [
      ['Pendiente m', n_(F.auto(m.slope)), `${u.ic}. IC95 %: ${F.auto(m.ciSlope[0])} a ${F.auto(m.ciSlope[1])}`],
      ['Error estándar de m', n_(F.auto(m.seSlope)), `t = ${F.num(m.tSlope, 2)}, gl = ${m.df}`],
      ['p-value de m (bilateral)', n_(F.pval(m.pSlope)), 'Evidencia de relación lineal entre P y E'],
      ['Intercepto E0', n_(E0(m.intercept)), `${u.energy}/mes. IC95 %: ${E0(m.ciIntercept[0])} a ${E0(m.ciIntercept[1])}`],
      ['Error estándar de E0', n_(E0(m.seIntercept)), `t = ${F.num(m.tIntercept, 2)}, p ${F.pEq(m.pIntercept)}`],
      ['R² (coeficiente de determinación)', n_(F.num(m.r2, 4)), 'Fracción de la variación de E explicada por P'],
      ['R² ajustado', n_(F.num(m.r2adj, 4)), 'Penaliza por el número de parámetros'],
      ['Coeficiente de correlación r', n_(F.num(m.r, 4)), ''],
      ['Error típico de la estimación s', n_(E0(m.s)), `${u.energy}. √(SSE / (n − 2)), equivale a ERROR.TIPICO.XY`],
      ['CV(RMSE)', n_(F.pct(m.cvrmse)), 's / Ē × 100'],
      ['Error absoluto medio porcentual (MAPE)', n_(F.pct(m.mape)), 'Promedio de |residuo / E|'],
      ['Estadístico F', n_(F.num(m.F, 2)), `p(F) ${F.pEq(m.pF)}; en regresión simple F = t²`],
      ['Durbin-Watson', n_(F.num(b.durbinWatson, 2)), `≈ 2 sin autocorrelación; < 1 o > 3 sugiere dependencia temporal${b.dwHasGaps ? ' (hay meses faltantes: valor aproximado)' : ''}`],
      ['Rango de producción del modelo', n_(`${E0(m.xMin)} – ${E0(m.xMax)}`), `${u.production}. Fuera de este rango el modelo extrapola`]
    ], { compact: true });
    const npe = b.nonProduction;
    const npeHtml = callout(npe.interpretable ? 'info' : 'warning', `<b>Consumo no asociado a la producción (E0): ${E0(npe.E0)} ${esc(u.energy)}/mes${npe.sharePct != null ? ` (${F.pct(npe.sharePct, 1)} del consumo medio)` : ''}.</b> ${esc(npe.note)}`);
    const sigNote = callout('info', 'Significancia ≠ calidad predictiva: un p-value &lt; 0,05 indica que es poco probable que la relación observada sea casual, pero no garantiza que el modelo prediga bien cada mes ni fuera del rango de producción observado. Para eso se revisan R², s, CV(RMSE) y los residuos.');
    const mon = b.monthly, base = mon.filter(x => x.period === 'base');
    const sc = C.scatterChart({ uid: 'lb', title: 'Consumo real frente a producción', subtitle: 'Línea base y banda de predicción del 95 %', width: HW(w), xLabel: 'Producción (' + u.production + ')', yLabel: 'Consumo (' + u.energy + ')',
      points: mon.map(x => ({ x: x.P, y: x.E, hollow: x.period === 'seguimiento', tip: `${fm(x.month)}${x.period === 'seguimiento' ? ' (seguimiento)' : ''}\nP: ${E0(x.P)} ${u.production}\nE real: ${E0(x.E)} ${u.energy}\nÊ: ${E0(x.Eest)} ${u.energy}\nResiduo: ${F.signed(x.resid, 0)} ${u.energy}` })),
      lines: [{ name: 'Línea base', color: COL.base, fn: m.predict }],
      band: { low: x => m.predictionInterval(x)[0], high: x => m.predictionInterval(x)[1], x0: m.xMin, x1: m.xMax, color: COL.base, name: 'Intervalo de predicción 95 %' },
      legendPoints: [{ name: 'Meses del periodo base', color: COL.real, type: 'dot' }].concat(R.counts.followup ? [{ name: 'Meses de seguimiento', color: COL.real, type: 'dot', hollow: true }] : []) });
    const cats = mon.map(x => shortM(x.month)), tips = mon.map(x => fm(x.month) + (x.period === 'seguimiento' ? ' (seguimiento)' : ''));
    const ts = C.categoryChart({ title: 'Consumo real frente a consumo estimado', subtitle: u.energy, categories: cats, tipTitle: tips, unit: u.energy, fmt: E0, width: HW(w), yLabel: u.energy,
      series: [{ name: 'Consumo real', color: COL.real, values: mon.map(x => x.E) }, { name: 'Estimado línea base (Ê)', color: COL.base, values: mon.map(x => x.Eest), dash: true }] });
    const rs = C.categoryChart({ title: 'Residuos mensuales (E real − Ê)', subtitle: 'Barras hacia arriba: consumo mayor que el esperado', categories: cats, tipTitle: tips, unit: u.energy, fmt: v => F.signed(v, 0), width: FW(w), height: 260, yLabel: u.energy, includeZero: true,
      series: [{ name: 'Residuo', kind: 'bar', color: v => v > 0 ? COL.pos : COL.neg, values: mon.map(x => x.resid) }],
      legendExtra: [{ name: 'Mayor que lo esperado', color: COL.pos, type: 'bar' }, { name: 'Menor que lo esperado', color: COL.neg, type: 'bar' }] });
    const rows = mon.map(x => ({ cls: x.outsidePI ? 'row-flag' : '', cells: [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', n_(E0(x.P)), n_(E0(x.E)), n_(E0(x.Eest)), n_(F.signed(x.resid, 0)), n_(F.signedPct(x.residPct)), n_(x.stdResid != null ? F.num(x.stdResid, 2) : '—', x.stdResid != null && Math.abs(x.stdResid) > 2 ? 'flag' : ''), n_(`${E0(x.piLow)} – ${E0(x.piHigh)}`), h_(x.outsidePI === 'encima' ? badge('bad', 'Encima') : x.outsidePI === 'debajo' ? badge('good', 'Debajo') : '—'), h_(x.inRange ? '' : badge('warn', 'Extrapolado'))] }));
    return section('Ecuación de la línea base', eq + checks + sigNote) +
      `<div class="chart-grid">${sc}${ts}</div>` + rs +
      section('Estadísticos de la regresión', stats + npeHtml) +
      section('Consumo estimado y residuos por mes', table(['Mes', 'Periodo', { t: `P (${u.production})`, num: true }, { t: `E real (${u.energy})`, num: true }, { t: `Ê (${u.energy})`, num: true }, { t: 'Residuo', num: true }, { t: 'Residuo %', num: true }, { t: 'Residuo estandarizado', num: true }, { t: 'Intervalo de predicción 95 %', num: true }, 'Fuera del intervalo', 'Rango'], rows, { compact: true }) +
        `<p class="muted">Residuo estandarizado (internamente studentizado): rᵢ = eᵢ / (s·√(1 − hᵢᵢ)). Solo se calcula para meses del periodo base. Ninguna observación se elimina automáticamente.</p>`);
  }

  // ---------- Línea meta ----------
  function target(R, P, w) {
    const t = R.target, u = R.units, b = R.baseline;
    if (t.status !== 'ok') {
      let sel = '';
      if (t.selection) sel = table(['Mes', { t: 'E real', num: true }, { t: 'Ê línea base', num: true }, 'Seleccionado'], t.selection.map(s => [fm(s.month), n_(E0(s.E)), n_(E0(s.Eest)), s.selected ? 'Sí' : 'No']), { compact: true });
      return section('Línea meta energética', reasons(t.reasons, 'warning') + sel);
    }
    const m = t.model, lb = b.model;
    const eq = `<div class="equation eq-meta"><div class="eq-main">${esc(t.equation)}</div><div class="eq-sub">Ajustada con ${t.n} de ${b.n} meses del periodo base · R² = ${F.num(m.r2, 4)} (descriptivo) · s = ${E0(m.s)} ${esc(u.energy)}</div></div>`;
    const expl = callout('info', `<b>Criterio de selección:</b> ${esc(t.criterion)}. Se ajusta una nueva regresión con esos meses. La línea meta representa el desempeño que la planta <i>ya logró</i> en sus mejores meses; es una referencia de desempeño observado o potencial, <b>no una garantía de ahorro</b>. Como los puntos se eligieron según su consumo, el R² de esta recta es descriptivo y no se reportan p-values.`);
    const mon = b.monthly;
    const selSet = new Set(t.selection.filter(s => s.selected).map(s => s.month));
    const sc = C.scatterChart({ uid: 'lm', title: 'Línea base y línea meta', subtitle: 'Consumo frente a producción', width: HW(w), xLabel: 'Producción (' + u.production + ')', yLabel: 'Consumo (' + u.energy + ')',
      points: mon.map(x => ({ x: x.P, y: x.E, color: selSet.has(x.month) ? COL.meta : COL.real, hollow: x.period === 'seguimiento', tip: `${fm(x.month)}${selSet.has(x.month) ? ' (usado en la línea meta)' : ''}\nE real: ${E0(x.E)}\nÊ base: ${E0(x.Eest)}\nE meta: ${E0(m.predict(x.P))}` })),
      lines: [{ name: 'Línea base', color: COL.base, fn: lb.predict }, { name: 'Línea meta', color: COL.meta, fn: m.predict, dash: true }],
      legendPoints: [{ name: 'Meses bajo la línea base (seleccionados)', color: COL.meta, type: 'dot' }, { name: 'Otros meses', color: COL.real, type: 'dot' }] });
    const tm = t.monthly;
    const cats = tm.map(x => shortM(x.month)), tips = tm.map(x => fm(x.month));
    const ts = C.categoryChart({ title: 'Consumo real, línea base y línea meta', subtitle: u.energy, categories: cats, tipTitle: tips, unit: u.energy, fmt: E0, width: HW(w), yLabel: u.energy,
      series: [{ name: 'Consumo real', color: COL.real, values: tm.map(x => x.E) }, { name: 'Línea base', color: COL.base, values: mon.map(x => x.Eest), dash: true, marker: false }, { name: 'Línea meta', color: COL.meta, values: tm.map(x => x.Emeta), dash: true, marker: false }] });
    const comp = table(['', { t: 'Línea base', num: true }, { t: 'Línea meta', num: true }, { t: 'Diferencia', num: true }], [
      ['Pendiente m', n_(F.auto(lb.slope)), n_(F.auto(m.slope)), n_(F.signed(m.slope - lb.slope))],
      ['Intercepto E0', n_(E0(lb.intercept)), n_(E0(m.intercept)), n_(F.signed(m.intercept - lb.intercept, 0))],
      [`Consumo a P media (${E0(lb.xMean)} ${u.production})`, n_(E0(lb.predict(lb.xMean))), n_(E0(m.predict(lb.xMean))), n_(F.signed(m.predict(lb.xMean) - lb.predict(lb.xMean), 0))],
      ['Observaciones', n_(String(lb.n)), n_(String(m.n)), '']
    ], { compact: true });
    const rows = tm.map(x => [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', h_(selSet.has(x.month) ? badge('good', 'Sí') : '—'), n_(E0(x.P)), n_(E0(x.E)), n_(E0(x.Emeta)), n_(F.signed(x.diff, 0)), n_(F.signedPct(x.diffPct))]);
    return section('Ecuación de la línea meta', eq + expl + (t.belowBaselineInRange ? '' : callout('warning', 'La línea meta cruza la línea base dentro del rango de producción observado.'))) +
      `<div class="chart-grid">${sc}${ts}</div>` + section('Comparación de modelos', comp) +
      section('Consumo según la línea meta por mes', table(['Mes', 'Periodo', 'Usado en el ajuste', { t: `P (${u.production})`, num: true }, { t: `E real (${u.energy})`, num: true }, { t: `E meta (${u.energy})`, num: true }, { t: 'E real − E meta', num: true }, { t: '%', num: true }], rows, { compact: true }));
  }

  // ---------- Indicadores base 100 y CUSUM ----------
  function indicators(R, P, w) {
    const ind = R.indicators, u = R.units;
    if (!ind.available) return section('Indicadores base 100', callout('warning', 'Los indicadores requieren una línea base calculada.'));
    const mon = ind.monthly, cats = mon.map(x => shortM(x.month)), tips = mon.map(x => fm(x.month) + (x.period === 'seguimiento' ? ' (seguimiento)' : ''));
    const isRef = ind.convention === 'ref_sobre_real';
    const name = isRef ? 'IEB100' : 'IDEn100';
    const expl = `<div class="formula-box"><div><code>${esc(ind.formulaLB)}</code></div><div><code>${esc(ind.formulaMeta)}</code></div><p>${esc(ind.favorableText)}</p><p class="muted">Numerador y denominador usan el consumo del mismo mes; la referencia (línea base o línea meta) se evalúa con la producción real del mes, por lo que el indicador ya está ajustado por el nivel de producción. La convención puede cambiarse en Configuración.</p></div>`;
    const ch = C.categoryChart({ title: `Indicador base 100 (${name})`, subtitle: isRef ? 'Por encima de 100 = mejor que la referencia' : 'Por debajo de 100 = mejor que la referencia', categories: cats, tipTitle: tips, fmt: v => F.num(v, 1), width: HW(w),
      series: [{ name: `${name} vs línea base`, color: COL.base, values: mon.map(x => x.iLB) }].concat(R.target.status === 'ok' ? [{ name: `${name} vs línea meta`, color: COL.meta, values: mon.map(x => x.iMeta) }] : []),
      refLines: [{ y: 100, label: '100' }] });
    const cus = ind.cusum;
    const chC = C.categoryChart({ title: 'CUSUM: suma acumulada de (E real − Ê)', subtitle: 'Pendiente descendente = ahorro sostenido; ascendente = sobreconsumo sostenido', categories: cats, tipTitle: tips, unit: u.energy, fmt: v => F.signed(v, 0), width: HW(w), includeZero: true, yLabel: u.energy,
      series: [{ name: 'CUSUM', color: COL.real, values: cus.map(x => x.cusum) }],
      extraTip: cus.map(x => 'Diferencia del mes: ' + F.signed(x.diff, 0) + ' ' + u.energy + (x.afterGap ? ' (después de un mes faltante)' : '')) });
    const s = ind.summary;
    const sum = `<div class="kpi-grid">${kpi(`${name} agregado vs línea base`, F.num(s.aggregateLB, 1), 'ΣÊ y ΣE de todo el periodo')}${s.aggregateMeta != null ? kpi(`${name} agregado vs línea meta`, F.num(s.aggregateMeta, 1), 'ΣE meta y ΣE') : ''}${kpi('Meses favorables vs línea base', `${s.favorableLB} / ${s.monthsLB}`, '')}${s.favorableMeta != null ? kpi('Meses que alcanzan la línea meta', `${s.favorableMeta} / ${s.monthsLB}`, '') : ''}</div>`;
    const cusNote = callout('info', 'En el periodo base el CUSUM termina en ≈ 0 por construcción (los residuos de mínimos cuadrados suman cero). Cambios sostenidos de pendiente indican cambios en el desempeño; en el periodo de seguimiento el valor acumulado equivale al ahorro (negativo) o sobreconsumo (positivo) frente a la línea base.');
    const rows = mon.map((x, i) => [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', n_(E0(x.E)), n_(E0(x.Eest)), n_(F.num(x.iLB, 1)), h_(x.favLB ? badge('good', 'Favorable') : badge('bad', 'Desfavorable')), n_(x.Emeta != null ? E0(x.Emeta) : '—'), n_(x.iMeta != null ? F.num(x.iMeta, 1) : '—'), h_(x.favMeta == null ? '—' : x.favMeta ? badge('good', 'Alcanza meta') : badge('neutral', 'No alcanza')), n_(F.signed(cus[i].cusum, 0))]);
    return section('Definición de los indicadores', expl) + sum + `<div class="chart-grid">${ch}${chC}</div>` + cusNote +
      section('Indicadores por mes', table(['Mes', 'Periodo', { t: 'E real', num: true }, { t: 'Ê línea base', num: true }, { t: `${name} base`, num: true }, 'vs base', { t: 'E meta', num: true }, { t: `${name} meta`, num: true }, 'vs meta', { t: 'CUSUM', num: true }], rows, { compact: true }));
  }

  // ---------- Seguimiento y meta corporativa ----------
  function followup(R, P, w) {
    const f = R.followup, u = R.units, ct = R.corporateTarget;
    let html = '';
    if (f.status !== 'ok') html += section('Ahorro medido en el periodo de seguimiento', reasons(f.reasons, 'info'));
    else {
      const t = f.total;
      html += section('Ahorro medido en el periodo de seguimiento', `<div class="kpi-grid">${kpi('Consumo esperado (línea base)', `${E0(t.expected)} <small>${esc(u.energy)}</small>`, `${f.n} meses de seguimiento`)}${kpi('Consumo medido', `${E0(t.real)} <small>${esc(u.energy)}</small>`, '')}${kpi('Ahorro calculado', `${E0(t.saving)} <small>${esc(u.energy)}</small>`, `${F.pct(t.pct)} del esperado`, t.significant && t.saving > 0 ? 'good' : 'warn')}${kpi(`Intervalo de confianza ${F.num(t.level * 100, 0)} %`, `${E0(t.ci[0])} – ${E0(t.ci[1])}`, t.significant ? 'Distinto de cero' : 'Incluye el cero: no concluyente')}</div>` +
        callout('info', `Ahorro = Σ(Ê(P_real) − E_medido) en los meses de seguimiento, con Ê de la línea base ajustada solo con el periodo base. Error estándar del total: s·√(m + m²/n + (Σ(Pᵢ − P̄))²/Sxx) = ${E0(t.se)} ${esc(u.energy)}, suponiendo residuos independientes. Es un ahorro calculado con mediciones, pero solo es "verificado" si existe un plan de medición y verificación (M&V) acordado y revisado.`) + reasons(f.reasons.filter(r => !/^No hay/.test(r)), 'warning'));
      const cats = f.monthly.map(x => shortM(x.month)), tips = f.monthly.map(x => fm(x.month));
      html += `<div class="chart-grid">${C.categoryChart({ title: 'Consumo esperado frente a medido (seguimiento)', subtitle: u.energy, categories: cats, tipTitle: tips, unit: u.energy, fmt: E0, width: HW(w), yLabel: u.energy, series: [{ name: 'Consumo medido', color: COL.real, values: f.monthly.map(x => x.E) }, { name: 'Esperado (línea base)', color: COL.base, values: f.monthly.map(x => x.Eest), dash: true }] })}${C.categoryChart({ title: 'Ahorro mensual', subtitle: 'Positivo = consumo menor que el esperado', categories: cats, tipTitle: tips, unit: u.energy, fmt: v => F.signed(v, 0), width: HW(w), includeZero: true, yLabel: u.energy, series: [{ name: 'Ahorro', kind: 'bar', color: v => v >= 0 ? COL.neg : COL.pos, values: f.monthly.map(x => x.saving) }] })}</div>`;
      html += table(['Mes', { t: 'P real', num: true }, { t: 'E esperado', num: true }, { t: 'E medido', num: true }, { t: 'Ahorro', num: true }, { t: 'Ahorro %', num: true }, 'Rango'], f.monthly.map(x => [fm(x.month), n_(E0(x.P)), n_(E0(x.Eest)), n_(E0(x.E)), n_(F.signed(x.saving, 0)), n_(F.signedPct(x.savingPct)), h_(x.inRange ? '' : badge('warn', 'Extrapolado'))]), { compact: true });
    }
    // Meta corporativa
    let cth = '';
    if (ct.status === 'none') cth = reasons(ct.reasons, 'info');
    else if (ct.status !== 'ok') cth = reasons(ct.reasons, 'warning');
    else {
      const s = ct.summary;
      cth = `<p><b>${esc(ct.text)}</b> ${ct.description ? esc(ct.description) : ''} Evaluada sobre: ${esc(ct.scope)}.</p>` + reasons(ct.reasons, 'warning') +
        `<div class="kpi-grid">${kpi('Resultado del periodo', s.achieved ? '✔ Cumple' : '✖ No cumple', ct.type === 'ic' ? `IC ponderado ${F.auto(s.IC)} vs meta ${F.auto(s.target)} ${esc(u.ic)}` : `Reducción lograda ${F.pct(s.reductionAchieved)} vs meta ${F.pct(s.target)}`, s.achieved ? 'good' : 'warn')}${kpi('Meses que cumplen', `${s.meets} / ${s.months}`, '')}${kpi(s.gapEnergy > 0 ? 'Energía por encima de la meta' : 'Margen respecto a la meta', `${E0(Math.abs(s.gapEnergy))} <small>${esc(u.energy)}</small>`, '')}</div>` +
        table(['Mes', { t: 'E real', num: true }, { t: 'E objetivo', num: true }, ct.type === 'ic' ? { t: 'IC real', num: true } : { t: 'Reducción vs línea base', num: true }, 'Cumple'], ct.monthly.map(x => [fm(x.month), n_(E0(x.E)), n_(E0(x.Etarget)), ct.type === 'ic' ? n_(F.auto(x.IC)) : n_(F.signedPct(x.reduction)), h_(x.meets ? badge('good', 'Sí') : badge('bad', 'No'))]), { compact: true });
    }
    if (ct.status !== 'none') html += section('Meta energética corporativa (definida por la empresa)', callout('info', 'La meta corporativa es una decisión de la empresa (p. ej., en su presupuesto o plan energético). Es distinta de la <b>línea meta estadística</b> (mejores meses observados) y del <b>presupuesto mensual</b>.') + cth);
    return html;
  }

  // ---------- Presupuesto ----------
  function budget(R, P, w) {
    const bg = R.budget, u = R.units;
    if (bg.status !== 'ok') return section('Seguimiento frente al presupuesto', reasons(bg.reasons, bg.status === 'none' ? 'info' : 'warning'));
    const t = bg.totals, rows = bg.monthly;
    const cards = `<div class="kpi-grid">${kpi('Consumo: real − presupuesto', `${F.signed(t.dE, 0)} <small>${esc(u.energy)}</small>`, `${F.signedPct(t.dEpct)} · desviación bruta`, t.dE > 0 ? 'warn' : 'good')}${kpi('Producción: real − presupuesto', `${F.signed(t.dP, 0)} <small>${esc(u.production)}</small>`, F.signedPct(t.dPpct))}${kpi('IC real vs presupuestado', `${F.auto(t.IC)} / ${F.auto(t.ICp)}`, `${esc(u.ic)} · ${F.signedPct(t.dICpct)}`, t.dICpct > 0 ? 'warn' : 'good')}${t.dFlex != null ? kpi('Desviación ajustada por producción', `${F.signed(t.dFlex, 0)} <small>${esc(u.energy)}</small>`, `${F.signedPct(t.dFlexPct)} vs presupuesto ajustado`, t.dFlex > 0 ? 'warn' : 'good') : ''}</div>`;
    const method = callout('info', `<b>Método de ajuste:</b> ${esc(bg.methodText)} Tolerancia para considerar una desviación "en línea": ±${F.num(R.settings.tolerancePct, 1)} %.`) + reasons(bg.reasons, 'warning');
    const warn = callout('warning', '<b>Superar el presupuesto no demuestra por sí solo ineficiencia.</b> Si la producción también superó lo previsto, el consumo esperado es mayor. Por eso se compara el consumo real con el consumo esperado para la producción real (desviación ajustada).');
    let dec = '';
    if (t.decomposition) {
      const d = t.decomposition;
      const model = bg.method === 'linea_base';
      dec = section('Descomposición de la desviación total del consumo', table(['Componente', { t: `Energía (${u.energy})`, num: true }, 'Cálculo', 'Lectura'], [
        ['Efecto producción (volumen)', n_(F.signed(d.productionEffect, 0)), model ? 'm × (P_real − Pp)' : 'ICp × (P_real − Pp)', 'Consumo adicional (o menor) explicado por producir más (o menos) de lo presupuestado'],
        ['Efecto desempeño energético', n_(F.signed(d.performance, 0)), model ? 'E_real − Ê(P_real)' : '(IC_real − ICp) × P_real', 'Diferencia entre lo consumido y lo esperado para la producción real'],
        ['Diferencia del presupuesto frente al histórico', n_(F.signed(d.budgetVsModel, 0)), model ? 'Ê(Pp) − Ep' : '0 (no aplica sin línea base)', 'Positivo: el presupuesto supuso un desempeño mejor que el de la línea base'],
        [h_('<b>Total (E_real − Ep)</b>'), n_(F.signed(d.total, 0)), 'Suma de los tres componentes', `${d.months} meses con presupuesto de consumo y producción`]
      ], { compact: true }));
    }
    const cats = rows.map(x => shortM(x.month)), tips = rows.map(x => fm(x.month));
    const chE = C.categoryChart({ title: 'Consumo real frente a presupuestado', subtitle: u.energy, categories: cats, tipTitle: tips, unit: u.energy, fmt: E0, width: HW(w), yLabel: u.energy,
      series: [{ name: 'Consumo real', kind: 'bar', color: COL.real, values: rows.map(x => x.E) }, { name: 'Consumo presupuestado', kind: 'bar', color: COL.budget, hollow: true, values: rows.map(x => x.Ep) }].concat(bg.method === 'linea_base' ? [{ name: 'Esperado para la producción real (línea base)', color: COL.base, values: rows.map(x => x.Eexp), dash: true, marker: false }] : []) });
    const chP = C.categoryChart({ title: 'Producción real frente a presupuestada', subtitle: u.production, categories: cats, tipTitle: tips, unit: u.production, fmt: E0, width: HW(w), yLabel: u.production,
      series: [{ name: 'Producción real', kind: 'bar', color: COL.real, values: rows.map(x => x.P) }, { name: 'Producción presupuestada', kind: 'bar', color: COL.budget, hollow: true, values: rows.map(x => x.Pp) }] });
    const chIC = C.categoryChart({ title: 'Índice de consumo real frente a presupuestado', subtitle: u.ic, categories: cats, tipTitle: tips, unit: u.ic, width: HW(w), yLabel: u.ic,
      series: [{ name: 'IC real', color: COL.real, values: rows.map(x => x.IC) }, { name: 'IC presupuestado', color: COL.budget, dash: true, values: rows.map(x => x.ICp) }] });
    const chD = C.categoryChart({ title: 'Desviación del consumo: bruta frente a ajustada por producción', subtitle: '% respecto al presupuesto / presupuesto ajustado', categories: cats, tipTitle: tips, fmt: v => F.signedPct(v), width: HW(w), includeZero: true, yLabel: '%',
      series: [{ name: 'Desviación bruta %', color: COL.budget, dash: true, values: rows.map(x => x.dEpct) }, { name: 'Desviación ajustada %', kind: 'bar', color: v => v > 0 ? COL.pos : COL.neg, values: rows.map(x => x.dFlexPct) }],
      refLines: [{ y: R.settings.tolerancePct, label: '+' + F.num(R.settings.tolerancePct, 1) + ' %', color: 'var(--ink-3)' }, { y: -R.settings.tolerancePct, label: '−' + F.num(R.settings.tolerancePct, 1) + ' %', color: 'var(--ink-3)' }] });
    const fav = rows.filter(x => x.classAdj === 'favorable').map(x => fm(x.month)), unf = rows.filter(x => x.classAdj === 'desfavorable').map(x => fm(x.month));
    const lists = `<div class="two-col"><div>${badge('good', '▼ Favorables (ajustado)')} <p>${fav.length ? esc(fav.join(', ')) : 'Ninguno'}</p></div><div>${badge('bad', '▲ Desfavorables (ajustado)')} <p>${unf.length ? esc(unf.join(', ')) : 'Ninguno'}</p></div></div>` +
      (bg.misleading.length ? callout('warning', `En ${esc(bg.misleading.map(fm).join(', '))} la conclusión bruta y la ajustada son opuestas: la comparación directa con el presupuesto habría llevado a una conclusión engañosa.`) : '');
    const trows = rows.map(x => [fm(x.month), n_(E0(x.E)), n_(x.Ep != null ? E0(x.Ep) : '—'), n_(F.signed(x.dE, 0)), n_(F.signedPct(x.dEpct)), n_(E0(x.P)), n_(x.Pp != null ? E0(x.Pp) : '—'), n_(F.signedPct(x.dPpct)), n_(F.auto(x.IC)), n_(F.auto(x.ICp)), n_(x.Eflex != null ? E0(x.Eflex) : '—'), n_(F.signedPct(x.dFlexPct)), h_(classBadge(x.classRaw)), h_(classBadge(x.classAdj))]);
    const expl = rows.map(x => `<details class="explain"><summary><b>${fm(x.month)}</b> ${classBadge(x.classAdj)}</summary><p>${esc(x.explanation)}</p></details>`).join('');
    return section('Resumen presupuestal', cards + method + warn) + dec +
      `<div class="chart-grid">${chE}${chP}</div><div class="chart-grid">${chIC}${chD}</div>` +
      section('Meses con desviaciones favorables y desfavorables', lists) +
      section('Tabla mensual real frente a presupuesto', table(['Mes', { t: 'E real', num: true }, { t: 'E presup.', num: true }, { t: 'ΔE', num: true }, { t: 'ΔE %', num: true }, { t: 'P real', num: true }, { t: 'P presup.', num: true }, { t: 'ΔP %', num: true }, { t: 'IC real', num: true }, { t: 'IC presup.', num: true }, { t: 'Presup. ajustado', num: true }, { t: 'Desv. ajustada %', num: true }, 'Bruta', 'Ajustada'], trows, { compact: true }) + '<p class="muted">Los porcentajes no se calculan cuando el valor presupuestado es 0 o no está disponible.</p>') +
      section('Explicación automática por mes', expl);
  }

  // ---------- Oportunidades ----------
  function opportunities(R, P, w) {
    const o = R.opportunities, u = R.units, st = R.settings;
    const kindBadge = k => k === 'estimación' ? badge('warn', 'Estimación del modelo') : k === 'medición frente a modelo' ? badge('good', 'Basado en mediciones') : badge('neutral', 'Comparación presupuestal');
    const cards = o.items.map(i => `<div class="opp-card"><div class="opp-head">${kindBadge(i.kind)}<h4>${esc(i.title)}</h4></div><div class="opp-value">${F.signed(i.energy, 0)} <small>${esc(u.energy)}</small>${i.pctOfTotal != null ? ` <span class="muted">(${F.signedPct(i.pctOfTotal)})</span>` : ''}</div>${i.money != null ? `<div class="opp-sub">≈ ${F.signed(i.money, 0)} ${esc(st.currency || '')} a ${F.auto(st.energyPrice)} ${esc(st.currency || '')}/${esc(u.energy)}</div>` : ''}${i.co2 != null ? `<div class="opp-sub">≈ ${F.signed(i.co2, 1)} t CO₂${i.ha != null ? ` · ${F.signed(i.ha, 2)} ha de huella ecológica` : ''}</div>` : ''}<p>${esc(i.text)}</p></div>`).join('') || callout('info', 'No hay suficiente información para estimar oportunidades.');
    const dist = table(['Concepto', 'Qué es', 'Qué NO es'], [
      ['Energía potencialmente evitable (línea base)', 'Exceso de consumo de los meses por encima de lo esperado según el modelo histórico', 'Un ahorro logrado ni garantizado'],
      ['Mejora potencial (línea meta)', 'Diferencia frente a operar como en los mejores meses observados', 'Una meta obligatoria ni un ahorro confirmado'],
      ['Ahorro medido (seguimiento)', 'Diferencia medida entre lo esperado por la línea base y lo consumido después de una intervención', 'Un ahorro "verificado" si no existe un plan de M&V revisado'],
      ['Desviación presupuestal', 'Diferencia contra lo que la empresa planeó consumir', 'Una medida de eficiencia (depende de la producción y de lo exigente del presupuesto)']
    ], { compact: true });
    const above = o.monthsAbove.slice(0, 12);
    const at = above.length ? table(['Mes', 'Periodo', { t: `Exceso sobre Ê (${u.energy})`, num: true }, { t: '%', num: true }, 'Fuera del intervalo 95 %'], above.map(x => [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', n_(F.signed(x.excess, 0)), n_(F.signedPct(x.excessPct)), h_(x.significant ? badge('bad', 'Sí') : '—')]), { compact: true }) : '<p class="muted">No hay meses por encima de la línea base.</p>';
    const icc = o.icChanges.length ? `<ul class="compact-list">${o.icChanges.map(n => `<li><b>${fm(n.month)}</b>: ${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">Sin cambios del IC mayores al umbral.</p>';
    return section('Oportunidades cuantificadas', `<div class="opp-grid">${cards}</div>`) +
      section('Cómo leer estas cifras', dist + callout('warning', 'Las causas de las desviaciones no se atribuyen automáticamente: los meses señalados requieren verificación en campo (registros de operación, mantenimiento, cambios de producto).')) +
      section('Meses con mayor consumo respecto a la línea base', at) +
      section(`Cambios relevantes del índice de consumo (> ±${F.num(st.icChangePct, 0)} % frente al mes anterior)`, icc);
  }

  // ---------- Calidad ----------
  function quality(R) {
    const v = R.validation, groups = { error: [], warning: [], info: [] };
    v.issues.forEach(i => (groups[i.level] || groups.info).push(i.message));
    const q = { error: [], warning: [], info: [] }; (R.quality || []).forEach(i => (q[i.level] || q.info).push(`[${i.area}] ${i.message}`));
    const cov = v.real.coverage;
    const covHtml = cov ? table(['', 'Valor'], [
      ['Primer mes', fm(cov.start)], ['Último mes', fm(cov.end)], ['Meses del intervalo', String(cov.spanMonths)],
      ['Meses faltantes (sin fila)', cov.missing.length ? cov.missing.map(fm).join(', ') : 'Ninguno'],
      ['Meses con fila pero no utilizables', cov.notUsable.length ? cov.notUsable.map(fm).join(', ') : 'Ninguno']
    ], { compact: true }) : '';
    const list = (arr, lvl) => arr.map(t => callout(lvl, esc(t))).join('');
    const excl = v.real.excludedByUser.length ? table(['Mes', 'Motivo registrado'], v.real.excludedByUser.map(r => [fm(r.month), r.note || '(sin motivo)']), { compact: true }) : '<p class="muted">Ninguna observación fue excluida manualmente.</p>';
    return section('Cobertura del periodo', covHtml + (cov && cov.missing.length ? callout('warning', `Faltan ${cov.missing.length} mes(es). No se imputan valores; los resultados se basan en los meses disponibles y las tendencias que cruzan los huecos deben leerse con cuidado.`) : '')) +
      section('Validación de datos', (list(groups.error, 'error') + list(groups.warning, 'warning') + list(groups.info, 'info')) || callout('ok', 'No se encontraron problemas en los datos.')) +
      section('Calidad estadística de los modelos', (list(q.error, 'error') + list(q.warning, 'warning') + list(q.info, 'info')) || callout('ok', 'Sin observaciones.')) +
      section('Observaciones excluidas por el usuario', excl);
  }

  // ---------- Metodología ----------
  function methodology(R) {
    const ind = R.indicators;
    const items = [
      ['Índice de consumo', 'IC_i = E_i / P_i (solo si P_i > 0). IC del periodo = ΣE / ΣP (ponderado). También se informa el promedio simple de los IC mensuales.'],
      ['Estadística descriptiva', 'Media, desviación estándar muestral s = √(Σ(x − x̄)² / (n − 1)) (DESVEST.M de Excel), coeficiente de variación CV = s / x̄ × 100, mínimo, máximo y mediana.'],
      ['Línea base', 'Regresión lineal por mínimos cuadrados ordinarios con los meses del periodo base: Ê = m·P + E0, m = Sxy / Sxx, E0 = Ē − m·P̄, Sxx = Σ(P − P̄)², Sxy = Σ(P − P̄)(E − Ē).'],
      ['Bondad de ajuste', 'R² = 1 − SSE / SST; R² ajustado = 1 − (1 − R²)(n − 1)/(n − 2); s = √(SSE / (n − 2)); CV(RMSE) = s / Ē × 100; MAPE = promedio |eᵢ / Eᵢ| × 100.'],
      ['Significancia', 'EE(m) = s / √Sxx; EE(E0) = s·√(1/n + P̄²/Sxx); t = coeficiente / EE; p-value bilateral con la distribución t de Student y n − 2 grados de libertad (DISTR.T.2C de Excel). F = SSR / (SSE/(n − 2)).'],
      ['Intervalos', 'Confianza del coeficiente: b ± t(1 − α/2; n − 2)·EE. Predicción de un mes: Ê ± t·s·√(1 + 1/n + (P − P̄)²/Sxx).'],
      ['Diagnóstico de residuos', 'Residuo eᵢ = Eᵢ − Êᵢ; apalancamiento hᵢᵢ = 1/n + (Pᵢ − P̄)²/Sxx; residuo estandarizado rᵢ = eᵢ / (s√(1 − hᵢᵢ)); distancia de Cook Dᵢ = rᵢ²/2 · hᵢᵢ/(1 − hᵢᵢ); Durbin-Watson = Σ(eₜ − eₜ₋₁)² / Σeₜ². Ninguna observación se elimina automáticamente.'],
      ['Línea meta', 'Se seleccionan los meses del periodo base con E_real < Ê (por debajo de la línea base) y se ajusta una nueva regresión E_meta = m′·P + E0′ con ellos. Requiere al menos ' + R.settings.minObsTarget + ' puntos. Su R² es descriptivo.'],
      ['Indicadores base 100', `${ind.formulaLB}; ${ind.formulaMeta}. ${ind.favorableText}`],
      ['CUSUM', 'CUSUM_t = Σ_{i ≤ t} (E_i − Ê_i), en orden cronológico.'],
      ['Ahorro medido (seguimiento)', 'Ahorro = Σ(Ê(P_i) − E_i) en meses de seguimiento; EE = s·√(m + m²/n + (Σ(P_i − P̄))²/Sxx); IC = ahorro ± t·EE.'],
      ['Presupuesto', 'ΔE = E − Ep; ΔE% = ΔE / Ep × 100 (si Ep > 0); ΔP análogo; IC_p = Ep / Pp. Con línea base válida: presupuesto ajustado = Ep + m·(P − Pp); desviación ajustada = E − presupuesto ajustado; descomposición E − Ep = m(P − Pp) + (E − Ê(P)) + (Ê(Pp) − Ep). Sin línea base válida: ajustado = IC_p·P.'],
      ['Clasificación de desviaciones', `|desviación| ≤ ${F.num(R.settings.tolerancePct, 1)} % del valor de referencia: "en línea"; menor consumo: favorable; mayor consumo: desfavorable.`],
      ['Huella de carbono y huella ecológica', 'Huella de carbono [t CO₂] = E × factor de emisión (convertido a la unidad de energía del proyecto). Huella ecológica [ha] = huella de carbono × factor de huella [ha/t CO₂]. Intensidad = huella / producción. Huella evitada = ahorro medido × factor de emisión.'],
      ['Tablero y rankings entre empresas', 'Periodo evaluado: meses de seguimiento (ahorro demostrado) o, si no existen, los últimos 12 meses (indicativo). % de la meta consumido = ΣE / ΣE_meta(P_real) × 100; zona verde ≤ 100 %, amarilla hasta el nivel de la línea base (ΣÊ / ΣE_meta × 100), roja por encima. Ahorro % = (ΣÊ − ΣE) / ΣÊ × 100. Ranking de ahorro: primero empresas con ahorro medido, luego indicativo; ranking de factor de emisión: de menor a mayor factor normalizado a t CO₂/kWh.'],
      ['Unidades', 'Todas las magnitudes se convierten a las unidades del proyecto antes de calcular (kWh, MWh, GJ… o L, hL, m³, kg, t…). No se convierten unidades de distinta naturaleza (p. ej. m³ de gas a kWh) sin un factor explícito.']
    ];
    return section('Metodología y fórmulas', `<dl class="method">${items.map(i => `<dt>${esc(i[0])}</dt><dd>${esc(i[1])}</dd>`).join('')}</dl>`);
  }

  // ---------- Huella de carbono y huella ecológica ----------
  function footprint(R, P, w) {
    const fp = R.footprint, u = R.units;
    if (fp.status !== 'ok') return section('Huella de carbono y huella ecológica', reasons(fp.reasons, fp.status === 'none' ? 'info' : 'warning'));
    const t = fp.total;
    const formula = `<div class="formula-box"><div><code>Huella de carbono [t CO₂] = Consumo [${esc(u.energy)}] × Factor de emisión [${esc(fp.feLabel)}]</code></div><div><code>Huella ecológica [ha] = Huella de carbono [t CO₂] × Factor de huella [${esc(fp.fhLabel)}]</code></div>
      <p>Factores usados: emisión <b>${F.auto(fp.fe)} ${esc(fp.feLabel)}</b>${fp.fh != null ? ` · huella <b>${F.auto(fp.fh)} ${esc(fp.fhLabel)}</b>` : ' · factor de huella no indicado'}. Se modifican en «Empresa y unidades».</p></div>`;
    const cards = `<div class="kpi-grid">${kpi('Huella de carbono del periodo', `${F.num(t.tco2, 1)} <small>t CO₂</small>`, `${t.months} meses · ${F.num(t.tco2Month, 1)} t CO₂/mes`)}${t.ha != null ? kpi('Huella ecológica del periodo', `${F.num(t.ha, 2)} <small>ha</small>`, `${F.num(t.haMonth, 3)} ha/mes`) : ''}${kpi('Intensidad de carbono', `${F.auto(t.tco2PerP)} <small>t CO₂/${esc(u.production)}</small>`, 'Huella de carbono por unidad producida')}${t.haPerP != null ? kpi('Intensidad de huella ecológica', `${F.auto(t.haPerP)} <small>ha/${esc(u.production)}</small>`, '') : ''}${fp.avoided ? kpi('Huella evitada en el seguimiento', `${F.num(fp.avoided.tco2, 1)} <small>t CO₂</small>`, `${fp.avoided.ha != null ? F.num(fp.avoided.ha, 2) + ' ha · ' : ''}según el ahorro medido`, fp.avoided.tco2 > 0 ? 'good' : 'warn') : ''}</div>`;
    let periods = '';
    if (fp.base && fp.seguimiento) {
      const b = fp.base, s = fp.seguimiento, ch = b.tco2PerP ? (s.tco2PerP - b.tco2PerP) / b.tco2PerP * 100 : null;
      periods = section('Base frente a seguimiento', table(['Periodo', { t: 'Meses', num: true }, { t: `Consumo (${u.energy})`, num: true }, { t: 't CO₂', num: true }, { t: 't CO₂/mes', num: true }, { t: 'ha', num: true }, { t: `t CO₂/${u.production}`, num: true }], [
        ['Base', n_(String(b.months)), n_(E0(b.E)), n_(F.num(b.tco2, 1)), n_(F.num(b.tco2Month, 1)), n_(b.ha != null ? F.num(b.ha, 2) : '—'), n_(F.auto(b.tco2PerP))],
        ['Seguimiento', n_(String(s.months)), n_(E0(s.E)), n_(F.num(s.tco2, 1)), n_(F.num(s.tco2Month, 1)), n_(s.ha != null ? F.num(s.ha, 2) : '—'), n_(F.auto(s.tco2PerP))]
      ], { compact: true }) + `<p class="muted">Cambio de la intensidad de carbono por unidad producida: <b>${F.signedPct(ch)}</b>. La comparación descriptiva no ajusta por el nivel de producción; la huella evitada sí (usa el ahorro frente a la línea base).</p>`);
    }
    const mon = fp.monthly, cats = mon.map(x => shortM(x.month)), tips = mon.map(x => fm(x.month) + (x.period === 'seguimiento' ? ' (seguimiento)' : ''));
    const chC = C.categoryChart({ title: 'Huella de carbono mensual', subtitle: 't CO₂', categories: cats, tipTitle: tips, unit: 't CO₂', fmt: v => F.num(v, 1), width: HW(w), yLabel: 't CO₂', series: [{ name: 'Huella de carbono', kind: 'bar', color: COL.real, values: mon.map(x => x.tco2) }] });
    const chH = fp.fh != null ? C.categoryChart({ title: 'Huella ecológica mensual', subtitle: 'ha', categories: cats, tipTitle: tips, unit: 'ha', fmt: v => F.num(v, 3), width: HW(w), yLabel: 'ha', series: [{ name: 'Huella ecológica', kind: 'bar', color: COL.meta, values: mon.map(x => x.ha) }] }) : '';
    const chI = C.categoryChart({ title: 'Intensidad de carbono', subtitle: `t CO₂ por ${u.production}`, categories: cats, tipTitle: tips, fmt: F.auto, width: FW(w), height: 240, yLabel: `t CO₂/${u.production}`, series: [{ name: 'Intensidad', color: COL.real, values: mon.map(x => x.tco2PerP) }], refLines: [{ y: t.tco2PerP, label: 'Promedio ponderado ' + F.auto(t.tco2PerP) }] });
    const rows = mon.map(x => [fm(x.month), x.period === 'seguimiento' ? 'Seguimiento' : 'Base', n_(E0(x.E)), n_(E0(x.P)), n_(F.num(x.tco2, 2)), n_(x.ha != null ? F.num(x.ha, 4) : '—'), n_(F.auto(x.tco2PerP)), n_(x.haPerP != null ? F.auto(x.haPerP) : '—')]);
    const opp = R.opportunities.items.filter(i => i.co2 != null && i.key !== 'desv_presupuesto');
    const oppHtml = opp.length ? table(['Concepto', { t: `Energía (${u.energy})`, num: true }, { t: 't CO₂', num: true }, { t: 'ha', num: true }, 'Tipo'], opp.map(i => [i.title, n_(F.signed(i.energy, 0)), n_(F.signed(i.co2, 1)), n_(i.ha != null ? F.signed(i.ha, 3) : '—'), i.kind]), { compact: true }) : '';
    return section('Huella de carbono y huella ecológica', formula + cards) + periods + `<div class="chart-grid">${chC}${chH}</div>` + chI +
      (oppHtml ? section('Huella asociada a las oportunidades de mejora', oppHtml + '<p class="muted">Equivalencia en emisiones y huella de la energía de cada oportunidad. Son estimaciones, salvo el ahorro medido en el seguimiento.</p>') : '') +
      section('Huella por mes', table(['Mes', 'Periodo', { t: `Consumo (${u.energy})`, num: true }, { t: `Producción (${u.production})`, num: true }, { t: 't CO₂', num: true }, { t: 'ha', num: true }, { t: `t CO₂/${u.production}`, num: true }, { t: `ha/${u.production}`, num: true }], rows, { compact: true }));
  }

  const LIMITATIONS = [
    'El modelo de línea base es lineal y de una sola variable (producción). Si el consumo depende también del clima, la mezcla de productos u otras variables, el modelo puede ser insuficiente.',
    'Los p-values e intervalos suponen residuos independientes, con varianza constante y aproximadamente normales; con autocorrelación o pocos datos pueden ser optimistas.',
    'La línea meta se construye seleccionando puntos según el consumo; sus estadísticos son descriptivos y no inferenciales.',
    'El consumo no asociado a la producción (intercepto) suele ser una extrapolación hasta P = 0.',
    'Las oportunidades son estimaciones; los ahorros solo se consideran verificados con un plan de medición y verificación acordado.',
    'La aplicación no certifica el cumplimiento de ninguna norma (por ejemplo, ISO 50001/50006) ni sustituye una auditoría energética.',
    'Los datos se guardan únicamente en el navegador del usuario (almacenamiento local); no es una base de datos empresarial centralizada.'
  ];

  const api = { summary, descriptive, baseline, target, indicators, followup, budget, opportunities, footprint, quality, methodology, LIMITATIONS, table, callout, badge, kpi, section, shortM, HW, FW };
  EA.views = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

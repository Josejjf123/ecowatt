/*
 * report.js — Informe técnico descargable (HTML autónomo, imprimible a PDF desde el navegador).
 * Contiene datos de entrada, unidades, configuración, metodología, fórmulas y resultados para que un tercero
 * pueda reproducir los cálculos.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const F = EA.format || req('../core/format.js');
  const D = EA.dataset || req('../core/dataset.js');
  const U = EA.units || req('../core/units.js');
  const V = EA.views || req('../ui/views.js');
  const A = EA.analysis || req('../core/analysis.js');
  const esc = F.escapeHtml;

  const REPORT_CSS = `
  :root{--surface:#fff;--ink:#14201d;--ink-2:#46524f;--ink-3:#7a8582;--line:#dfe5e3;--grid:#e8ecea;--brand:#0f6b5c;--brand-2:#e8f3f0;
    --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--neutral:#6b7280;--pos-bar:#2a78d6;--neg-bar:#e34948;--good:#0a7f0a;--bad:#c22f2f;--warn:#a86400}
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff;margin:0;line-height:1.45;font-size:13.5px}
  .page{max-width:980px;margin:0 auto;padding:28px 24px 60px}
  header.rep{border-bottom:3px solid var(--brand);padding-bottom:14px;margin-bottom:18px} header.rep h1{margin:0 0 4px;font-size:24px;color:var(--brand)} header.rep p{margin:2px 0;color:var(--ink-2)}
  h2{font-size:19px;color:var(--brand);border-bottom:1px solid var(--line);padding-bottom:4px;margin:30px 0 10px;break-after:avoid} h3{font-size:15px;margin:18px 0 8px} h4{margin:4px 0}
  .muted{color:var(--ink-3);font-size:12px} small{font-weight:400;color:var(--ink-2);font-size:.65em}
  .table-wrap{overflow-x:auto;margin:8px 0} table.data{border-collapse:collapse;width:100%;font-size:11.5px} table.data th,table.data td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top} table.data th{background:var(--brand-2);font-weight:600} td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} td.flag{color:var(--bad);font-weight:600} tr.row-flag td{background:#fff7f5}
  .kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:10px 0} .kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px;break-inside:avoid} .kpi-label{font-size:11.5px;color:var(--ink-2)} .kpi-value{font-size:19px;font-weight:650;margin:2px 0} .kpi-sub{font-size:11px;color:var(--ink-3)} .kpi-good{border-left:4px solid var(--good)} .kpi-warn{border-left:4px solid var(--warn)}
  .callout{display:flex;gap:8px;border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0;font-size:12.5px;break-inside:avoid} .callout-warning{background:#fff8eb;border-color:#f3d9a4} .callout-error{background:#fdf0f0;border-color:#efc1c1} .callout-info{background:#f0f6fd;border-color:#c9dcf3} .callout-ok{background:#effaf1;border-color:#bfe3c6}
  .badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;border:1px solid} .badge-good{color:var(--good);border-color:#9fd3a6;background:#f0faf1} .badge-bad{color:var(--bad);border-color:#efb3b3;background:#fdf2f2} .badge-warn{color:var(--warn);border-color:#ebcf95;background:#fff9ec} .badge-neutral{color:var(--ink-2);border-color:var(--line);background:#f6f7f7}
  .equation{border:1px solid var(--line);border-left:4px solid var(--s2);border-radius:6px;padding:10px 14px;margin:8px 0} .eq-meta{border-left-color:var(--s3)} .eq-main{font-size:17px;font-weight:650;font-family:ui-monospace,Consolas,monospace} .eq-sub{color:var(--ink-2);font-size:12px;margin-top:4px}
  ul.checks{list-style:none;padding:0;columns:2;font-size:12.5px} .check.ok span{color:var(--good)} .check.no span{color:var(--bad)}
  figure.chart{margin:10px 0;border:1px solid var(--line);border-radius:8px;padding:10px;break-inside:avoid} figcaption{display:flex;flex-direction:column;margin-bottom:4px} .chart-title{font-weight:600} .chart-sub{font-size:11px;color:var(--ink-3)}
  .chart-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:var(--ink-2);margin:2px 0 4px} .lg-item{display:inline-flex;align-items:center;gap:4px}
  .chart-svg{width:100%;height:auto;display:block} .chart-svg .grid{stroke:var(--grid);stroke-width:1} .chart-svg .axis{stroke:#c3c2b7;stroke-width:1} .chart-svg .tick{font-size:10.5px;fill:var(--ink-3)} .chart-svg .axis-label{font-size:11px;fill:var(--ink-2)} .chart-svg .ref-label{font-size:10.5px;fill:var(--ink-2)}
  .chart-grid{display:grid;grid-template-columns:1fr;gap:10px}
  .formula-box{border:1px dashed var(--line);border-radius:6px;padding:8px 12px} code{font-family:ui-monospace,Consolas,monospace;background:#f4f6f5;padding:1px 4px;border-radius:3px}
  dl.method dt{font-weight:600;margin-top:8px} dl.method dd{margin:2px 0 0 0;color:var(--ink-2)}
  .opp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px} .opp-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;break-inside:avoid} .opp-value{font-size:19px;font-weight:650} .opp-sub{font-size:11.5px;color:var(--ink-2)} .opp-card p{font-size:12px;color:var(--ink-2)}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px} details.explain{border-bottom:1px solid var(--line);padding:4px 0} details.explain summary{cursor:pointer} details.explain[open] p,.print-open p{margin:4px 0 6px 0}
  ul.findings li,ul.recs li{margin:4px 0} .compact-list{margin:4px 0;padding-left:18px}
  .result-section{margin:6px 0 14px}
  .disclaimer{font-size:11.5px;color:var(--ink-2);border-top:1px solid var(--line);margin-top:30px;padding-top:10px}
  .toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:8px 24px;display:flex;gap:8px;justify-content:flex-end} .toolbar button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer}
  @media print{.toolbar{display:none} .page{padding:0} body{font-size:11.5px} h2{break-before:auto} details.explain>p{display:block} @page{margin:14mm}}
  @media (max-width:640px){ul.checks{columns:1} .two-col{grid-template-columns:1fr}}`;

  function inputTables(project, R) {
    const cfg = project.config;
    const eu = R.units.energy, pu = R.units.production;
    const v = R.validation;
    const st = r => ({ ok: 'Válido', incomplete: 'Incompleto', invalid: 'Inválido', duplicate: 'Duplicado', partial: 'Parcial' }[r.status] || r.status);
    const realRows = v.real.parsed.filter(r => r.status !== 'empty').map(r => [r.month ? D.formatMonth(r.month) : String(r.raw.month || ''), { t: r.E != null ? F.num(r.E, 2).replace(/,00$/, '') : String(r.raw.E || '—'), num: true }, { t: r.P != null ? F.num(r.P, 2).replace(/,00$/, '') : String(r.raw.P || '—'), num: true }, r.raw.period === 'seguimiento' ? 'Seguimiento' : 'Base', r.raw.include === false ? 'No' : 'Sí', st(r) + (r.reasons.length ? ' — ' + r.reasons.join('; ') : ''), r.raw.note || '']);
    let html = V.table(['Mes', { t: `Consumo (${eu})`, num: true }, { t: `Producción (${pu})`, num: true }, 'Periodo', 'Incluido', 'Estado', 'Observación'], realRows, { compact: true, caption: 'Datos reales (en unidades del proyecto)' });
    if (v.budget) {
      const bRows = v.budget.parsed.filter(r => r.status !== 'empty').map(r => [r.month ? D.formatMonth(r.month) : String(r.raw.month || ''), { t: r.E != null ? F.num(r.E, 0) : '—', num: true }, { t: r.P != null ? F.num(r.P, 0) : '—', num: true }, st(r)]);
      html += V.table(['Mes', { t: `Consumo presupuestado (${eu})`, num: true }, { t: `Producción presupuestada (${pu})`, num: true }, 'Estado'], bRows, { compact: true, caption: `Datos presupuestados (unidades originales: ${U.unitLabel(D.budgetEnergyUnit(cfg))}, ${U.unitLabel(D.budgetProductionUnit(cfg))}; convertidos a unidades del proyecto)` });
    } else html += '<p class="muted">No se registraron datos presupuestados.</p>';
    return html;
  }

  function build(project, R) {
    const c = project.company || {}, cfg = project.config;
    const W = 900;
    const now = new Date();
    const ct = U.ENERGY_TYPES[cfg.energyType] || {};
    const sec = (id, title, body) => `<h2 id="${id}">${esc(title)}</h2>${body}`;
    const cfgRows = [
      ['Energético analizado', ct.label || cfg.energyType], ['Unidad de consumo', R.units.energy], ['Unidad de producción', R.units.production + (cfg.productionLabel ? ` (${cfg.productionLabel})` : '')],
      ['Unidad del índice de consumo', R.units.ic], ['Nivel de significancia α', F.num(R.settings.alpha, 2)], ['Umbral de referencia de R²', F.num(R.settings.r2Threshold, 2)],
      ['Mínimo de observaciones para la línea base', String(R.settings.minObsBaseline)], ['Mínimo de puntos para la línea meta', String(R.settings.minObsTarget)],
      ['Tolerancia de desviación presupuestal', F.pct(R.settings.tolerancePct)], ['Umbral de cambio relevante del IC', F.pct(R.settings.icChangePct)],
      ['Convención de indicadores base 100', R.indicators.formulaLB], ['Precio de la energía', R.settings.energyPrice != null ? `${F.auto(R.settings.energyPrice)} ${cfg.currency}/${R.units.energy}` : 'No indicado'],
      ['Factor de emisión', R.settings.emissionFactor != null ? `${F.auto(R.settings.emissionFactor)} kg CO₂e/${R.units.energy}` : 'No indicado'],
      ['Versión del motor de cálculo', A.VERSION]
    ];
    const body = `
    <header class="rep"><h1>Informe técnico de caracterización y desempeño energético</h1>
      <p><b>${esc(c.name || 'Empresa sin nombre')}</b>${c.nit ? ' · NIT ' + esc(c.nit) : ''}${c.site ? ' · ' + esc(c.site) : ''}${c.sector ? ' · Sector: ' + esc(c.sector) : ''}</p>
      <p>Periodo evaluado: <b>${R.period ? esc(D.formatMonth(R.period.start, true)) + ' – ' + esc(D.formatMonth(R.period.end, true)) : '—'}</b> · ${R.counts ? R.counts.used : 0} observaciones utilizadas (${R.counts ? R.counts.base : 0} base, ${R.counts ? R.counts.followup : 0} seguimiento)</p>
      <p class="muted">Generado el ${esc(now.toLocaleString('es-CO'))}${c.responsible ? ' · Responsable: ' + esc(c.responsible) : ''}. Este informe no constituye una certificación oficial ni una declaración de cumplimiento normativo.</p></header>
    ${sec('resumen', '1. Resumen ejecutivo', V.summary(R, project, W))}
    ${sec('datos', '2. Datos de entrada y unidades', V.table(['Parámetro', 'Valor'], cfgRows, { compact: true }) + inputTables(project, R))}
    ${sec('calidad', '3. Calidad de los datos y advertencias', V.quality(R))}
    ${sec('descriptiva', '4. Estadística descriptiva e índice de consumo', V.descriptive(R, project, W))}
    ${sec('lb', '5. Línea base energética', V.baseline(R, project, W))}
    ${sec('lm', '6. Línea meta energética', V.target(R, project, W))}
    ${sec('ind', '7. Indicadores base 100 y CUSUM', V.indicators(R, project, W))}
    ${sec('seg', '8. Seguimiento y meta corporativa', V.followup(R, project, W))}
    ${sec('pres', '9. Desempeño real frente al presupuesto', V.budget(R, project, W))}
    ${sec('huella', '10. Huella de carbono y huella ecológica', V.footprint(R, project, W))}
    ${sec('opp', '11. Oportunidades de mejora', V.opportunities(R, project, W))}
    ${sec('met', '12. Metodología y fórmulas', V.methodology(R))}
    ${sec('lim', '13. Limitaciones del análisis', '<ul>' + V.LIMITATIONS.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>')}
    <div class="disclaimer">Reproducibilidad: con los datos de la sección 2 y las fórmulas de la sección 11 se obtienen los mismos resultados. El archivo Excel exportado por la aplicación incluye hojas de verificación con fórmulas nativas de Excel (PENDIENTE, INTERSECCION.EJE, COEFICIENTE.R2, ERROR.TIPICO.XY, DISTR.T) para recalcular la línea base y la línea meta.</div>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe energético — ${esc(c.name || 'Empresa')}</title><style>${REPORT_CSS}</style></head><body><div class="toolbar"><button onclick="document.querySelectorAll('details').forEach(d=>d.open=true);window.print()">Imprimir / Guardar como PDF</button></div><div class="page">${body}</div></body></html>`;
  }

  const api = { build, REPORT_CSS };
  EA.report = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

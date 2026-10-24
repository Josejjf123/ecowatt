/*
 * benchmark-views.js — Tablero comparativo entre empresas y rankings (HTML).
 * Recibe el resultado de EA.benchmark.compare(proyectos).
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const F = EA.format || req('../core/format.js');
  const D = EA.dataset || req('../core/dataset.js');
  const C = EA.charts || req('./charts.js');
  const V = EA.views || req('./views.js');
  const esc = F.escapeHtml;
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  const ZONE = {
    verde: { color: 'var(--zone-green)', badge: 'good', label: '● Zona verde', text: 'Cumple la meta' },
    amarilla: { color: 'var(--zone-yellow)', badge: 'warn', label: '▲ Zona amarilla', text: 'Entre la meta y la línea base' },
    roja: { color: 'var(--zone-red)', badge: 'bad', label: '■ Zona roja', text: 'Por encima de la línea base' }
  };
  const fm = m => D.formatMonth(m);
  const per = r => r.evalPeriod ? `${fm(r.evalPeriod.start)} – ${fm(r.evalPeriod.end)} (${r.evalPeriod.months} meses)` : '—';
  const zoneBadge = z => z ? V.badge(ZONE[z].badge, ZONE[z].label) : V.badge('neutral', 'Sin zona');
  const evBadge = e => e === 'medido' ? V.badge('good', 'Ahorro medido') : V.badge('warn', 'Indicativo');
  const W = w => (w && typeof w === 'object') ? w : { half: w || 600, full: w || 900 };

  function empty() {
    return V.callout('info', 'Aún no hay empresas con consumos registrados. Agregue empresas con el selector de la parte superior (＋ Empresa) o cargue la demostración «4 empresas para comparar».');
  }

  function definitions() {
    return V.callout('info', `<b>Cómo se calcula.</b> Para cada empresa se evalúa su <b>periodo de seguimiento</b> (ahorro medido después de una intervención) o, si no lo tiene, sus <b>últimos 12 meses</b> (resultado indicativo, porque esos meses también construyeron la línea base). <b>% de la meta consumido</b> = consumo real ÷ consumo de la línea meta para la producción real × 100. Zonas: ${V.badge('good', '● verde')} ≤ 100 % (cumple la meta), ${V.badge('warn', '▲ amarilla')} entre la meta y la línea base, ${V.badge('bad', '■ roja')} por encima de la línea base. Los porcentajes no tienen unidades y por eso son comparables entre empresas con productos distintos.`);
  }

  // ---------- Tablero ----------
  function dashboard(B, w) {
    w = W(w);
    if (!B.rows.length || !B.rows.some(r => r.counts && r.counts.used)) return empty();
    const cards = B.rows.map(r => {
      const head = `<div class="co-head"><div><div class="co-name">${esc(r.name)}</div><div class="muted">${esc([r.sector, r.site].filter(Boolean).join(' · '))}</div></div>${r.status === 'ok' ? zoneBadge(r.zone) : V.badge('neutral', 'Sin evaluar')}</div>`;
      if (r.status !== 'ok') return `<div class="co-card">${head}${V.callout('warning', esc(r.reasons.join(' ')))}${r.tco2 != null ? `<p class="muted">Huella de carbono (${esc(per(r))}): ${F.num(r.tco2, 1)} t CO₂${r.ha != null ? ' · ' + F.num(r.ha, 2) + ' ha' : ''}</p>` : ''}<button class="btn btn-sm" data-open-company="${esc(r.id)}">Ver datos de la empresa</button></div>`;
      const g = r.pctMeta != null ? C.gauge(r.pctMeta, r.pctLBRef, { width: 340, tip: `${r.name}\n% de la meta consumido: ${F.num(r.pctMeta, 1)} %\nLímite zona amarilla (línea base): ${F.num(r.pctLBRef, 1)} %` }) + `<div class="muted gauge-cap">Verde ≤ 100 % · amarilla hasta ${F.num(r.pctLBRef, 1)} % (nivel de la línea base) · roja por encima</div>` : V.callout('info', 'Sin línea meta: no se calcula el % de la meta consumido.');
      return `<div class="co-card">${head}
        <div class="co-gauge">${g}</div>
        <div class="co-metrics">
          <div><span class="muted">% de la meta consumido</span><b>${r.pctMeta != null ? F.num(r.pctMeta, 1) + ' %' : '—'}</b>${r.zone ? `<span class="muted">${esc(ZONE[r.zone].text)}</span>` : ''}</div>
          <div><span class="muted">Ahorro vs línea base</span><b>${F.signedPct(r.savingsPct)}</b>${evBadge(r.evidence)}</div>
          <div><span class="muted">Presupuesto consumido</span><b>${r.pctBudget != null ? F.num(r.pctBudget, 1) + ' %' : '—'}</b>${r.budgetZone ? zoneBadge(r.budgetZone) : '<span class="muted">Sin presupuesto</span>'}</div>
          <div><span class="muted">Huella del periodo</span><b>${r.tco2 != null ? F.num(r.tco2, 1) + ' t CO₂' : '—'}</b><span class="muted">${r.ha != null ? F.num(r.ha, 2) + ' ha' : ''}</span></div>
        </div>
        <p class="muted">Periodo evaluado: ${esc(per(r))} · R² línea base ${F.num(r.r2, 3)}${r.modelValid ? '' : ' (modelo con limitaciones)'}</p>
        <button class="btn btn-sm" data-open-company="${esc(r.id)}">Ver análisis completo →</button></div>`;
    }).join('');
    const ev = B.evaluable;
    const byName = ev.slice().sort((a, b) => (a.pctMeta || 0) - (b.pctMeta || 0));
    const chMeta = C.hbarChart({ title: '% de la meta consumido por empresa', subtitle: 'Color = zona (verde cumple, amarilla entre meta y línea base, roja sobre la línea base)', width: w.half, fmt: v => F.num(v, 0) + ' %',
      items: byName.filter(r => r.pctMeta != null).map(r => ({ label: r.name, value: r.pctMeta, color: ZONE[r.zone].color, valueText: F.num(r.pctMeta, 1) + ' % · ' + ZONE[r.zone].label.split(' ')[0] + ' ' + r.zone, tip: `${r.name}\n${F.num(r.pctMeta, 1)} % de la meta\n${ZONE[r.zone].text}\nPeriodo: ${per(r)}` })),
      refLines: [{ x: 100, label: 'Meta (100 %)' }] });
    const bySav = ev.slice().sort((a, b) => b.savingsPct - a.savingsPct);
    const chSav = C.hbarChart({ title: 'Ahorro frente a la línea base', subtitle: '% del consumo esperado; positivo = ahorro', width: w.half, fmt: v => F.num(v, 1) + ' %',
      items: bySav.map(r => ({ label: r.name, value: r.savingsPct, color: r.savingsPct >= 0 ? 'var(--pos-bar)' : 'var(--neg-bar)', valueText: F.signedPct(r.savingsPct) + (r.evidence === 'medido' ? '' : ' (indicativo)'), tip: `${r.name}\nAhorro: ${F.signedPct(r.savingsPct)}\n${r.evidence === 'medido' ? 'Medido en seguimiento' : 'Indicativo (últimos 12 meses)'}` })),
      legend: [{ name: 'Ahorro', color: 'var(--pos-bar)', type: 'bar' }, { name: 'Sobreconsumo', color: 'var(--neg-bar)', type: 'bar' }] });
    // Indicador base 100 mensual por empresa (meses alineados)
    const months = Array.from(new Set(ev.flatMap(r => r.ieb.map(x => x.month)))).sort((a, b) => D.monthIndex(a) - D.monthIndex(b));
    const shown = ev.slice(0, 8);
    const chIeb = months.length ? C.categoryChart({ title: 'Indicador base 100 mensual por empresa (IEB100 vs línea base)', subtitle: 'Por encima de 100 = consumo menor que el esperado para la producción del mes', width: w.full, height: 300, categories: months.map(V.shortM), tipTitle: months.map(fm), fmt: v => F.num(v, 1),
      series: shown.map((r, i) => { const m = new Map(r.ieb.map(x => [x.month, x.v])); return { name: r.name, color: SERIES[i], values: months.map(mo => m.has(mo) ? m.get(mo) : null), marker: false }; }),
      refLines: [{ y: 100, label: '100' }] }) : '';
    const fpRows = B.rows.filter(r => r.tco2 != null).sort((a, b) => b.tco2 - a.tco2);
    const chCO2 = fpRows.length ? C.hbarChart({ title: 'Huella de carbono del periodo evaluado', subtitle: 't CO₂', width: w.half, fmt: v => F.compact(v), items: fpRows.map(r => ({ label: r.name, value: r.tco2, color: 'var(--s1)', valueText: F.num(r.tco2, 1) + ' t', tip: `${r.name}\n${F.num(r.tco2, 1)} t CO₂\n${per(r)}` })) }) : '';
    const chHa = fpRows.some(r => r.ha != null) ? C.hbarChart({ title: 'Huella ecológica del periodo evaluado', subtitle: 'ha', width: w.half, fmt: v => F.num(v, 1), items: fpRows.filter(r => r.ha != null).map(r => ({ label: r.name, value: r.ha, color: 'var(--s3)', valueText: F.num(r.ha, 2) + ' ha', tip: `${r.name}\n${F.num(r.ha, 2)} ha` })) }) : '';
    return definitions() + `<div class="co-grid">${cards}</div>` +
      (ev.length ? `<div class="chart-grid">${chMeta}${chSav}</div>${chIeb}` : '') +
      (ev.length > 8 ? '<p class="muted">La gráfica mensual muestra las primeras 8 empresas; el resto aparece en las barras y en el ranking.</p>' : '') +
      (fpRows.length ? `<div class="chart-grid">${chCO2}${chHa}</div>` : '') +
      V.section('Resumen comparativo', summaryTable(B));
  }

  function summaryTable(B) {
    const n = (t) => ({ t, num: true });
    return V.table(['Empresa', 'Sector', 'Periodo evaluado', 'Evidencia', { t: '% meta', num: true }, 'Zona', { t: 'Ahorro %', num: true }, { t: '% presupuesto', num: true }, { t: 't CO₂', num: true }, { t: 'ha', num: true }, { t: 'R²', num: true }],
      B.rows.map(r => [r.name, r.sector || '—', per(r), { html: r.status === 'ok' ? evBadge(r.evidence) : V.badge('neutral', 'Sin evaluar') }, n(r.pctMeta != null ? F.num(r.pctMeta, 1) : '—'), { html: r.status === 'ok' ? zoneBadge(r.zone) : esc(r.reasons[0] || '') }, n(r.savingsPct != null ? F.signedPct(r.savingsPct) : '—'), n(r.pctBudget != null ? F.num(r.pctBudget, 1) : '—'), n(r.tco2 != null ? F.num(r.tco2, 1) : '—'), n(r.ha != null ? F.num(r.ha, 2) : '—'), n(r.r2 != null ? F.num(r.r2, 3) : '—')]), { compact: true });
  }

  // ---------- Rankings ----------
  function ranking(B, w) {
    w = W(w);
    if (!B.rows.length || !B.rows.some(r => r.counts && r.counts.used)) return empty();
    const n = (t, cls) => ({ t, num: true, cls });
    const medal = i => i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : '';
    const sav = B.savingsRanking;
    const savTable = sav.length ? V.table(['#', 'Empresa', 'Evidencia', 'Periodo evaluado', { t: 'Ahorro %', num: true }, { t: 'Ahorro de energía', num: true }, { t: 'Ahorro (kWh equiv.)', num: true }, 'Significancia', { t: '% meta', num: true }, 'Zona', { t: 'Emisiones evitadas', num: true }],
      sav.map(r => ({ cls: r.evidence === 'medido' ? '' : 'row-muted', cells: [{ html: `<b>${r.rankSavings}</b> ${medal(r.rankSavings)}` }, r.name, { html: evBadge(r.evidence) }, per(r), n(F.signedPct(r.savingsPct)), n(`${F.signed(r.savings, 0)} ${r.units.energy}`), n(r.savingsKWh != null ? F.signed(r.savingsKWh, 0) : '—'),
        { html: r.evidence === 'medido' ? (r.significant ? V.badge('good', 'Distinto de cero (95 %)') : V.badge('warn', 'No concluyente')) : '<span class="muted">No aplica</span>' },
        n(r.pctMeta != null ? F.num(r.pctMeta, 1) + ' %' : '—'), { html: zoneBadge(r.zone) }, n(r.tco2Avoided != null ? F.signed(r.tco2Avoided, 1) + ' t CO₂' : '—')] })), { compact: true }) : V.callout('info', 'Ninguna empresa tiene línea base para calcular su ahorro.');
    const chSav = sav.length ? C.hbarChart({ title: 'Ranking por ahorro', subtitle: 'Ahorro % frente a la línea base · los indicativos van después de los medidos', width: w.full, fmt: v => F.num(v, 1) + ' %',
      items: sav.map(r => ({ label: `${r.rankSavings}. ${r.name}`, value: r.savingsPct, color: r.savingsPct >= 0 ? 'var(--pos-bar)' : 'var(--neg-bar)', valueText: F.signedPct(r.savingsPct) + (r.evidence === 'medido' ? ' · medido' : ' · indicativo') })) }) : '';
    const fe = B.feRanking;
    const feTable = fe.length ? V.table(['#', 'Empresa', { t: 'Factor de emisión', num: true }, { t: 'Normalizado (t CO₂/kWh)', num: true }, { t: 'Factor de huella (ha/t CO₂)', num: true }, 'Periodo', { t: 'Emisiones (t CO₂)', num: true }, { t: 'Huella (ha)', num: true }, { t: 'Intensidad', num: true }],
      fe.map(r => [{ html: `<b>${r.rankFe}</b> ${medal(r.rankFe)}` }, r.name, n(`${F.auto(r.fe)} ${r.feLabel}`), n(r.feTPerKWh != null ? F.auto(r.feTPerKWh) : '—'), n(r.fh != null ? F.auto(r.fh) : '—'), per(r), n(F.num(r.tco2, 1)), n(r.ha != null ? F.num(r.ha, 2) : '—'), n(r.tco2PerP != null ? `${F.auto(r.tco2PerP)} t CO₂/${r.units.production}` : '—')]), { compact: true }) : V.callout('info', 'Ninguna empresa tiene factor de emisión configurado.');
    const chFe = fe.length ? C.hbarChart({ title: 'Ranking por factor de emisión', subtitle: 't CO₂ por kWh (menor es mejor)', width: w.half, fmt: v => F.auto(v),
      items: fe.filter(r => r.feTPerKWh != null).map(r => ({ label: `${r.rankFe}. ${r.name}`, value: r.feTPerKWh, color: 'var(--s1)', valueText: F.auto(r.feTPerKWh) })) }) : '';
    const fpSorted = fe.slice().sort((a, b) => (a.tco2PerP == null) - (b.tco2PerP == null) || 0);
    const chInt = fe.length ? C.hbarChart({ title: 'Emisiones del periodo por empresa', subtitle: 't CO₂ (depende del tamaño de cada empresa)', width: w.half, fmt: v => F.compact(v),
      items: fpSorted.map(r => ({ label: r.name, value: r.tco2, color: 'var(--s3)', valueText: F.num(r.tco2, 1) + ' t' })) }) : '';
    const nr = B.notRanked.length ? V.section('Empresas sin ranking de ahorro', V.table(['Empresa', 'Motivo'], B.notRanked.map(r => [r.name, r.reasons.join(' ')]), { compact: true })) : '';
    return V.section('Ranking por ahorro demostrado', V.callout('info', 'Orden: primero las empresas con <b>ahorro medido</b> en un periodo de seguimiento (de mayor a menor ahorro %), después las de resultado <b>indicativo</b> (últimos 12 meses dentro del periodo base). El ahorro medido solo se considera verificado si existe un plan de medición y verificación revisado.') + savTable + chSav + `<div style="margin-top:10px"><button class="btn btn-sm" data-act="ranking-csv">Descargar ranking (CSV)</button></div>`) +
      V.section('Ranking por factor de emisión', V.callout('info', 'Ordena de menor a mayor factor de emisión normalizado a t CO₂ por kWh (menos emisiones por unidad de energía). En empate se ordena por menores emisiones en el periodo evaluado. Las emisiones absolutas dependen del tamaño de cada empresa; la intensidad (t CO₂ por unidad producida) solo es comparable entre empresas con el mismo producto.') + feTable + `<div class="chart-grid">${chFe}${chInt}</div>`) + nr;
  }

  function rankingCSV(B) {
    const rows = [['Posición ahorro', 'Empresa', 'Sector', 'Evidencia', 'Inicio', 'Fin', 'Meses', 'Ahorro %', 'Ahorro energía', 'Unidad', 'Ahorro kWh equiv.', 'Significativo', '% meta consumido', 'Zona', '% presupuesto', 'Posición factor emisión', 'Factor emisión', 'Unidad factor', 'Factor t CO2/kWh', 'Emisiones t CO2', 'Huella ha']];
    const num = v => v == null || !isFinite(v) ? '' : String(Number(v.toPrecision(10))).replace('.', ',');
    B.rows.slice().sort((a, b) => (a.rankSavings || 1e9) - (b.rankSavings || 1e9)).forEach(r => rows.push([r.rankSavings || '', r.name, r.sector, r.evidence || r.status, r.evalPeriod ? r.evalPeriod.start : '', r.evalPeriod ? r.evalPeriod.end : '', r.evalPeriod ? r.evalPeriod.months : '', num(r.savingsPct), num(r.savings), r.units ? r.units.energy : '', num(r.savingsKWh), r.significant == null ? '' : r.significant ? 'sí' : 'no', num(r.pctMeta), r.zone || '', num(r.pctBudget), r.rankFe || '', num(r.fe), r.feLabel || '', num(r.feTPerKWh), num(r.tco2), num(r.ha)]));
    return (EA.csv || req('../io/csv.js')).stringify(rows, ';');
  }

  const api = { dashboard, ranking, rankingCSV, summaryTable, ZONE };
  EA.benchmarkViews = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

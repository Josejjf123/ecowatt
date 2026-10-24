/*
 * charts.js — Gráficos SVG generados como texto (sin bibliotecas).
 * Se usan en la interfaz (con tooltips interactivos mediante atributos data-tip) y en el informe HTML.
 * Colores por rol (variables CSS): --s1 real (azul), --s2 línea base (naranja), --s3 línea meta (aqua),
 * --neutral presupuesto (gris, línea discontinua), --pos/--neg para barras divergentes.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const F = EA.format || (typeof require !== 'undefined' ? require('../core/format.js') : null);
  const esc = F.escapeHtml;

  function niceStep(range, count) {
    const raw = range / Math.max(1, count); const mag = Math.pow(10, Math.floor(Math.log10(raw))); const r = raw / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  }
  function niceScale(min, max, count, includeZero) {
    if (includeZero) { min = Math.min(0, min); max = Math.max(0, max); }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
    const step = niceStep(max - min, count || 5);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = []; for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { min: lo, max: hi, ticks };
  }
  function legend(items) {
    if (!items || items.length < 2) return '';
    return `<div class="chart-legend">${items.map(it => `<span class="lg-item"><svg width="22" height="12" aria-hidden="true">${it.type === 'bar' ? `<rect x="3" y="1" width="16" height="10" rx="2" fill="${it.color}" ${it.hollow ? `fill-opacity="0.15" stroke="${it.color}" stroke-width="1.5"` : ''}/>` : it.type === 'dot' ? `<circle cx="11" cy="6" r="4.5" fill="${it.hollow ? 'var(--surface)' : it.color}" stroke="${it.color}" stroke-width="2"/>` : it.type === 'band' ? `<rect x="1" y="2" width="20" height="8" fill="${it.color}" fill-opacity="0.16"/>` : `<line x1="1" y1="6" x2="21" y2="6" stroke="${it.color}" stroke-width="2.5" ${it.dash ? 'stroke-dasharray="5 3"' : ''} stroke-linecap="round"/>`}</svg>${esc(it.name)}</span>`).join('')}</div>`;
  }
  function wrap(svg, leg, title, sub, opts) {
    return `<figure class="chart"${opts && opts.id ? ` id="${opts.id}"` : ''}>${title ? `<figcaption><span class="chart-title">${esc(title)}</span>${sub ? `<span class="chart-sub">${esc(sub)}</span>` : ''}</figcaption>` : ''}${leg}${svg}</figure>`;
  }
  function tipAttr(text) { return ` data-tip="${esc(text)}"`; }

  const M = { top: 14, right: 16, bottom: 44, left: 64 };

  /**
   * Gráfico por categorías (meses) con series de línea y/o barras.
   * cfg: { categories:[label], series:[{ name, color, values:[n|null], kind:'line'|'bar', dash, hollow, marker }],
   *        refLines:[{ y, label, color }], yLabel, width, height, includeZero, fmt, tipTitle:[label] }
   */
  function categoryChart(cfg) {
    const W = Math.max(300, cfg.width || 720), H = cfg.height || 300;
    const cats = cfg.categories, n = cats.length;
    const fmt = cfg.fmt || F.auto;
    const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
    const vals = []; cfg.series.forEach(s => s.values.forEach(v => { if (v != null && isFinite(v)) vals.push(v); }));
    (cfg.refLines || []).forEach(r => vals.push(r.y));
    const bars = cfg.series.filter(s => s.kind === 'bar');
    const sc = niceScale(Math.min(...vals), Math.max(...vals), 5, cfg.includeZero || bars.length > 0);
    const y = v => M.top + ih - (v - sc.min) / (sc.max - sc.min) * ih;
    const band = iw / Math.max(1, n); const x = i => M.left + band * (i + 0.5);
    let g = '';
    sc.ticks.forEach(t => { g += `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end">${esc(F.compact(t))}</text>`; });
    const step = Math.ceil(n / Math.max(1, Math.floor(iw / 46)));
    cats.forEach((c, i) => { if (i % step === 0) g += `<text class="tick" x="${x(i)}" y="${H - M.bottom + 16}" text-anchor="middle">${esc(c)}</text>`; });
    g += `<line class="axis" x1="${M.left}" x2="${W - M.right}" y1="${y(Math.max(sc.min, Math.min(0, sc.max)))}" y2="${y(Math.max(sc.min, Math.min(0, sc.max)))}"/>`;
    if (cfg.yLabel) g += `<text class="axis-label" transform="translate(14 ${M.top + ih / 2}) rotate(-90)" text-anchor="middle">${esc(cfg.yLabel)}</text>`;
    // Barras agrupadas
    if (bars.length) {
      const gap = 2, bw = Math.min(24, (band * 0.8 - gap * (bars.length - 1)) / bars.length);
      const y0 = y(Math.max(sc.min, Math.min(0, sc.max)));
      bars.forEach((s, k) => {
        s.values.forEach((v, i) => {
          if (v == null || !isFinite(v)) return;
          const bx = x(i) - (bars.length * bw + (bars.length - 1) * gap) / 2 + k * (bw + gap);
          const yy = y(v), top = Math.min(yy, y0), h = Math.max(1, Math.abs(y0 - yy)), r = Math.min(4, bw / 2, h);
          const up = v >= 0;
          const path = up
            ? `M${bx},${top + h} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${top + h} Z`
            : `M${bx},${top} V${top + h - r} Q${bx},${top + h} ${bx + r},${top + h} H${bx + bw - r} Q${bx + bw},${top + h} ${bx + bw},${top + h - r} V${top} Z`;
          const col = typeof s.color === 'function' ? s.color(v, i) : s.color;
          g += `<path d="${path}" fill="${col}" ${s.hollow ? `fill-opacity="0.18" stroke="${col}" stroke-width="1.5"` : ''}/>`;
        });
      });
    }
    // Líneas de referencia
    (cfg.refLines || []).forEach(r => { g += `<line x1="${M.left}" x2="${W - M.right}" y1="${y(r.y)}" y2="${y(r.y)}" stroke="${r.color || 'var(--ink-2)'}" stroke-width="1.5" stroke-dasharray="6 4"/>${r.label ? `<text class="ref-label" x="${W - M.right - 4}" y="${y(r.y) - 6}" text-anchor="end">${esc(r.label)}</text>` : ''}`; });
    // Líneas
    cfg.series.filter(s => s.kind !== 'bar').forEach(s => {
      let d = '', pen = false;
      s.values.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; });
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
      if (s.marker !== false && n <= 48) s.values.forEach((v, i) => { if (v != null && isFinite(v)) g += `<circle cx="${x(i)}" cy="${y(v)}" r="${s.hollow ? 3.5 : 4}" fill="${s.hollow ? 'var(--surface)' : s.color}" stroke="${s.hollow ? s.color : 'var(--surface)'}" stroke-width="2"/>`; });
    });
    // Zonas de interacción por categoría (crosshair + tooltip)
    cats.forEach((c, i) => {
      const lines = [(cfg.tipTitle ? cfg.tipTitle[i] : c)];
      cfg.series.forEach(s => { const v = s.values[i]; if (v != null && isFinite(v)) lines.push(`${s.name}: ${fmt(v)}${cfg.unit ? ' ' + cfg.unit : ''}`); });
      if (cfg.extraTip && cfg.extraTip[i]) lines.push(cfg.extraTip[i]);
      g += `<rect class="hit" x="${M.left + band * i}" y="${M.top}" width="${band}" height="${ih}" fill="transparent"${tipAttr(lines.join('\n'))}/>`;
    });
    const svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Gráfico')}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
    const leg = legend(cfg.series.filter(s => !(typeof s.color === 'function' && cfg.legendExtra)).map(s => ({ name: s.name, color: typeof s.color === 'function' ? 'var(--ink-3)' : s.color, type: s.kind === 'bar' ? 'bar' : 'line', dash: s.dash, hollow: s.hollow })).concat(cfg.legendExtra || []));
    return wrap(svg, leg, cfg.title, cfg.subtitle, cfg);
  }

  /**
   * Dispersión x-y con rectas/curvas.
   * cfg: { points:[{x,y,label,hollow,color,tip}], lines:[{name,color,fn,dash}], band:{low,high,color,name}, xLabel, yLabel, width, height }
   */
  function scatterChart(cfg) {
    const W = Math.max(300, cfg.width || 720), H = cfg.height || 340;
    const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
    const xs = cfg.points.map(p => p.x), ys = cfg.points.map(p => p.y);
    let xmin = Math.min(...xs), xmax = Math.max(...xs); const pad = (xmax - xmin) * 0.06 || 1; xmin -= pad; xmax += pad;
    if (cfg.xFromZero) xmin = 0;
    const yvals = ys.slice();
    (cfg.lines || []).forEach(l => { yvals.push(l.fn(xmin), l.fn(xmax)); });
    const xsc = niceScale(xmin, xmax, 5, !!cfg.xFromZero), ysc = niceScale(Math.min(...yvals), Math.max(...yvals), 5, !!cfg.yFromZero);
    const X = v => M.left + (v - xsc.min) / (xsc.max - xsc.min) * iw, Y = v => M.top + ih - (v - ysc.min) / (ysc.max - ysc.min) * ih;
    let g = `<defs><clipPath id="clip-${cfg.uid || 'sc'}"><rect x="${M.left}" y="${M.top}" width="${iw}" height="${ih}"/></clipPath></defs>`;
    ysc.ticks.forEach(t => { g += `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${M.left - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(F.compact(t))}</text>`; });
    xsc.ticks.forEach(t => { g += `<text class="tick" x="${X(t)}" y="${H - M.bottom + 16}" text-anchor="middle">${esc(F.compact(t))}</text>`; });
    g += `<line class="axis" x1="${M.left}" x2="${W - M.right}" y1="${M.top + ih}" y2="${M.top + ih}"/>`;
    if (cfg.yLabel) g += `<text class="axis-label" transform="translate(14 ${M.top + ih / 2}) rotate(-90)" text-anchor="middle">${esc(cfg.yLabel)}</text>`;
    if (cfg.xLabel) g += `<text class="axis-label" x="${M.left + iw / 2}" y="${H - 6}" text-anchor="middle">${esc(cfg.xLabel)}</text>`;
    const clip = `clip-path="url(#clip-${cfg.uid || 'sc'})"`;
    if (cfg.band) {
      const N = 40; let up = '', dn = '';
      for (let k = 0; k <= N; k++) { const xv = cfg.band.x0 + (cfg.band.x1 - cfg.band.x0) * k / N; up += (k ? 'L' : 'M') + X(xv).toFixed(1) + ',' + Y(cfg.band.high(xv)).toFixed(1); }
      for (let k = N; k >= 0; k--) { const xv = cfg.band.x0 + (cfg.band.x1 - cfg.band.x0) * k / N; dn += 'L' + X(xv).toFixed(1) + ',' + Y(cfg.band.low(xv)).toFixed(1); }
      g += `<path d="${up}${dn}Z" fill="${cfg.band.color}" fill-opacity="0.12" ${clip}/>`;
    }
    (cfg.lines || []).forEach(l => {
      const x0 = l.x0 != null ? l.x0 : xsc.min, x1 = l.x1 != null ? l.x1 : xsc.max; const N = l.curve ? 60 : 1; let d = '';
      for (let k = 0; k <= N; k++) { const xv = x0 + (x1 - x0) * k / N; d += (k ? 'L' : 'M') + X(xv).toFixed(1) + ',' + Y(l.fn(xv)).toFixed(1); }
      g += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2" stroke-linecap="round" ${l.dash ? 'stroke-dasharray="6 4"' : ''} ${clip}/>`;
    });
    cfg.points.forEach(p => {
      const c = p.color || 'var(--s1)';
      g += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.hollow ? 4 : 4.5}" fill="${p.hollow ? 'var(--surface)' : c}" stroke="${p.hollow ? c : 'var(--surface)'}" stroke-width="2"/>`;
      g += `<circle class="hit" cx="${X(p.x)}" cy="${Y(p.y)}" r="10" fill="transparent"${tipAttr(p.tip || p.label || '')}/>`;
    });
    const svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Gráfico de dispersión')}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
    const items = (cfg.legendPoints || []).concat((cfg.lines || []).filter(l => l.name).map(l => ({ name: l.name, color: l.color, type: 'line', dash: l.dash })));
    if (cfg.band && cfg.band.name) items.push({ name: cfg.band.name, color: cfg.band.color, type: 'band' });
    return wrap(svg, legend(items), cfg.title, cfg.subtitle, cfg);
  }

  /**
   * Barras horizontales (una por empresa). cfg: { items:[{ label, value, color, tip, valueText }], refLines:[{ x, label }], width, fmt, xLabel }
   */
  function hbarChart(cfg) {
    const W = Math.max(300, cfg.width || 720);
    const items = cfg.items.filter(i => i.value != null && isFinite(i.value));
    const rowH = 30, top = 8, bottom = 34;
    const left = Math.min(220, Math.max(110, Math.round(W * 0.3))), right = 70;
    const H = top + bottom + rowH * Math.max(1, items.length);
    const vals = items.map(i => i.value).concat((cfg.refLines || []).map(r => r.x));
    const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 5, true);
    const iw = W - left - right;
    const X = v => left + (v - sc.min) / (sc.max - sc.min) * iw;
    const fmt = cfg.fmt || F.auto;
    let g = '';
    sc.ticks.forEach(t => { g += `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${H - bottom}"/><text class="tick" x="${X(t)}" y="${H - bottom + 16}" text-anchor="middle">${esc(fmt(t))}</text>`; });
    g += `<line class="axis" x1="${X(0)}" x2="${X(0)}" y1="${top}" y2="${H - bottom}"/>`;
    const maxChars = Math.floor((left - 12) / 6.6);
    items.forEach((it, i) => {
      const cy = top + rowH * i + rowH / 2, bh = 16, x0 = X(0), x1 = X(it.value);
      const lx = Math.min(x0, x1), w = Math.max(1, Math.abs(x1 - x0)), r = Math.min(4, w);
      const pos = it.value >= 0;
      const path = pos
        ? `M${lx},${cy - bh / 2} H${lx + w - r} Q${lx + w},${cy - bh / 2} ${lx + w},${cy - bh / 2 + r} V${cy + bh / 2 - r} Q${lx + w},${cy + bh / 2} ${lx + w - r},${cy + bh / 2} H${lx} Z`
        : `M${lx + w},${cy - bh / 2} H${lx + r} Q${lx},${cy - bh / 2} ${lx},${cy - bh / 2 + r} V${cy + bh / 2 - r} Q${lx},${cy + bh / 2} ${lx + r},${cy + bh / 2} H${lx + w} Z`;
      const lab = String(it.label); const shown = lab.length > maxChars ? lab.slice(0, maxChars - 1) + '…' : lab;
      g += `<text class="tick" x="${left - 8}" y="${cy + 4}" text-anchor="end" style="fill:var(--ink-2)">${esc(shown)}</text>`;
      g += `<path d="${path}" fill="${it.color || 'var(--s1)'}"/>`;
      g += `<text class="ref-label" x="${pos ? x1 + 6 : x1 - 6}" y="${cy + 4}" text-anchor="${pos ? 'start' : 'end'}">${esc(it.valueText || fmt(it.value))}</text>`;
      g += `<rect class="hit" x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"${tipAttr(it.tip || lab + ': ' + fmt(it.value))}/>`;
    });
    (cfg.refLines || []).forEach(r => { g += `<line x1="${X(r.x)}" x2="${X(r.x)}" y1="${top - 2}" y2="${H - bottom}" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="5 4"/>${r.label ? `<text class="ref-label" x="${X(r.x) + 4}" y="${H - bottom + 28}">${esc(r.label)}</text>` : ''}`; });
    if (cfg.xLabel) g += `<text class="axis-label" x="${left + iw / 2}" y="${H - 2}" text-anchor="middle">${esc(cfg.xLabel)}</text>`;
    const svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Gráfico de barras')}">${g}</svg>`;
    return wrap(svg, legend(cfg.legend || []), cfg.title, cfg.subtitle, cfg);
  }

  /**
   * Indicador tipo "bala" del % de la meta consumido con tres zonas.
   * pct: valor; yellowMax: límite superior de la zona amarilla (p. ej. nivel de la línea base).
   */
  function gauge(pct, yellowMax, opts) {
    opts = opts || {};
    const W = opts.width || 320, H = 64, l = 10, r = 10, y0 = 26, bh = 14;
    const lo = Math.floor(Math.min(90, pct - 4) / 5) * 5, hi = Math.ceil(Math.max(110, pct + 4, yellowMax + 4) / 5) * 5;
    const X = v => l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - l - r);
    const band = (a, b, col) => `<rect x="${X(a)}" y="${y0}" width="${Math.max(0, X(b) - X(a))}" height="${bh}" fill="${col}" fill-opacity="0.28"/>`;
    let g = band(lo, 100, 'var(--zone-green)') + band(100, Math.max(100, yellowMax), 'var(--zone-yellow)') + band(Math.max(100, yellowMax), hi, 'var(--zone-red)');
    g += `<line x1="${X(100)}" x2="${X(100)}" y1="${y0 - 3}" y2="${y0 + bh + 3}" stroke="var(--ink-3)" stroke-width="1"/>`;
    g += `<text class="tick" x="${X(100)}" y="${y0 + bh + 15}" text-anchor="middle">100 %</text>`;
    g += `<text class="tick" x="${l}" y="${y0 + bh + 15}">${lo} %</text><text class="tick" x="${W - r}" y="${y0 + bh + 15}" text-anchor="end">${hi} %</text>`;
    const xm = X(pct);
    g += `<rect x="${xm - 2}" y="${y0 - 6}" width="4" height="${bh + 12}" rx="2" fill="var(--ink)"/>`;
    g += `<text x="${Math.min(W - 30, Math.max(30, xm))}" y="${y0 - 10}" text-anchor="middle" style="font-size:13px;font-weight:650;fill:var(--ink)">${esc(F.num(pct, 1))} %</text>`;
    return `<svg class="chart-svg gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(F.num(pct, 1))} % de la meta consumido"${tipAttr(opts.tip || '')}>${g}</svg>`;
  }

  const api = { categoryChart, scatterChart, hbarChart, gauge, niceScale };
  EA.charts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * format.js — Formato de números para presentación (convención es-CO: punto de miles, coma decimal).
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const cache = {};
  function nf(min, max) {
    const k = min + '-' + max;
    return cache[k] || (cache[k] = new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  /** Número con decimales fijos. */
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    dec = dec == null ? 0 : dec;
    return nf(dec, dec).format(v);
  }
  /** Número con decimales automáticos según magnitud (≈4 cifras significativas para valores pequeños). */
  function auto(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return num(v, 0);
    if (a >= 100) return num(v, 1);
    if (a >= 1) return num(v, 2);
    const dec = Math.min(8, Math.max(3, 3 - Math.floor(Math.log10(a))));
    return nf(0, dec).format(Number(v.toPrecision(4)));
  }
  /** Número con signo explícito. */
  function signed(v, dec) { if (v == null || !isFinite(v)) return '—'; return (v > 0 ? '+' : v < 0 ? '−' : '') + (dec == null ? auto(Math.abs(v)) : num(Math.abs(v), dec)); }
  function pct(v, dec) { if (v == null || !isFinite(v)) return '—'; return num(v, dec == null ? 1 : dec) + ' %'; }
  function signedPct(v, dec) { if (v == null || !isFinite(v)) return '—'; return signed(v, dec == null ? 1 : dec) + ' %'; }
  /** p-value legible. */
  function pval(p) { if (p == null || !isFinite(p)) return '—'; if (p < 0.0001) return '< 0,0001'; return num(p, 4); }
  /** p-value con su operador, para escribir "p < 0,0001" o "p = 0,0123". */
  function pEq(p) { if (p == null || !isFinite(p)) return '= —'; return p < 0.0001 ? '< 0,0001' : '= ' + num(p, 4); }
  /** Número compacto para ejes: 1,2 mil / 3,4 M. */
  function compact(v) {
    if (v == null || !isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e9) return num(v / 1e9, a >= 1e10 ? 0 : 1) + ' mil M';
    if (a >= 1e6) return num(v / 1e6, a >= 1e7 ? 0 : 1) + ' M';
    if (a >= 1e4) return num(v / 1e3, 0) + ' mil';
    return auto(v);
  }
  /** Representación sin separador de miles para campos de edición (respeta el separador decimal elegido). */
  function plain(v, decimalSep) {
    if (v === '' || v == null) return '';
    if (typeof v !== 'number') return String(v);
    const s = String(Number(v.toPrecision(12)));
    return decimalSep === '.' ? s : s.replace('.', ',');
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const api = { num, auto, signed, pct, signedPct, pval, pEq, compact, plain, escapeHtml };
  EA.format = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

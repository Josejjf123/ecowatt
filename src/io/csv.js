/*
 * csv.js — Lectura y escritura de CSV (RFC 4180), con detección del delimitador (; , tab).
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
    const cands = [';', '\t', ',', '|'];
    let best = ';', bestScore = -1;
    for (const d of cands) {
      const counts = lines.map(l => splitLine(l, d).length);
      if (!counts.length) continue;
      const mode = counts.sort((a, b) => counts.filter(x => x === b).length - counts.filter(x => x === a).length)[0];
      const consistent = counts.filter(c => c === mode).length;
      const score = mode > 1 ? consistent * 10 + mode : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
  function splitLine(line, d) { return parse(line, d)[0] || []; }

  /** Analiza texto CSV → matriz de celdas (strings). */
  function parse(text, delimiter) {
    text = String(text).replace(/^﻿/, '');
    const d = delimiter || detectDelimiter(text);
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }

  /** Serializa una matriz a CSV. Por defecto ';' (abre directamente en Excel con configuración regional es-CO). */
  function stringify(rows, delimiter) {
    const d = delimiter || ';';
    return '﻿' + rows.map(r => r.map(v => {
      const s = v == null ? '' : String(v);
      return /[";\n\r,\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(d)).join('\r\n');
  }

  const api = { parse, stringify, detectDelimiter };
  EA.csv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*
 * importer.js — Importación de datos desde CSV, Excel (.xlsx) o texto pegado.
 * Detecta la fila de encabezados, propone una asignación de columnas (editable por el usuario),
 * detecta el separador decimal y las unidades indicadas en los encabezados.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = EA.dataset || req('../core/dataset.js');
  const U = EA.units || req('../core/units.js');
  const CSV = EA.csv || req('./csv.js');
  const X = EA.xlsx || req('./xlsx.js');

  const FIELDS = [
    { key: 'month', label: 'Mes (AAAA-MM)', required: true },
    { key: 'E', label: 'Consumo real', required: true },
    { key: 'P', label: 'Producción real', required: true },
    { key: 'Eb', label: 'Consumo presupuestado' },
    { key: 'Pb', label: 'Producción presupuestada' },
    { key: 'eUnit', label: 'Unidad del consumo (por fila)' },
    { key: 'pUnit', label: 'Unidad de producción (por fila)' },
    { key: 'period', label: 'Tipo de periodo (base / seguimiento)' },
    { key: 'note', label: 'Observaciones' }
  ];

  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  async function readFile(file) {
    const name = (file.name || '').toLowerCase();
    if (/\.xlsx$|\.xlsm$/.test(name)) {
      const buf = await file.arrayBuffer();
      return X.read(buf);
    }
    if (/\.xls$/.test(name)) throw new Error('Los archivos .xls (Excel 97-2003) no son compatibles. Ábralo en Excel y guárdelo como .xlsx o CSV.');
    const text = await file.text();
    return { sheets: [{ name: file.name || 'CSV', rows: CSV.parse(text) }] };
  }
  function fromText(text) { return { sheets: [{ name: 'Pegado', rows: CSV.parse(text, text.includes('\t') ? '\t' : undefined) }] }; }

  function looksLikeDataRow(r) {
    if (!r || r.length < 2) return false;
    const m = D.parseMonth(r[0]);
    const nums = r.slice(1).filter(c => c != null && c !== '' && D.parseNumber(c, ',').value != null).length;
    return !!m && nums >= 1;
  }

  function unitFromHeader(h) {
    const m = /[\(\[]\s*([^\)\]]+?)\s*[\)\]]/.exec(String(h || ''));
    const cand = m ? m[1] : null;
    if (cand) { const u = U.normalizeUnit(cand); if (u && !u.startsWith('custom:')) return u; }
    const words = norm(h).split(/[\s_\-\/]+/);
    for (const w of words) { const u = U.normalizeUnit(w); if (u && !u.startsWith('custom:') && /kwh|mwh|gwh|gj|mj|mmbtu|^l$|^hl$|^m3$|^kg$|^t$|^ton|litros|toneladas|unidades/.test(w)) return u; }
    return null;
  }

  /** Propone la fila de encabezado y la asignación de columnas. */
  function analyze(rows) {
    rows = rows || [];
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      if (looksLikeDataRow(rows[i])) break;
      const texts = (rows[i] || []).filter(c => typeof c === 'string' && c.trim() && D.parseNumber(c, ',').value == null);
      if (texts.length >= 2) { headerRow = i; break; }
    }
    const headers = headerRow >= 0 ? rows[headerRow].map(h => h == null ? '' : String(h)) : [];
    const ncol = Math.max(0, ...rows.map(r => (r || []).length));
    const mapping = {}; FIELDS.forEach(f => { mapping[f.key] = -1; });
    if (headerRow >= 0) {
      const H = headers.map(norm);
      const isBud = h => /presup|budget|plan|proyect|pronost|forecast|objetivo/.test(h);
      const take = (key, pred) => { if (mapping[key] >= 0) return; const i = H.findIndex((h, k) => pred(h) && !Object.values(mapping).includes(k)); if (i >= 0) mapping[key] = i; };
      take('month', h => /^(mes|fecha|month|date)\b|\bmes\b|fecha/.test(h) && !/tipo|consum|produc|presup|energ/.test(h));
      take('period', h => /tipo de periodo|tipo periodo|etapa|base\s*\/\s*seguimiento|seguimiento|periodo de analisis/.test(h));
      take('month', h => /^periodo$|^period$|ano.?mes|^mes.?ano/.test(h));
      take('eUnit', h => /^(unidad|und|unit)/.test(h) && /consum|energ/.test(h));
      take('pUnit', h => /^(unidad|und|unit)/.test(h) && /produc/.test(h));
      take('Eb', h => isBud(h) && /consum|energ|kwh|mwh|gj/.test(h));
      take('Pb', h => isBud(h) && /produc|volumen|litro|tonel|unidades|cajas/.test(h));
      take('E', h => !isBud(h) && !/^(unidad|und|unit)/.test(h) && /consum|energ|kwh|mwh|gj|electric|gas|vapor/.test(h));
      take('P', h => !isBud(h) && !/^(unidad|und|unit)/.test(h) && /produc|volumen|litro|tonel|unidades|cajas|output/.test(h));
      take('note', h => /nota|observ|coment/.test(h));
    } else if (ncol >= 3) {
      mapping.month = 0; mapping.E = 1; mapping.P = 2; if (ncol >= 4) mapping.Eb = 3; if (ncol >= 5) mapping.Pb = 4;
    }
    const units = {};
    if (headerRow >= 0) ['E', 'P', 'Eb', 'Pb'].forEach(k => { if (mapping[k] >= 0) { const u = unitFromHeader(headers[mapping[k]]); if (u) units[k] = u; } });
    const dataRows = rows.slice(headerRow + 1).filter(r => r && r.some(c => c != null && String(c).trim() !== ''));
    return { headerRow, headers, ncol, mapping, units, dataRows, decimalSep: detectDecimal(dataRows, mapping) };
  }

  /** Detecta el separador decimal más probable a partir de las celdas de texto numéricas. */
  function detectDecimal(dataRows, mapping) {
    let comma = 0, dot = 0;
    const cols = ['E', 'P', 'Eb', 'Pb'].map(k => mapping[k]).filter(i => i >= 0);
    for (const r of dataRows) for (const i of cols) {
      const c = r[i]; if (typeof c !== 'string') continue;
      const s = c.trim().replace(/\s/g, '');
      const hasD = s.includes('.'), hasC = s.includes(',');
      if (hasD && hasC) { if (s.lastIndexOf(',') > s.lastIndexOf('.')) comma++; else dot++; }
      else if (hasC) { const p = s.split(','); if (p.length > 2) dot++; else if (p[1].length !== 3) comma++; }
      else if (hasD) { const p = s.split('.'); if (p.length > 2) comma++; else if (p[1].length !== 3) dot++; }
    }
    if (comma === 0 && dot === 0) return null;
    return comma >= dot ? ',' : '.';
  }

  /**
   * Construye filas reales y de presupuesto a partir del análisis y la asignación (posiblemente editada).
   * opts: { decimalSep, projectEnergyUnit, projectProductionUnit, budgetEnergyUnit, budgetProductionUnit, unitsOverride }
   */
  function build(an, mapping, opts) {
    opts = opts || {};
    const dec = opts.decimalSep || an.decimalSep || ',';
    const units = Object.assign({}, an.units, opts.unitsOverride || {});
    const real = [], budget = [], notes = [];
    const val = (r, k) => mapping[k] >= 0 ? r[mapping[k]] : null;
    const toNum = (c) => { if (c == null || c === '') return ''; if (typeof c === 'number') return c; const p = D.parseNumber(c, dec); return p.value != null ? p.value : (p.empty ? '' : String(c)); };
    const uIf = (u, proj) => (u && proj && u !== proj) ? u : '';
    an.dataRows.forEach(r => {
      const mraw = val(r, 'month');
      const month = D.parseMonth(mraw) || (mraw == null ? '' : String(mraw));
      const E = toNum(val(r, 'E')), P = toNum(val(r, 'P'));
      const hasReal = mapping.E >= 0 || mapping.P >= 0;
      if (hasReal && (E !== '' || P !== '')) {
        const row = D.newRealRow(month);
        row.E = E; row.P = P;
        row.eUnit = val(r, 'eUnit') ? String(val(r, 'eUnit')) : uIf(units.E, opts.projectEnergyUnit);
        row.pUnit = val(r, 'pUnit') ? String(val(r, 'pUnit')) : uIf(units.P, opts.projectProductionUnit);
        const per = norm(val(r, 'period'));
        if (/seguim|report|post|despues/.test(per)) row.period = 'seguimiento';
        const nt = val(r, 'note'); if (nt) row.note = String(nt);
        real.push(row);
      }
      const Eb = toNum(val(r, 'Eb')), Pb = toNum(val(r, 'Pb'));
      if ((mapping.Eb >= 0 || mapping.Pb >= 0) && (Eb !== '' || Pb !== '')) {
        const b = D.newBudgetRow(month); b.E = Eb; b.P = Pb;
        b.eUnit = uIf(units.Eb, opts.budgetEnergyUnit || opts.projectEnergyUnit);
        b.pUnit = uIf(units.Pb, opts.budgetProductionUnit || opts.projectProductionUnit);
        budget.push(b);
      }
    });
    Object.keys(units).forEach(k => notes.push(`Unidad detectada en el encabezado de "${FIELDS.find(f => f.key === k).label}": ${U.unitLabel(units[k])}.`));
    return { real, budget, decimalSep: dec, notes };
  }

  const api = { FIELDS, readFile, fromText, analyze, build, detectDecimal, unitFromHeader };
  EA.importer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

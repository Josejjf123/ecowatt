/*
 * xlsx.js — Lectura y escritura mínima de archivos Excel (.xlsx) sin bibliotecas externas.
 *
 * Lectura: descomprime el ZIP (método "deflate" mediante DecompressionStream del navegador o zlib en Node),
 * lee las hojas, las cadenas compartidas y los estilos (para reconocer celdas con formato de fecha).
 * Escritura: genera un ZIP sin compresión (método "store") con hojas, estilos básicos y FÓRMULAS con
 * valores en caché, de modo que un auditor pueda recalcular los resultados directamente en Excel.
 * Limitaciones: no lee archivos .xls antiguos (binarios), protegidos con contraseña ni fórmulas sin caché.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const utf8dec = new TextDecoder('utf-8');
  const utf8enc = new TextEncoder();

  // ---------- ZIP: lectura ----------
  async function defaultInflateRaw(u8) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([u8]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require !== 'undefined') return new Uint8Array(require('zlib').inflateRawSync(u8));
    throw new Error('Este navegador no permite descomprimir archivos .xlsx. Use CSV o un navegador actualizado.');
  }
  async function unzip(buf, inflateRaw) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (no se encontró la estructura ZIP). Si es un .xls antiguo, guárdelo como .xlsx o CSV.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio ZIP dañado.');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = utf8dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    const inflate = inflateRaw || defaultInflateRaw;
    return {
      names: Object.keys(files),
      async read(name) {
        const f = files[name]; if (!f) return null;
        const lnl = dv.getUint16(f.off + 26, true), lel = dv.getUint16(f.off + 28, true);
        const start = f.off + 30 + lnl + lel; const data = u8.subarray(start, start + f.csize);
        if (f.method === 0) return utf8dec.decode(data);
        if (f.method === 8) return utf8dec.decode(await inflate(data));
        throw new Error('Método de compresión no soportado en ' + name);
      }
    };
  }

  // ---------- XML ----------
  function decodeXml(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()];
    });
  }
  function attrs(s) { const o = {}; String(s).replace(/([\w:]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = decodeXml(v); }); return o; }
  function stripNs(xml) { return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1'); }
  function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
  function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function textOf(xml) { let out = ''; xml.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m, t) => { out += decodeXml(t); }); return out; }

  const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  function isDateFormat(code) { const c = String(code).replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase(); return /[dy]/.test(c) || /mmm/.test(c); }
  function serialToISO(serial) { const d = new Date(Math.round((serial - 25569) * 86400000)); return d.toISOString().slice(0, 10); }

  /** Lee un .xlsx y devuelve { sheets: [{ name, rows: [[valor]] }] }. Las fechas se devuelven como 'AAAA-MM-DD'. */
  async function read(buf, inflateRaw) {
    const z = await unzip(buf, inflateRaw);
    const wb = stripNs(await z.read('xl/workbook.xml') || '');
    const rels = stripNs(await z.read('xl/_rels/workbook.xml.rels') || '');
    const relMap = {}; rels.replace(/<Relationship\b([^>]*)\/?>/g, (m, a) => { const o = attrs(a); relMap[o.Id] = o.Target; });
    const sst = []; const sstXml = await z.read('xl/sharedStrings.xml');
    if (sstXml) stripNs(sstXml).replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (m, inner) => { sst.push(textOf(inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))); });
    // Estilos → formatos de fecha
    const dateStyles = new Set(); const stylesXml = await z.read('xl/styles.xml');
    if (stylesXml) {
      const sx = stripNs(stylesXml); const custom = {};
      sx.replace(/<numFmt\b([^>]*)\/?>/g, (m, a) => { const o = attrs(a); custom[o.numFmtId] = o.formatCode; });
      const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(sx);
      if (cx) { let i = 0; cx[1].replace(/<xf\b([^>]*?)(\/>|>)/g, (m, a) => { const id = Number(attrs(a).numFmtId || 0); if (DATE_IDS.has(id) || (custom[id] && isDateFormat(custom[id]))) dateStyles.add(i); i++; }); }
    }
    const sheets = [];
    const sheetDefs = []; wb.replace(/<sheet\b([^>]*)\/?>/g, (m, a) => { const o = attrs(a); sheetDefs.push({ name: o.name, rid: o['r:id'] || o.id }); });
    for (const sd of sheetDefs) {
      let target = relMap[sd.rid] || ''; if (!target) continue;
      target = target.replace(/^\//, ''); if (!target.startsWith('xl/')) target = 'xl/' + target;
      const xml = await z.read(target); if (!xml) continue;
      const sx = stripNs(xml); const rows = [];
      sx.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (m, ra, inner) => {
        const rnum = Number(attrs(ra).r || rows.length + 1) - 1; const row = [];
        if (inner) inner.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mc, ca, ci) => {
          const a = attrs(ca); const ix = a.r ? colIndex(a.r) : row.length; let val = null;
          const vm = ci ? /<v>([\s\S]*?)<\/v>/.exec(ci) : null; const raw = vm ? decodeXml(vm[1]) : null;
          if (a.t === 's') val = raw != null ? sst[Number(raw)] : null;
          else if (a.t === 'inlineStr') val = ci ? textOf(ci) : null;
          else if (a.t === 'str' || a.t === 'e') val = raw;
          else if (a.t === 'b') val = raw === '1';
          else if (raw != null && raw !== '') { const n = Number(raw); val = dateStyles.has(Number(a.s || 0)) && isFinite(n) ? serialToISO(n) : n; }
          row[ix] = val;
        });
        rows[rnum] = row;
      });
      sheets.push({ name: sd.name, rows: Array.from(rows, r => r ? Array.from(r, c => c === undefined ? null : c) : []) });
    }
    return { sheets };
  }

  // ---------- ZIP: escritura (store) ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(entries) {
    const parts = [], central = []; let offset = 0;
    for (const e of entries) {
      const name = utf8enc.encode(e.name), data = typeof e.data === 'string' ? utf8enc.encode(e.data) : e.data;
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length); const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length); const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
      parts.push(lh, data); central.push(ch); offset += lh.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const all = parts.concat(central, [end]); const total = all.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  // ---------- XLSX: escritura ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  // Estilos: 0 normal, 1 encabezado (negrita + fondo), 2 entero con miles, 3 dos decimales, 4 seis decimales, 5 nota (cursiva), 6 título
  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.000000"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEFEA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const STYLE = { normal: 0, header: 1, int: 2, dec2: 3, dec6: 4, note: 5, title: 6 };

  function cellXml(ref, c) {
    if (c == null || c === '') return '';
    if (typeof c !== 'object') c = { v: c };
    const s = c.s != null ? (typeof c.s === 'string' ? STYLE[c.s] : c.s) : (typeof c.v === 'number' ? 0 : 0);
    const sAttr = s ? ` s="${s}"` : '';
    if (c.f) {
      const cached = c.v == null || (typeof c.v === 'number' && !isFinite(c.v)) ? '' : typeof c.v === 'number' ? `<v>${c.v}</v>` : `<v>${esc(c.v)}</v>`;
      return `<c r="${ref}"${sAttr}${typeof c.v === 'string' ? ' t="str"' : ''}><f>${esc(c.f)}</f>${cached}</c>`;
    }
    if (typeof c.v === 'number') return isFinite(c.v) ? `<c r="${ref}"${sAttr}><v>${c.v}</v></c>` : '';
    if (typeof c.v === 'boolean') return `<c r="${ref}"${sAttr} t="b"><v>${c.v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }
  function sheetXml(sh) {
    const cols = sh.colWidths ? `<cols>${sh.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = sh.rows.map((r, ri) => {
      if (!r || !r.length) return '';
      const cells = r.map((c, ci) => cellXml(colName(ci) + (ri + 1), c)).join('');
      return cells ? `<row r="${ri + 1}">${cells}</row>` : '';
    }).join('');
    const pane = sh.freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
  }
  function safeSheetName(n, used) {
    let s = String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Hoja';
    let k = 2; const base = s; while (used.has(s)) s = (base.slice(0, 28) + ' ' + k++);
    used.add(s); return s;
  }
  /** sheets: [{ name, rows: [[celda]], colWidths?, freezeRow? }]; celda: valor | { v, f?, s? }. Devuelve Uint8Array. */
  function write(sheets) {
    const used = new Set();
    const names = sheets.map(s => safeSheetName(s.name, used));
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const entries = [
      { name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels },
      { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: wbRels }, { name: 'xl/styles.xml', data: STYLES_XML }
    ].concat(sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })));
    return zipStore(entries);
  }

  const api = { read, write, unzip, zipStore, crc32, colName, colIndex, STYLE };
  EA.xlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

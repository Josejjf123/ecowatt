// Pruebas de importación (CSV, texto pegado, Excel) y exportación (CSV, Excel con fórmulas, informe).
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { EA } = require('./helpers');
const { csv: CSV, importer: IM, xlsx: X, exporter: EX, report: REP, dataset: D, analysis: A } = EA;

test('CSV: delimitador, comillas y saltos de línea', () => {
  const rows = CSV.parse('Mes;"Consumo; total";Nota\r\n2024-01;"1.234,5";"línea ""a""\nb"\n');
  assert.deepEqual(rows[0], ['Mes', 'Consumo; total', 'Nota']);
  assert.deepEqual(rows[1], ['2024-01', '1.234,5', 'línea "a"\nb']);
  assert.equal(CSV.detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(CSV.detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
});

test('Importador: detecta columnas, unidades del encabezado y separador decimal', () => {
  const text = 'Periodo;Consumo energía (MWh);Producción (toneladas);Consumo presupuestado (MWh);Producción presupuestada (t);Observaciones\n' +
    'ene-2023;484,5;8.172,1;480;8.100\nfeb-2023;474,2;8.348,7;;\n';
  const an = IM.analyze(IM.fromText(text).sheets[0].rows);
  assert.equal(an.headerRow, 0);
  assert.equal(an.mapping.month, 0); assert.equal(an.mapping.E, 1); assert.equal(an.mapping.P, 2);
  assert.equal(an.mapping.Eb, 3); assert.equal(an.mapping.Pb, 4); assert.equal(an.mapping.note, 5);
  assert.equal(an.units.E, 'MWh'); assert.equal(an.units.P, 't');
  assert.equal(an.decimalSep, ',');
  const b = IM.build(an, an.mapping, { projectEnergyUnit: 'kWh', projectProductionUnit: 'kg' });
  assert.equal(b.real.length, 2); assert.equal(b.budget.length, 1);
  assert.equal(b.real[0].month, '2023-01'); assert.equal(b.real[0].E, 484.5); assert.equal(b.real[0].P, 8172.1);
  assert.equal(b.real[0].eUnit, 'MWh'); assert.equal(b.real[0].pUnit, 't');
  // Tras validar, todo queda en las unidades del proyecto
  const p = D.newProject(); p.config.productionUnit = 'kg'; p.real = b.real; p.budget = b.budget;
  const v = D.validateProject(p);
  assert.equal(v.real.usable[0].E, 484500); assert.equal(v.real.usable[0].P, 8172100);
  assert.equal(v.budget.usable[0].E, 480000);
});

test('Importador: datos sin encabezado (pegado desde Excel con tabuladores)', () => {
  const an = IM.analyze(IM.fromText('2023-01\t484455\t8172100\n2023-02\t474504\t8348700').sheets[0].rows);
  assert.equal(an.headerRow, -1);
  const b = IM.build(an, an.mapping, {});
  assert.equal(b.real.length, 2); assert.equal(b.real[1].E, 474504);
});

test('Excel: escritura y lectura (ida y vuelta) con fórmulas, texto y números', async () => {
  const buf = X.write([{ name: 'Datos', rows: [['Mes', 'E', 'P'], ['2024-01', 100.5, 10], ['2024-02', 200, 20], [null, { f: 'SUM(B2:B3)', v: 300.5 }]] }, { name: 'Otra & más', rows: [['ñandú "x" <y>']] }]);
  const wb = await X.read(buf);
  assert.equal(wb.sheets.length, 2);
  assert.deepEqual(wb.sheets[0].rows[1], ['2024-01', 100.5, 10]);
  assert.equal(wb.sheets[0].rows[3][1], 300.5); // valor en caché de la fórmula
  assert.equal(wb.sheets[1].name, 'Otra & más');
  assert.equal(wb.sheets[1].rows[0][0], 'ñandú "x" <y>');
});

// Construye un .xlsx comprimido (deflate) como lo guarda Excel, con cadenas compartidas y fechas
function deflatedXlsx() {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<?xml version="1.0"?><sst><si><t>Fecha</t></si><si><r><t>Consumo </t></r><r><t>(kWh)</t></r></si><si><t>Producción (L)</t></si></sst>',
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet><numFmts count="1"><numFmt numFmtId="165" formatCode="mmm\\-yy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" s="1"><v>44927</v></c><c r="B2"><v>484455</v></c><c r="C2"><v>8172100</v></c></row><row r="4"><c r="A4" s="1"><v>44958</v></c><c r="C4"><v>8348700</v></c></row></sheetData></worksheet>'
  };
  // Reutiliza el escritor "store" y luego reemplaza los datos por su versión comprimida
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  for (const [name, txt] of Object.entries(files)) {
    const raw = enc.encode(txt), comp = zlib.deflateRawSync(raw), nb = enc.encode(name), crc = X.crc32(raw);
    const lh = Buffer.alloc(30 + nb.length); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26); Buffer.from(nb).copy(lh, 30);
    const ch = Buffer.alloc(46 + nb.length); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42); Buffer.from(nb).copy(ch, 46);
    parts.push(lh, comp); central.push(ch); off += lh.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat(parts.concat([cd, end])));
}

test('Excel: lectura de archivo comprimido con cadenas compartidas, fechas y celdas vacías', async () => {
  const wb = await X.read(deflatedXlsx(), async u8 => new Uint8Array(zlib.inflateRawSync(u8)));
  const rows = wb.sheets[0].rows;
  assert.deepEqual(rows[0], ['Fecha', 'Consumo (kWh)', 'Producción (L)']);
  assert.equal(rows[1][0], '2023-01-01'); // número de serie con formato de fecha → fecha
  assert.equal(rows[3][1], null);         // celda vacía permanece vacía
  const an = IM.analyze(rows); const b = IM.build(an, an.mapping, { projectEnergyUnit: 'kWh', projectProductionUnit: 'L' });
  assert.equal(b.real.length, 2);
  assert.equal(b.real[1].month, '2023-02'); assert.equal(b.real[1].E, '');
});

test('Exportación: CSV reimportable, libro con fórmulas de verificación e informe completo', async () => {
  const p = EA.demo.build('36'); const R = A.runAnalysis(p);
  // CSV de datos → importar → mismos resultados
  const csv = EX.dataCSV(p);
  const an = IM.analyze(CSV.parse(csv)); const b = IM.build(an, an.mapping, { projectEnergyUnit: 'kWh', projectProductionUnit: 'L' });
  const p2 = D.newProject(); p2.real = b.real; p2.budget = b.budget;
  const R2 = A.runAnalysis(p2);
  assert.equal(R2.counts.followup, 12);
  assert.ok(Math.abs(R2.baseline.model.slope - R.baseline.model.slope) < 1e-12);
  assert.ok(Math.abs(R2.budget.totals.dE - R.budget.totals.dE) < 1e-6);
  // Excel
  const wbBuf = EX.workbook(p, R);
  const wb = await X.read(wbBuf);
  const names = wb.sheets.map(s => s.name);
  ['Resumen', 'Datos reales', 'Presupuesto', 'Verificación línea base', 'Verificación línea meta', 'Resultados mensuales', 'Advertencias'].forEach(n => assert.ok(names.includes(n), n));
  const xml = new TextDecoder().decode(wbBuf);
  assert.match(xml, /<f>SLOPE\(C2:C24,B2:B24\)<\/f>/); // 23 meses base → filas 2..24
  assert.match(xml, /TDIST\(ABS\(K8\),K6-2,2\)/);
  const ver = wb.sheets.find(s => s.name === 'Verificación línea base').rows;
  assert.ok(Math.abs(ver[1][10] - R.baseline.model.slope) < 1e-12);
  // Informe
  const html = REP.build(p, R);
  ['Resumen ejecutivo', 'Datos de entrada y unidades', 'Línea base energética', 'Línea meta energética', 'Indicadores base 100', 'presupuesto', 'Oportunidades de mejora', 'Metodología y fórmulas', 'Limitaciones', 'no constituye una certificación'].forEach(s => assert.ok(html.includes(s), s));
  assert.ok(!/undefined|NaN/.test(html.replace(/data-tip="[^"]*"/g, '')));
});

// Genera los archivos de ejemplo de la carpeta /data a partir de los datos de demostración.
// Uso: node tools/generar_ejemplos.js
const fs = require('fs');
const path = require('path');
const { EA } = require('../tests/helpers');
const out = path.join(__dirname, '..', 'data');
fs.mkdirSync(out, { recursive: true });
const files = {
  '17': 'ejemplo_17_meses.csv',
  '24': 'ejemplo_24_meses_con_presupuesto.csv',
  '36': 'ejemplo_36_meses_base_y_seguimiento.csv'
};
for (const [k, name] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), EA.exporter.dataCSV(EA.demo.build(k)), 'utf8');
}
// Versión Excel del ejemplo de 24 meses (con encabezados y unidades)
const p = EA.demo.build('24');
const rows = [['Mes', 'Consumo real (kWh)', 'Producción real (L)', 'Consumo presupuestado (kWh)', 'Producción presupuestada (L)']];
p.real.forEach((r, i) => rows.push([r.month, r.E, r.P, p.budget[i].E, p.budget[i].P]));
fs.writeFileSync(path.join(out, 'ejemplo_24_meses_con_presupuesto.xlsx'), EA.xlsx.write([{ name: 'Datos', rows, colWidths: [10, 20, 20, 26, 26] }]));
console.log('Ejemplos generados en', out);

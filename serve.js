/*
 * serve.js — Servidor estático mínimo (opcional). La aplicación también funciona abriendo index.html directamente.
 * Uso: node serve.js [puerto]   → http://localhost:8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.md': 'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Aplicación disponible en http://localhost:${port}`));

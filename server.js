// Server statis sederhana (tanpa dependensi) untuk STB.
// Jalankan: node server.js   -> buka http://IP-STB:4555
// Hanya file situs yang disajikan; file bot (auth/, state.json, bot.js, dll) TIDAK bisa diakses.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 4555, DIR = __dirname;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
// file yang tidak boleh disajikan walau ekstensinya diizinkan
const blockedFiles = new Set(['bot.js', 'server.js', 'state.json', 'package.json', 'package-lock.json']);
const blockedDirs = new Set(['auth', 'node_modules']);

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return { code: 400 }; }
  if (p.includes('\0')) return { code: 400 };
  if (p === '/') p = '/index.html';
  const f = path.resolve(DIR, '.' + path.normalize('/' + p));
  if (f !== DIR && !f.startsWith(DIR + path.sep)) return { code: 403 };
  const parts = path.relative(DIR, f).split(path.sep);
  if (parts.some(x => x.startsWith('.'))) return { code: 404 };                 // file/folder tersembunyi
  if (parts.length > 1 && blockedDirs.has(parts[0])) return { code: 404 };      // auth/, node_modules/
  if (blockedFiles.has(parts[parts.length - 1])) return { code: 404 };
  if (!types[path.extname(f).toLowerCase()]) return { code: 404 };             // hanya ekstensi situs
  return { file: f };
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  const r = resolveFile(req.url.split('?')[0]);
  if (!r.file) { res.writeHead(r.code, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(r.code === 400 ? 'Bad request' : r.code === 403 ? 'Forbidden' : 'Not found'); }
  fs.readFile(r.file, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(r.file).toLowerCase()], 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : d);
  });
}).listen(PORT, '0.0.0.0', () => console.log('NekoStream jalan di port ' + PORT));

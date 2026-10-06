import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../backend/server.mjs';
const root = fileURLToPath(new URL('../frontend/', import.meta.url));
const apiPort = Number(process.env.PORT || 3001);
const webPort = Number(process.env.WEB_PORT || 5173);
const api = createServer();
api.listen(apiPort, '127.0.0.1');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const web = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const proxy = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end('API unavailable'); });
    req.pipe(proxy);
    return;
  }
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep) && !file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
web.listen(webPort, '127.0.0.1', () => console.log(`官网预览：http://localhost:${webPort}\n独立后端：http://127.0.0.1:${apiPort}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { web.close(); api.close(); });

import http from 'node:http';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const defaultData = fileURLToPath(new URL('./data/', import.meta.url));
const products = ['IC Tray / 半导体托盘', 'PPE 材质托盘', 'MPPO 等材质托盘', '其他 / 待确认'];
export function createServer({ dataDir = process.env.DATA_DIR || defaultData, adminToken = process.env.ADMIN_TOKEN || '', allowedOrigin = process.env.ALLOWED_ORIGIN || '', trustProxy = process.env.TRUST_PROXY === '1' } = {}) {
  const requests = new Map();
  const file = resolve(dataDir, 'inquiries.jsonl');
  function send(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.headers.origin && allowedOrigin && req.headers.origin !== allowedOrigin) return send(res, 403, { error: '不允许的请求来源' });
      if (allowedOrigin && req.headers.origin === allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
        return res.end();
      }
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
      if (path === '/api/inquiries' && req.method === 'GET') {
        const supplied = Buffer.from(req.headers.authorization || '');
        const expected = Buffer.from(`Bearer ${adminToken}`);
        if (!adminToken || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(res, 401, { error: '需要管理员身份验证' });
        let content = '';
        try { content = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        return send(res, 200, { inquiries: content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).reverse() });
      }
      if (path !== '/api/inquiries' || req.method !== 'POST') return send(res, 404, { error: '接口不存在' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: '请使用 JSON 格式提交' });
      const now = Date.now();
      for (const [key, value] of requests) if (now - value.start > 600000) requests.delete(key);
      const ip = trustProxy ? (req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
      const bucket = requests.get(ip) || { start: now, count: 0 };
      bucket.count++;
      requests.set(ip, bucket);
      if (bucket.count > 10) { res.setHeader('Retry-After', '600'); return send(res, 429, { error: '提交过于频繁，请稍后再试或电话咨询。' }); }
      let raw = '';
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) return send(res, 413, { error: '提交内容过大' });
        raw += chunk.toString();
      }
      let data;
      try { data = JSON.parse(raw); } catch { return send(res, 400, { error: '提交格式不正确' }); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: '提交格式不正确' });
      if (data.website) return send(res, 400, { error: '提交未通过验证' });
      const text = key => typeof data[key] === 'string' ? data[key].trim() : '';
      const name = text('name'), phone = text('phone'), product = text('product'), quantity = text('quantity'), message = text('message');
      if (!name || name.length > 50 || !/^[+\d\s()-]{6,30}$/.test(phone) || !products.includes(product) || quantity.length > 80 || !message || message.length > 2000 || data.consent !== true) {
        return send(res, 400, { error: '请检查称呼、联系电话、来料信息，并同意隐私说明。' });
      }
      const inquiry = { id: randomUUID(), createdAt: new Date().toISOString(), name, phone, product, quantity, message, consent: true };
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await appendFile(file, `${JSON.stringify(inquiry)}\n`, { mode: 0o600 });
      return send(res, 201, { success: true, id: inquiry.id });
    } catch (error) {
      console.error('API error:', error.message);
      if (!res.headersSent) send(res, 500, { error: '服务暂时不可用，请直接拨打13510713508。' });
      else res.end();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const server = createServer();
  server.requestTimeout = 20000;
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`API running at http://127.0.0.1:${port}`));
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.mjs';

test('询价验证、持久化、管理员权限、来源限制及频率限制', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'pcx-test-'));
  const server = createServer({ dataDir, adminToken: 'test-secret', allowedOrigin: 'https://example.com' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { name: '测试客户', phone: '13510713508', product: 'PPE 材质托盘', quantity: '5000', message: '测试来料信息', consent: true };
  const post = (data, origin) => fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await post(body, 'https://evil.example')).status, 403);
    assert.equal((await post({ ...body, consent: false })).status, 400);
    assert.equal((await post({ ...body, phone: 'not-phone' })).status, 400);
    assert.equal((await post({ ...body, website: 'spam' })).status, 400);
    const saved = await post(body);
    assert.equal(saved.status, 201);
    assert.ok((await saved.json()).id);
    assert.equal((await fetch(`${base}/api/inquiries`)).status, 401);
    const list = await fetch(`${base}/api/inquiries`, { headers: { Authorization: 'Bearer test-secret' } });
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.equal(data.inquiries.length, 1);
    assert.equal(data.inquiries[0].name, body.name);
    for (let i = 0; i < 6; i++) assert.equal((await post(body)).status, 201);
    assert.equal((await post(body)).status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});

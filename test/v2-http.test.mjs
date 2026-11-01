import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fairCreateServer } from '../src/server.mjs';
import { ProductionStore } from '../studio-v2/jobs.mjs';

// Exercise the real validation/persistence store while keeping rendering outside HTTP tests.
class QueuedFixtureStore extends ProductionStore { pump() {} }
let root, store, server, port, completed, running;
const bytes = Buffer.from('0123456789abcdef');
const brief = { prompt: 'Explain how equivalent fractions work with equal-sized bars.', mode: 'learning', format: 'landscape', durationSeconds: 30, style: 'playful' };
function http(path, { method = 'GET', headers = {}, json } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: { ...(json === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('V2 HTTP fixture request timed out.')));
    req.end(json === undefined ? undefined : JSON.stringify(json));
  });
}
const data = response => JSON.parse(response.body);
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'studio-v2-http-'));
  store = new QueuedFixtureStore(root, { env: {}, run: async () => { throw new Error('HTTP tests must not generate video.'); } });
  await store.init();
  for (const status of ['completed', 'running']) {
    const job = { id: randomUUID(), brief, status, stage: status, progress: status === 'completed' ? 100 : 20, createdAt: new Date().toISOString(), events: [] };
    store.jobs.set(job.id, job);
    await store.update(job, {});
    await mkdir(join(store.directory(job.id), 'project'), { recursive: true });
    if (status === 'completed') completed = job.id; else running = job.id;
  }
  await writeFile(join(store.directory(completed), 'project', 'final.mp4'), bytes);
  await writeFile(join(root, 'private.txt'), 'fixture private contents');
  await symlink(join(root, 'private.txt'), join(store.directory(completed), 'project', 'transcript.txt'));
  server = fairCreateServer({}, { env: {}, v2Store: store });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await store?.stop();
  if (root) await rm(root, { recursive: true, force: true });
});

test('V2 creation requires idempotency and replay returns exactly one persisted job', async () => {
  const initial = store.list().length;
  for (const key of [undefined, 'short']) {
    const response = await http('/api/v2/jobs', { method: 'POST', headers: key ? { 'idempotency-key': key } : {}, json: brief });
    assert.equal(response.status, 400);
    assert.match(data(response).error, /Idempotency-Key/);
  }
  assert.equal(store.list().length, initial);
  const key = randomUUID();
  const options = { method: 'POST', headers: { 'idempotency-key': key }, json: brief };
  const first = await http('/api/v2/jobs', options), second = await http('/api/v2/jobs', options);
  assert.equal(first.status, 202); assert.equal(second.status, 202);
  assert.equal(data(first).job.id, data(second).job.id);
  assert.equal(store.list().length, initial + 1);
  const conflict = await http('/api/v2/jobs', { ...options, json: { ...brief, format: 'portrait' } });
  assert.equal(conflict.status, 409);
  assert.equal(store.list().length, initial + 1);
});

test('V2 list and status expose valid records and unknown productions return 404', async () => {
  const list = await http('/api/v2/jobs');
  assert.equal(list.status, 200);
  assert.ok(data(list).jobs.some(job => job.id === completed && job.status === 'completed'));
  const status = await http(`/api/v2/jobs/${running}`);
  assert.equal(status.status, 200); assert.equal(data(status).job.status, 'running');
  for (const id of [randomUUID(), 'not-a-job']) assert.equal((await http(`/api/v2/jobs/${id}`)).status, 404);
});

test('V2 MP4 streaming supports full, partial, suffix, HEAD and unsatisfiable requests', async () => {
  const path = `/api/v2/jobs/${completed}/artifacts/video`;
  const full = await http(path);
  assert.equal(full.status, 200); assert.deepEqual(full.body, bytes);
  assert.equal(full.headers['content-type'], 'video/mp4');
  assert.equal(full.headers['accept-ranges'], 'bytes');
  const part = await http(path, { headers: { range: 'bytes=2-6' } });
  assert.equal(part.status, 206); assert.equal(part.body.toString(), '23456');
  assert.equal(part.headers['content-range'], 'bytes 2-6/16'); assert.equal(part.headers['content-length'], '5');
  const suffix = await http(path, { headers: { range: 'bytes=-4' } });
  assert.equal(suffix.status, 206); assert.equal(suffix.body.toString(), 'cdef');
  const head = await http(path, { method: 'HEAD', headers: { range: 'bytes=2-6' } });
  assert.equal(head.status, 206); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], '5');
  for (const range of ['bytes=16-', 'bytes=9-2', 'bytes=0-1,3-4']) {
    const invalid = await http(path, { headers: { range } });
    assert.equal(invalid.status, 416); assert.equal(invalid.headers['content-range'], 'bytes */16');
  }
});

test('V2 artifact allowlist, traversal and symlink containment prevent private file reads', async () => {
  for (const kind of ['private.txt', '%2e%2e%2fprivate.txt', '..%2f..%2fprivate.txt', 'video/extra']) {
    const response = await http(`/api/v2/jobs/${completed}/artifacts/${kind}`);
    assert.ok([404, 405].includes(response.status), `${kind}: ${response.status}`);
    assert.doesNotMatch(response.body.toString(), /fixture private contents/);
  }
  const outside = await http(`/api/v2/jobs/${completed}/artifacts/transcript`);
  assert.equal(outside.status, 403); assert.doesNotMatch(outside.body.toString(), /fixture private contents/);
  assert.equal((await http(`/api/v2/jobs/${completed}/artifacts/thumbnail`)).status, 404);
});

test('V2 review is completed-only and validates the explicit decision', async () => {
  const rejected = await http(`/api/v2/jobs/${running}/review`, { method: 'POST', json: { decision: 'approved' } });
  assert.equal(rejected.status, 409); assert.equal(store.get(running).review, undefined);
  const malformed = await http(`/api/v2/jobs/${completed}/review`, { method: 'POST', json: { decision: 'anything' } });
  assert.equal(malformed.status, 400); assert.equal(store.get(completed).review, undefined);
  const accepted = await http(`/api/v2/jobs/${completed}/review`, { method: 'POST', json: { decision: 'needs-changes', note: 'Explain the second step more slowly.' } });
  assert.equal(accepted.status, 200); assert.equal(data(accepted).job.review.decision, 'needs-changes');
  assert.equal(data(await http(`/api/v2/jobs/${completed}`)).job.review.note, 'Explain the second step more slowly.');
});

test('V2 cross-origin mutations are rejected before create, review, cancel or retry', async () => {
  const snapshot = JSON.stringify(store.list());
  for (const headers of [{ origin: 'https://foreign.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    for (const [path, json] of [['/api/v2/jobs', brief], [`/api/v2/jobs/${completed}/review`, { decision: 'approved' }], [`/api/v2/jobs/${running}/cancel`, {}], [`/api/v2/jobs/${running}/retry`, {}]]) {
      assert.equal((await http(path, { method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, json })).status, 403);
    }
  }
  assert.equal(JSON.stringify(store.list()), snapshot);
  assert.equal((await http('/api/v2/jobs', { headers: { origin: `http://127.0.0.1:${port}` } })).status, 200);
});

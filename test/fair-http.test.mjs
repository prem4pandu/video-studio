import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { FairJobStore } from '../src/fair-jobs.mjs';
import { fairCreateServer, fairServerConfig } from '../src/fair-server.mjs';

let root, store, server, port, completed, unfinished;
const videoBytes = Buffer.from('0123456789abcdef');

function http(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP fixture request timed out.')));
    req.end(body);
  });
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'fair-http-test-'));
  store = new FairJobStore(root, { env: {}, run: async () => { throw new Error('HTTP tests must not invoke generation.'); } });
  await store.init();
  for (const status of ['completed', 'running']) {
    const id = randomUUID();
    const job = { id, status, brief: { text: 'Teach place value to primary learners.', provider: 'local' }, createdAt: new Date().toISOString() };
    store.jobs.set(id, job);
    await store.save(job);
    const project = join(store.directory(id), 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'lesson.mp4'), videoBytes);
    await writeFile(join(project, 'index.html'), '<!doctype html><title>HTTP test composition</title>');
    if (status === 'completed') completed = id; else unfinished = id;
  }
  await writeFile(join(root, 'outside-secret.txt'), 'must not be served');
  await symlink(join(root, 'outside-secret.txt'), join(store.directory(completed), 'project', 'transcript.txt'));
  server = fairCreateServer(store, { env: {} });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (store) await store.stop();
  if (root) await rm(root, { recursive: true, force: true });
});

test('bulk requests are rejected before creating any jobs', async () => {
  const count = store.list().length;
  for (const input of [{ all: true }, { unitId: 's5-place-value' }, { topicIds: ['s5-pv-rounding', 's5-sp-likelihood'] }]) {
    const response = await http('/api/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 409);
    assert.match(JSON.parse(response.body).error, /Bulk generation is paused/);
    assert.equal(store.list().length, count);
  }
});

test('cross-site top-level navigation serves the studio with browser security headers', async () => {
  const response = await http('/', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.match(response.body.toString(), /Video Studio/);
  assert.match(response.body.toString(), /\/app\/assets\/studio\.js/);
  const bundle = await http('/app/assets/studio.js');
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers['content-type'], /^text\/javascript/);
  assert.match(bundle.body.toString(), /Create a lesson film/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('UI decision templates and their local assets are served without weakening CSP', async () => {
  const [page, styles, script] = await Promise.all([
    http('/ui-templates.html'),
    http('/ui-templates.css'),
    http('/ui-templates.mjs'),
  ]);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.body.toString(), /Production console/);
  assert.match(page.body.toString(), /Storyboard canvas/);
  assert.match(page.body.toString(), /Guided studio/);
  assert.equal(styles.status, 200);
  assert.match(styles.headers['content-type'], /^text\/css/);
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  assert.match(page.headers['content-security-policy'], /style-src 'self'/);
});

test('cross-site API reads and writes are denied before any work starts', async () => {
  const initialJobs = store.list().length;
  for (const path of ['/api/config', '/api/jobs']) {
    const response = await http(path, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(response.status, 403);
  }
  const response = await http('/api/jobs', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Teach place value to primary learners.' }) });
  assert.equal(response.status, 403);
  assert.equal(store.list().length, initialJobs);
  assert.equal(store.active, null);
  assert.deepEqual(store.queue, []);
});

test('foreign Origin and unknown Host are rejected, including static navigation', async () => {
  assert.equal((await http('/api/jobs', { headers: { origin: 'https://example.test' } })).status, 403);
  assert.equal((await http('/', { headers: { host: 'example.test', 'sec-fetch-mode': 'navigate' } })).status, 403);
  assert.equal((await http('/api/jobs', { headers: { host: '127.0.0.1.example.test' } })).status, 403);
  assert.equal((await http('/api/jobs', { headers: { origin: `http://127.0.0.1:${port}` } })).status, 200);
});

test('oversized JSON requests are rejected without creating a job', async () => {
  const initialJobs = store.list().length;
  const response = await http('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(25_000) }) });
  assert.equal(response.status, 413);
  assert.match(JSON.parse(response.body).error, /too large/i);
  assert.equal(store.list().length, initialJobs);
});

test('encoded traversal and artifact symlinks cannot expose files outside the project', async () => {
  for (const path of [
    '/api/jobs/%2e%2e%2foutside-secret.txt',
    `/api/jobs/${completed}/artifacts/%2e%2e%2foutside-secret.txt`,
    `/api/jobs/${completed}/artifacts/..%2f..%2foutside-secret.txt`,
    '/%2e%2e%2foutside-secret.txt',
  ]) {
    const response = await http(path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body.toString(), /must not be served/);
  }
  const symlinkResponse = await http(`/api/jobs/${completed}/artifacts/transcript`);
  assert.equal(symlinkResponse.status, 403);
  assert.doesNotMatch(symlinkResponse.body.toString(), /must not be served/);
});

test('completed artifacts support exact GET and HEAD metadata without a HEAD body', async () => {
  const path = `/api/jobs/${completed}/artifacts/video`;
  const get = await http(path);
  const head = await http(path, { method: 'HEAD' });
  assert.equal(get.status, 200);
  assert.deepEqual(get.body, videoBytes);
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  for (const key of ['content-length', 'content-type', 'accept-ranges', 'cache-control']) assert.equal(head.headers[key], get.headers[key]);
  assert.equal(head.headers['content-length'], String(videoBytes.length));
  assert.equal(head.headers['content-type'], 'video/mp4');
  assert.equal(head.headers['accept-ranges'], 'bytes');
  assert.equal(head.headers['cache-control'], 'no-store');
  const composition = await http(`/api/jobs/${completed}/artifacts/composition`);
  assert.equal(composition.status, 200);
  assert.equal(composition.headers['content-disposition'], 'attachment; filename="composition.html"');
});

test('byte ranges and HEAD ranges return correct bytes, sizes, and unsatisfiable responses', async () => {
  const path = `/api/jobs/${completed}/artifacts/video`;
  const partial = await http(path, { headers: { range: 'bytes=2-6' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.body.toString(), '23456');
  assert.equal(partial.headers['content-range'], 'bytes 2-6/16');
  assert.equal(partial.headers['content-length'], '5');
  const suffix = await http(path, { headers: { range: 'bytes=-4' } });
  assert.equal(suffix.status, 206);
  assert.equal(suffix.body.toString(), 'cdef');
  assert.equal(suffix.headers['content-range'], 'bytes 12-15/16');
  const head = await http(path, { method: 'HEAD', headers: { range: 'bytes=2-6' } });
  assert.equal(head.status, 206);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-range'], 'bytes 2-6/16');
  assert.equal(head.headers['content-length'], '5');
  for (const range of ['bytes=16-', 'bytes=9-2', 'bytes=0-1,3-4']) {
    const response = await http(path, { headers: { range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers['content-range'], 'bytes */16');
    assert.equal(response.body.length, 0);
  }
});

test('unfinished artifacts are unavailable even when bytes already exist on disk', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await http(`/api/jobs/${unfinished}/artifacts/video`, { method });
    assert.equal(response.status, 404);
    assert.notDeepEqual(response.body, videoBytes);
  }
});

test('open-source artifacts download trusted Python source and render metadata without exposing other paths', async () => {
  const id = randomUUID();
  const job = { id, status: 'completed', brief: { text: 'Teach place value to primary learners.', generationVersion: 'open-source', provider: 'local' }, createdAt: new Date().toISOString() };
  store.jobs.set(id, job);
  const project = join(store.directory(id), 'project');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'fair-manim-scene.py'), '# unit-test source, not executed');
  await writeFile(join(project, 'fair-render-plan.json'), '{"fixture":true}');
  await writeFile(join(project, 'wan-provenance.json'), '{"fixture":true}');
  const source = await http(`/api/jobs/${id}/artifacts/composition`);
  assert.equal(source.status, 200);
  assert.equal(source.headers['content-disposition'], 'attachment; filename="fair-manim-scene.py"');
  for (const kind of ['renderPlan', 'footage']) {
    assert.equal((await http(`/api/jobs/${id}/artifacts/${kind}`)).status, 200);
    assert.equal((await http(`/api/jobs/${completed}/artifacts/${kind}`)).status, 404);
  }
});

test('open-source creation rejects paid planning and voices at the HTTP boundary', async () => {
  const initialJobs = store.list().length;
  for (const patch of [{ provider: 'openai' }, { voiceProvider: 'elevenlabs' }, { voiceProvider: 'openai' }]) {
    const response = await http('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Teach place value to primary learners.', generationVersion: 'open-source', ...patch }) });
    assert.equal(response.status, 400);
  }
  assert.equal(store.list().length, initialJobs);
});

test('only allowlisted mascot and genuine voice sample assets are served with correct MIME and audio seeking', async () => {
  const image = await http('/assets/fair-pip-sprites.png', { method: 'HEAD' });
  assert.equal(image.status, 200); assert.equal(image.headers['content-type'], 'image/png');
  const audio = await http('/assets/fair-voice-sample.wav', { headers: { range: 'bytes=0-11' } });
  assert.equal(audio.status, 206); assert.equal(audio.headers['content-type'], 'audio/wav');
  assert.equal(audio.body.toString('ascii', 0, 4), 'RIFF'); assert.equal(audio.body.toString('ascii', 8, 12), 'WAVE');
  for (const path of ['/assets/.env', '/assets/../.env', '/assets/%2e%2e%2f.env', '/assets/fair-indian-english.onnx']) assert.equal((await http(path)).status, 404);
});

test('planning remains available when local voice dependencies are missing; paid voice credentials stay private', async () => {
  const value = await fairServerConfig({ OPENAI_API_KEY: 'fixture-openai-secret', ELEVENLABS_API_KEY: 'fixture-eleven-secret' }, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'gemma3:12b' }] }) }),
    command: async () => ({ stdout: '', stderr: '' }), fileStat: async () => { throw new Error('Fixture files absent'); },
  });
  assert.equal(value.providers.find(option => option.id === 'local').available, true);
  assert.equal(value.defaults.voiceProvider, 'say');
  assert.equal(value.capabilities.narration.available, true);
  assert.equal(value.voiceOptions.find(option => option.id === 'qwentts').available, false);
  assert.equal(value.voiceOptions.find(option => option.id === 'piper').available, false);
  assert.equal(value.voiceOptions.find(option => option.id === 'kokoro').available, false);
  assert.equal(value.voiceOptions.find(option => option.id === 'openai').available, true);
  assert.equal(value.voiceOptions.find(option => option.id === 'elevenlabs').available, false);
  assert.doesNotMatch(JSON.stringify(value), /fixture-openai-secret|fixture-eleven-secret/);
});

test('local neural availability checks files and Python runtime; premium configuration requires a selected voice', async () => {
  const imports = [];
  const value = await fairServerConfig({ FAIR_TTS_PROVIDER: 'piper', ELEVENLABS_API_KEY: 'fixture-key', FAIR_ELEVENLABS_VOICE_ID: 'fixture-voice' }, {
    fetchImpl: async () => { throw new Error('Fixture Ollama unavailable'); },
    command: async (_, args) => { if (args[0] === '-c') { imports.push(args[1]); if (args[1].includes('kokoro_onnx')) throw new Error('Fixture missing module'); } return { stdout: '', stderr: '' }; },
    fileStat: async () => ({ isFile: () => true, size: 123 }),
  });
  assert.equal(value.providers.find(option => option.id === 'local').available, false);
  assert.equal(value.voiceOptions.find(option => option.id === 'piper').available, true);
  assert.equal(value.voiceOptions.find(option => option.id === 'piper').sampleUrl, '/assets/fair-voice-sample.wav');
  assert.equal(value.voiceOptions.find(option => option.id === 'kokoro').available, false);
  assert.equal(value.voiceOptions.find(option => option.id === 'elevenlabs').available, true);
  assert.equal(value.capabilities.narration.available, true);
  assert.ok(imports.some(text => text.includes('piper')));
  assert.ok(imports.some(text => text.includes('kokoro_onnx')));
});

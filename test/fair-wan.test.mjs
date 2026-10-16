import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fairGenerateWanClip, fairWanReadiness, fairWanWorkflow } from '../src/fair-wan.mjs';
import { fairHash } from '../src/fair-utils.mjs';

const test = (name, run) => nodeTest(name, { timeout: 15_000 }, run);
const fairModernFormat = ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'mp4', inputs: { required: { codec: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'h264', inputs: { required: {} } }] }] } } }] }];

const fairMp4Fixture = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12), Buffer.from('moov'), Buffer.alloc(12), Buffer.from('mdat'), Buffer.alloc(20)]);

async function fairWorker(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fair-wan-'));
  const calls = []; let submitted, removed = false;
  const info = {};
  for (const node of Object.values(fairWanWorkflow({ env: {} }))) info[node.class_type] = { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ['STRING']])) } };
  info.UNETLoader.input.required.unet_name = [['wan2.2_ti2v_5B_fp16.safetensors']];
  info.CLIPLoader.input.required.clip_name = [['umt5_xxl_fp16.safetensors']];
  info.VAELoader.input.required.vae_name = [['wan2.2_vae.safetensors']];
  info.SaveVideo.input.required.format = [['mp4', 'auto']];
  if (options.missing) delete info[options.missing];
  if (options.modern) { info.SaveVideo.input.required.format = fairModernFormat; delete info.SaveVideo.input.required.codec; }
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const call = { path: request.url, method: request.method, body: body ? JSON.parse(body) : undefined }; calls.push(call);
    const json = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
    if (request.url === '/object_info') return json(info);
    if (request.url === '/prompt') {
      submitted = call.body.prompt;
      removed = false;
      options.onSubmit?.();
      if (options.badRequest) { response.statusCode = 400; return json({ error: 'invalid workflow' }); }
      return json(options.rejected ? { error: 'bad', node_errors: { '8': ['bad'] } } : { prompt_id: 'fair-test-job', node_errors: {} });
    }
    if (request.url === '/history/fair-test-job') {
      if (options.wait) { options.onPoll?.(); return json({}); }
      return json({ 'fair-test-job': { status: { completed: !options.failed, status_str: options.failed ? 'error' : 'success' }, outputs: { '11': { images: [{ filename: options.filename || `${submitted['11'].inputs.filename_prefix.split('/').at(-1)}_00001_.mp4`, subfolder: options.subfolder || 'fair', type: 'output' }] } } } });
    }
    if (request.url.startsWith('/view?')) {
      if (options.redirect) { response.writeHead(302, { location: 'https://example.com/' }); return response.end(); }
      if (options.oversized) response.setHeader('content-length', 300 * 1024 * 1024);
      return response.end(options.bytes || fairMp4Fixture);
    }
    if (request.url === '/queue') {
      if (request.method === 'POST') removed = true;
      return json({ queue_running: [], queue_pending: options.pending && !removed ? [[1, 'fair-test-job']] : [] });
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { force: true, recursive: true }); });
  const env = { FAIR_COMFYUI_URL: `http://127.0.0.1:${server.address().port}` };
  return { directory, env, calls, info, submitted: () => submitted };
}

test('Wan worker validates models, submits native API graph, downloads and reuses verified clip', async t => {
  const worker = await fairWorker(t);
  assert.equal((await fairWanReadiness({ env: worker.env })).available, true);
  const result = await fairGenerateWanClip({ ...worker, prompt: 'A friendly robot enters a classroom.', pollMs: 1 });
  assert.deepEqual(await readFile(result.file), fairMp4Fixture);
  assert.equal(result.provenance.modelLicense, 'Apache-2.0');
  const graph = worker.submitted();
  assert.equal(graph['7'].inputs.length, 41);
  assert.equal(graph['8'].inputs.sampler_name, 'euler');
  assert.equal(graph['11'].inputs.format, 'mp4');
  assert.equal(graph['4'].inputs.text, 'A friendly robot enters a classroom.');
  const cached = await fairGenerateWanClip({ ...worker, prompt: 'A friendly robot enters a classroom.' });
  assert.equal(cached.cached, true);
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 1);
  await writeFile(result.file, 'tampered');
  const repaired = await fairGenerateWanClip({ ...worker, prompt: 'A friendly robot enters a classroom.' });
  assert.equal(repaired.cached, false);
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 1);
});

test('Wan adapts built-in SaveVideo dynamic combo interface', async t => {
  const worker = await fairWorker(t, { modern: true });
  await fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' });
  assert.equal(worker.submitted()['11'].inputs.format, 'mp4');
  assert.equal(worker.submitted()['11'].inputs['format.codec'], 'h264');
});

test('Wan readiness reports missing nodes and model filenames without queueing', async t => {
  const worker = await fairWorker(t, { missing: 'Wan22ImageToVideoLatent' });
  assert.match((await fairWanReadiness({ env: worker.env })).detail, /missing.*Wan22/);
  const other = await fairWorker(t);
  const readiness = await fairWanReadiness({ env: { ...other.env, FAIR_WAN_MODEL: 'missing.safetensors' } });
  assert.equal(readiness.available, false);
  assert.match(readiness.detail, /missing configured value/);
  assert.equal(other.calls.some(call => call.path === '/prompt'), false);
});

test('Wan rejects external endpoints, credentials, custom workflows, and traversal model paths', async () => {
  for (const FAIR_COMFYUI_URL of ['https://example.com', 'http://localhost:8188', 'http://127.0.0.1:8188/path', 'http://x:y@127.0.0.1:8188', 'http://127.0.0.1:8188/?x=1']) {
    assert.throws(() => fairWanWorkflow({ env: { FAIR_COMFYUI_URL } }), /loopback HTTP origin/);
  }
  assert.throws(() => fairWanWorkflow({ env: { FAIR_WAN_WORKFLOW: '/tmp/custom.json' } }), /Custom Wan/);
  assert.throws(() => fairWanWorkflow({ env: { FAIR_WAN_MODEL: '../model.safetensors' } }), /Invalid Wan model/);
});

test('Wan supports bounded server-side Mac preview settings and rejects invalid dimensions', () => {
  const graph = fairWanWorkflow({ env: { FAIR_WAN_WIDTH: '512', FAIR_WAN_HEIGHT: '288', FAIR_WAN_FRAMES: '17', FAIR_WAN_STEPS: '8', FAIR_WAN_FPS: '8', FAIR_WAN_TEXT_DEVICE: 'cpu', FAIR_WAN_TEXT_ENCODER: 'umt5_xxl_fp16.safetensors' } });
  assert.deepEqual(graph['7'].inputs, { vae: ['3', 0], width: 512, height: 288, length: 17, batch_size: 1 });
  assert.equal(graph['8'].inputs.steps, 8);
  assert.equal(graph['10'].inputs.fps, 8);
  assert.equal(graph['2'].inputs.device, 'cpu');
  for (const env of [{ FAIR_WAN_WIDTH: '511' }, { FAIR_WAN_FRAMES: '18' }, { FAIR_WAN_STEPS: '1000' }, { FAIR_WAN_TEXT_DEVICE: 'cuda' }]) assert.throws(() => fairWanWorkflow({ env }), /FAIR_WAN/);
});

for (const [name, options, expected] of [
  ['worker rejection', { rejected: true }, /rejected/],
  ['execution failure', { failed: true }, /failed or was interrupted/],
  ['traversal filename', { filename: '../private.mp4' }, /unsafe/],
  ['traversal folder', { subfolder: 'fair/../../private' }, /unsafe/],
  ['invalid container', { bytes: Buffer.from('not an mp4') }, /not a complete MP4/],
  ['oversized output', { oversized: true }, /size limit/],
  ['redirect', { redirect: true }, /fetch failed/],
]) test(`Wan rejects ${name}`, async t => {
  const worker = await fairWorker(t, options);
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.', pollMs: 1 }), expected);
});

test('Wan cancellation deletes only its queued job and never interrupts other GPU jobs', async t => {
  const controller = new AbortController();
  const worker = await fairWorker(t, { wait: true, onPoll: () => controller.abort() });
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.', signal: controller.signal, pollMs: 1 }), /Generation cancelled/);
  assert.deepEqual(worker.calls.find(call => call.path === '/queue' && call.method === 'POST').body, { delete: ['fair-test-job'] });
  assert.equal(worker.calls.some(call => call.path === '/interrupt'), false);
});

test('Wan timeout is bounded and removes only its own queued request', async t => {
  const worker = await fairWorker(t, { wait: true });
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.', timeoutMs: 80, pollMs: 1 }), /time limit/);
  assert.deepEqual(worker.calls.find(call => call.path === '/queue' && call.method === 'POST').body, { delete: ['fair-test-job'] });
});

test('Wan retry resumes a completed GPU job after a failed download without another submission', async t => {
  const options = { bytes: Buffer.from('incomplete download') };
  const worker = await fairWorker(t, options);
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' }), /complete MP4/);
  const submittedHash = fairHash(worker.submitted());
  worker.info.SaveVideo.input.required.format = fairModernFormat;
  delete worker.info.SaveVideo.input.required.codec;
  delete options.bytes;
  const result = await fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' });
  assert.deepEqual(await readFile(result.file), fairMp4Fixture);
  assert.equal(result.provenance.workflowSha256, submittedHash);
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 1);
});

test('Wan retry does not resubmit an ambiguous request missing from worker history and queue', async t => {
  const worker = await fairWorker(t, { wait: true });
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.', timeoutMs: 80, pollMs: 1 }), /time limit/);
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' }), /cannot be located/);
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 1);
});

test('Wan permits retry after a definite HTTP400 rejection', async t => {
  const options = { badRequest: true };
  const worker = await fairWorker(t, options);
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' }), /HTTP 400/);
  options.badRequest = false;
  await fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' });
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 2);
});

test('Wan permits retry after verified removal of its pending job', async t => {
  const options = { wait: true, pending: true };
  const worker = await fairWorker(t, options);
  await assert.rejects(fairGenerateWanClip({ ...worker, prompt: 'A robot waves.', timeoutMs: 80, pollMs: 1 }), /time limit/);
  options.wait = false;
  await fairGenerateWanClip({ ...worker, prompt: 'A robot waves.' });
  assert.equal(worker.calls.filter(call => call.path === '/prompt').length, 2);
});

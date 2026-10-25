import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fairDownloadComfyModels } from '../scripts/setup-comfy.mjs';

async function fairFixture(t) {
  const runtime = await mkdtemp(join(tmpdir(), 'fair-comfy-setup-'));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuv');
  const model = { repo: 'fair/test', revision: 'test', file: 'diffusion_models/fair.safetensors', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const calls = [];
  const fetchImpl = async (url, request) => {
    calls.push(request.headers.Range);
    const [, from, to] = request.headers.Range.match(/bytes=(\d+)-(\d+)/);
    return new Response(bytes.subarray(Number(from), Number(to) + 1), { status: 206, headers: { 'content-range': `bytes ${from}-${to}/${bytes.length}` } });
  };
  return { runtime, bytes, model, calls, target: join(runtime, 'comfy/models', model.file), args: { runtime, models: [model], chunkSize: 8, workers: 1, fetchImpl, onProgress: () => {} } };
}

test('Comfy setup verifies range downloads and skips a verified model on subsequent setup', { timeout: 5000 }, async t => {
  const fixture = await fairFixture(t);
  await fairDownloadComfyModels(fixture.args);
  assert.deepEqual(await readFile(fixture.target), fixture.bytes);
  assert.deepEqual(fixture.calls, ['bytes=0-7', 'bytes=8-15', 'bytes=16-23', 'bytes=24-31']);
  await fairDownloadComfyModels(fixture.args);
  assert.equal(fixture.calls.length, 4);
  assert.equal(JSON.parse(await readFile(join(fixture.runtime, 'fair-comfy-download-progress.json'))).phase, 'verified');
});

test('Comfy setup retains completed chunks after failure and resumes without redownloading them', { timeout: 5000 }, async t => {
  const fixture = await fairFixture(t);
  let fail = true;
  const fetchImpl = async (url, request) => {
    if (fail && request.headers.Range === 'bytes=8-15') throw new Error('temporary disconnect');
    return fixture.args.fetchImpl(url, request);
  };
  await assert.rejects(fairDownloadComfyModels({ ...fixture.args, fetchImpl }), /disconnect/);
  assert.equal(JSON.parse(await readFile(join(fixture.runtime, 'fair-comfy-download-progress.json'))).phase, 'failed');
  fail = false;
  await fairDownloadComfyModels({ ...fixture.args, fetchImpl });
  assert.deepEqual(await readFile(fixture.target), fixture.bytes);
  assert.equal(fixture.calls.filter(range => range === 'bytes=0-7').length, 1);
});

test('Comfy setup rejects servers ignoring Range and never marks installation verified', { timeout: 5000 }, async t => {
  const fixture = await fairFixture(t);
  await assert.rejects(fairDownloadComfyModels({ ...fixture.args, fetchImpl: async () => new Response(fixture.bytes) }), /did not honor/);
  await assert.rejects(readFile(join(fixture.runtime, 'fair-comfy-models.json')), /ENOENT/);
});

test('Comfy setup preserves an existing model when replacement checksum is invalid', { timeout: 5000 }, async t => {
  const fixture = await fairFixture(t);
  await mkdir(dirname(fixture.target), { recursive: true });
  await writeFile(fixture.target, 'existing local model');
  const fetchImpl = async (url, request) => {
    const response = await fixture.args.fetchImpl(url, request);
    return new Response(Buffer.alloc(8), { status: 206, headers: response.headers });
  };
  await assert.rejects(fairDownloadComfyModels({ ...fixture.args, fetchImpl }), /Checksum mismatch/);
  assert.equal(await readFile(fixture.target, 'utf8'), 'existing local model');
  await assert.rejects(readFile(join(fixture.runtime, 'fair-comfy-models.json')), /ENOENT/);
});

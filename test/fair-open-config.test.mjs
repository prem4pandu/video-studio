import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrief } from '../src/fair-plan.mjs';
import { fairOpenEnvironment, fairOpenReadiness } from '../src/fair-open-config.mjs';
import { fairJobArtifacts } from '../src/fair-jobs.mjs';
import { generateLesson } from '../src/fair-plan.mjs';
import { fairNarrate } from '../src/fair-voice.mjs';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const text = 'Explain place value to primary learners.';

test('old briefs retain classic generation; open-source briefs pin local open-source models', () => {
  assert.equal(normalizeBrief({ text }).generationVersion, 'classic');
  const brief = normalizeBrief({ text, generationVersion: 'open-source' });
  assert.equal(brief.provider, 'local');
  assert.equal(brief.model, 'qwen2.5:7b');
  assert.equal(brief.voiceProvider, 'qwentts');
  assert.equal(brief.footage, 'none');
  for (const patch of [{ provider: 'openai' }, { voiceProvider: 'elevenlabs' }, { voiceProvider: 'openai' }, { generationVersion: 'unknown' }]) {
    assert.throws(() => normalizeBrief({ text, generationVersion: 'open-source', ...patch }));
  }
  assert.equal(normalizeBrief({ text, generationVersion: 'open-source', voiceProvider: 'kokoro' }).voiceProvider, 'kokoro');
  assert.equal(normalizeBrief({ text, generationVersion: 'open-source', model: 'gemma3:12b' }).model, 'gemma3:12b');
});

test('open-source planning cannot inherit a paid or differently licensed review configuration', () => {
  const env = fairOpenEnvironment({ FAIR_MODEL: 'gemma3:12b', FAIR_REVIEW_MODEL: 'llama3:latest', OPENAI_API_KEY: 'unused' });
  assert.equal(env.FAIR_MODEL, 'qwen2.5:7b');
  assert.equal(env.FAIR_REVIEW_MODEL, 'qwen2.5:7b');
  for (const value of ['https://example.com', 'http://user:pass@localhost:11434', 'http://127.0.0.1/private', 'http://localhost/?secret=1']) {
    assert.throws(() => fairOpenEnvironment({ FAIR_OLLAMA_URL: value }));
    assert.throws(() => fairOpenEnvironment({ FAIR_KOKORO_URL: value }, { voiceProvider: 'kokoro' }));
  }
  assert.doesNotThrow(() => fairOpenEnvironment({ FAIR_OLLAMA_URL: 'http://localhost:11434', FAIR_KOKORO_URL: 'http://127.0.0.1:8880/v1/audio/speech' }, { voiceProvider: 'kokoro' }));
  assert.doesNotThrow(() => fairOpenEnvironment({ FAIR_KOKORO_URL: 'https://unused.example/v1/audio/speech' }, { voiceProvider: 'piper' }));
});

test('readiness collects missing services and never calls a remote planner', async () => {
  let calls = 0;
  const deps = { env: {}, brief: { footage: 'wan' }, command: async () => { throw new Error('missing executable'); },
    fetchImpl: async () => { calls++; return Response.json({ models: [{ name: 'gemma3:12b' }] }); },
    wanReadiness: async () => ({ available: false, detail: 'Wan checkpoint is missing.' }) };
  const result = await fairOpenReadiness(deps);
  assert.equal(result.available, false);
  assert.equal(result.blockers.length, 5);
  assert.ok(result.blockers.some(message => message.includes('qwen2.5:7b')));
  assert.ok(result.blockers.includes('Wan checkpoint is missing.'));
  assert.equal(calls, 1);
  calls = 0;
  const remote = await fairOpenReadiness({ ...deps, env: { FAIR_OLLAMA_URL: 'https://example.com' } });
  assert.equal(remote.available, false);
  assert.equal(calls, 0);
});

test('readiness requires all runtime checks, a real installed Qwen name, and Wan readiness', async () => {
  const result = await fairOpenReadiness({ env: {}, brief: { footage: 'wan' }, command: async () => ({ stdout: 'unit-test runtime', stderr: '' }),
    fetchImpl: async (_, options) => { assert.equal(options.redirect, 'error'); return Response.json({ models: [{ name: 'qwen2.5:7b' }] }); },
    wanReadiness: async () => ({ available: true }) });
  assert.deepEqual(result, { available: true, blockers: [] });
});

test('teaching-only readiness skips Wan and checks the selected planner and separate critic', async () => {
  const deps = { env: { FAIR_OPEN_MODEL: 'qwen2.5:7b', FAIR_OPEN_REVIEW_MODEL: 'qwen3:30b' },
    brief: { model: 'qwen3:14b', footage: 'none' }, command: async () => ({ stdout: 'runtime' }),
    fetchImpl: async () => Response.json({ models: [{ name: 'qwen3:14b' }, { name: 'qwen3:30b' }] }),
    wanReadiness: () => { throw new Error('Unrequested footage must not be checked'); } };
  assert.deepEqual(await fairOpenReadiness(deps), { available: true, blockers: [] });
  const missing = await fairOpenReadiness({ ...deps, fetchImpl: async () => Response.json({ models: [{ name: 'qwen3:14b' }] }) });
  assert.equal(missing.available, false);
  assert.match(missing.blockers.join(' '), /qwen3:30b/);
});

test('composition artifacts are selected only from the trusted generation version', () => {
  assert.equal(fairJobArtifacts({}).composition, 'index.html');
  const artifacts = fairJobArtifacts({ generationVersion: 'open-source', composition: '../../secret' });
  assert.equal(artifacts.composition, 'fair-manim-scene.py');
  assert.equal(artifacts.renderPlan, 'fair-render-plan.json');
});

test('actual local planner and narrator reject redirects before forwarding lesson content', async t => {
  let forwarded = 0;
  const target = createServer((_req, res) => { forwarded++; res.end('{}'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const redirect = createServer((_req, res) => {
    res.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/external` });
    res.end();
  });
  await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'fair-open-redirect-'));
  t.after(async () => {
    await Promise.all([new Promise(resolve => target.close(resolve)), new Promise(resolve => redirect.close(resolve))]);
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${redirect.address().port}`;
  const brief = normalizeBrief({ text, generationVersion: 'open-source' });
  await assert.rejects(generateLesson(brief, { env: { FAIR_OLLAMA_URL: origin } }));
  await assert.rejects(fairNarrate({ scenes: [{ id: 'local', title: 'Local speech', narration: 'Explain the value of this digit.' }] }, directory,
    { brief: { ...brief, voiceProvider: 'kokoro' }, env: { FAIR_KOKORO_URL: `${origin}/v1/audio/speech` } }));
  assert.equal(forwarded, 0);
});

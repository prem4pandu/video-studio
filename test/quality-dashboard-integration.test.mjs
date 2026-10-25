import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FairJobStore } from '../src/jobs.mjs';
import { fairServerConfig } from '../src/server.mjs';

const waitFor = async (predicate, timeoutMs = 1500) => {
  const expires = Date.now() + timeoutMs;
  while (Date.now() < expires) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for the quality job fixture.');
};

test('new jobs default to the approved quality pipeline when no version is supplied', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fair-quality-dashboard-'));
  const received = [];
  const store = new FairJobStore(root, { env: { FIXTURE: 'quality' }, run: async (brief, directory, options) => {
    received.push({ brief, directory, env: options.env });
    await options.onProgress({ stage: 'verify', progress: 95, message: 'Running quality gates.' });
    return { lesson: { title: 'Quality fixture', objectives: [], scenes: [] }, report: {
      passed: true, checks: [{ name: 'Response window', passed: true, detail: 'No answer leakage.' }],
    } };
  } });
  await store.init();
  t.after(async () => {
    await store.stop();
    await rm(root, { recursive: true, force: true });
  });

  const job = await store.create({
    text: 'Teach place value with a worked example and independent transfer.',
    provider: 'local', targetSeconds: 180, avatar: 'none',
  });
  assert.equal(job.brief.generationVersion, 'quality');

  const completed = await waitFor(() => store.get(job.id)?.status === 'completed' && store.get(job.id));
  assert.equal(received.length, 1);
  assert.equal(received[0].brief.generationVersion, 'quality');
  assert.equal(received[0].env.FIXTURE, 'quality');
  assert.equal(completed.report.passed, true);
  assert.equal(completed.events.some(event => /quality gates/i.test(event.message)), true);
});

test('a rejected quality gate becomes a failed job and preserves the actionable reason', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fair-quality-failure-'));
  const store = new FairJobStore(root, { run: async brief => {
    assert.equal(brief.generationVersion, 'quality');
    throw new Error('Quality gate failed: independent response time is below five seconds.');
  } });
  await store.init();
  t.after(async () => { await store.stop(); await rm(root, { recursive: true, force: true }); });

  const job = await store.create({
    text: 'Teach place value but fail the protected response-window fixture.',
    generationVersion: 'quality', provider: 'local', targetSeconds: 180, avatar: 'none',
  });
  const failed = await waitFor(() => store.get(job.id)?.status === 'failed' && store.get(job.id));
  assert.match(failed.error, /Quality gate failed: independent response time is below five seconds/);
  assert.match(failed.message, /Generation stopped/);
  assert.equal(failed.artifacts, undefined);
});

test('server config exposes quality as the recommended available generation path', async () => {
  const config = await fairServerConfig({}, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'fixture-model' }] }) }),
    command: async () => ({ stdout: '', stderr: '' }),
    fileStat: async () => { throw new Error('Voice fixture intentionally absent.'); },
    openReadiness: async () => ({ available: false, blockers: ['Open renderer intentionally absent.'] }),
  });
  const quality = config.generationVersions.find(version => version.id === 'quality');
  assert.ok(quality);
  assert.equal(quality.available, true);
  assert.equal(quality.recommended, true);
  assert.equal(config.defaults.generationVersion, 'quality');
});

test('web studio submits quality and exposes accessible pipeline and gate status', async () => {
  const [script, pipeline] = await Promise.all([
    readFile(new URL('../public/studio.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/pipeline.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(script, /generationVersion:\s*state\.generationVersion/);
  assert.match(script, /option\.disabled = !available/);
  assert.match(script, /state\.voiceProvider = \$\('voice-provider'\)\.value/);
  assert.match(script, /api\('\/api\/jobs',\s*\{\s*method:\s*'POST',\s*body:\s*JSON\.stringify\(payload\)/);
  assert.match(script, /function renderJobTimeline\(job, ready\)/);
  assert.match(script, /function renderPromptRecords\(job, data\)/);
  assert.match(script, /api\(job\.artifacts\.prompts\)/);
  assert.match(script, /verify: \{ label: 'Quality gates'/);
  assert.match(script, /educator: \{ label: 'Educator review'/);
  assert.match(script, /label: 'Approved proof-derived teaching film'/);
  assert.match(script, /automated gates passed/);
  assert.match(script, /check\.passed \? 'Passed' : 'Review'/);
  assert.match(pipeline, /name: 'Complete teaching loop'/);
  assert.match(pipeline, /name: 'Protected response time'/);
  assert.match(pipeline, /name: 'Approved visual treatment'/);
  assert.match(pipeline, /koobits-approved-v2/);
  assert.match(pipeline, /Semantic focus targets/);
  assert.match(pipeline, /Progressive teaching reveals/);
  assert.match(pipeline, /Protected answer windows/);
});

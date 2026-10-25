import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fairByteRange } from '../src/server.mjs';
import { FairJobStore } from '../src/jobs.mjs';
import { fairCompose } from '../src/composition.mjs';
import { fairAudioEnvelope } from '../src/voice.mjs';
import { fairReadJson, fairWriteJson } from '../src/utils.mjs';

const brief = { text: 'Explain decimal place value to Grade 5 learners.' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fair-runtime-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Timed out waiting for job state');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
// Injected runners exercise storage/control flow only: no provider or renderer is called.
const unitResult = { lesson: { title: 'Unit-test lesson' }, report: { passed: true, status: 'unit-test-only' } };

test('byte ranges support video seeking, suffixes, and capped endpoints', () => {
  assert.equal(fairByteRange(undefined, 100), null);
  assert.deepEqual(fairByteRange('bytes=0-0', 100), { start: 0, end: 0 });
  assert.deepEqual(fairByteRange('bytes=20-', 100), { start: 20, end: 99 });
  assert.deepEqual(fairByteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(fairByteRange('bytes=-200', 100), { start: 0, end: 99 });
  assert.deepEqual(fairByteRange('bytes=20-200', 100), { start: 20, end: 99 });
  for (const value of ['bytes=-', 'bytes=-0', 'bytes=100-', 'bytes=9-2', 'bytes=0-1,3-4', 'bytes=9007199254740992-', 'items=0-1']) {
    assert.throws(() => fairByteRange(value, 100), /Invalid byte range/);
  }
  assert.throws(() => fairByteRange('bytes=0-', 0), /Invalid byte range/);
});

test('unit runner persists progress and failure, retries in the same directory, and preserves completed jobs', async t => {
  const root = await temporary(t), directories = [];
  let calls = 0;
  const store = new FairJobStore(root, { run: async (_brief, directory, { onProgress }) => {
    directories.push(directory);
    await onProgress({ stage: 'narration', progress: 35, message: 'Unit-test progress event' });
    if (++calls === 1) throw new Error('Unit-test renderer failure');
    return unitResult;
  } });
  await store.init();
  const job = await store.create(brief);
  await until(() => store.active === null);
  let saved = await fairReadJson(join(root, job.id, 'job.json'));
  assert.equal(saved.status, 'failed');
  assert.equal(saved.error, 'Unit-test renderer failure');
  assert.equal(saved.attempts, 1);
  assert.equal(saved.artifacts, undefined);
  assert.ok(saved.events.some(event => event.message === 'Unit-test progress event'));
  await store.retry(job.id);
  await until(() => store.active === null);
  saved = await fairReadJson(join(root, job.id, 'job.json'));
  assert.equal(saved.status, 'completed');
  assert.equal(saved.progress, 100);
  assert.equal(saved.attempts, 2);
  assert.equal(saved.error, null);
  assert.equal(directories[0], directories[1]);
  assert.match(saved.artifacts.video, new RegExp(`/api/jobs/${job.id}/artifacts/video$`));
  const before = await readFile(join(root, job.id, 'job.json'), 'utf8');
  await assert.rejects(store.retry(job.id), { statusCode: 409 });
  await assert.rejects(store.cancel(job.id), { statusCode: 409 });
  assert.equal(await readFile(join(root, job.id, 'job.json'), 'utf8'), before);
  assert.equal(calls, 2);
  assert.throws(() => store.directory('../outside'), /Invalid job ID/);
  assert.equal(store.get('../outside'), undefined);
  await store.stop();
});

test('cancellation prevents a late runner result or progress event from completing the job', async t => {
  const root = await temporary(t), started = deferred(), finish = deferred();
  let capturedSignal;
  const store = new FairJobStore(root, { run: async (_brief, _directory, { signal, onProgress }) => {
    capturedSignal = signal; started.resolve(); await finish.promise;
    await onProgress({ stage: 'verify', progress: 99, message: 'Late unit-test progress' });
    return unitResult;
  } });
  await store.init();
  const job = await store.create(brief);
  await started.promise;
  await store.cancel(job.id);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(job.status, 'interrupted');
  await assert.rejects(store.retry(job.id), { statusCode: 409 });
  finish.resolve();
  await until(() => store.active === null);
  const saved = await fairReadJson(join(root, job.id, 'job.json'));
  assert.equal(saved.status, 'interrupted');
  assert.equal(saved.artifacts, undefined);
  assert.ok(!saved.events.some(event => event.message === 'Late unit-test progress'));
  await store.stop();
});

test('queued cancellation never invokes the runner and independent jobs run sequentially', async t => {
  const root = await temporary(t), started = deferred(), release = deferred(), calls = [];
  const store = new FairJobStore(root, { run: async (_brief, directory) => {
    calls.push(directory);
    if (calls.length === 1) { started.resolve(); await release.promise; }
    return unitResult;
  } });
  await store.init();
  const first = await store.create(brief); await started.promise;
  const cancelled = await store.create(brief), last = await store.create(brief);
  assert.equal(calls.length, 1);
  assert.equal(last.status, 'queued');
  await store.cancel(cancelled.id);
  release.resolve();
  await until(() => store.active === null && store.queue.length === 0);
  assert.deepEqual(calls, [store.directory(first.id), store.directory(last.id)]);
  assert.equal(cancelled.status, 'interrupted');
  assert.equal(last.status, 'completed');
  await store.stop();
});

test('restart interrupts unfinished jobs without executing work or changing completed records', async t => {
  const root = await temporary(t), ids = {};
  for (const status of ['queued', 'running', 'completed', 'failed']) {
    const id = randomUUID(); ids[status] = id;
    await fairWriteJson(join(root, id, 'job.json'), { id, brief, status, stage: 'plan', progress: 10, attempts: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', events: [] });
  }
  const completedBefore = await readFile(join(root, ids.completed, 'job.json'), 'utf8');
  let runs = 0;
  const store = new FairJobStore(root, { run: async () => { runs++; return unitResult; } });
  await store.init();
  for (const status of ['queued', 'running']) {
    assert.equal(store.get(ids[status]).status, 'interrupted');
    assert.equal((await fairReadJson(join(root, ids[status], 'job.json'))).status, 'interrupted');
  }
  assert.equal(store.get(ids.failed).status, 'failed');
  assert.equal(runs, 0);
  assert.equal(await readFile(join(root, ids.completed, 'job.json'), 'utf8'), completedBefore);
  await store.retry(ids.running);
  await until(() => store.active === null);
  assert.equal(runs, 1);
  assert.equal(store.get(ids.running).status, 'completed');
  await store.stop();
});

test('composition escapes generated strings, supports comparisons, and hides answers during questions', async t => {
  const directory = await temporary(t), attack = '</script><img src=x onerror=alert(1)>';
  const scene = (id, beat, visual) => ({ id, beat, title: attack, narration: 'Consider this useful teaching example.', objectiveIds: ['value'], pauseSeconds: beat === 'question' ? 4 : 0, visual });
  const visual = { kind: 'place-value', number: '742', highlightPlace: 1, label: 'What is the value of four?' };
  const lesson = { title: attack, audience: 'Grade 5', scenes: [
    scene('compare', 'concept', { kind: 'comparison', left: attack, right: '40', leftLabel: 'Digit', rightLabel: 'Value' }),
    scene('question', 'question', { kind: 'equation', lines: ['742 = 700 + 40 + 2'], label: 'Answer must stay hidden' }), scene('answer', 'answer', visual),
  ] };
  const tracks = lesson.scenes.map(item => ({ sceneId: item.id, file: `audio/${item.id}.wav`, durationSeconds: 3, envelope: [{ at: 0, value: 0.2 }], sha256: 'a'.repeat(64) }));
  const composition = await fairCompose(lesson, tracks, { avatar: 'mira' }, directory);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  assert.ok(!html.includes(attack));
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes('undefined'));
  const question = html.match(/<section id="fair-question"[\s\S]*?<\/section>/)?.[0];
  const answer = html.match(/<section id="fair-answer"[\s\S]*?<\/section>/)?.[0];
  assert.ok(question && answer);
  assert.ok(!question.includes('class="takeaway'));
  assert.match(question, /class="question-prompt reveal"/);
  assert.ok(!question.includes('742 = 700 + 40 + 2'));
  assert.ok(!question.includes('Answer must stay hidden'));
  assert.match(answer, /class="takeaway/);
  assert.match(html, /Pause and think/);
  assert.ok(composition.scenes[2].speechStart > composition.scenes[1].speechStart + 3 + 4);
  assert.ok(composition.captions.every(cue => cue.end > cue.start));
  assert.match(await readFile(join(directory, 'captions.vtt'), 'utf8'), /^WEBVTT\n/);
  assert.match(await readFile(join(directory, 'transcript.txt'), 'utf8'), /Think for 4 seconds/);
});

test('number-line ticks preserve small decimal intervals', async t => {
  const directory = await temporary(t);
  const lesson = { title: 'Small decimals', audience: 'Decimal learners', scenes: [{
    id: 'decimal-line', beat: 'example', title: 'Millionths', narration: 'Each step is two millionths.', pauseSeconds: 0,
    visual: { kind: 'number-line', min: 0, max: 0.00001, mark: 0.000005, label: 'Two millionths per step' },
  }] };
  await fairCompose(lesson, [{ sceneId: 'decimal-line', file: 'audio/decimal-line.wav', durationSeconds: 3, envelope: [], sha256: 'a'.repeat(64) }], { avatar: 'mira' }, directory);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  for (const label of ['0.000002', '0.000004', '0.000006', '0.000008', '0.00001']) assert.ok(html.includes(`>${label}</text>`));
});

function wav(samples, sampleRate = 1000) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, index) => buffer.writeInt16LE(value, 44 + index * 2));
  return buffer;
}

test('audio envelopes measure duration and energy while rejecting silent or malformed WAVs', () => {
  const result = fairAudioEnvelope(wav([...Array(100).fill(3277), ...Array(100).fill(0)]));
  assert.equal(result.durationSeconds, 0.2);
  assert.equal(result.envelope.length, 2);
  assert.equal(result.envelope[0].at, 0);
  assert.ok(result.envelope[0].value > 0.69 && result.envelope[0].value < 0.71);
  assert.deepEqual(result.envelope[1], { at: 0.1, value: 0 });
  assert.throws(() => fairAudioEnvelope(wav(Array(100).fill(0))), /silent audio/);
  assert.throws(() => fairAudioEnvelope(Buffer.from('not audio')), /not a WAV/);
  assert.throws(() => fairAudioEnvelope(wav([1, 2]).subarray(0, 46)), /truncated/);
  const stereo = wav([100, 200]); stereo.writeUInt16LE(2, 22);
  assert.throws(() => fairAudioEnvelope(stereo), /mono 16-bit/);
  const wrongFormat = wav([100, 200]); wrongFormat.writeUInt16LE(3, 20);
  assert.throws(() => fairAudioEnvelope(wrongFormat), /mono 16-bit/);
});

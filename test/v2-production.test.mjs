import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Brief, validatePlan, critiqueJsonSchema, planJsonSchema, VISUAL_STATES } from '../studio-v2/contracts.mjs';
import { ProductionStore } from '../studio-v2/jobs.mjs';
import { planProduction, generateJson, productionSchema, normalizeGeneratedPlan } from '../studio-v2/planner.mjs';
import { createV2Handler } from '../studio-v2/http.mjs';

const brief = Brief.parse({ prompt: 'Explain one half using a shaded fraction and ask a question.', mode: 'learning', durationSeconds: 30 });
const success = { report: { passed: true }, plan: { title: 'Test production' } };
function plan() {
  const scene = (id, kind, narration, extra = {}) => ({ id, kind, title: id, narration, labels: [], numbers: [], emphasis: '', motif: 'none', pauseSeconds: 0, ...extra });
  return {
    title: 'One half', summary: 'Equal parts make a half.', mode: 'learning',
    scenes: [
      scene('intro', 'title', 'We can split one whole into two equal parts. Each part must have the same size.'),
      scene('example', 'fraction', 'One shaded part out of two equal parts is one half.', { numbers: [1, 2] }),
      scene('question', 'question', 'What fraction is one part out of two equal parts?', { pauseSeconds: 3 }),
      scene('answer', 'recap', 'It is one half because one of two equal parts is shaded.'),
    ],
    claims: [], mathClaims: [{ left: '1/2', right: '2/4' }],
    metadata: { title: 'One half', description: 'An original fraction lesson.', tags: ['fractions'] },
  };
}
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-v2-production-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function waitFor(predicate, label = 'condition') {
  const deadline = Date.now() + 4000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`); await delay(5); }
}
function controlledRun() {
  const calls = [];
  const run = (input, directory, options) => new Promise((resolve, reject) => {
    calls.push({ input, directory, ...options, resolve, reject });
    if (options.signal.aborted) reject(options.signal.reason);
    else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  return { calls, run };
}
async function fixture(t, run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'studio-v2-production-test-'));
  const store = new ProductionStore(root, { env: {}, run, ...options });
  await store.init();
  t.after(async () => { await store.stop(); await rm(root, { recursive: true, force: true }); });
  return store;
}

test('plan validation checks arithmetic, drawable quantities, mode, IDs and timing', () => {
  assert.equal(validatePlan(plan(), brief).scenes.length, 4);
  const cases = [
    [p => { p.mathClaims[0].right = '1/3'; }, /math|claim|equal|arithmetic/i],
    [p => { p.scenes[1].numbers = [3, 2]; }, /Fraction/],
    [p => { p.scenes[1].numbers = [1, 13]; }, /Fraction/],
    [p => { p.scenes[1].kind = 'base-ten'; p.scenes[1].numbers = [1.5]; }, /Base-ten/],
    [p => { p.scenes[1].id = 'intro'; }, /unique/],
    [p => { p.mode = 'social'; }, /mode/],
    [p => { p.scenes[2].pauseSeconds = 2; }, /thinking seconds/],
    [p => { p.scenes[0].pauseSeconds = 3; }, /only for questions/],
    [p => { p.scenes[3].kind = 'question'; p.scenes[3].pauseSeconds = 3; p.scenes[3].narration = 'What fraction do you see in this picture?'; }, /answer scene/],
    [p => { p.scenes[2].kind = 'flow'; p.scenes[2].pauseSeconds = 0; }, /concrete question/],
    [p => { p.scenes[0].narration = 'Too short.'; }, /spoken words/],
    [p => { p.untrusted = 'extra'; }, /Unrecognized key/],
  ];
  for (const [mutate, pattern] of cases) { const invalid = plan(); mutate(invalid); assert.throws(() => validatePlan(invalid, brief), pattern); }
  assert.throws(() => Brief.parse({ ...brief, durationSeconds: 5 }));
  assert.throws(() => Brief.parse({ ...brief, remoteEndpoint: 'https://example.com' }));
});

test('question scenes reject visible answer data before model critique', () => {
  for (const field of ['labels', 'numbers']) {
    const invalid = plan(); invalid.scenes[2][field] = field === 'labels' ? ['One half'] : [1, 2];
    assert.throws(() => validatePlan(invalid, brief), /question|answer/i);
  }
});

test('fraction recap must define one half as one of two equal parts', () => {
  for (const falseDefinition of ['One half means two equal parts.', 'One half is two equal pieces.']) {
    const invalid = plan();
    invalid.scenes[3].narration = `${falseDefinition} Share your pizza with a friend.`;
    assert.throws(() => validatePlan(invalid, brief), /half|fraction|definition/i);
  }
  const valid = plan();
  valid.scenes[3].narration = 'One half means one of two equal parts. Share your pizza with a friend.';
  assert.equal(validatePlan(valid, brief).scenes.length, 4);
});

test('fraction questions are normalized to givens without revealing the answer, including zero and whole boundaries', () => {
  for (const numbers of [[1, 2], [0, 2], [2, 2], [1, 1], [0, 1], [12, 12]]) {
    const raw = plan();
    Object.assign(raw.scenes[2], { narration: 'One half means one of two equal parts. What is one half?', labels: ['The answer is one half'], numbers: [1, 2], emphasis: 'One half', motif: 'plant', visualState: 'bloom' });
    Object.assign(raw.scenes[3], { kind: 'fraction', numbers });
    const snapshot = structuredClone(raw), normalized = normalizeGeneratedPlan(raw), question = normalized.scenes[2];
    assert.deepEqual(raw, snapshot);
    assert.match(question.narration, /What fraction of the whole do you have\?$/);
    assert.doesNotMatch(question.narration, /half|answer|means/);
    assert.match(question.title, new RegExp(`What fraction is ${numbers[0]} of ${numbers[1]} equal parts`));
    assert.deepEqual(question.labels, []); assert.deepEqual(question.numbers, []);
    assert.equal(question.emphasis, ''); assert.equal(question.motif, 'none'); assert.equal(question.visualState, 'default');
    assert.equal(question.pauseSeconds, 3);
    assert.deepEqual(normalized.scenes[3].numbers, numbers);
    assert.equal(validatePlan(normalized, brief).scenes.length, 4);
  }
  const raw = plan(); raw.scenes[2].narration = 'One half means one of two equal parts. What is one half?';
  assert.throws(() => validatePlan(raw, brief), /without stating the answer/);
});

test('invalid fraction answers are never silently repaired into plausible questions', () => {
  for (const numbers of [[2, 1], [-1, 2], [1, 0], [1, 13], [0.5, 2], [1], [1, 2, 3]]) {
    const raw = plan(); Object.assign(raw.scenes[3], { kind: 'fraction', numbers });
    const normalized = normalizeGeneratedPlan(raw);
    assert.equal(normalized.scenes[2].narration, raw.scenes[2].narration);
    assert.deepEqual(normalized.scenes[3].numbers, numbers);
    assert.throws(() => validatePlan(normalized, brief), /Fraction/);
  }
});

test('fraction answer matches the exact shown quantity and replaces unsupported addition claims', () => {
  for (const [numbers, spoken] of [
    [[1, 2], 'one half'], [[0, 2], 'zero'], [[2, 2], 'one whole'],
    [[0, 1], 'zero'], [[1, 1], 'one whole'], [[1, 3], 'one third'],
    [[2, 3], 'two thirds'], [[1, 4], 'one quarter'], [[3, 4], 'three quarters'],
    [[11, 12], 'eleven twelfths'], [[12, 12], 'one whole'],
  ]) {
    const raw = plan();
    Object.assign(raw.scenes[3], { kind: 'fraction', numbers, title: 'Two halves make a whole pizza',
      narration: 'Put two halves together to make a whole pizza. One half plus one half makes one.',
      labels: ['1/2 + 1/2 = 1'], emphasis: 'Add both halves', motif: 'plant', visualState: 'bloom' });
    const original = structuredClone(raw), normalized = normalizeGeneratedPlan(raw), answer = normalized.scenes[3];
    assert.equal(answer.title, `The answer: ${spoken}`);
    assert.ok(answer.narration.startsWith(`You have ${spoken}: `));
    assert.match(answer.narration, /The shaded amount shows your share of the pizza\.$/);
    assert.doesNotMatch(answer.narration, /plus|together|add/i);
    assert.deepEqual(answer.numbers, numbers); assert.deepEqual(answer.labels, [`${numbers[0]} / ${numbers[1]}`]);
    assert.equal(answer.emphasis, ''); assert.equal(answer.motif, 'none'); assert.equal(answer.visualState, 'default');
    assert.deepEqual(raw, original);
    assert.equal(validatePlan(normalized, brief).scenes.length, 4);
  }
});

test('generation grammar enforces scene and per-scene word minimums for short, medium and long videos', () => {
  const original = structuredClone(planJsonSchema);
  const text = count => Array.from({ length: count }, () => 'word').join(' ');
  for (const [durationSeconds, expectedScenes, minimumWords, maximumWords] of [[30, 4, 16, 18], [45, 6, 16, 19], [180, 10, 38, 45]]) {
    const schema = productionSchema({ ...brief, durationSeconds });
    const scenes = schema.properties.scenes;
    assert.equal(scenes.minItems, expectedScenes);
    assert.equal(scenes.maxItems, expectedScenes + 1);
    const narration = scenes.items.properties.narration;
    const pattern = new RegExp(narration.pattern);
    assert.equal(pattern.test(text(minimumWords - 1)), false, `${durationSeconds}s accepts too few words`);
    assert.equal(pattern.test(text(minimumWords)), true);
    assert.equal(pattern.test(text(maximumWords)), true);
    assert.equal(pattern.test(text(maximumWords + 1)), false);
    assert.equal(pattern.test(''), false);
    assert.equal(pattern.test(' ' + text(minimumWords)), false);
    assert.ok(expectedScenes * minimumWords >= durationSeconds * 2.1);
    assert.ok(expectedScenes * minimumWords <= durationSeconds * 3.2);
    assert.ok(text(45).length <= narration.maxLength);
    assert.deepEqual(scenes.items.required, original.properties.scenes.items.required.filter(key => key !== 'id'));
    assert.equal(Object.hasOwn(scenes.items.properties, 'id'), false, 'The model should not generate application-owned IDs');
    assert.equal(scenes.items.additionalProperties, false);
  }
  assert.deepEqual(planJsonSchema, original, 'Per-request grammar must not mutate the shared schema');
  // Check tier boundaries too: no supported integer duration can demand over 45 words per scene.
  for (let durationSeconds = 30; durationSeconds <= 180; durationSeconds++) {
    const scenes = productionSchema({ ...brief, durationSeconds }).properties.scenes;
    const pattern = new RegExp(scenes.items.properties.narration.pattern);
    const minimum = Array.from({ length: 45 }, (_, i) => i + 1).find(count => pattern.test(text(count)));
    const maximum = Array.from({ length: 45 }, (_, i) => 45 - i).find(count => pattern.test(text(count)));
    assert.ok(minimum, `${durationSeconds}s grammar is unsatisfiable`);
    assert.ok(minimum * scenes.minItems >= durationSeconds * 2.1);
    assert.ok(maximum * scenes.maxItems <= durationSeconds * 3);
    assert.ok(minimum <= maximum);
    assert.ok(scenes.minItems <= scenes.maxItems && scenes.maxItems <= 12);
  }
});

test('visual states are explicit constrained values with a backward-compatible default', () => {
  assert.deepEqual(VISUAL_STATES, ['default', 'seed', 'growing', 'wilt', 'care', 'storm', 'bloom']);
  assert.deepEqual(planJsonSchema.properties.scenes.items.properties.visualState.enum, VISUAL_STATES);
  const input = plan();
  assert.ok(validatePlan(input, brief).scenes.every(scene => scene.visualState === 'default'));
  for (const state of VISUAL_STATES) {
    input.scenes[0].visualState = state;
    assert.equal(validatePlan(input, brief).scenes[0].visualState, state);
  }
  input.scenes[0].visualState = 'invented';
  assert.throws(() => validatePlan(input, brief), /Invalid enum value/);
});

test('continuous illustrated stories can retain one visual kind while learning and social need variation', () => {
  const story = plan(); story.mode = 'story';
  for (const scene of story.scenes) { scene.kind = 'story'; scene.pauseSeconds = 0; scene.numbers = []; }
  assert.equal(validatePlan(story, { ...brief, mode: 'story' }).scenes.length, 4);
  story.mode = 'social';
  assert.throws(() => validatePlan(story, { ...brief, mode: 'social' }), /three meaningful visual kinds/);
});

test('concurrent idempotent submissions execute exactly once and conflicting payloads return 409', async t => {
  const control = controlledRun(); const store = await fixture(t, control.run);
  const key = 'idempotency-concurrent-0001';
  const jobs = await Promise.all(Array.from({ length: 8 }, () => store.create(brief, key)));
  assert.equal(new Set(jobs.map(j => j.id)).size, 1);
  await waitFor(() => control.calls.length === 1);
  assert.equal(store.jobs.size, 1);
  await assert.rejects(store.create({ ...brief, format: 'portrait' }, key), { statusCode: 409 });
  const clash = await Promise.allSettled([
    store.create(brief, 'idempotency-conflicting-0002'),
    store.create({ ...brief, style: 'bold' }, 'idempotency-conflicting-0002'),
  ]);
  assert.equal(clash[0].status, 'fulfilled'); assert.equal(clash[1].reason.statusCode, 409);
  assert.equal(store.queue.length, 1);
  await assert.rejects(store.create(brief, 'short'), { statusCode: 400 });
});

test('queued cancellation prevents execution; active cancellation blocks late progress and completion', async t => {
  const control = controlledRun(); const store = await fixture(t, control.run);
  const active = await store.create(brief, 'cancel-active-0000001');
  await waitFor(() => control.calls.length === 1);
  const queued = await store.create(brief, 'cancel-queued-0000001');
  await store.cancel(queued.id); assert.equal(queued.status, 'interrupted'); assert.equal(store.queue.length, 0);
  await store.cancel(active.id);
  assert.equal(control.calls[0].signal.aborted, true);
  await control.calls[0].onProgress({ status: 'completed', progress: 100 });
  control.calls[0].resolve(success);
  await waitFor(() => !store.active);
  assert.equal(active.status, 'interrupted'); assert.equal(control.calls.length, 1);
  assert.equal(JSON.parse(await readFile(join(store.directory(active.id), 'job.json'))).status, 'interrupted');
  await assert.rejects(store.cancel(active.id), { statusCode: 409 });
});

test('failed work can retry exactly once concurrently and completed work needs explicit review', async t => {
  let attempts = 0;
  const store = await fixture(t, async () => { if (++attempts === 1) throw new Error('Narrator unavailable'); return success; });
  const job = await store.create(brief, 'retry-failure-0000001');
  await waitFor(() => job.status === 'failed' && !store.active);
  assert.match(job.error, /Narrator unavailable/);
  await assert.rejects(store.review(job.id, { decision: 'approved' }), { statusCode: 409 });
  const retries = await Promise.allSettled([store.retry(job.id), store.retry(job.id)]);
  assert.equal(retries.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(retries.find(r => r.status === 'rejected').reason.statusCode, 409);
  await waitFor(() => job.status === 'completed' && !store.active);
  assert.equal(attempts, 2); assert.equal(job.attempts, 2); assert.equal(job.review, undefined);
  await store.review(job.id, { decision: 'needs-changes', note: 'Check the last answer.' });
  assert.equal(job.review.decision, 'needs-changes');
  assert.equal(JSON.parse(await readFile(join(store.directory(job.id), 'review.json'))).note, 'Check the last answer.');
  await assert.rejects(store.retry(job.id), { statusCode: 409 });
});

test('a cancelled operation that returns success late cannot publish a completed job', async t => {
  let finish, runningSignal;
  const store = await fixture(t, async (_, __, { signal }) => {
    runningSignal = signal;
    return new Promise(resolve => { finish = resolve; });
  });
  const job = await store.create(brief, 'cancel-late-success-01');
  await waitFor(() => finish);
  await store.cancel(job.id); assert.equal(runningSignal.aborted, true);
  finish(success); await waitFor(() => !store.active);
  assert.equal(job.status, 'interrupted'); assert.equal(job.artifacts, undefined);
  assert.equal(JSON.parse(await readFile(join(store.directory(job.id), 'job.json'))).status, 'interrupted');
});

test('queue capacity rejects extra work but still accepts an existing idempotency key', async t => {
  const control = controlledRun(); const store = await fixture(t, control.run, { maxQueue: 1 });
  await store.create(brief, 'capacity-active-00001');
  await waitFor(() => control.calls.length === 1);
  const queued = await store.create(brief, 'capacity-queued-00001');
  await assert.rejects(store.create(brief, 'capacity-overflow-001'), { statusCode: 429 });
  assert.equal((await store.create(brief, 'capacity-queued-00001')).id, queued.id);
  assert.equal(store.jobs.size, 2);
});

test('restart preserves idempotency and marks active and queued jobs interrupted before retry', async t => {
  const control = controlledRun(); const store = await fixture(t, control.run);
  const first = await store.create(brief, 'restart-active-000001');
  await waitFor(() => control.calls.length === 1);
  const second = await store.create(brief, 'restart-queued-000001');
  await store.stop();
  const recovered = new ProductionStore(store.root, { env: {}, run: async () => success });
  await recovered.init(); t.after(() => recovered.stop());
  assert.equal(recovered.get(first.id).status, 'interrupted');
  assert.equal(recovered.get(second.id).status, 'interrupted');
  assert.equal(recovered.active, null); assert.equal(recovered.queue.length, 0);
  assert.equal((await recovered.create(brief, 'restart-active-000001')).id, first.id);
  await recovered.retry(first.id);
  await waitFor(() => recovered.get(first.id).status === 'completed' && !recovered.active);
  assert.equal(recovered.get(first.id).attempts, 2);
  assert.equal(recovered.get(second.id).status, 'interrupted');
});

test('a stopping store rejects new submissions and retries instead of stranding work', async t => {
  const store = await fixture(t, async () => { throw new Error('Fixture failure'); });
  const job = await store.create(brief, 'stop-retry-0000000001');
  await waitFor(() => job.status === 'failed' && !store.active);
  await store.stop();
  await assert.rejects(store.create(brief, 'stop-create-00000001'), { statusCode: 503 });
  await assert.rejects(store.retry(job.id), { statusCode: 503 });
});

test('critic failures exhaust three attempts and save actionable feedback without approving a plan', async t => {
  const directory = await temporary(t); let plans = 0, reviews = 0;
  const generate = async (prompt, schema) => {
    if (schema === critiqueJsonSchema) { reviews++; return { passed: true, issues: ['Question answer contradicts the fraction.'], notes: [] }; }
    plans++; if (plans > 1) assert.match(prompt, /Repair these specific problems.*Question answer/s); return plan();
  };
  await assert.rejects(planProduction(brief, directory, { env: {}, generate }), /three attempts.*contradicts/);
  assert.equal(plans, 3); assert.equal(reviews, 3);
  assert.match(JSON.parse(await readFile(join(directory, 'failure-3.json'))).error, /contradicts/);
});

test('critic may omit empty arrays but must explicitly approve the plan', async t => {
  const directory = await temporary(t);
  const approved = await planProduction(brief, join(directory, 'approved'), {
    env: {}, generate: async (_, schema) => schema === critiqueJsonSchema ? { passed: true } : plan(),
  });
  assert.equal(approved.review.passed, true);
  assert.deepEqual(approved.review.issues, []); assert.deepEqual(approved.review.notes, []);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'approved', 'review-1-raw.json'))), { passed: true });
  for (const [name, review] of [['rejected', { passed: false }], ['missing-decision', { notes: [] }]]) {
    let critiques = 0;
    await assert.rejects(planProduction(brief, join(directory, name), {
      env: {}, generate: async (_, schema) => {
        if (schema === critiqueJsonSchema) { critiques++; return review; }
        return plan();
      },
    }), /three attempts/);
    assert.equal(critiques, 3);
    assert.deepEqual(JSON.parse(await readFile(join(directory, name, 'review-3-raw.json'))), review);
  }
});

test('planner repairs invalid arithmetic before critique and records independent reviewer honestly', async t => {
  const directory = await temporary(t); let calls = 0; const models = [];
  const result = await planProduction(brief, directory, {
    env: { STUDIO_V2_MODEL: 'writer', STUDIO_V2_REVIEW_MODEL: 'reviewer' },
    generate: async (prompt, schema, { model }) => {
      models.push(model); calls++;
      if (schema === critiqueJsonSchema) return { passed: true, issues: [], notes: ['Arithmetic agrees.'] };
      const p = plan(); if (calls === 1) p.mathClaims[0].right = '1/3'; else assert.match(prompt, /Repair these specific problems/); return p;
    },
  });
  assert.equal(result.review.attempt, 2); assert.equal(result.review.independentModel, true);
  assert.deepEqual(models, ['writer', 'writer', 'reviewer']); assert.equal(result.fingerprint.length, 64);
  const shared = await planProduction(brief, join(directory, 'shared'), { env: { STUDIO_V2_MODEL: 'shared-model', STUDIO_V2_REVIEW_MODEL: 'shared-model' }, generate: async (_, schema) => schema === critiqueJsonSchema ? { passed: true, issues: [], notes: [] } : plan() });
  assert.equal(shared.review.independentModel, false);
});

test('planner cancellation stops retries and preserves the cancellation reason', async t => {
  const directory = await temporary(t), controller = new AbortController(), reason = new Error('User stopped production'); let calls = 0;
  await assert.rejects(planProduction(brief, directory, { env: {}, signal: controller.signal, generate: async () => { calls++; controller.abort(reason); throw reason; } }), reason);
  assert.equal(calls, 1);
});

test('planner owns stable scene IDs and preserves model evidence without changing scene content', async t => {
  const directory = await temporary(t), raw = plan();
  raw.scenes.forEach(scene => { scene.id = 'duplicate'; });
  const original = structuredClone(raw); let calls = 0;
  const result = await planProduction(brief, directory, { env: {}, generate: async (prompt, schema) => {
    calls++;
    if (schema === critiqueJsonSchema) {
      assert.match(prompt, /"id":"scene-1"/); assert.doesNotMatch(prompt, /"id":"duplicate"/);
      return { passed: true, issues: [], notes: [] };
    }
    return raw;
  } });
  assert.equal(calls, 2); assert.equal(result.review.attempt, 1);
  assert.deepEqual(result.plan.scenes.map(scene => scene.id), ['scene-1', 'scene-2', 'scene-3', 'scene-4']);
  assert.deepEqual(result.plan.scenes.map(({ id, ...scene }) => scene), original.scenes.map(({ id, ...scene }) => ({ ...scene, visualState: 'default' })));
  assert.deepEqual(raw, original, 'Normalization must not mutate the model response');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'plan-1.json'))), original);
});

test('local planner refuses remote endpoints, truncated output and malformed structured output', async () => {
  let requests = 0;
  await assert.rejects(generateJson('prompt', {}, { env: { FAIR_OLLAMA_URL: 'https://example.com' }, fetchImpl: async () => { requests++; } }), /loopback HTTP/);
  assert.equal(requests, 0);
  for (const [data, pattern] of [
    [{ done_reason: 'length', message: { content: '{}' } }, /truncated/],
    [{ message: {} }, /no structured content/],
    [{ message: { content: 'not JSON' } }, /JSON/],
  ]) await assert.rejects(generateJson('prompt', {}, { env: {}, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(data) }) }), pattern);
});

test('HTTP handler sends idempotency keys through and blocks artifact traversal and symlinks', async t => {
  const store = await fixture(t, async () => success);
  let response;
  const handle = createV2Handler(store, { env: {}, json: (_, status, data) => { response = { status, data }; }, body: async req => req.payload, byteRange: () => undefined });
  await handle({ method: 'POST', headers: { 'idempotency-key': 'http-production-0001' }, payload: brief }, {}, '/api/v2/jobs');
  assert.equal(response.status, 202); const id = response.data.job.id;
  await waitFor(() => store.get(id).status === 'completed' && !store.active);
  await handle({ method: 'GET', headers: {} }, {}, '/api/v2/jobs/../../secret'); assert.equal(response.status, 404);
  const project = join(store.directory(id), 'project'); await mkdir(project, { recursive: true });
  const outside = join(store.root, 'secret.txt'); await writeFile(outside, 'secret'); await symlink(outside, join(project, 'transcript.txt'));
  await handle({ method: 'GET', headers: {} }, {}, `/api/v2/jobs/${id}/artifacts/transcript`); assert.equal(response.status, 403);
  await handle({ method: 'GET', headers: {} }, {}, `/api/v2/jobs/${id}/artifacts/unknown`); assert.equal(response.status, 405);
  assert.equal(await handle({ method: 'GET', headers: {} }, {}, '/api/other'), false);
});

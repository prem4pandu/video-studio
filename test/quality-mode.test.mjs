import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningPrompt, normalizeBrief, validateLesson } from '../src/plan.mjs';
import { fairRendererKind } from '../src/pipeline.mjs';
import { fairServerConfig } from '../src/server.mjs';

const brief = { text: 'Teach place value with base-ten blocks to primary learners.', generationVersion: 'quality', targetSeconds: 180 };

function fixture() {
  const scene = (id, beat, narration, extra = {}) => ({ id, beat, title: id, narration, objectiveIds: ['place-value'], visual: { kind: 'steps', items: ['Read the value of each digit.'], label: 'Place value' }, pauseSeconds: 0, mathClaims: [], ...extra });
  return {
    title: 'Place value with blocks', audience: 'Primary learners',
    curriculum: { requested: 'Primary place value', resolved: 'Primary place value', warnings: [], sources: [] },
    objectives: [{ id: 'place-value', text: 'Explain and practise place value with base-ten blocks.' }],
    prerequisites: ['Read two-digit numbers.'],
    concept: { hook: 'Build a number.', analogy: 'Columns hold different values.', arc: 'Notice, explain, practise, recall.' },
    scenes: [
      scene('hook', 'hook', 'A digit changes value when it moves to a different place. Let us investigate.'),
      scene('concept', 'concept', 'Ones are single cubes. Ten ones can be grouped to make one ten.'),
      scene('example', 'example', 'Here are twenty three cubes. Bundle ten cubes together to make each ten, leaving three ones. We write twenty three as two tens and three ones.', { visual: { kind: 'base-ten', mode: 'group', number: 23, place: 'ones', label: 'Ten ones make one ten', cues: [
        { phrase: 'Here are twenty three cubes', action: 'show-objects' },
        { phrase: 'Bundle ten cubes together', action: 'transform' },
        { phrase: 'We write twenty three', action: 'show-notation' },
      ] } }),
      scene('mistake', 'misconception', 'The digit two does not mean two ones here. Its tens column makes its value twenty.'),
      scene('try', 'question', 'In forty two, what is the value of the digit four?', { questionId: 'q-one', pauseSeconds: 5 }),
      scene('answer', 'answer', 'Four is in the tens place, so its value is forty.', { questionId: 'q-one' }),
      scene('transfer', 'question', 'In sixty seven, what is the value of the digit six?', { questionId: 'q-two', pauseSeconds: 5 }),
      scene('transfer-answer', 'answer', 'Six is in the tens place, so its value is sixty.', { questionId: 'q-two' }),
      scene('recap', 'recap', 'Use the column and the blocks to explain each digit value. Then check your answer.'),
    ],
  };
}

test('quality is accepted and keeps the HyperFrames renderer route', () => {
  const normalized = normalizeBrief(brief);
  assert.equal(normalized.generationVersion, 'quality');
  assert.equal(fairRendererKind(normalized), 'hyperframes');
  assert.equal(fairRendererKind({ generationVersion: 'open-source' }), 'open-source');
  assert.match(buildPlanningPrompt(brief), /Quality mode is strict/);
  assert.match(buildPlanningPrompt(brief), /at least five seconds of protected response time/);
  assert.match(buildPlanningPrompt(brief), /approved proof-derived teaching-film structure/);
  assert.match(buildPlanningPrompt(brief), /independent transfer question/);
});

test('server advertises available quality mode as the recommended default', async () => {
  const config = await fairServerConfig({}, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'fixture-model' }] }) }),
    command: async () => ({ stdout: '', stderr: '' }),
    fileStat: async () => { throw new Error('No voice fixture'); },
    openReadiness: async () => ({ available: false, blockers: ['Fixture open renderer unavailable.'] }),
  });
  const quality = config.generationVersions.find(version => version.id === 'quality');
  assert.equal(config.defaults.generationVersion, 'quality');
  assert.equal(quality.available, true);
  assert.equal(quality.recommended, true);
});

test('quality gates require full pedagogy, supported base-ten visuals, and response time', () => {
  const valid = validateLesson(fixture(), brief);
  assert.match(valid.quality.warnings.join(' '), /180-second target/);

  const missingBeat = fixture();
  missingBeat.scenes.splice(1, 1);
  assert.throws(() => validateLesson(missingBeat, brief), /Quality mode needs these teaching beats: concept/);

  const fallback = fixture();
  fallback.scenes[2].visual = { kind: 'steps', items: ['Two tens and three ones.'], label: 'Generic diagram' };
  assert.throws(() => validateLesson(fallback, brief), /generic diagram fallback is not allowed/);

  const rushed = fixture();
  rushed.scenes[4].pauseSeconds = 3;
  assert.throws(() => validateLesson(rushed, brief), /at least five seconds of response time in: try/);

  const shallowPractice = fixture();
  shallowPractice.scenes.splice(6, 2);
  assert.throws(() => validateLesson(shallowPractice, brief), /guided question and a separate independent transfer question/);
});

test('classic mode retains its existing compatibility gates', () => {
  const classic = fixture();
  classic.scenes.splice(1, 1);
  classic.scenes[1].visual = { kind: 'steps', items: ['Two tens and three ones.'], label: 'Place value' };
  assert.doesNotThrow(() => validateLesson(classic, { ...brief, generationVersion: 'classic' }));
});


test('decimal rounding accepts number lines and substantive round imperatives', () => {
  const lesson = fixture();
  lesson.title = 'Rounding decimal numbers';
  lesson.objectives[0].text = 'Round tenths to the nearest whole number.';
  lesson.scenes[2].visual = { kind: 'number-line', min: 2, max: 3, mark: 2.8, label: 'Two point eight' };
  lesson.scenes[2].narration = 'Two point eight is closer to three than two. It rounds to three.';
  lesson.scenes[4].narration = 'Round six point two to the nearest whole number.';
  lesson.scenes[5].narration = 'Six point two rounds to six because six is the closer whole number.';
  assert.doesNotThrow(() => validateLesson(lesson, { ...brief, text: 'Rounding decimals; avoid unrelated base-ten place value demonstrations.' }));
});

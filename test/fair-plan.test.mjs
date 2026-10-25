import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrief, validateLesson, buildPlanningPrompt, generateLesson, baseTenCueWordOffsets } from '../src/fair-plan.mjs';

const brief = { text: 'Grade 5 maths place value for ones and tens', targetSeconds: 180 };
function fixture() {
  const scene = (id, beat, narration, extra = {}) => ({ id, beat, title: id, narration, objectiveIds: ['place-value'], visual: { kind: 'steps', items: ['A digit has a place and a value.'], label: 'Place value' }, pauseSeconds: 0, mathClaims: [], ...extra });
  return {
    title: 'The value of a digit', audience: 'Grade 5',
    curriculum: { requested: 'Grade 5 maths', resolved: 'Primary place value, assumed scope', warnings: [], sources: [] },
    objectives: [{ id: 'place-value', text: 'Find the value of a digit in a whole number.' }],
    prerequisites: ['Read three-digit whole numbers.'],
    concept: { hook: 'One digit can have different values.', analogy: 'Place columns are labelled boxes.', arc: 'Notice, explain, practise, recall.' },
    scenes: [
      scene('hook', 'hook', 'The digit five can be worth five or five hundred. Its place tells us which.'),
      scene('example', 'example', 'In five hundred and twenty three, five is in the hundreds place. Five times one hundred is five hundred.', { visual: { kind: 'place-value', number: '523', highlightPlace: 2, label: 'Five hundreds' }, mathClaims: [{ left: '5 * 100', right: '500' }] }),
      scene('mistake', 'misconception', 'Do not confuse the digit five with its value five hundred. Count the columns from the right.'),
      scene('try', 'question', 'In seven hundred and forty two, what is the value of the digit four?', { questionId: 'q-one', pauseSeconds: 5 }),
      scene('answer', 'answer', 'Four is in the tens column, so its value is forty. Four times ten equals forty.', { questionId: 'q-one', mathClaims: [{ left: '4*10', right: '40' }] }),
      scene('recap', 'recap', 'Find the column, then multiply the digit by its place value. Ones, tens and hundreds each grow by ten.'),
    ],
  };
}

test('normalizes simple briefs and rejects out of range settings', () => {
  assert.equal(normalizeBrief('Teach place value').avatar, 'none');
  assert.equal(normalizeBrief('Teach place value').provider, 'local');
  assert.equal(normalizeBrief('Teach place value').targetSeconds, 180);
  assert.throws(() => normalizeBrief({ ...brief, targetSeconds: 20 }));
  assert.throws(() => normalizeBrief({ ...brief, avatar: 'unknown' }));
  assert.throws(() => normalizeBrief({ ...brief, provider: 'arbitrary-url' }));
  assert.equal(normalizeBrief(brief).voiceProvider, undefined);
  for (const voiceProvider of ['piper', 'kokoro', 'elevenlabs', 'openai', 'say', 'qwentts']) assert.equal(normalizeBrief({ ...brief, voiceProvider }).voiceProvider, voiceProvider);
  assert.throws(() => normalizeBrief({ ...brief, voiceProvider: 'unknown' }));
  assert.match(buildPlanningPrompt(brief), /immediately following explained answer/);
});
test('valid lesson passes with honest review warnings', () => {
  const lesson = validateLesson(fixture(), brief);
  assert.equal(lesson.quality.reviewed, false);
  assert.match(lesson.quality.warnings.join(' '), /educator review/);
});
test('rejects missing objective coverage and invented references', () => {
  const lesson = fixture();
  lesson.objectives.push({ id: 'decimals', text: 'Understand decimal place value' });
  assert.throws(() => validateLesson(lesson, brief), /explanation and practice/);
  const linked = fixture();
  linked.curriculum.sources.push({ title: 'Invented source', url: 'https://example.com/syllabus' });
  assert.throws(() => validateLesson(linked, brief), /Unprovided curriculum source/);
});
test('extended visual kinds are validated against their renderer contracts', () => {
  const lesson = fixture();
  lesson.scenes[1].visual = { kind: 'fraction-bars', fraction: '1/2', equivalent: '2/5', label: 'Mismatched pair' };
  assert.throws(() => validateLesson(lesson, brief), /not equivalent/);
  lesson.scenes[1].visual = { kind: 'fraction-bars', fraction: '1/2', equivalent: '2/4', label: 'Half as two quarters' };
  assert.doesNotThrow(() => validateLesson(lesson, brief));
  lesson.scenes[1].visual = { kind: 'area-grid', rows: 4, cols: 4, shaded: 20, label: 'Too many cells' };
  assert.throws(() => validateLesson(lesson, brief), /shades 20 of only 16 cells/);
  lesson.scenes[1].visual = { kind: 'area-grid', rows: 10, cols: 10, shaded: 35, label: 'Thirty five percent' };
  assert.doesNotThrow(() => validateLesson(lesson, brief));
  lesson.scenes[1].visual = { kind: 'coordinate-grid', points: [{ x: 1, y: 1 }, { x: 1, y: 1 }], connect: false, label: 'Duplicate points' };
  assert.throws(() => validateLesson(lesson, brief), /repeats a point/);
  lesson.scenes[1].visual = { kind: 'clock', hour: 10, minute: 30, label: 'Half past ten' };
  assert.doesNotThrow(() => validateLesson(lesson, brief));
});
test('the planning prompt documents every renderer visual kind', () => {
  const prompt = buildPlanningPrompt(brief);
  for (const kind of ['place-value', 'equation', 'comparison', 'number-line', 'steps', 'recap', 'fraction-bars', 'bar-model', 'area-grid', 'angle', 'coordinate-grid', 'chart', 'clock', 'base-ten']) {
    assert.match(prompt, new RegExp(`kind:'${kind}'`), `prompt is missing ${kind}`);
  }
});
test('topic briefs stay scoped to their declared curriculum objectives', () => {
  const prompt = buildPlanningPrompt({ ...brief, topic: { board: 'cambridge-primary', stage: '5', subject: 'mathematics', unitId: 's5-place-value', topicId: 's5-pv-rounding', title: 'Rounding to the nearest whole number', objectiveCodes: ['5Np.05'] } });
  assert.match(prompt, /Rounding to the nearest whole number/);
  assert.match(prompt, /5Np\.05/);
  assert.match(prompt, /strictly inside the objectives/);
});
test('rejects duplicate scene and objective identities', () => {
  const lesson = fixture();
  lesson.scenes[2].id = lesson.scenes[1].id;
  assert.throws(() => validateLesson(lesson, brief), /Duplicate scene/);
  const duplicate = fixture();
  duplicate.objectives.push(duplicate.objectives[0]);
  assert.throws(() => validateLesson(duplicate, brief), /Duplicate objective/);
});
test('rejects wrong arithmetic in claims and visible equations', () => {
  const lesson = fixture();
  lesson.scenes[1].mathClaims[0].right = '50';
  assert.throws(() => validateLesson(lesson, brief), /incorrect arithmetic/);
  const visible = fixture();
  visible.scenes[1].visual = { kind: 'equation', lines: ['50 + 3 = 54'], label: 'Addition' };
  assert.throws(() => validateLesson(visible, brief), /incorrect arithmetic/);
});
test('exact arithmetic handles decimals, precedence and fractions without code execution', () => {
  const lesson = fixture();
  lesson.scenes[1].mathClaims = [{ left: '0.1+0.2', right: '0.3' }, { left: '1/3 + 2/3', right: '1' }, { left: '2+3*4', right: '14' }, { left: '-2^2', right: '-4' }, { left: '6 x 100', right: '600' }, { left: '4 hundreds + 0 tens + 2 ones', right: '402' }];
  assert.doesNotThrow(() => validateLesson(lesson, brief));
  lesson.scenes[1].mathClaims = [{ left: 'process.exit()', right: '1' }];
  assert.throws(() => validateLesson(lesson, brief), /Unsupported arithmetic/);
  lesson.scenes[1].mathClaims = [{ left: '1/0', right: '1' }];
  assert.throws(() => validateLesson(lesson, brief), /Division by zero/);
  lesson.scenes[1].mathClaims = [{ left: '4*10', right: '400' }, { left: '2*100', right: '20' }];
  assert.throws(() => validateLesson(lesson, brief), /4\*10 = 400.*2\*100 = 20/);
  lesson.scenes[1].mathClaims = [{ left: '4 hundreds', right: '40' }];
  assert.throws(() => validateLesson(lesson, brief), /incorrect arithmetic/);
});
test('checks equation rows independently, strips list labels, and checks chained equalities', () => {
  const lesson = fixture();
  lesson.scenes[1].visual = { kind: 'equation', lines: ['1. 2 + 3 = 5', '2) 5 + 5 = 10\n10 * 2 = 20'], label: 'Example 2' };
  assert.doesNotThrow(() => validateLesson(lesson, brief));
  lesson.scenes[1].visual.lines = ['2 + 3 = 5 = 6'];
  assert.throws(() => validateLesson(lesson, brief), /incorrect arithmetic/);
  lesson.scenes[1].mathClaims = [{ left: '1 2', right: '12' }];
  assert.throws(() => validateLesson(lesson, brief), /Adjacent numbers/);
});
test('rejects narration with literal arithmetic and unreadable visual lengths', () => {
  const lesson = fixture();
  lesson.scenes[1].narration = 'Five times one hundred = five hundred.';
  assert.throws(() => validateLesson(lesson, brief), /spoken mathematics/);
  lesson.scenes[1].narration = 'The fraction 3/4 means three quarters.';
  assert.throws(() => validateLesson(lesson, brief), /spoken mathematics/);
  const wide = fixture();
  wide.scenes[1].visual.number = '12345678.9';
  assert.throws(() => validateLesson(wide, brief), /eight digits/);
  const long = fixture();
  long.scenes[0].title = 'A'.repeat(81);
  assert.throws(() => validateLesson(long, brief));
  long.scenes[0].title = 'Readable title';
  long.scenes[0].visual.items = ['A'.repeat(161)];
  assert.throws(() => validateLesson(long, brief));
});
test('speech normalization removes paired emphasis without changing words or hiding arithmetic', () => {
  const lesson = fixture();
  lesson.scenes[0].narration = 'The *same* digit can have **different** values. Its _place_ tells us which.';
  assert.equal(validateLesson(lesson, brief).scenes[0].narration, 'The same digit can have different values. Its place tells us which.');
  lesson.scenes[0].narration = 'Check the expression 2*3*4 before answering.';
  assert.throws(() => validateLesson(lesson, brief), /spoken mathematics/);
});
test('questions require paired answers, real prompts and thinking time', () => {
  const lesson = fixture();
  lesson.scenes[4].beat = 'concept';
  assert.throws(() => validateLesson(lesson, brief), /followed immediately/);
  const pause = fixture();
  pause.scenes[3].pauseSeconds = 0;
  assert.throws(() => validateLesson(pause, brief), /thinking time/);
  const vague = fixture();
  vague.scenes[3].narration = 'Practise place value now.';
  assert.throws(() => validateLesson(vague, brief), /concrete question/);
  const imperative = fixture();
  imperative.scenes[3].narration = 'Find the value of the digit four in seven hundred and forty two.';
  assert.doesNotThrow(() => validateLesson(imperative, brief));
  imperative.scenes[3].narration = 'Try this. Think for three seconds.';
  assert.throws(() => validateLesson(imperative, brief), /concrete question/);
  imperative.scenes[3].visual = { kind: 'steps', items: ['What is the value of four in 742?'], label: 'Unrendered question' };
  assert.throws(() => validateLesson(imperative, brief), /concrete question/);
});
test('duration target is soft while the ten-minute absolute limit is enforced', () => {
  const lesson = fixture();
  for (const scene of lesson.scenes) scene.narration += ` ${'Consider the position of each digit. '.repeat(8)}`;
  assert.match(validateLesson(lesson, { ...brief, targetSeconds: 60 }).quality.warnings.join(' '), /above the 60-second target/);
  for (const scene of lesson.scenes) scene.narration = `${'A digit has a place. '.repeat(60)} What is its value?`;
  assert.throws(() => validateLesson(lesson, brief), /absolute ten-minute/);
});
test('rejects unsupported visuals and incorrect diagram bounds', () => {
  const lesson = fixture();
  lesson.scenes[0].visual.kind = 'arbitrary-html';
  assert.throws(() => validateLesson(lesson, brief));
  const place = fixture();
  place.scenes[1].visual.highlightPlace = 3;
  assert.throws(() => validateLesson(place, brief), /Highlighted place/);
  const line = fixture();
  line.scenes[1].visual = { kind: 'number-line', min: 0, max: 10, mark: 11, label: 'Wrong mark' };
  assert.throws(() => validateLesson(line, brief), /number-line bounds/);
  const label = fixture();
  label.scenes[1].visual.label = 'Ones';
  assert.throws(() => validateLesson(label, brief), /label "Ones" contradicts/);
});
test('named generated places normalize to renderer exponents while numeric cached lessons still work', () => {
  const lesson = fixture();
  lesson.scenes[1].visual.highlightPlace = 'hundreds';
  assert.equal(validateLesson(lesson, brief).scenes[1].visual.highlightPlace, 2);
  lesson.scenes[1].visual.number = '5.23';
  lesson.scenes[1].visual.highlightPlace = 'hundredths';
  lesson.scenes[1].visual.label = 'Hundredths';
  assert.equal(validateLesson(lesson, brief).scenes[1].visual.highlightPlace, -2);
  assert.equal(validateLesson(fixture(), brief).scenes[1].visual.highlightPlace, 2);
  lesson.scenes[1].visual.highlightPlace = 'leftmost';
  assert.throws(() => validateLesson(lesson, brief));
});
function animatedFixture(mode = 'group', number = 23, place = 'ones') {
  const lesson = fixture();
  lesson.scenes[1].narration = 'Here are twenty three cubes. Bundle ten cubes together to make each ten, leaving three ones. We write twenty three as two tens and three ones.';
  lesson.scenes[1].visual = { kind: 'base-ten', mode, number, place, label: 'Ten ones make one ten', cues: [
    { phrase: 'Here are twenty three cubes', action: 'show-objects' },
    { phrase: 'Bundle ten cubes together', action: 'transform' },
    { phrase: 'We write twenty three', action: 'show-notation' },
  ] };
  return lesson;
}
test('base-ten visual accepts bounded transformations and rejects invalid mathematical states', () => {
  // These checks validate structured state; factual narration alignment still needs content review.
  for (const args of [['group', 23, 'ones'], ['group', 234, 'tens'], ['trade', 234, 'ones'], ['trade', 100, 'tens'], ['digit-shift', 23, 'tens'], ['zero', 204, 'tens'], ['zero', 120, 'ones'], ['expanded', 999, 'hundreds']]) {
    assert.doesNotThrow(() => validateLesson(animatedFixture(...args), brief));
  }
  for (const args of [['group', 9, 'ones'], ['trade', 104, 'ones'], ['trade', 200, 'hundreds'], ['digit-shift', 123, 'tens'], ['digit-shift', 20, 'ones'], ['zero', 124, 'tens'], ['zero', 24, 'hundreds']]) {
    assert.throws(() => validateLesson(animatedFixture(...args), brief), /Base-ten/);
  }
  assert.throws(() => validateLesson(animatedFixture('expanded', 1000), brief));
  assert.throws(() => validateLesson(animatedFixture('expanded', 2.5), brief));
  assert.throws(() => validateLesson(animatedFixture('arbitrary-animation'), brief));
  const extra = animatedFixture();
  extra.scenes[1].visual.result = 230;
  assert.throws(() => validateLesson(extra, brief));
});
test('base-ten cues use unique ordered spoken word positions, independent of punctuation', () => {
  const { narration, visual } = animatedFixture().scenes[1];
  assert.deepEqual(baseTenCueWordOffsets(narration, visual.cues), [
    { action: 'show-objects', wordIndex: 0, wordCount: 5 },
    { action: 'transform', wordIndex: 5, wordCount: 4 },
    { action: 'show-notation', wordIndex: 16, wordCount: 4 },
  ]);
  const cues = structuredClone(visual.cues);
  cues[0].phrase = 'HERE, are twenty-three cubes!';
  assert.deepEqual(baseTenCueWordOffsets(narration, cues), baseTenCueWordOffsets(narration, visual.cues));
  cues[0].phrase = 'twenty three';
  assert.throws(() => baseTenCueWordOffsets(narration, cues), /exactly once/);
  cues[0].phrase = 'not spoken';
  assert.throws(() => baseTenCueWordOffsets(narration, cues), /exactly once/);
  cues[0].phrase = '...';
  assert.throws(() => baseTenCueWordOffsets(narration, cues), /spoken words/);
  const reversed = structuredClone(visual.cues);
  [reversed[0].phrase, reversed[1].phrase] = [reversed[1].phrase, reversed[0].phrase];
  assert.throws(() => baseTenCueWordOffsets(narration, reversed), /narration order/);
  const overlapping = structuredClone(visual.cues);
  overlapping[0].phrase = 'Here are twenty three cubes Bundle';
  assert.throws(() => baseTenCueWordOffsets(narration, overlapping), /without overlap/);
  assert.throws(() => baseTenCueWordOffsets(narration, visual.cues.slice(0, 2)));
  const unordered = structuredClone(visual.cues);
  unordered[0].action = 'transform';
  assert.throws(() => baseTenCueWordOffsets(narration, unordered), /in that order/);
  const invalid = animatedFixture();
  invalid.scenes[1].visual.cues[1].phrase = 'invented cue';
  assert.throws(() => validateLesson(invalid, brief), /exactly once/);
});
test('generated spoken beats compile once into exact narration and canonical cues', () => {
  const lesson = animatedFixture();
  const scene = lesson.scenes[1];
  delete scene.visual.cues;
  scene.narration = null;
  scene.visual.spokenBeats = ['Look at twenty three cubes.', 'Look at the cubes grouping into tens.', 'Read two tens and three ones: twenty three.'];
  const expected = scene.visual.spokenBeats.join(' ');
  const compiled = validateLesson(lesson, brief).scenes[1];
  assert.equal(compiled.narration, expected);
  assert.equal(compiled.visual.spokenBeats, undefined);
  assert.deepEqual(baseTenCueWordOffsets(compiled.narration, compiled.visual.cues).map(cue => cue.wordIndex), [0, 5, 12]);
  assert.equal(compiled.visual.cues[0].phrase, 'Look at twenty');
  scene.narration = 'Conflicting separate narration must never be silently discarded.';
  assert.throws(() => validateLesson(lesson, brief), /speech only in spokenBeats/);
  scene.narration = null;
  scene.visual.spokenBeats = ['Repeat this same sentence.', 'Repeat this same sentence.', 'Repeat this same sentence.'];
  assert.throws(() => validateLesson(lesson, brief), /distinct spoken beat beginnings/);
  scene.visual.spokenBeats = ['Here are twenty three cubes.', 'Calculate 2*10 while watching.', 'Read twenty three as two tens and three ones.'];
  assert.throws(() => validateLesson(lesson, brief), /spoken mathematics/);
});
test('reports independent semantic failures together and handles a final unanswered question safely', () => {
  const lesson = fixture();
  lesson.scenes[1].mathClaims = [{ left: '2*10', right: '200' }];
  lesson.scenes[1].visual = { kind: 'number-line', min: 0, max: 10, mark: 11, label: 'Invalid bounds' };
  lesson.scenes[3].pauseSeconds = 0;
  assert.throws(() => validateLesson(lesson, brief), error => /number-line bounds/.test(error.message) && /incorrect arithmetic/.test(error.message) && /thinking time/.test(error.message));
  const missing = fixture();
  missing.scenes.at(-1).beat = 'question';
  missing.scenes.at(-1).questionId = 'last-question';
  assert.throws(() => validateLesson(missing, brief), /followed immediately by its answer/);
});
test('IGCSE grade 5 remains unresolved even when model claims alignment', () => {
  const lesson = fixture();
  lesson.curriculum.resolved = 'Certified IGCSE grade 5 curriculum';
  const checked = validateLesson(lesson, { ...brief, text: 'IGCSE 5th grade maths place value' });
  assert.match(checked.curriculum.resolved, /Unresolved/);
  assert.match(checked.curriculum.warnings.join(' '), /different education stages/);
});
test('planning mentions curriculum mismatch only when present and requests spoken number words', () => {
  const primaryPrompt = buildPlanningPrompt(brief);
  assert.doesNotMatch(primaryPrompt, /IGCSE/);
  assert.match(primaryPrompt, /spell out ALL numbers as spoken words/);
  assert.match(primaryPrompt, /Keep numeric notation in visuals and mathClaims/);
  assert.match(primaryPrompt, /objects first, then grouping\/trading, then written notation/);
  assert.match(primaryPrompt, /ONE continuous worked number/);
  assert.match(buildPlanningPrompt({ ...brief, text: 'IGCSE 5th grade maths place value' }), /unresolved curriculum mismatch/);
});
test('model availability failure is actionable and never returns a canned lesson', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Connection refused'); };
  try {
    await assert.rejects(generateLesson(brief, { env: {} }), /Start Ollama and pull gpt-oss:20b/);
  } finally { globalThis.fetch = original; }
});
test('generation repairs a rejected answer and requires a separate review', async () => {
  const original = globalThis.fetch;
  const invalid = fixture();
  invalid.scenes[4].mathClaims[0].right = '400';
  const replies = [invalid, { scenes: [fixture().scenes[4]] }, { errors: [], warnings: ['Check reading level with a teacher.'] }];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    if (calls === 1) {
      const payload = JSON.parse(options.body);
      assert.match(payload.prompt, /Repair ONLY these existing scene IDs: \["answer"\]/);
      assert.equal(payload.format.properties.scenes.maxItems, 1);
    }
    return new Response(JSON.stringify({ response: JSON.stringify(replies[calls++]) }), { status: 200 });
  };
  try {
    const lesson = await generateLesson(brief, { env: {} });
    assert.equal(calls, 3);
    assert.equal(lesson.quality.reviewed, true);
    assert.deepEqual(lesson.scenes[0], fixture().scenes[0]);
    assert.match(lesson.quality.warnings.join(' '), /same model/);
  } finally { globalThis.fetch = original; }
});
test('teaching critique receives renderer-derived starting and ending block counts', async () => {
  const original = globalThis.fetch;
  const lesson = animatedFixture('trade', 23, 'ones');
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (calls++) {
      const reviewed = JSON.parse(request.prompt.split('\nLesson: ')[1]);
      assert.deepEqual(reviewed.scenes[1].renderedState, {
        start: { quantity: 23, ones: 13, tens: 1, hundreds: 0 },
        end: { quantity: 23, ones: 3, tens: 2, hundreds: 0 },
      });
      assert.equal(reviewed.scenes[3].renderedState, undefined);
      assert.equal(reviewed.scenes[3].visual.rendered, false);
      assert.match(request.prompt, /not a model claim/);
    }
    return new Response(JSON.stringify({ response: JSON.stringify(calls === 1 ? lesson : { errors: [], warnings: [] }) }));
  };
  try {
    await generateLesson(brief, { env: {} });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test('generated adjacent question pairs normalize identity without changing teaching content', async () => {
  const original = globalThis.fetch, generated = fixture();
  generated.scenes[3].questionId = null;
  generated.scenes[4].questionId = 'unrelated-id';
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ response: JSON.stringify(calls++ ? { errors: [], warnings: [] } : generated) }));
  try {
    const lesson = await generateLesson(brief, { env: {} });
    assert.equal(calls, 2);
    assert.equal(lesson.scenes[3].questionId, 'try');
    assert.equal(lesson.scenes[4].questionId, 'try');
    assert.equal(lesson.scenes[3].narration, generated.scenes[3].narration);
    assert.equal(lesson.scenes[4].narration, generated.scenes[4].narration);
    assert.equal(generated.scenes[3].questionId, null);
  } finally { globalThis.fetch = original; }
});
test('local generation uses constrained schemas and awaits progress writes', async () => {
  const original = globalThis.fetch;
  let stageReady = false, calls = 0;
  globalThis.fetch = async (_url, options) => {
    assert.equal(stageReady, true);
    const payload = JSON.parse(options.body);
    assert.equal(payload.format.type, 'object');
    assert.equal(payload.format.additionalProperties, false);
    if (calls === 0) {
      assert.equal(payload.format.properties.prerequisites.type, 'array');
      const [ordinaryScene, animatedScene] = payload.format.properties.scenes.items.anyOf;
      assert.ok(ordinaryScene.required.includes('questionId'));
      assert.equal(ordinaryScene.properties.visual.anyOf[1].properties.lines.items.minLength, 1);
      assert.equal(animatedScene.properties.narration.type, 'null');
      assert.equal(ordinaryScene.properties.narration.type, 'string');
      assert.ok(ordinaryScene.properties.visual.anyOf.every(item => item.properties.kind.enum[0] !== 'base-ten'));
      assert.ok(!ordinaryScene.properties.beat.enum.includes('example'));
      assert.ok(animatedScene.properties.beat.enum.includes('example'));
      assert.ok(!animatedScene.properties.beat.enum.includes('question'));
      const animated = animatedScene.properties.visual;
      assert.deepEqual(animated.properties.mode.enum, ['group', 'trade', 'digit-shift', 'zero', 'expanded']);
      assert.equal(animated.properties.number.maximum, 999);
      assert.equal(animated.properties.spokenBeats.minItems, 3);
      assert.equal(animated.properties.spokenBeats.maxItems, 3);
      assert.equal(animated.properties.cues, undefined);
      assert.equal(animated.additionalProperties, false);
    }
    return new Response(JSON.stringify({ response: JSON.stringify(calls++ ? { errors: [], warnings: [] } : fixture()) }));
  };
  try {
    await generateLesson(brief, { env: {}, onProgress: async () => { stageReady = false; await Promise.resolve(); stageReady = true; } });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test('missing objective practice is repaired with new generated scenes before full validation', async () => {
  const original = globalThis.fetch;
  const lesson = fixture();
  lesson.objectives.push({ id: 'zero', text: 'Explain why zero preserves an empty place.' });
  lesson.scenes[1].objectiveIds.push('zero');
  const question = { ...fixture().scenes[3], id: 'repair-1-zero-q', questionId: 'repair-1-zero', objectiveIds: ['zero'], narration: 'In two hundred and seven, why is the zero needed?' };
  const answer = { ...fixture().scenes[4], id: 'repair-1-zero-a', questionId: 'repair-1-zero', objectiveIds: ['zero'], narration: 'Zero holds the tens place. Removing it gives twenty seven, a different number.', mathClaims: [] };
  const replies = [lesson, { scenes: [question, answer] }, { errors: [], warnings: [] }];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    if (calls === 1) {
      const payload = JSON.parse(options.body);
      assert.match(payload.prompt, /NEW scenes only/);
      assert.match(payload.prompt, /"needsPractice":true/);
      assert.deepEqual(Object.keys(payload.format.properties), ['scenes']);
    }
    return new Response(JSON.stringify({ response: JSON.stringify(replies[calls++]) }));
  };
  try {
    const repaired = await generateLesson(brief, { env: {} });
    assert.equal(calls, 3);
    assert.equal(repaired.scenes.length, 8);
    assert.equal(repaired.scenes.at(-1).beat, 'recap');
    assert.equal(repaired.quality.reviewed, true);
  } finally { globalThis.fetch = original; }
});
test('small-number specialization does not override explicit large or decimal scope', async () => {
  const original = globalThis.fetch;
  try {
    for (const input of [{ ...brief, text: 'Teach place value to 10000' }, { ...brief, audience: 'Decimal place value learners' }, { ...brief, curriculumSource: 'Read numbers up to 10,000.' }, { ...brief, text: 'Explain place value in 0.25' }, { ...brief, text: 'Teach place value in tenths and hundredths.' }]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        if (calls++ === 0) {
          const payload = JSON.parse(options.body);
          assert.ok(payload.format.properties.scenes.items.anyOf[0].properties.beat.enum.includes('example'));
          assert.equal(payload.format.properties.objectives.maxItems, 3);
          assert.doesNotMatch(payload.prompt, /SYSTEM SCOPE DECISION/);
        }
        return new Response(JSON.stringify({ response: JSON.stringify(calls === 1 ? fixture() : { errors: [], warnings: [] }) }));
      };
      await generateLesson(input, { env: {} });
    }
  } finally { globalThis.fetch = original; }
});
test('specific numbers, ranges and comparison tasks never become a generic tens introduction', async () => {
  const original = globalThis.fetch;
  try {
    for (const text of ['Explain place value in 407', 'Teach place value up to nine hundred', 'Teach place value by comparing 42 and 24']) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        if (calls++ === 0) {
          const payload = JSON.parse(options.body);
          assert.ok(payload.format.properties.scenes, 'Must request a general lesson, not narrowed numeric planning');
          assert.equal(payload.format.properties.objectives.maxItems, 3);
          assert.doesNotMatch(payload.prompt, /SYSTEM SCOPE DECISION/);
        }
        return new Response(JSON.stringify({ response: JSON.stringify(calls === 1 ? fixture() : { errors: [], warnings: [] }) }));
      };
      await generateLesson({ text, targetSeconds: 120 }, { env: {} });
    }
  } finally { globalThis.fetch = original; }
});
test('generic short brief uses model-chosen numbers and derived states before narration', async () => {
  const original = globalThis.fetch, lesson = fixture();
  lesson.scenes.splice(1, 0, { ...structuredClone(lesson.scenes[1]), id: 'concept', beat: 'concept' });
  for (const scene of lesson.scenes) {
    if (scene.beat === 'question') { scene.narration = 'In seventy three, what is the value of the digit seven?'; continue; }
    const answer = scene.beat === 'answer';
    scene.narration = null;
    scene.visual = { kind: 'base-ten', mode: 'expanded', number: answer ? 73 : 42, place: 'tens', label: 'Count the tens', spokenBeats: answer ? ['There are seven tens and three ones.', 'Count seven tens, each worth ten.', 'The digit seven has a value of seventy.'] : ['There are four tens and two ones.', 'Count four tens, each worth ten.', 'The digit four has a value of forty.'] };
    scene.mathClaims = [{ left: answer ? '7*10' : '4*10', right: answer ? '70' : '40' }];
  }
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (calls === 0) {
      assert.deepEqual(Object.keys(payload.format.properties), ['workedNumber', 'practiceNumber']);
    } else if (calls === 1) {
      assert.match(payload.prompt, /Renderer-computed mathematical facts/);
      assert.match(payload.prompt, /"ones":42,"tens":0,"hundreds":0/);
      const teaching = payload.format.properties.scenes.items.anyOf[0];
      assert.ok(teaching.properties.visual.anyOf.every(visual => visual.properties.number.enum[0] === 42));
      assert.deepEqual(teaching.properties.visual.anyOf.map(visual => visual.properties.mode.enum[0]), ['group', 'expanded']);
      assert.equal(payload.format.properties.objectives.maxItems, 1);
    }
    return new Response(JSON.stringify({ response: JSON.stringify([{ workedNumber: 42, practiceNumber: 73 }, lesson, { errors: [], warnings: [] }][calls++]) }));
  };
  try {
    for (const text of ['Grade 5 place value teaching app', 'IGCSE 5th grade maths place value teaching app']) {
      calls = 0;
      const result = await generateLesson({ text, targetSeconds: 120 }, { env: {} });
      assert.equal(calls, 3);
      assert.match(result.quality.warnings.join(' '), /introduction covers tens-digit values/);
      assert.match(result.curriculum.warnings.join(' '), /two-digit whole numbers/);
      assert.ok(result.curriculum.warnings.every(warning => warning.length <= 240));
      assert.doesNotThrow(() => validateLesson(result, { text, targetSeconds: 120 }));
      assert.equal(result.scenes.find(scene => scene.beat === 'answer').visual.number, 73);
    }
  } finally { globalThis.fetch = original; }
});
test('paid mode fails before network access when no API key is configured', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Should not call'); };
  try {
    await assert.rejects(generateLesson({ ...brief, provider: 'openai' }, { env: {} }), /OPENAI_API_KEY/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('resumed drafts undergo validation and a fresh critique without trusting saved review status', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const seed = fixture();
  seed.quality = { reviewed: true, warnings: [] };
  globalThis.fetch = async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.match(payload.prompt, /Review this generated lesson/);
    assert.doesNotMatch(payload.prompt, /"reviewed"|"quality"/);
    return new Response(JSON.stringify({ response: JSON.stringify({ errors: [], warnings: ['Rechecked saved draft.'] }) }));
  };
  try {
    const lesson = await generateLesson(brief, { initialLesson: seed, env: {} });
    assert.equal(calls, 1);
    assert.equal(lesson.quality.reviewed, true);
    assert.match(lesson.quality.warnings.join(' '), /Rechecked saved draft/);
  } finally { globalThis.fetch = original; }
});
test('independent initial feedback forces model repair before fresh validation and review', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (calls === 0) assert.match(payload.prompt, /Independent review found these concrete errors/);
    return new Response(JSON.stringify({ response: JSON.stringify(calls++ ? { errors: [], warnings: [] } : fixture()) }));
  };
  try {
    const lesson = await generateLesson(brief, { initialLesson: fixture(), initialFeedback: ['Explain the distinction more clearly.'], env: {} });
    assert.equal(calls, 2);
    assert.equal(lesson.quality.reviewed, true);
  } finally { globalThis.fetch = original; }
});
test('paid mode sends strict Responses schema and performs the same teaching review', async () => {
  const original = globalThis.fetch;
  const requests = [];
  const generated = fixture();
  for (const scene of generated.scenes) scene.questionId ??= null;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.authorization, 'Bearer test-key-not-a-secret');
    const payload = JSON.parse(options.body);
    requests.push(payload);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.type, 'json_schema');
    assert.equal(payload.text.format.strict, true);
    assert.ok(!options.body.includes('test-key-not-a-secret'));
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(requests.length === 1 ? generated : { errors: [], warnings: [] }) }] }], usage: { input_tokens: 100, output_tokens: 200 } }));
  };
  try {
    const lesson = await generateLesson({ ...brief, provider: 'openai' }, { env: { OPENAI_API_KEY: 'test-key-not-a-secret', FAIR_OPENAI_REVIEW_MODEL: 'gpt-5.6-sol' } });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, 'gpt-5.6-terra');
    assert.equal(requests[1].model, 'gpt-5.6-sol');
    assert.equal(lesson.quality.reviewed, true);
    assert.match(lesson.quality.warnings.join(' '), /second model/);
  } finally { globalThis.fetch = original; }
});
test('paid failures never silently fallback to local generation', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 401 }); };
  try {
    await assert.rejects(generateLesson({ ...brief, provider: 'openai' }, { env: { OPENAI_API_KEY: 'test-key-not-a-secret' } }), /OpenAI returned HTTP 401/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('paid refusal is a failure and does not generate or review fabricated content', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }] }));
  };
  try {
    await assert.rejects(generateLesson({ ...brief, provider: 'openai' }, { env: { OPENAI_API_KEY: 'test-key-not-a-secret' } }), /OpenAI declined/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

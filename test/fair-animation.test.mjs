import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fairBaseTenState, fairBaseTenAnimation, fairCueTimes } from '../src/fair-animation.mjs';
import { fairCompose } from '../src/fair-composition.mjs';

const value = counts => counts.reduce((sum, count, place) => sum + count * 10 ** place, 0);
const cues = [{ phrase: 'See these cubes', action: 'show-objects' }, { phrase: 'Group them now', action: 'transform' }, { phrase: 'Write the number', action: 'show-notation' }];
const scene = visual => ({ id: 'count', title: 'Build a number', beat: 'concept', narration: 'See these cubes. Group them now. Write the number.', pauseSeconds: 0, visual: { kind: 'base-ten', label: 'Represent the same quantity', cues, ...visual } });
const track = { sceneId: 'count', file: 'audio/count.wav', durationSeconds: 9, envelope: [], words: ['See', 'these', 'cubes.', 'Group', 'them', 'now.', 'Write', 'the', 'number.'].map((text, index) => ({ text, startSeconds: index, endSeconds: index + 0.7 })), wordTimingSource: 'provider-alignment' };
function operations(code) {
  const result = [], tl = {};
  for (const kind of ['fromTo', 'to', 'set']) tl[kind] = (...args) => { result.push({ kind, selector: args[0], target: args[kind === 'fromTo' ? 2 : 1], at: args[kind === 'fromTo' ? 3 : 2] }); return tl; };
  // Code under test is renderer-authored JS; no model text or remote content is executed.
  new Function('tl', code)(tl);
  return result;
}

test('all valid base-ten quantities conserve value; multiplication changes the whole quantity exactly tenfold', () => {
  let cases = 0;
  for (let number = 1; number <= 999; number++) for (const [placeIndex, place] of ['ones', 'tens', 'hundreds'].entries()) {
    if (number < 10 ** placeIndex) continue;
    const digit = Math.floor(number / 10 ** placeIndex) % 10, next = Math.floor(number / 10 ** (placeIndex + 1)) % 10;
    for (const mode of ['expanded', ...(digit === 0 ? ['zero'] : []), ...(placeIndex < 2 && next > 0 ? ['group', 'trade'] : [])]) {
      const state = fairBaseTenState({ number, place, mode });
      assert.equal(value(state.initial), number, `${mode} ${number} ${place} initial`);
      assert.equal(value(state.final), number, `${mode} ${number} ${place} final`);
      assert.ok([...state.initial, ...state.final].every(count => Number.isInteger(count) && count >= 0));
      if (mode === 'trade') {
        assert.equal(state.initial[placeIndex] - state.final[placeIndex], 10);
        assert.equal(state.final[placeIndex + 1] - state.initial[placeIndex + 1], 1);
      }
      if (mode === 'group') assert.equal(state.initial[placeIndex + 1], 0);
      cases++;
    }
    if (number <= 99 && digit > 0) {
      const state = fairBaseTenState({ number, place, mode: 'digit-shift' });
      assert.equal(value(state.initial), number); assert.equal(value(state.final), number * 10);
      assert.equal(state.final[0], 0); assert.equal(state.final[1], state.initial[0]); assert.equal(state.final[2], state.initial[1]); cases++;
    }
  }
  assert.ok(cases > 6000);
});

test('hyphenated spoken numbers preserve cue mapping, while mismatched transcripts are honestly estimated', () => {
  const sample = scene({ number: 23, place: 'ones', mode: 'group' });
  sample.narration = 'See twenty-three cubes. Group them now. Write the number.';
  sample.visual.cues = [{ phrase: 'See twenty three cubes', action: 'show-objects' }, ...cues.slice(1)];
  const timed = { ...track, words: ['See', 'twenty-three', 'cubes.', 'Group', 'them', 'now.', 'Write', 'the', 'number.'].map((text, index) => ({ text, startSeconds: index + 0.15, endSeconds: index + 0.8 })) };
  const mapped = fairCueTimes(sample, timed);
  assert.deepEqual(mapped.map(cue => cue.at), [0.15, 3.15, 6.15]);
  assert.ok(mapped.every(cue => cue.timingSource === 'provider-alignment'));
  const mismatched = fairCueTimes(sample, { ...timed, words: [{ text: 'Unrelated', startSeconds: 0, endSeconds: 8 }] });
  assert.ok(mismatched.every(cue => cue.timingSource === 'estimated'));
  assert.ok(mismatched.every(cue => Number.isFinite(cue.at) && cue.at >= 0 && cue.at < track.durationSeconds));
});

test('transformations finish before notation and notation waits for its spoken cue', () => {
  for (const [mode, number, place] of [['group', 999, 'ones'], ['group', 999, 'tens'], ['trade', 299, 'tens'], ['digit-shift', 99, 'ones'], ['expanded', 999, 'hundreds']]) {
    const result = fairBaseTenAnimation(scene({ mode, number, place }), track, 'test');
    const ops = operations(result.code), notationAt = result.cues[2].at + 0.35;
    assert.equal(ops.find(op => op.selector === '#test-digits').at, notationAt);
    assert.equal(ops.find(op => op.selector === '#test-notation').at, notationAt);
    for (const op of ops.filter(op => op.selector.startsWith('#test-block-'))) assert.ok(op.at + (op.target.duration || 0) <= notationAt + 1e-8, `${mode} completes by narration cue`);
    for (const op of ops.filter(op => op.selector.startsWith('#test-part-'))) assert.equal(op.at, notationAt);
  }
});

test('boundary grouping layouts keep every initially visible block inside the stage without overlapping another unit', () => {
  for (const number of [19, 29, 99, 109, 199, 209, 219, 229, 239, 249, 259, 269, 279, 289, 299, 309, 399, 999]) for (const [index, place] of ['ones', 'tens'].entries()) {
    if (Math.floor(number / 10 ** (index + 1)) % 10 === 0) continue;
    const { html } = fairBaseTenAnimation(scene({ number, place, mode: 'group' }), track, 'bounds');
    const [, stageWidth, stageHeight] = /viewBox="0 0 (\d+) (\d+)"/.exec(html);
    const rectangles = [...html.matchAll(/<g transform="translate\(([\d.e+-]+) ([\d.e+-]+)\)"><g id="([^"]+)" opacity="1">[\s\S]*?<rect width="([^"]+)" height="([^"]+)"/g)].map(match => ({ x: +match[1], y: +match[2], width: +match[4], height: +match[5] }));
    assert.ok(rectangles.length > 0);
    for (const [aIndex, a] of rectangles.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= Number(stageWidth) && a.y + a.height <= Number(stageHeight), `${number}/${place} stage bounds`);
      for (const b of rectangles.slice(aIndex + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${number}/${place} overlapping initial blocks`);
    }
  }
});

test('film composition registers matching subscene timelines, isolates question answers and accounts for measured audio plus thinking time', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-film-review-'));
  try {
    const first = scene({ number: 23, place: 'ones', mode: 'group' });
    const question = { ...first, id: 'question', beat: 'question', title: 'Your turn', narration: 'What is the value of four in three hundred and forty?', pauseSeconds: 5, visual: { kind: 'equation', lines: ['SECRET ANSWER FORTY'], label: 'SECRET ANSWER LABEL' } };
    const questionTrack = { ...track, sceneId: 'question', file: 'audio/question.wav', durationSeconds: 6, words: undefined };
    const composition = await fairCompose({ title: '<Reviewed lesson>', audience: 'Grade 5', scenes: [first, question] }, [track, questionTrack], { avatar: 'mira' }, directory);
    assert.equal(composition.durationSeconds, 9.7 + 11.7);
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<template>/); assert.match(html, /&lt;Reviewed lesson&gt;/);
    for (const id of ['count', 'question']) {
      const child = await readFile(join(directory, 'scenes', `${id}.html`), 'utf8');
      assert.match(html, new RegExp(`data-composition-id="fair-film-${id}" data-composition-src="scenes/${id}\\.html"`));
      assert.match(child, new RegExp(`data-composition-id="fair-film-${id}"`));
      assert.match(child, new RegExp(`window\\.__timelines\\['fair-film-${id}'\\]`));
      assert.ok(child.indexOf('<template>') < child.indexOf('<style>'));
      assert.ok(child.indexOf('<script>') < child.indexOf('</template>'));
    }
    const questionHtml = await readFile(join(directory, 'scenes/question.html'), 'utf8');
    assert.doesNotMatch(questionHtml, /SECRET ANSWER/); assert.match(questionHtml, /What is the value of four/);
    assert.match(questionHtml, /duration:5,ease:'none'/);
    assert.match(html, /id="audio-question"[^>]+data-duration="6"/);
    assert.ok(composition.captions.every(caption => caption.end > caption.start));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('quality mode always uses the approved teaching-film treatment for non-base-ten scenes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-quality-film-'));
  try {
    const qualityScene = {
      id: 'quality-step', title: 'Focus on the clue', beat: 'concept',
      narration: 'Look at the clue and connect it to the main idea.', pauseSeconds: 0,
      visual: { kind: 'steps', label: 'One visible teaching action', items: ['Connect the clue to the idea.'] },
    };
    const qualityTrack = { sceneId: qualityScene.id, file: 'audio/quality.wav', durationSeconds: 4, envelope: [] };
    const composition = await fairCompose(
      { title: 'Quality film', audience: 'Primary', scenes: [qualityScene] },
      [qualityTrack],
      { avatar: 'mira', generationVersion: 'quality' },
      directory,
    );

    assert.equal(composition.animation.type, 'koobits-quality-v1');
    assert.equal(composition.animation.attention, 'purposeful pointers and staged reveals');
    const child = await readFile(join(directory, 'scenes', 'quality-step.html'), 'utf8');
    assert.match(child, /class="film-frame quality-film/);
    assert.match(child, /class="attention-pointer"/);
    assert.match(child, /LEARNING GOAL/);
    assert.match(child, /Focus here/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fairBaseTenAnimation } from '../src/animation.mjs';
import { fairCountingTimes } from '../src/discovery.mjs';

function operations(code) {
  const result = [], tl = {};
  for (const kind of ['fromTo', 'to', 'set']) tl[kind] = (...args) => {
    result.push({ kind, selector: args[0], target: args[kind === 'fromTo' ? 2 : 1], at: args[kind === 'fromTo' ? 3 : 2] });
    return tl;
  };
  new Function('tl', code)(tl);
  return result;
}

function render(mode, number, place = 'ones', gap = 12) {
  const narration = 'See the cubes. Group them carefully. Read the number.';
  const times = [0, .5, 1, 2, 2.5, 3, 2 + gap, 2.5 + gap, 3 + gap];
  const track = { durationSeconds: gap + 4, words: narration.split(' ').map((text, i) => ({ text, startSeconds: times[i], endSeconds: times[i] + .3 })) };
  const scene = { beat: 'concept', narration, visual: { kind: 'base-ten', mode, number, place, label: '<safe & exact>', cues: [
    { phrase: 'See the cubes', action: 'show-objects' },
    { phrase: 'Group them carefully', action: 'transform' },
    { phrase: 'Read the number', action: 'show-notation' },
  ] } };
  return fairBaseTenAnimation(scene, track, 'discovery-test');
}

function quantities(animation) {
  const blocks = [...animation.html.matchAll(/<g id="(discovery-test-block-\d+)" opacity="([\d.]+)">[\s\S]*?<rect width="([\d.]+)" height="([\d.]+)"/g)]
    .map(([, id, opacity, width, height]) => ({ id, opacity: Number(opacity), value: Number(height) / Number(width) }));
  const ops = operations(animation.code).sort((a, b) => a.at - b.at);
  let initial = 0, final = 0;
  for (const block of blocks) {
    initial += block.opacity * block.value;
    let visible = block.opacity;
    for (const op of ops) if (op.selector === `#${block.id}` && op.target.opacity !== undefined) visible = op.target.opacity;
    final += visible * block.value;
  }
  return { initial, final, blocks, ops };
}

test('grouping and trading conserve actual rendered cube quantities at boundaries', () => {
  for (const number of [10, 11, 19, 20, 23, 59, 60, 90, 99]) for (const mode of ['group', 'trade']) {
    const animation = render(mode, number), { initial, final, ops } = quantities(animation);
    assert.equal(animation.closeup, true);
    assert.equal(initial, number, `${mode} ${number} initial rendered quantity`);
    assert.equal(final, number, `${mode} ${number} final rendered quantity`);
    const notation = animation.cues[2].at + .35;
    for (const op of ops.filter(op => op.selector.includes('-block-'))) {
      assert.ok(Number.isFinite(op.at));
      assert.ok(op.at + (op.target.duration || 0) <= notation + 1e-8, `${mode} ${number}: blocks settle before notation`);
    }
    assert.match(animation.html, /aria-label="&lt;safe &amp; exact&gt;"/);
  }
});

test('23 bundles sequentially; each rod waits for all ten matching cubes to arrive', () => {
  const animation = render('group', 23), { ops } = quantities(animation);
  assert.equal(animation.proof.length, 2);
  assert.ok(animation.proof[0].settledAt < animation.proof[1].at);
  for (let bundle = 0; bundle < 2; bundle++) {
    const rod = ops.find(op => op.selector === `#discovery-test-block-${23 + bundle}` && op.target.opacity === 1);
    const arrivals = Array.from({ length: 10 }, (_, i) => ops.find(op => op.selector === `#discovery-test-block-${bundle * 10 + i}` && op.target.x !== undefined));
    assert.equal(arrivals.length, 10);
    assert.ok(arrivals.every(op => op.at + op.target.duration <= rod.at + 1e-8));
    assert.equal(new Set(arrivals.map(op => op.target.y)).size, 10);
  }
  for (let i = 20; i < 23; i++) assert.ok(!ops.some(op => op.selector === `#discovery-test-block-${i}` && op.target.opacity === 0), 'leftover cubes stay visible');
});

test('spoken counting chooses the full contiguous count inside the cue interval', () => {
  const track = { words: [
    { text: 'ten', startSeconds: 0 },
    ...['ten,', 'twenty,', 'thirty,', 'forty.'].map((text, i) => ({ text, startSeconds: 4 + i })),
    { text: 'ten', startSeconds: 12 },
  ] };
  assert.deepEqual(fairCountingTimes(track, [10, 20, 30, 40], 2, 9), [4, 5, 6, 7]);
  const fallback = fairCountingTimes({ words: [] }, [1, 2, 3], 2, 8);
  assert.ok(fallback.every(time => time >= 2 && time < 8));
  assert.ok(fallback[0] < fallback[1] && fallback[1] < fallback[2]);
  assert.deepEqual(fairCountingTimes(track, [], 2, 8), []);
});

test('expanded counting reaches the selected place value without showing notation early', () => {
  for (const [number, place, expected] of [[1, 'ones', 1], [23, 'ones', 3], [42, 'tens', 40], [99, 'tens', 90], [99, 'ones', 9]]) {
    const animation = render('expanded', number, place);
    assert.equal(animation.proof.at(-1).value, expected);
    const transform = animation.cues[1].at + .35, notation = animation.cues[2].at + .35;
    assert.ok(animation.proof.every(item => item.at >= transform && item.at < notation));
    const equation = operations(animation.code).find(op => op.selector === '#discovery-test-notation');
    assert.equal(equation.at, notation);
  }
  const zero = render('zero', 20);
  assert.match(zero.html, /No ones/);
  assert.equal(zero.proof.length, 0);
});

test('the renderer schedules four tens at the spoken count words with the audio lead-in', () => {
  const narration = 'See the rods. Focus on the tens. Ten, twenty, thirty, forty. Read the value.';
  const words = narration.split(' ').map((text, i) => ({ text, startSeconds: i * .5, endSeconds: i * .5 + .4 }));
  const scene = { beat: 'answer', narration, visual: { kind: 'base-ten', mode: 'expanded', number: 42, place: 'tens', label: 'Four tens', cues: [
    { phrase: 'See the rods', action: 'show-objects' },
    { phrase: 'Focus on the tens', action: 'transform' },
    { phrase: 'Read the value', action: 'show-notation' },
  ] } };
  const animation = fairBaseTenAnimation(scene, { words, durationSeconds: 8 }, 'discovery-test');
  assert.deepEqual(animation.proof.map(item => item.value), [10, 20, 30, 40]);
  assert.deepEqual(animation.proof.map(item => item.at), words.slice(7, 11).map(word => word.startSeconds + .35));
  const bounces = operations(animation.code).filter(op => op.selector.includes('-block-') && op.target.y === -12);
  assert.deepEqual(bounces.map(op => op.at), animation.proof.map(item => item.at));
});

test('hundreds and multiplication retain the established renderer instead of truncating to two places', () => {
  for (const [mode, number, place] of [['expanded', 100, 'hundreds'], ['group', 230, 'tens'], ['digit-shift', 23, 'ones']]) {
    const animation = render(mode, number, place);
    assert.notEqual(animation.closeup, true);
    assert.equal(animation.state.finalValue, mode === 'digit-shift' ? number * 10 : number);
    assert.match(animation.html, /HUNDREDS/);
    assert.doesNotMatch(animation.code, /NaN|undefined|Infinity/);
  }
});

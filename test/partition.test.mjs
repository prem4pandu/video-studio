import test from 'node:test';
import assert from 'node:assert/strict';
import { FAIR_PARTITION_BAR, fairFractionModel, fairPartGeometry, fairPartitionMotion, fairPartitionSvg } from '../src/partition.mjs';

test('the model only accepts genuinely equivalent fractions with a whole-number factor', () => {
  const model = fairFractionModel('1/2', '2/4');
  assert.deepEqual({ n: model.n, d: model.d, en: model.target.n, ed: model.target.d, factor: model.factor }, { n: 1, d: 2, en: 2, ed: 4, factor: 2 });
  assert.equal(fairFractionModel('1/2', '3/8'), null, 'unequal fractions are refused');
  assert.equal(fairFractionModel('2/3', '4/6').factor, 2);
  assert.equal(fairFractionModel('banana', null), null);
});

test('geometry is derived, not invented: shade length is exactly n/d of the bar', () => {
  const model = fairFractionModel('3/4', '6/8');
  const { html } = fairPartitionSvg({ fraction: '3/4', equivalent: '6/8', id: 'x', label: 'three quarters' });
  const shadeWidth = Number(html.match(/id="x-shade"[^>]*width="([\d.]+)"/)[1]);
  assert.ok(Math.abs(shadeWidth - FAIR_PARTITION_BAR.width * 3 / 4) < 0.01);
  const parts = fairPartGeometry(model, 8);
  assert.equal(parts.length, 8);
  assert.equal(parts.filter(part => part.shaded).length, 6);
  assert.equal(parts.at(-1).x + parts.at(-1).width, FAIR_PARTITION_BAR.x + FAIR_PARTITION_BAR.width);
});

test('the SVG carries a persistent shade rectangle, one cut per new boundary and the invariant marker', () => {
  const { html } = fairPartitionSvg({ fraction: '1/2', equivalent: '2/4', id: 'f', label: 'one half' });
  assert.match(html, /id="f-shade"/);
  assert.equal((html.match(/id="f-cut-/g) ?? []).length, 3, 'fourths need three cuts');
  assert.match(html, /id="f-invariant"/);
  assert.match(html, /id="f-num-a"/); assert.match(html, /id="f-num-b"[^>]*opacity="0"/);
  assert.match(html, /id="f-den-a"/); assert.match(html, /id="f-den-b"[^>]*opacity="0"/);
});

test('the motion never animates the shade during the cuts, and cues the cut sounds', () => {
  const { model, parts } = fairPartitionSvg({ fraction: '1/2', equivalent: '2/4', id: 'f', label: 'one half' });
  const phraseAt = fraction => 100 + fraction * 10;
  const motion = fairPartitionMotion({ id: 'f', model, parts, phraseAt });
  const cutSection = motion.code.split('#f-invariant')[0];
  assert.doesNotMatch(cutSection, /attr:\{x:|attr:\{width:/, 'geometry is fixed; only the cuts are drawn');
  const shadeAnimations = [...motion.code.matchAll(/#f-shade'[^;]*/g)].map(match => match[0]);
  assert.ok(shadeAnimations.every(line => /scaleX|opacity/.test(line)), 'the shaded rectangle is only wiped, never resized');
  assert.equal(motion.cues.filter(cue => cue.name === 'tick').length, 2, 'one tick per new cut');
  assert.ok(motion.cues.some(cue => cue.name === 'chime'), 'the conclusion chimes');
  for (const cue of motion.cues) assert.ok(cue.at >= 100 && cue.at <= 111, `cue inside the scene: ${cue.at}`);
  assert.ok(motion.phases.cutAt < motion.phases.countAt && motion.phases.countAt < motion.phases.equalAt);
});

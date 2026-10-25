import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAIR_DEFAULT_BPM, fairMixGraph, fairSfx, fairSfxPlan, fairSfxWav, fairSnapToBeat, fairSynthBed } from '../src/audio.mjs';
import { fairInteractionFor } from '../src/interaction.mjs';
import { fairIntroClip, fairIntroSeconds, fairOutroClip, fairOutroSeconds } from '../src/intro.mjs';
import { fairCompose } from '../src/composition.mjs';

const wavHeader = buffer => ({ riff: buffer.toString('ascii', 0, 4), wave: buffer.toString('ascii', 8, 12), rate: buffer.readUInt32LE(24), data: buffer.readUInt32LE(40) });
const peakBetween = (buffer, fromSeconds, toSeconds, rate = 24000) => {
  let maximum = 0;
  const end = Math.min(buffer.length, 44 + buffer.readUInt32LE(40));
  const start = 44 + Math.max(0, Math.round(fromSeconds * rate)) * 2;
  const stop = Math.min(end, 44 + Math.round(toSeconds * rate) * 2);
  for (let at = start; at + 1 < stop; at += 2) maximum = Math.max(maximum, Math.abs(buffer.readInt16LE(at)));
  return maximum;
};
const peak = buffer => peakBetween(buffer, 0, buffer.readUInt32LE(40) / 2 / 24000);

test('sound effects are deterministic, audible and free of licence', () => {
  for (const name of ['tick', 'chime', 'whoosh', 'success', 'hmm', 'pen', 'click', 'pop']) {
    const first = fairSfx(name), second = fairSfx(name);
    assert.deepEqual(Buffer.from(first.buffer), Buffer.from(second.buffer), `${name} must be reproducible`);
    assert.ok(first.length > 100, `${name} has samples`);
    assert.ok(first.some(value => Math.abs(value) > 0.01), `${name} is audible`);
  }
});

test('effect plan ticks when a thinking pause opens and chimes when it closes', () => {
  const scenes = [
    { id: 'q', beat: 'question', start: 10, speechStart: 10.35, pauseSeconds: 5, duration: 18, track: { durationSeconds: 12 } },
    { id: 'a', beat: 'answer', start: 28, speechStart: 28.35, pauseSeconds: 0, duration: 10, track: { durationSeconds: 8 } },
  ];
  const events = fairSfxPlan({ scenes, cuts: [0, 10, 28], bpm: FAIR_DEFAULT_BPM });
  const tick = events.find(event => event.name === 'tick'), chime = events.find(event => event.name === 'chime');
  assert.equal(tick.at, 10.35 + 12);
  assert.equal(chime.at, 10.35 + 12 + 5);
  assert.ok(events.filter(event => event.name === 'whoosh').every(event => event.at > 0), 'the opening frame is not a cut');
});

test('the bed is deterministic, bounded and the effect track lands on its cue', () => {
  const first = fairSynthBed({ durationSeconds: 2, bpm: 88, mood: 'focus' });
  const second = fairSynthBed({ durationSeconds: 2, bpm: 88, mood: 'focus' });
  assert.deepEqual(first, second);
  const header = wavHeader(first);
  assert.equal(header.riff, 'RIFF'); assert.equal(header.wave, 'WAVE'); assert.equal(header.rate, 24000);
  assert.ok(Math.abs(peak(first) / 32767 - 0.55) < 0.02, 'peak is normalised well below full scale');

  const track = fairSfxWav([{ name: 'chime', at: 1, gain: 1 }], 2);
  assert.equal(wavHeader(track).rate, 24000);
  assert.equal(peakBetween(track, 0, 0.9), 0, 'no sound before the cue');
  assert.ok(peakBetween(track, 1.0, 1.4) > 200, 'sound at the cue');
});

test('beat snapping only nudges within its budget', () => {
  assert.equal(fairSnapToBeat(1.0, 88, 2, 0.12), fairSnapToBeat(1.0, 88, 2, 0.12));
  const beat = 60 / 88;
  const snapped = fairSnapToBeat(beat * 3 + 0.01, 88, 2);
  assert.ok(snapped !== beat * 3 + 0.01);
  assert.equal(fairSnapToBeat(beat * 3 + 0.5, 88, 2), beat * 3 + 0.5, 'large offsets are left alone');
});

test('mix graph ducks the bed under the voice, thins it during pauses and lands one loudness target', () => {
  const graph = fairMixGraph({ durationSeconds: 100, pauses: [{ start: 20, end: 25 }] });
  assert.match(graph, /sidechaincompress=/);
  assert.match(graph, /between\(t,20\.000,25\.000\)/);
  assert.match(graph, /loudnorm=I=-16/);
  assert.match(graph, /amix=inputs=3/);
  assert.doesNotMatch(graph, /undefined|NaN/);
});

test('interaction options are derived from the answer and refuse ambiguity', () => {
  const question = { id: 'q', beat: 'question', pauseSeconds: 8, visual: { kind: 'recap', items: ['3/8', '6/8', '4/5'], label: 'choose' } };
  const answer = { id: 'a', beat: 'answer', visual: { kind: 'fraction-bars', fraction: '3/4', equivalent: '6/8', label: 'six eighths' } };
  const derived = fairInteractionFor([question, answer], 0);
  assert.deepEqual(derived.options.map(option => option.correct), [false, true, false]);
  assert.equal(derived.waitSeconds, 8);

  const ambiguous = { ...question, visual: { kind: 'recap', items: ['2/4', '3/6', '4/5'], label: 'choose' } };
  assert.equal(fairInteractionFor([ambiguous, answer], 0), null, 'two equivalent options are ambiguous');

  const twoCorrect = { ...question, interaction: { options: [{ label: '3/8', correct: false }, { label: '6/8', correct: true }, { label: '4/5', correct: true }] } };
  assert.equal(fairInteractionFor([twoCorrect, answer], 0), null, 'exactly one correct option is required');

  const explicit = { ...question, interaction: { type: 'predict', options: [{ label: 'stays the same', correct: true }, { label: 'gets bigger', correct: false }], prompt: 'What happens to the amount?' } };
  const node = fairInteractionFor([explicit, answer], 0);
  assert.equal(node.type, 'predict'); assert.equal(node.prompt, 'What happens to the amount?');
});

test('title cards last a whole number of beats and escape lesson text', () => {
  const beat = 60 / FAIR_DEFAULT_BPM;
  for (const style of ['card', 'sting']) {
    const seconds = fairIntroSeconds(style);
    assert.ok(Math.abs(seconds / beat - Math.round(seconds / beat)) < 1e-6, `${style} is beat aligned`);
    assert.ok(Math.abs(fairOutroSeconds() / beat - Math.round(fairOutroSeconds() / beat)) < 1e-6);
  }
  const lesson = { title: 'A <big> & bold title', audience: 'Year 5', objectives: [{ text: 'Explain <why> it works' }], scenes: [{ beat: 'recap', title: 'Recall', visual: { kind: 'recap', items: ['Same whole', 'Scale both'] } }] };
  const intro = fairIntroClip({ lesson, brief: {}, duration: 2.7, id: 'intro' });
  assert.match(intro.html, /A &lt;big&gt; &amp; bold title/);
  assert.match(intro.html, /Explain &lt;why&gt; it works/);
  assert.ok(!intro.html.includes('<big>'));
  const outro = fairOutroClip({ lesson, brief: {}, start: 100, duration: 3, id: 'outro' });
  assert.match(outro.html, /Same whole/);
  assert.match(outro.code, /100/);
});

test('composer renders the title sequence, an interactive question and an answer reveal, and withholds the hook answer', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fair-phase-a-'));
  t.after(() => import('node:fs/promises').then(fs => fs.rm(directory, { recursive: true, force: true })));
  const scene = (id, beat, narration, visual, pauseSeconds = 0) => ({ id, beat, title: `${beat} title`, narration, objectiveIds: ['equal'], pauseSeconds, questionId: beat === 'question' ? 'q1' : beat === 'answer' ? 'q1' : null, mathClaims: [], visual });
  const lesson = { title: 'Same amount', audience: 'Ages 9–10', scenes: [
    scene('hook', 'hook', 'Fold the strip and predict what happens to the amount.', { kind: 'fraction-bars', fraction: '1/2', equivalent: '2/4', label: 'Predict first' }, 4),
    scene('work', 'example', 'Split every half into two equal pieces.', { kind: 'fraction-bars', fraction: '1/2', equivalent: '2/4', label: 'Split each half' }),
    scene('ask', 'question', 'Which fraction keeps the same amount?', { kind: 'recap', items: ['3/8', '6/8', '4/5'], label: 'Choose one' }, 8),
    scene('reveal', 'answer', 'Six eighths keeps the same amount because both numbers doubled.', { kind: 'fraction-bars', fraction: '3/4', equivalent: '6/8', label: 'Six eighths' }),
    scene('recap', 'recap', 'Remember: same whole, same shaded amount.', { kind: 'recap', items: ['Same whole', 'Same amount'], label: 'The rule' }),
  ] };
  const tracks = lesson.scenes.map(item => ({ sceneId: item.id, file: `audio/${item.id}.wav`, durationSeconds: 4, envelope: [{ at: 0, value: 0.2 }], sha256: 'a'.repeat(64) }));
  const composition = await fairCompose(lesson, tracks, { avatar: 'mira', intro: 'card', audio: 'music' }, directory);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const section = id => html.match(new RegExp(`<section id="fair-${id}"[\\s\\S]*?</section>`))?.[0] ?? '';

  assert.equal(composition.intro.applied, true);
  assert.ok(composition.durationSeconds > composition.scenes.reduce((sum, item) => sum + item.duration, 0), 'intro and outro extend the timeline');
  assert.match(html, /data-width="1920" data-height="1080"/);
  assert.match(html, /id="fair-intro"/); assert.match(html, /id="fair-outro"/);

  assert.doesNotMatch(section('hook'), /target-row/, 'the hook must not show the repartition');
  // The example and answer scenes are rendered by the partition engine.
  assert.match(section('work'), /class="partition-stage"/);
  assert.match(section('work'), /-outline/);
  assert.match(section('reveal'), /class="partition-stage"/);
  assert.doesNotMatch(section('work'), /target-row/, 'the old static two-row template must not render');

  const ask = section('ask');
  assert.equal((ask.match(/choice-card/g) ?? []).length, 3);
  // The countdown is its own timed clip so the ring runs exactly for pauseSeconds.
  const pauseClip = html.match(/<div id="pause-ask"[\s\S]*?<\/div><\/div>/)?.[0] ?? '';
  assert.match(pauseClip, /think-ring-ask/);
  const ring = composition.scenes.find(item => item.id === 'ask');
  assert.match(pauseClip, new RegExp(`data-start="${(ring.speechStart + ring.track.durationSeconds).toFixed ? (ring.speechStart + ring.track.durationSeconds) : 0}"`));
  const reveal = section('reveal');
  assert.equal((reveal.match(/answer-chip/g) ?? []).length, 3);
  assert.match(reveal, /answer-chip correct/);
  assert.ok((reveal.match(/answer-chip dimmed/g) ?? []).length === 2);

  const storyboard = JSON.parse(await readFile(join(directory, 'storyboard.json'), 'utf8'));
  assert.equal(storyboard.interactions.length, 1);
  assert.deepEqual(storyboard.interactions[0].options.map(option => option.correct), [false, true, false]);
  // The hook prediction and the practice question both pause, so the bed thins twice.
  assert.equal(storyboard.audioCues.pauses.length, 2);
  assert.ok(storyboard.audioCues.pauses.every(pause => pause.end > pause.start));
  assert.ok(storyboard.audioCues.cuts.every(time => time > 0));
  assert.match(await readFile(join(directory, 'captions.vtt'), 'utf8'), /^WEBVTT\n/);
});

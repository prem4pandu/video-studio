import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fairOpenRenderPlan, fairOpenCaptions, fairRenderOpenLesson } from '../src/open-render.mjs';
import { fairCommand, fairFileHash } from '../src/utils.mjs';

const scene = { id: 'concept', beat: 'concept', title: 'Tens', narration: 'See twenty three ones. Bundle ten ones together. Now two tens and three ones.', pauseSeconds: 0, objectiveIds: ['value'], visual: { kind: 'base-ten', mode: 'group', number: 23, place: 'ones', label: 'Twenty three', cues: [{ action: 'show-objects', phrase: 'See' }, { action: 'transform', phrase: 'Bundle' }, { action: 'show-notation', phrase: 'Now' }] } };
const track = { sceneId: scene.id, durationSeconds: 3, file: 'audio/concept.wav' };
const lesson = { title: 'Tens', scenes: [scene], quality: { reviewed: true, warnings: [] }, curriculum: { warnings: [] }, objectives: [{ id: 'value', text: 'Identify tens' }] };

test('open render plan derives exact base-ten quantities, cue order and measured durations', () => {
  for (const [mode, number, place, initial, final] of [
    ['group', 23, 'ones', [23, 0, 0], [3, 2, 0]], ['trade', 123, 'tens', [3, 12, 0], [3, 2, 1]],
    ['digit-shift', 23, 'ones', [3, 2, 0], [0, 3, 2]], ['zero', 102, 'tens', [2, 0, 1], [2, 0, 1]],
    ['expanded', 345, 'hundreds', [5, 4, 3], [5, 4, 3]],
  ]) {
    const plan = fairOpenRenderPlan({ scenes: [{ ...scene, visual: { ...scene.visual, mode, number, place } }] }, [track]);
    assert.deepEqual(plan.scenes[0].state.initial, initial);
    assert.deepEqual(plan.scenes[0].state.final, final);
    assert.equal(plan.scenes[0].startSeconds, 5);
    assert.equal(plan.scenes[0].durationSeconds, 3.7);
    assert.ok(plan.scenes[0].cues[0].at < plan.scenes[0].cues[1].at);
  }
});

test('practice questions cannot leak visual answers or answer-bearing titles', () => {
  const plan = fairOpenRenderPlan({ scenes: [{ ...scene, beat: 'question', title: 'ANSWER SECRET', visual: { kind: 'steps', items: ['ANSWER SECRET'] }, pauseSeconds: 5 }] }, [track]);
  assert.equal(JSON.stringify(plan).includes('ANSWER SECRET'), false);
  assert.equal(plan.scenes[0].visual, undefined);
  assert.equal(plan.scenes[0].title, 'Your turn');
  assert.equal(plan.scenes[0].durationSeconds, 8.7);
});

test('unknown visuals and missing narration fail without substitution', () => {
  assert.throws(() => fairOpenRenderPlan({ scenes: [{ ...scene, visual: { kind: 'unsupported' } }] }, [track]), /Unsupported/);
  assert.throws(() => fairOpenRenderPlan(lesson, []), /Missing measured narration/);
});

test('captions start after silent establishing shot and escape text markup', () => {
  const modified = { ...scene, narration: 'Read <tag> & then think carefully.' };
  const plan = fairOpenRenderPlan({ scenes: [{ ...modified, beat: 'question' }] }, [track]);
  const captions = fairOpenCaptions(plan, [track]);
  assert.match(captions.vtt, /00:00:05.350 --> 00:00:08.350/);
  assert.match(captions.vtt, /&lt;tag&gt; &amp;/);
});

test('open-source renderer rejects paid providers and missing review', async () => {
  await assert.rejects(fairRenderOpenLesson(lesson, { provider: 'openai' }, '/unused'), /local lesson/);
  await assert.rejects(fairRenderOpenLesson(lesson, { provider: 'local', voiceProvider: 'say' }, '/unused'), /Qwen3-TTS, Piper or Kokoro/);
  await assert.rejects(fairRenderOpenLesson({ ...lesson, quality: {} }, { provider: 'local' }, '/unused'), /critique/);
});

for (const clipDuration of [5.04, .708, 0]) test(`real FFmpeg assembly with ${clipDuration}s fixture includes audio, subtitles, duration and manifest (Manim/Wan/narration are test fixtures)`, async t => {
  try { await fairCommand('ffmpeg', ['-version']); await fairCommand('ffprobe', ['-version']); }
  catch { t.skip('FFmpeg and ffprobe are unavailable'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'fair-open-render-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rendered = await fairRenderOpenLesson(lesson, { provider: 'local', voiceProvider: clipDuration ? 'piper' : 'qwentts', footage: clipDuration ? 'wan' : 'none', targetSeconds: 60 }, directory, {
    command: async (bin, args, options) => {
      if (args[0] === '-c') return { stdout: 'test-fixture', stderr: '' };
      if (String(args[0]).endsWith('manim-scene.py')) return fairCommand('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1280x720:r=30:d=3.7', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', args[2]]);
      return fairCommand(bin, args, options);
    },
    narrate: async (_, output) => {
      await mkdir(join(output, 'audio'), { recursive: true });
      const file = join(output, track.file);
      await fairCommand('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '24000', '-ac', '1', file]);
      return [{ ...track, sha256: await fairFileHash(file) }];
    },
    generateWan: async ({ directory: output }) => {
      assert.ok(clipDuration > 0, 'No-footage rendering must not call Wan');
      await mkdir(output, { recursive: true });
      const file = join(output, 'fair-test-wan.mp4');
      await fairCommand('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=blue:s=1280x704:r=24:d=${clipDuration}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      return { file, sha256: await fairFileHash(file), provenance: { testFixture: true } };
    },
  });
  assert.equal(rendered.report.passed, true);
  assert.ok(Math.abs(rendered.report.durationSeconds - (clipDuration > 5 ? 8.7 : clipDuration ? 4.4 : 3.7)) < .2);
  const footage = JSON.parse(await readFile(join(rendered.projectDir, 'wan-provenance.json'), 'utf8'));
  assert.equal(footage.enabled, clipDuration > 0);
  const manifest = JSON.parse(await readFile(join(rendered.projectDir, 'manifest.json'), 'utf8'));
  assert.ok(manifest.artifacts.some(item => item.file === 'manim-scene.py'));
  for (const artifact of manifest.artifacts) assert.equal(await fairFileHash(join(rendered.projectDir, artifact.file)), artifact.sha256);
});

test('trusted Python source parses without requiring Manim installation', async () => {
  await fairCommand('python3', ['-c', 'import ast; ast.parse(open("scripts/manim-scene.py").read())']);
});

test('short Wan establishing shots preserve real duration instead of holding fabricated frames', () => {
  const plan = fairOpenRenderPlan(lesson, [track], { introSeconds: .7 });
  assert.equal(plan.scenes[0].startSeconds, .7);
  assert.equal(plan.durationSeconds, 4.4);
  assert.throws(() => fairOpenRenderPlan(lesson, [track], { introSeconds: .2 }), /between/);
});

test('real Manim renders all visuals and maximum base-ten grouping without executing generated code', async t => {
  const python = process.env.FAIR_MANIM_PYTHON || 'python3';
  try { await fairCommand(python, ['-c', 'import manim']); }
  catch { t.skip('Set FAIR_MANIM_PYTHON to an installed Manim 0.22 interpreter for real renderer verification.'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'fair-manim-qa-'));
  if (process.env.FAIR_KEEP_RENDER_QA !== '1') t.after(() => rm(directory, { recursive: true, force: true }));
  else t.diagnostic(`Real Manim QA artifacts: ${directory}`);
  const visuals = [
    { ...scene.visual, mode: 'group', number: 999, place: 'ones' },
    { ...scene.visual, mode: 'group', number: 990, place: 'tens' },
    { ...scene.visual, mode: 'trade', number: 999, place: 'tens' },
    { ...scene.visual, mode: 'digit-shift', number: 99, place: 'tens' },
    { ...scene.visual, mode: 'zero', number: 909, place: 'tens' },
    { ...scene.visual, mode: 'expanded', number: 999, place: 'hundreds' },
    { kind: 'place-value', number: '1234.5678', highlightPlace: -3, label: 'The thousandths place' },
    { kind: 'equation', lines: ['20 + 3 = 23', '2 × 10 = 20'], label: 'Two tens' },
    { kind: 'comparison', left: '20', right: '2', leftLabel: 'Value', rightLabel: 'Digit' },
    { kind: 'number-line', min: -10, max: 10, mark: -3, label: 'Three below zero' },
    { kind: 'steps', items: ['Count the tens', 'Multiply by ten'], label: 'Find the value' },
    { kind: 'recap', items: ['Ten ones make a ten', 'Each place has a value'], label: 'Remember' },
  ];
  const scenes = visuals.map((visual, index) => ({ ...scene, id: `scene-${index}`, title: `${visual.kind} ${visual.mode || ''}`, visual }));
  scenes.push({ ...scene, id: 'question', beat: 'question', title: 'SECRET ANSWER', narration: 'In forty three, what is the value of the digit four?', pauseSeconds: .5 });
  const tracks = scenes.map(item => ({ ...track, sceneId: item.id, durationSeconds: .9 }));
  const plan = fairOpenRenderPlan({ scenes }, tracks);
  plan.captions = fairOpenCaptions(plan, tracks).captions;
  plan.width = 640; plan.height = 360;
  const file = join(directory, 'fair-render-plan.json'), output = join(directory, 'fair-render.mp4');
  await writeFile(file, JSON.stringify(plan));
  await fairCommand(python, ['scripts/manim-scene.py', file, output], { timeoutMs: 180_000 });
  const { stdout } = await fairCommand('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', output]);
  const media = JSON.parse(stdout);
  assert.ok(media.streams.some(stream => stream.codec_type === 'video'));
  assert.ok(Math.abs(Number(media.format.duration) - (plan.durationSeconds - plan.introSeconds)) < .1);
});

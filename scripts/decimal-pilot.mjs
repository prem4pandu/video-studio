import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairEscape, fairHash, fairFileHash, fairWriteJson } from '../src/utils.mjs';
import { fairQwenPaths, fairQwenProfile } from '../src/qwen-voice.mjs';
import { fairAlignSpeech } from '../src/alignment.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(repo, '.fair-video/decimal-pilot');
const spec = JSON.parse(await readFile(join(repo, 'content/decimal-pilot.json'), 'utf8'));
const assets = join(project, 'assets');
await mkdir(assets, { recursive: true });
await writeFile(join(assets, 'gsap.min.js'), await readFile(join(repo, 'node_modules/gsap/dist/gsap.min.js')));

// Keep decimal arithmetic in integer hundredths, including the visual counts.
export function decimalParts(value) {
  assert.match(value, /^\d\.\d{2}$/);
  const [whole, fraction] = value.split('.');
  return { whole: Number(whole), tenths: Number(fraction[0]), hundredths: Number(fraction[1]), total: Number(whole) * 100 + Number(fraction) };
}
const worked = decimalParts(spec.workedNumber), practice = decimalParts(spec.practiceNumber);
assert.equal(worked.total, 347);
assert.equal(worked.tenths * 10, 40);
assert.ok(worked.tenths * 10 > worked.hundredths);
assert.equal(practice.hundredths, 3);
assert.equal(new Set(spec.segments.map(s => s.id)).size, spec.segments.length);

const paths = fairQwenPaths(), profile = await fairQwenProfile();
const voiceLines = spec.segments.map(s => ({ ...s, output: join(assets, `${s.id}-${fairHash({ text: s.text, profile, temperature: .6, mode: 'paragraph' }).slice(0, 14)}.wav`) }));
await fairWriteJson(join(project, 'voice-request.json'), { ...paths, ...profile, lines: voiceLines });
if (!process.argv.includes('--reuse-voice')) {
  await fairCommand(paths.python, [join(repo, 'scripts/decimal-voice.py'), join(project, 'voice-request.json')], { timeoutMs: 600_000, env: { ...process.env, HF_HUB_OFFLINE: '1' }, onOutput: chunk => process.stdout.write(chunk) });
}
let cursor = .7;
const segments = [];
for (const line of voiceLines) {
  const { stdout } = await fairCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', line.output]);
  const duration = Number(stdout.trim());
  assert.ok(duration > .5 && duration < 35, `Implausible audio duration: ${line.id}`);
  let track;
  let mergedWordBoundaries = 0;
  try { track = await fairAlignSpeech(line.text, line.output, { durationSeconds: duration,
    sha256: await fairFileHash(line.output), phrases: [{ text: line.text, startSeconds: 0, endSeconds: duration }] },
    { env: { ...process.env, FAIR_ALIGNMENT_MODEL_DIR: join(repo, '.fair-neural/qwen-aligner-8bit') } }); }
  catch (error) {
    if (!error.message.startsWith('Invalid forced-alignment timestamps')) throw error;
    // The 80ms aligner can merge short function words. Keep those boundaries
    // explicit and use grouped captions, never invent individual word timings.
    const raw = JSON.parse(await readFile(`${line.output}.alignment-output.json`, 'utf8'));
    const expected = line.text.split(/\s+/);
    assert.equal(raw.words.length, expected.length);
    let previous = 0;
    raw.words.forEach((w, i) => {
      const normalized = text => text.toLowerCase().replaceAll('’', "'").replace(/[^\p{L}\p{N}']/gu, '');
      assert.equal(normalized(w.text), normalized(expected[i]));
      assert.ok(Number.isFinite(w.startSeconds) && Number.isFinite(w.endSeconds));
      assert.ok(w.startSeconds >= previous - .03 && w.endSeconds >= w.startSeconds && w.endSeconds <= duration + .03);
      if (w.endSeconds === w.startSeconds) mergedWordBoundaries++;
      previous = w.endSeconds;
    });
    assert.ok(mergedWordBoundaries > 0);
    track = { words: raw.words };
  }
  segments.push({ ...line, start: cursor, duration, words: track.words, mergedWordBoundaries });
  cursor += duration + .45 + (line.pauseAfter || 0);
}
const duration = Math.ceil(cursor + .4), byId = Object.fromEntries(segments.map(s => [s.id, s]));
let transcription = null;
try { transcription = JSON.parse(await readFile(join(project, 'independent-transcription.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const cue = id => byId[id].start;
const spoken = (id, word, occurrence = 0) => {
  const matches = byId[id].words.filter(w => w.text.toLowerCase().replace(/[^a-z]/g, '') === word.toLowerCase());
  assert.ok(matches[occurrence], `Missing cue ${id}/${word}/${occurrence}`);
  assert.ok(matches[occurrence].endSeconds > matches[occurrence].startSeconds, `Ambiguous semantic cue ${id}/${word}`);
  return cue(id) + matches[occurrence].startSeconds;
};
const escape = fairEscape;
// Studio needs registered clocks even though the teaching motion uses native WAAPI.
const clock = id => `<script>{const timeline = gsap.timeline({paused:true});timeline.to({clock:0},{clock:${duration},duration:${duration},ease:'none'});window.__timelines['${id}']=timeline;}</script>`;
const brief = `---\nworkflow: general-video\nflow: automation\nstoryboard: no\naudience: "Ages 9–10"\naspect: "16:9"\nlanguage: en\nmessage: "A digit's place determines its value."\n---\n\n# Decimal teaching prototype\n\nUser requested a test of the revised pipeline. The larger product targets ages 4–15; this test targets ages 9–10 only.\n\nA narrated, original decimal workshop with a Blender-authored reusable guide and exact native-browser mathematics. No generative footage, paid APIs, music bed, cloned voices, or automatic claim of educator approval.\n\nMeasured duration: ${duration}s. A four-second practice pause is preserved. This is a curated production prototype, not a test of autonomous lesson planning. Final export requires preview approval.\n`;
await writeFile(join(project, 'BRIEF.md'), brief);
await writeFile(join(project, 'frame.md'), `# Decimal Workshop\n\nWarm paper #f7ead6; ink #183e3a; tenths teal #287a70; hundredths terracotta #b2492c. Montserrat for language and Space Mono for precise arithmetic. Large central teaching object, consistent whole, stable camera. A small porcelain guide is secondary to the mathematics. No decorative looping motion during explanations. No flashing, camera shake or parallax.\n`);
await writeFile(join(project, 'STORYBOARD.md'), spec.segments.map((s, i) => `## Frame ${i + 1}: ${s.id}\nstatus: animated\nsrc: compositions/workshop.html\nMotion: native WAAPI, svg-path-draw for partitions, measured sequential quantity reveals.\nNarration: ${s.text}\nStart: ${cue(s.id).toFixed(3)}; voice: ${byId[s.id].duration.toFixed(3)}s.\n`).join('\n'));

const anims = [];
function animate(selector, frames, start, seconds = .45, easing = 'cubic-bezier(.22,1,.36,1)') {
  anims.push({ selector, frames, start, seconds, easing });
}
function appear(selector, at, seconds = .4) { animate(selector, [{ opacity: 0 }, { opacity: 1 }], at, seconds); }
function disappear(selector, at) { animate(selector, [{ opacity: 1 }, { opacity: 0 }], at, .25); }

const gridX = 480, gridY = 300, cell = 47, gridSize = cell * 10;
function square(x, y, size, fill, extra = '') { return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${fill}" ${extra}/>`; }
const emptyGrid = square(gridX, gridY, gridSize, '#eee4d1', 'stroke="#657e71" stroke-width="3"');
const strips = Array.from({ length: 4 }, (_, c) => `<rect id="strip-${c}" x="${gridX + c * cell}" y="${gridY}" width="${cell}" height="${gridSize}" fill="#287a70"/>`).join('');
const smallSquares = Array.from({ length: 7 }, (_, r) => square(gridX + 4 * cell, gridY + r * cell, cell, '#b2492c', `id="hundredth-${r}"`)).join('');
const verticalLines = Array.from({ length: 9 }, (_, c) => `<path id="vertical-${c}" d="M${gridX + (c + 1) * cell},${gridY}v${gridSize}" stroke="#657e71" stroke-width="2" fill="none"/>`).join('');
const horizontalLines = Array.from({ length: 9 }, (_, r) => `<path id="horizontal-${r}" d="M${gridX},${gridY + (r + 1) * cell}h${gridSize}" stroke="#657e71" stroke-width="2" fill="none"/>`).join('');
const tiles = Array.from({ length: 3 }, (_, i) => square(226, 335 + i * 144, 112, '#e2bf6e', 'stroke="#997538" stroke-width="3"')).join('');
const practiceGrid = Array.from({ length: 100 }, (_, i) => {
  const c = Math.floor(i / 10), r = i % 10;
  return square(gridX + c * cell, gridY + r * cell, cell - 1, c < 6 ? '#287a70' : c === 6 && r < 3 ? '#b2492c' : '#eee4d1', 'stroke="#657e71" stroke-width="1"');
}).join('');
const digitMarkup = (value, id) => `<div id="${id}"><div class="digits"><span>${value[0]}</span><span>.</span><span class="teal">${value[2]}</span><span class="rust">${value[3]}</span></div><div class="digit-labels"><span>${value[0]} ones</span><span class="teal">${value[2]} tenths</span><span class="rust">${value[3]} hundredths</span></div></div>`;
appear('#workshop-wholes', cue('whole'));
appear('#tile-board', cue('whole') + Math.min(3.1, byId.whole.duration * .55));
for (let c = 0; c < 9; c++) {
  animate(`#vertical-${c}`, [{ strokeDashoffset: gridSize }, { strokeDashoffset: 0 }], cue('tenths') + .4 + c * .08, .65);
  animate(`#horizontal-${c}`, [{ strokeDashoffset: gridSize }, { strokeDashoffset: 0 }], cue('hundredths') + .35 + c * .07, .65);
}
for (let c = 0; c < 4; c++) appear(`#strip-${c}`, spoken('tenths', 'four') + c * .20, .15);
for (let r = 0; r < 7; r++) appear(`#hundredth-${r}`, spoken('hundredths', 'seven') + r * .12, .12);
appear('#tenths-note', spoken('tenths', 'zero'));
appear('#hundredths-note', spoken('hundredths', 'zero'));
appear('#compare-note', cue('compare') + .7);
appear('#forty-outline', cue('compare') + .1);
animate('#value-comparison', [{opacity:0},{opacity:1,offset:.02},{opacity:1,offset:.97},{opacity:0}], spoken('compare', 'more'), cue('practice')-spoken('compare','more'));
disappear('#worked-content', cue('practice') - .15);
disappear('#worked-number', cue('practice') - .15);
appear('#practice-content', cue('practice'));
appear('#practice-number', cue('practice'));
appear('#practice-heading', cue('practice'));
disappear('#main-heading', cue('practice') - .3);
appear('#practice-answer', cue('answer'));
appear('#final-rule', cue('answer') + byId.answer.duration * .6);
appear('#guide-still', 2.2, .001);

const captionItems = [];
for (const s of segments) {
  const words = s.words;
  const chunks = [];
  for (let i = 0; i < words.length; i += 9) chunks.push(words.slice(i, i + 9));
  for (const [i, group] of chunks.entries()) {
    captionItems.push({ id: `${s.id}-${i}`, text: group.map(w=>w.text).join(' '), start: s.start + group[0].startSeconds,
      duration: group.at(-1).endSeconds - group[0].startSeconds });
  }
}
await fairWriteJson(join(project, 'captions.json'), { timingSource: 'forced-alignment', cues: captionItems });
const captions = captionItems.map(c => `<div id="caption-${c.id}" class="clip caption" data-start="${c.start}" data-duration="${c.duration}" data-track-index="3"><div>${escape(c.text)}</div></div>`).join('');
const workshop = `<template><style>
#workshop{position:absolute;inset:0;width:100%;height:100%;background:#f7ead6;color:#183e3a;font-family:Montserrat,sans-serif;overflow:hidden}
#workshop *{box-sizing:border-box} .workshop-title{position:absolute;left:192px;top:112px;width:1536px;font-size:58px;line-height:1.15;font-weight:900;letter-spacing:-1.5px;margin:0}
.eyebrow{position:absolute;left:194px;top:65px;font-size:22px;font-weight:700;letter-spacing:3px;color:#52675c}
.paper-board{position:absolute;left:177px;top:247px;width:861px;height:591px;border-radius:24px;background:#fff9eb;box-shadow:0 12px 0 #dacbb0,0 15px 32px #503f2115}
.board-pin{position:absolute;top:268px;width:17px;height:17px;border-radius:50%;background:#a68d67}.label{position:absolute;font-size:25px;font-weight:700;margin:0}.digits{position:absolute;left:1180px;top:244px;display:flex;font-family:'Space Mono',monospace;font-size:136px;line-height:1;font-weight:700;letter-spacing:-10px}
.teal{color:#20695f}.rust{color:#a63c24}.digit-labels{position:absolute;left:1186px;top:397px;display:flex;gap:24px;font-size:20px;font-weight:700}.note{position:absolute;font-family:'Space Mono',monospace;font-size:30px;font-weight:700;margin:0}
.robot{position:absolute;left:1290px;top:487px;width:340px;height:425px;object-fit:contain}.robot-shadow{position:absolute;left:1352px;top:870px;width:211px;height:25px;border-radius:50%;background:#d4c4a3}
.desk{position:absolute;left:0;right:0;bottom:0;height:165px;background:#dfc297;border-top:8px solid #c9a576}.desk-line{position:absolute;left:110px;right:110px;top:948px;height:2px;background:#caa979}
.comparison{position:absolute;left:1130px;top:437px;width:563px;font-family:'Space Mono',monospace;font-size:46px;font-weight:700;text-align:center}
.practice-task{position:absolute;left:1130px;top:437px;width:563px;font-size:29px;line-height:1.3;font-weight:700;text-align:center}.final-rule{position:absolute;left:192px;top:873px;font-size:32px;font-weight:700;margin:0}
@media(prefers-reduced-motion:reduce){.robot{display:none}}
</style><div id="workshop" data-composition-id="workshop" data-width="1920" data-height="1080" data-duration="${duration}">
<div class="desk"></div><div class="desk-line"></div><div class="eyebrow">THE DECIMAL WORKSHOP</div>
<h1 id="main-heading" class="workshop-title">Can a smaller digit be worth more?</h1>
<h1 id="practice-heading" class="workshop-title">Your turn. What is the 3 worth?</h1>
<div class="paper-board"></div><div class="board-pin" style="left:199px"></div><div class="board-pin" style="left:999px"></div>
<div id="worked-content"><svg width="1920" height="900" viewBox="0 0 1920 900" style="position:absolute;inset:0" aria-label="Three whole tiles and an enlarged fourth tile partitioned into tenths and hundredths">
<g id="workshop-wholes">${tiles}</g><g id="tile-board">${emptyGrid}${strips}${smallSquares}${verticalLines}${horizontalLines}<rect id="forty-outline" x="${gridX}" y="${gridY}" width="188" height="470" fill="none" stroke="#123e37" stroke-width="6" rx="4"/></g></svg>
<p class="label" style="left:219px;top:288px">3 wholes</p><p class="label" style="left:480px;top:255px">The next whole · enlarged view</p>
<p id="tenths-note" class="note teal" style="left:478px;top:796px">4 tenths = 0.4</p>
<p id="hundredths-note" class="note rust" style="left:478px;top:842px">7 hundredths = 0.07</p>
<p id="compare-note" class="note teal" style="left:199px;top:867px;font-size:23px">4 tenths = 40 hundredths</p></div>
${digitMarkup(spec.workedNumber, 'worked-number')}${digitMarkup(spec.practiceNumber, 'practice-number')}
<div id="value-comparison" class="comparison"><span class="teal">0.4</span> &gt; <span class="rust">0.07</span></div>
<div id="practice-content"><svg width="1920" height="900" viewBox="0 0 1920 900" style="position:absolute;inset:0" aria-label="Six tenths and three hundredths on a hundred-square">${practiceGrid}</svg><p class="label" style="left:480px;top:255px">The fractional part · same whole</p><div class="practice-task">What does the <span class="rust">3</span> contribute?</div></div>
<div id="practice-answer" class="note rust" style="left:478px;top:796px">3 hundredths = 0.03</div>
<p id="final-rule" class="final-rule">A digit’s place tells us its value.</p>
<div class="robot-shadow"></div><video id="guide-intro" class="clip robot" src="assets/robot-intro.webm" muted playsinline data-start="0.7" data-duration="1.5" data-track-index="1"></video><img id="guide-still" class="robot" src="assets/robot-pointing.png" alt="Original porcelain robot guide directing attention towards the model"/>
</div><script>
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motions = ${JSON.stringify(anims)};
for (const m of motions) {
  const el = document.querySelector(m.selector);
  if (!el) throw new Error('Missing animation target '+m.selector);
  if (m.frames[0].strokeDashoffset !== undefined) el.style.strokeDasharray = '${gridSize}';
  const a = el.animate(m.frames, {duration:reduced?1:m.seconds*1000,delay:m.start*1000,fill:'both',iterations:1,easing:m.easing});
  a.pause();
}
</script></template>`;
await mkdir(join(project, 'compositions'), { recursive: true });
await writeFile(join(project, 'compositions/workshop.html'), workshop.replace('</template>', `${clock('workshop')}</template>`));
const captionComp = `<template><style>#captions{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.caption{position:absolute;left:192px;top:956px;width:1536px;height:68px;display:flex;justify-content:center;align-items:center;font:700 33px/1.25 Montserrat,sans-serif;color:#fff8eb}.caption>div{background:#183e3a;padding:13px 28px;border-radius:12px;max-width:1536px;text-align:center}</style><div id="captions" data-composition-id="captions" data-duration="${duration}" data-width="1920" data-height="1080">${captions}</div></template>`;
await writeFile(join(project, 'compositions/captions.html'), captionComp.replace('</template>', `${clock('captions')}</template>`));
const audio = segments.map(s => `<audio id="voice-${s.id}" src="assets/${s.output.split('/').at(-1)}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="2" data-volume="1"></audio>`).join('\n');
const index = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(spec.title)}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#decimal-pilot{position:relative;width:100%;height:100%;background:#f7ead6}.clip{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="decimal-pilot" data-composition-id="decimal-pilot" data-width="1920" data-height="1080" data-duration="${duration}"><div class="clip" data-composition-id="workshop" data-composition-src="compositions/workshop.html" data-start="0" data-duration="${duration}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div><div class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${duration}" data-track-index="3" data-track-kind="captions" data-width="1920" data-height="1080"></div>${audio}</div></body></html>`;
await writeFile(join(project, 'index.html'), index
  .replace('</head>', '<script src="assets/gsap.min.js"></script></head>')
  .replace('</body>', `${clock('decimal-pilot')}</body>`)
  .replace('class="clip" data-composition-id="workshop"', 'id="workshop-host" class="clip" data-composition-id="workshop"')
  .replace('class="clip" data-composition-id="captions"', 'id="captions-host" class="clip" data-composition-id="captions"'));
await fairWriteJson(join(project, 'pilot-report.json'), {
  status: 'awaiting-preview-review', durationSeconds: duration, audience: spec.audience,
  curatedPrototype: true, autonomousPlanningTested: false, educatorApproved: false, childTested: false,
  maths: { worked, practice, unit: 'one tile', comparisonInHundredths: [40, 7], practiceAnswerInHundredths: 3 },
  captionTiming: 'forced-alignment', mergedWordBoundaries: segments.reduce((n,s)=>n+s.mergedWordBoundaries,0),
  narrationIndependentTranscription: Boolean(transcription), humanListeningReview: false,
  pronunciationReview: 'Needs human review: independent ASR ambiguously rendered hundredths in two sections.',
  studioClock: 'existing GSAP 3.14.2 dependency, custom licence; native WAAPI drives teaching animation',
  segments: await Promise.all(segments.map(async ({ output, ...s }) => ({ ...s, file: output.split('/').at(-1), sha256: await fairFileHash(output) }))),
  scriptSha256: await fairFileHash(join(repo, 'content/decimal-pilot.json')),
  limitations: ['Curated script and art direction, not autonomous generation.', 'No educator or learner study.', 'Forced alignment does not independently verify speech; voice needs a listening review.', 'Guide has a short Blender-rendered introductory gesture, then a still pointing pose during explanations.']
});
for (const s of segments) s.sha256 = await fairFileHash(s.output);
await fairWriteJson(join(project, 'narration-manifest.json'), segments.map(({ output, ...s }) => ({ ...s, file: output.split('/').at(-1) })));
console.log(JSON.stringify({ project, durationSeconds: duration, cues: Object.fromEntries(segments.map(s => [s.id, s.start])), words: spec.segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0) }, null, 2));

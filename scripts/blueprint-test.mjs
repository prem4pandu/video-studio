import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairCommand, fairEscape, fairHash, fairFileHash, fairWriteJson } from '../src/utils.mjs';
import { fairQwenPaths, fairQwenProfile } from '../src/qwen-voice.mjs';
import { fairAlignSpeech } from '../src/alignment.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(repo, '.fair-video/decimal-blueprint-test');
const spec = JSON.parse(await readFile(join(repo, 'content/decimal-blueprint-test.json'), 'utf8'));
const assets = join(project, 'assets');
await mkdir(assets, { recursive: true });
assert.equal(spec.representation.rows * spec.representation.columns, 100);
assert.equal(new Set(spec.beats.map(b => b.id)).size, spec.beats.length);
for (const beat of spec.beats) {
  for (const key of ['learnerQuestion', 'startState', 'action', 'endState', 'text']) assert.ok(beat[key]?.length > 10, `${beat.id}: missing ${key}`);
  if (beat.assessment) {
    const i = spec.beats.indexOf(beat);
    assert.equal(spec.beats[i + 1]?.id, beat.assessment.answerBeat);
    assert.ok(beat.pauseAfter >= 7);
  }
}
const paths = fairQwenPaths(), profile = await fairQwenProfile();
const lines = spec.beats.map(b => ({ ...b, output: join(assets, `${b.id}-${fairHash({ text: b.text, profile, temperature: .6, mode: 'paragraph' }).slice(0, 14)}.wav`) }));
await fairWriteJson(join(project, 'voice-request.json'), { ...paths, ...profile, lines });
if (!process.argv.includes('--reuse-voice')) {
  await fairCommand(paths.python, [join(repo, 'scripts/decimal-voice.py'), join(project, 'voice-request.json')], {
    timeoutMs: 900_000, env: { ...process.env, HF_HUB_OFFLINE: '1' }, onOutput: chunk => process.stdout.write(chunk)
  });
}
if (process.argv.includes('--voice-only')) process.exit(0);

let cursor = .6;
const segments = [];
for (const line of lines) {
  const { stdout } = await fairCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', line.output]);
  const seconds = Number(stdout.trim());
  assert.ok(seconds > 1 && seconds < 40, `Implausible speech length: ${line.id}`);
  let track;
  try {
    track = await fairAlignSpeech(line.text, line.output, { durationSeconds: seconds, sha256: await fairFileHash(line.output),
      phrases: [{ text: line.text, startSeconds: 0, endSeconds: seconds }] },
    { env: { ...process.env, FAIR_ALIGNMENT_MODEL_DIR: join(repo, '.fair-neural/qwen-aligner-8bit') } });
  } catch (error) {
    if (!error.message.startsWith('Invalid forced-alignment timestamps')) throw error;
    // The local aligner's 80ms resolution can merge function words; captions use groups.
    track = JSON.parse(await readFile(`${line.output}.alignment-output.json`, 'utf8'));
    const expected = line.text.split(/\s+/);
    assert.equal(track.words.length, expected.length);
    const norm = text => text.toLowerCase().replaceAll('’', "'").replace(/[^\p{L}\p{N}']/gu, '');
    let previous = 0;
    for (const [i, word] of track.words.entries()) {
      assert.equal(norm(word.text), norm(expected[i]));
      assert.ok(Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds));
      assert.ok(word.startSeconds >= previous - .03 && word.endSeconds >= word.startSeconds && word.endSeconds <= seconds + .03);
      previous = word.endSeconds;
    }
  }
  segments.push({ ...line, start: cursor, duration: seconds, words: track.words });
  cursor += seconds + .55 + line.pauseAfter;
}
const duration = Math.ceil(cursor + .5);
const byId = Object.fromEntries(segments.map(s => [s.id, s]));
const start = id => byId[id].start;
const end = id => start(id) + byId[id].duration;
const word = (id, match, occurrence = 0) => {
  const candidates = byId[id].words.filter(w => w.text.toLowerCase().replace(/[^a-z]/g, '') === match);
  const selected = candidates[occurrence];
  assert.ok(selected && selected.endSeconds > selected.startSeconds, `Missing or ambiguous semantic cue ${id}/${match}/${occurrence}`);
  return start(id) + selected.startSeconds;
};

await copyFile(join(repo, 'node_modules/gsap/dist/gsap.min.js'), join(assets, 'gsap.min.js'));
await mkdir(join(assets, 'fonts'), { recursive: true });
// Freeze the fonts already localised by the first prototype; never fetch at playback.
const previousPreview = join(repo, '.fair-video/decimal-pilot/.hyperframes/preview');
let fontFaces = '';
for (const file of (await readdir(previousPreview)).filter(f => f.endsWith('.html')).sort()) {
  const html = await readFile(join(previousPreview, file), 'utf8');
  const faces = [...html.matchAll(/@font-face\s*\{[^}]+\}/g)].map(m => m[0]);
  if (faces.some(f => /Montserrat/.test(f)) && faces.some(f => /Space Mono/.test(f))) {
    const selected = faces.filter(f => /Montserrat|Space Mono/.test(f));
    fontFaces = selected.map((face, i) => face.replace(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/, (_, data) => {
      const name = `font-${i}.woff2`;
      return `assets/fonts/${name}`;
    })).join('\n');
    for (const [i, face] of selected.entries()) {
      const data = face.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/)?.[1];
      assert.ok(data, 'Expected a frozen local font');
      await writeFile(join(assets, 'fonts', `font-${i}.woff2`), Buffer.from(data, 'base64'));
    }
    break;
  }
}
assert.ok(fontFaces.includes('Montserrat') && fontFaces.includes('Space Mono'), 'Missing cached fonts');
await fairWriteJson(join(project, 'narration-manifest.json'), segments.map(({ output, ...s }) => ({ ...s, file: output.split('/').at(-1) })));
await fairWriteJson(join(project, 'timing.json'), { duration, segments: segments.map(({id,start,duration}) => ({id,start,duration})) });

const esc = fairEscape;
const practiceStart = start('practice'), transferStart = start('transfer');
const sceneRanges = { model: [0, practiceStart], practice: [practiceStart, transferStart], transfer: [transferStart, duration] };
const actions = [];
function reveal(selector, at, seconds = .3) { actions.push({selector, at, seconds, from:{opacity:0}, to:{opacity:1}}); }
function hide(selector, at) { actions.push({selector, at, seconds:.15, from:{opacity:1}, to:{opacity:0}}); }
function draw(selector, at, seconds = .7) { actions.push({selector, at, seconds, draw:true}); }
function clip(id, html, at, until, cls = '') {
  assert.ok(until > at, `Invalid clip ${id}`);
  return `<div id="${id}" class="clip ${cls}" data-start="${at}" data-duration="${until-at}" data-track-index="0">${html}</div>`;
}
const note = (id, html, at, until, cls = '') => clip(id, html, at, until, `note ${cls}`);
const grid = (id, count, colour = '#287a70', size = 500) => {
  const unit = size / 10;
  return `<svg id="${id}" class="unit-grid" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="A whole divided into one hundred equal cells"><rect width="${size}" height="${size}" fill="#eee4d1"/>${Array.from({length:100}, (_,i) => `<rect data-cell="${i}" x="${Math.floor(i/10)*unit}" y="${i%10*unit}" width="${unit}" height="${unit}" fill="${i<count?colour:'#eee4d1'}" stroke="#657e71" stroke-width="1.5"/>`).join('')}<rect width="${size}" height="${size}" fill="none" stroke="#183e3a" stroke-width="4"/></svg>`;
};

const vLines = Array.from({length:9}, (_,i) => `<path id="model-v-${i}" class="partition" d="M${(i+1)*50} 0V500"/>`).join('');
const shortLines = Array.from({length:9}, (_,i) => `<path id="model-short-${i}" class="partition" d="M0 ${(i+1)*50}H50"/>`).join('');
const restLines = Array.from({length:9}, (_,i) => `<path id="model-rest-${i}" class="partition" d="M50 ${(i+1)*50}H500"/>`).join('');
const strips = Array.from({length:4}, (_,i) => `<rect id="model-strip-${i}" data-tenth="${i}" x="${i*50}" y="0" width="50" height="500" fill="#287a70"/>`).join('');
const seven = Array.from({length:7}, (_,i) => `<rect id="model-small-${i}" data-hundredth="${i}" x="200" y="${i*50}" width="50" height="50" fill="#b2492c"/>`).join('');
const counters = Array.from({length:10}, (_,i) => `<text id="model-count-${i}" x="25" y="${i*50+32}" text-anchor="middle" font-size="27" fill="#fff9eb" font-family="Space Mono">${i+1}</text>`).join('');
reveal('#model-square', word('whole','square'));
for (let i=0;i<9;i++) draw(`#model-v-${i}`, word('tenths','divide') + i*.09);
reveal('#model-strip-0', word('tenths','one'));
for (let i=0;i<9;i++) {
  draw(`#model-short-${i}`, word('hundredths','split')+i*.11, .55);
  draw(`#model-rest-${i}`, word('hundredths','across')+i*.08, .85);
}
const countStart = word('unit-bridge','count'), countEnd = word('unit-bridge','one',1);
assert.ok(countEnd > countStart, 'Cell counting needs a real spoken interval');
for (let i=0;i<10;i++) {
  reveal(`#model-count-${i}`, countStart + i*(countEnd-countStart-.6)/10, .12);
  hide(`#model-count-${i}`, start('four-tenths'));
}
const stripCues = [word('four-tenths','one'), word('four-tenths','two'), word('four-tenths','three'), word('four-tenths','four',1)];
for(let i=1;i<4;i++) reveal(`#model-strip-${i}`, stripCues[i], .25);
for(let i=0;i<7;i++) reveal(`#model-small-${i}`, word('seven-hundredths','add')+i*.16, .18);
reveal('#model-forty-outline', word('compare','forty'));
reveal('#model-seven-outline', word('compare','seven'));
const mainSquare = `<div id="model-square" class="main-square"><svg id="model-unit" width="500" height="500" viewBox="0 0 500 500" aria-label="The same whole throughout the explanation"><rect width="500" height="500" fill="#eee4d1"/>${strips}${seven}${vLines}${shortLines}${restLines}${counters}<rect width="500" height="500" stroke="#183e3a" stroke-width="4" fill="none"/><rect id="model-forty-outline" width="200" height="500" fill="none" stroke="#183e3a" stroke-width="7"/><rect id="model-seven-outline" x="200" width="50" height="350" fill="none" stroke="#183e3a" stroke-width="7"/></svg><p class="unit-label">1 whole · same boundary, same size</p></div>`;
let modelNotes = note('model-puzzle', '<p class="display-number">3.47</p><p class="question">Which contributes more: the 4 or the 7?</p><p class="support">Make a prediction.</p>', 0, start('whole'));
modelNotes += note('model-whole-note', '<p class="statement">The whole stays the same.</p><p class="support">Dividing changes the parts. It does not add more.</p>', start('whole'), start('tenths'));
modelNotes += note('model-tenth-note', '<p class="statement">1 of 10 equal parts</p><p class="equation teal">1 tenth = 0.1</p>', word('tenths','tenth'), start('hundredths'));
modelNotes += note('model-parts-note', '<p class="statement">10 strips</p><p class="equation">× 10 pieces each</p><p class="equation">= 100 equal pieces</p>', word('hundredths','across'), start('unit-bridge'));
modelNotes += note('model-unit-note', '<p class="statement">Same strip. Same amount.</p><p class="equation teal">1 tenth</p><p class="equation teal">= 10 hundredths</p>', start('unit-bridge'), start('four-tenths'));
for(const [i, token] of ['ten','twenty','thirty','forty'].entries()) {
  const at = word('four-tenths',token), until = i<3 ? word('four-tenths',['twenty','thirty','forty'][i]) : word('four-tenths','so');
  modelNotes += note(`model-count-total-${i}`, `<p class="display-number teal">${(i+1)*10}</p><p class="support">hundredths</p>`,at,until);
}
modelNotes += note('model-four-note','<p class="equation teal">4 tenths</p><p class="equation teal">= 40 hundredths</p><p class="equation teal">= 0.4</p>',word('four-tenths','so'),start('seven-hundredths'));
modelNotes += note('model-seven-note','<p class="equation teal">4 tenths = 0.4</p><p class="equation rust">7 hundredths = 0.07</p><p class="support">Each small piece is the same size.</p>',word('seven-hundredths','hundredths'),start('compare'));
modelNotes += note('model-compare-note','<p class="equation teal">40 hundredths</p><p class="equation">&gt; 7 hundredths</p><p class="equation">0.4 &gt; 0.07</p><p class="support">Compare values, not just digits.</p>',word('compare','forty'),start('assemble'));
modelNotes += note('model-assemble-note','<p class="display-number">3.<span class="teal">4</span><span class="rust">7</span></p><p class="equation">3 + <span class="teal">0.4</span> + <span class="rust">0.07</span></p><p class="support">The square shows only the fractional part: 0.47.</p>',start('assemble'),practiceStart);

const practiceDuration = transferStart-practiceStart, practiceAnswer = start('practice-answer')-practiceStart;
const practice = `<div class="exercise-number">2.63</div><p class="exercise-question">What value does the 3 contribute?</p>${clip('practice-think','<p class="think">Say the value and explain why. Pause for longer.</p>',0,practiceAnswer,'exercise-hint')}${clip('practice-solution',`<div class="practice-reveal"><div>${grid('practice-unit',3,'#b2492c',300)}<p class="unit-label">1 whole</p></div><div><p class="equation rust">3 hundredths = 0.03</p><p class="support">Tenths: first place after the point.</p><p class="support">Hundredths: second place after the point.</p></div></div>`,practiceAnswer,practiceDuration,'solution')}`;
const transferDuration = duration-transferStart, transferAnswer = start('transfer-answer')-transferStart;
const transfer = `<div class="transfer-numbers"><span>0.6</span><span>0.06</span></div>${clip('transfer-think','<p class="exercise-question">Same digit. Does it have the same value?</p><p class="think">Explain your answer. Pause for longer.</p>',0,transferAnswer,'transfer-prompt')}${clip('transfer-solution',`<div class="transfer-models"><div>${grid('transfer-tenths',60,'#287a70',300)}<p class="unit-label">1 whole</p><p class="equation teal">60 hundredths</p></div><div>${grid('transfer-hundredths',6,'#b2492c',300)}<p class="unit-label">1 whole</p><p class="equation rust">6 hundredths</p></div></div>`,transferAnswer,transferDuration,'solution')}${clip('transfer-rule','<p class="rule">How many units? Which units?</p>',start('recap')-transferStart,transferDuration,'recap-rule')}`;

const css = `${fontFaces}
*{box-sizing:border-box}p{margin:0} .scene-bg{position:absolute;inset:0;background:#f7ead6} .content{position:absolute;inset:0;color:#183e3a;font-family:Montserrat,sans-serif}
.header{position:absolute;left:192px;right:192px;top:116px;font-size:58px;line-height:1.17;font-weight:800;letter-spacing:-1.4px;margin:0}
.eyebrow{position:absolute;left:194px;top:65px;font-size:22px;letter-spacing:3px;font-weight:700;color:#52675c}
.main-square{position:absolute;left:290px;top:305px;width:500px;height:565px}.unit-label{font-size:25px;line-height:1.3;font-weight:600;text-align:center;margin-top:20px}
.partition{fill:none;stroke:#657e71;stroke-width:2}.note{position:absolute;left:1010px;top:325px;width:680px;height:500px;display:flex;flex-direction:column;justify-content:center;gap:24px}
#model-puzzle{left:290px;width:1340px;text-align:center;align-items:center}
.display-number{font:700 140px/1.1 'Space Mono',monospace;letter-spacing:-7px}.statement{font-size:43px;line-height:1.3;font-weight:700}.equation{font:700 40px/1.4 'Space Mono',monospace}.question{font-size:40px;line-height:1.3;font-weight:600}.support{font-size:29px;line-height:1.45;font-weight:500}.teal{color:#20695f}.rust{color:#a63c24}
.exercise-number{position:absolute;top:255px;left:192px;right:192px;text-align:center;font:700 150px/1.1 'Space Mono',monospace}.exercise-question{font-size:40px;line-height:1.35;font-weight:700;text-align:center}.exercise-question:not(.transfer-prompt .exercise-question){position:absolute;top:440px;left:192px;right:192px}
.exercise-hint{position:absolute;left:192px;right:192px;top:555px}.think{text-align:center;font-size:30px;line-height:1.5;font-weight:500}.solution{position:absolute;inset:0}.practice-reveal{position:absolute;top:535px;left:330px;right:280px;display:flex;align-items:center;gap:85px}.practice-reveal .support{margin-top:18px}
.transfer-numbers{position:absolute;top:250px;left:300px;right:300px;display:flex;justify-content:space-around;font:700 120px/1.1 'Space Mono',monospace}.transfer-prompt{position:absolute;top:490px;left:192px;right:192px}.transfer-prompt .think{margin-top:38px}.transfer-models{position:absolute;top:430px;left:350px;right:350px;display:flex;justify-content:space-between;text-align:center}.transfer-models .equation{font-size:31px;margin-top:12px}.rule{font-size:38px;font-weight:700;text-align:center}.recap-rule{position:absolute;top:875px;left:192px;right:192px}
.unit-grid{display:block}.guide{position:absolute;right:60px;bottom:135px;width:160px;height:200px;object-fit:contain}.footer-rule{position:absolute;left:192px;right:192px;top:935px;height:2px;background:#dacbb0}
@media(prefers-reduced-motion:reduce){.guide{display:none}}
`;

await mkdir(join(project,'compositions'),{recursive:true});
const sceneFiles = [];
for(const [scene, [at,until]] of Object.entries(sceneRanges)) {
  const id = `lesson-${scene}`, seconds = until-at;
  const headings = segments.filter(s=>s.scene===scene).map((s,i,all)=>clip(`${id}-title-${s.id}`,`<h1 class="header">${esc(s.title)}</h1>`,s.start-at,(all[i+1]?.start??until)-at,'title')).join('');
  const body = scene==='model' ? mainSquare+modelNotes : scene==='practice'?practice:transfer;
  const sceneActions = scene==='model' ? actions.map(a=>({...a,at:a.at-at})) : [];
  const js = `{
    const timeline=gsap.timeline({paused:true});
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motions=${JSON.stringify(sceneActions)};
    for(const m of motions){
      const el=document.querySelector(m.selector); if(!el)throw new Error('Missing teaching target '+m.selector);
      if(m.draw){const len=el.getTotalLength();el.style.strokeDasharray=len;timeline.fromTo(el,{strokeDashoffset:len},{strokeDashoffset:0,duration:reduced?.001:m.seconds,ease:'none',immediateRender:true},m.at);}
      else{timeline.fromTo(el,m.from,{...m.to,duration:reduced?.001:m.seconds,ease:'power2.out',immediateRender:m.from.opacity===0},m.at);}
    }
    window.__timelines['${id}']=timeline;
  }`;
  const html=`<template><style>${css}#${id}{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}</style><div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${seconds}"><div class="scene-bg"></div><div class="content"><p class="eyebrow">THE DECIMAL WORKSHOP · ${scene==='model'?'EXPLORE':scene==='practice'?'YOUR TURN':'TRANSFER'}</p>${headings}${body}<div class="footer-rule"></div></div></div><script>${js}</script></template>`;
  const file=`compositions/${scene}.html`;
  await writeFile(join(project,file),html);
  sceneFiles.push({id,at,seconds,file});
}

const captions=[];
for(const s of segments) for(let i=0;i<s.words.length;i+=8){
  const group=s.words.slice(i,i+8),at=s.start+group[0].startSeconds,until=s.start+group.at(-1).endSeconds;
  assert.ok(until>at);
  captions.push({id:`caption-${s.id}-${i}`,text:group.map(w=>w.text).join(' '),start:at,end:until});
}
await fairWriteJson(join(project,'captions.json'),{timingSource:'forced-alignment-grouped',cues:captions});
const captionHtml=captions.map(c=>clip(c.id,`<div>${esc(c.text)}</div>`,c.start,c.end,'caption')).join('');
await writeFile(join(project,'compositions/captions.html'),`<template><style>${fontFaces}#lesson-captions{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.caption{position:absolute;top:960px;left:192px;width:1536px;height:70px;display:flex;justify-content:center;align-items:center;font:600 32px/1.3 Montserrat,sans-serif;color:#fff9eb}.caption>div{background:#183e3a;padding:12px 28px;border-radius:12px;text-align:center;max-width:1536px}</style><div id="lesson-captions" data-composition-id="lesson-captions" data-width="1920" data-height="1080" data-duration="${duration}">${captionHtml}</div><script>{window.__timelines['lesson-captions']=gsap.timeline({paused:true});}</script></template>`);
const hosts=sceneFiles.map(s=>`<div id="${s.id}" class="clip scene-host" data-composition-id="${s.id}" data-composition-src="${s.file}" data-start="${s.at}" data-duration="${s.seconds}" data-track-index="0" data-width="1920" data-height="1080"></div>`).join('');
const audio=segments.map(s=>`<audio id="voice-${s.id}" src="assets/${s.output.split('/').at(-1)}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="2" data-volume="1"></audio>`).join('');
// Studio reads the root timeline's length; a real lesson-progress rule spans it.
await writeFile(join(project,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><script src="assets/gsap.min.js"></script><style>${fontFaces}html,body{margin:0;width:100%;height:100%;overflow:hidden}#${spec.id}{position:relative;width:100%;height:100%;background:#f7ead6}.scene-host{position:absolute;inset:0;width:100%;height:100%}#lesson-progress{position:absolute;left:192px;top:935px;width:1536px;height:3px;background:#287a70;transform-origin:0% 50%;z-index:5}</style></head><body><div id="${spec.id}" data-composition-id="${spec.id}" data-width="1920" data-height="1080" data-duration="${duration}">${hosts}<div id="lesson-progress" aria-label="Lesson progress"></div><div id="lesson-captions" class="clip scene-host" data-composition-id="lesson-captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${duration}" data-track-index="3" data-track-kind="captions" data-width="1920" data-height="1080"></div>${audio}</div><script>{const timeline=gsap.timeline({paused:true});timeline.fromTo('#lesson-progress',{scaleX:0},{scaleX:1,duration:${duration},ease:'none'},0);window.__timelines['${spec.id}']=timeline;}</script></body></html>`);
await fairWriteJson(join(project,'compositions/model.motion.json'),{duration:practiceStart,assertions:[{kind:'appearsBy',selector:'#model-square',bySec:word('whole','square')+1},{kind:'before',a:'#model-strip-1',b:'#model-small-0'},{kind:'staysInFrame',selector:'#model-unit'}]});
await fairWriteJson(join(project,'index.motion.json'),{duration,assertions:[{kind:'appearsBy',selector:'#model-square',bySec:word('whole','square')+1},{kind:'before',a:'#model-strip-1',b:'#model-small-0'},{kind:'staysInFrame',selector:'#model-unit'}]});
await writeFile(join(project,'BRIEF.md'),`---\nworkflow: general-video\nflow: automation\nstoryboard: no\naudience: "Ages 9–10"\naspect: "16:9"\nlanguage: en\nlength: "about 3 minutes; actual narration sets timing"\nmessage: "A digit's place determines its contribution."\n---\n\n## Intent\n\nTest the user's accepted instructional blueprint before another polished production. Preserve the original 54-second pilot. Use one fixed whole, staged visual reasoning, a new-value question and a transfer question.\n\n## Notes\n\nCurated planning-contract test, not autonomous LLM planning. The user approved the plan in conversation; no additional intermediate storyboard approval is inferred. Final preview approval is still required before MP4 export. Local Qwen voice; no paid calls, model downloads, music or decorative camera motion. Measured duration: ${duration}s.\n`);
await writeFile(join(project,'frame.md'),`# Decimal Workshop — instructional animatic\n\n## Concept\nA single whole becomes understandable through equal partitioning; the child's prediction is resolved by visible evidence. Preserve the original workshop's warm palette and font pairing. Supporting reference: Notion's editorial hierarchy and restrained surface treatments, not its branding or product layout.\n\n## Palette\nPaper #f7ead6; ink #183e3a; muted ink #52675c; neutral whole #eee4d1; grid #657e71; tenths #287a70 with text #20695f; hundredths #b2492c with text #a63c24; light text #fff9eb; rule #dacbb0.\n\n## Typography\nMontserrat 500/600/700/800 for language. Space Mono 700 for arithmetic. Fonts frozen from the previous prototype's localised preview. Headlines 58px; explanations 29–43px; digits 120–150px; captions 32px.\n\n## Layout and motion\nWhole fixed at (290,305), 500px square. Native SVG exact equal-area cells. GSAP seek-safe svg-path-draw and discrete-text-sequence rules; semantic movements use measured speech anchors. Three continuous teaching scenes, no wipes, zooms, loops, music or gratuitous effects. Motion weighting: Jakub polish, Jhey curiosity; pedagogical legibility overrides promotional motion advice. Reduced-motion mode changes partition reveals to instant state changes. Captions stay below 960px. All answer layers remain absent from view until the corresponding answer beat.\n`);
await writeFile(join(project,'STORYBOARD.md'),`---\nformat: 1920x1080\nduration: ${duration}s\nmessage: "A digit's place determines its contribution."\narc: "Predict → partition → relate units → compare → practise → transfer"\naudience: "Ages 9–10"\nmode: autonomous\n---\n\n`+segments.map((s,i)=>`## Frame ${i+1} — ${s.title}\n\n- status: animated\n- src: compositions/${s.scene}.html\n- duration: ${s.duration+s.pauseAfter+.55}s\n- voiceover: "${s.text}"\n- scene: ${s.action}\n- poster: ${s.start+(s.duration/2)}s\n\nLearner question: ${s.learnerQuestion}\n\nBefore: ${s.startState}\n\nAfter: ${s.endState}\n\nMotion: svg-path-draw for equal partitions; discrete-text-sequence for staged notation and explanation. Stable unit geometry, no decorative movement.\n`).join('\n'));
await fairWriteJson(join(project,'lesson-blueprint.json'),spec);
await fairWriteJson(join(project,'test-report.json'),{status:'awaiting-technical-and-human-review',durationSeconds:duration,planningMode:spec.planningMode,autonomousPlanningTested:false,educatorApproved:false,childTested:false,humanListeningReview:false,finalMp4Exported:false,scriptSha256:await fairFileHash(join(repo,'content/decimal-blueprint-test.json')),maths:{tenthsInWhole:10,hundredthsInTenth:10,hundredthsInWhole:100,comparison:[40,7],practiceAnswerHundredths:3,transferHundredths:[60,6]},assessmentWindows:['practice','transfer'].map(id=>({id,questionStart:start(id),speechEnd:end(id),answerStart:start(byId[id].assessment.answerBeat),pauseSeconds:start(byId[id].assessment.answerBeat)-end(id)})),semanticMotionCues:actions,limitations:['Curated content; no autonomous planner evaluated','No educator or child validation','Forced alignment checks timing, not spoken correctness','GSAP uses its existing custom license; this is not a fully permissively licensed toolchain']});
console.log(JSON.stringify({project,duration,words:spec.beats.reduce((n,b)=>n+b.text.split(/\s+/).length,0),timing:segments.map(({id,start,duration})=>({id,start,duration}))},null,2));

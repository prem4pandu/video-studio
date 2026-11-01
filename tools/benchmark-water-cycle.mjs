// Benchmark: one excellent 2.5D water-cycle segment proving the visual target.
// Layered landscape + camera moves + particles/VFX, rendered through the pinned
// OpenMontage/HyperFrames worker — same production path as Studio V2.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { renderWithOpenMontage } from '../studio-v2/worker/index.mjs';
import { fairCommand } from '../src/utils.mjs';
import { mascotSvg, mouthSets, visemeTimeline, idleTimeline, gestureTimeline, loadAlignmentWords } from './mascot.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const job = join(repo, '.fair-video/studio-v2/c336b84e-ced4-4674-917d-5eea904c37af/project/audio');
const root = join(repo, '.fair-video/benchmark');
const workspace = join(root, 'workspace');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const q = v => JSON.stringify(v).replace(/</g, '\\u003c');
const rnd = (i, a = 1) => a * (0.5 + ((i * 2654435761) % 1000) / 1000);

const P = { bg: '#eaf6f8', ink: '#14383a', muted: '#43615e', accent: '#0a766b', second: '#ac4e20', soft: '#dcece6' };

// ---- layered artwork ------------------------------------------------------
const mountainsFar = `<path d="M-100 800 L260 520 L480 690 L720 470 L1000 720 L1240 500 L1520 700 L1780 480 L2020 720 L2020 1100 L-100 1100 Z" fill="#a9c8cd"/>`;
const mountainsNear = `<path d="M-100 860 L180 640 L420 780 L640 600 L900 800 L1160 640 L1400 820 L1660 660 L2020 840 L2020 1100 L-100 1100 Z" fill="#79a8ab"/>`;
const hills = `<path d="M-100 920 Q300 820 700 890 T1400 880 T2020 900 L2020 1100 L-100 1100 Z" fill="#7fa98e"/>`;
const ocean = `
 <rect x="-100" y="930" width="2200" height="260" fill="#5f9eaa"/>
 <rect x="-100" y="930" width="2200" height="60" fill="#74b3bd" opacity=".7"/>
 <g id="wavelet">${[0, 1, 2, 3].map(j => `<path d="M-80 ${950 + j * 38} Q120 ${930 + j * 38} 320 ${950 + j * 38} T720 ${950 + j * 38} T1120 ${950 + j * 38} T1520 ${950 + j * 38} T2020 ${950 + j * 38}" fill="none" stroke="#bfe3ea" stroke-width="${7 - j}" opacity="${.5 - j * .08}"/>`).join('')}</g>`;
const sun = `<g id="sun" transform="translate(1560 210)"><circle r="86" fill="#f2b64a"/><circle r="112" fill="none" stroke="#f2b64a" stroke-width="10" opacity=".35"/><g id="rays">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${Math.cos(a) * 130} ${Math.sin(a) * 130} l${Math.cos(a) * 42} ${Math.sin(a) * 42}" stroke="#f2b64a" stroke-width="14" stroke-linecap="round" opacity=".8"/>`; }).join('')}</g></g>`;
const cloudG = (id, x, y, s) => `<g id="${id}" transform="translate(${x} ${y}) scale(${s})"><g fill="#ffffff"><ellipse cx="-80" cy="14" rx="70" ry="42"/><ellipse cx="10" cy="-16" rx="82" ry="56"/><ellipse cx="92" cy="18" rx="64" ry="40"/><rect x="-150" y="4" width="290" height="60" rx="30"/></g></g>`;
const vapor = Array.from({ length: 16 }, (_, i) => {
  const x = 420 + (i % 8) * 130 + rnd(i, 30);
  return `<circle class="vp" id="vp-${i}" cx="${x}" cy="${920 - rnd(i + 3, 30)}" r="${7 + rnd(i + 7, 5)}" fill="#ffffff" opacity="0"/>`;
}).join('');
const rain = Array.from({ length: 22 }, (_, i) => {
  const x = 900 + (i % 11) * 60 + rnd(i, 20);
  return `<path class="rn" id="rn-${i}" d="M${x} ${520 + rnd(i + 5, 30)} l${-14} ${70 + rnd(i + 9, 30)}" stroke="#4a86a0" stroke-width="${5 + rnd(i + 2, 3)}" stroke-linecap="round" opacity="0"/>`;
}).join('');
const ripples = Array.from({ length: 6 }, (_, i) => `<ellipse class="rp" id="rp-${i}" cx="${980 + i * 120}" cy="940" rx="16" ry="6" fill="none" stroke="#d5f0f5" stroke-width="5" opacity="0"/>`).join('');
const river = `<path id="river" d="M340 860 Q560 880 640 900 T900 930" fill="none" stroke="#8fd0dc" stroke-width="26" stroke-linecap="round" stroke-dasharray="40 26" opacity="0"/>`;
const stageLabel = (id, txt, x, y) => `<g id="${id}" opacity="0"><rect x="${x - 165}" y="${y - 40}" width="330" height="76" rx="38" fill="#ffffff" opacity=".94"/><text x="${x}" y="${y + 10}" text-anchor="middle" fill="${P.accent}" font-size="38" font-weight="700">${txt}</text></g>`;
const arrows = `
 <path id="ar-up" d="M1040 930 Q1020 640 1080 450" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="620" stroke-dashoffset="620"/>
 <path id="ar-up-head" d="M1062 486 L1080 448 L1106 480" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
 <path id="ar-dn" d="M1290 450 Q1360 650 1330 900" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="620" stroke-dashoffset="620"/>
 <path id="ar-dn-head" d="M1346 858 L1330 902 L1300 872" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
 <path id="ar-rv" d="M640 905 Q480 910 390 915" fill="none" stroke="${P.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="300" stroke-dashoffset="300" opacity="0"/>`;

const world = `${mountainsFar}${mountainsNear}${hills}${ocean}${sun}
 ${cloudG('cloud-a', 420, 250, 1)}${cloudG('cloud-b', 1050, 160, 0.72)}${cloudG('cloud-main', 1010, 330, 1.15)}
 ${river}${vapor}${rain}${ripples}${arrows}
 ${stageLabel('lab-evap', 'EVAPORATION', 850, 720)}${stageLabel('lab-cond', 'CONDENSATION', 1010, 90)}${stageLabel('lab-rain', 'PRECIPITATION', 1440, 700)}${stageLabel('lab-coll', 'COLLECTION', 300, 860)}`;

const captionsArr = [
  { text: 'Welcome to the water cycle — a never-ending journey that moves water around our planet.', start: .35, end: 9.4 },
  { text: 'The sun heats oceans, water evaporates, vapor cools to form clouds,', start: 9.8, end: 15.4 },
  { text: 'rain falls, and rivers return water back to the sea.', start: 15.4, end: 21.6 },
  { text: 'Remember: sun heats oceans, evaporation makes vapor,', start: 22.1, end: 26.2 },
  { text: 'vapor condenses to clouds, rain falls, rivers return water — the loop repeats.', start: 26.2, end: 30.4 },
];

const html = `<template><style>
@font-face{font-family:Inter;src:url('assets/fonts/Inter-Bold.ttf');font-weight:700}
@font-face{font-family:Inter;src:url('assets/fonts/Inter-Regular.ttf');font-weight:400}
*{box-sizing:border-box}#root{position:absolute;inset:0;background:${P.bg};font-family:Inter,sans-serif;overflow:hidden}
svg{position:absolute;inset:0;width:1920px;height:1080px}
.caption{position:absolute;left:260px;right:260px;bottom:56px;text-align:center;font-size:42px;line-height:1.3;color:${P.ink};font-weight:400}
.caption span{background:rgba(250,252,251,.92);box-decoration-break:clone;padding:6px 14px;border-radius:8px}
h1{position:absolute;left:120px;top:90px;margin:0;font-size:74px;font-weight:700;letter-spacing:-1px;color:${P.ink}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style><div id="root" data-composition-id="bm" data-width="1920" data-height="1080" data-duration="31">
<h1 id="bm-title">The Water Cycle</h1>
<svg id="view" viewBox="0 0 1920 1080"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f0"/><stop offset=".62" stop-color="#eaf6f8"/><stop offset="1" stop-color="#fdf6e0"/></linearGradient></defs>
<rect x="-100" y="-100" width="2200" height="1300" fill="url(#sky)" data-layout-allow-overflow/><g id="cam" data-layout-allow-overflow>${world}</g>${mascotSvg('mascot')}</svg>
${captionsArr.map((c, i) => `<div id="cap-${i}" class="clip caption" data-start="${c.start}" data-duration="${(c.end - c.start).toFixed(3)}" data-track-index="4"><span>${esc(c.text)}</span></div>`).join('')}
<script>const motion=d=>matchMedia('(prefers-reduced-motion: reduce)').matches?.01:d;const tl=gsap.timeline({paused:true});
const cam='#cam';
tl.from('#mascot',{y:430,duration:motion(.7),ease:'back.out(1.6)'},0.05);
tl.fromTo('#bm-title',{opacity:0,y:26},{opacity:1,y:0,duration:motion(.8)},0.2);
tl.fromTo('#sun',{scale:.7,transformOrigin:'50% 50%'},{scale:1,duration:motion(1.4),ease:'power2.out'},0.3);
tl.fromTo('#cloud-a,#cloud-b,#cloud-main',{opacity:0,x:-40},{opacity:1,x:0,stagger:.3,duration:motion(1.0)},0.5);
// ambience (subtle, functional)
tl.to('#rays',{rotation:22,transformOrigin:'0 0',duration:motion(6),ease:'none',repeat:4},0);
tl.to('#wavelet',{x:60,duration:motion(3),ease:'sine.inOut',yoyo:true,repeat:8},0);
tl.to('#cloud-a',{x:60,duration:motion(9),ease:'sine.inOut',yoyo:true,repeat:2},1);
tl.to('#cloud-b',{x:-50,duration:motion(10),ease:'sine.inOut',yoyo:true,repeat:2},1.5);
// SHOT 2 — push into the water surface (viewBox = true camera)
tl.to('#view',{attr:{viewBox:'220 380 1300 731'},duration:motion(2.2),ease:'power2.inOut'},9.6);
tl.to('#bm-title',{opacity:0,duration:motion(.5)},9.4);
// vapor particles rise along visible paths
${Array.from({ length: 16 }, (_, i) => `tl.to('#vp-${i}',{opacity:.95,y:${-(560 + rnd(i, 140))},x:'+=${rnd(i + 11, 120) - 60}',duration:motion(${2.1 + rnd(i + 13, 1.4)}),ease:'power1.in'},${(12 + i * 0.18).toFixed(2)});tl.to('#vp-${i}',{opacity:0,duration:motion(.6)},${(14.6 + i * 0.18).toFixed(2)});`).join('')}
// camera follows vapor up toward the cloud
tl.to('#view',{attr:{viewBox:'330 80 1300 731'},duration:motion(3.2),ease:'power1.inOut'},14.2);
// cloud gathers and darkens as droplets form
tl.to('#cloud-main',{scale:1.32,x:-80,transformOrigin:'50% 50%',duration:motion(2.4),ease:'power2.out'},15.2);
tl.to('#cloud-main g',{fill:'#dfeef0',duration:motion(1.6)},15.4);
// rain + ripples + runoff back to the sea — pull back over the cloud-to-sea zone
tl.to('#view',{attr:{viewBox:'80 260 1600 900'},duration:motion(1.8),ease:'power2.inOut'},18.4);
${Array.from({ length: 22 }, (_, i) => `tl.to('#rn-${i}',{opacity:.85,y:300,duration:motion(${0.9 + rnd(i + 17, 0.6)}),ease:'power1.in'},${(19 + i * 0.09).toFixed(2)});tl.to('#rn-${i}',{opacity:0,duration:motion(.3)},${(20.1 + i * 0.09).toFixed(2)});`).join('')}
${Array.from({ length: 6 }, (_, i) => `tl.fromTo('#rp-${i}',{opacity:.9,scale:.4,transformOrigin:'50% 50%'},{opacity:0,scale:2.6,duration:motion(1.4)},${(19.6 + i * 0.22).toFixed(2)});`).join('')}
tl.to('#river',{opacity:1,duration:motion(.5)},20.2);tl.to('#river',{strokeDashoffset:-200,duration:motion(2.6),ease:'none'},20.2);
// SHOT 3 — pull back to wide; stage labels trace the loop
tl.to('#view',{attr:{viewBox:'0 0 1920 1080'},duration:motion(2.6),ease:'power2.inOut'},22.4);
tl.fromTo('#ar-up',{strokeDashoffset:260},{strokeDashoffset:0,duration:motion(1.0),ease:'power1.inOut'},24.6);
tl.to('#ar-up-head',{opacity:1,duration:motion(.3)},25.5);tl.to('#lab-evap',{opacity:1,y:-6,duration:motion(.5)},25.6);
tl.to('#lab-cond',{opacity:1,duration:motion(.5)},26.6);
tl.fromTo('#ar-dn',{strokeDashoffset:260},{strokeDashoffset:0,duration:motion(1.0),ease:'power1.inOut'},27.4);
tl.to('#ar-dn-head',{opacity:1,duration:motion(.3)},28.3);tl.to('#lab-rain',{opacity:1,duration:motion(.5)},28.4);
tl.to('#lab-coll',{opacity:1,duration:motion(.5)},29.0);tl.to('#ar-rv',{opacity:1,strokeDashoffset:0,duration:motion(.6)},29.0);
tl.to('#root',{opacity:0,duration:motion(.4)},30.5);
PERFORMANCE
window.__timelines['bm']=tl;</script></div></template>`;

// ---- mascot performance: real alignment-driven lip-sync -------------------
let performance = '';
const alignDir = join(repo, '.fair-video/studio-v2/c336b84e-ced4-4674-917d-5eea904c37af/project/audio');
for (const [name, start] of [['scene-1', 0.35], ['scene-2', 9.85], ['scene-6', 22.15]]) {
  const words = await loadAlignmentWords(join(alignDir, `${name}.wav.alignment.json`));
  if (words) performance += visemeTimeline('mascot', words, start);
}
performance += idleTimeline('mascot', 31);
performance += gestureTimeline('mascot', { celebrate: [25.6, 28.5], point: [24.7, 27.5], lean: [20.0] });
const finalHtml = html.replace('PERFORMANCE', performance);

await mkdir(join(workspace, 'compositions'), { recursive: true });
await mkdir(join(workspace, 'assets/fonts'), { recursive: true });
for (const f of ['Inter-Regular.ttf', 'Inter-Bold.ttf']) await copyFile(join(repo, 'app/fonts', f), join(workspace, 'assets/fonts', f));
await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(workspace, 'assets/gsap.min.js'));
await writeFile(join(workspace, 'compositions/bm.html'), finalHtml);

const voices = [
  { file: join(job, 'scene-1.wav'), start: .35 },
  { file: join(job, 'scene-2.wav'), start: 9.85 },
  { file: join(job, 'scene-6.wav'), start: 22.15 },
];
let total = 0;
for (const [i, v] of voices.entries()) { const d = dur(v.file); total = Math.max(total, v.start + d); await copyFile(v.file, join(workspace, `assets/voice-${i}.wav`)); }
const duration = 31;

const host = `<!doctype html><html><head><meta charset="UTF-8"><script src="assets/gsap.min.js"><\/script><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:${P.bg}}#root{position:absolute;inset:0}</style></head><body><div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="${duration}" data-fps="30"><div id="bm" class="clip" data-composition-id="bm" data-composition-src="compositions/bm.html" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080" data-track-index="1" data-track-kind="graphics"></div></div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});<\/script></body></html>`;
await writeFile(join(workspace, 'index.html'), host);

console.log('workspace ready, rendering via OpenMontage worker…');
const result = await renderWithOpenMontage(workspace, join(root, 'render.mp4'), { env: process.env, onProgress: p => p?.message && console.log(' ', p.message) });
if (!result.success) { console.error('render failed', result.error); process.exit(1); }

const inputs = ['-i', join(root, 'render.mp4'), ...voices.flatMap((v, i) => ['-i', join(workspace, `assets/voice-${i}.wav`)])];
const filters = voices.map((v, i) => `[${i + 1}:a]adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';') + `;${voices.map((v, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9[aout]`;
await fairCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', '31', join(root, 'benchmark.mp4')], { env: process.env, timeoutMs: 120000 });
await fairCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(root, 'benchmark.mp4'), '-vf', 'fps=1/3.5,scale=480:-2,tile=3x3:padding=8:margin=8', '-frames:v', '1', join(root, 'contact-sheet.jpg')], { env: process.env });
console.log('DONE', join(root, 'benchmark.mp4'));

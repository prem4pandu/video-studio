import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fairEscape as escape, fairTimestamp, fairWriteJson } from './fair-utils.mjs';
import { FAIR_AVATARS } from './fair-voice.mjs';
import { fairFilmCompose } from './fair-film.mjs';

const require = createRequire(import.meta.url);
const PLACE_NAMES = { '-6': 'millionths', '-5': 'hundred-thousandths', '-4': 'ten-thousandths', '-3': 'thousandths', '-2': 'hundredths', '-1': 'tenths', 0: 'ones', 1: 'tens', 2: 'hundreds', 3: 'thousands', 4: 'ten-thousands', 5: 'hundred-thousands', 6: 'millions', 7: 'ten-millions', 8: 'hundred-millions' };

export function fairAvatarSvg(avatarId, id) {
  const avatar = FAIR_AVATARS.find(item => item.id === avatarId) || FAIR_AVATARS[0];
  const mouth = `<ellipse id="${id}-mouth" cx="100" cy="103" rx="9" ry="4" fill="#322e35"/>`;
  if (avatarId === 'orbit') return `<svg viewBox="0 0 200 260" role="img" aria-label="Orbit the friendly robot teacher"><path d="M100 45V24" stroke="${avatar.color}" stroke-width="6"/><circle cx="100" cy="19" r="9" fill="#d3a13c"/><rect x="39" y="43" width="122" height="88" rx="28" fill="#e9e8f8" stroke="${avatar.color}" stroke-width="5"/><rect x="55" y="64" width="90" height="48" rx="18" fill="#252c3e"/><g class="avatar-eyes"><circle cx="78" cy="83" r="7" fill="#b8e9d7"/><circle cx="122" cy="83" r="7" fill="#b8e9d7"/></g><ellipse id="${id}-mouth" cx="100" cy="103" rx="8" ry="3" fill="#b8e9d7"/><path d="M62 142H138L152 224H48Z" fill="${avatar.color}"/><rect x="78" y="162" width="44" height="32" rx="8" fill="#fff"/><path id="${id}-hand" d="M141 153L170 126L184 134" fill="none" stroke="${avatar.color}" stroke-width="16" stroke-linecap="round"/><path d="M56 153L27 190" stroke="${avatar.color}" stroke-width="16" stroke-linecap="round"/><path d="M74 226V248M126 226V248" stroke="#252c3e" stroke-width="17" stroke-linecap="round"/></svg>`;
  const skin = avatarId === 'leo' ? '#d49b74' : '#d9a582';
  const hair = avatarId === 'leo' ? '#4e332a' : '#292b32';
  const glasses = avatarId === 'leo' ? '<g fill="none" stroke="#4e332a" stroke-width="3"><circle cx="83" cy="84" r="12"/><circle cx="118" cy="84" r="12"/><path d="M95 84H106"/></g>' : '';
  return `<svg viewBox="0 0 200 260" role="img" aria-label="${avatar.name}, your illustrated teacher"><path d="M50 99C26 28 66 17 100 22C150 15 180 61 151 129L49 128Z" fill="${hair}"/><path d="M63 146Q100 130 137 146L157 224H43Z" fill="${avatar.color}"/><path d="M87 121V146Q100 160 113 146V121" fill="${skin}"/><ellipse cx="100" cy="83" rx="45" ry="53" fill="${skin}"/><path d="M55 73Q55 26 103 31Q153 31 147 65Q111 59 87 42Q76 66 55 73Z" fill="${hair}"/><g class="avatar-eyes"><ellipse cx="83" cy="84" rx="4" ry="5" fill="#27282e"/><ellipse cx="118" cy="84" rx="4" ry="5" fill="#27282e"/></g><path d="M100 84L96 96H102" fill="none" stroke="#ad745a" stroke-width="2" stroke-linecap="round"/>${glasses}${mouth}<path d="M69 74L87 72M111 72L128 75" stroke="${hair}" stroke-width="3" stroke-linecap="round"/><path d="M58 158L28 191" stroke="${avatar.color}" stroke-width="20" stroke-linecap="round"/><path id="${id}-hand" d="M143 159L171 135L180 113" fill="none" stroke="${skin}" stroke-width="15" stroke-linecap="round"/><path d="M140 155L158 141" stroke="${avatar.color}" stroke-width="22" stroke-linecap="round"/><path d="M73 225V250M126 225V250" stroke="#303b46" stroke-width="20" stroke-linecap="round"/><path d="M91 163L100 174L110 162" stroke="#fff" stroke-width="3" fill="none"/></svg>`;
}

export function fairPlaceValue(number, highlightPlace) {
  const [whole, decimal = ''] = number.split('.');
  return [...whole, ...decimal].map((digit, index) => {
    const exponent = whole.length - index - 1;
    const contribution = exponent >= 0 ? String(Number(digit) * 10 ** exponent) : (Number(digit) * 10 ** exponent).toFixed(-exponent);
    return { digit, exponent, place: PLACE_NAMES[exponent] || `10^${exponent}`, contribution, highlighted: exponent === highlightPlace, decimalBefore: exponent === -1 };
  });
}

function visualHtml(visual, beat, narration) {
  if (beat === 'question') return `<div class="question-prompt reveal" style="font-size:${narration.length > 180 ? 28 : 34}px;line-height:1.4;padding:24px;background:#fffdf7;border-radius:12px">${escape(narration)}</div>`;
  const label = visual.label ? `<p class="visual-label">${escape(visual.label)}</p>` : '';
  if (visual.kind === 'place-value') {
    const values = fairPlaceValue(visual.number, visual.highlightPlace);
    const target = values.find(item => item.highlighted);
    return `${label}<div class="place-grid">${values.map(item => `<div class="place-column reveal${item.highlighted ? ' selected' : ''}">${item.decimalBefore ? '<span class="decimal-dot">.</span>' : ''}<span class="place-name">${escape(item.place)}</span><span class="digit">${item.digit}</span><span class="place-factor">${item.exponent >= 0 ? (10 ** item.exponent).toLocaleString('en-US') : (10 ** item.exponent).toFixed(-item.exponent)}</span></div>`).join('')}</div>${target ? `<div class="takeaway reveal"><span>${target.digit} ${escape(target.place)}</span><strong>= ${escape(target.contribution)}</strong></div>` : ''}`;
  }
  if (visual.kind === 'equation') return `${label}<div class="equations">${visual.lines.map((line, index) => `<div class="equation reveal"><span class="line-number">${index + 1}</span><span>${escape(line)}</span></div>`).join('')}</div>`;
  if (visual.kind === 'comparison') return `${label}<div class="comparison"><div class="compare-side reveal"><span>${escape(visual.leftLabel)}</span><strong>${escape(visual.left)}</strong></div><div class="compare-side reveal"><span>${escape(visual.rightLabel)}</span><strong>${escape(visual.right)}</strong></div></div>`;
  if (visual.kind === 'number-line') {
    const x = 40 + (visual.mark - visual.min) / (visual.max - visual.min) * 760;
    return `${label}<svg class="number-line reveal" viewBox="0 0 840 210" role="img" aria-label="${escape(visual.label)}"><path d="M40 100H800" stroke="#33554e" stroke-width="5"/>${Array.from({ length: 6 }, (_, index) => { const px = 40 + index * 152, value = visual.min + (visual.max - visual.min) * index / 5; return `<path d="M${px} 88V112" stroke="#33554e" stroke-width="3"/><text x="${px}" y="150" text-anchor="middle" font-size="24" fill="#263d38">${Number(value.toPrecision(12))}</text>`; }).join('')}<circle cx="${x}" cy="100" r="12" fill="#b7552d"/><text x="${x}" y="57" text-anchor="middle" font-size="36" font-weight="700" fill="#9b4321">${visual.mark}</text></svg>`;
  }
  if (visual.kind === 'fraction-bars') {
    const bar = (frac, y) => {
      const [n, d] = frac.split('/').map(Number), wholes = Math.ceil(n / d), width = Math.min(360, 740 / wholes), cell = width / d;
      return Array.from({ length: wholes }, (_, w) => `<g transform="translate(${w * (width + 14)},${y})">${Array.from({ length: d }, (_, i) => `<rect x="${(i * cell).toFixed(1)}" y="0" width="${cell.toFixed(1)}" height="56" fill="${w * d + i < n ? '#e07b39' : '#fdf3e3'}" stroke="#9b4321" stroke-width="2"/>`).join('')}</g>`).join('');
    };
    const rows = [`<text x="0" y="18" font-size="24" font-weight="800" fill="#33554e">${escape(visual.fraction)}</text>${bar(visual.fraction, 28)}`];
    if (visual.equivalent) rows.push(`<text x="0" y="120" font-size="24" font-weight="800" fill="#146658">${escape(visual.equivalent)}</text>${bar(visual.equivalent, 130)}`);
    return `${label}<svg viewBox="0 0 780 ${visual.equivalent ? 200 : 100}" role="img" aria-label="${escape(visual.label)}" style="width:100%;display:block">${rows.join('')}</svg>`;
  }
  if (visual.kind === 'bar-model') {
    return `${label}<div style="margin-top:8px"><div style="font-size:20px;font-weight:750;color:#355c6a;margin-bottom:10px">${escape(visual.whole)}</div><div style="display:flex;gap:6px;align-items:stretch">${visual.parts.map((part, index) => `<div class="reveal" style="flex:1;min-width:0;background:${index % 2 ? '#fdf3e3' : '#dff0ea'};border:3px solid ${index % 2 ? '#b7552d' : '#147d6c'};border-radius:12px;text-align:center;padding:14px 8px"><div style="font-size:20px;font-weight:700;color:#33554e">${escape(part.label)}</div>${part.value ? `<div style="font-size:32px;font-weight:850;color:#17344e;margin-top:6px">${escape(part.value)}</div>` : ''}</div>`).join('')}</div></div>`;
  }
  if (visual.kind === 'area-grid') {
    const cell = Math.min(46, 700 / visual.cols, 300 / visual.rows), width = cell * visual.cols, height = cell * visual.rows;
    const cells = Array.from({ length: visual.rows * visual.cols }, (_, i) => `<rect x="${((i % visual.cols) * cell).toFixed(1)}" y="${(Math.floor(i / visual.cols) * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${i < visual.shaded ? '#146658' : '#fffdf7'}" stroke="#c9d8d0" stroke-width="1.5"/>`).join('');
    return `${label}<svg viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="${escape(visual.label)}" style="width:${width.toFixed(0)}px;max-width:100%;display:block;margin:0 auto">${cells}</svg>`;
  }
  if (visual.kind === 'angle') {
    const rad = -visual.degrees * Math.PI / 180, cx = 200, cy = 300, r = 230;
    const ex = cx + r * Math.cos(rad), ey = cy + r * Math.sin(rad), arcR = 80;
    const ax = cx + arcR * Math.cos(rad), ay = cy + arcR * Math.sin(rad), large = visual.degrees > 180 ? 1 : 0;
    const mid = -visual.degrees / 2 * Math.PI / 180, tx = cx + 118 * Math.cos(mid), ty = cy + 118 * Math.sin(mid);
    return `${label}<svg viewBox="0 0 560 340" role="img" aria-label="${escape(visual.label)}" style="width:560px;max-width:100%;display:block;margin:0 auto"><path d="M${cx + arcR} ${cy}A${arcR} ${arcR} 0 ${large} 0 ${ax.toFixed(1)} ${ay.toFixed(1)}" fill="#dff0ea" stroke="#147d6c" stroke-width="3"/><path d="M${cx} ${cy}L${cx + r} ${cy}" stroke="#17344e" stroke-width="6" stroke-linecap="round"/><path d="M${cx} ${cy}L${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="#b7552d" stroke-width="6" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="9" fill="#17344e"/><text x="${tx.toFixed(0)}" y="${ty.toFixed(0)}" text-anchor="middle" font-size="34" font-weight="850" fill="#17344e">${visual.degrees}°</text></svg>`;
  }
  if (visual.kind === 'coordinate-grid') {
    const size = 420, step = size / 10, origin = 40, span = size;
    const lines = Array.from({ length: 11 }, (_, i) => `<path d="M${origin} ${origin + i * step}H${origin + span}M${origin + i * step} ${origin}V${origin + span}" stroke="${i ? '#d3e6e8' : '#8fb7bd'}" stroke-width="${i ? 1.5 : 3}"/>`).join('');
    const point = p => [origin + p.x * step, origin + span - p.y * step];
    const dots = visual.points.map(p => { const [x, y] = point(p); return `<circle cx="${x}" cy="${y}" r="9" fill="#b7552d"/>${p.label ? `<text x="${x + 13}" y="${y - 10}" font-size="22" font-weight="750" fill="#17344e">${escape(p.label)}</text>` : ''}<text x="${x}" y="${y + 30}" text-anchor="middle" font-size="15" fill="#506b7d">(${p.x}, ${p.y})</text>`; }).join('');
    const path = visual.connect ? `<path d="M${visual.points.map(p => point(p).join(' ')).join(' L')} Z" fill="rgba(20,125,108,.15)" stroke="#147d6c" stroke-width="4" stroke-linejoin="round"/>` : '';
    const ticks = Array.from({ length: 11 }, (_, i) => `<text x="${origin + i * step}" y="${origin + span + 26}" text-anchor="middle" font-size="17" fill="#506b7d">${i}</text><text x="${origin - 14}" y="${origin + span - i * step + 6}" text-anchor="end" font-size="17" fill="#506b7d">${i}</text>`).join('');
    return `${label}<svg viewBox="0 0 ${origin * 2 + span} ${origin * 2 + span + 34}" role="img" aria-label="${escape(visual.label)}" style="width:${size + 80}px;max-width:100%;display:block;margin:0 auto">${lines}${ticks}${path}${dots}</svg>`;
  }
  if (visual.kind === 'chart') {
    const max = Math.max(...visual.items.map(item => item.value)) || 1, plotW = 720, plotH = 260, left = 60, base = 330;
    const dots = visual.items.map((item, i) => [left + (visual.items.length === 1 ? plotW / 2 : i * plotW / (visual.items.length - 1)), base - item.value / max * plotH]);
    const axes = `<path d="M${left} 40V${base}H${left + plotW}" stroke="#33554e" stroke-width="4"/>`;
    if (visual.chart === 'line') return `${label}<svg viewBox="0 0 ${left + plotW + 30} ${base + 60}" role="img" aria-label="${escape(visual.label)}" style="width:100%;display:block">${axes}<path d="M${dots.map(d => d.join(' ')).join(' L')}" fill="none" stroke="#b7552d" stroke-width="5" stroke-linejoin="round"/>${dots.map((d, i) => `<circle cx="${d[0]}" cy="${d[1]}" r="8" fill="#17344e"/><text x="${d[0]}" y="${base + 34}" text-anchor="middle" font-size="19" font-weight="650" fill="#33554e">${escape(visual.items[i].name)}</text><text x="${d[0]}" y="${d[1] - 16}" text-anchor="middle" font-size="21" font-weight="800" fill="#9b4321">${visual.items[i].value}</text>`).join('')}</svg>`;
    const bw = Math.min(90, plotW / visual.items.length * 0.6);
    return `${label}<svg viewBox="0 0 ${left + plotW + 30} ${base + 60}" role="img" aria-label="${escape(visual.label)}" style="width:100%;display:block">${axes}${visual.items.map((item, i) => { const h = item.value / max * plotH, x = left + (i + 0.5) * plotW / visual.items.length - bw / 2; return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="6" fill="#147d6c"/><text x="${(x + bw / 2).toFixed(0)}" y="${base + 34}" text-anchor="middle" font-size="19" font-weight="650" fill="#33554e">${escape(item.name)}</text><text x="${(x + bw / 2).toFixed(0)}" y="${(base - h - 12).toFixed(0)}" text-anchor="middle" font-size="21" font-weight="800" fill="#146658">${item.value}</text>`; }).join('')}</svg>`;
  }
  if (visual.kind === 'clock') {
    const cx = 190, cy = 180, r = 140, hr = ((visual.hour % 12) + visual.minute / 60) * 30 - 90, mn = visual.minute * 6 - 90;
    const hand = (deg, len, w, color) => `<path d="M${cx} ${cy}L${(cx + len * Math.cos(deg * Math.PI / 180)).toFixed(1)} ${(cy + len * Math.sin(deg * Math.PI / 180)).toFixed(1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    const marks = Array.from({ length: 60 }, (_, i) => { const a = i * 6 - 90, outer = r - 4, inner = i % 5 ? r - 14 : r - 26; return `<path d="M${(cx + inner * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(cy + inner * Math.sin(a * Math.PI / 180)).toFixed(1)}L${(cx + outer * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(cy + outer * Math.sin(a * Math.PI / 180)).toFixed(1)}" stroke="#33554e" stroke-width="${i % 5 ? 2 : 4}"/>`; }).join('');
    const numbers = Array.from({ length: 12 }, (_, i) => { const a = (i + 1) * 30 - 90; return `<text x="${(cx + (r - 48) * Math.cos(a * Math.PI / 180)).toFixed(0)}" y="${(cy + (r - 48) * Math.sin(a * Math.PI / 180) + 9).toFixed(0)}" text-anchor="middle" font-size="26" font-weight="800" fill="#17344e">${i + 1}</text>`; }).join('');
    return `${label}<svg viewBox="0 0 380 380" role="img" aria-label="${escape(visual.label)}" style="width:380px;max-width:100%;display:block;margin:0 auto"><circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="#fffdf5" stroke="#17344e" stroke-width="7"/>${marks}${numbers}${hand(hr, 78, 11, '#17344e')}${hand(mn, 112, 7, '#b7552d')}<circle cx="${cx}" cy="${cy}" r="10" fill="#17344e"/><text x="${cx}" y="${cy + r + 42}" text-anchor="middle" font-size="30" font-weight="850" fill="#17344e">${visual.hour}:${String(visual.minute).padStart(2, '0')}</text></svg>`;
  }
  return `${label}<div class="teaching-steps">${visual.items.map((item, index) => `<div class="teaching-step reveal"><span class="step-number">${index + 1}</span><p>${escape(item)}</p></div>`).join('')}</div>`;
}

export function fairCaptionChunks(text, startSeconds, durationSeconds) {
  const words = text.trim().split(/\s+/), chunks = [];
  let current = [], first = 0;
  const characters = words.reduce((sum, word) => sum + word.length, 0);
  let elapsed = 0;
  for (const word of words) {
    if (!current.length) first = elapsed;
    current.push(word);
    elapsed += word.length / characters * durationSeconds;
    if (current.join(' ').length >= 64 || elapsed - first >= 4.5) {
      chunks.push({ start: startSeconds + first, end: startSeconds + elapsed, text: current.join(' ') });
      current = [];
    }
  }
  if (current.length) chunks.push({ start: startSeconds + first, end: startSeconds + durationSeconds, text: current.join(' ') });
  return chunks;
}

export async function fairCompose(lesson, tracks, brief, directory) {
  if (lesson.scenes.some(scene => scene.visual.kind === 'base-ten') || brief.avatar === 'none') return fairFilmCompose(lesson, tracks, brief, directory, { visualHtml, fairAvatarSvg, fairCaptionChunks });
  await mkdir(directory, { recursive: true });
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(directory, 'gsap.min.js'));
  const avatar = FAIR_AVATARS.find(item => item.id === brief.avatar) || FAIR_AVATARS[0];
  let at = 0;
  const scenes = lesson.scenes.map((scene, index) => {
    const track = tracks.find(item => item.sceneId === scene.id);
    if (!track) throw new Error(`Scene ${scene.id} is missing narration.`);
    const speechStart = at + 0.35;
    const duration = Math.max(4, track.durationSeconds + scene.pauseSeconds + 0.7);
    const timed = { ...scene, index, start: at, duration, speechStart, track, captions: fairCaptionChunks(scene.narration, speechStart, track.durationSeconds) };
    at += duration;
    return timed;
  });
  const captions = scenes.flatMap(scene => scene.captions);
  const sceneHtml = scenes.map(scene => {
    const id = `fair-${scene.id}`;
    return `<section id="${id}" class="clip scene beat-${scene.beat}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1"><div class="scene-top"><span>FAIR / CLASSROOM</span><span>${escape(lesson.audience)}</span></div><div class="scene-body"><main class="lesson"><div class="eyebrow">${escape(scene.beat === 'question' ? 'YOUR TURN' : scene.beat === 'answer' ? 'LET’S CHECK' : scene.beat.toUpperCase())} <span> / ${String(scene.index + 1).padStart(2, '0')}</span></div><h1>${escape(scene.title)}</h1><div class="visual">${visualHtml(scene.visual, scene.beat, scene.narration)}</div></main><aside class="presenter"><div class="avatar-stage">${fairAvatarSvg(brief.avatar, id)}</div><div class="avatar-name">${avatar.name}<span>AI voice · illustrated guide</span></div></aside></div><div class="scene-footer"><span>${escape(lesson.title)}</span><span>${scene.index + 1} / ${scenes.length}</span></div></section>`;
  }).join('\n');
  const audioHtml = scenes.map(scene => `<audio id="audio-${scene.id}" src="${scene.track.file}" data-start="${scene.speechStart}" data-duration="${scene.track.durationSeconds}" data-track-index="2" data-volume="1"></audio>`).join('\n');
  const captionHtml = captions.map((caption, index) => `<div id="caption-${index}" class="clip caption" data-layout-allow-caption-zone data-start="${caption.start}" data-duration="${caption.end - caption.start}" data-track-index="3"><span>${escape(caption.text)}</span></div>`).join('\n');
  const pauses = scenes.filter(scene => scene.beat === 'question').map(scene => `<div id="pause-${scene.id}" class="clip think" data-start="${scene.speechStart + scene.track.durationSeconds}" data-duration="${scene.pauseSeconds}" data-track-index="4"><span>Pause and think</span><div class="think-track"><div id="think-fill-${scene.id}" class="think-fill"></div></div></div>`).join('\n');
  const timeline = scenes.map(scene => {
    const id = `fair-${scene.id}`, selector = `#${id}`;
    const fragments = [
      `tl.fromTo('${selector} h1',{opacity:0,y:10},{opacity:1,y:0,duration:0.3,ease:'power3.out'},${scene.start});`,
      `gsap.utils.toArray('${selector} .reveal').forEach((el,i,items)=>tl.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${scene.start + 0.25}+i*Math.min(2,${scene.track.durationSeconds}/Math.max(2,items.length+1))));`,
    ];
    for (const energy of scene.track.envelope) fragments.push(`tl.to('#${id}-mouth',{scaleY:${(0.35 + energy.value * 2.8).toFixed(3)},transformOrigin:'center center',duration:${Math.max(0, Math.min(0.08, scene.track.durationSeconds - energy.at - 0.002)).toFixed(3)},ease:'none'},${(scene.speechStart + energy.at).toFixed(3)});`);
    fragments.push(`tl.to('#${id}-mouth',{scaleY:0.35,duration:0.1},${scene.speechStart + scene.track.durationSeconds});`);
    if (scene.beat === 'hook' || scene.beat === 'answer') fragments.push(`tl.fromTo('#${id}-hand',{rotation:-6},{rotation:3,svgOrigin:'142 158',duration:0.5,yoyo:true,repeat:1,ease:'power2.inOut'},${scene.start + 0.35});`);
    if (scene.beat === 'question') fragments.push(`tl.fromTo('#think-fill-${scene.id}',{scaleX:1},{scaleX:0,transformOrigin:'left center',duration:${scene.pauseSeconds},ease:'none'},${scene.speechStart + scene.track.durationSeconds});`);
    return fragments.join('\n');
  }).join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1280,height=720"><title>${escape(lesson.title)}</title><script src="gsap.min.js"></script><style>
*{box-sizing:border-box}body{margin:0;background:#f5f1e8;color:#243a34;font-family:system-ui,sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden}.clip{position:absolute}.scene{inset:0;background:#f5f1e8;padding:32px 52px 112px}.scene-top,.scene-footer{display:flex;justify-content:space-between;gap:30px;font-size:15px;font-weight:600;letter-spacing:.08em;color:#50645c}.scene-top{border-bottom:1px solid #d4d9ce;padding-bottom:18px}.scene-top span:last-child{max-width:700px;text-align:right;letter-spacing:0}.scene-body{display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:28px;height:470px;padding-top:32px;align-items:center}.lesson{min-width:0}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.13em;color:#146658}.eyebrow span{color:#586453}h1{font-size:45px;line-height:1.12;letter-spacing:-1.6px;max-width:850px;margin:12px 0 24px;overflow-wrap:anywhere}.visual-label{font-size:24px;line-height:1.35;margin:0 0 20px;color:#44594e}.place-grid{display:flex;gap:5px}.place-column{position:relative;flex:1;min-width:0;text-align:center;background:#e5e9de;border-radius:12px;padding:14px 3px}.place-name{display:block;font-size:13px;font-weight:650;min-height:32px;overflow-wrap:anywhere}.digit{display:block;font-size:62px;font-weight:750;line-height:1.15;font-variant-numeric:tabular-nums}.place-factor{display:block;font-size:17px;margin-top:8px}.place-column.selected{background:#166859;color:#fff}.decimal-dot{position:absolute;left:-9px;top:43px;font-size:60px;color:#243a34;z-index:2}.takeaway{display:flex;justify-content:center;gap:20px;align-items:center;margin-top:20px;font-size:28px}.takeaway strong{font-size:38px;color:#146658}.equations{display:grid;gap:12px}.equation{display:flex;align-items:center;gap:18px;font-size:29px;line-height:1.25;padding:14px 20px;background:#fffdf7;border-radius:10px;overflow-wrap:anywhere}.line-number,.step-number{flex-shrink:0;font-size:16px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#dae9df;color:#155e51}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.compare-side{padding:22px;background:#fffdf7;border-radius:12px}.compare-side>span{display:block;font-size:17px;margin-bottom:20px;color:#4e6459}.compare-side strong{font-size:31px;line-height:1.25;display:block;overflow-wrap:anywhere}.compare-side:last-child{background:#e0eadc}.number-line{display:block;width:100%;height:210px}.teaching-steps{display:grid;gap:12px}.teaching-step{display:flex;gap:16px;align-items:flex-start;padding:13px 16px;background:#fffdf7;border-radius:10px}.teaching-step p{font-size:25px;line-height:1.32;margin:0}.presenter{align-self:end;padding-bottom:25px}.avatar-stage{width:200px;height:260px}.avatar-stage svg{width:100%;height:100%}.avatar-name{text-align:center;font-size:22px;font-weight:700;margin-top:14px}.avatar-name span{display:block;font-size:13px;letter-spacing:.02em;font-weight:500;margin-top:5px;color:#58695e}.scene-footer{margin-top:16px;letter-spacing:0;font-size:13px;max-width:1176px}.scene-footer span:first-child{max-width:1000px}.caption{left:52px;right:52px;bottom:24px;min-height:60px;display:flex;justify-content:center;align-items:center;z-index:10;text-align:center}.caption span{background:#243a34;color:#fff;padding:12px 24px;border-radius:10px;font-size:25px;line-height:1.35;max-width:1120px}.think{bottom:28px;left:52px;right:52px;text-align:center;font-size:23px;font-weight:650;color:#176455;z-index:11}.think-track{width:280px;height:7px;overflow:hidden;background:#d7e0d5;border-radius:10px;margin:12px auto}.think-fill{width:100%;height:100%;background:#176455}.beat-hook h1,.beat-recap h1{font-size:49px}.beat-question .visual-label{font-weight:650;color:#146658}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><div id="root" data-composition-id="fair-lesson" data-width="1280" data-height="720" data-duration="${at}" data-start="0">${sceneHtml}${audioHtml}${captionHtml}${pauses}</div><script>const tl=gsap.timeline({paused:true});${timeline}\nwindow.__timelines=window.__timelines||{};window.__timelines['fair-lesson']=tl;</script></body></html>`;
  await writeFile(join(directory, 'index.html'), html);
  await writeFile(join(directory, 'captions.vtt'), `WEBVTT\n\n${captions.map((caption, index) => `${index + 1}\n${fairTimestamp(caption.start)} --> ${fairTimestamp(caption.end)}\n${caption.text.replaceAll('-->', '→')}\n`).join('\n')}`);
  await writeFile(join(directory, 'transcript.txt'), `${lesson.title}\n${lesson.audience}\n\n${scenes.map(scene => `[${fairTimestamp(scene.start)}] ${scene.title}\n${scene.narration}${scene.beat === 'question' ? `\n[Think for ${scene.pauseSeconds} seconds]` : ''}`).join('\n\n')}\n`);
  await fairWriteJson(join(directory, 'storyboard.json'), { durationSeconds: at, timing: 'Scene durations measured from audio; caption and visual reveal timing is estimated.', scenes: scenes.map(({ track, ...scene }) => ({ ...scene, audioFile: track.file, audioSha256: track.sha256 })) });
  await fairWriteJson(join(directory, 'hyperframes.json'), { name: 'fair-lesson', description: lesson.title });
  return { durationSeconds: at, captions, scenes };
}

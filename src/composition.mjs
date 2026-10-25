import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fairEscape as escape, fairTimestamp, fairWriteJson } from './utils.mjs';
import { FAIR_AVATARS } from './voice.mjs';
import { fairFilmCompose } from './film.mjs';
import { fairIntroClip, fairIntroSeconds, fairOutroClip, fairOutroSeconds } from './intro.mjs';
import { fairInteractionFor } from './interaction.mjs';
import { fairPartitionMotion, fairPartitionSvg } from './partition.mjs';

const require = createRequire(import.meta.url);
const PLACE_NAMES = { '-6': 'millionths', '-5': 'hundred-thousandths', '-4': 'ten-thousandths', '-3': 'thousandths', '-2': 'hundredths', '-1': 'tenths', 0: 'ones', 1: 'tens', 2: 'hundreds', 3: 'thousands', 4: 'ten-thousands', 5: 'hundred-thousands', 6: 'millions', 7: 'ten-millions', 8: 'hundred-millions' };

export function fairAvatarSvg(avatarId, id) {
  const avatar = FAIR_AVATARS.find(item => item.id === avatarId) || FAIR_AVATARS[0];
  const mouth = `<ellipse id="${id}-mouth" cx="100" cy="103" rx="9" ry="4" fill="#322e35"/>`;
  if (avatarId === 'mira') return `<svg viewBox="0 0 200 260" role="img" aria-label="Pip, the friendly learning guide"><defs><linearGradient id="${id}-pip-body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#27a990"/><stop offset="1" stop-color="#087566"/></linearGradient><linearGradient id="${id}-pip-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf8"/><stop offset="1" stop-color="#eaf7f3"/></linearGradient></defs><ellipse cx="100" cy="238" rx="58" ry="11" fill="#17344e" opacity=".1"/><path d="M69 45Q100 17 131 45L143 78H57Z" fill="#17344e"/><path d="M82 35L70 15Q92 18 100 32Q108 18 130 15L118 35" fill="#f2a846" stroke="#17344e" stroke-width="4" stroke-linejoin="round"/><rect x="43" y="41" width="114" height="104" rx="43" fill="url(#${id}-pip-face)" stroke="#17344e" stroke-width="5"/><circle cx="77" cy="87" r="17" fill="#dff4ee"/><circle cx="123" cy="87" r="17" fill="#dff4ee"/><circle cx="78" cy="88" r="7" fill="#17344e"/><circle cx="124" cy="88" r="7" fill="#17344e"/><circle cx="75" cy="84" r="2.5" fill="#fff"/><circle cx="121" cy="84" r="2.5" fill="#fff"/><path d="M91 105L100 97L109 105L100 111Z" fill="#f2a846" stroke="#9b5b21" stroke-width="2"/>${mouth}<path d="M59 134Q100 151 141 134L153 220Q100 245 47 220Z" fill="url(#${id}-pip-body)" stroke="#17344e" stroke-width="5"/><path d="M84 164L100 179L116 164" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M58 159Q30 164 24 193" fill="none" stroke="#087566" stroke-width="18" stroke-linecap="round"/><path id="${id}-hand" d="M142 158Q166 143 176 112" fill="none" stroke="#087566" stroke-width="18" stroke-linecap="round"/><circle cx="178" cy="108" r="10" fill="#f2a846"/><path d="M73 223V242M127 223V242" stroke="#17344e" stroke-width="18" stroke-linecap="round"/></svg>`;
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

const FRACTION = /^(\d{1,2})\/(\d{1,2})$/;
function fractionParts(value) {
  const match = String(value).match(FRACTION);
  return match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
}
function fractionTrack(value, role = 'source') {
  const fraction = fractionParts(value);
  if (!fraction) return '';
  const { numerator, denominator } = fraction;
  const shade = Math.min(100, numerator / denominator * 100);
  const divisions = Array.from({ length: denominator - 1 }, (_, index) => `<i class="fraction-divider ${role}-divider" style="left:${((index + 1) / denominator * 100).toFixed(4)}%"></i>`).join('');
  return `<div class="fraction-track ${role}-track" role="img" aria-label="${escape(value)}"><div class="fraction-fill" style="transform:scaleX(${(shade / 100).toFixed(5)})"></div><div class="fraction-divisions">${divisions}</div><i class="shade-endpoint" style="left:${shade.toFixed(4)}%"><span>shaded amount ends here</span></i></div>`;
}
function fractionTransformation(from, to) {
  const source = fractionParts(from), target = fractionParts(to);
  if (!source || !target) return '';
  const numeratorFactor = target.numerator / source.numerator, denominatorFactor = target.denominator / source.denominator;
  if (!Number.isInteger(numeratorFactor) || numeratorFactor !== denominatorFactor) return '';
  return `<div class="fraction-operation" aria-label="Multiply numerator and denominator by ${numeratorFactor}"><svg viewBox="0 0 78 72" aria-hidden="true"><path class="concept-arrow-line" d="M39 3V58"/><path class="concept-arrow-head" d="M28 48L39 60L50 48"/></svg><div><b>split every part ×${numeratorFactor}</b><span>${source.numerator} × ${numeratorFactor} = ${target.numerator} &nbsp;·&nbsp; ${source.denominator} × ${numeratorFactor} = ${target.denominator}</span></div></div>`;
}
function fractionChoice(value, index) {
  return `<div class="fraction-choice reveal" data-choice="${index + 1}"><span class="choice-letter">${String.fromCharCode(65 + index)}</span>${fractionTrack(value, 'choice')}<strong>${escape(value)}</strong></div>`;
}
function visualHtml(visual, beat, narration) {
  if (beat === 'question' && visual.kind === 'recap' && visual.items.every(item => FRACTION.test(item))) return `<p class="visual-label">${escape(visual.label)}</p><div class="fraction-choices">${visual.items.map(fractionChoice).join('')}</div>`;
  if (beat === 'question') return `<div class="question-prompt reveal" style="font-size:${narration.length > 180 ? 28 : 34}px;line-height:1.4;padding:24px;background:#fffdf7;border-radius:12px">${escape(narration)}</div>`;
  const label = visual.label ? `<p class="visual-label">${escape(visual.label)}</p>` : '';
  if (visual.kind === 'place-value') {
    const values = fairPlaceValue(visual.number, visual.highlightPlace);
    const target = values.find(item => item.highlighted);
    return `${label}<div class="place-grid">${values.map(item => `<div class="place-column reveal${item.highlighted ? ' selected' : ''}">${item.decimalBefore ? '<span class="decimal-dot">.</span>' : ''}<span class="place-name">${escape(item.place)}</span><span class="digit">${item.digit}</span><span class="place-factor">${item.exponent >= 0 ? (10 ** item.exponent).toLocaleString('en-US') : (10 ** item.exponent).toFixed(-item.exponent)}</span></div>`).join('')}</div>${target ? `<div class="takeaway reveal"><span>${target.digit} ${escape(target.place)}</span><strong>= ${escape(target.contribution)}</strong></div>` : ''}`;
  }
  if (visual.kind === 'equation') return `${label}<div class="equations">${visual.lines.map((line, index) => `<div class="equation reveal"><span class="line-number">${index + 1}</span><span>${escape(line)}</span></div>`).join('')}</div>`;
  if (visual.kind === 'comparison' && fractionParts(visual.left) && fractionParts(visual.right)) return `${label}<div class="fraction-comparison"><div class="fraction-compare reveal"><span>${escape(visual.leftLabel)}</span>${fractionTrack(visual.left, 'compare')}<strong>${escape(visual.left)}</strong></div><div class="compare-arrow reveal"><svg viewBox="0 0 72 36" aria-hidden="true"><path class="compare-arrow-line" d="M4 18H59"/><path d="M48 7L61 18L48 29"/></svg><b>not equal</b></div><div class="fraction-compare reveal"><span>${escape(visual.rightLabel)}</span>${fractionTrack(visual.right, 'compare')}<strong>${escape(visual.right)}</strong></div><div class="mismatch-note reveal">The endpoints do not match: same number of pieces ≠ same amount</div></div>`;
  if (visual.kind === 'comparison') return `${label}<div class="comparison"><div class="compare-side reveal"><span>${escape(visual.leftLabel)}</span><strong>${escape(visual.left)}</strong></div><div class="compare-side reveal"><span>${escape(visual.rightLabel)}</span><strong>${escape(visual.right)}</strong></div></div>`;
  if (visual.kind === 'number-line') {
    const x = 40 + (visual.mark - visual.min) / (visual.max - visual.min) * 760;
    return `${label}<svg class="number-line reveal" viewBox="0 0 840 210" role="img" aria-label="${escape(visual.label)}"><path d="M40 100H800" stroke="#33554e" stroke-width="5"/>${Array.from({ length: 6 }, (_, index) => { const px = 40 + index * 152, value = visual.min + (visual.max - visual.min) * index / 5; return `<path d="M${px} 88V112" stroke="#33554e" stroke-width="3"/><text x="${px}" y="150" text-anchor="middle" font-size="24" fill="#263d38">${Number(value.toPrecision(12))}</text>`; }).join('')}<circle cx="${x}" cy="100" r="12" fill="#b7552d"/><text x="${x}" y="57" text-anchor="middle" font-size="36" font-weight="700" fill="#9b4321">${visual.mark}</text></svg>`;
  }
  if (visual.kind === 'fraction-bars') {
    return `${label}<div class="fraction-demo${beat === 'hook' ? ' paper-demo' : ''}"><div class="fraction-row source-row reveal"><strong>${escape(visual.fraction)}</strong>${fractionTrack(visual.fraction, 'source')}<span>same whole</span></div>${visual.equivalent ? `${fractionTransformation(visual.fraction, visual.equivalent)}<div class="fraction-equivalence"><span>=</span><small>same shaded endpoint</small></div><div class="fraction-row target-row"><strong>${escape(visual.equivalent)}</strong>${fractionTrack(visual.equivalent, 'target')}<span>repartitioned</span></div>` : ''}</div>`;
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
  if (visual.kind === 'average-share') {
    const max = Math.max(visual.mean, ...visual.items.map(item => item.value), 1);
    const cells = visual.items.map((item, column) => {
      const count = visual.mode === 'balanced' ? visual.mean : item.value;
      return `<div class="share-column" data-column="${column}"><strong>${escape(item.name)}</strong><div class="share-stack">${Array.from({ length: max }, (_, index) => `<i class="share-cell${index < count ? ' filled' : ''}${visual.mode === 'redistribute' && item.value > visual.mean && index >= visual.mean ? ' donor' : ''}${visual.mode === 'redistribute' && item.value < visual.mean && index >= item.value && index < visual.mean ? ' receiver' : ''}"></i>`).reverse().join('')}</div><span>${count}</span></div>`;
    }).join('');
    return `${label}<div class="average-board"><div class="mean-line" style="bottom:${74 + visual.mean * 34}px"><span>average = ${visual.mean}</span><svg viewBox="0 0 54 24" aria-hidden="true"><path d="M2 12H45M37 4L46 12L37 20"/></svg></div><div class="share-columns">${cells}</div>${visual.mode === 'redistribute' ? '<div class="share-note reveal">Move extras from above the line into the gaps below it.</div>' : ''}</div>`;
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

export function fairCaptionChunks(text, startSeconds, durationSeconds, timedWords) {
  const chunks = [];
  if (Array.isArray(timedWords) && timedWords.length) {
    let current = [], first = 0, last = 0;
    for (const word of timedWords) {
      if (!current.length) first = word.startSeconds;
      current.push(word.text);
      last = word.endSeconds;
      if (current.join(' ').length >= 64 || last - first >= 4.5) {
        chunks.push({ start: startSeconds + first, end: startSeconds + last, text: current.join(' ') });
        current = [];
      }
    }
    if (current.length) chunks.push({ start: startSeconds + first, end: startSeconds + last, text: current.join(' ') });
    return chunks;
  }
  const words = text.trim().split(/\s+/);
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

const CLASSIC_CSS = `*{box-sizing:border-box}body{margin:0;background:#f5f1e8;color:#243a34;font-family:system-ui,sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden}.clip{position:absolute}.scene{inset:0;background:#f5f1e8;padding:32px 52px 112px}.scene-top,.scene-footer{display:flex;justify-content:space-between;gap:30px;font-size:15px;font-weight:600;letter-spacing:.08em;color:#50645c}.scene-top{border-bottom:1px solid #d4d9ce;padding-bottom:18px}.scene-top span:last-child{max-width:700px;text-align:right;letter-spacing:0}.scene-body{display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:28px;height:470px;padding-top:32px;align-items:center}.scene.no-presenter .scene-body{grid-template-columns:1fr}.scene.no-presenter h1{max-width:1080px}.lesson{min-width:0}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.13em;color:#146658}.eyebrow span{color:#586453}h1{font-size:45px;line-height:1.12;letter-spacing:-1.6px;max-width:850px;margin:12px 0 24px;overflow-wrap:anywhere}.visual-label{font-size:22px;line-height:1.3;margin:0 0 16px;color:#44594e}.place-grid{display:flex;gap:5px}.place-column{position:relative;flex:1;min-width:0;text-align:center;background:#e5e9de;border-radius:12px;padding:14px 3px}.place-name{display:block;font-size:13px;font-weight:650;min-height:32px;overflow-wrap:anywhere}.digit{display:block;font-size:62px;font-weight:750;line-height:1.15;font-variant-numeric:tabular-nums}.place-factor{display:block;font-size:17px;margin-top:8px}.place-column.selected{background:#166859;color:#fff}.decimal-dot{position:absolute;left:-9px;top:43px;font-size:60px;color:#243a34;z-index:2}.takeaway{display:flex;justify-content:center;gap:20px;align-items:center;margin-top:20px;font-size:28px}.takeaway strong{font-size:38px;color:#146658}.equations{display:grid;gap:12px}.equation{display:flex;align-items:center;gap:18px;font-size:29px;line-height:1.25;padding:14px 20px;background:#fffdf7;border-radius:10px;overflow-wrap:anywhere}.line-number,.step-number{flex-shrink:0;font-size:16px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#dae9df;color:#155e51}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.compare-side{padding:22px;background:#fffdf7;border-radius:12px}.compare-side>span{display:block;font-size:17px;margin-bottom:20px;color:#4e6459}.compare-side strong{font-size:31px;line-height:1.25;display:block;overflow-wrap:anywhere}.compare-side:last-child{background:#e0eadc}.fraction-demo{position:relative;max-width:980px;padding:4px 0}.fraction-row{display:grid;grid-template-columns:76px minmax(360px,1fr) 130px;align-items:center;gap:18px;margin:10px 0}.fraction-row strong,.fraction-choice strong,.fraction-compare strong{font-size:30px;color:#17344e}.fraction-row>span{font-size:16px;color:#63716b}.fraction-track{height:62px;position:relative;overflow:hidden;border-radius:10px;background:#fffaf0;box-shadow:0 0 0 3px #7e573e,0 4px 10px rgba(71,50,34,.12)}.fraction-fill{position:absolute;inset:0;background:#ec8b3f;transform-origin:left center}.fraction-divider{position:absolute;top:0;bottom:0;width:3px;background:#7e573e;transform:translateX(-1.5px)}.fraction-equivalence{display:flex;align-items:center;gap:14px;margin-left:94px;color:#146658;font-weight:850}.fraction-equivalence span{font-size:34px}.fraction-equivalence small{font-size:15px;letter-spacing:.04em}.paper-demo .fraction-track{background-color:#fffdf5;background-image:repeating-linear-gradient(0deg,rgba(163,119,70,.04) 0 2px,transparent 2px 6px);box-shadow:0 0 0 2px #b8966c,0 10px 20px rgba(92,66,39,.14)}.fraction-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.fraction-choice{position:relative;background:#fffdf7;border-radius:16px;padding:22px 18px 16px;box-shadow:0 0 0 1px rgba(36,58,52,.08),0 5px 16px rgba(36,58,52,.07);text-align:center}.fraction-choice .fraction-track{height:52px;margin:16px 0 14px}.choice-letter{position:absolute;top:10px;left:12px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#dae9df;color:#155e51;font-weight:850}.fraction-comparison{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:18px}.fraction-compare{background:#fffdf7;border-radius:14px;padding:16px}.fraction-compare>span{display:block;min-height:36px;font-size:16px;color:#5b6963}.fraction-compare .fraction-track{height:58px;margin:8px 0 10px}.amount-guide{position:absolute;left:calc(37.5% - 1px);top:53px;height:64px;border-left:3px dashed #b7552d;z-index:3}.mismatch-note{grid-column:1/-1;text-align:center;font-size:21px;font-weight:800;color:#9b4321}.number-line{display:block;width:100%;height:210px}.teaching-steps{display:grid;gap:12px}.teaching-step{display:flex;gap:16px;align-items:flex-start;padding:13px 16px;background:#fffdf7;border-radius:10px}.teaching-step p{font-size:25px;line-height:1.32;margin:0}.presenter{align-self:end;padding-bottom:25px}.avatar-stage{width:200px;height:260px}.avatar-stage svg{width:100%;height:100%}.avatar-name{text-align:center;font-size:22px;font-weight:700;margin-top:14px}.avatar-name span{display:block;font-size:13px;letter-spacing:.02em;font-weight:500;margin-top:5px;color:#58695e}.scene-footer{margin-top:16px;letter-spacing:0;font-size:13px;max-width:1176px}.scene-footer span:first-child{max-width:1000px}.caption{left:52px;right:52px;bottom:24px;min-height:60px;display:flex;justify-content:center;align-items:center;z-index:10;text-align:center}.caption span{background:#243a34;color:#fff;padding:12px 24px;border-radius:10px;font-size:25px;line-height:1.35;max-width:1120px}.think{bottom:28px;left:52px;right:52px;text-align:center;font-size:23px;font-weight:650;color:#176455;z-index:11}.think-track{width:280px;height:7px;overflow:hidden;background:#d7e0d5;border-radius:10px;margin:12px auto}.think-fill{width:100%;height:100%;background:#176455}.beat-hook h1,.beat-recap h1{font-size:49px}.beat-question .visual-label{font-weight:650;color:#146658}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}}
body,.scene{background:#fff}.fraction-operation{height:54px;margin:0 130px 0 92px;display:flex;align-items:center;gap:8px;color:#087566}.fraction-operation svg{width:48px;height:48px;flex:none;overflow:visible}.fraction-operation path,.compare-arrow path{fill:none;stroke:#087566;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.fraction-operation div{display:flex;flex-direction:column;gap:2px}.fraction-operation b{font-size:17px}.fraction-operation span{font-size:15px;color:#3d5a52;font-weight:700}.shade-endpoint{position:absolute;top:0;bottom:0;width:4px;background:#087566;transform:translateX(-2px);z-index:4}.shade-endpoint:before{content:"";position:absolute;left:-5px;top:3px;width:14px;height:14px;border-radius:50%;background:#087566;box-shadow:0 0 0 4px #fff}.shade-endpoint span{display:none}.fraction-choices .shade-endpoint span,.fraction-comparison .shade-endpoint span{display:none}.fraction-equivalence{position:absolute;right:16px;top:92px;flex-direction:column;gap:0;margin:0}.fraction-equivalence span{font-size:28px}.fraction-equivalence small{font-size:12px}.fraction-comparison{grid-template-columns:1fr 86px 1fr;align-items:center}.fraction-comparison .mismatch-note{grid-column:1/-1}.compare-arrow{text-align:center;color:#9b4321}.compare-arrow svg{width:68px;display:block;margin:auto}.compare-arrow path{stroke:#b7552d}.compare-arrow b{display:block;font-size:15px}.avatar-stage{filter:drop-shadow(0 10px 12px rgba(23,52,78,.12))}.avatar-name{color:#17344e}.presenter{padding-bottom:12px}.average-board{position:relative;height:340px;max-width:940px;padding:8px 60px 44px 120px}.share-columns{height:278px;display:flex;align-items:flex-end;justify-content:space-around;gap:22px;border-bottom:4px solid #17344e}.share-column{width:118px;text-align:center}.share-column strong{display:block;font-size:17px;margin-bottom:7px}.share-column>span{display:block;font-size:26px;font-weight:850;margin-top:8px}.share-stack{height:210px;display:flex;flex-direction:column;justify-content:flex-end;gap:4px}.share-cell{height:30px;border-radius:7px;background:#edf3f1;box-shadow:inset 0 0 0 2px #c8d8d3}.share-cell.filled{background:#f3a85e;box-shadow:inset 0 0 0 2px #b7552d}.share-cell.donor{background:#ffd5ad}.share-cell.receiver{background:#8bd2c1;box-shadow:inset 0 0 0 2px #087566}.mean-line{position:absolute;left:30px;right:4px;height:0;border-top:4px dashed #087566;z-index:3;color:#087566}.mean-line span{position:absolute;left:0;bottom:10px;font-size:18px;font-weight:850;background:#fff;padding:4px 8px}.mean-line svg{position:absolute;right:-4px;top:-13px;width:54px;height:24px;background:#fff}.mean-line path{fill:none;stroke:#087566;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.share-note{text-align:center;margin-top:12px;font-size:19px;font-weight:750;color:#087566}@media(prefers-reduced-motion:reduce){.concept-arrow-line,.concept-arrow-head,.compare-arrow-line,.shade-endpoint,.mean-line path,.donor,.receiver{transform:none!important;opacity:1!important}}
`;

// Phase A: title sequence, interactive question cards and a rendered countdown.
// The classic renderer is authored at 1280x720 and scaled to 1080p, matching the
// film renderer so both paths deliver the same output resolution.
const PHASE_A_CSS = `
.fair-frame{position:absolute;inset:0;width:1280px;height:720px;transform:scale(1.5);transform-origin:0 0}
.intro-card,.outro-card{inset:0;padding:44px 56px 38px;display:flex;flex-direction:column;justify-content:space-between;background:#f5f1e8;z-index:14}
.intro-wash,.outro-wash{position:absolute;inset:0;background:radial-gradient(120% 100% at 88% 8%,#fff8e6 0%,#f5f1e8 62%)}
.intro-top,.outro-top{position:relative;display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #d4d9ce;padding-bottom:16px}
.intro-brand{font-size:19px;font-weight:800;letter-spacing:.18em;color:#17344e}
.intro-brand i{color:#b7552d;font-style:normal}
.intro-unit{font-size:15px;font-weight:700;letter-spacing:.1em;color:#50645c;text-transform:uppercase}
.intro-body,.outro-body{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:30px;align-items:center;flex:1}
.intro-eyebrow{margin:0 0 14px;font-size:16px;font-weight:800;letter-spacing:.16em;color:#146658}
.intro-card h1{margin:0 0 20px;font-size:54px;line-height:1.08;letter-spacing:-1.8px;max-width:840px}
.intro-rule{height:6px;width:100%;max-width:420px;background:#e0d7c4;border-radius:99px;overflow:hidden;margin-bottom:22px}
.intro-rule span{display:block;height:100%;width:100%;background:#b7552d;border-radius:99px}
.intro-objective{margin:0 0 18px;font-size:26px;line-height:1.35;max-width:800px;color:#2c443d}
.intro-meta{margin:0;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#6a7a70}
.intro-guide{align-self:end;justify-self:center;padding-bottom:8px}
.intro-guide svg{width:210px;height:auto;filter:drop-shadow(0 12px 14px rgba(23,52,78,.14))}
.intro-guide .avatar-name{text-align:center}
.intro-foot,.outro-foot{position:relative;display:flex;justify-content:space-between;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7d8a80}
.outro-rules{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:12px;max-width:840px}
.outro-rule{display:flex;align-items:center;gap:16px;font-size:27px;line-height:1.25;background:#fffdf7;border:1px solid #e2dbc9;border-radius:14px;padding:12px 18px}
.outro-number{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#dff0ea;color:#146658;font-weight:800;font-size:17px}
.outro-rule span:last-child{overflow-wrap:anywhere}
.outro-next{margin:0;font-size:18px;color:#50645c}
.outro-guide{align-self:center}
.think{inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 52px 22px;z-index:11}
.think-card{position:relative;display:flex;flex-direction:row;align-items:center;gap:14px;background:#fffdf7;border:2px solid #d4d9ce;border-radius:999px;padding:10px 26px;box-shadow:0 10px 24px rgba(23,52,78,.14)}
.think-card>span{font-size:15px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#146658}
.think-card small{font-size:14px;color:#50645c}
.think-ring{width:38px;height:38px;flex:none;transform:rotate(-90deg)}
.think-ring-track{fill:none;stroke:#e2dbc9;stroke-width:9}
.think-ring-fill{fill:none;stroke:#b7552d;stroke-width:9;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0}
.choice-grid{gap:14px}
.choice-card{border:2px solid #ded6c3;text-align:center}
.choice-card .fraction-track{width:100%}
.choice-card strong{font-size:24px}
.choice-letter{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e7efe9;color:#146658;font-size:14px;font-weight:800}
.choice-hint{margin:14px 0 0;font-size:17px;color:#50645c}
.partition-stage{width:100%;max-width:950px}
.partition-stage svg{width:100%;height:auto;display:block;margin:0 auto;overflow:visible}
.predict-row{display:flex;gap:14px;margin-top:20px;justify-content:center}
.predict-chip{display:flex;align-items:center;gap:10px;background:#fffdf7;border:2px solid #ded6c3;border-radius:999px;padding:10px 20px;box-shadow:0 6px 16px rgba(23,52,78,.08)}
.predict-chip strong{font-size:22px;color:#17344e}
.answer-strip{display:flex;gap:10px;margin:0 0 12px;justify-content:center;flex-wrap:wrap}
.answer-chip{display:flex;align-items:center;gap:9px;background:#fffdf7;border:2px solid #ded6c3;border-radius:14px;padding:7px 12px;min-width:212px;opacity:.4}
.answer-chip .fraction-track{height:28px;margin:0;flex:1}
.answer-chip strong{font-size:21px;color:#17344e}
.predict-chip .choice-letter,.answer-chip .choice-letter{position:static;top:auto;left:auto;flex:none}
.answer-chip.correct{opacity:1;border-color:#147d6c;background:#eefaf5;box-shadow:0 8px 18px rgba(20,125,108,.18)}
.answer-chip.dimmed strong{text-decoration:line-through}
`;

function itemRevealTimes(track, speechStart, count) {
  const speech = track?.durationSeconds ?? 0;
  const starts = (Array.isArray(track?.phrases) ? track.phrases : []).map(phrase => phrase.startSeconds);
  const snap = target => {
    const nearest = starts.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, target);
    return speechStart + (Math.abs(nearest - target) <= 0.4 ? nearest : target);
  };
  if (count <= 1) return [snap(speech * 0.12)];
  return Array.from({ length: count }, (_, index) => snap(speech * (0.12 + 0.8 * index / (count - 1))));
}

const beatLabel = { hook: 'LET’S FIND OUT', concept: 'LOOK CLOSELY', example: 'BUILD IT', misconception: 'WHAT DOES IT MEAN?', question: 'YOUR TURN', answer: 'LET’S CHECK', recap: 'REMEMBER THIS' };
const LETTERS = 'ABCD';

function interactionCardsHtml(interaction, id) {
  return `<p class="visual-label">${escape(interaction.prompt)}</p><div class="fraction-choices choice-grid">${interaction.options.map((option, index) => `<div class="fraction-choice choice-card" id="${id}-choice-${index}" data-choice="${index + 1}"><span class="choice-letter">${LETTERS[index]}</span>${fractionTrack(option.label, 'choice')}<strong>${escape(option.label)}</strong></div>`).join('')}</div><p class="choice-hint">Commit to one in your head. The answer comes after the pause.</p>`;
}

function hookVisualHtml(visual) {
  const label = visual.label ? `<p class="visual-label">${escape(visual.label)}</p>` : '';
  return `${label}<div class="fraction-demo paper-demo"><div class="fraction-row source-row reveal"><strong>${escape(visual.fraction)}</strong>${fractionTrack(visual.fraction, 'source')}<span>same whole</span></div></div>`;
}

function answerStripHtml(interaction, id) {
  return `<div class="answer-strip">${interaction.options.map((option, index) => `<div class="answer-chip${option.correct ? ' correct' : ' dimmed'}" id="${id}-chip-${index}"><span class="choice-letter">${LETTERS[index]}</span>${fractionTrack(option.label, 'choice')}<strong>${escape(option.label)}</strong></div>`).join('')}</div>`;
}

export async function fairCompose(lesson, tracks, brief, directory) {
  if (brief.generationVersion === 'quality' || lesson.scenes.some(scene => scene.visual.kind === 'base-ten') || brief.avatar === 'none') return fairFilmCompose(lesson, tracks, brief, directory, { visualHtml, fairAvatarSvg, fairCaptionChunks });
  await mkdir(directory, { recursive: true });
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(directory, 'gsap.min.js'));
  const avatar = FAIR_AVATARS.find(item => item.id === brief.avatar) || FAIR_AVATARS[0];
  const guideFor = id => `<div class="avatar-stage">${fairAvatarSvg(brief.avatar, id)}</div><div class="avatar-name">${avatar.name}<span>learning guide</span></div>`;
  const introGuide = guideFor('fair-intro'), outroGuide = guideFor('fair-outro');
  const interactions = lesson.scenes.map((_, index) => fairInteractionFor(lesson.scenes, index));
  const introStyle = ['card', 'sting'].includes(brief.intro) ? brief.intro : null;
  const introDuration = introStyle ? fairIntroSeconds(introStyle) : 0;
  const outroDuration = introStyle ? fairOutroSeconds() : 0;
  let at = introDuration;
  const scenes = lesson.scenes.map((scene, index) => {
    const track = tracks.find(item => item.sceneId === scene.id);
    if (!track) throw new Error(`Scene ${scene.id} is missing narration.`);
    const speechStart = at + 0.35;
    const duration = Math.max(4, track.durationSeconds + scene.pauseSeconds + 0.7);
    // Example and answer scenes that repartition use the transformation engine:
    // the bar is cut in place rather than replaced by a second static bar.
    const partition = scene.visual.kind === 'fraction-bars' && scene.visual.equivalent && ['example', 'answer'].includes(scene.beat)
      ? fairPartitionSvg({ fraction: scene.visual.fraction, equivalent: scene.visual.equivalent, id: `fair-${scene.id}`, label: scene.visual.label })
      : null;
    const timed = { ...scene, index, start: at, duration, speechStart, track, partition,
      interaction: interactions[index], previousInteraction: index > 0 ? interactions[index - 1] : null,
      captions: fairCaptionChunks(scene.narration, speechStart, track.durationSeconds,
        track.wordTimingSource && track.wordTimingSource !== 'estimated' ? track.words : undefined) };
    at += duration;
    return timed;
  });
  const scenesEnd = at, totalDuration = scenesEnd + outroDuration;
  const captions = scenes.flatMap(scene => scene.captions);
  const introClip = introStyle ? fairIntroClip({ lesson, brief, start: 0, duration: introDuration, guideHtml: introGuide, id: 'fair-intro' }) : null;
  const outroClip = introStyle ? fairOutroClip({ lesson, brief, start: scenesEnd, duration: outroDuration, guideHtml: outroGuide, id: 'fair-outro' }) : null;
  const sceneHtml = scenes.map(scene => {
    const id = `fair-${scene.id}`;
    const showGuide = ['hook', 'misconception', 'question', 'recap'].includes(scene.beat);
    const withhold = scene.beat === 'hook' && scene.visual.kind === 'fraction-bars' && scene.visual.equivalent;
    const visual = scene.interaction
      ? (scene.beat === 'hook'
        ? `${hookVisualHtml(scene.visual)}<div class="predict-row">${scene.interaction.options.map((option, index) => `<div class="predict-chip" id="${id}-choice-${index}"><span class="choice-letter">${LETTERS[index]}</span><strong>${escape(option.label)}</strong></div>`).join('')}</div>`
        : interactionCardsHtml(scene.interaction, id))
      : scene.partition ? (scene.previousInteraction?.type === 'choose' ? scene.partition.html : `${scene.visual.label ? `<p class="visual-label">${escape(scene.visual.label)}</p>` : ''}${scene.partition.html}`)
        : withhold ? hookVisualHtml(scene.visual) : visualHtml(scene.visual, scene.beat, scene.narration);
    const strip = scene.previousInteraction?.type === 'choose' ? answerStripHtml(scene.previousInteraction, id) : '';
    return `<section id="${id}" class="clip scene beat-${scene.beat}${showGuide ? '' : ' no-presenter'}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1"><div class="scene-top"><span>FAIR / CLASSROOM</span><span>${escape(lesson.audience)}</span></div><div class="scene-body"><main class="lesson"><div class="eyebrow">${escape(beatLabel[scene.beat] ?? String(scene.beat).toUpperCase())} <span> / ${String(scene.index + 1).padStart(2, '0')}</span></div><h1>${escape(scene.title)}</h1><div class="visual">${strip}${visual}</div></main>${showGuide ? `<aside class="presenter">${guideFor(id)}</aside>` : ''}</div><div class="scene-footer"><span>${escape(lesson.title)}</span><span>${scene.index + 1} / ${scenes.length}</span></div></section>`;
  }).join('\n');
  const audioHtml = scenes.map(scene => `<audio id="audio-${scene.id}" src="${scene.track.file}" data-start="${scene.speechStart}" data-duration="${scene.track.durationSeconds}" data-track-index="2" data-volume="1"></audio>`).join('\n');
  const captionHtml = captions.map((caption, index) => `<div id="caption-${index}" class="clip caption" data-layout-allow-caption-zone data-start="${caption.start}" data-duration="${caption.end - caption.start}" data-track-index="3"><span>${escape(caption.text)}</span></div>`).join('\n');
  const pausing = scene => ['question', 'hook'].includes(scene.beat) && scene.pauseSeconds > 0;
  const pauses = scenes.filter(pausing).map(scene => `<div id="pause-${scene.id}" class="clip think" data-start="${scene.speechStart + scene.track.durationSeconds}" data-duration="${scene.pauseSeconds}" data-track-index="4" data-layout-allow-caption-zone><div class="think-card"><svg class="think-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="think-ring-track" cx="60" cy="60" r="52"></circle><circle id="think-ring-${scene.id}" class="think-ring-fill" cx="60" cy="60" r="52" pathLength="100"></circle></svg><span>Pause and think</span><small>${scene.interaction ? 'Commit to one before the answer' : 'Work it out in your head'}</small></div></div>`).join('\n');
  const timeline = scenes.map(scene => {
    const id = `fair-${scene.id}`, selector = `#${id}`;
    const fragments = [
      `tl.fromTo('${selector} h1',{opacity:0,y:10},{opacity:1,y:0,duration:0.3,ease:'power3.out'},${scene.start});`,
      // A very slow push keeps the frame alive between teaching moments without
      // competing with them; each scene drifts in its own direction.
      `tl.fromTo('${selector}',{scale:1.004,y:1},{scale:1.019,y:-2,duration:${scene.duration.toFixed(3)},ease:'none'},${scene.start});`,
    ];
    // Elements with bespoke choreography are excluded from the generic reveal, so
    // one element is never faded in early and then re-animated later.
    const bespoke = [];
    if (scene.visual.kind === 'fraction-bars' && scene.visual.equivalent && scene.beat !== 'hook') bespoke.push('.target-row', '.fraction-equivalence');
    if (scene.visual.kind === 'comparison' && fractionParts(scene.visual.left) && fractionParts(scene.visual.right)) bespoke.push('.fraction-compare', '.compare-arrow', '.mismatch-note');
    const phraseAt = fraction => {
      const target = scene.track.durationSeconds * fraction;
      const nearest = (Array.isArray(scene.track.phrases) ? scene.track.phrases : [])
        .reduce((best, phrase) => Math.abs(phrase.startSeconds - target) < Math.abs(best - target) ? phrase.startSeconds : best, target);
      return scene.speechStart + (Math.abs(nearest - target) <= 0.45 ? nearest : target);
    };
    // Lists (steps / recap) reveal each item near the phrase that names it;
    // everything else keeps the generic stagger inside its own visual.
    const listed = scene.interaction ? 0 : scene.visual.kind === 'steps' || scene.visual.kind === 'recap' ? scene.visual.items?.length ?? 0 : 0;
    if (listed >= 2) {
      itemRevealTimes(scene.track, scene.speechStart, listed).forEach((time, index) => {
        fragments.push(`tl.fromTo('${selector} .teaching-step:nth-child(${index + 1})',{opacity:0,y:14},{opacity:1,y:0,duration:.36,ease:'power3.out'},${time.toFixed(3)});`);
      });
    } else if (!scene.partition) {
      const revealSelector = `${selector} .reveal${bespoke.map(entry => `:not(${entry})`).join('')}`;
      fragments.push(`gsap.utils.toArray('${revealSelector}').forEach((el,i,items)=>tl.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:0.35,ease:'power3.out'},${scene.start + 0.25}+i*Math.min(2,${scene.track.durationSeconds}/Math.max(2,items.length+1))));`);
    }
    // A hook must not reveal its own answer: the repartition happens in the
    // example scene, after the learner has committed to a prediction.
    if (scene.beat === 'hook' && scene.visual.kind === 'fraction-bars' && scene.visual.equivalent) {
      const speech = scene.track.durationSeconds;
      const at = fraction => (scene.speechStart + speech * fraction).toFixed(3);
      fragments.push(`tl.fromTo('${selector} .source-divider',{scaleY:0,transformOrigin:'center center'},{scaleY:1,duration:.45,ease:'power2.inOut'},${at(0.16)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-fill',{scaleX:0,transformOrigin:'left center'},{scaleX:0.5,duration:.6,ease:'power2.out'},${at(0.3)});`);
      fragments.push(`tl.fromTo('${selector} .shade-endpoint',{opacity:0,scaleY:.2,transformOrigin:'center bottom'},{opacity:1,scaleY:1,duration:.42,ease:'power3.out'},${at(0.52)});`);
    }
    if (scene.partition) {
      const motion = fairPartitionMotion({ id, model: scene.partition.model, parts: scene.partition.parts, phraseAt });
      fragments.push(motion.code);
      scene.partitionCues = motion.cues;
    }
    if (!scene.partition && scene.visual.kind === 'fraction-bars' && scene.visual.equivalent && scene.beat !== 'hook') {
      const splitAt = Math.max(scene.start + 1.2, phraseAt(0.26));
      const targetAt = Math.max(splitAt + 0.6, phraseAt(0.45));
      const equivalenceAt = Math.max(targetAt + 0.6, phraseAt(0.72));
      const changeAt = splitAt;
      fragments.push(`tl.fromTo('${selector} .source-row .shade-endpoint',{opacity:0,scaleY:.2,transformOrigin:'center bottom'},{opacity:1,scaleY:1,duration:.42,ease:'power3.out'},${scene.start + .8});`);
      fragments.push(`tl.fromTo('${selector} .fraction-operation',{opacity:0,y:-6},{opacity:1,y:0,duration:.4,ease:'power3.out'},${changeAt - .2});`);
      fragments.push(`tl.fromTo('${selector} .concept-arrow-line',{scaleY:0,transformOrigin:'center top'},{scaleY:1,duration:.42,ease:'power2.out'},${changeAt});`);
      fragments.push(`tl.fromTo('${selector} .concept-arrow-head',{opacity:0,y:-6},{opacity:1,y:0,duration:.28,ease:'back.out(1.2)'},${changeAt + .32});`);
      fragments.push(`tl.fromTo('${selector} .target-row',{opacity:0,y:10},{opacity:1,y:0,duration:.45,ease:'power3.out'},${targetAt});`);
      fragments.push(`tl.fromTo('${selector} .target-divider',{scaleY:0,transformOrigin:'center top'},{scaleY:1,duration:.38,stagger:.1,ease:'power2.out'},${targetAt + .35});`);
      fragments.push(`tl.fromTo('${selector} .target-row .shade-endpoint',{opacity:0,scaleY:.2,transformOrigin:'center bottom'},{opacity:1,scaleY:1,duration:.42,ease:'power3.out'},${targetAt + .75});`);
      fragments.push(`tl.fromTo('${selector} .target-row .shade-endpoint',{scaleY:1},{scaleY:1.22,duration:.24,yoyo:true,repeat:1,ease:'sine.inOut'},${(equivalenceAt + .35).toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-equivalence',{opacity:0,scale:.94},{opacity:1,scale:1,duration:.42,ease:'back.out(1.2)'},${equivalenceAt});`);
      // Point back at the invariant while the narration says the amount did not change.
      fragments.push(`tl.to('${selector} .fraction-equivalence',{scale:1.06,duration:.3,yoyo:true,repeat:1,ease:'sine.inOut'},${phraseAt(0.88).toFixed(3)});`);
      fragments.push(`tl.to('${selector} .shade-endpoint',{opacity:.45,duration:.26,yoyo:true,repeat:1,stagger:.16,ease:'sine.inOut'},${phraseAt(0.92).toFixed(3)});`);
    }
    if (scene.visual.kind === 'comparison' && fractionParts(scene.visual.left) && fractionParts(scene.visual.right)) {
      const leftAt = phraseAt(0.2), rightAt = phraseAt(0.38), arrowAt = phraseAt(0.58), noteAt = phraseAt(0.76), measureAt = phraseAt(0.9);
      fragments.push(`tl.fromTo('${selector} .fraction-compare:nth-child(1)',{opacity:0,y:12},{opacity:1,y:0,duration:.4,ease:'power3.out'},${leftAt.toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-compare:nth-child(1) .shade-endpoint',{opacity:0,scaleY:.2,transformOrigin:'center bottom'},{opacity:1,scaleY:1,duration:.4,ease:'power3.out'},${(leftAt + .2).toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-compare:nth-child(3)',{opacity:0,y:12},{opacity:1,y:0,duration:.4,ease:'power3.out'},${rightAt.toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-compare:nth-child(3) .shade-endpoint',{opacity:0,scaleY:.2,transformOrigin:'center bottom'},{opacity:1,scaleY:1,duration:.4,ease:'power3.out'},${(rightAt + .2).toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .compare-arrow',{opacity:0,scale:.9},{opacity:1,scale:1,duration:.36,ease:'back.out(1.4)'},${arrowAt.toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .compare-arrow-line',{scaleX:0,transformOrigin:'left center'},{scaleX:1,duration:.45,ease:'power2.out'},${(arrowAt + .12).toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .mismatch-note',{opacity:0,y:8},{opacity:1,y:0,duration:.4,ease:'power3.out'},${noteAt.toFixed(3)});`);
      fragments.push(`tl.fromTo('${selector} .fraction-compare:nth-child(3) .fraction-fill',{opacity:1},{opacity:.72,duration:.26,yoyo:true,repeat:1,ease:'sine.inOut'},${measureAt.toFixed(3)});`);
    }
    if (scene.interaction) {
      // In a practice question each option is named in turn, so reveal it with the
      // phrase that names it. A hook prediction appears once, when it is asked.
      const chipTimes = scene.beat === 'hook'
        ? scene.interaction.options.map((_, position) => scene.speechStart + scene.track.durationSeconds * 0.68 + position * 0.24)
        : itemRevealTimes(scene.track, scene.speechStart, scene.interaction.options.length);
      scene.interaction.options.forEach((_, position) => {
        fragments.push(`tl.fromTo('${selector}-choice-${position}',{opacity:0,y:16},{opacity:1,y:0,duration:.38,ease:'power3.out'},${chipTimes[position].toFixed(3)});`);
      });
      if (scene.beat !== 'hook') fragments.push(`tl.fromTo('${selector} .choice-hint',{opacity:0},{opacity:.9,duration:.4},${(chipTimes.at(-1) + .35).toFixed(3)});`);
    }
    if (scene.previousInteraction?.type === 'choose') {
      scene.previousInteraction.options.forEach((_, position) => {
        fragments.push(`tl.fromTo('${selector}-chip-${position}',{opacity:0,y:10},{opacity:${scene.previousInteraction.options[position].correct ? 1 : .4},y:0,duration:.34,ease:'power3.out'},${scene.speechStart + .35 + position * .18});`);
      });
      const correctIndex = scene.previousInteraction.options.findIndex(option => option.correct);
      fragments.push(`tl.to('${selector}-chip-${correctIndex}',{scale:1.07,duration:.3,yoyo:true,repeat:1,ease:'sine.inOut'},${scene.speechStart + .5 + scene.previousInteraction.options.length * .18});`);
    }
    if (['hook', 'misconception', 'question', 'recap'].includes(scene.beat)) {
      for (const energy of scene.track.envelope) fragments.push(`tl.to('#${id}-mouth',{scaleY:${(0.35 + energy.value * 2.8).toFixed(3)},transformOrigin:'center center',duration:${Math.max(0, Math.min(0.08, scene.track.durationSeconds - energy.at - 0.002)).toFixed(3)},ease:'none'},${(scene.speechStart + energy.at).toFixed(3)});`);
      fragments.push(`tl.to('#${id}-mouth',{scaleY:0.35,duration:0.1},${scene.speechStart + scene.track.durationSeconds});`);
    }
    if (scene.beat === 'hook') fragments.push(`tl.fromTo('#${id}-hand',{rotation:-6},{rotation:3,svgOrigin:'142 158',duration:0.5,yoyo:true,repeat:1,ease:'power2.inOut'},${scene.start + 0.35});`);
    // The guide stays alive for as long as it is on screen: a slow breath and a
    // small float, never a fidget.
    if (['hook', 'misconception', 'question', 'recap'].includes(scene.beat)) {
      fragments.push(`tl.fromTo('${selector} .presenter svg',{y:0},{y:-5,duration:2.6,yoyo:true,repeat:-1,ease:'sine.inOut'},${scene.start});`);
      fragments.push(`tl.fromTo('${selector} .presenter svg',{scale:1},{scale:1.014,transformOrigin:'center bottom',duration:3.6,yoyo:true,repeat:-1,ease:'sine.inOut'},${scene.start});`);
    }
    if (['question', 'hook'].includes(scene.beat) && scene.pauseSeconds > 0) {
      const pauseAt = scene.speechStart + scene.track.durationSeconds;
      fragments.push(`tl.fromTo('#pause-${scene.id} .think-card',{opacity:0,y:12},{opacity:1,y:0,duration:.32,ease:'power3.out'},${pauseAt});`);
      fragments.push(`tl.fromTo('#think-ring-${scene.id}',{strokeDashoffset:0},{strokeDashoffset:100,duration:${scene.pauseSeconds},ease:'none'},${pauseAt});`);
    }
    return fragments.join('\n');
  }).join('\n');
  const introHtml = introClip ? introClip.html : '', outroHtml = outroClip ? outroClip.html : '';
  const clipCode = [introClip?.code, outroClip?.code].filter(Boolean).join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080"><title>${escape(lesson.title)}</title><script src="gsap.min.js"></script><style>${CLASSIC_CSS}</style><style>${PHASE_A_CSS}</style></head><body><div id="root" data-composition-id="fair-lesson" data-width="1920" data-height="1080" data-duration="${totalDuration}" data-start="0"><div class="fair-frame">${introHtml}${sceneHtml}${audioHtml}${captionHtml}${pauses}${outroHtml}</div></div><script>const tl=gsap.timeline({paused:true});${timeline}\n${clipCode}\nwindow.__timelines=window.__timelines||{};window.__timelines['fair-lesson']=tl;</script></body></html>`;
  await writeFile(join(directory, 'index.html'), html);
  await writeFile(join(directory, 'captions.vtt'), `WEBVTT\n\n${captions.map((caption, index) => `${index + 1}\n${fairTimestamp(caption.start)} --> ${fairTimestamp(caption.end)}\n${caption.text.replaceAll('-->', '→')}\n`).join('\n')}`);
  await writeFile(join(directory, 'transcript.txt'), `${lesson.title}\n${lesson.audience}\n\n${scenes.map(scene => `[${fairTimestamp(scene.start)}] ${scene.title}\n${scene.narration}${scene.beat === 'question' ? `\n[Think for ${scene.pauseSeconds} seconds]` : ''}`).join('\n\n')}\n`);
  await fairWriteJson(join(directory, 'storyboard.json'), {
    durationSeconds: totalDuration, introSeconds: introDuration, outroSeconds: outroDuration,
    timing: 'Scene durations measured from audio; caption and visual reveal timing is estimated.',
    audioCues: {
      cuts: [...scenes.map(scene => scene.start), scenesEnd].filter(time => time > 0),
      pauses: scenes.filter(pausing).map(scene => ({ start: scene.speechStart + scene.track.durationSeconds, end: scene.speechStart + scene.track.durationSeconds + scene.pauseSeconds })),
    },
    interactions: scenes.map(scene => scene.interaction ? { sceneId: scene.id, type: scene.interaction.type, options: scene.interaction.options, waitSeconds: scene.interaction.waitSeconds } : null).filter(Boolean),
    transformation: scenes.filter(scene => scene.partition).map(scene => ({ sceneId: scene.id, from: `${scene.partition.model.n}/${scene.partition.model.d}`, to: scene.partition.model.target ? `${scene.partition.model.target.n}/${scene.partition.model.target.d}` : null, phases: ['build', 'cut', 'count-parts', 'count-shaded', 'invariant', 'write'] })),
    scenes: scenes.map(({ track, interaction, previousInteraction, ...scene }) => ({ ...scene, audioFile: track.file, audioSha256: track.sha256 })),
  });
  await fairWriteJson(join(directory, 'hyperframes.json'), { name: 'fair-lesson', description: lesson.title });
  return { durationSeconds: totalDuration, captions, scenes,
    sfxCues: scenes.flatMap(scene => (scene.partitionCues ?? []).map(cue => ({ ...cue, sceneId: scene.id }))),
    intro: { style: introStyle, seconds: introDuration, outroSeconds: outroDuration, applied: Boolean(introStyle) },
    audioCues: { cuts: [...scenes.map(scene => scene.start), scenesEnd].filter(time => time > 0), pauses: scenes.filter(scene => scene.beat === 'question' && scene.pauseSeconds > 0).map(scene => ({ start: scene.speechStart + scene.track.durationSeconds, end: scene.speechStart + scene.track.durationSeconds + scene.pauseSeconds })) },
    animation: { name: 'FAIR concept-preserving teaching motion', type: lesson.scenes.some(scene => scene.visual.kind === 'fraction-bars') ? 'fraction-repartition-and-reasoning' : 'deterministic-teaching-diagrams', cueTiming: 'measured-audio', character: 'purposeful guide moments only' } };
}

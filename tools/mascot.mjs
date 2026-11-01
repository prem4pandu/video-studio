// "Ripple" — original mascot rig for Studio V2 productions.
// Emits an SVG group with named parts; the performance timeline drives
// viseme mouths from forced word alignment, idle life, and gestures.
import { readFile } from 'node:fs/promises';

const BODY = '#4aa8c0', BELLY = '#cdeef4', LINE = '#153c3a', SHINE = '#e8f8fb';

export function mascotSvg(id = 'mascot') {
  return `<g transform="translate(1620 640)"><g id="${id}">
 <g id="${id}-squash">
  <path id="${id}-arm-l" d="M-130 20 Q-190 -10 -205 -60" fill="none" stroke="${BODY}" stroke-width="26" stroke-linecap="round"/>
  <path id="${id}-arm-r" d="M130 20 Q195 -15 210 -70" fill="none" stroke="${BODY}" stroke-width="26" stroke-linecap="round"/>
  <path id="${id}-body" d="M0 -230 C110 -110 175 -10 175 90 C175 205 95 265 0 265 C-95 265 -175 205 -175 90 C-175 -10 -110 -110 0 -230 Z" fill="${BODY}"/>
  <ellipse cx="0" cy="150" rx="105" ry="72" fill="${BELLY}" opacity=".85"/>
  <ellipse cx="-78" cy="-95" rx="42" ry="58" fill="${SHINE}" opacity=".55" transform="rotate(-18 -78 -95)"/>
  <path id="${id}-tuft" d="M0 -230 C-24 -258 -8 -276 8 -286 C4 -268 14 -252 0 -230" fill="${BODY}"/>
  <g id="${id}-stick" opacity="0" transform="translate(208 -66) rotate(55)">
   <path d="M0 0 L78 -134" fill="none" stroke="#c9a35e" stroke-width="11" stroke-linecap="round"/>
   <circle cx="78" cy="-134" r="9" fill="${SHINE}" stroke="#c9a35e" stroke-width="5"/>
  </g>
  <g id="${id}-face" transform="translate(0 30)">
   <g id="${id}-brow-l"><path d="M-92 -78 Q-62 -92 -36 -78" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/></g>
   <g id="${id}-brow-r"><path d="M36 -78 Q62 -92 92 -78" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/></g>
   <g id="${id}-eye-l"><circle cx="-64" cy="-42" r="27" fill="#ffffff"/><circle id="${id}-pupil-l" cx="-60" cy="-39" r="13" fill="${LINE}"/><circle cx="-66" cy="-45" r="5" fill="#ffffff"/></g>
   <g id="${id}-eye-r"><circle cx="64" cy="-42" r="27" fill="#ffffff"/><circle id="${id}-pupil-r" cx="60" cy="-39" r="13" fill="${LINE}"/><circle cx="66" cy="-45" r="5" fill="#ffffff"/></g>
   <g id="${id}-lids"><ellipse cx="-64" cy="-42" rx="30" ry="0" fill="${BODY}"/><ellipse cx="64" cy="-42" rx="30" ry="0" fill="${BODY}"/></g>
   <ellipse id="${id}-cheek-l" cx="-98" cy="0" rx="22" ry="13" fill="#8fd0dc" opacity=".7"/>
   <ellipse id="${id}-cheek-r" cx="98" cy="0" rx="22" ry="13" fill="#8fd0dc" opacity=".7"/>
   <g id="${id}-mouth-closed"><path d="M-42 44 Q0 70 42 44" fill="none" stroke="${LINE}" stroke-width="10" stroke-linecap="round"/></g>
   <g id="${id}-mouth-open" opacity="0"><ellipse cx="0" cy="52" rx="34" ry="24" fill="#1d4e55"/><path d="M-26 42 Q0 58 26 42" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/></g>
   <g id="${id}-mouth-wide" opacity="0"><ellipse cx="0" cy="54" rx="44" ry="30" fill="#1d4e55"/><path d="M-34 38 Q0 62 34 38" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></g>
   <g id="${id}-mouth-smile" opacity="0"><path d="M-52 34 Q0 92 52 34 Q0 52 -52 34Z" fill="#1d4e55"/><path d="M-44 38 Q0 78 44 38" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></g>
   <g id="${id}-expr-excited" opacity="0">
    <path d="M-98 -104 Q-64 -122 -30 -104" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M30 -104 Q64 -122 98 -104" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-108 -124 v16 M-116 -116 h16 M108 -124 v16 M100 -116 h16" fill="none" stroke="${SHINE}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="-118" cy="-84" r="5" fill="${SHINE}"/><circle cx="118" cy="-84" r="5" fill="${SHINE}"/>
    <circle cx="-98" cy="-140" r="4" fill="${SHINE}"/><circle cx="98" cy="-140" r="4" fill="${SHINE}"/>
   </g>
   <g id="${id}-expr-confused" opacity="0">
    <path d="M-94 -84 Q-64 -74 -36 -62" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M36 -98 Q64 -110 94 -100" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-72" cy="-32" r="14" fill="${LINE}"/><circle cx="-77" cy="-37" r="4" fill="#ffffff"/>
    <circle cx="52" cy="-45" r="10" fill="${LINE}"/><circle cx="49" cy="-49" r="3" fill="#ffffff"/>
   </g>
   <g id="${id}-expr-thinking" opacity="0">
    <path d="M-92 -84 Q-64 -70 -38 -62" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M38 -62 Q64 -70 92 -84" fill="none" stroke="${LINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-30 62 Q0 46 30 62" fill="none" stroke="${LINE}" stroke-width="10" stroke-linecap="round"/>
   </g>
  </g>
 </g>
 </g>
</g>`;
}

// Mouth states: closed=0, open=1, wide=2, smile=3
const MOUTHS = ['closed', 'open', 'wide', 'smile'];
export function mouthSets(id, state, at) {
  return MOUTHS.map((m, i) => `tl.set('#${id}-mouth-${m}',{opacity:${i === state ? 1 : 0}},${at.toFixed(3)});`).join('');
}

// Expression layers shown over the face; the base features each replaces are
// faded out for the hold window, then restored. Times may be numbers (default
// 1.5s hold) or {at, hold}. Overlapping expressions are not stacked.
const EXPR_HIDE = {
  excited: ['brow-l', 'brow-r'],
  confused: ['brow-l', 'brow-r', 'pupil-l', 'pupil-r'],
  thinking: ['brow-l', 'brow-r', 'mouth-closed', 'mouth-open', 'mouth-wide', 'mouth-smile'],
};
export function expressionTimeline(id, { excited = [], confused = [], thinking = [] } = {}) {
  let out = '';
  for (const [name, times] of Object.entries({ excited, confused, thinking })) {
    for (const e of times) {
      const at = typeof e === 'number' ? e : +e.at || 0;
      const end = at + (e && typeof e === 'object' && +e.hold > 0 ? +e.hold : 1.5);
      out += `tl.set('#${id}-expr-${name}',{opacity:1},${at.toFixed(3)});`;
      for (const p of EXPR_HIDE[name]) out += `tl.set('#${id}-${p}',{opacity:0},${at.toFixed(3)});`;
      out += `tl.set('#${id}-expr-${name}',{opacity:0},${end.toFixed(3)});`;
      for (const p of EXPR_HIDE[name]) out += `tl.set('#${id}-${p}',{opacity:${!p.startsWith('mouth-') || p === 'mouth-closed' ? 1 : 0}},${end.toFixed(3)});`;
    }
  }
  return out;
}

// Drive mouth shapes from a scene's forced-alignment words.
// Vowel-ish final sounds read wider; pauses close the mouth.
export function visemeTimeline(id, words, sceneStart) {
  if (!Array.isArray(words) || !words.length) return '';
  let out = '';
  for (const [i, w] of words.entries()) {
    const t = sceneStart + w.startSeconds;
    const wide = /[aeiou]$|o$|oo|ow|ay|i$/i.test(String(w.text).replace(/[^a-z]/gi, ''));
    out += mouthSets(id, wide ? 2 : 1, t);
    const next = words[i + 1];
    const gap = next ? next.startSeconds - w.endSeconds : 0.25;
    if (gap > 0.12 || !next) out += mouthSets(id, 0, Math.min(sceneStart + w.endSeconds + 0.02, sceneStart + w.startSeconds + 0.4));
  }
  return out;
}

// Idle life: eyelids blink on a loop, body breathes (subtle squash).
export function idleTimeline(id, duration) {
  return `
 for(let t=1.4;t<${duration.toFixed(1)};t+=2.9+((t*7)%1.7)){
  tl.to('#${id}-lids ellipse',{attr:{ry:30},duration:.09},t.toFixed(2));
  tl.to('#${id}-lids ellipse',{attr:{ry:0},duration:.12},(t+.12).toFixed(2));
 }
 tl.to('#${id}-squash',{scaleY:.975,scaleX:1.012,transformOrigin:'50% 95%',duration:1.6,ease:'sine.inOut',yoyo:true,repeat:Math.ceil(${duration.toFixed(0)}/3.2)},0);`;
}

// Performance gestures: excitement bounce at a reveal, point at a time.
export function gestureTimeline(id, { celebrate = [], point = [], lean = [] } = {}) {
  let out = '';
  for (const t of celebrate) out += `tl.to('#${id}-squash',{scaleY:.88,scaleX:1.06,transformOrigin:'50% 95%',duration:.16},${t});tl.to('#${id}-squash',{scaleY:1.06,scaleX:.95,y:-46,duration:.22,ease:'power2.out'},${t + .16});tl.to('#${id}-squash',{scaleY:1,scaleX:1,y:0,duration:.3,ease:'bounce.out'},${t + .38});${mouthSets(id, 3, t)}${mouthSets(id, 0, t + 1.1)}`;
  for (const t of point) out += `tl.to('#${id}-arm-r',{rotation:-38,y:-30,transformOrigin:'10% 90%',duration:.4,ease:'back.out(2)'},${t});tl.to('#${id}-arm-r',{rotation:0,y:0,duration:.5},${t + 1.6});`;
  for (const t of lean) out += `tl.to('#${id}-squash',{rotation:6,transformOrigin:'50% 95%',duration:.4},${t});tl.to('#${id}-squash',{rotation:0,duration:.5},${t + 1.4});`;
  return out;
}

// Walk-in entrance: slides the whole group from off-screen left into its slot
// with a subtle vertical bob. Reserves [at, at+durSec) on the timeline.
export function walkIn(id, at, durSec = 1.6) {
  const d = +durSec > 0 ? +durSec : 1.6;
  return `tl.fromTo('#${id}',{x:-800},{x:0,duration:${d.toFixed(2)},ease:'power3.out'},${at});` +
    `tl.fromTo('#${id}',{y:0},{y:-16,duration:.2,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(d / .4) * 2 - 1}},${at});` +
    `tl.set('#${id}',{x:0,y:0},${(at + d).toFixed(3)});`;
}

// Pointer-stick prop: pop in at the hand, raise (rotate about the grip), hold,
// then lower away. The right arm lifts with it.
export function stick(id, times = []) {
  let out = '';
  for (const t of times) out += `tl.set('#${id}-stick',{opacity:1,rotation:55,transformOrigin:'0% 100%'},${t});` +
    `tl.to('#${id}-arm-r',{rotation:-24,transformOrigin:'10% 90%',duration:.35,ease:'back.out(2)'},${t});` +
    `tl.to('#${id}-stick',{rotation:-18,transformOrigin:'0% 100%',duration:.4,ease:'back.out(2)'},${t + .02});` +
    `tl.to('#${id}-stick',{rotation:55,transformOrigin:'0% 100%',duration:.35},${t + 1.8});` +
    `tl.to('#${id}-arm-r',{rotation:0,transformOrigin:'10% 90%',duration:.45},${t + 1.8});` +
    `tl.set('#${id}-stick',{opacity:0},${t + 2.2});`;
  return out;
}

export async function loadAlignmentWords(alignmentFile) {
  try {
    const saved = JSON.parse(await readFile(alignmentFile, 'utf8'));
    return (saved.words || []).map(w => ({ text: w.text, startSeconds: w.startSeconds, endSeconds: w.endSeconds }));
  } catch {
    return null;
  }
}

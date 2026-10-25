import { baseTenCueWordOffsets } from './plan.mjs';
import { fairEscape as esc } from './utils.mjs';
import { fairDiscoveryAnimation } from './discovery.mjs';

const words = value => value.toLowerCase().replaceAll('’', "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
export function fairCueTimes(scene, track) {
  const script = words(scene.narration);
  const aligned = (track.words || []).flatMap(word => {
    const tokens = words(word.text);
    return tokens.map((text, index) => ({ text, at: word.startSeconds + index / tokens.length * (word.endSeconds - word.startSeconds) }));
  });
  const matches = aligned.length === script.length && aligned.every((word, index) => word.text === script[index] && Number.isFinite(word.at));
  const offsets = baseTenCueWordOffsets(scene.narration, scene.visual.cues);
  return offsets.map(cue => ({ ...cue, at: matches ? aligned[cue.wordIndex].at : cue.wordIndex / script.length * track.durationSeconds,
    timingSource: matches ? track.wordTimingSource || track.timingSource || 'estimated' : 'estimated' }));
}

import { fairBaseTenState } from './base-ten.mjs';
export { fairDigits, fairBaseTenState } from './base-ten.mjs';

const textPalette = ['#986313', '#167566', '#6553ad'];
const palette = ['#f2b544', '#1aa496', '#8270dd'];
function block(place, unit, id, x, y, opacity = 1) {
  const width = unit * (place === 2 ? 10 : 1), height = unit * (place > 0 ? 10 : 1);
  const lines = place === 0 ? '' : Array.from({ length: 9 }, (_, i) => `<path d="M0 ${(i + 1) * unit}H${width}${place === 2 ? ` M${(i + 1) * unit} 0V${height}` : ''}"/>`).join('');
  return `<g transform="translate(${x} ${y})"><g id="${id}" opacity="${opacity}"><path d="M0 0L4 -4H${width + 4}L${width} 0Z" fill="${palette[place]}" opacity=".65"/><path d="M${width} 0L${width + 4} -4V${height - 4}L${width} ${height}Z" fill="#17344e" opacity=".45"/><rect width="${width}" height="${height}" rx="1.5" fill="${palette[place]}" stroke="#17344e" stroke-opacity=".25"/><g fill="none" stroke="#17344e" stroke-opacity=".3" stroke-width=".7">${lines}</g></g></g>`;
}

function position(place, index, unit, hundreds) {
  if (place === 2) { const columns = hundreds > 4 ? 3 : 2; return [35 + index % columns * (unit * 10 + 12), 126 + Math.floor(index / columns) * (unit * 10 + 12)]; }
  if (place === 1) return [350 + index * (unit + 13), 146];
  return [694 + index % 3 * (unit + 20), 163 + Math.floor(index / 3) * (unit + 20)];
}
const show = (id, at, duration = .4) => `tl.fromTo('#${id}',{opacity:0},{opacity:1,duration:${duration},ease:'power2.out'},${at});`;

// All quantities and target positions are derived from the validated number;
// the model can select an operation, never supply arbitrary block counts.
export function fairBaseTenAnimation(scene, track, prefix) {
  const v = scene.visual, state = fairBaseTenState(v), cues = fairCueTimes(scene, track);
  if (v.number < 100 && v.mode !== 'digit-shift' && v.place !== 'hundreds') return fairDiscoveryAnimation(scene, track, prefix, { state, cues });
  const [start, transform, notation] = cues.map(c => .35 + c.at);
  const phaseGap = Math.max(.01, notation - transform);
  const moveDuration = Math.min(1.5, phaseGap * .55), staggerBudget = Math.min(.4, phaseGap * .2), fade = Math.min(.12, phaseGap * .1);
  const maxHundreds = Math.max(state.initial[2], state.final[2]);
  const unit = v.place === 'tens' && state.initial[1] > 30 ? 4 : v.place === 'tens' && state.initial[1] > 10 ? 6 : maxHundreds > 4 ? 7 : maxHundreds > 2 ? 11 : 13;
  let html = '', code = '', index = 0;
  const add = (p, x, y, opacity = 1) => { const id = `${prefix}-block-${index++}`; html += block(p, unit, id, x, y, opacity); return id; };
  const groups = v.mode === 'group' || v.mode === 'trade';
  if (groups) {
    for (let p = 0; p < 3; p++) if (p !== state.place) for (let i = 0; i < state.initial[p]; i++) { const [x,y] = position(p, i, unit, maxHundreds); add(p,x,y); }
    const count = state.initial[state.place], bundled = Math.floor(count / 10), existing = state.initial[state.place + 1];
    for (let i = 0; i < count; i++) {
      const p = state.place;
      const x = p === 0 ? 596 + i % 10 * 23 : 350 + (i % (count>30?20:10)) * (count>30?10:22);
      const y = p === 0 ? 125 + Math.floor(i / 10) * 24 : 126 + Math.floor(i / (count>30?20:10)) * (unit * 10 + 14);
      const id = add(p,x,y);
      const grouped = i < bundled * 10;
      const target = grouped ? position(p + 1, existing + Math.floor(i / 10), unit, maxHundreds) : position(p, i - bundled * 10, unit, maxHundreds);
      const dx = target[0] + (grouped && p === 1 ? i % 10 * unit : 0), dy = target[1] + (grouped && p === 0 ? i % 10 * unit : 0);
      const delay = grouped ? Math.floor(i / 10) / Math.max(1,bundled-1) * staggerBudget : 0;
      code += `tl.fromTo('#${id}',{x:0,y:0},{x:${dx-x},y:${dy-y},duration:${moveDuration},ease:'power2.inOut'},${transform + delay});`;
      if (grouped) code += `tl.to('#${id}',{opacity:0,duration:${fade}},${transform + delay + moveDuration});`;
    }
    for (let i = 0; i < bundled; i++) {
      const [x,y] = position(state.place + 1, existing + i, unit, maxHundreds);
      const id = add(state.place + 1,x,y,0);
      code += show(id, transform + i / Math.max(1,bundled-1) * staggerBudget + moveDuration,fade);
    }
  } else if (v.mode === 'digit-shift') {
    for (let p = 0; p < 2; p++) for (let i = 0; i < state.initial[p]; i++) {
      const [sx,sy] = position(p,i,unit,maxHundreds), [tx,ty] = position(p + 1,i,unit,maxHundreds);
      for (let copy = 0; copy < 10; copy++) {
        const id = add(p,sx,sy,copy ? 0 : 1);
        if (copy) code += show(id, transform + copy / 9 * staggerBudget,fade);
        code += `tl.fromTo('#${id}',{x:0,y:0},{x:${tx-sx+(p===1?copy*unit:0)},y:${ty-sy+(p===0?copy*unit:0)},duration:${moveDuration},ease:'power2.inOut'},${transform + copy/9*staggerBudget});tl.to('#${id}',{opacity:0,duration:${fade}},${transform + moveDuration + staggerBudget});`;
      }
      const id=add(p+1,tx,ty,0); code+=show(id,transform+moveDuration+staggerBudget,fade);
    }
  } else {
    for (let p=0;p<3;p++) for (let i=0;i<state.initial[p];i++) { const [x,y]=position(p,i,unit,maxHundreds); const id=add(p,x,y); if(v.mode==='expanded' && p===state.place) code+=`tl.fromTo('#${id}',{y:0},{y:${p===2?8:24},duration:${moveDuration},ease:'power2.inOut'},${transform});`; }
    if(v.mode==='expanded') {
      for(let p=0;p<3;p++){ html+=`<text id="${prefix}-part-${p}" x="${[738,446,154][p]}" y="382" text-anchor="middle" font-size="25" font-weight="800" fill="${textPalette[p]}" opacity="0">${state.final[p]} × ${10**p} = ${state.final[p]*10**p}</text>`; code+=show(`${prefix}-part-${p}`,notation,.4); }
    }
  }
  const terms = state.final.map((count,p)=>count*10**p).reverse();
  const equation = v.mode === 'digit-shift' ? `${v.number} × 10 = ${state.finalValue}` : `${terms.filter(Boolean).join(' + ')} = ${v.number}`;
  const explanation = groups ? `10 ${v.place} = 1 ${v.place==='ones'?'ten':'hundred'}` : v.mode==='zero'?`0 ${v.place} — keep the place` : v.mode==='digit-shift'?'Every group becomes ten times as large':'Each part keeps its value';
  const headings = [2,1,0].map(p=>`<text x="${[738,446,154][p]}" y="32" text-anchor="middle" fill="${textPalette[p]}" font-weight="800" font-size="22">${['ONES','TENS','HUNDREDS'][p]}</text><text id="${prefix}-digit-${p}" x="${[738,446,154][p]}" y="91" text-anchor="middle" font-size="52" font-weight="850" fill="#17344e">${state.final[p]}</text>`).join('');
  const empty = state.final.map((n,p)=>n===0?`<g id="${prefix}-empty-${p}"><rect x="${[683,391,99][p]}" y="143" width="110" height="130" rx="20" fill="none" stroke="#8297aa" stroke-width="2" stroke-dasharray="7 8"/><text x="${[738,446,154][p]}" y="307" text-anchor="middle" font-size="19" fill="#405974">No ${['ones','tens','hundreds'][p]}</text></g>`:'').join('');
  code += show(`${prefix}-objects`, start);
  code += show(`${prefix}-empty`, v.mode==='zero' ? transform : notation);
  code += show(`${prefix}-digits`, notation);
  code += show(`${prefix}-operation`,transform);
  code += show(`${prefix}-notation`,notation);
  if(v.mode==='zero') code+=`tl.fromTo('#${prefix}-empty-${state.place}',{opacity:.25},{opacity:1,duration:.6,yoyo:true,repeat:1,ease:'sine.inOut'},${transform});`;
  return { html:`<div class="concept-stage"><svg viewBox="0 0 900 390" role="img" aria-label="${esc(v.label)}"><g id="${prefix}-digits" opacity="0">${headings}</g><g id="${prefix}-empty" opacity="0">${empty}</g><g id="${prefix}-objects" opacity="0">${html}</g></svg><div class="operation" id="${prefix}-operation" style="opacity:0">${esc(explanation)}</div><div class="notation" id="${prefix}-notation" style="opacity:0">${esc(equation)}</div></div>`, code, cues, state };
}

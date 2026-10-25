// The partition engine: the first real transformation renderer.
//
// A fraction bar is one persistent object. Repartitioning does not reveal a new
// picture — it cuts the existing bar, and the shaded amount is structurally
// incapable of changing because it is a single rectangle that is never animated
// while the cuts happen. The invariant is shown, not asserted.
//
// Deterministic by construction: geometry comes from the validated fraction,
// motion times come from the measured phrases, and the same model always emits
// the same timeline.

const PAPER = '#fffaf0';
const INK = '#7e573e';
const SHADE = '#ea7a3c';
const SHADE_DARK = '#b7552d';
const TEAL = '#147d6c';

export const FAIR_PARTITION_BAR = { x: 205, y: 56, width: 760, height: 92, radius: 14 };
export const FAIR_PARTITION_VIEW = { width: 1000, height: 250 };
const BAR = FAIR_PARTITION_BAR;

export function fairFractionModel(fraction, equivalent) {
  const parse = value => {
    const match = String(value ?? '').match(/^(\d{1,2})\/(\d{1,2})$/);
    return match ? { n: Number(match[1]), d: Number(match[2]) } : null;
  };
  const source = parse(fraction), target = equivalent ? parse(equivalent) : null;
  if (!source) return null;
  if (target && target.n * source.d !== source.n * target.d) return null;
  const factor = target && target.d % source.d === 0 ? target.d / source.d : null;
  return { ...source, target, factor };
}

const boundary = (index, denominator) => BAR.x + index * BAR.width / denominator;

export function fairPartGeometry(model, denominator) {
  const width = BAR.width / denominator, shadedCount = Math.round(model.n / model.d * denominator);
  return Array.from({ length: denominator }, (_, index) => ({
    index, x: boundary(index, denominator), width, shaded: index < shadedCount,
    center: boundary(index, denominator) + width / 2,
  }));
}

export function fairPartitionSvg({ fraction, equivalent, id, label }) {
  const model = fairFractionModel(fraction, equivalent);
  if (!model) throw new Error(`Unsupported fraction bars: ${fraction} / ${equivalent}`);
  const targetDenominator = model.target?.d ?? model.d;
  const parts = fairPartGeometry(model, targetDenominator);
  const initialParts = fairPartGeometry(model, model.d);
  const shadeWidth = BAR.width * model.n / model.d;
  const number = (x, y, textId, value, opacity = 1) => `<text id="${textId}" x="${x}" y="${y}" text-anchor="middle" font-size="58" font-weight="800" fill="#17344e" opacity="${opacity}">${value}</text>`;

  const initialCuts = new Set(initialParts.slice(1).map(part => Math.round(part.x * 100) / 100));
  const cuts = Array.from({ length: targetDenominator - 1 }, (_, index) => {
    const x = boundary(index + 1, targetDenominator), existing = initialCuts.has(Math.round(x * 100) / 100);
    return `<line id="${id}-cut-${index + 1}" class="partition-cut" x1="${x.toFixed(2)}" y1="${BAR.y + 3}" x2="${x.toFixed(2)}" y2="${BAR.y + BAR.height - 3}" stroke="${INK}" stroke-opacity=".72" stroke-width="3.5" ${existing ? '' : 'opacity="0"'}/>`;
  }).join('');
  // A per-part highlight rectangle: used to count parts and shaded pieces without
  // touching the bar itself.
  const highlights = parts.map((part, index) => `<rect id="${id}-part-${index}" x="${(part.x + 2).toFixed(2)}" y="${BAR.y + 2}" width="${(part.width - 4).toFixed(2)}" height="${BAR.height - 4}" fill="${TEAL}" opacity="0"/>`).join('');
  const badges = parts.filter(part => part.shaded).map((part, index) => `<g id="${id}-badge-${index}" opacity="0"><circle cx="${part.center.toFixed(2)}" cy="${BAR.y + BAR.height + 30}" r="16" fill="${TEAL}"/><text x="${part.center.toFixed(2)}" y="${BAR.y + BAR.height + 37}" text-anchor="middle" font-size="19" font-weight="800" fill="#fff">${index + 1}</text></g>`).join('');

  const html = `<div class="partition-stage"><svg viewBox="0 0 ${FAIR_PARTITION_VIEW.width} ${FAIR_PARTITION_VIEW.height}" role="img" aria-label="${label}">
  <defs><clipPath id="${id}-clip"><rect x="${BAR.x}" y="${BAR.y}" width="${BAR.width}" height="${BAR.height}" rx="${BAR.radius}"/></clipPath></defs>
  <g id="${id}-camera">
    <g id="${id}-bar">
      <rect id="${id}-outline" x="${BAR.x}" y="${BAR.y}" width="${BAR.width}" height="${BAR.height}" rx="${BAR.radius}" fill="${PAPER}" stroke="${INK}" stroke-width="3" fill-opacity="0"/>
      <g clip-path="url(#${id}-clip)"><rect id="${id}-shade" x="${BAR.x}" y="${BAR.y}" width="${shadeWidth.toFixed(2)}" height="${BAR.height}" fill="${SHADE}"/></g>
      <g id="${id}-parts">${highlights}</g>
      <g id="${id}-cuts">${cuts}</g>
      <line id="${id}-knife" x1="0" y1="${BAR.y - 16}" x2="0" y2="${BAR.y + BAR.height + 16}" stroke="${TEAL}" stroke-width="4" stroke-linecap="round" opacity="0"/>
      <g id="${id}-invariant" opacity="0"><line x1="${(BAR.x + shadeWidth).toFixed(2)}" y1="${BAR.y - 12}" x2="${(BAR.x + shadeWidth).toFixed(2)}" y2="${BAR.y + BAR.height + 12}" stroke="${SHADE_DARK}" stroke-width="4" stroke-linecap="round"/><circle cx="${(BAR.x + shadeWidth).toFixed(2)}" cy="${BAR.y - 12}" r="7" fill="${SHADE_DARK}"/></g>
      ${badges}
    </g>
    ${number(96, 74, `${id}-num-a`, model.n)}
    ${number(96, 184, `${id}-den-a`, model.d)}
    ${model.target ? number(96, 74, `${id}-num-b`, model.target.n, 0) : ''}
    ${model.target ? number(96, 184, `${id}-den-b`, model.target.d, 0) : ''}
    <line x1="62" y1="126" x2="130" y2="126" stroke="#17344e" stroke-width="4" stroke-linecap="round"/>
    <g id="${id}-equation" opacity="0"><rect x="640" y="2" width="320" height="42" rx="12" fill="#17344e"/><text x="800" y="30" text-anchor="middle" font-size="26" font-weight="800" fill="#fff">${model.target ? `${model.n}/${model.d} = ${model.target.n}/${model.target.d}` : `${model.n}/${model.d}`}</text></g>
    <g id="${id}-scaling" opacity="0"><text x="158" y="72" text-anchor="middle" font-size="23" font-weight="800" fill="${TEAL}">×${model.factor ?? 1}</text><text x="158" y="182" text-anchor="middle" font-size="23" font-weight="800" fill="${TEAL}">×${model.factor ?? 1}</text></g>
  </g>
</svg></div>`;

  return { html, model, parts, initialParts, shadeWidth };
}

// The timeline, in phases named for the narration they belong to.
export function fairPartitionMotion({ id, model, parts, phraseAt }) {
  if (!model) throw new Error('Partition motion needs a parsed fraction model.');
  const code = [], cues = [];
  const push = line => { if (line) code.push(line); };

  const showAt = phraseAt(0.02);
  const cutAt = phraseAt(0.26);
  const countAt = phraseAt(0.46);
  const shadeCountAt = phraseAt(0.64);
  const invariantAt = phraseAt(0.8);
  const equalAt = phraseAt(0.92);

  // 1. Build the object before acting on it.
  push(`tl.fromTo('#${id}-outline',{attr:{'stroke-dasharray':1900,'stroke-dashoffset':1900}},{attr:{'stroke-dashoffset':0},duration:.7,ease:'power2.out'},${showAt.toFixed(3)});`);
  push(`tl.fromTo('#${id}-outline',{fillOpacity:0},{fillOpacity:1,duration:.45,ease:'power2.out'},${(showAt + .42).toFixed(3)});`);
  push(`tl.fromTo('#${id}-shade',{scaleX:0,transformOrigin:'left center'},{scaleX:1,duration:.65,ease:'power2.out'},${(showAt + .3).toFixed(3)});`);
  push(`tl.fromTo('#${id}-num-a',{opacity:0,y:-10},{opacity:1,y:0,duration:.32,ease:'power3.out'},${(showAt + .1).toFixed(3)});`);
  push(`tl.fromTo('#${id}-den-a',{opacity:0,y:10},{opacity:1,y:0,duration:.32,ease:'power3.out'},${(showAt + .2).toFixed(3)});`);

  // 2. Repartition: a knife cuts at each new boundary, the bar takes the cut with
  //    a small squash, and the cut line settles. The shaded rectangle is never
  //    animated here, so the amount cannot change.
  const newCuts = Array.from({ length: (model.target?.d ?? model.d) - 1 }, (_, index) => index + 1)
    .filter(index => {
      const x = boundary(index, model.target?.d ?? model.d);
      return !Array.from({ length: model.d - 1 }, (_, position) => boundary(position + 1, model.d))
        .some(original => Math.abs(original - x) < 0.5);
    });
  const knifeTop = BAR.y - 12, knifeBottom = BAR.y + BAR.height + 12;
  newCuts.forEach((index, order) => {
    const x = boundary(index, model.target?.d ?? model.d);
    const at = cutAt + order * Math.min(0.8, 1.5 / Math.max(1, newCuts.length));
    // Park the blade invisibly at the next boundary, then reveal it as it starts
    // to cut: a visible zero-length line between cuts reads as a stray dot.
    push(`tl.set('#${id}-knife',{attr:{x1:${x.toFixed(2)},x2:${x.toFixed(2)},y1:${knifeTop},y2:${knifeTop}},opacity:0},${at.toFixed(3)});`);
    push(`tl.set('#${id}-knife',{opacity:1},${(at + .02).toFixed(3)});`);
    push(`tl.to('#${id}-knife',{attr:{y2:${knifeBottom}},duration:.26,ease:'power2.in'},${(at + .02).toFixed(3)});`);
    push(`tl.to('#${id}-bar',{scaleY:.962,transformOrigin:'center center',duration:.1,yoyo:true,repeat:1,ease:'power2.out'},${(at + .2).toFixed(3)});`);
    push(`tl.to('#${id}-shade',{opacity:.84,duration:.1,yoyo:true,repeat:1,ease:'sine.inOut'},${(at + .22).toFixed(3)});`);
    push(`tl.fromTo('#${id}-cut-${index}',{scaleY:0,transformOrigin:'center center',opacity:0},{scaleY:1,opacity:1,duration:.24,ease:'power2.out'},${(at + .3).toFixed(3)});`);
    push(`tl.to('#${id}-knife',{opacity:0,duration:.12},${(at + .46).toFixed(3)});`);
    cues.push({ name: 'tick', at: at + 0.26, gain: 0.85 });
  });

  if (model.target) {
    // 3. Count the parts: the denominator becomes how many pieces exist, and each
    //    piece is counted in order.
    push(`tl.to('#${id}-den-a',{opacity:0,scale:.65,duration:.18,ease:'power2.in'},${countAt.toFixed(3)});`);
    push(`tl.fromTo('#${id}-den-b',{opacity:0,scale:1.4},{opacity:1,scale:1,duration:.3,ease:'back.out(2.2)'},${(countAt + .16).toFixed(3)});`);
    parts.forEach((part, index) => {
      const at = countAt + .34 + index * Math.min(.3, 1.1 / parts.length);
      push(`tl.to('#${id}-part-${index}',{opacity:.16,duration:.14,ease:'power2.in'},${at.toFixed(3)});`);
      push(`tl.to('#${id}-part-${index}',{opacity:0,duration:.34,ease:'power2.out'},${(at + .16).toFixed(3)});`);
      cues.push({ name: 'click', at, gain: 0.45 });
    });
    // 4. Count the shaded pieces: the numerator becomes how many are shaded, and
    //    each shaded piece is stamped with its count.
    push(`tl.to('#${id}-num-a',{opacity:0,scale:.65,duration:.18,ease:'power2.in'},${shadeCountAt.toFixed(3)});`);
    push(`tl.fromTo('#${id}-num-b',{opacity:0,scale:1.4},{opacity:1,scale:1,duration:.3,ease:'back.out(2.2)'},${(shadeCountAt + .16).toFixed(3)});`);
    parts.filter(part => part.shaded).forEach((part, index) => {
      const at = shadeCountAt + .34 + index * .24;
      push(`tl.fromTo('#${id}-badge-${index}',{opacity:0,y:12,scale:.6},{opacity:1,y:0,scale:1,duration:.34,ease:'back.out(1.8)'},${at.toFixed(3)});`);
      push(`tl.to('#${id}-part-${part.index}',{opacity:.22,duration:.12,yoyo:true,repeat:1,ease:'sine.inOut'},${at.toFixed(3)});`);
      cues.push({ name: 'pop', at, gain: 0.55 });
    });
  }

  // 5. Point at the edge that did not move.
  push(`tl.fromTo('#${id}-invariant',{opacity:0,scaleY:.35,transformOrigin:'center center'},{opacity:1,scaleY:1,duration:.34,ease:'power3.out'},${invariantAt.toFixed(3)});`);
  push(`tl.to('#${id}-invariant',{opacity:.5,duration:.3,yoyo:true,repeat:1,ease:'sine.inOut'},${(invariantAt + .42).toFixed(3)});`);

  // 6. Camera: push in for the operation, settle back for the conclusion.
  push(`tl.fromTo('#${id}-camera',{scale:1,y:0},{scale:1.04,y:-8,duration:${Math.max(.6, countAt - cutAt).toFixed(2)},ease:'none'},${cutAt.toFixed(3)});`);
  push(`tl.to('#${id}-camera',{scale:1,y:0,duration:1.3,ease:'power2.inOut'},${(shadeCountAt + .45).toFixed(3)});`);

  // 7. The conclusion: scaling annotation, then the written equation.
  if (model.target) {
    push(`tl.fromTo('#${id}-scaling',{opacity:0,scale:.8},{opacity:1,scale:1,duration:.3,ease:'back.out(1.6)'},${(equalAt - .45).toFixed(3)});`);
    push(`tl.to('#${id}-scaling',{opacity:.45,duration:.26,yoyo:true,repeat:1,ease:'sine.inOut'},${(equalAt + .1).toFixed(3)});`);
    push(`tl.fromTo('#${id}-equation',{opacity:0,y:12},{opacity:1,y:0,duration:.4,ease:'power3.out'},${equalAt.toFixed(3)});`);
    cues.push({ name: 'chime', at: equalAt, gain: 0.9 });
  }
  return { code: code.filter(Boolean).join('\n'), cues, phases: { showAt, cutAt, countAt, shadeCountAt, invariantAt, equalAt } };
}

// Phase A title sequence: a branded sting, a "today we'll be able to…" lesson
// card, and a closing card. These are composition-level clips, not lesson
// scenes: they carry no narration, so they cannot disturb the measured speech
// timing that the rest of the pipeline depends on.
import { fairEscape as esc } from './fair-utils.mjs';
import { FAIR_DEFAULT_BPM } from './fair-audio.mjs';

// Card lengths are whole beats at the shared default tempo, so the first scene
// cut lands on a musical downbeat.
const BEAT = 60 / FAIR_DEFAULT_BPM;
export const FAIR_INTRO_BEATS = 6;

export function fairIntroSeconds(style = 'card') {
  return style === 'sting' ? BEAT * FAIR_INTRO_BEATS : BEAT * 4;
}

export function fairOutroSeconds() { return BEAT * 8; }

function objectiveText(lesson) {
  const objective = lesson.successStatement ?? lesson.objectives?.[0]?.text ?? lesson.concept?.arc ?? '';
  return String(objective).replace(/\s+/g, ' ').trim();
}

export function fairIntroClip({ lesson, brief, start = 0, duration, guideHtml = '', id = 'fair-intro' }) {
  const audience = lesson.audience ?? brief.audience ?? 'Primary learners';
  const objective = objectiveText(lesson);
  const unit = brief.topic?.title ?? '';
  const html = `<section id="${id}" class="clip scene intro-card" data-start="${start}" data-duration="${duration}" data-track-index="1">
  <div class="intro-wash"></div>
  <div class="intro-top"><span class="intro-brand">FAIR <i>·</i> MATHS</span><span class="intro-unit">${esc(audience)}</span></div>
  <div class="intro-body">
    <div class="intro-copy">
      <p class="intro-eyebrow" id="${id}-eyebrow">TODAY WE'LL BE ABLE TO</p>
      <h1 id="${id}-title">${esc(lesson.title)}</h1>
      <div class="intro-rule"><span id="${id}-rule"></span></div>
      <p class="intro-objective" id="${id}-objective">${esc(objective)}</p>
      <p class="intro-meta" id="${id}-meta">${esc(audience)} · guided lesson</p>
    </div>
    ${guideHtml ? `<aside class="intro-guide" id="${id}-guide">${guideHtml}</aside>` : ''}
  </div>
  <div class="intro-foot"><span>${esc(unit || 'Guided lesson')}</span><span>FAIR · VIDEO STUDIO</span></div>
</section>`;
  const exitAt = Math.max(0.4, duration - 0.4);
  const code = [
    `tl.fromTo('#${id} .intro-wash',{opacity:0,scale:.96},{opacity:1,scale:1,duration:.5,ease:'power2.out'},0);`,
    `tl.fromTo('#${id}-eyebrow',{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:'power3.out'},.12);`,
    `tl.fromTo('#${id}-title',{opacity:0,y:14},{opacity:1,y:0,duration:.45,ease:'power3.out'},.24);`,
    `tl.fromTo('#${id}-rule',{scaleX:0,transformOrigin:'left center'},{scaleX:1,duration:.45,ease:'power2.inOut'},.5);`,
    `tl.fromTo('#${id}-objective',{opacity:0,y:10},{opacity:1,y:0,duration:.4,ease:'power3.out'},.62);`,
    `tl.fromTo('#${id}-meta',{opacity:0},{opacity:.72,duration:.35},.9);`,
    guideHtml ? `tl.fromTo('#${id}-guide',{opacity:0,x:26},{opacity:1,x:0,duration:.5,ease:'power3.out'},.36);` : '',
    `tl.to('#${id}',{opacity:0,duration:.32,ease:'power2.in'},${exitAt.toFixed(3)});`,
  ].filter(Boolean).join('\n');
  return { html, code, id, start, duration, kind: 'intro' };
}

// Closing card: the rule, a hand-off to the next lesson, and the same guide
// waving. Recap scene content is reused so the close restates what was taught.
export function fairOutroClip({ lesson, brief, start, duration, guideHtml = '', id = 'fair-outro' }) {
  const recap = [...(lesson.scenes ?? [])].reverse().find(scene => scene.beat === 'recap');
  const rules = (recap?.visual?.kind === 'recap' ? recap.visual.items : [])
    .map(item => String(item).trim()).filter(Boolean).slice(0, 3);
  const fallback = String(recap?.title ?? lesson.concept?.arc ?? 'Say the rule from memory.').trim();
  const lines = rules.length ? rules : [fallback];
  const next = brief.topic?.title ? `Next in this unit: ${brief.topic.title}` : 'Return tomorrow and try it from memory.';
  const html = `<section id="${id}" class="clip scene outro-card" data-start="${start}" data-duration="${duration}" data-track-index="1">
  <div class="outro-wash"></div>
  <div class="outro-top"><span class="intro-brand">FAIR <i>·</i> MATHS</span><span class="intro-unit">REMEMBER THIS</span></div>
  <div class="outro-body">
    <div class="outro-copy">
      <p class="intro-eyebrow" id="${id}-eyebrow">THE RULE</p>
      <ol class="outro-rules" id="${id}-rules">${lines.map((line, index) => `<li class="outro-rule"><span class="outro-number">${index + 1}</span><span>${esc(line)}</span></li>`).join('')}</ol>
      <p class="outro-next" id="${id}-next">${esc(next)}</p>
    </div>
    ${guideHtml ? `<aside class="intro-guide outro-guide" id="${id}-guide">${guideHtml}</aside>` : ''}
  </div>
</section>`;
  const code = [
    `tl.fromTo('#${id} .outro-wash',{opacity:0},{opacity:1,duration:.4,ease:'power2.out'},${start});`,
    `tl.fromTo('#${id}-eyebrow',{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:'power3.out'},${start + .15});`,
    `gsap.utils.toArray('#${id} .outro-rule').forEach((el,i)=>tl.fromTo(el,{opacity:0,x:-12},{opacity:1,x:0,duration:.35,ease:'power3.out'},${start + .35}+i*.28));`,
    `tl.fromTo('#${id}-next',{opacity:0},{opacity:.85,duration:.4},${start + .35 + lines.length * .28 + .15});`,
    guideHtml ? `tl.fromTo('#${id}-guide',{opacity:0,y:16},{opacity:1,y:0,duration:.45,ease:'power3.out'},${start + .3});` : '',
    guideHtml ? `tl.fromTo('#${id}-guide',{rotation:-5},{rotation:4,duration:.45,yoyo:true,repeat:1,ease:'sine.inOut',svgOrigin:'120 220'},${start + .9});` : '',
  ].filter(Boolean).join('\n');
  return { html, code, id, start, duration, kind: 'outro' };
}


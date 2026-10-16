import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairQuestionCard } from './fair-question-card.mjs';
import { fairBaseTenAnimation } from './fair-animation.mjs';
import { fairEscape as esc, fairTimestamp, fairWriteJson } from './fair-utils.mjs';

const require = createRequire(import.meta.url);
const art = fileURLToPath(new URL('../assets/fair-pip-sprites.png', import.meta.url));

export function fairAlignedCaptions(scene, track, start, fallback) {
  if (!track.words?.length || track.words.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim() !== scene.narration.replace(/\s+/g, ' ').trim()) return fallback(scene.narration, start, track.durationSeconds);
  const chunks = []; let current = [];
  for (const word of track.words) {
    current.push(word);
    if (current.map(w => w.text).join(' ').length >= 54 || /[.!?]$/.test(word.text)) {
      chunks.push({ start: start + current[0].startSeconds, end: start + word.endSeconds, text: current.map(w => w.text).join(' ') }); current = [];
    }
  }
  if (current.length) chunks.push({ start: start + current[0].startSeconds, end: start + current.at(-1).endSeconds, text: current.map(w => w.text).join(' ') });
  return chunks;
}

const style = `*{box-sizing:border-box}#root{position:absolute;inset:0;color:#17344e;font-family:Nunito,system-ui,sans-serif;overflow:hidden}.film-frame{width:1280px;height:720px;position:absolute;transform:scale(1.5);transform-origin:0 0;background:#eaf5fa;overflow:hidden}.sun{position:absolute;width:520px;height:520px;border-radius:50%;background:#fff8db;top:-280px;right:-140px}.floor{position:absolute;top:565px;left:0;width:1280px;height:155px;background:#f4e5cf;border-top:8px solid #ddc8aa}.shelf{position:absolute;top:265px;right:42px;width:242px;height:12px;background:#ddc8aa;border-radius:6px}.shelf:before{content:'';position:absolute;bottom:12px;left:35px;width:53px;height:63px;background:#a3d8d0;border:5px solid #2c6e65;border-radius:11px}.shelf:after{content:'× +';position:absolute;bottom:12px;right:20px;font-size:38px;font-weight:800;color:#7664ad}.scene-kicker{position:absolute;left:62px;top:31px;font-size:16px;font-weight:800;letter-spacing:2px;color:#376d79}.scene-count{position:absolute;right:54px;top:32px;font-size:16px;font-weight:700;color:#506b7d}h1{position:absolute;left:62px;top:69px;width:1080px;font-size:36px;line-height:1.15;letter-spacing:-1px;margin:0}.workbench{position:absolute;left:40px;top:143px;width:932px;height:426px;background:#fffdf5;border:3px solid #d3e6e8;border-radius:32px;box-shadow:0 12px 0 #b8d3d8}.concept-stage{position:absolute;left:61px;top:161px;width:891px;height:397px}.concept-stage svg{width:891px;height:350px;display:block;overflow:visible}.operation{position:absolute;left:18px;top:349px;font-size:20px;font-weight:700;color:#355c6a;max-width:450px}.notation{position:absolute;right:20px;top:345px;font-size:30px;font-weight:850;color:#17344e}.guide{position:absolute;left:943px;top:286px;width:320px;height:320px;transform-origin:50% 85%}.pose{position:absolute;inset:0;background-image:url('fair-pip-sprites.png');background-size:400% 200%;background-repeat:no-repeat;opacity:0}.guide-label{position:absolute;right:52px;top:598px;font-size:18px;font-weight:800;color:#385468}.guide-label span{font-size:12px;font-weight:500;display:block;margin-top:3px}.fallback{position:absolute;left:84px;top:191px;width:827px;font-size:30px;line-height:1.4}.question-prompt{font-size:34px!important;background:transparent!important;padding:0!important;max-width:775px}.equation{margin:18px 0}.line-number,.step-number{display:none}.visual-label{font-size:22px;color:#496b76}.teaching-step p{margin:12px 0}.compare-side{display:inline-block;width:47%;padding:12px}.compare-side strong{display:block}.number-line{width:100%}.place-grid{display:flex;gap:18px}.place-column{flex:1;text-align:center}.place-name,.place-factor{display:block;font-size:19px}.digit{font-size:66px}.selected{color:#147d6c}.takeaway{text-align:center;margin-top:20px}.pause-prompt{position:absolute;left:95px;top:470px;font-size:23px;color:#276c63;font-weight:800;opacity:0}.pause-bar{height:7px;width:260px;background:#1aa496;margin-top:17px;transform-origin:left center}.lesson-mark{position:absolute;left:64px;top:601px;font-size:14px;color:#425b68;font-weight:650}.closeup{background:#fbf5e8}.closeup .workbench{background:transparent;border:0;box-shadow:none}.closeup .floor{background:#e5f0e7;border-top:0;top:620px;height:100px}.closeup .shelf{display:none}.closeup .sun{background:#e3f2e9}.closeup .guide,.question-shot .guide{left:1050px;top:418px;width:205px;height:205px}.closeup .guide-label,.question-shot .guide-label{right:50px;top:620px;font-size:16px}.closeup .guide-label span,.question-shot .guide-label span{display:none}.closeup .lesson-mark{top:633px;left:760px;font-size:10px;max-width:290px;text-align:right}.discovery-stage{position:absolute;left:48px;top:144px;width:1050px;height:475px}.discovery-stage svg{width:1050px;height:465px;display:block;overflow:visible}.discovery-meaning{position:absolute;left:62px;top:466px;font-size:17px;font-weight:750;color:#355c6a}.question-shot .fallback{top:185px;left:85px;width:860px}.question-shot .question-prompt{font-size:27px!important;line-height:1.4}.question-shot .pause-prompt{top:497px}.question-shot .workbench{height:450px;width:980px}.question-shot .lesson-mark{top:620px}.question-shot .guide-label{top:630px}.no-guide .workbench{left:80px;width:1120px}.no-guide.question-shot .workbench{width:1120px}.no-guide .concept-stage{left:101px;width:1079px}.no-guide .concept-stage svg{width:1079px}.no-guide .fallback{left:150px;width:980px}.no-guide.question-shot .fallback{left:160px;width:960px}.no-guide .guide,.no-guide .guide-label{display:none}.no-guide .shelf{opacity:.3}.no-guide .lesson-mark{top:628px}`;

export async function fairFilmCompose(lesson, tracks, brief, directory, { visualHtml, fairAvatarSvg, fairCaptionChunks }) {
  const noGuide = brief.avatar === 'none';
  const kicker = esc((brief.topic?.title || 'Maths workshop').slice(0, 42).toUpperCase());
  await mkdir(join(directory, 'scenes'), { recursive: true });
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(directory, 'gsap.min.js'));
  await copyFile(art, join(directory, 'fair-pip-sprites.png'));
  let at = 0;
  const scenes = lesson.scenes.map((scene, index) => {
    const track = tracks.find(t => t.sceneId === scene.id);
    if (!track) throw new Error(`Scene ${scene.id} is missing narration.`);
    const duration = Math.max(4, track.durationSeconds + scene.pauseSeconds + .7), speechStart = at + .35;
    const timed = { ...scene, index, start: at, duration, speechStart, track, captions: fairAlignedCaptions(scene, track, speechStart, fairCaptionChunks) };
    at += duration; return timed;
  });
  for (const scene of scenes) {
    const id = `fair-film-${scene.id}`;
    const animation = scene.visual.kind === 'base-ten' && scene.beat !== 'question' ? fairBaseTenAnimation({ ...scene, continueObjects: ['expanded','zero'].includes(scene.visual.mode) && scenes[scene.index-1]?.visual?.kind === 'base-ten' && scenes[scene.index-1].visual.number === scene.visual.number && scenes[scene.index-1].visual.mode !== 'digit-shift' }, scene.track, id) : null;
    scene.visualCues = animation?.cues || [];
    scene.visualProof = animation?.proof || [];
    const poses = Array.from({ length:8 }, (_, n) => `<div id="${id}-pose-${n}" class="pose" style="background-position:${(n%4)/3*100}% ${n>3?100:0}%"></div>`).join('');
    const initialPose = scene.beat === 'question' ? 4 : scene.beat === 'answer' ? 7 : 0;
    let code = `const tl=gsap.timeline({paused:true});tl.fromTo('#${id}-heading',{opacity:0,y:8},{opacity:1,y:0,duration:.35},0);`;
    code += animation?.code || `tl.fromTo('#${id}-fallback',{opacity:0,y:8},{opacity:1,y:0,duration:.45},.35);`;
    if (brief.avatar === 'mira') {
      const changes = animation ? [{at:.35+animation.cues[1].at,pose:2},{at:.35+animation.cues[2].at,pose:5}] : [];
      const frames = [{at:0,value:0},...changes.map(c=>({at:c.at,value:0})),...(scene.track.envelope||[]).map(e=>({at:.35+e.at,value:e.value})),{at:.35+scene.track.durationSeconds,value:0}].sort((a,b)=>a.at-b.at);
      let previous = -1;
      for (const frame of frames) {
        const base = [...changes].reverse().find(c=>frame.at>=c.at)?.pose ?? initialPose;
        const pose = [0,2].includes(base) && frame.value>.26 ? base+1 : base;
        if(pose===previous) continue;
        if(previous>=0) code+=`tl.set('#${id}-pose-${previous}',{opacity:0},${frame.at});`;
        code+=`tl.set('#${id}-pose-${pose}',{opacity:1},${frame.at});`; previous=pose;
      }
      for(const change of changes) code+=`tl.fromTo('#${id}-guide',{y:0},{y:-6,duration:.35,repeat:1,yoyo:true,ease:'sine.inOut'},${change.at});`;
    }
    if (scene.beat === 'question') code += `tl.set('#${id}-pause',{opacity:1},${.35+scene.track.durationSeconds});tl.fromTo('#${id}-bar',{scaleX:1},{scaleX:0,duration:${scene.pauseSeconds},ease:'none'},${.35+scene.track.durationSeconds});`;
    code += `window.__timelines=window.__timelines||{};window.__timelines['${id}']=tl;`;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><template><style>${style}</style><div id="root" data-composition-id="${id}" data-width="1920" data-height="1080"><div class="film-frame${animation?.closeup?' closeup':''}${scene.beat==='question'?' question-shot':''}${noGuide?' no-guide':''}"><div class="sun" data-layout-allow-overflow></div><div class="floor"></div><div class="shelf"></div><div class="scene-kicker">${kicker} · ${esc(({hook:'LET’S FIND OUT',concept:'LOOK CLOSELY',example:'BUILD IT',misconception:'WHAT DOES IT MEAN?',question:'YOUR TURN',answer:'LET’S CHECK',recap:'REMEMBER THIS'})[scene.beat])}</div><div class="scene-count">${scene.index+1} / ${scenes.length}</div><h1 id="${id}-heading">${esc(scene.title)}</h1><div class="workbench"></div>${animation?.html || `<div id="${id}-fallback" class="fallback">${scene.beat==='question' ? fairQuestionCard(scene) || visualHtml(scene.visual,scene.beat,scene.narration) : visualHtml(scene.visual,scene.beat,scene.narration)}</div>`}${noGuide?'':`<div id="${id}-guide" class="guide">${brief.avatar==='mira'?poses:fairAvatarSvg(brief.avatar,id)}</div><div class="guide-label">${brief.avatar==='mira'?'Pip':'Your guide'}<span>Illustrated teacher · AI voice</span></div>`}<div class="lesson-mark">${esc(lesson.title)}</div>${scene.beat==='question'?`<div class="pause-prompt" id="${id}-pause">Take a moment. You can work it out.<div class="pause-bar" id="${id}-bar"></div></div>`:''}</div></div><script>${code}</script></template></body></html>`;
    await writeFile(join(directory,'scenes',`${scene.id}.html`),html);
  }
  const captions = scenes.flatMap(s=>s.captions);
  const hosts = scenes.map(s=>`<div id="slot-${s.id}" class="clip" data-composition-id="fair-film-${s.id}" data-composition-src="scenes/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1" data-width="1920" data-height="1080"></div>`).join('');
  const audio = scenes.map(s=>`<audio id="audio-${s.id}" src="${s.track.file}" data-start="${s.speechStart}" data-duration="${s.track.durationSeconds}" data-track-index="2" data-volume="1"></audio>`).join('');
  const subtitle = captions.map((c,i)=>`<div class="clip caption" id="caption-${i}" data-layout-allow-caption-zone data-start="${c.start}" data-duration="${c.end-c.start}" data-track-index="3"><span>${esc(c.text)}</span></div>`).join('');
  await writeFile(join(directory,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(lesson.title)}</title><script src="gsap.min.js"></script><style>body{margin:0;background:#eaf5fa}#root{position:relative;width:100%;height:100%;overflow:hidden}.clip{position:absolute}.caption{left:70px;right:70px;bottom:22px;text-align:center;z-index:20;display:flex;justify-content:center;align-items:center;font-family:system-ui,sans-serif}.caption span{font-size:34px;line-height:1.25;color:#fff;background:#17344e;padding:13px 28px;border-radius:16px;max-width:1740px}</style></head><body><div id="root" data-composition-id="fair-lesson" data-width="1920" data-height="1080" data-duration="${at}" data-start="0">${hosts}${audio}${subtitle}</div><script>window.__timelines=window.__timelines||{};window.__timelines['fair-lesson']=gsap.timeline({paused:true});</script></body></html>`);
  await writeFile(join(directory,'captions.vtt'),`WEBVTT\n\n${captions.map((c,i)=>`${i+1}\n${fairTimestamp(c.start)} --> ${fairTimestamp(c.end)}\n${c.text.replaceAll('-->','→')}\n`).join('\n')}`);
  await writeFile(join(directory,'transcript.txt'),`${lesson.title}\n${lesson.audience}\n\n${scenes.map(s=>`[${fairTimestamp(s.start)}] ${s.title}\n${s.narration}${s.pauseSeconds?`\n[Think for ${s.pauseSeconds} seconds]`:''}`).join('\n\n')}\n`);
  await fairWriteJson(join(directory,'storyboard.json'),{durationSeconds:at,timing:'Measured scene and phrase audio; word positions within local phrases are estimated. Visuals use spoken phrase cues.',scenes:scenes.map(({track,...scene})=>({...scene,audioFile:track.file,audioSha256:track.sha256}))});
  await fairWriteJson(join(directory,'hyperframes.json'),{name:'fair-lesson',description:lesson.title});
  return {durationSeconds:at,captions,scenes,animation:{name:'Pip’s number workshop',type:'base-ten-transformations',cueTiming:'spoken-phrase',character:'original illustrated sprite poses'}};
}

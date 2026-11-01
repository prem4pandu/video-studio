import { mkdir, readFile, writeFile, copyFile, stat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fairNarrate, fairProbe, fairVoiceConfig } from '../src/voice.mjs';
import { fairCommand, fairReadJson, fairWriteJson, fairHash, fairFileHash } from '../src/utils.mjs';
import { fairPiperPaths, fairNeuralPaths } from '../src/neural-voice.mjs';
import { fairQwenPaths, fairQwenProfile } from '../src/qwen-voice.mjs';
import { Brief, validatePlan } from './contracts.mjs';
import { planProduction, plannerSettings, plannerReadiness } from './planner.mjs';
import { workerReadiness, renderWithOpenMontage } from './worker/index.mjs';
import { composeVideo } from './render/compose.mjs';
import { renderWithManim, manimReadiness } from './render/manim.mjs';
const require=createRequire(import.meta.url);
export const DEFAULT_V2_VOICE='qwentts';
export async function narrationReadiness(env=process.env,{run=fairCommand}={}){
 const provider=env.STUDIO_V2_VOICE||DEFAULT_V2_VOICE;
 try{
  if(!['piper','kokoro','qwentts'].includes(provider))throw new Error('STUDIO_V2_VOICE must be piper, kokoro or qwentts.');
  const voice=fairVoiceConfig(env,{voiceProvider:provider});
  if(voice.url)throw new Error('V2 uses local voice files. Unset FAIR_KOKORO_URL to use the local Kokoro runtime.');
  const paths=provider==='piper'?fairPiperPaths(env):provider==='kokoro'?fairNeuralPaths(env):fairQwenPaths(env);
  const needed=provider==='qwentts'?[paths.python,join(paths.modelDir,'config.json')]:Object.values(paths);
  await Promise.all(needed.map(async p=>{if(!(await stat(p)).isFile())throw new Error(`Expected voice file: ${p}`);}));
  if(provider==='qwentts'){
   const profile=await fairQwenProfile(env);
   const weights=(await readdir(paths.modelDir)).filter(name=>name.endsWith('.safetensors'));
   if(!weights.length)throw new Error('Qwen model weights are missing.');
   for(const file of [...weights.map(name=>join(paths.modelDir,name)),join(paths.modelDir,'speech_tokenizer','model.safetensors'),join(paths.modelDir,'tokenizer_config.json')]){
    const info=await stat(file);if(!info.isFile()||!info.size)throw new Error(`Qwen model asset is missing or empty: ${file}`);
   }
   await run(paths.python,['-c','import mlx.core as mx; from mlx_audio.tts.utils import load_model; import soundfile; mx.eval(mx.zeros((1,)))'],{env,timeoutMs:20000});
   return {available:true,detail:`Local Qwen3 VoiceDesign (${profile.id}); ${voice.synthesisUnit} synthesis. Runtime and model files checked.`,provider,profile:profile.id,synthesisUnit:voice.synthesisUnit};
  }
  return {available:true,detail:`Local ${provider} narration.`,provider};
 }catch(e){return {available:false,detail:`Narration needs setup: ${e.message}`,provider};}
}
export async function v2Config(env=process.env){
 const [planning,narration,render]=await Promise.all([plannerReadiness(env),narrationReadiness(env),workerReadiness({env})]);
 return {ready:planning.available&&narration.available&&render.available,capabilities:{planning,narration,render},defaults:{mode:'auto',format:'landscape',durationSeconds:60,style:'auto'},modes:[{id:'auto',name:'Choose for me',description:'Choose the structure from your prompt.'},{id:'learning',name:'Learning',description:'Explain, demonstrate, practise and recap.'},{id:'social',name:'Social explainer',description:'An original hook, clear progression and payoff.'},{id:'story',name:'Illustrated story',description:'Original drawn motifs and a narrated story.'}],formats:[{id:'landscape',name:'Landscape · 16:9'},{id:'portrait',name:'Portrait · 9:16'}],limitations:['Generated drafts need human review before publication.','The first release uses original animated diagrams and illustrations; it does not generate arbitrary cinematic footage.','Sources and commercial rights must be reviewed. No earnings or platform eligibility guarantee.']};
}
export async function runProduction(input,directory,{env=process.env,signal,onProgress=async()=>{}}={}){
 const brief=Brief.parse(input),out=join(directory,'project'),workspace=join(directory,'workspace'),generation=join(directory,'generation');
 await mkdir(out,{recursive:true});await mkdir(generation,{recursive:true});
 const abort=()=>{if(signal?.aborted)throw signal.reason||new Error('Cancelled.');};abort();
 await onProgress({stage:'preflight',progress:2,message:'Checking local planning, voice and OpenMontage.'});
 const config=await v2Config(env);if(!config.ready)throw new Error(Object.values(config.capabilities).filter(c=>!c.available).map(c=>c.detail).join(' '));
 const fingerprint=fairHash({version:2,brief,planner:plannerSettings(env)});
 let result;
 try{const cache=await fairReadJson(join(generation,'checkpoint.json'));if(cache.fingerprint===fingerprint&&cache.sha256===await fairFileHash(join(out,'plan.json'))){const plan=validatePlan(await fairReadJson(join(out,'plan.json')),brief);if(cache.review?.passed)result={plan,review:cache.review};}}catch{}
 if(!result){result=await planProduction(brief,generation,{env,signal,onProgress});await fairWriteJson(join(out,'plan.json'),result.plan);await fairWriteJson(join(generation,'checkpoint.json'),{fingerprint,sha256:await fairFileHash(join(out,'plan.json')),review:result.review});}
 else await onProgress({stage:'plan',progress:24,message:'Reusing the verified script and scene plan.'});
 const {plan}=result;abort();
 const tracks=await fairNarrate(plan,out,{env,signal,brief:{voiceProvider:env.STUDIO_V2_VOICE||DEFAULT_V2_VOICE},onProgress});
 const rendererPref=env.STUDIO_V2_RENDERER||'auto';
 const manim=rendererPref==='manim'?await manimReadiness(env):rendererPref==='openmontage'?{available:false}:await manimReadiness(env);
 const useManim=manim.available&&rendererPref!=='openmontage'&&!plan.scenes.some(s=>s.kind==='world');
 if(rendererPref==='manim'&&!manim.available)throw new Error(`Manim renderer requested but unavailable: ${manim.detail}`);
 let composition,worker;
 if(useManim){
  await onProgress({stage:'composition',progress:62,message:'Building ManimCE animated scenes around the measured narration.'});
  composition=await renderWithManim(plan,tracks.map(t=>({...t,file:resolve(out,t.file)})),workspace,{format:brief.format,style:brief.style,env,signal,onProgress});
  await copyFile(composition.renderFile,join(out,'render.mp4'));
  worker={success:true,engine:'manim',detail:'ManimCE per-scene animation renderer'};
 }else{
  await onProgress({stage:'composition',progress:62,message:'Building animated scenes around the measured narration.'});
  composition=await composeVideo(plan,tracks.map(t=>({...t,file:resolve(out,t.file)})),workspace,{format:brief.format,style:brief.style,env,signal});
  await onProgress({stage:'render',progress:72,message:'OpenMontage is checking and rendering your video.'});
  worker=await renderWithOpenMontage(workspace,join(out,'render.mp4'),{env,signal,onProgress:async p=>{if(p?.message)await onProgress({...p,stage:'render',progress:Math.min(89,Math.max(72,p.progress||76))});}});
 }
 await fairWriteJson(join(out,'timeline.json'),composition);
 await writeFile(join(out,'transcript.txt'),`${plan.title}\n\n${plan.scenes.map(s=>`${s.title}\n${s.narration}${s.pauseSeconds?`\n[Think for ${s.pauseSeconds} seconds]`:''}`).join('\n\n')}\n`);
 // The compiler owns caption timing; preserve its complete narration text.
 const captionPath=composition.artifacts?.captions;
 if(typeof captionPath==='string')await copyFile(captionPath,join(out,'captions.vtt'));
 else if(await stat(join(workspace,'captions.vtt')).catch(()=>null))await copyFile(join(workspace,'captions.vtt'),join(out,'captions.vtt'));
 else throw new Error('The composition did not produce captions.');
 await fairWriteJson(join(out,'metadata.json'),{...plan.metadata,mode:plan.mode,format:brief.format,sources:plan.claims,publicationStatus:'draft',rights:'Original drawn assets and synthesized music; generated factual claims require review.',disclosure:'AI-assisted narration and animation.',mediaApiCostUsd:0});
 await fairWriteJson(join(out,'openmontage.json'),worker);abort();
 await onProgress({stage:'verify',progress:91,message:'Measuring audio, duration, captions and final output.'});
 await fairCommand(env.FAIR_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(out,'render.mp4'),'-map','0:v:0','-map','0:a:0','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','160k','-movflags','+faststart',join(out,'final.mp4')],{env,signal,timeoutMs:120000});
 const video=join(out,'final.mp4');
 await fairCommand(env.FAIR_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',video,'-map','0:v:0','-map','0:a:0','-f','null','-'],{env,signal,timeoutMs:120000});
 const probe=await fairProbe(video,{env,signal}),duration=Number(probe.format?.duration);
 const audio=await fairCommand(env.FAIR_FFMPEG||'ffmpeg',['-hide_banner','-i',video,'-af','ebur128','-f','null','-'],{env,signal,timeoutMs:120000});
 const loudness=Number([...audio.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
 const captionText=await readFile(join(out,'captions.vtt'),'utf8');
 const captionsComplete=plan.scenes.every(s=>composition.captions.filter(c=>c.sceneId===s.id).map(c=>c.text).join(' ')===s.narration.trim().replace(/\s+/g,' '))&&composition.captions.every((c,i)=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start&&c.end<=duration+.1&&(i===0||c.start>=composition.captions[i-1].end-.01));
 const checks=[{name:'Complete media decode',passed:true,detail:'Every video frame and audio packet decoded without errors.'},{name:useManim?'ManimCE scene render': 'OpenMontage composition checks',passed:worker.success===true,detail:useManim?'ManimCE rendered every scene segment at the measured narration timing.':'Pinned upstream tool completed its runtime, layout, contrast and source-integrity checks.'},{name:'Video stream',passed:probe.streams?.some(s=>s.codec_type==='video'&&s.width===composition.width&&s.height===composition.height)===true,detail:`${composition.width}×${composition.height} delivery dimensions.`},{name:'Narration audio',passed:probe.streams?.some(s=>s.codec_type==='audio')===true,detail:'Audio stream present.'},{name:'Complete timeline',passed:Number.isFinite(duration)&&Math.abs(duration-composition.durationSeconds)<.15,detail:`Expected ${composition.durationSeconds.toFixed(2)}s; measured ${duration.toFixed(2)}s.`},{name:'Audio loudness',passed:Number.isFinite(loudness)&&loudness>=-18&&loudness<=-14,detail:`${loudness} LUFS, target −16 ±2.`},{name:'Timed captions',passed:captionsComplete&&captionText.startsWith('WEBVTT')&&captionText.includes('-->'),detail:'Complete narration covered by ordered, in-bounds captions; WebVTT and on-screen captions supplied.'},{name:'Plan and arithmetic',passed:true,detail:`Validated ${plan.scenes.length} scenes and ${plan.mathClaims.length} explicit equalities; spoken claims still need review.`},{name:'Content critique',passed:result.review.passed,detail:`Reviewed with ${result.review.model}; ${result.review.independentModel?'different model':'same model in a separate pass'}.`}];
 await fairCommand(env.FAIR_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(Math.min(2,duration/4)),'-i',video,'-frames:v','1',join(out,'thumbnail.jpg')],{env,signal});
 await fairCommand(env.FAIR_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',video,'-vf',`fps=1/${Math.max(1,duration/9)},scale=480:-2,tile=3x3:padding=8:margin=8`,'-frames:v','1',join(out,'contact-sheet.jpg')],{env,signal});
 const warnings=['This is an AI-generated draft. Human review is required before publication.','Visual and script checks do not establish educational mastery or monetization eligibility.',...(!result.review.independentModel?['The script critic used the same model as the planner.']:[]),...(plan.claims.length?['Factual statements were model-reviewed, not independently verified against external sources.']:[]),...(!composition.captions.every(t=>t.timingSource==='forced-alignment'||t.timingSource==='provider-alignment')?['Some caption timing is estimated.']:[]),...(Math.abs(duration-brief.durationSeconds)>brief.durationSeconds*.25?[`Actual duration ${Math.round(duration)}s differs from the ${brief.durationSeconds}s target; narration was not cut or sped up.`]:[])];
 const report={passed:checks.every(c=>c.passed),checks,warnings,durationSeconds:duration,engine:useManim?'manim':'openmontage',reviewRequired:true,educatorApproved:false,mode:plan.mode,format:brief.format,voice:env.STUDIO_V2_VOICE||DEFAULT_V2_VOICE,wordTimingSources:[...new Set(composition.captions.map(t=>t.timingSource))],mediaApiCostUsd:0,generatedAt:new Date().toISOString(),rendererVersion:require('hyperframes/package.json').version};
 await fairWriteJson(join(out,'quality-report.json'),report);
 if(!report.passed)throw new Error(`Video quality checks failed: ${checks.filter(c=>!c.passed).map(c=>c.name).join(', ')}. Inspect the quality report.`);
 await fairWriteJson(join(out,'manifest.json'),{brief,fingerprint,videoSha256:await fairFileHash(video),scriptSha256:await fairFileHash(join(out,'plan.json')),review:result.review,renderer:'OpenMontage/HyperFrames',status:'generated-draft'});
 return {plan,report};
}

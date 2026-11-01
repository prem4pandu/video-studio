#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {stat,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

async function exists(path){try{return await stat(path);}catch{return null;}}
function run(command,args){return new Promise((done,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),15*60*1000);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',(code,signal)=>{clearTimeout(timer);done({code,signal,stdout,stderr});});});}
const ratio=value=>{const [n,d=1]=String(value||0).split('/').map(Number);return d?n/d:0;};
const numeric=value=>Number.isFinite(Number(value))?Number(value):null;
async function locate(input){const path=resolve(input),info=await exists(path);if(!info)throw new Error(`Input does not exist: ${path}`);if(info.isFile()&&extname(path)==='.mp4')return path;const base=info.isDirectory()?path:dirname(path);for(const name of ['final.mp4','project/final.mp4','render.mp4','project/render.mp4'])if(await exists(join(base,name)))return join(base,name);throw new Error(`No final.mp4 or render.mp4 in ${base}`);}
async function timelineFor(video,explicit){const base=dirname(video);const candidates=explicit?[resolve(explicit)]:[join(base,'storyboard.json'),join(base,'..','workspace','storyboard.json'),join(base,'workspace','storyboard.json')];for(const file of candidates)if(await exists(file))return {path:file,data:JSON.parse(await readFile(file,'utf8'))};return null;}
export async function verifyVideo(input,{output,timeline}={}){
 const video=await locate(input);const board=await timelineFor(video,timeline);
 const probe=await run(process.env.FAIR_FFPROBE||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',video]);
 if(probe.code!==0)throw new Error(`ffprobe failed: ${probe.stderr}`);
 const data=JSON.parse(probe.stdout),v=data.streams.find(s=>s.codec_type==='video'),a=data.streams.find(s=>s.codec_type==='audio'),duration=numeric(data.format.duration);
 if(!v)throw new Error('No video stream');
 const args=['-hide_banner','-nostats','-xerror','-i',video,'-map','0:v:0','-vf','blackdetect=d=0.1:pix_th=0.10:pic_th=0.98,freezedetect=n=-50dB:d=2'];
 if(a)args.push('-map','0:a:0','-af','volumedetect');
 args.push('-f','null','-');
 const decoded=await run(process.env.FAIR_FFMPEG||'ffmpeg',args),log=decoded.stderr;
 const blackFrames=[...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2]),duration:Number(m[3])}));
 const freezes=[];let freezeStart=null;
 for(const match of log.matchAll(/freeze_(start|end):\s*([\d.]+)/g)){if(match[1]==='start')freezeStart=Number(match[2]);else if(freezeStart!==null){freezes.push({start:freezeStart,end:Number(match[2]),duration:Number(match[2])-freezeStart});freezeStart=null;}}
 if(freezeStart!==null)freezes.push({start:freezeStart,end:duration,duration:duration-freezeStart,continuesToEnd:true});
 const pauses=(board?.data.scenes||[]).filter(s=>s.pauseSeconds>0&&Number.isFinite(s.speechStart)&&Number.isFinite(s.speechDuration)).map(s=>({sceneId:s.id,start:s.speechStart+s.speechDuration,end:s.speechStart+s.speechDuration+s.pauseSeconds}));
 for(const freeze of freezes){freeze.thinkingPauseOverlapSeconds=pauses.reduce((sum,p)=>sum+Math.max(0,Math.min(freeze.end,p.end)-Math.max(freeze.start,p.start)),0);freeze.classification=freeze.thinkingPauseOverlapSeconds>=freeze.duration-.1?'expected-thinking-pause':freeze.thinkingPauseOverlapSeconds>0?'partly-thinking-pause':'static-hold-review';}
 const mean=log.match(/mean_volume:\s*(-?[\d.]+|-inf) dB/)?.[1],peak=log.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)?.[1];
 const fps=ratio(v.avg_frame_rate),dimensionsMatch=board? v.width===board.data.width&&v.height===board.data.height:null;
 const failures=[];if(decoded.code!==0)failures.push('Full decode failed');if(!a)failures.push('Audio stream missing');if(!(duration>0))failures.push('Invalid duration');if(dimensionsMatch===false)failures.push('Dimensions disagree with storyboard');if(board&&Math.abs(duration-board.data.durationSeconds)>.15)failures.push('Duration disagrees with storyboard');
 const report={schemaVersion:1,checkedAt:new Date().toISOString(),video,pass:failures.length===0,failures,probe:{durationSeconds:duration,width:v.width,height:v.height,fps,videoCodec:v.codec_name,pixelFormat:v.pix_fmt,audio:a?{codec:a.codec_name,sampleRate:Number(a.sample_rate),channels:a.channels}:null},decode:{complete:decoded.code===0,exitCode:decoded.code,signal:decoded.signal},timeline:board?{path:board.path,dimensionsMatch,expectedDurationSeconds:board.data.durationSeconds,thinkingPauses:pauses}:null,measurements:{blackFrames,freezes,audio:{meanDbfs:mean==='-inf'?'-Infinity':numeric(mean),samplePeakDbfs:peak==='-inf'?'-Infinity':numeric(peak),method:'ffmpeg volumedetect; sample peak and mean power, not integrated LUFS or true peak'}},notes:['Freeze detection uses a -50 dB frame-difference threshold and a two-second minimum. Static diagrams and deliberate reading holds may be appropriate; this measurement is not a quality failure.','Black detection measures frames with at least 98% pixels below 10% luma for at least 0.1 seconds.','Technical checks cannot establish factual correctness, narration quality, commercial performance, or visual storytelling quality.']};
 const destination=resolve(output||join(dirname(video),'media-inspection.json'));await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2)+'\n');await writeFile(destination.replace(/\.json$/,'')+'.ffmpeg.log',log);return {report,output:destination};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const args=process.argv.slice(2),input=args[0];if(!input||input==='--help'){console.log('Usage: node scripts/verify-studio-v2-video.mjs <job-directory|project-directory|final.mp4> [--out report.json] [--timeline storyboard.json]');process.exitCode=input?0:2;}else{const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};const result=await verifyVideo(input,{output:option('--out'),timeline:option('--timeline')});console.log(JSON.stringify(result,null,2));if(!result.report.pass)process.exitCode=1;}}catch(error){console.error(error.message);process.exitCode=1;}}

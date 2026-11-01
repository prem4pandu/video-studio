import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,mkdir,writeFile,readFile,chmod,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { narrationReadiness,DEFAULT_V2_VOICE } from '../studio-v2/pipeline.mjs';
import { fairVoiceConfig,fairNarrate } from '../src/voice.mjs';

async function setup(t){
 const root=await mkdtemp(join(tmpdir(),'v2-voice-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const model=join(root,'model');await mkdir(join(model,'speech_tokenizer'),{recursive:true});
 for(const file of ['config.json','model.safetensors','tokenizer_config.json','speech_tokenizer/model.safetensors'])await writeFile(join(model,file),'fixture');
 const python=join(root,'python');await writeFile(python,'fixture');
 const profile=join(root,'teacher.json');await writeFile(profile,JSON.stringify({id:'fixture-teacher',instruct:'A clear warm adult teacher speaking conversationally with natural pauses.',seed:42}));
 return {root,model,profile,env:{FAIR_QWEN_PYTHON:python,FAIR_QWEN_MODEL_DIR:model,FAIR_QWEN_PROFILE:profile}};
}
test('V2 defaults to continuous Qwen scene synthesis and validates explicit compatibility selection',()=>{
 assert.equal(DEFAULT_V2_VOICE,'qwentts');
 assert.equal(fairVoiceConfig({}, {voiceProvider:'qwentts'}).synthesisUnit,'scene');
 assert.equal(fairVoiceConfig({FAIR_QWEN_SYNTHESIS_UNIT:'phrase'}, {voiceProvider:'qwentts'}).synthesisUnit,'phrase');
 assert.throws(()=>fairVoiceConfig({FAIR_QWEN_SYNTHESIS_UNIT:'unknown'}, {voiceProvider:'qwentts'}),/must be scene or phrase/);
});
test('Qwen readiness checks profile, nonempty weights and actual runtime without fallback',async t=>{
 const {env,model,profile}=await setup(t);let calls=0;
 const ready=await narrationReadiness(env,{run:async(command,args,options)=>{calls++;assert.equal(command,env.FAIR_QWEN_PYTHON);assert.match(args[1],/mlx_audio/);assert.equal(options.timeoutMs,20000);}});
 assert.equal(ready.available,true);assert.equal(ready.provider,'qwentts');assert.equal(ready.profile,'fixture-teacher');assert.equal(ready.synthesisUnit,'scene');assert.equal(calls,1);
 const unavailable=await narrationReadiness(env,{run:async()=>{throw new Error('No Metal device available');}});
 assert.equal(unavailable.available,false);assert.equal(unavailable.provider,'qwentts');assert.match(unavailable.detail,/No Metal/);
 await writeFile(join(model,'model.safetensors'),'');
 const missingWeights=await narrationReadiness(env,{run:async()=>{throw new Error('Should not run');}});
 assert.equal(missingWeights.available,false);assert.match(missingWeights.detail,/empty/);
 await writeFile(join(model,'model.safetensors'),'fixture');await writeFile(profile,JSON.stringify({instruct:'short',seed:42}));
 const badProfile=await narrationReadiness(env,{run:async()=>{throw new Error('Should not run');}});
 assert.equal(badProfile.available,false);assert.match(badProfile.detail,/profile needs/);
});
test('a Kokoro selection remains explicit and remote service URLs are rejected',async t=>{
 const {root}=await setup(t);const env={STUDIO_V2_VOICE:'kokoro',FAIR_KOKORO_PYTHON:join(root,'python'),FAIR_KOKORO_MODEL:join(root,'model','model.safetensors'),FAIR_KOKORO_VOICES:join(root,'model','config.json')};
 const ready=await narrationReadiness(env);assert.equal(ready.available,true);assert.equal(ready.provider,'kokoro');
 const remote=await narrationReadiness({...env,FAIR_KOKORO_URL:'https://example.com'});assert.equal(remote.available,false);assert.match(remote.detail,/local voice files/);
});

test('Qwen profile changes invalidate cached narration and scene requests preserve the full text',async t=>{
 const {env,root,profile}=await setup(t),fake=join(root,'runtime');
 await writeFile(fake,`#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2),last=args.at(-1);
if(last.endsWith('.request.json')){
 const r=JSON.parse(fs.readFileSync(last));const b=Buffer.alloc(44+24000);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(24000,40);
 for(let i=0;i<12000;i++)b.writeInt16LE(Math.round(3000*Math.sin(i/10)),44+i*2);
 fs.writeFileSync(r.output,b);fs.writeFileSync(r.timing,JSON.stringify([{text:r.phrases.join(' '),startSeconds:0,endSeconds:.5}]));
}else fs.copyFileSync(args[args.indexOf('-i')+1],last);
`);await chmod(fake,0o755);
 const runtimeEnv={...env,FAIR_QWEN_PYTHON:fake,FAIR_FFMPEG:fake};
 const directory=join(root,'output'),lesson={scenes:[{id:'example',title:'Example',narration:'First complete sentence. Second complete sentence.'}]};
 const first=await fairNarrate(lesson,directory,{env:runtimeEnv,brief:{voiceProvider:'qwentts'}});
 let request=JSON.parse(await readFile(join(directory,'audio/example.source.request.json')));
 assert.deepEqual(request.phrases,[lesson.scenes[0].narration]);
 const edited=JSON.parse(await readFile(profile));edited.seed=43;edited.instruct+=' Use a calm thoughtful pace.';await writeFile(profile,JSON.stringify(edited));
 const second=await fairNarrate(lesson,directory,{env:runtimeEnv,brief:{voiceProvider:'qwentts'}});
 assert.notEqual(first[0].fingerprint,second[0].fingerprint);
 request=JSON.parse(await readFile(join(directory,'audio/example.source.request.json')));
 assert.equal(request.seed,43);assert.equal(request.instruct,edited.instruct);
});

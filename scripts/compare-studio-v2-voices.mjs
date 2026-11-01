import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fairNarrate } from '../src/voice.mjs';
const root=resolve(process.argv[2]||'outputs/studio-v2-voice-review');
const sources=[['learning','4d0d1627-68bf-4118-91d3-ae347874e0cf',[1,3]],['social','5b0f7cc6-9ca2-4659-833f-5165ef4730fa',[3]],['story','7c9ec21d-a440-49ea-81a9-11d69c563fd1',[3]]];
const scenes=[];
for(const [mode,id,indices]of sources){const p=JSON.parse(await readFile(`outputs/studio-v2-tests/jobs/${id}/project/plan.json`));for(const i of indices)scenes.push({...p.scenes[i],id:`${mode}-${i+1}`,sourceJob:id,sourceScene:p.scenes[i].id});}
const plan={title:'Same-text local voice comparison',scenes};
// Disable alignment only for the audition: it changes timing metadata, never synthesis.
const env={...process.env,FAIR_KOKORO_URL:'',FAIR_ALIGNMENT_MODEL_DIR:'',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'};
await mkdir(root,{recursive:true});const results=[];
for(const provider of ['kokoro','qwentts']){
 const directory=join(root,provider);await mkdir(directory,{recursive:true});await writeFile(join(directory,'plan.json'),JSON.stringify(plan,null,2));
 const start=Date.now();const tracks=await fairNarrate(plan,directory,{env,brief:{voiceProvider:provider},onProgress:p=>console.log(provider,p.message)});
 const result={provider,elapsedSeconds:(Date.now()-start)/1000,tracks:tracks.map(t=>({id:t.sceneId,voice:t.voice,durationSeconds:t.durationSeconds,phrases:t.phrases,sha256:t.sha256}))};results.push(result);console.log(JSON.stringify(result));
 await writeFile(join(root,'synthesis-comparison.json'),JSON.stringify({humanListeningReview:false,results},null,2));
}

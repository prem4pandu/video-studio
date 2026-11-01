import { randomUUID } from 'node:crypto';
import { mkdir,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fairReadJson,fairWriteJson,fairHash } from '../src/utils.mjs';
import { Brief,Review,ARTIFACTS,validId } from './contracts.mjs';
import { runProduction } from './pipeline.mjs';
const error=(message,statusCode)=>Object.assign(new Error(message),{statusCode});
export class ProductionStore {
 constructor(root,{env=process.env,run=runProduction,maxQueue=30}={}){this.root=root;this.env=env;this.run=run;this.maxQueue=maxQueue;this.jobs=new Map();this.queue=[];this.active=null;this.writes=new Map();this.creation=Promise.resolve();this.stopping=false;}
 directory(id){if(!validId(id))throw error('Invalid production ID.',400);return join(this.root,id);}
 async init(){await mkdir(this.root,{recursive:true});for(const id of await readdir(this.root)){if(!validId(id))continue;try{const j=await fairReadJson(join(this.directory(id),'job.json'));Brief.parse(j.brief);if(j.id!==id||!['queued','running','completed','failed','interrupted'].includes(j.status))continue;this.jobs.set(id,j);if(['running','queued'].includes(j.status))await this.update(j,{status:'interrupted',message:'Studio restarted. Retry to resume saved work.'});}catch(e){console.error(`V2 job recovery ${id}: ${e.message}`);}}}
 get(id){return validId(id)?this.jobs.get(id):undefined;}
 list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(j=>({...j,events:undefined,plan:undefined}));}
 async update(job,patch){Object.assign(job,patch,{updatedAt:new Date().toISOString()});if(patch.message)job.events=[...(job.events||[]),{at:job.updatedAt,stage:job.stage,message:patch.message}].slice(-150);const snapshot=structuredClone(job),prior=this.writes.get(job.id)||Promise.resolve();const task=prior.catch(()=>{}).then(()=>fairWriteJson(join(this.directory(job.id),'job.json'),snapshot));this.writes.set(job.id,task);await task;}
 async create(input,key){
  const brief=Brief.parse(input);if(typeof key!=='string'||!/^[-a-zA-Z0-9_:.]{16,128}$/.test(key))throw error('A 16–128 character Idempotency-Key is required.',400);
  const create=async()=>{if(this.stopping)throw error('Studio is stopping.',503);const hash=fairHash(brief);const prior=[...this.jobs.values()].find(j=>j.requestKey===key);if(prior){if(prior.requestHash!==hash)throw error('This request key was already used with different settings.',409);return prior;}
   if(this.queue.length>=this.maxQueue)throw error('The production queue is full.',429);
   const now=new Date().toISOString(),job={id:randomUUID(),brief,requestKey:key,requestHash:hash,status:'queued',stage:'queued',progress:0,message:'Queued for production.',createdAt:now,updatedAt:now,events:[],attempts:0};
   await this.update(job,{});this.jobs.set(job.id,job);this.queue.push(job.id);this.pump();return job;};
  const p=this.creation.catch(()=>{}).then(create);this.creation=p;return p;
 }
 async retry(id){if(this.stopping)throw error('Studio is stopping.',503);const j=this.get(id);if(!j)throw error('Production not found.',404);if(!['failed','interrupted'].includes(j.status)||this.active?.id===id)throw error('Only stopped productions can be retried.',409);if(this.queue.length>=this.maxQueue)throw error('The production queue is full.',429);await this.update(j,{status:'queued',error:null,progress:0,message:'Queued to resume saved work.'});this.queue.push(id);this.pump();return j;}
 async cancel(id){const j=this.get(id);if(!j)throw error('Production not found.',404);if(!['queued','running'].includes(j.status))throw error('This production is not running.',409);this.queue=this.queue.filter(x=>x!==id);this.active?.id===id&&this.active.controller.abort(new Error('Production cancelled.'));await this.update(j,{status:'interrupted',message:'Production stopped. Saved work can be resumed.',error:null});return j;}
 async review(id,input){const j=this.get(id);if(!j)throw error('Production not found.',404);if(j.status!=='completed')throw error('Only completed productions can be reviewed.',409);const review={...Review.parse(input),at:new Date().toISOString(),reviewer:'studio-user'};await fairWriteJson(join(this.directory(id),'review.json'),review);await this.update(j,{review});return j;}
 pump(){if(this.stopping||this.active||!this.queue.length)return;const id=this.queue.shift(),controller=new AbortController();const done=this.execute(this.get(id),controller).finally(()=>{this.active=null;this.pump();}).catch(e=>console.error('V2 persistence:',e));this.active={id,controller,done};}
 async execute(job,controller){try{
  await this.update(job,{status:'running',attempts:job.attempts+1,message:'Starting production.'});
  const result=await this.run(job.brief,this.directory(job.id),{env:this.env,signal:controller.signal,onProgress:async patch=>{if(!controller.signal.aborted)await this.update(job,patch);}});
  if(controller.signal.aborted)return;
  await this.update(job,{status:'completed',stage:'complete',progress:100,message:'Your video is ready for human review.',report:result.report,plan:result.plan,artifacts:Object.fromEntries(Object.keys(ARTIFACTS).map(k=>[k,`/api/v2/jobs/${job.id}/artifacts/${k}`]))});
 }catch(e){if(!controller.signal.aborted)await this.update(job,{status:'failed',error:String(e.message).slice(0,3000),message:'Production stopped. Review the error and retry.',artifacts:await this.availableArtifacts(job)});}}
 async availableArtifacts(job){const {stat}=await import('node:fs/promises');const pairs=await Promise.all(Object.entries(ARTIFACTS).map(async([k,p])=>(await stat(join(this.directory(job.id),'project',p)).catch(()=>null))?[k,`/api/v2/jobs/${job.id}/artifacts/${k}`]:null));return Object.fromEntries(pairs.filter(Boolean));}
 async stop(){this.stopping=true;this.queue=[];if(this.active){this.active.controller.abort(new Error('Studio stopping.'));await this.active.done;}await Promise.allSettled(this.writes.values());}
}

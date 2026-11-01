import { z } from 'zod';
import { checkClaim } from '../src/plan.mjs';
export const MODES = ['auto', 'learning', 'social', 'story'];
export const KINDS = ['title','flow','cycle','comparison','stat','fraction','base-ten','question','orbit','recap','story'];
export const VISUAL_STATES = ['default','seed','growing','wilt','care','storm','bloom'];
export const MOTIFS = ['blocks','plant','planet','lightbulb','rocket','wave','none'];
export const Brief = z.object({prompt:z.string().trim().min(12).max(4000),mode:z.enum(MODES).default('auto'),format:z.enum(['landscape','portrait']).default('landscape'),durationSeconds:z.number().int().min(30).max(180).default(60),style:z.enum(['auto','editorial','playful','bold']).default('auto')}).strict();
const Scene = z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),title:z.string().trim().min(1).max(64),narration:z.string().trim().min(10).max(500),kind:z.enum(KINDS),labels:z.array(z.string().trim().min(1).max(42)).max(4),numbers:z.array(z.number().finite().min(-1000000).max(1000000)).max(8),emphasis:z.string().max(80),motif:z.enum(MOTIFS),visualState:z.enum(VISUAL_STATES).default('default'),pauseSeconds:z.number().min(0).max(5)}).strict();
export const Plan = z.object({title:z.string().trim().min(1).max(90),summary:z.string().max(500),mode:z.enum(['learning','social','story']),scenes:z.array(Scene).min(4).max(12),claims:z.array(z.object({statement:z.string().max(300),source:z.string().max(500)}).strict()).max(12),mathClaims:z.array(z.object({left:z.string().max(160),right:z.string().max(160)}).strict()).max(24),metadata:z.object({title:z.string().max(100),description:z.string().max(1500),tags:z.array(z.string().max(40)).max(12)}).strict()}).strict();
const str=(maxLength=500)=>({type:'string',maxLength});
const arr=(items,maxItems)=>({type:'array',items,maxItems});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const planJsonSchema=obj({title:str(90),summary:str(),mode:{type:'string',enum:['learning','social','story']},scenes:{...arr(obj({id:str(40),title:str(64),narration:str(),kind:{type:'string',enum:KINDS},labels:arr(str(42),4),numbers:arr({type:'number'},8),emphasis:str(80),motif:{type:'string',enum:MOTIFS},visualState:{type:'string',enum:VISUAL_STATES},pauseSeconds:{type:'number',minimum:0,maximum:5}}),12),minItems:4},claims:arr(obj({statement:str(300),source:str()}),12),mathClaims:arr(obj({left:{...str(160),pattern:'^[0-9+*/(). \-]+$'},right:{...str(160),pattern:'^[0-9+*/(). \-]+$'}}),24),metadata:obj({title:str(100),description:str(1500),tags:arr(str(40),12)})});
export const critiqueJsonSchema=obj({passed:{type:'boolean'},issues:arr(str(300),8),notes:arr(str(300),8)});
export function validatePlan(raw,brief) {
 const plan=Plan.parse(raw),ids=new Set();
 if(brief.mode!=='auto'&&plan.mode!==brief.mode)throw new Error('The production mode does not match the request.');
 for(const [i,s] of plan.scenes.entries()) {
  if(ids.has(s.id))throw new Error('Scene IDs must be unique.');ids.add(s.id);
  const words=s.narration.split(/\s+/).length;
  if(/\b(?:one |a )?half\s+(?:is|means|equals|represents)\s+(?:exactly |just )?(?:two|2)\s+equal\s+(?:parts|pieces)\b/i.test(s.narration))throw new Error('One half is ONE OF two equal parts, not two equal parts together. Correct the definition.');
  if(words<5||words>45)throw new Error(`Scene ${s.id} needs 5–45 spoken words; received ${words}.`);
  if(s.kind==='fraction'&&!(s.numbers.length===2&&s.numbers.every(Number.isInteger)&&s.numbers[1]>=1&&s.numbers[1]<=12&&s.numbers[0]>=0&&s.numbers[0]<=s.numbers[1]))throw new Error(`Fraction ${s.id} requires [numerator, denominator], 0 ≤ numerator ≤ denominator ≤ 12.`);
  if(s.kind==='base-ten'&&!(s.numbers.length===1&&Number.isInteger(s.numbers[0])&&s.numbers[0]>=1&&s.numbers[0]<=99))throw new Error(`Base-ten ${s.id} requires one integer 1–99.`);
  if(s.kind==='question'&&(!s.narration.includes('?')||/\b(?:one |a )?half\s+(?:is|means|equals|represents)\s+(?:one|1)\s+(?:of|out of)\s+(?:two|2)/i.test(s.narration)))throw new Error('Question narration must ask an actual question ending in ?, without stating the answer or the half definition. Put explanations in the following scene.');
  if(s.kind==='question'&&(s.labels.length||s.numbers.length))throw new Error('Question labels and numbers must be empty to prevent answer leaks.');
  if(s.kind==='cycle'&&s.labels.length<2)throw new Error(`Cycle ${s.id} needs 2–4 stage labels, one per step around the loop.`);
  if(s.kind==='question'&&(s.pauseSeconds<3||i===plan.scenes.length-1||plan.scenes[i+1].kind==='question'))throw new Error('Each question needs at least three thinking seconds and an immediate answer scene.');
  if(s.kind!=='question'&&s.pauseSeconds>1)throw new Error('Long thinking pauses are only for questions.');
 }
 if(plan.mode==='learning'&&!plan.scenes.some(s=>s.kind==='question'))throw new Error('Learning videos need a concrete question followed by an explained answer.');
 if(plan.mode!=='story'&&new Set(plan.scenes.map(s=>s.kind)).size<3)throw new Error('Use at least three meaningful visual kinds.');
 for(const c of plan.mathClaims)checkClaim(c.left,c.right,'Video plan');
 const wordCount=plan.scenes.reduce((n,s)=>n+s.narration.split(/\s+/).length,0);
 if(wordCount>brief.durationSeconds*3.2||wordCount<brief.durationSeconds*1.5)throw new Error(`Script has ${wordCount} words; allowed ${Math.ceil(brief.durationSeconds*1.5)}–${Math.floor(brief.durationSeconds*3.2)}, aim for ${Math.round(brief.durationSeconds*2.4)}. Shorten narration across the scenes if above the maximum.`);
 return plan;
}
export const Review = z.object({decision:z.enum(['approved','needs-changes','rejected']),note:z.string().max(2000).default('')}).strict();
export const ARTIFACTS={video:'final.mp4',captions:'captions.vtt',transcript:'transcript.txt',plan:'plan.json',report:'quality-report.json',thumbnail:'thumbnail.jpg',metadata:'metadata.json'};
export const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeVideo, captionChunks, plantVisualState } from '../studio-v2/render/compose.mjs';
const scene=(id,kind,more={})=>({id,kind,title:'One idea at a time',narration:'One idea becomes a clear visual example.',labels:['One idea','A clear example'],numbers:[],emphasis:'Keep it clear',motif:'plant',pauseSeconds:0,...more});
async function fixture(t,scenes,options={}){
 const dir=await mkdtemp(join(tmpdir(),'v2-render-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const audio=join(dir,'voice.wav'); await writeFile(audio,Buffer.alloc(128));
 const tracks=scenes.map(s=>({sceneId:s.id,file:audio,durationSeconds:4,words:s.narration.split(' ').map((text,i)=>({text,startSeconds:i*.4,endSeconds:(i+1)*.4})),wordTimingSource:'forced-alignment'}));
 const workspace=join(dir,'composition'); const result=await composeVideo({title:'Demo',mode:'learning',scenes},tracks,workspace,{...options,env:{STUDIO_V2_MUSIC:'off'}});
 return {result,workspace,tracks};
}
test('measured speech and question pause preserved; caption words are complete',async t=>{
 const scenes=[scene('question','question',{title:'Question Time',narration:'What is the tens value in 52?',numbers:[52],labels:[],pauseSeconds:5}),scene('answer','base-ten',{numbers:[52]})];
 const {result,workspace}=await fixture(t,scenes);assert.equal(result.scenes[0].pauseSeconds,5);assert.ok(result.scenes[0].duration>=9.75);
 assert.equal(result.scenes[1].start,result.scenes[0].duration);assert.equal(result.scenes[0].speechStart,.35);
 assert.equal(result.captions.filter(c=>c.sceneId==='question').map(c=>c.text).join(' '),scenes[0].narration);
 const question=await readFile(join(workspace,'compositions/scene-0-question.html'),'utf8');assert.match(question,/persistent-question/);assert.match(question,/tens value in 52/);assert.doesNotMatch(question,/>50</);assert.doesNotMatch(question,/correct-answer/);
 const root=await readFile(join(workspace,'index.html'),'utf8');assert.match(root,/data-hf-id="v2-root"/);assert.match(root,/data-hf-id="v2-voice-0"/);
});
test('fractions and base-ten preserve quantity and reject impossible visuals',async t=>{
 const {workspace}=await fixture(t,[scene('fraction','fraction',{numbers:[2,4]}),scene('group','base-ten',{numbers:[37]})]);
 const f=await readFile(join(workspace,'compositions/scene-0-fraction.html'),'utf8');assert.equal((f.match(/data-unit="fraction"/g)||[]).length,4);assert.equal((f.match(/data-selected="true"/g)||[]).length,2);
 const b=await readFile(join(workspace,'compositions/scene-1-group.html'),'utf8');assert.equal((b.match(/data-unit="base-ten"/g)||[]).length,37);
 await assert.rejects(fixture(t,[scene('bad','fraction',{numbers:[5,4]})]),/Invalid fraction/);
});
test('untrusted script/title/label text cannot create markup or executable code',async t=>{
 const bad='<script>alert("x")</script>';
 const {workspace}=await fixture(t,[scene('bad/../../id','story',{title:bad,labels:[bad],narration:`Read ${bad} safely.`})]);
 const root=await readFile(join(workspace,'index.html'),'utf8');assert.doesNotMatch(root,/\.\.\//);
 const s=await readFile(join(workspace,'compositions/scene-0-bad-------id.html'),'utf8').catch(()=>null);
 assert.ok(s);assert.ok(s.includes('&lt;script&gt;'));assert.ok(!s.includes('<script>alert'));
});
test('portrait output is recomposed and keeps captions above social controls',async t=>{
 const {result,workspace}=await fixture(t,[scene('p','flow')],{format:'portrait'});
 assert.equal(result.width,1080);assert.equal(result.height,1920);
 const s=await readFile(join(workspace,'compositions/scene-0-p.html'),'utf8');assert.match(s,/top:1210px/);assert.match(s,/viewBox="0 0 800 690"/);assert.match(s,/prefers-reduced-motion/);
});
test('bad or mismatched word timing is honestly estimated without dropping words',()=>{
 const s=scene('a','title');const chunks=captionChunks(s,{durationSeconds:5,words:[{text:'wrong',startSeconds:0,endSeconds:1}]});
 assert.equal(chunks.map(c=>c.text).join(' '),s.narration);assert.ok(chunks.every(c=>c.timingSource==='estimated'));assert.equal(chunks.at(-1).end,5.35);
});
test('pizza narration produces equal circular sectors with conserved selected quantity',async t=>{
 for(const denominator of [1,2,4,8]){
  const {workspace}=await fixture(t,[scene('pizza','fraction',{title:'Share a pizza equally',numbers:[1,denominator]})],{format:'portrait'});
  const html=await readFile(join(workspace,'compositions/scene-0-pizza.html'),'utf8');
  assert.match(html,/data-visual="pizza"/);
  assert.equal((html.match(/data-unit="fraction"/g)||[]).length,denominator);
  assert.equal((html.match(/data-selected="true"/g)||[]).length,1);
  assert.equal((html.match(new RegExp(`data-sector-angle="${360/denominator}"`,'g'))||[]).length,denominator);
 }
});
test('first contextual diagram item appears immediately and discloses speech timing separately',async t=>{
 const {result,workspace}=await fixture(t,[scene('flow','flow'),scene('recap','recap')],{format:'portrait'});
 for(const s of result.scenes){const cue=result.cues.find(c=>c.sceneId===s.id);assert.equal(cue.at,s.start);assert.equal(cue.timingSource,'opening-context-reveal');assert.ok(cue.spokenCueAt>=s.start+.35);}
 const html=await readFile(join(workspace,'compositions/scene-0-flow.html'),'utf8');assert.match(html,/font-size="46"/);
});
test('plant story uses seed, storm, care and actual flowering states',async t=>{
 const scenes=[scene('seed','story',{title:'Tiny Sprout Dreams of Growth'}),scene('storm','story',{title:'Rainstorm Washes Soil Away'}),scene('care','story',{title:'Gardener Adds Fresh Soil'}),scene('bloom','story',{title:'Sprout Blooms into a Bright Flower'})];
 const {workspace,result}=await fixture(t,scenes);
 for(const [i,s] of scenes.entries()){const html=await readFile(join(workspace,`compositions/scene-${i}-${s.id}.html`),'utf8');assert.match(html,new RegExp(`data-plant-state="${s.id}"`));if(s.id==='bloom')assert.match(html,/class="blossom"/);if(s.id==='storm')assert.match(html,/class="rain"/);}
 assert.equal(result.cues.filter(c=>c.role==='story-state').length,4);
});

test("a seed wishing for flowers is not already blooming",()=>{assert.equal(plantVisualState({title:"Pip’s Impatient Start",narration:"Tiny seed Pip could not wait to grow. He wanted leaves and flowers now!"}),"seed");assert.equal(plantVisualState({title:"Pip’s Joyful Bloom",narration:"The tiny seed grew into a bright flower."}),"bloom");});
test('pizza opener uses whole pizza and no duplicate title label; empty recap uses actual takeaway',async t=>{
 const {workspace}=await fixture(t,[scene('opener','title',{title:'Pizza Party Begins',narration:'A whole pizza is ready to share.',labels:[],emphasis:'',motif:'none'}),scene('recap','recap',{title:'Recap Time',narration:'One half means one of two equal parts. Share fairly.',labels:[],emphasis:''})]);
 const opener=await readFile(join(workspace,'compositions/scene-0-opener.html'),'utf8');assert.match(opener,/data-visual="whole-pizza"/);assert.doesNotMatch(opener,/id="scene-0-opener-idea-0"/);
 const recap=await readFile(join(workspace,'compositions/scene-1-recap.html'),'utf8');assert.match(recap,/equal parts\./);assert.doesNotMatch(recap,/<tspan[^>]*>Recap Time<\/tspan>/);
});
test('explicit plant state wins; gentle rain nourishes without a storm and wilt visibly droops',async t=>{
 assert.equal(plantVisualState({visualState:'seed',title:'Flower dream',narration:'Dreaming of blooms'}),'seed');
 assert.equal(plantVisualState({title:'Too Much Sun',narration:'The plant wilted from heat.'}),'wilt');
 assert.equal(plantVisualState({title:'Gentle Rain and Shade',narration:'Soft rain helped it grow.'}),'care');
 const {workspace,result}=await fixture(t,[scene('care','story',{visualState:'care',title:'Gentle Rain and Shade'}),scene('wilt','story',{visualState:'wilt'})]);
 const care=await readFile(join(workspace,'compositions/scene-0-care.html'),'utf8');assert.match(care,/data-plant-state="care"/);assert.match(care,/class="rain"/);assert.doesNotMatch(care,/rotation:-14/);assert.doesNotMatch(care,/class="fresh-soil"/);
 const wilt=await readFile(join(workspace,'compositions/scene-1-wilt.html'),'utf8');assert.match(wilt,/data-plant-state="wilt"/);assert.match(wilt,/Q110 -70 110 -10/);
 assert.ok(result.cues.filter(c=>c.role==='story-state').every(c=>c.timingSource==='explicit-plan-visual-state'));
});
test('wilt does not invent hot sun for a storm-damaged plant',async t=>{
 const {workspace}=await fixture(t,[scene('storm-wilt','story',{visualState:'wilt',title:'The Sudden Storm',narration:'A storm hit hard. Sprout drooped low.'}),scene('heat-wilt','story',{visualState:'wilt',title:'Too Much Sun',narration:'The hot sun made Sprout wilt.'})]);
 const storm=await readFile(join(workspace,'compositions/scene-0-storm-wilt.html'),'utf8');assert.doesNotMatch(storm,/data-weather="hot-sun"/);
 const heat=await readFile(join(workspace,'compositions/scene-1-heat-wilt.html'),'utf8');assert.match(heat,/data-weather="hot-sun"/);
});
test('equal-versus-unequal comparisons preserve whole widths and label ordering',async t=>{
 for(const format of ['landscape','portrait']){
  const {workspace,result}=await fixture(t,[scene('compare','comparison',{labels:['Unequal Pieces','Equal Halves']})],{format});
  const html=await readFile(join(workspace,'compositions/scene-0-compare.html'),'utf8');
  const groups=[...html.matchAll(/data-comparison="(equal|unequal)" data-total-width="([\d.]+)">(.*?)<\/g>/g)];assert.equal(groups.length,2);assert.equal(groups[0][1],'unequal');assert.equal(groups[1][1],'equal');
  for(const [,kind,width,group] of groups){const parts=[...group.matchAll(/data-portion="\d"[^>]*width="([\d.]+)"/g)].map(m=>Number(m[1]));assert.equal(parts.length,2);assert.ok(Math.abs(parts[0]+parts[1]-Number(width))<1e-8);assert.ok(Math.abs(parts[0]/Number(width)-(kind==='equal'?.5:1/3))<1e-8);}
  assert.equal(result.cues.filter(c=>c.role==='portion-geometry').length,2);
 }
 const {workspace}=await fixture(t,[scene('generic','comparison',{labels:['Before','After']})]);assert.doesNotMatch(await readFile(join(workspace,'compositions/scene-0-generic.html'),'utf8'),/data-portion=/);
});
test('fraction annotation derives only from validated numbers; bare comparison labels use piece context',async t=>{
 const {workspace}=await fixture(t,[scene('fraction','fraction',{numbers:[1,2],labels:['Whole','One half']}),scene('compare','comparison',{labels:['equal','unequal'],narration:'Equal pieces have the same size. Unequal pieces do not.'})]);
 const fraction=await readFile(join(workspace,'compositions/scene-0-fraction.html'),'utf8');assert.match(fraction,/1 of 2 equal parts/);assert.doesNotMatch(fraction,/<tspan[^>]*>Whole<\/tspan>/);
 const comparison=await readFile(join(workspace,'compositions/scene-1-compare.html'),'utf8');assert.match(comparison,/data-comparison="equal"/);assert.match(comparison,/data-comparison="unequal"/);
});

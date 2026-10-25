import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fairRenderLesson } from '../src/pipeline.mjs';
import { normalizeBrief } from '../src/plan.mjs';

const text = 'Equivalent fractions for ages 9–10: preserve the same whole and shaded amount, diagnose unequal-part and denominator-only misconceptions, practise with three quarters, transfer with two thirds, then retrieve the scaling rule.';
const voiceProvider = process.argv.includes('--piper') ? 'piper' : 'qwentts';
const brief = normalizeBrief({ text, targetSeconds: 180, provider: 'local', voiceProvider, avatar: 'mira', generationVersion: 'classic', footage: 'none' });
const lesson = {
  title: 'Same amount, different fraction', audience: 'Children aged 9–10',
  curriculum: { requested: text, resolved: 'Equivalent fractions using equal-sized fraction bars and multiplicative reasoning.', warnings: ['Authored test lesson; curriculum mapping needs educator confirmation.'], sources: [] },
  objectives: [
    { id: 'equal-wholes', text: 'Explain why equivalent fractions must refer to the same-sized whole and equal parts.' },
    { id: 'repartition', text: 'Explain that repartitioning every part by the same factor preserves the shaded amount.' },
    { id: 'transfer', text: 'Identify and justify an equivalent fraction in a new example.' },
  ],
  prerequisites: ['Recognise numerator and denominator', 'Interpret a fraction bar', 'Understand equal parts'],
  concept: { hook: 'Can one half and two fourths look different but still name the same amount?', analogy: 'It is like cutting the same sandwich into more pieces without adding or removing food.', arc: 'Predict, preserve the whole, repartition, contrast a misconception, practise, transfer and retrieve.' },
  scenes: [
    { id:'hook', beat:'hook', title:'Fold one strip. Can its name change?', objectiveIds:['equal-wholes'], pauseSeconds:4, questionId:null, mathClaims:[], narration:'Imagine this is one paper strip. Fold it into two equal parts and shade one half. Now keep the shaded amount exactly where it is, and fold each half once more. Make a prediction. Did the amount change, or only its fraction name?', visual:{kind:'fraction-bars',fraction:'1/2',equivalent:'2/4',label:'One paper strip; the same shaded length'} },
    { id:'equal-parts', beat:'concept', title:'First protect the whole', objectiveIds:['equal-wholes'], pauseSeconds:1, questionId:null, mathClaims:[], narration:'Before comparing fractions, protect two conditions. The wholes must be the same size, and every part inside each whole must be equal. Otherwise, counting shaded pieces can mislead us.', visual:{kind:'steps',items:['Same-sized whole','Equal parts','Compare shaded amount'],label:'A fair fraction comparison'} },
    { id:'repartition-half', beat:'example', title:'Repartition without changing the amount', objectiveIds:['repartition'], pauseSeconds:2, questionId:null, mathClaims:[{left:'1/2',right:'2/4'}], narration:'Start with one half. Split every half into two equal pieces. The same whole now has four equal parts, and the shaded half contains two of them. No shaded area was added or removed. One half equals two fourths.', visual:{kind:'fraction-bars',fraction:'1/2',equivalent:'2/4',label:'Each half is split into two equal pieces'} },
    { id:'repartition-thirds', beat:'example', title:'The same reasoning works again', objectiveIds:['repartition','transfer'], pauseSeconds:2, questionId:null, mathClaims:[{left:'2/3',right:'4/6'}], narration:'Now begin with two thirds. Split every third into two equal pieces. Three parts become six, and the two shaded parts become four. Two thirds equals four sixths because the shaded amount stayed fixed.', visual:{kind:'fraction-bars',fraction:'2/3',equivalent:'4/6',label:'Every third is split by the same factor'} },
    { id:'denominator-trap', beat:'misconception', title:'Changing only the denominator changes the value', objectiveIds:['equal-wholes','repartition'], pauseSeconds:2, questionId:null, mathClaims:[], narration:'A tempting mistake is to keep three shaded pieces but change fourths into eighths. Eighths are smaller pieces. Three eighths covers less of the same whole than three quarters. To preserve the amount, both numbers must scale together.', visual:{kind:'comparison',left:'3/4',right:'3/8',leftLabel:'three larger fourths',rightLabel:'three smaller eighths'} },
    { id:'practice', beat:'question', title:'Guided practice', objectiveIds:['equal-wholes','repartition','transfer'], pauseSeconds:8, questionId:'practice-choice', mathClaims:[], narration:'Which fraction is equivalent to three quarters: three eighths, six eighths, or four fifths? Choose one, then explain what happened to both the numerator and denominator.', visual:{kind:'recap',items:['3/8','6/8','4/5'],label:'Choose and explain'} },
    { id:'practice-answer', beat:'answer', title:'Six eighths preserves the amount', objectiveIds:['equal-wholes','repartition','transfer'], pauseSeconds:1, questionId:'practice-choice', mathClaims:[{left:'3/4',right:'6/8'}], narration:'Six eighths is equivalent to three quarters. Every fourth was split into two, so both the shaded count and the total count doubled. The whole and shaded amount stayed unchanged.', visual:{kind:'fraction-bars',fraction:'3/4',equivalent:'6/8',label:'Three fourths equals six eighths'} },
    { id:'transfer-question', beat:'question', title:'Transfer to a new fraction', objectiveIds:['equal-wholes','repartition','transfer'], pauseSeconds:8, questionId:'transfer-choice', mathClaims:[], narration:'Now transfer the idea. Which fraction is equivalent to two thirds: two sixths, three fourths, or four sixths? Choose one and justify it using the same whole and shaded area.', visual:{kind:'recap',items:['2/6','3/4','4/6'],label:'New example; same reasoning'} },
    { id:'transfer-answer', beat:'answer', title:'Four sixths is equivalent', objectiveIds:['equal-wholes','repartition','transfer'], pauseSeconds:1, questionId:'transfer-choice', mathClaims:[{left:'2/3',right:'4/6'}], narration:'Four sixths is equivalent to two thirds. Each third was split into two equal pieces. Two shaded thirds became four shaded sixths without changing the amount.', visual:{kind:'fraction-bars',fraction:'2/3',equivalent:'4/6',label:'Two thirds equals four sixths'} },
    { id:'retrieval', beat:'recap', title:'Retrieve the rule', objectiveIds:['equal-wholes','repartition','transfer'], pauseSeconds:2, questionId:null, mathClaims:[], narration:'Say the rule from memory. Keep the same whole and the same shaded amount. To rename an equivalent fraction, multiply the numerator and denominator by the same factor. Tomorrow, test the rule with three fifths and six tenths.', visual:{kind:'recap',items:['Same whole','Same shaded amount','Scale both numbers together','Return tomorrow: 3/5 and 6/10'],label:'Explain, do, check, retrieve'} },
  ],
  quality: { reviewed: false, warnings: ['Authored benchmark generated from the KooBits-informed teaching contract; not educator-approved or child-tested.'] },
};

const directory = resolve('.fair-video', `fraction-teaching-test-${voiceProvider}-${randomUUID()}`);
await mkdir(directory, { recursive: true });
console.log(`Output: ${directory}`);
const result = await fairRenderLesson(lesson, brief, directory, { origin:'authored', onProgress:event=>console.log(`${event.progress ?? 0}% ${event.message}`) });
console.log(JSON.stringify({ projectDir:result.projectDir, report:result.report }, null, 2));

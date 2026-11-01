import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCues, cuesFromWords, mouthAt, pipSVG } from '../public/pip-rig.mjs';
test('mouth timing closes in silence, after playback and on backward seeks',()=>{
 const cues=validateCues([{start:.5,end:1,value:'MBP'},{start:1.2,end:2,value:'O'}]);
 for(const [t,value] of [[0,'rest'],[.5,'MBP'],[1,'rest'],[1.3,'O'],[2,'rest'],[.7,'MBP']])assert.equal(mouthAt(cues,t),value);
});
test('cue imports reject malformed, unknown and overlapping timing',()=>{
 for(const cues of [null,[{start:0,end:1,value:'bad'}],[{start:0,end:NaN,value:'O'}],[{start:2,end:1,value:'O'}],[{start:0,end:2,value:'O'},{start:1,end:3,value:'AI'}]])assert.throws(()=>validateCues(cues));
});
test('aligned words retain measured gaps and reject malformed words',()=>{
 const cues=cuesFromWords([{text:'Pip',startSeconds:.2,endSeconds:.8},{text:'wow',startSeconds:1,endSeconds:1.3}]);
 assert.equal(cues[0].value,'MBP');assert.equal(cues[0].start,.2);assert.equal(cues.at(-1).end,1.3);assert.equal(mouthAt(cues,.9),'rest');
 assert.throws(()=>cuesFromWords([{text:'bad',startSeconds:1,endSeconds:.1}]));
 assert.match(pipSVG(),/data-part="right-arm"/);
});

import { fairEscape as esc } from './utils.mjs';

const names = ['ones', 'tens'];
const colors = ['#e8a42c', '#168a7b'];
const inks = ['#8b570e', '#146559'];
const numberWords = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const wordFor = n => n <= 10 ? numberWords[n] : numberWords[9+n/10];
const clean = text => text.toLowerCase().replace(/[^a-z]/g,'');

// A spoken count is optional. If absent, the animation uses the available
// explanation interval, never invents extra speech or claims forced alignment.
export function fairCountingTimes(track, values, from, to) {
  const available = (track.words || []).filter(w=>w.startSeconds>=from-.02 && w.startSeconds<to).map(w=>({...w,token:clean(w.text)}));
  const expected = values.map(wordFor);
  const contiguous = available.findIndex((_,i)=>expected.every((value,j)=>available[i+j]?.token===value));
  if(contiguous>=0) return available.slice(contiguous,contiguous+values.length).map(w=>w.startSeconds);
  let index=0; const found=[];
  for(const expectedWord of expected){ const i=available.findIndex((w,n)=>n>=index&&w.token===expectedWord); if(i<0){found.length=0;break;}found.push(available[i].startSeconds);index=i+1; }
  return found.length===values.length ? found : values.map((_,i)=>from+(to-from)*(i+.25)/Math.max(1,values.length));
}

function cube(id,x,y,unit,place=0,opacity=1){
  const h=unit*(place?10:1),d=Math.max(3,unit*.17);
  return `<g transform="translate(${x} ${y})"><g id="${id}" opacity="${opacity}"><path d="M0 0L${d} -${d}H${unit+d}L${unit} 0Z" fill="${place?'#64c2b4':'#ffdb84'}"/><path d="M${unit} 0L${unit+d} -${d}V${h-d}L${unit} ${h}Z" fill="${place?'#106a5d':'#bd7a14'}"/><rect width="${unit}" height="${h}" rx="2" fill="${colors[place]}" stroke="${inks[place]}" stroke-width="1.2"/>${place?Array.from({length:9},(_,i)=>`<path d="M0 ${(i+1)*unit}H${unit}" stroke="#0c6256" stroke-opacity=".6"/>`).join(''):''}</g></g>`;
}
const reveal=(id,at,duration=.3)=>`tl.fromTo('#${id}',{opacity:0},{opacity:1,duration:${duration},ease:'power2.out'},${at});`;
const set=(id,opacity,at)=>`tl.set('#${id}',{opacity:${opacity}},${at});`;

export function fairDiscoveryAnimation(scene,track,prefix,{state,cues}){
  const v=scene.visual, [start,transform,notation]=cues.map(c=>c.at+.35), gap=notation-transform;
  const isGroup=['group','trade'].includes(v.mode), count=state.initial[0], tens=state.final[1], ones=state.final[0];
  const unit=tens>5?20:28, column={1:350,0:740}, selected=state.place;
  const pos=(p,i)=>p ? [350-(tens-1)*(tens>5?17:30)+i*(tens>5?34:60),105] : [680+i%3*54,164+Math.floor(i/3)*54];
  let objects='',overlay='',code='', sequence=0;
  const proof=[];
  const block=(p,x,y,alpha=1)=>{const id=`${prefix}-block-${sequence++}`;objects+=cube(id,x,y,unit,p,alpha);return id;};
  const label=(id,x,y,text,size=28,color='#17344e',alpha=0)=>`<text id="${id}" x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${color}" opacity="${alpha}">${esc(String(text))}</text>`;

  if(isGroup){
    const bundles=Math.floor(count/10), existing=state.initial[1];
    const columns=count>30?10:count>10?5:10, rowWidth=count>10?300:660;
    const sx=count>10?580:160, sy=130, rowStep=Math.min(58,250/Math.max(1,Math.ceil(count/columns)-1));
    const originals=[];
    for(let i=0;i<existing;i++){const [x,y]=pos(1,i);block(1,x,y);}
    for(let i=0;i<count;i++){
      const x=sx+i%columns*(rowWidth/columns),y=sy+Math.floor(i/columns)*rowStep;
      originals.push({id:block(0,x,y),x,y});
    }
    // Exactly ten cubes remain visible while joining. A rod is revealed only
    // after the last cube reaches its matching unit cell.
    const phase=Math.max(.01,gap*.86/Math.max(1,bundles));
    for(let b=0;b<bundles;b++){
      const begin=transform+b*phase, moving=begin+phase*.12, duration=Math.min(1.25,phase*.45), stagger=phase*.025;
      const finish=moving+9*stagger+duration, [x,y]=pos(1,existing+b);
      const region=`${prefix}-region-${b}`, first=originals[b*10], last=originals[b*10+9];
      overlay+=`<rect id="${region}" x="${Math.min(first.x,last.x)-13}" y="${first.y-13}" width="${rowWidth-rowWidth/columns+unit+26}" height="${last.y-first.y+unit+26}" rx="16" fill="#fff1bc" stroke="#d28b19" stroke-width="2.5" opacity="0"/>`;
      code+=reveal(region,begin,Math.min(.25,phase*.1))+`tl.to('#${region}',{opacity:0,duration:${Math.min(.3,phase*.1)}},${moving});`;
      for(let j=0;j<10;j++){
        const o=originals[b*10+j];
        code+=`tl.fromTo('#${o.id}',{x:0,y:0},{x:${x-o.x},y:${y+j*unit-o.y},duration:${duration},ease:'power2.inOut'},${moving+j*stagger});`;
        code+=`tl.to('#${o.id}',{opacity:0,duration:${Math.min(.15,phase*.05)}},${finish});`;
      }
      const rod=block(1,x,y,0);code+=reveal(rod,finish,Math.min(.15,phase*.05));
      overlay+=label(`${prefix}-rod-value-${b}`,x+unit/2,410,'10',24,inks[1]);code+=reveal(`${prefix}-rod-value-${b}`,finish,.2);
      proof.push({kind:'bundle',at:begin+.25,settledAt:finish+.2,units:10});
    }
    for(let i=bundles*10;i<count;i++){
      const o=originals[i], [x,y]=pos(0,i-bundles*10);
      code+=`tl.fromTo('#${o.id}',{x:0,y:0},{x:${x-o.x},y:${y-o.y},duration:${Math.min(.7,gap*.1)},ease:'power2.inOut'},${transform+gap*.82});`;
    }
    if(count===10 && !existing){
      code+=set(originals.map(o=>o.id).join(',#'),.28,0);
      const times=fairCountingTimes(track,Array.from({length:10},(_,i)=>i+1),cues[0].at,cues[1].at);
      let prior=null;
      times.forEach((time,i)=>{
        const o=originals[i],id=`${prefix}-count-${i}`;
        overlay+=label(id,500,49,`${i+1} ${i?'cubes':'cube'}`,44)+label(`${prefix}-count-label-${i}`,o.x+unit/2,o.y+unit+32,String(i+1),23);
        code+=reveal(`${prefix}-count-label-${i}`,time+.35,.1)+set(`${prefix}-count-label-${i}`,0,transform)+set(o.id,1,time+.35);
        if(prior)code+=set(prior,0,time+.35);
        code+=set(id,1,time+.35)+`tl.fromTo('#${o.id}',{y:0},{y:-13,duration:.22,repeat:1,yoyo:true,ease:'sine.inOut'},${time+.35});`;
        prior=id;
      });
      if(prior)code+=set(prior,0,transform);
    }else{
      overlay+=label(`${prefix}-loose`,500,49,`${v.number} in all`,39);
      code+=reveal(`${prefix}-loose`,start)+set(`${prefix}-loose`,0,transform);
    }
  }else{
    const ids=[[],[]];
    for(let p=0;p<2;p++)for(let i=0;i<state.initial[p];i++){
      const [x,y]=pos(p,i);ids[p].push(block(p,x,y));
    }
    if(v.mode==='expanded'){
      const values=ids[selected].map((_,i)=>(i+1)*10**selected), times=fairCountingTimes(track,values,cues[1].at,cues[2].at);
      if(ids[1-selected].length) code+=`tl.to('${ids[1-selected].map(id=>'#'+id).join(',')}',{opacity:.3,duration:.5},${transform});`;
      let previous=null;
      times.forEach((time,i)=>{
        const id=`${prefix}-count-value-${i}`, [x,y]=pos(selected,i);
        overlay+=label(id,column[selected],429,String(values[i]),45,inks[selected]);
        if(previous)code+=set(previous,0,time+.35);
        code+=reveal(id,time+.35,.2)+`tl.fromTo('#${ids[selected][i]}',{y:0},{y:-12,duration:.3,repeat:1,yoyo:true,ease:'sine.inOut'},${time+.35});`;
        if(!selected) { overlay+=label(`${prefix}-unit-value-${i}`,x+unit/2,selected?96:y+unit+27,String(10**selected),21,inks[selected]);code+=reveal(`${prefix}-unit-value-${i}`,time+.35,.2); }
        previous=id; proof.push({kind:'count-place-value',at:time+.35,value:values[i]});
      });
      if(previous)code+=set(previous,0,notation);
    }
    if(v.mode==='zero'){
      const x=column[selected]-92;
      overlay+=`<rect id="${prefix}-empty" x="${x}" y="125" width="184" height="224" rx="23" fill="#fff5d8" stroke="#b18d49" stroke-width="3" stroke-dasharray="10 8" opacity="0"/>`;
      overlay+=label(`${prefix}-empty-label`,column[selected],390,`No ${names[selected]}`,30,inks[selected]);
      code+=reveal(`${prefix}-empty`,transform,.5)+reveal(`${prefix}-empty-label`,transform,.5);
    }
  }
  const digitId=`${prefix}-digits`, lineId=`${prefix}-connection`, equationId=`${prefix}-notation`;
  const showDigits=isGroup?notation:start;
  let header='';
  for(const p of [1,0]){
    header+=`<g id="${prefix}-place-${p}" opacity="0"><text x="${column[p]}" y="27" text-anchor="middle" font-size="19" font-weight="800" fill="${inks[p]}" letter-spacing="3">${names[p].toUpperCase()}</text><text x="${column[p]}" y="82" text-anchor="middle" font-size="56" font-weight="850" fill="${inks[p]}">${state.final[p]}</text></g>`;
    code+=reveal(`${prefix}-place-${p}`,showDigits,.35);
  }
  const connectX=column[selected], selectedCount=state.final[selected], each=10**selected;
  let equation=isGroup?`${tens} ${tens===1?'ten':'tens'} + ${ones} ${ones===1?'one':'ones'} = ${v.number}`:`${selectedCount} × ${each} = ${selectedCount*each}`;
  if(isGroup&&v.number===10)equation='10 ones = 1 ten';
  if(v.mode==='zero')equation=`${v.number}: zero holds the ${names[selected]} place`;
  if(scene.beat==='recap')equation=`${tens*10} + ${ones} = ${v.number}`;
  const selectedXs=Array.from({length:Math.max(1,selectedCount)},(_,i)=>pos(selected,i)[0]);
  const firstSelected=Math.min(...selectedXs)-10,lastSelected=Math.max(...selectedXs)+unit+10;
  const connection=!isGroup?`<path id="${lineId}" d="M${firstSelected} 92 H${lastSelected} M${connectX} 92 V115" stroke="${colors[selected]}" stroke-width="5" stroke-linecap="round" opacity="0"/>`:'';
  if(!isGroup)code+=reveal(lineId,transform,.35);
  code+=reveal(equationId,notation,.4)+reveal(`${prefix}-objects`,scene.continueObjects?0:start,scene.continueObjects?0:.35)+reveal(`${prefix}-meaning`,isGroup?transform:notation,.3);
  const explanation=isGroup?'Same cubes. New groups.':v.mode==='zero'?'An empty place still matters.':`${selectedCount} ${names[selected]} → ${selectedCount*each}`;
  return { html:`<div class="discovery-stage"><svg viewBox="0 0 1000 490" role="img" aria-label="${esc(v.label)}"><g id="${digitId}">${header}</g><g>${overlay}</g><g id="${prefix}-objects" opacity="0">${objects}</g>${connection}<g id="${equationId}" opacity="0"><rect x="140" y="437" width="730" height="50" rx="20" fill="#17344e"/><text x="505" y="473" text-anchor="middle" fill="#fff" font-size="31" font-weight="800">${esc(equation)}</text></g></svg><div class="discovery-meaning" id="${prefix}-meaning" style="opacity:0">${esc(explanation)}</div></div>`, code,cues,state,proof,closeup:true };
}

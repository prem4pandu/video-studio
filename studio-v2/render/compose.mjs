import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const safeId = (s, i) => `scene-${i}-${String(s).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)}`;
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
const q = v => JSON.stringify(v).replace(/</g,'\\u003c');
const stamp = html => html.replace(/<(div|audio|svg|g|text|h1|p|span|rect|path|circle)\b([^>]*)>/g, (all,tag,attrs) => {
 const id=attrs.match(/(?:^|\s)id="([^"]+)"/)?.[1];
 return !id||attrs.includes('data-hf-id')?all:`<${tag} data-hf-id="v2-${id}"${attrs}>`;
});
const palettes = {
 editorial:{background:'#fafcfb',ink:'#153c3a',muted:'#43615e',accent:'#0a766b',second:'#ac4e20',soft:'#dcece6',accentInk:'#ffffff'},
 playful:{background:'#fff8e9',ink:'#233c36',muted:'#53645b',accent:'#147763',second:'#a84624',soft:'#f1dfae',accentInk:'#ffffff'},
 bold:{background:'#f4efea',ink:'#282c42',muted:'#50546c',accent:'#433a8b',second:'#b44035',soft:'#ded9f2',accentInk:'#ffffff'},
};

export function captionChunks(scene, track, maxChars=48) {
 const tokens=scene.narration.trim().split(/\s+/); let words=track.words;
 const equal=Array.isArray(words)&&words.length===tokens.length&&words.every((w,i)=>w.text===tokens[i]&&Number.isFinite(w.startSeconds)&&Number.isFinite(w.endSeconds)&&w.startSeconds>=0&&w.endSeconds>=w.startSeconds&&w.endSeconds<=track.durationSeconds+.1&&(i===0||w.startSeconds>=words[i-1].startSeconds));
 if(!equal) words=tokens.map((text,i)=>({text,startSeconds:i/tokens.length*track.durationSeconds,endSeconds:(i+1)/tokens.length*track.durationSeconds}));
 const chunks=[]; let current=[];
 for(const word of words){
  if(current.length&&[...current,word].map(w=>w.text).join(' ').length>maxChars){chunks.push(current);current=[];}
  current.push(word);if(/[.!?]$/.test(word.text)){chunks.push(current);current=[];}
 }
 if(current.length)chunks.push(current);
 return chunks.map((chunk,i)=>({text:chunk.map(w=>w.text).join(' '),start:.35+chunk[0].startSeconds,end:.35+Math.min(track.durationSeconds,chunks[i+1]?.[0]?.startSeconds??track.durationSeconds),timingSource:equal?(track.wordTimingSource||'provided-word-timing'):'estimated'}));
}
function labelTime(label,track,index,count){
 const norm=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const tokens=norm(label).split(' '); const words=(track.words||[]).map(w=>norm(w.text));
 if(tokens.length&&tokens[0])for(let i=0;i<words.length;i++)if(tokens.every((w,j)=>words[i+j]===w))return {at:.35+track.words[i].startSeconds,source:track.wordTimingSource||'provided-word-timing'};
 return {at:.35+(index+.3)/(count+.5)*Math.max(1,track.durationSeconds-1),source:'estimated-semantic-position'};
}
function lines(text,max=23){
 const out=[];let line='';
 for(const word of String(text).split(/\s+/)){if(line&&(line+' '+word).length>max){out.push(line);line=word;}else line+=(line?' ':'')+word;}
 if(line)out.push(line);return out;
}
function svgText(text,x,y,{size=38,color,anchor='middle',weight=700,max=23,lineHeight=1.18,id=''}={}){
 const chunks=lines(text,max);
 return `<text ${id?`id="${id}"`:''} x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-weight="${weight}">${chunks.map((s,i)=>`<tspan x="${x}" dy="${i?size*lineHeight:0}">${escape(s)}</tspan>`).join('')}</text>`;
}
export function plantVisualState(scene){
 if(['seed','growing','wilt','care','storm','bloom'].includes(scene.visualState))return scene.visualState;
 // A desired future flower is not an achieved bloom: scene titles establish state.
 const title=String(scene.title||'').toLowerCase();
 if(/\b(bloom\w*|flowering)\b/.test(title))return 'bloom';
 if(/\b(wilt\w*|too much sun|hot sun|heat)\b/.test(`${title} ${scene.narration||''}`))return 'wilt';
 if(/\b(storm\w*|rainstorm\w*|washed|flood\w*)\b/.test(title))return 'storm';
 if(/\b(gentle rain|soft rain|rain and shade)\b/.test(`${title} ${scene.narration||''}`))return 'care';
 if(/\b(gardener|care|cared|caring|water\w*|fresh soil|new soil)\b/.test(title))return 'care';
 if(/\b(seed\w*|dream\w*|start\w*|begin\w*|tiny)\b/.test(title))return 'seed';
 const text=`${scene.title||''} ${scene.narration||''}`.toLowerCase();
 if(/\b(seed|seedling)\b/.test(text)&&/\b(want\w*|dream\w*|wish\w*|hope\w*)\b/.test(text))return 'seed';
 if(/\b(bloom\w*|flower\w*|petal\w*)\b/.test(text))return 'bloom';
 if(/\b(storm\w*|rainstorm\w*|washed|flood\w*)\b/.test(text))return 'storm';
 if(/\b(gardener|care|cared|caring|water\w*|fresh soil|new soil)\b/.test(text))return 'care';
 if(/\b(seed\w*|dream\w*|start\w*|begin\w*|tiny)\b/.test(text))return 'seed';
 return 'growing';
}
function motifSvg(motif,p,state='growing',gentleRain=false,hotSun=false){
 switch(motif){
 case 'pizza':return `<g class="living" data-visual="whole-pizza"><circle r="174" fill="#bb803e"/><circle r="157" fill="#e7af42"/>${[[-75,-75],[45,-100],[100,10],[45,95],[-65,85],[-30,-5]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="18" fill="${p.second}"/>`).join('')}</g>`;
 case 'plant':{
  const soil=state==='storm'?135:105;
  const pot=`<path d="M-95 100 L95 100 L65 210 L-65 210 Z" fill="${p.second}"/><ellipse cx="0" cy="${soil}" rx="${state==='storm'?70:90}" ry="19" fill="#60452e"/>`;
  const sprout=state==='seed'?`<ellipse cx="0" cy="100" rx="22" ry="13" fill="#b98545"/><path d="M0 98 V38 M0 60 Q-50 18 -55 55 Q-25 80 0 60 M0 42 Q45 0 48 35 Q26 61 0 42" fill="${p.accent}" stroke="${p.accent}" stroke-width="8"/>`:state==='wilt'?`<path d="M0 105 Q-15 -85 65 -75 Q110 -70 110 -10" fill="none" stroke="${p.accent}" stroke-width="15" stroke-linecap="round"/><path d="M0 12 Q-90 -20 -75 65 Q-30 60 0 12 M50 -65 Q115 -65 125 10 Q70 10 50 -65" fill="${p.accent}"/>`:`<path d="M0 105 Q-10 -25 15 -130" fill="none" stroke="${p.accent}" stroke-width="15" stroke-linecap="round"/><path d="M0 15 C-125 35 -130 -90 -5 -55Z M5 -40 C125 -130 140 -5 5 5Z" fill="${p.accent}"/>`;
  const petals=state==='bloom'?`<g class="blossom" data-hf-id="plant-blossom" transform="translate(15 -135)">${Array.from({length:8},(_,i)=>`<ellipse cy="-48" rx="26" ry="43" transform="rotate(${i*45})" fill="#e0a533"/>`).join('')}<circle r="30" fill="${p.second}"/></g>`:'';
  const rain=state==='storm'||gentleRain?`<g class="rain" data-hf-id="plant-rain">${(gentleRain?[-90,0,90]:[-145,-75,0,75,145]).map((x,i)=>`<path d="M${x} ${-260+i%2*25} l${gentleRain?'-4 30':'-20 65'}" stroke="#387a99" stroke-width="${gentleRain?6:9}" stroke-linecap="round"/>`).join('')}</g>`:'';
  const care=state==='care'&&!gentleRain?`<g class="fresh-soil" data-hf-id="plant-fresh-soil">${[-55,-20,20,55].map((x,i)=>`<circle cx="${x}" cy="${50-i%2*25}" r="9" fill="#60452e"/>`).join('')}</g>${gentleRain?'':`<circle cx="145" cy="-180" r="42" fill="#e0a533"/>`}`:state==='wilt'&&hotSun?`<circle data-weather="hot-sun" cx="145" cy="-180" r="55" fill="#e0a533"/>`:'';
  return `<g data-plant-state="${state}">${pot}<g class="living" data-hf-id="plant-living">${sprout}${petals}</g>${rain}${care}</g>`;
 }
 case 'rocket':return `<g class="living"><path d="M0 -190 C-100 -100 -95 95 -55 145 L55 145 C95 95 100 -100 0 -190Z" fill="${p.accent}"/><circle cx="0" cy="-35" r="43" fill="${p.background}"/><path d="M-65 65 L-125 165 L-48 130 M65 65 L125 165 L48 130" fill="${p.second}"/><path d="M-32 150 Q0 270 32 150" fill="${p.second}"/></g>`;
 case 'planet':return `<g class="living"><circle r="130" fill="${p.accent}"/><path d="M-115 -45 Q-10 -95 112 -55 M-126 30 Q-10 -10 125 35 M-83 95 Q0 65 88 98" fill="none" stroke="${p.background}" stroke-opacity=".3" stroke-width="23"/><ellipse rx="205" ry="42" fill="none" stroke="${p.second}" stroke-width="18" transform="rotate(-22)"/></g>`;
 case 'lightbulb':return `<g class="living"><path d="M-60 90 C-60 20 -130 -5 -130 -95 A130 130 0 0 1 130 -95 C130 -5 60 20 60 90Z" fill="${p.soft}" stroke="${p.accent}" stroke-width="9"/><path d="M-50 100 L50 100 M-45 128 L45 128 M-32 155 L32 155" stroke="${p.accent}" stroke-width="15" stroke-linecap="round"/><path d="M0 -275 V-235 M-190 -200 L-155 -175 M190 -200 L155 -175" stroke="${p.second}" stroke-width="13" stroke-linecap="round"/></g>`;
 case 'wave':return `<g class="living">${[0,1,2].map(i=>`<path d="M-240 ${i*65-65} Q-120 ${i*65-180} 0 ${i*65-65} T240 ${i*65-65}" fill="none" stroke="${i===1?p.second:p.accent}" stroke-width="24" stroke-linecap="round"/>`).join('')}</g>`;
 default:return `<g class="living">${Array.from({length:6},(_,i)=>`<rect x="${(i%3)*88-125}" y="${Math.floor(i/3)*88-80}" width="76" height="76" rx="12" fill="${i%3===2?p.second:p.accent}"/>`).join('')}</g>`;
 }
}

function iconFor(text){
 const t=String(text).toLowerCase();
 if(/\b(sun|solar|heat\w*|warm\w*|energy|light)\b/.test(t))return 'sun';
 if(/\b(cloud\w*|condens\w*|vapou?r|fog|steam|sky)\b/.test(t))return 'cloud';
 if(/\b(rain\w*|precip\w*|snow|storm|drizzle|hail|sleet|shower)\b/.test(t))return 'rain';
 if(/\b(river|ocean|sea|lake|water|wave|collect\w*|stream|runoff|ground\w*|pool|flow)\b/.test(t))return 'wave';
 if(/\b(plant|leaf|leaves|seed\w*|grow\w*|bloom|flower|soil|root|tree|garden)\b/.test(t))return 'leaf';
 if(/\b(rocket|launch|space|planet|moon|star|orbit)\b/.test(t))return 'rocket';
 if(/\b(idea|think|brain|learn|question|why|how|know|understand)\b/.test(t))return 'bulb';
 if(/\b(chart|graph|data|percent|measure|number|count|sales|growth|stat)\b/.test(t))return 'chart';
 if(/\b(money|cost|price|sell|buy|pay|dollar|income|budget|rupee|save)\b/.test(t))return 'coin';
 if(/\b(time|clock|hour|minute|schedule|deadline|fast|slow|long)\b/.test(t))return 'clock';
 if(/\b(people|person|team|user|student|kid|child|audience|customer|teacher|human|class)\b/.test(t))return 'person';
 if(/\b(check|done|complete|finish|success|win|goal|target|answer|result|correct)\b/.test(t))return 'check';
 if(/\b(warn|danger|risk|alert|problem|fail|error|wrong|avoid)\b/.test(t))return 'warn';
 if(/\b(gear|setting|process|engine|machine|mechan|system|work|build)\b/.test(t))return 'gear';
 if(/\b(lock|secure|safe|protect|privacy|key|password)\b/.test(t))return 'lock';
 if(/\b(heart|love|health|fit|body|life|feel)\b/.test(t))return 'heart';
 if(/\b(food|eat|cook|meal|fruit|pizza|crop|farm|hungry)\b/.test(t))return 'food';
 if(/\b(home|house|build\w*|city|town|village|place|land)\b/.test(t))return 'home';
 return 'dot';
}
function iconSvg(name,p){
 const A=p.accent,S=p.second;
 switch(name){
 case 'sun':return `<circle r="19" fill="#e0a533"/>`+Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<path d="M${(Math.cos(a)*29).toFixed(1)} ${(Math.sin(a)*29).toFixed(1)} l${(Math.cos(a)*10).toFixed(1)} ${(Math.sin(a)*10).toFixed(1)}" stroke="#e0a533" stroke-width="6" stroke-linecap="round"/>`}).join('');
 case 'cloud':return `<g fill="${A}"><ellipse cx="-11" cy="7" rx="17" ry="13"/><ellipse cx="9" cy="0" rx="20" ry="16"/><rect x="-31" y="3" width="62" height="16" rx="8"/></g>`;
 case 'rain':return `<g fill="${A}"><ellipse cx="-10" cy="-8" rx="15" ry="11"/><ellipse cx="8" cy="-14" rx="17" ry="14"/><rect x="-26" y="-10" width="52" height="13" rx="6"/></g><path d="M-15 16 l-5 15 M0 18 l-5 15 M15 16 l-5 15" stroke="#387a99" stroke-width="7" stroke-linecap="round"/>`;
 case 'wave':return `<path d="M-30 0 Q-15 -18 0 0 T30 0 M-30 18 Q-15 0 0 18 T30 18" fill="none" stroke="${A}" stroke-width="8" stroke-linecap="round"/>`;
 case 'leaf':return `<path d="M2 28 Q-28 8 -4 -24 Q26 -14 10 24 Z" fill="${A}"/><path d="M2 28 Q0 4 8 -14" fill="none" stroke="${p.background}" stroke-width="4"/>`;
 case 'rocket':return `<g transform="scale(.18)"><path d="M0 -190 C-100 -100 -95 95 -55 145 L55 145 C95 95 100 -100 0 -190Z" fill="${A}"/><circle cx="0" cy="-35" r="43" fill="${p.background}"/><path d="M-65 65 L-125 165 L-48 130 M65 65 L125 165 L48 130" fill="${S}"/><path d="M-32 150 Q0 270 32 150" fill="${S}"/></g>`;
 case 'bulb':return `<g transform="scale(.22)"><path d="M-60 90 C-60 20 -130 -5 -130 -95 A130 130 0 0 1 130 -95 C130 -5 60 20 60 90Z" fill="${p.soft}" stroke="${A}" stroke-width="9"/><path d="M-50 100 L50 100 M-45 128 L45 128 M-32 155 L32 155" stroke="${A}" stroke-width="15" stroke-linecap="round"/></g>`;
 case 'chart':return `<path d="M-28 -26 V24 H30" fill="none" stroke="${p.muted}" stroke-width="6" stroke-linecap="round"/>${[-20,-2,16].map((x,i)=>`<rect x="${x}" y="${14-i*14}" width="14" height="${10+i*14}" rx="3" fill="${i===2?S:A}"/>`).join('')}`;
 case 'coin':return `<circle r="26" fill="#e0a533"/><circle r="19" fill="none" stroke="${p.background}" stroke-width="4" stroke-dasharray="5 5"/><path d="M-8 -8 L8 8 M-8 8 L8 -8" stroke="${p.background}" stroke-width="5" stroke-linecap="round"/>`;
 case 'clock':return `<circle r="26" fill="none" stroke="${A}" stroke-width="7"/><path d="M0 -14 V2 L12 10" fill="none" stroke="${A}" stroke-width="7" stroke-linecap="round"/>`;
 case 'person':return `<circle cy="-16" r="13" fill="${A}"/><path d="M-22 30 Q-22 2 0 2 Q22 2 22 30Z" fill="${A}"/>`;
 case 'check':return `<path d="M-20 2 l14 16 26 -34" fill="none" stroke="${A}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
 case 'warn':return `<path d="M0 -26 L28 22 H-28Z" fill="#d29b12"/><path d="M0 -12 V6 M0 12 V14" stroke="${p.background}" stroke-width="6" stroke-linecap="round"/>`;
 case 'gear':return `<circle r="15" fill="none" stroke="${A}" stroke-width="7"/>`+Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return `<path d="M${(Math.cos(a)*22).toFixed(1)} ${(Math.sin(a)*22).toFixed(1)} l${(Math.cos(a)*9).toFixed(1)} ${(Math.sin(a)*9).toFixed(1)}" stroke="${A}" stroke-width="8" stroke-linecap="round"/>`}).join('');
 case 'lock':return `<rect x="-20" y="-4" width="40" height="30" rx="7" fill="${A}"/><path d="M-11 -4 v-9 a11 11 0 0 1 22 0 v9" fill="none" stroke="${A}" stroke-width="7"/>`;
 case 'heart':return `<path d="M0 24 C-30 4 -30 -18 -14 -18 C-6 -18 -2 -12 0 -8 C2 -12 6 -18 14 -18 C30 -18 30 4 0 24Z" fill="${S}"/>`;
 case 'food':return `<circle r="22" fill="${S}"/><path d="M0 -22 Q4 -34 16 -34 Q12 -24 0 -22" fill="${A}"/>`;
 case 'home':return `<path d="M-26 6 L0 -20 L26 6 V26 H-26Z" fill="${A}"/><rect x="-7" y="8" width="14" height="18" fill="${p.background}"/>`;
 default:return `<circle r="9" fill="${A}"/>`;
 }
}
function backdropFor(scene){
 const t=`${scene.title||''} ${scene.narration||''} ${(scene.labels||[]).join(' ')}`.toLowerCase();
 if(/\b(water cycle|evaporat|condensat|precipitat|ocean|rain|cloud|river)\b/.test(t))return 'water';
 if(/\b(solar system|planet|space|orbit|moon|rocket|star)\b/.test(t))return 'space';
 return 'none';
}
function backdropSvg(kind,W,H,p){
 if(kind==='water'){
  const rays=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<path d="M${W-170+Math.cos(a)*62} ${74+Math.sin(a)*62} l${Math.cos(a)*20} ${Math.sin(a)*20}" stroke="#e0a533" stroke-width="9" stroke-linecap="round" opacity=".55"/>`}).join('');
  const clouds=[[130,66,1],[330,110,.7],[W-400,52,.8]].map(([x,y,s])=>`<g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff" opacity=".95" stroke="${p.soft}" stroke-width="5"><ellipse cx="-20" cy="10" rx="30" ry="20"/><ellipse cx="14" cy="-2" rx="36" ry="27"/><rect x="-56" y="4" width="110" height="28" rx="14"/></g>`).join('');
  const oceanY=H-118;
  const waves=`<path d="M0 ${oceanY} Q80 ${oceanY-34} 160 ${oceanY} T320 ${oceanY} T480 ${oceanY} T640 ${oceanY} T800 ${oceanY} T960 ${oceanY} T1120 ${oceanY} T1280 ${oceanY} T1440 ${oceanY} V${H} H0Z" fill="#cfe6ea"/><path d="M0 ${oceanY+42} Q80 ${oceanY+16} 160 ${oceanY+42} T320 ${oceanY+42} T480 ${oceanY+42} T640 ${oceanY+42} T800 ${oceanY+42} T960 ${oceanY+42} T1120 ${oceanY+42} T1280 ${oceanY+42} T1440 ${oceanY+42} V${H} H0Z" fill="#a9cfd8" opacity=".8"/>`;
  return `<g data-backdrop="water"><rect x="0" y="0" width="${W}" height="${oceanY+30}" fill="#e9f3f5" opacity=".55"/>${rays}<circle cx="${W-170}" cy="74" r="48" fill="#e0a533" opacity=".75"/>${clouds}${waves}</g>`;
 }
 if(kind==='space')return `<g data-backdrop="space"><rect x="0" y="0" width="${W}" height="${H}" fill="#eef0f6" opacity=".5"/>${[[80,60],[W-100,80],[150,H-60],[W-160,H-90],[W/2,H-40],[W*.3,90],[W*.8,H-70]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${8-i%4}" fill="${p.second}" opacity=".5"/>`).join('')}</g>`;
 return '';
}

function sceneArt(scene,track,id,p,portrait){
 const W=portrait?800:1400,H=portrait?690:490,center=W/2;
 let shapes='',animations='';const cues=[];const labels=(scene.labels||[]).filter(Boolean).slice(0,4);
 const add=(s)=>shapes+=s;
 if(['flow','cycle','orbit','comparison'].includes(scene.kind))add(backdropSvg(backdropFor(scene),W,H,p));
 const timed=(key,label,index,count,extra={})=>{
  const timing=labelTime(label,track,index,count);
  // Establish the subject immediately; subsequent facts still follow the voice.
  const openingContext=index===0;
  const at=openingContext?0:Math.min(timing.at,.35+track.durationSeconds-.3);
  animations+=`tl.fromTo(${q('#'+id+'-'+key)},{opacity:0,y:18},{opacity:1,y:0,duration:motion(${openingContext?.2:.42}),ease:'power2.out'},${at.toFixed(4)});`;
  cues.push({target:`${id}-${key}`,label,at,timingSource:openingContext?'opening-context-reveal':timing.source,...(openingContext?{spokenCueAt:timing.at,spokenCueTimingSource:timing.source}:{}),...extra});return at;
 };
 const text=(value,x,y,opts={})=>svgText(value,x,y,{color:p.ink,...opts});
 const wrapGroup=(key,content)=>`<g id="${id}-${key}">${content}</g>`;
 if(scene.kind==='fraction'){
  const [n,d]=scene.numbers||[]; if(!Number.isInteger(n)||!Number.isInteger(d)||d<1||d>12||n<0||n>d)throw new Error(`Invalid fraction in ${scene.id}`);
  const pizza=/\bpizza\b/i.test(`${scene.title} ${scene.narration}`);
  const barW=portrait?680:1080,x=(W-barW)/2,y=portrait?240:160,cell=barW/d;
  const cx=portrait?center:420,cy=portrait?300:230,r=portrait?175:165;
  if(pizza)add(`<circle data-visual="pizza" cx="${cx}" cy="${cy}" r="${r+12}" fill="#bb803e"/>`);
  else add(`<rect x="${x}" y="${y}" width="${barW}" height="120" rx="4" fill="${p.soft}"/>`);
  for(let i=0;i<d;i++){
   const key=`part-${i}`;
   if(pizza){
    const a=i*2*Math.PI/d-Math.PI/2,b=(i+1)*2*Math.PI/d-Math.PI/2;
    const attrs=`data-unit="fraction" data-selected="${i<n}" data-sector-angle="${360/d}" fill="${i<n?'#e7af42':p.soft}" stroke="${p.background}" stroke-width="5"`;
    const shape=d===1?`<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`:`<path d="M${cx} ${cy} L${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)} A${r} ${r} 0 ${d===1?1:0} 1 ${cx+r*Math.cos(b)} ${cy+r*Math.sin(b)} Z" ${attrs}/>`;
    const topping=i<n?`<circle cx="${cx+r*.62*Math.cos((a+b)/2)}" cy="${cy+r*.62*Math.sin((a+b)/2)}" r="${Math.min(16,60/d)}" fill="${p.second}"/>`:'';
    add(wrapGroup(key,shape+topping));
   }else add(wrapGroup(key,`<rect data-unit="fraction" data-selected="${i<n}" x="${x+i*cell}" y="${y}" width="${cell}" height="120" fill="${i<n?p.accent:p.soft}" stroke="${p.background}" stroke-width="5"/>`));
   timed(key,String(i+1),i,d,{role:'equal-part',numerator:n,denominator:d});
  }
  add(text(`${n} / ${d}`,pizza&&!portrait?1000:center,pizza?(portrait?90:250):y-45,{size:86}));
  const label=`${n} of ${d} equal parts`;
  add(text(label,center,pizza?(portrait?570:465):y+205,{size:40,max:portrait?25:42,id:`${id}-meaning`}));timed('meaning',label,d,d+1);
 }else if(scene.kind==='base-ten'){
  const n=scene.numbers?.[0];if(!Number.isInteger(n)||n<1||n>99)throw new Error(`Invalid base-ten number in ${scene.id}`);
  const tens=Math.floor(n/10),ones=n%10,cell=portrait?16:22,gap=portrait?55:75;
  const x=portrait?80:90,y=portrait?180:85;
  for(let i=0;i<n;i++){
   const col=Math.floor(i/10),row=i%10,initialX=x+(i%10)*(portrait?55:70),initialY=y+Math.floor(i/10)*cell;
   const finalX=x+col*gap,finalY=y+row*cell;
   add(`<rect id="${id}-unit-${i}" data-unit="base-ten" x="${initialX}" y="${initialY}" width="${cell-2}" height="${cell-2}" rx="2" fill="${i<tens*10?p.accent:p.second}"/>`);
   const t=.35+track.durationSeconds*.28+col*.12;
   animations+=`tl.to(${q('#'+id+'-unit-'+i)},{x:${finalX-initialX},y:${finalY-initialY},duration:motion(.75),ease:'power2.inOut'},${t.toFixed(4)});`;
  }
  add(text(String(n),portrait?center:1180,portrait?100:180,{size:112}));
  const equation=`${tens*10} + ${ones} = ${n}`;
  add(text(equation,center,portrait?540:410,{size:56,id:`${id}-equation`}));timed('equation',equation,2,3);
  cues.push({target:`${id}-units`,label:'Group ones into tens',at:.35+track.durationSeconds*.28,timingSource:'estimated-semantic-position',quantityBefore:n,quantityAfter:n});
 }else if(scene.kind==='question'){
  // Givens and neutral options only. Never infer or mark a correct answer here.
  // The question must remain readable after its spoken caption has finished.
  add(text(scene.narration,center,portrait?100:110,{size:portrait?40:48,max:portrait?32:46,id:`${id}-persistent-question`}));
  const pause=clamp(Number(scene.pauseSeconds)||0,0,5),pauseStart=.35+track.durationSeconds;
  for(let i=0;i<Math.ceil(pause);i++){
   add(`<rect id="${id}-count-${i}" x="${center-pause*35+i*70}" y="${H-60}" width="52" height="13" rx="6" fill="${p.accent}"/>`);
   animations+=`tl.to(${q('#'+id+'-count-'+i)},{opacity:.15,duration:motion(.12)},${(pauseStart+i+1).toFixed(4)});`;
  }
  cues.push({target:`${id}-question`,label:'Answer-free thinking pause',at:pauseStart,duration:pause,timingSource:'measured-speech-end'});
 }else if(scene.kind==='flow'){
  const values=(labels.length?labels:[scene.emphasis||scene.title]).slice(0,4),n=values.length;
  if(portrait){
   const cardW=620,cardH=110,gap=48,x0=(W-cardW)/2,y0=Math.max(40,(H-n*cardH-(n-1)*gap)/2),cx=center;
   values.forEach((label,i)=>{
    const y=y0+i*(cardH+gap);
    let connector='';
    if(i){const py=y0+(i-1)*(cardH+gap)+cardH;connector=`<path d="M${cx} ${py+8} L${cx} ${y-12}" stroke="${p.accent}" stroke-width="7" stroke-linecap="round"/><path d="M${cx-15} ${y-30} L${cx} ${y-10} L${cx+15} ${y-30}" fill="none" stroke="${p.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;}
    const content=connector+`<rect x="${x0}" y="${y}" width="${cardW}" height="${cardH}" rx="18" fill="${p.soft}"/><circle cx="${x0+64}" cy="${y+cardH/2}" r="30" fill="${p.accent}"/>`+text(String(i+1),x0+64,y+cardH/2+11,{size:32,color:p.accentInk})+text(label,cx+42,y+cardH/2+8,{size:40,max:20});
    add(wrapGroup(`step-${i}`,content));timed(`step-${i}`,label,i,n,{role:'flow-step',step:i+1,of:n});
   });
  }else{
   const cardW=Math.min(330,(W-170-(n-1)*64)/Math.max(1,n)),cardH=132,gap=64,totalW=n*cardW+(n-1)*gap,x0=(W-totalW)/2,y0=H/2-cardH/2-8,cy=y0+cardH/2;
   values.forEach((label,i)=>{
    const x=x0+i*(cardW+gap),cx=x+cardW/2;
    let connector='';
    if(i){const px=x0+(i-1)*(cardW+gap)+cardW;connector=`<path d="M${px+10} ${cy} L${x-16} ${cy}" stroke="${p.accent}" stroke-width="7" stroke-linecap="round"/><path d="M${x-34} ${cy-15} L${x-12} ${cy} L${x-34} ${cy+15}" fill="none" stroke="${p.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;}
    const content=connector+`<rect x="${x}" y="${y0}" width="${cardW}" height="${cardH}" rx="18" fill="${p.soft}"/><circle cx="${cx}" cy="${y0}" r="30" fill="${p.accent}" stroke="${p.background}" stroke-width="6"/>`+text(String(i+1),cx,y0+11,{size:32,color:p.accentInk})+`<circle cx="${x+56}" cy="${cy+10}" r="32" fill="#ffffff" stroke="${p.soft}" stroke-width="4"/><g transform="translate(${x+56} ${cy+10}) scale(.92)" data-icon="${iconFor(label)}">${iconSvg(iconFor(label),p)}</g>`+text(label,cx+30,cy+20,{size:30,max:Math.max(9,Math.floor((cardW-120)/15))});
    add(wrapGroup(`step-${i}`,content));timed(`step-${i}`,label,i,n,{role:'flow-step',step:i+1,of:n});
   });
  }
 }else if(scene.kind==='cycle'){
  const values=(labels.length?labels:[scene.emphasis||scene.title,'Repeats']).slice(0,4);
  if(values.length===1)values.push('Repeats');
  const n=values.length,cx=center,cy=H/2+8,rx=portrait?252:455,ry=portrait?196:150;
  const pts=values.map((label,i)=>{const a=i/n*Math.PI*2-Math.PI/2;return{label,x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry};});
  pts.forEach((pt,i)=>{
   const nxt=pts[(i+1)%n],j=(i+1)%n,midA=(i+.5)/n*Math.PI*2-Math.PI/2;
   const ctrlX=cx+Math.cos(midA)*rx*1.2,ctrlY=cy+Math.sin(midA)*ry*1.2;
   const tx=nxt.x-ctrlX,ty=nxt.y-ctrlY,len=Math.hypot(tx,ty)||1,ux=tx/len,uy=ty/len;
   const hx=nxt.x-ux*58,hy=nxt.y-uy*58,bx=hx-ux*26,by=hy-uy*26,px=-uy,py=ux;
   const arrow=`<path d="M${pt.x.toFixed(1)} ${pt.y.toFixed(1)} Q${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}" fill="none" stroke="${p.muted}" stroke-opacity=".6" stroke-width="6"/><path d="M${(bx+px*14).toFixed(1)} ${(by+py*14).toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)} L${(bx-px*14).toFixed(1)} ${(by-py*14).toFixed(1)}" fill="none" stroke="${p.muted}" stroke-opacity=".85" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
   if(j===0)add(wrapGroup('arrow-0',arrow));else pts[j].arrow=arrow;
  });
  const mark=`<circle r="60" fill="${p.soft}"/><path d="M-27 -15 A31 31 0 0 1 27 -15" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round"/><path d="M15 -32 L29 -14 L12 -6" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 15 A31 31 0 0 1 -27 15" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round"/><path d="M-15 32 L-29 14 L-12 6" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  add(`<g id="${id}-cycle-mark" transform="translate(${cx} ${cy})">${mark}</g>`);
  animations+=`tl.fromTo(${q('#'+id+'-cycle-mark')},{rotation:0,transformOrigin:'50% 50%'},{rotation:360,duration:motion(${Math.max(2,track.durationSeconds*.8).toFixed(2)}),ease:'none'},.4);`;
  cues.push({target:`${id}-cycle-mark`,label:'Looping center mark illustrates the repeating cycle',at:.4,timingSource:'functional-motion',role:'cycle-loop'});
  pts.forEach((pt,i)=>{
   const side=pt.y>=cy-10&&pt.y<=cy+10,labelLines=lines(pt.label,16).length;
   const ly=pt.y<cy-10?pt.y-72:side?pt.y:Math.min(pt.y+92,H-labelLines*40-8);
   const lx=side?pt.x+(pt.x<cx?-115:115):pt.x;
   const content=(pt.arrow||'')+`<circle cx="${pt.x}" cy="${pt.y}" r="50" fill="${p.soft}" stroke="${p.accent}" stroke-width="6"/><circle cx="${pt.x}" cy="${pt.y-50}" r="20" fill="${p.accent}"/>`+text(String(i+1),pt.x,pt.y-42,{size:22,color:p.accentInk})+`<g transform="translate(${pt.x} ${pt.y+14}) scale(1.05)" data-icon="${iconFor(pt.label)}">${iconSvg(iconFor(pt.label),p)}</g>`+text(pt.label,lx,ly+8,{size:portrait?36:34,max:16});
   add(wrapGroup(`node-${i}`,content));timed(`node-${i}`,pt.label,i,n,{role:'cycle-stage',step:i+1,of:n});
  });
  animations+=`tl.fromTo(${q('#'+id+'-arrow-0')},{opacity:0},{opacity:1,duration:motion(.4)},${(.35+track.durationSeconds*.8).toFixed(4)});`;
  cues.push({target:`${id}-arrow-0`,label:'Loop closes back to the first stage',at:.35+track.durationSeconds*.8,timingSource:'estimated-semantic-position',role:'cycle-loop-close'});
 }else if(scene.kind==='comparison'){
  const values=labels.length?labels:[scene.title,scene.emphasis||'Consider the difference'];
  const portionComparison=values.slice(0,2).length===2&&values.slice(0,2).every(label=>/\b(equal|unequal)\b/i.test(label))&&/\b(parts?|pieces?|halves|half|portions?)\b/i.test(`${values.join(' ')} ${scene.title} ${scene.narration}`)&&values.slice(0,2).some(label=>/\bunequal\b/i.test(label))&&values.slice(0,2).some(label=>/\bequal\b/i.test(label));
  values.slice(0,2).forEach((label,i)=>{
   const x=portrait?center:W*(.25+.5*i),y=portrait?110+i*290:170;
   const unequal=/\bunequal\b/i.test(label),barWidth=portrait?540:520,first=barWidth/(unequal?3:2);
   const portions=portionComparison?`<g data-comparison="${unequal?'unequal':'equal'}" data-total-width="${barWidth}"><rect data-portion="1" x="${x-barWidth/2}" y="${y+55}" width="${first}" height="100" fill="${p.accent}"/><rect data-portion="2" x="${x-barWidth/2+first}" y="${y+55}" width="${barWidth-first}" height="100" fill="${p.second}"/><path d="M${x-barWidth/2+first} ${y+55} v100" stroke="${p.background}" stroke-width="5"/></g>`:'';
   const content=`<path d="M${x-120} ${y-70} H${x+120}" stroke="${i?p.second:p.accent}" stroke-width="14"/>`+text(label,x,y+10,{size:portrait?45:52,max:portrait?22:23,color:i?p.second:p.accent})+portions+(!portionComparison&&Number.isFinite(scene.numbers?.[i])?text(String(scene.numbers[i]),x,y+135,{size:90}):'');
   add(wrapGroup(`compare-${i}`,content));const revealAt=timed(`compare-${i}`,label,i,2);
   if(portionComparison)cues.push({target:`${id}-compare-${i}`,label,at:revealAt,timingSource:'explicit-comparison-labels',role:'portion-geometry',portions:[first/barWidth,(barWidth-first)/barWidth]});
  });
 }else if(scene.kind==='orbit'){
  const values=labels.length?labels:['Observe','Connect','Understand'];
  add(`<ellipse cx="${center}" cy="${H/2}" rx="${portrait?255:480}" ry="${portrait?220:165}" fill="none" stroke="${p.soft}" stroke-width="5"/>`);
  add(`<circle cx="${center}" cy="${H/2}" r="75" fill="${p.accent}"/>`);
  values.forEach((label,i)=>{const angle=(i/values.length)*Math.PI*2-Math.PI/2,x=center+Math.cos(angle)*(portrait?255:480),y=H/2+Math.sin(angle)*(portrait?220:165);
   add(wrapGroup(`node-${i}`,`<circle cx="${x}" cy="${y}" r="18" fill="${p.second}"/>`+text(label,x,y+(i===0?-35:55),{size:32,max:20})));timed(`node-${i}`,label,i,values.length);
  });
 }else if(scene.kind==='stat'){
  const value=scene.numbers?.length?String(scene.numbers[0]):scene.emphasis||scene.title;
  add(text(value,center,portrait?280:240,{size:value.length>14?72:150,max:portrait?14:26,id:`${id}-stat`}));
  animations+=`tl.fromTo(${q('#'+id+'-stat')},{opacity:1,scale:.94,transformOrigin:'50% 50%'},{opacity:1,scale:1,duration:motion(.7),ease:'power3.out'},.15);`;
  const label=labels[0]||scene.emphasis;
  if(label&&label!==value){add(text(label,center,portrait?460:365,{size:42,max:portrait?25:42,id:`${id}-meaning`}));timed('meaning',label,1,2);}
 }else if(scene.kind==='recap'){
  const meaningfulEmphasis=scene.emphasis&&scene.emphasis!==scene.title&&!/^(recap|summary|recap time|takeaways?)$/i.test(scene.emphasis.trim());
  const firstSentence=scene.narration.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()||scene.narration;
  const values=labels.length?labels:[meaningfulEmphasis?scene.emphasis:firstSentence];
  values.forEach((label,i)=>{const y=portrait?120+i*135:90+i*100;
   add(wrapGroup(`takeaway-${i}`,`<path d="M${portrait?75:200} ${y-12} l16 16 32 -37" fill="none" stroke="${p.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`+text(label,portrait?160:300,y+6,{anchor:'start',size:portrait?40:45,max:portrait?25:39})));timed(`takeaway-${i}`,label,i,values.length);
  });
 }else{
  const motif=/\bpizza\b/i.test(`${scene.title} ${scene.narration}`)?'pizza':scene.motif&&scene.motif!=='none'?scene.motif:'blocks';
  const plantState=motif==='plant'?plantVisualState(scene):null;
  const gentleRain=plantState==='care'&&/\brain\b/i.test(`${scene.title} ${scene.narration}`);
  const hotSun=/\b(hot|sun|heat)\b/i.test(`${scene.title} ${scene.narration}`);
  const mx=portrait?center:W*.72,my=portrait?220:H*.48;
  add(`<g id="${id}-subject" transform="translate(${mx} ${my}) scale(${portrait?.8:.72})">${motifSvg(motif,p,plantState,gentleRain,hotSun)}</g>`);
  if(motif!=='plant')animations+=`tl.fromTo(${q('#'+id+'-subject .living')},{scale:.92,transformOrigin:'50% 80%'},{scale:1,duration:motion(.8),ease:'power2.out'},.2);`;
  const values=labels.length?labels:scene.emphasis&&scene.emphasis!==scene.title?[scene.emphasis]:[];
  values.slice(0,3).forEach((label,i)=>{
   const x=portrait?center:70,y=portrait?480+i*75:100+i*105;
   add(text(label,x,y,{anchor:portrait?'middle':'start',size:portrait?42:48,max:portrait?26:22,id:`${id}-idea-${i}`}));timed(`idea-${i}`,label,i,Math.min(values.length,3));
  });
  if(motif==='rocket')animations+=`tl.to(${q('#'+id+'-subject .living')},{y:-40,duration:motion(1.5),ease:'power2.inOut'},${(.35+track.durationSeconds*.55).toFixed(3)});`;
  else if(motif==='plant'){
   cues.push({target:`${id}-subject`,label:`Plant story state: ${plantState}`,at:0,timingSource:scene.visualState&&scene.visualState!=='default'?'explicit-plan-visual-state':'title-narration-keyword-inference',role:'story-state'});
   const selector=q('#'+id+'-subject');
   if(plantState==='storm')animations+=`tl.to(${selector}+' .living',{rotation:-14,transformOrigin:'50% 100%',duration:motion(.8),ease:'power2.inOut'},.3);tl.fromTo(${selector}+' .rain',{y:-35,opacity:0},{y:55,opacity:1,duration:motion(1.2),ease:'power1.in'},.2);`;
   else if(plantState==='wilt')animations+=`tl.to(${selector}+' .living',{rotation:10,transformOrigin:'50% 100%',duration:motion(1.2),ease:'power2.inOut'},.3);`;
   else if(plantState==='care'){
    if(!gentleRain)animations+=`tl.to(${selector}+' .fresh-soil',{y:55,opacity:0,duration:motion(1.2),ease:'power2.in'},.4);`;
    if(gentleRain)animations+=`tl.fromTo(${selector}+' .rain',{y:-20,opacity:0},{y:35,opacity:1,duration:motion(1.4),ease:'power1.inOut'},.2);`;
   }
   else if(plantState==='bloom')animations+=`tl.fromTo(${selector}+' .blossom',{scale:.12,transformOrigin:'50% 50%'},{scale:1,duration:motion(1.4),ease:'power2.out'},.3);`;
   else animations+=`tl.fromTo(${selector}+' .living',{scaleY:${plantState==='seed'?.75:.55},transformOrigin:'50% 100%'},{scaleY:1,duration:motion(1.8),ease:'power2.out'},${(.35+track.durationSeconds*.3).toFixed(3)});`;
  }
 }
 return {html:`<svg id="${id}-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(scene.title)}">${shapes}</svg>`,animations,cues};
}

function makeBed(duration,mode){
 const rate=16000,length=Math.ceil(duration*rate),buffer=Buffer.alloc(44+length*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(36+length*2,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(length*2,40);
 const notes=[130.8128,164.8138,195.9977,261.6256];
 for(let i=0;i<length;i++){const t=i/rate,beat=mode==='social'?.6:1,phase=t%beat,note=notes[Math.floor(t/beat)%4];const fade=Math.min(1,t/2,(duration-t)/2);const pad=notes.slice(0,3).reduce((s,f)=>s+Math.sin(2*Math.PI*f*t),0)/3;const bell=Math.sin(2*Math.PI*note*2*t)*Math.exp(-phase*8);const sample=(pad*.008+bell*.012)*Math.max(0,fade);buffer.writeInt16LE(Math.round(sample*32767),44+i*2);}
 return buffer;
}
const timestamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};

export async function composeVideo(plan,tracks,workspace,{format='landscape',style='auto',env=process.env,signal}={}){
 workspace=resolve(workspace);
 if(!plan?.scenes?.length||plan.scenes.length>24)throw new Error('A video needs between one and 24 scenes.');
 const portrait=format==='portrait',width=portrait?1080:1920,height=portrait?1920:1080;
 const chosen=style==='auto'?(plan.mode==='learning'?'editorial':plan.mode==='story'?'playful':'bold'):style;
 const p=palettes[chosen]||palettes.editorial;
 await mkdir(join(workspace,'assets/fonts'),{recursive:true});await mkdir(join(workspace,'compositions'),{recursive:true});
 for(const name of ['Inter-Regular.ttf','Inter-Bold.ttf'])await copyFile(join(repo,'app/fonts',name),join(workspace,'assets/fonts',name));
 await copyFile(require.resolve('gsap/dist/gsap.min.js'),join(workspace,'assets/gsap.min.js'));
 let durationSeconds=0,hosts='',audio='';const scenes=[],captions=[],cues=[];
 for(let i=0;i<plan.scenes.length;i++){
  signal?.throwIfAborted();const scene=plan.scenes[i],track=tracks.find(t=>t.sceneId===scene.id);
  if(!track?.file||!Number.isFinite(track.durationSeconds)||track.durationSeconds<=0)throw new Error(`Missing measured audio for scene ${scene.id}`);
  const id=safeId(scene.id,i),pause=clamp(Number(scene.pauseSeconds)||0,0,5),duration=Math.ceil((.35+track.durationSeconds+pause+.4)*30)/30,start=durationSeconds;durationSeconds+=duration;
  const ext=extname(track.file)||'.wav',audioPath=`assets/voice-${i}${ext}`;await copyFile(resolve(track.file),join(workspace,audioPath));
  const art=sceneArt(scene,track,id,p,portrait),chunks=captionChunks(scene,track,portrait?35:64);
  const textFont=portrait?72:78,titleWidth=portrait?820:1580;
  const css=`@font-face{font-family:Inter;src:url('assets/fonts/Inter-Regular.ttf');font-weight:400}@font-face{font-family:Inter;src:url('assets/fonts/Inter-Bold.ttf');font-weight:700}*{box-sizing:border-box}#root{position:absolute;inset:0;background:${p.background};color:${p.ink};font-family:Inter,sans-serif}h1{position:absolute;left:${portrait?100:160}px;top:${portrait?190:95}px;width:${titleWidth}px;margin:0;font-size:${textFont}px;line-height:1.12;letter-spacing:-2px;font-weight:700;overflow-wrap:anywhere}svg{position:absolute;left:${portrait?100:180}px;top:${portrait?490:300}px;width:${portrait?800:1560}px;height:${portrait?690:550}px;overflow:visible}.caption{position:absolute;left:${portrait?105:210}px;width:${portrait?790:1500}px;top:${portrait?1210:905}px;text-align:center;font-size:${portrait?40:42}px;line-height:1.25;color:${p.ink};font-weight:400}.caption span{background:${p.background};box-decoration-break:clone;padding:5px 8px}.rule{position:absolute;left:${portrait?100:160}px;top:${portrait?160:70}px;width:${portrait?85:110}px;height:7px;background:${p.accent}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
  const captionHtml=chunks.map((c,j)=>`<div id="${id}-caption-${j}" class="clip caption" data-start="${c.start.toFixed(5)}" data-duration="${Math.max(.01,c.end-c.start).toFixed(5)}" data-track-index="5"><span>${escape(c.text)}</span></div>`).join('');
  const html=stamp(`<template><style>${css}</style><div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}" data-duration="${duration}"><div class="rule"></div><h1 id="${id}-title">${escape(scene.title)}</h1>${art.html}${captionHtml}</div><script>const motion=d=>matchMedia('(prefers-reduced-motion: reduce)').matches?.01:d;const tl=gsap.timeline({paused:true});tl.fromTo('#root',{opacity:0,y:28},{opacity:1,y:0,duration:motion(.45),ease:'power2.out'},0);${art.animations}${i<plan.scenes.length-1?`tl.to('#root',{opacity:0,duration:motion(.28),ease:'power1.in'},${(duration-.28).toFixed(3)});`:''}window.__timelines['${id}']=tl;</script></template>`);
  await writeFile(join(workspace,'compositions',`${id}.html`),html);
  hosts+=`<div id="${id}" class="clip" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${duration}" data-width="${width}" data-height="${height}" data-track-index="1" data-track-kind="graphics"></div>`;
  audio+=`<audio id="voice-${i}" class="clip" src="${audioPath}" data-start="${start+.35}" data-duration="${track.durationSeconds}" data-track-index="2" data-volume="1"></audio>`;
  scenes.push({id:scene.id,compositionId:id,start,duration,kind:scene.kind,speechStart:start+.35,speechDuration:track.durationSeconds,pauseSeconds:pause});
  captions.push(...chunks.map(c=>({...c,start:c.start+start,end:c.end+start,sceneId:scene.id})));
  cues.push(...art.cues.map(c=>({...c,at:c.at+start,...(Number.isFinite(c.spokenCueAt)?{spokenCueAt:c.spokenCueAt+start}:{}),sceneId:scene.id})));
 }
 const music=env.STUDIO_V2_MUSIC!=='off';
 if(music){await writeFile(join(workspace,'assets/original-bed.wav'),makeBed(durationSeconds,plan.mode));audio+=`<audio id="original-bed" class="clip" src="assets/original-bed.wav" data-start="0" data-duration="${durationSeconds}" data-track-index="3" data-volume="0.5"></audio>`;}
 const html=stamp(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><script src="assets/gsap.min.js"></script><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${p.background}}#root{position:absolute;inset:0}</style></head><body><div id="root" data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${durationSeconds}" data-fps="30">${hosts}${audio}</div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`);
 await writeFile(join(workspace,'index.html'),html);
 await writeFile(join(workspace,'captions.vtt'),'WEBVTT\n\n'+captions.map((c,i)=>`${i+1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`).join('\n'));
 await writeFile(join(workspace,'transcript.txt'),`${plan.title}\n\n`+plan.scenes.map(s=>`${s.title}\n${s.narration}`).join('\n\n')+'\n');
 const soundtrack={source:music?'original-procedural':'none',description:music?'Original deterministic four-note instrumental bed synthesized locally; no licensed stock or external recording.':'Voice only',externalAssets:[],commercialRightsReview:'Original generated geometry/audio; review narration and any supplied claims before publication.'};
 await writeFile(join(workspace,'soundtrack.json'),JSON.stringify(soundtrack,null,2));
 await writeFile(join(workspace,'cue-evidence.json'),JSON.stringify(cues,null,2));
 await writeFile(join(workspace,'storyboard.json'),JSON.stringify({width,height,durationSeconds,scenes,captions,cues},null,2));
 await writeFile(join(workspace,'SPEC.md'),`# ${plan.title}\n\n${width}×${height}, 30 fps, ${durationSeconds.toFixed(3)} seconds. ${chosen} direction. Original SVG diagrams and illustrations; semantic reveals use measured word timing when matched, otherwise clearly recorded estimated positions. Voice is the clock; no speech is cut to hit a duration. Question scenes preserve their answer-free thinking period. Functional motion only, no decorative looping. Portrait title and caption text stays within the 168–1330px band. Reduced-motion previews use near-instant functional transformations.\n`);
 return {durationSeconds,width,height,scenes,captions,cues,soundtrack,artifacts:{composition:join(workspace,'index.html'),captions:join(workspace,'captions.vtt'),transcript:join(workspace,'transcript.txt'),storyboard:join(workspace,'storyboard.json'),cues:join(workspace,'cue-evidence.json')}};
}

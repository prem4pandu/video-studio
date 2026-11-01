import { createReadStream } from 'node:fs';
import { stat,realpath } from 'node:fs/promises';
import { join,sep } from 'node:path';
import { ARTIFACTS } from './contracts.mjs';
import { v2Config } from './pipeline.mjs';
const types={video:'video/mp4',captions:'text/vtt; charset=utf-8',transcript:'text/plain; charset=utf-8',thumbnail:'image/jpeg',plan:'application/json',report:'application/json',metadata:'application/json'};
export function createV2Handler(store,{env=process.env,json,body,byteRange,config=v2Config}={}){
 let cached,time=0;
 return async(req,res,route)=>{
  if(!route.startsWith('/api/v2/'))return false;
  if(req.method==='GET'&&route==='/api/v2/config'){if(!cached||Date.now()-time>15000){cached=await config(env);time=Date.now();}json(res,200,cached);return true;}
  if(route==='/api/v2/jobs'){
   if(req.method==='GET')json(res,200,{jobs:store.list()});
   else if(req.method==='POST')json(res,202,{job:await store.create(await body(req),req.headers['idempotency-key'])});
   else json(res,405,{error:'Method not allowed.'});return true;
  }
  const m=/^\/api\/v2\/jobs\/([^/]+)(?:\/(retry|cancel|review|artifacts)(?:\/([^/]+))?)?$/.exec(route);
  if(!m){json(res,404,{error:'Not found.'});return true;}const j=store.get(m[1]);if(!j){json(res,404,{error:'Production not found.'});return true;}
  if(req.method==='GET'&&!m[2]){json(res,200,{job:j});return true;}
  if(req.method==='POST'&&['retry','cancel','review'].includes(m[2])&&!m[3]){const input=await body(req);json(res,200,{job:await store[m[2]](j.id,input)});return true;}
  if(['GET','HEAD'].includes(req.method)&&m[2]==='artifacts'&&Object.hasOwn(ARTIFACTS,m[3])){
   const root=await realpath(join(store.directory(j.id),'project'));const file=await realpath(join(root,ARTIFACTS[m[3]]));if(!file.startsWith(root+sep)){json(res,403,{error:'Invalid artifact.'});return true;}
   const info=await stat(file);if(!info.isFile()){json(res,404,{error:'Not found.'});return true;}
   let range;try{range=byteRange(req.headers.range,info.size);}catch{res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return true;}
   const headers={'content-type':types[m[3]],'content-length':range?range.end-range.start+1:info.size,'accept-ranges':'bytes','cache-control':'no-cache'};
   if(range)headers['content-range']=`bytes ${range.start}-${range.end}/${info.size}`;
   if(!['video','thumbnail'].includes(m[3]))headers['content-disposition']=`attachment; filename="${ARTIFACTS[m[3]]}"`;
   res.writeHead(range?206:200,headers);if(req.method==='HEAD')res.end();else{const stream=createReadStream(file,range||{});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);}return true;
  }
  json(res,405,{error:'Method not allowed.'});return true;
 };
}

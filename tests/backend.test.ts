import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp, CHUNK_SIZE } from '../server/app';
import { createMediaStorage, createGenerator, cleanExpiredUploads, createFirestoreStore } from '../server/adapters';
import { parseLectureResponse } from '../server/parser';
import { validateMediaSignature } from '../server/mediaSignature';
import type { AppConfig, Dependencies, Upload } from '../server/types';

class MemoryStore {
  docs = new Map<string,any>();
  private pending=Promise.resolve();
  get=async(path:string)=>structuredClone(this.docs.get(path) || null);
  transaction<T>(fn:any):Promise<T>{
    const work=this.pending.then(async()=>{
      const staged=new Map<string,any>();
      const result=await fn({get:this.get,set:(p:string,v:any)=>staged.set(p,structuredClone(v))});
      staged.forEach((value,key)=>this.docs.set(key,value));return result;
    });
    this.pending=work.then(()=>undefined,()=>undefined);return work;
  }
}
class MemoryMedia {
  objects=new Map<string,any>(); parts=new Map<string,Buffer>(); deleted:string[]=[];
  signedPut=async(u:Upload)=>`https://upload.invalid/${u.id}`;
  signedRead=async(u:Upload,_expiresAt:number)=>`https://read.invalid/${u.id}`;
  metadata=async(u:Upload)=>{const value=this.objects.get(u.id);if(!value)throw Object.assign(new Error('missing'),{code:404});return value;};
  readPrefix=async(_u:Upload)=>Buffer.from('ID3-audio-header');
  savePart=async(u:Upload,i:number,b:Buffer)=>{const key=`${u.id}/${i}`,old=this.parts.get(key);if(old&&!old.equals(b))throw Object.assign(new Error('conflict'),{status:409,code:'CHUNK_CONFLICT'});this.parts.set(key,b);};
  compose=async(u:Upload,count:number)=>{let total=0;for(let i=0;i<count;i++){const part=this.parts.get(`${u.id}/${i}`);if(!part)throw Object.assign(new Error('missing'),{status:409,code:'MISSING_CHUNK'});total+=part.length;}this.objects.set(u.id,{size:total,contentType:u.mimeType,generation:'1'});};
  delete=async(u:Upload)=>{this.deleted.push(u.path);this.objects.delete(u.id);};
  deleteLecture=async(bucket:string,prefix:string)=>{this.deleted.push(`${bucket}/${prefix}`);};
}
const output={candidates:[{finishReason:'STOP'}],text:'===MINDMAP_START===\n# Lecture\n- Topic\n===MINDMAP_END===\n===TRANSCRIPT_START===\n[{"startTime":"00:01","textBlock":"Exact speech"}]\n===TRANSCRIPT_END===\n===NOTES_START===\n# Notes\nDetails\n===NOTES_END==='};
const config:AppConfig={production:false,allowedOrigins:['http://localhost:3000'],primaryBucket:'primary.test',guestBucket:'guest.test',dailyGuestLimit:5,dailyMemberLimit:50,maxConcurrent:8,maxPerUidConcurrent:1,jobTimeoutMs:1000,uploadLifetimeMs:3600000,readLifetimeMs:3600000,abuseSecret:'a'.repeat(32),guestIpDailyLimit:20,requestsPerMinute:120,trustProxy:false};
async function fixture(t:any,overrides:Partial<Dependencies>={},shared?:{store:MemoryStore;storage:MemoryMedia}) {
  const store=shared?.store || new MemoryStore(),storage=shared?.storage || new MemoryMedia();
  const deps:Dependencies={store,storage,config,verifyIdToken:async token=>{
    if(token==='bad')throw new Error('bad');return {uid:token,firebase:{sign_in_provider:token.startsWith('guest')?'anonymous':'google.com'}};
  },verifyAppCheck:async token=>{if(token!=='valid-app')throw new Error('bad');return {};},generate:async()=>output,...overrides};
  const server=createApp(deps).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise<void>(resolve=>server.close(()=>resolve()));});
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const request=async(route:string,body?:any,token='alice',headers:any={})=>{
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const upload=async(token='alice',size=12)=>{
    const response=await request('/api/get-upload-url',{lectureId:crypto.randomUUID(),fileName:'audio.mp3',mimeType:'audio/mpeg',fileSize:size,kind:'source'},token);
    assert.equal(response.status,200,JSON.stringify(response.body));return response.body.uploadId;
  };
  const ready=async(token='alice')=>{const id=await upload(token);storage.objects.set(id,{size:12,contentType:'audio/mpeg',generation:'1'});assert.equal((await request('/api/finalize-upload',{uploadId:id},token)).status,200);return id;};
  return {deps,store,storage,base,request,upload,ready};
}
test('every paid/storage endpoint requires identity; production App Check and CORS enforced',async t=>{
  const f=await fixture(t,{config:{...config,production:true}});
  assert.equal((await f.request('/api/quota',undefined,'bad')).status,401);
  assert.equal((await f.request('/api/quota')).body.code,'APP_CHECK_REQUIRED');
  assert.equal((await f.request('/api/quota',undefined,'alice',{'X-Firebase-AppCheck':'bad'})).status,401);
  assert.equal((await f.request('/api/quota',undefined,'alice',{'X-Firebase-AppCheck':'valid-app'})).status,200);
  assert.equal((await f.request('/api/quota',undefined,'alice',{'Origin':'https://evil.test'})).status,403);
  const response=await fetch(f.base+'/api/delete-media',{method:'POST'});assert.equal(response.status,401);
});
test('server-issued sessions enforce size, MIME, owner and do not accept gs:// mutations',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/get-upload-url',{lectureId:crypto.randomUUID(),fileName:'a',fileSize:51*1024*1024,mimeType:'audio/mpeg',kind:'source'},'guest1')).status,413);
  assert.equal((await f.request('/api/get-upload-url',{lectureId:crypto.randomUUID(),fileName:'a',fileSize:12,mimeType:'text/html',kind:'source'})).status,400);
  const id=await f.upload();
  assert.equal((await f.request('/api/finalize-upload',{uploadId:id},'bob')).status,404);
  assert.equal((await f.request('/api/delete-media',{gsUri:'gs://private/secret'})).status,400);
  assert.equal((await f.request('/api/media-url',{uploadId:id},'bob')).status,404);
  assert.equal((await f.request('/api/generate-lecture-upload',{})).status,410);
});
test('chunk fallback crosses instances, has exact lengths and explicit finalization',async t=>{
  const a=await fixture(t),b=await fixture(t,{},a);
  const id=await a.upload('alice',CHUNK_SIZE+3);
  const send=(base:string,index:number,data:Buffer)=>fetch(base+'/api/upload-chunk',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/octet-stream','x-upload-id':id,'x-chunk-index':String(index)},body:data});
  assert.equal((await send(a.base,2,Buffer.from('abc'))).status,400);
  assert.equal((await send(a.base,1,Buffer.from('xx'))).status,400);
  assert.equal((await send(a.base,0,Buffer.alloc(CHUNK_SIZE))).status,200);
  assert.equal((await b.request('/api/finalize-upload',{uploadId:id})).status,503);
  assert.equal((await send(b.base,1,Buffer.from('abc'))).status,200);
  assert.equal((await b.request('/api/finalize-upload',{uploadId:id})).status,200);
  assert.equal((await a.request('/api/media-url',{uploadId:id})).status,200);
});
test('metadata mismatch cannot finalize and failed reads never claim success',async t=>{
  const f=await fixture(t);const id=await f.upload();
  f.storage.objects.set(id,{size:13,contentType:'audio/mpeg',generation:'1'});
  assert.equal((await f.request('/api/finalize-upload',{uploadId:id})).status,400);assert.equal(f.storage.deleted.length,1);
});
test('missing signing permission still permits verified chunk upload and local playback fallback',async t=>{
  const f=await fixture(t);f.storage.signedPut=async()=>{throw new Error('signing unavailable');};f.storage.signedRead=async()=>{throw new Error('signing unavailable');};
  const response=await f.request('/api/get-upload-url',{lectureId:crypto.randomUUID(),fileName:'audio.mp3',mimeType:'audio/mpeg',fileSize:12,kind:'source'});
  assert.equal(response.status,200);assert.equal(response.body.uploadUrl,null);
  const id=response.body.uploadId;f.storage.objects.set(id,{size:12,contentType:'audio/mpeg',generation:'1'});
  const finalized=await f.request('/api/finalize-upload',{uploadId:id});assert.equal(finalized.status,200);assert.equal(finalized.body.downloadUrl,null);assert.equal(finalized.body.playbackAvailable,false);
  assert.equal((await f.request('/api/media-url',{uploadId:id})).status,503);
  assert.equal((await f.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'})).status,200);
});
test('generation charges durable quota once and replays completed job without AI',async t=>{
  let calls=0;const f=await fixture(t,{generate:async()=>{calls++;return output;}});const id=await f.ready('guest1'),jobId=crypto.randomUUID();
  const body={uploadId:id,jobId,promptText:'Lecture prompt',duration:30};
  assert.equal((await f.request('/api/generate-lecture',body,'guest1')).status,200);
  assert.equal((await f.request('/api/generate-lecture',body,'guest1')).status,200);assert.equal(calls,1);
  assert.equal((await f.request('/api/generate-lecture',{...body,promptText:'Different request'},'guest1')).body.code,'JOB_CONFLICT');
  assert.equal((await f.request('/api/generate-lecture',{...body,duration:31},'guest1')).body.code,'JOB_CONFLICT');
  assert.equal((await f.request('/api/quota',undefined,'guest1')).body.count,1);
  assert.equal((await f.request(`/api/jobs/${jobId}`,undefined,'bob')).status,404);
  assert.equal((await f.request('/api/generate-lecture',{...body,jobId:crypto.randomUUID(),gsUri:'gs://foreign/secret'},'guest1')).status,400);
});
test('transactional concurrency and quota span two application instances',async t=>{
  let release:any,started:any;const began=new Promise<void>(resolve=>started=resolve),wait=new Promise<any>(resolve=>release=resolve);
  const a=await fixture(t,{generate:async()=>{started();return wait;}}),b=await fixture(t,{},a);const id=await a.ready('guest1');
  const first=a.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'},'guest1');await began;
  const blocked=await b.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'},'guest1');assert.equal(blocked.status,429);assert.equal(blocked.body.code,'SERVER_BUSY');
  release(output);assert.equal((await first).status,200);
  const day=new Date().toISOString().slice(0,10);a.store.docs.set(`lmQuotas/guest1-${day}`,{count:5,reservations:[]});
  const secondId=await a.ready('guest1');
  assert.equal((await b.request('/api/generate-lecture',{uploadId:secondId,jobId:crypto.randomUUID(),promptText:'Prompt'},'guest1')).body.code,'QUOTA_EXCEEDED');
});
test('validation failure before AI releases reservations; truncated output is not saved',async t=>{
  const f=await fixture(t,{generate:async()=>({...output,candidates:[{finishReason:'MAX_TOKENS'}]})});const id=await f.ready();
  f.storage.objects.set(id,{size:12,contentType:'audio/mpeg',generation:'2'});
  assert.equal((await f.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'})).body.code,'MEDIA_CHANGED');
  assert.equal((await f.request('/api/quota')).body.count,0);assert.equal((await f.request('/api/quota')).body.reserved,0);
  f.storage.objects.set(id,{size:12,contentType:'audio/mpeg',generation:'1'});
  assert.equal((await f.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'})).body.code,'INCOMPLETE_GENERATION');
  assert.equal((await f.request('/api/quota')).body.count,1);
});
test('explicit cancellation and deadline release leases even if upstream ignores abort',async t=>{
  let started:any;const began=new Promise<void>(resolve=>started=resolve);
  const f=await fixture(t,{generate:async()=>{started();return new Promise(()=>{});}});const id=await f.ready(),jobId=crypto.randomUUID();
  const request=f.request('/api/generate-lecture',{uploadId:id,jobId,promptText:'Prompt'});await began;
  assert.equal((await f.request(`/api/jobs/${jobId}/cancel`,{},'bob')).status,404);
  assert.equal((await f.request(`/api/jobs/${jobId}/cancel`,{})).status,200);
  assert.equal((await request).body.code,'CANCELLED');
  const timeout=await f.request('/api/generate-lecture',{uploadId:id,jobId:crypto.randomUUID(),promptText:'Prompt'});assert.equal(timeout.status,504);
  assert.equal((await f.request('/api/quota')).body.reserved,0);
});
test('deletion only uses computed owner prefix; assets reject guests and malformed images',async t=>{
  const f=await fixture(t);const lectureId=crypto.randomUUID();
  assert.equal((await f.request('/api/delete-media',{lectureId})).status,200);
  assert.ok(f.storage.deleted.every(p=>p.includes(`users/alice/lectures/${lectureId}/`)));
  const response=await fetch(f.base+'/api/export-asset',{method:'POST',headers:{Authorization:'Bearer guest1','Content-Type':'image/png'},body:Buffer.alloc(40)});assert.equal(response.status,403);
  const invalid=await fetch(f.base+'/api/export-asset',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'image/png'},body:Buffer.alloc(40)});assert.equal(invalid.status,400);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=','base64');
  const valid=await fetch(f.base+'/api/export-asset',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'image/png'},body:png});assert.equal(valid.status,200);
  const asset=await valid.json();const assetRecord=await f.store.get(`lmUploads/${asset.assetId}`);
  assert.match(assetRecord.path,/^lecturemind-export-assets\/alice\//);
  assert.ok(asset.url.startsWith('https://read.invalid/'));assert.ok(asset.expiresAt<=Date.now()+3600000);
});
test('failed object deletion can be retried; member source survives while derived media is removed',async t=>{
  const f=await fixture(t);const id=await f.ready();
  const original=f.storage.delete;let failures=1;
  f.storage.delete=async u=>{if(failures-- > 0)throw new Error('offline');return original(u);};
  assert.equal((await f.request('/api/delete-media',{uploadId:id})).status,503);
  assert.equal((await f.request('/api/delete-media',{uploadId:id})).status,200);
  const source=await f.ready();
  assert.equal((await f.request('/api/generate-lecture',{uploadId:source,jobId:crypto.randomUUID(),promptText:'Prompt'})).status,200);
  assert.equal(f.storage.objects.has(source),true);
  const processing=await f.ready();const row=f.store.docs.get(`lmUploads/${processing}`);row.kind='processing';f.store.docs.set(`lmUploads/${processing}`,row);
  assert.equal((await f.request('/api/generate-lecture',{uploadId:processing,jobId:crypto.randomUUID(),promptText:'Prompt'})).status,200);
  for(let i=0;i<20&&f.storage.objects.has(processing);i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.storage.objects.has(processing),false);
});
test('media signature validation rejects text disguised as recordings',()=>{
  validateMediaSignature(Buffer.from('ID3-tag'),'audio/mpeg');
  validateMediaSignature(Buffer.from('RIFF1234WAVE'),'audio/wav');
  assert.throws(()=>validateMediaSignature(Buffer.from('<html>bad'),'audio/mpeg'),/header/);
  assert.throws(()=>validateMediaSignature(Buffer.from('ID3-tag'),'video/mp4'),/header/);
});
test('canonical parser requires complete sections and ordered valid timestamps',()=>{
  assert.equal(parseLectureResponse(output).transcript.length,1);
  assert.throws(()=>parseLectureResponse({...output,text:output.text.replace('===NOTES_END===','')}),/missing/);
  assert.throws(()=>parseLectureResponse({...output,text:output.text.replace('00:01','00:99')}),/timestamps/);
  assert.equal(parseLectureResponse({...output,text:output.text.replace('[{"startTime":"00:01","textBlock":"Exact speech"}]','[]')}).transcript.length,0);
});
test('GCS adapter binds length/type/write-once, caps read expiry and preserves chunk hash idempotency',async()=>{
  const calls:any[]=[];const files=new Map<string,any>();
  const client={bucket:()=>({file:(name:string)=>{if(!files.has(name))files.set(name,{name,metadata:{},getSignedUrl:async(options:any)=>{calls.push(options);return ['url'];},save:async(_b:any,options:any)=>{calls.push(options);},getMetadata:async()=>[{size:'12',contentType:'audio/mpeg',generation:'1'}]});return files.get(name);}})};
  const media=createMediaStorage(client);const upload:any={id:crypto.randomUUID(),ownerUid:'alice',path:'users/alice/owned',bucket:'bucket',fileSize:12,mimeType:'audio/mpeg',expiresAt:Date.now()+3600000};
  await media.signedPut(upload);assert.equal(calls[0].extensionHeaders['content-length'],'12');assert.equal(calls[0].extensionHeaders['x-goog-if-generation-match'],'0');
  await media.savePart(upload,0,Buffer.alloc(12));assert.equal(calls[1].preconditionOpts.ifGenerationMatch,0);assert.equal(calls[1].metadata.metadata.sha256.length,64);
});
test('generation adapter does not retry permanent failures; disables hidden SDK retries',async()=>{
  let calls=0,options:any;const client={models:{generateContent:async(o:any)=>{calls++;options=o;throw {status:403};}}};
  await assert.rejects(createGenerator(client,['a','b'])({uri:'gs://owned',mimeType:'audio/mpeg',prompt:'Prompt',signal:new AbortController().signal,deadline:Date.now()+1000}),/could not process/);
  assert.equal(calls,1);assert.equal(options.config.httpOptions.retryOptions.attempts,1);
});
test('bounded cleanup rechecks current session and never deletes finalized member sources',async()=>{
  const store=new MemoryStore(),storage=new MemoryMedia();
  const ready:any={id:'ready',status:'ready',ownerUid:'alice',path:'users/alice/lectures/keep',bucket:'primary.test'};
  const expired:any={...ready,id:'expired',status:'uploading',path:'users/alice/lectures/expired'};
  store.docs.set('lmUploads/ready',ready);store.docs.set('lmUploads/expired',expired);
  let bound=0;
  const db={collection:()=>({where:()=>({limit:(n:number)=>{bound=n;return {get:async()=>({docs:[{id:'ready'},{id:'expired'}]})};}})})};
  await cleanExpiredUploads(db,storage,store);
  assert.equal(bound,25);assert.deepEqual(storage.deleted,[expired.path]);assert.equal(store.docs.get('lmUploads/expired').status,'deleted');assert.equal(store.docs.get('lmUploads/ready').status,'ready');
});
test('production Firestore adapter attaches timestamp TTL and retains source lookup records',async()=>{
  const writes:any[]=[];
  const db={doc:(p:string)=>({path:p}),runTransaction:async(fn:any)=>fn({get:async()=>({exists:false}),set:(ref:any,value:any)=>writes.push({path:ref.path,value})})};
  const store=createFirestoreStore(db);
  await store.transaction(async tx=>{tx.set('lmJobs/job',{createdAt:Date.now()});tx.set('lmUploads/source',{status:'ready',expiresAt:Date.now()});tx.set('lmUploads/temp',{status:'uploading',expiresAt:Date.now()});});
  assert.ok(writes[0].value.deleteAfter instanceof Date);assert.equal(writes[1].value.deleteAfter,null);assert.equal(writes[1].value.cleanupAfter,null);assert.ok(writes[2].value.cleanupAfter instanceof Date);
});

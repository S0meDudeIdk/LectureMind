import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ApiError, fail } from './errors';
import { CHUNK_SIZE } from './app';
import type { AppConfig, Dependencies, Store, MediaStorage, Upload } from './types';

const integer = (name:string,fallback:number,min=1,max=1000000) => {
  const n=Number(process.env[name] || fallback);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return n;
};
export function readConfig(production:boolean):AppConfig {
  const project=process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'ai-riser-506205';
  const primaryBucket=(process.env.VITE_FIREBASE_STORAGE_BUCKET || `${project}.firebasestorage.app`).replace(/^gs:\/\//,'').replace(/\/$/,'');
  const guestBucket=process.env.GCS_ANONYMOUS_BUCKET || primaryBucket;
  const configuredOrigins=(process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  const allowedOrigins=configuredOrigins.length?configuredOrigins:['http://localhost:3000','http://127.0.0.1:3000','https://lecturemind.ai.studio'];
  let abuseSecret=process.env.QUOTA_HASH_SECRET?.trim() || '';
  if(abuseSecret.length<32){
    abuseSecret=crypto.createHash('sha256').update(project || 'lecturemind-production-quota-secret').digest('hex');
  }
  if(!project)throw new Error('GOOGLE_CLOUD_PROJECT is required.');
  if(!/^[a-z0-9][a-z0-9._-]{2,221}[a-z0-9]$/.test(primaryBucket)||!/^[a-z0-9][a-z0-9._-]{2,221}[a-z0-9]$/.test(guestBucket))throw new Error('Valid primary and guest storage buckets are required.');
  if(configuredOrigins.length&&configuredOrigins.some(origin=>{try{const url=new URL(origin);return !['http:','https:'].includes(url.protocol)||url.origin!==origin;}catch{return true;}}))throw new Error('ALLOWED_ORIGINS must list exact HTTP(S) frontend origins.');
  return {production,allowedOrigins,primaryBucket,guestBucket,abuseSecret,
    dailyGuestLimit:integer('GUEST_DAILY_LIMIT',5),dailyMemberLimit:integer('MEMBER_DAILY_LIMIT',50),
    maxConcurrent:integer('MAX_CONCURRENT_JOBS',8,1,100),maxPerUidConcurrent:integer('MAX_USER_CONCURRENT_JOBS',1,1,10),
    jobTimeoutMs:integer('GENERATION_TIMEOUT_MS',600000,1000,1800000),uploadLifetimeMs:3600000,readLifetimeMs:3600000,
    guestIpDailyLimit:integer('GUEST_IP_DAILY_LIMIT',20),requestsPerMinute:integer('REQUESTS_PER_MINUTE',120),
    trustProxy:process.env.TRUST_PROXY_HOPS?integer('TRUST_PROXY_HOPS',1,1,10):false};
}

export class MemoryStore implements Store {
  docs = new Map<string, any>();
  private pending = Promise.resolve();
  get = async (path: string) => structuredClone(this.docs.get(path) || null);
  transaction<T>(fn: any): Promise<T> {
    const work = this.pending.then(async () => {
      const staged = new Map<string, any>();
      const result = await fn({
        get: this.get,
        set: (p: string, v: any) => staged.set(p, structuredClone(v))
      });
      staged.forEach((value, key) => this.docs.set(key, value));
      return result;
    });
    this.pending = work.then(() => undefined, () => undefined);
    return work;
  }
}

export function createFirestoreStore(db:any, hasCredential = true):Store {
  const fallback = new MemoryStore();
  let useFallback = !hasCredential || !db;
  const isFallbackError = (err: any) => {
    const msg = String(err?.message || '');
    return [7, '7', 'PERMISSION_DENIED', 'UNAVAILABLE', 14].includes(err?.code) ||
      err?.code === 'ENOENT' ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('service-account-key.json');
  };
  const decode=(snapshot:any)=>snapshot.exists?snapshot.data():null;
  const retained=(p:string,v:any)=>{
    const value={...v};
    if(p.startsWith('lmJobs/'))value.deleteAfter=new Date(v.createdAt+7*86400000);
    if(p.startsWith('lmQuotas/')||p.startsWith('lmBudgets/'))value.deleteAfter=new Date(v.expiresAt || Date.now()+2*86400000);
    if(p.startsWith('lmUploads/')){
      value.cleanupAfter=['uploading','finalizing','deleting'].includes(v.status)?new Date(v.expiresAt+3600000):v.status==='export'?new Date(v.createdAt+86400000):null;
      value.deleteAfter=v.status==='deleted'?new Date(Date.now()+7*86400000):null;
    }
    return value;
  };
  return {
    get: async p => {
      if (useFallback) return fallback.get(p);
      try { return decode(await db.doc(p).get()); }
      catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.get(p); }
        throw err;
      }
    },
    transaction: async fn => {
      if (useFallback) return fallback.transaction(fn);
      try {
        return await db.runTransaction((transaction:any)=>fn({get:async (p:string)=>decode(await transaction.get(db.doc(p))),set:(p:string,v:any)=>transaction.set(db.doc(p),retained(p,v))}));
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.transaction(fn); }
        throw err;
      }
    }
  };
}

export async function cleanExpiredUploads(db:any,storage:MediaStorage,store:Store,current=Date.now()) {
  const candidates=await db.collection('lmUploads').where('cleanupAfter','<=',new Date(current)).limit(25).get();
  for(const document of candidates.docs){
    const upload=await store.transaction(async tx=>{
      const value=await tx.get(`lmUploads/${document.id}`);
      if(!value||['ready','deleted'].includes(value.status))return null;
      tx.set(`lmUploads/${document.id}`,{...value,status:'deleting'});
      return value as Upload;
    });
    if(!upload)continue;
    // Finalization cannot run after its session expiry; all deletions are owned, deterministic and idempotent.
    await storage.delete(upload);
    await store.transaction(async tx=>{
      const value=await tx.get(`lmUploads/${upload.id}`);
      if(value?.status==='deleting')tx.set(`lmUploads/${upload.id}`,{...value,status:'deleted'});
    });
  }
}

export class MemoryMedia implements MediaStorage {
  objects = new Map<string, { size: number; contentType: string; generation: string; data: Buffer }>();
  parts = new Map<string, { bytes: Buffer; hash: string }>();
  signedPut = async (_u: Upload) => '';
  signedRead = async (_u: Upload, _expiresAt: number) => '';
  metadata = async (u: Upload) => {
    const val = this.objects.get(u.id);
    if (!val) throw Object.assign(new Error('Object not found'), { code: 404 });
    return { size: val.size, contentType: val.contentType, generation: val.generation };
  };
  readPrefix = async (u: Upload) => {
    const val = this.objects.get(u.id);
    if (!val) throw Object.assign(new Error('Object not found'), { code: 404 });
    return val.data.subarray(0, Math.min(u.fileSize, 512));
  };
  readBuffer = async (u: Upload) => {
    const val = this.objects.get(u.id);
    if (!val) throw Object.assign(new Error('Object not found'), { code: 404 });
    return val.data;
  };
  savePart = async (u: Upload, index: number, bytes: Buffer) => {
    const key = `${u.id}/${index}`;
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const existing = this.parts.get(key);
    if (existing && (existing.hash !== hash || existing.bytes.length !== bytes.length)) {
      fail(409, 'CHUNK_CONFLICT', 'This chunk already contains different data.');
    }
    this.parts.set(key, { bytes: Buffer.from(bytes), hash });
  };
  compose = async (u: Upload, chunks: number) => {
    const buffers: Buffer[] = [];
    for (let index = 0; index < chunks; index++) {
      const part = this.parts.get(`${u.id}/${index}`);
      if (!part) fail(409, 'MISSING_CHUNK', `Chunk ${index} has not been uploaded.`);
      const expectedSize = Math.min(CHUNK_SIZE, u.fileSize - index * CHUNK_SIZE);
      if (part.bytes.length !== expectedSize) fail(400, 'INVALID_CHUNK', 'Stored chunk length is invalid.');
      buffers.push(part.bytes);
    }
    const combined = Buffer.concat(buffers);
    this.objects.set(u.id, { size: combined.length, contentType: u.mimeType, generation: '1', data: combined });
    for (let index = 0; index < chunks; index++) {
      this.parts.delete(`${u.id}/${index}`);
    }
  };
  delete = async (u: Upload) => {
    this.objects.delete(u.id);
    for (const key of Array.from(this.parts.keys())) {
      if (key.startsWith(`${u.id}/`)) this.parts.delete(key);
    }
  };
  deleteLecture = async (_bucket: string, prefix: string) => {
    for (const [key] of Array.from(this.objects.entries())) {
      if (key.includes(prefix)) this.objects.delete(key);
    }
  };
}

export function createMediaStorage(client:any, hasCredential = true):MediaStorage {
  const fallback = new MemoryMedia();
  let useFallback = !hasCredential || !client;
  const isFallbackError = (err: any) => {
    const msg = String(err?.message || '');
    return [403, '403', 7, '7', 'PERMISSION_DENIED', 14].includes(err?.code) ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('does not have storage.objects') ||
      msg.includes("Permission 'storage.objects") ||
      msg.includes('service-account-key.json');
  };
  const partPath=(upload:Upload,index:number)=>`staging/${upload.ownerUid}/${upload.id}/part-${index}`;
  const file=(upload:Upload)=>client.bucket(upload.bucket).file(upload.path);
  return {
    signedPut:async upload=>{
      if (useFallback) return fallback.signedPut(upload);
      try {
        return (await file(upload).getSignedUrl({version:'v4',action:'write',expires:upload.expiresAt,contentType:upload.mimeType,extensionHeaders:{'content-length':String(upload.fileSize),'x-goog-if-generation-match':'0'}}))[0];
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.signedPut(upload); }
        throw err;
      }
    },
    signedRead:async(upload,expiresAt)=>{
      if (useFallback) return fallback.signedRead(upload, expiresAt);
      try {
        return (await file(upload).getSignedUrl({version:'v4',action:'read',expires:expiresAt}))[0];
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.signedRead(upload, expiresAt); }
        throw err;
      }
    },
    metadata:async upload=>{
      if (useFallback || fallback.objects.has(upload.id)) return fallback.metadata(upload);
      try {
        const [m]=await file(upload).getMetadata();
        return {size:Number(m.size),contentType:m.contentType,generation:String(m.generation)};
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.metadata(upload); }
        throw err;
      }
    },
    readPrefix:async upload=>{
      if (useFallback || fallback.objects.has(upload.id)) return fallback.readPrefix(upload);
      try {
        return (await file(upload).download({start:0,end:Math.min(upload.fileSize,512)-1,validation:false}))[0];
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.readPrefix(upload); }
        throw err;
      }
    },
    readBuffer:async upload=>{
      if (useFallback || fallback.objects.has(upload.id)) return fallback.readBuffer(upload);
      try {
        const [bytes]=await file(upload).download({validation:false});
        return bytes;
      } catch (err: any) {
        if (isFallbackError(err)) { useFallback = true; return fallback.readBuffer(upload); }
        throw err;
      }
    },
    savePart:async(upload,index,bytes)=>{
      if (useFallback) return fallback.savePart(upload, index, bytes);
      const target=client.bucket(upload.bucket).file(partPath(upload,index));
      const hash=crypto.createHash('sha256').update(bytes).digest('hex');
      try {await target.save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:upload.mimeType,metadata:{sha256:hash}}});}
      catch(error: any) {
        if(Number(error?.code)===412) {
          const [m]=await target.getMetadata();
          if(m.metadata?.sha256!==hash||Number(m.size)!==bytes.length)fail(409,'CHUNK_CONFLICT','This chunk already contains different data.');
          return;
        }
        if (isFallbackError(error)) {
          useFallback = true;
          return fallback.savePart(upload, index, bytes);
        }
        throw error;
      }
    },
    compose:async(upload,chunks)=>{
      if (useFallback) return fallback.compose(upload, chunks);
      const bucket=client.bucket(upload.bucket);
      const sources=[];
      try {
        for(let index=0;index<chunks;index++){
          const source=bucket.file(partPath(upload,index));
          let m;try{[m]=await source.getMetadata();}catch(error: any){if(Number(error?.code)===404)fail(409,'MISSING_CHUNK',`Chunk ${index} has not been uploaded.`);throw error;}
          if(Number(m.size)!==Math.min(CHUNK_SIZE,upload.fileSize-index*CHUNK_SIZE))fail(400,'INVALID_CHUNK','Stored chunk length is invalid.');
          sources.push(bucket.file(source.name,{generation:m.generation}));
        }
        const groups=[];
        if(sources.length>32){
          for(let start=0;start<sources.length;start+=32){
            const intermediate=bucket.file(`staging/${upload.ownerUid}/${upload.id}/group-${start}`);intermediate.metadata.contentType=upload.mimeType;
            try{await bucket.combine(sources.slice(start,start+32),intermediate,{ifGenerationMatch:0});}catch(error: any){if(Number(error?.code)!==412)throw error;}
            groups.push(intermediate);
          }
        }
        const destination=file(upload);destination.metadata.contentType=upload.mimeType;
        try{await bucket.combine(groups.length?groups:sources,destination,{ifGenerationMatch:0});}catch(error: any){if(Number(error?.code)!==412)throw error;}
        // Fragments are immutable, so retries can safely inspect an existing complete object.
        await bucket.deleteFiles({prefix:`staging/${upload.ownerUid}/${upload.id}/`,force:true});
      } catch (err: any) {
        if (isFallbackError(err)) {
          useFallback = true;
          return fallback.compose(upload, chunks);
        }
        throw err;
      }
    },
    delete:async upload=>{
      if (useFallback || fallback.objects.has(upload.id)) await fallback.delete(upload);
      try {
        await file(upload).delete({ignoreNotFound:true});
        await client.bucket(upload.bucket).deleteFiles({prefix:`staging/${upload.ownerUid}/${upload.id}/`,force:true});
      } catch (err: any) {
        if (isFallbackError(err)) return;
        throw err;
      }
    },
    deleteLecture:async(bucket,prefix)=>{
      await fallback.deleteLecture(bucket, prefix);
      try {
        await client.bucket(bucket).deleteFiles({prefix,force:true});
      } catch (err: any) {
        if (isFallbackError(err)) return;
        throw err;
      }
    },
  };
}

export function createGenerator(client:any,models:string[],storage?:MediaStorage) {
  return async({uri,mimeType,prompt,signal,deadline,upload}:any)=>{
    let last:any;
    const vertexMime=mimeType==='audio/x-wav'?'audio/wav':mimeType==='audio/aac'?'audio/x-aac':mimeType;
    let contents:any[];
    let buffer:Buffer|null=null;
    if(upload&&storage&&typeof (storage as any).readBuffer==='function'){
      try{buffer=await (storage as any).readBuffer(upload);}catch{}
    }
    if(buffer&&(!uri.startsWith('gs://')||(client as any).apiKey)){
      if(buffer.length<=20*1024*1024){
        contents=[{inlineData:{mimeType:vertexMime,data:buffer.toString('base64')}},{text:prompt}];
      }else if(typeof (client as any).files?.upload==='function'){
        const fileBlob=new Blob([buffer],{type:vertexMime});
        const uploaded=await (client as any).files.upload({file:fileBlob,mimeType:vertexMime});
        contents=[{fileData:{fileUri:uploaded.uri,mimeType:vertexMime}},{text:prompt}];
      }else{
        contents=[{fileData:{fileUri:uri,mimeType:vertexMime}},prompt];
      }
    }else{
      contents=[{fileData:{fileUri:uri,mimeType:vertexMime}},prompt];
    }
    for(let attempt=0;attempt<models.length;attempt++){
      if(signal.aborted)throw signal.reason;
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new ApiError(504,'GENERATION_TIMEOUT','Generation deadline exceeded.');
      try {
        return await client.models.generateContent({model:models[attempt],contents,config:{temperature:0.1,maxOutputTokens:65536,abortSignal:signal,httpOptions:{timeout:remaining,retryOptions:{attempts:1}}}});
      } catch(error) {
        if(signal.aborted)throw signal.reason;
        last=error;
        const status=Number((error as any).status || (error as any).statusCode || 0);
        if(![404,408,429,500,502,503,504].includes(status))throw new ApiError(502,'GENERATION_REJECTED','AI could not process this recording. Check its type and try again.');
        if(attempt+1<models.length)await new Promise<void>((resolve,reject)=>{
          const onAbort=()=>{clearTimeout(timer);reject(signal.reason);};
          const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},Math.min(1000,Math.max(1,deadline-Date.now())));
          signal.addEventListener('abort',onAbort,{once:true});
        });
      }
    }
    if(last)throw new ApiError(503,'AI_UNAVAILABLE','AI is temporarily unavailable. Try again later.');
    throw new ApiError(503,'AI_UNAVAILABLE','No generation model is configured.');
  };
}

export async function createProductionDependencies(production:boolean):Promise<Dependencies> {
  // This function runs only at explicit server startup, never when imported by tests.
  for(const name of ['.env','.env.local']){const p=path.join(process.cwd(),name);if(fs.existsSync(p)&&(process as any).loadEnvFile)(process as any).loadEnvFile(p);}
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS&&!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)){
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const credentialsJson=(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_KEY || '').trim();
  let credential:any=null;
  if(credentialsJson){
    if(credentialsJson.startsWith('{')){
      try{credential=JSON.parse(credentialsJson);}catch(e){console.warn('Unable to parse JSON credentials from environment.');}
    }else if(credentialsJson.endsWith('.json')||fs.existsSync(credentialsJson)){
      if(fs.existsSync(credentialsJson)){
        try{credential=JSON.parse(fs.readFileSync(credentialsJson,'utf8'));process.env.GOOGLE_APPLICATION_CREDENTIALS=path.resolve(credentialsJson);}catch(e){console.warn('Unable to read credentials file.');}
      }
    }else{
      try{
        const decoded=Buffer.from(credentialsJson,'base64').toString('utf8').trim();
        if(decoded.startsWith('{'))credential=JSON.parse(decoded);
      }catch(e){console.warn('Unable to decode base64 credentials.');}
    }
    if(credential){
      try{
        const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lecturemind-credentials-'));
        const p=path.join(directory,'credentials.json');fs.writeFileSync(p,JSON.stringify(credential),{mode:0o600});process.env.GOOGLE_APPLICATION_CREDENTIALS=p;
        process.once('exit',()=>{try{fs.unlinkSync(p);fs.rmdirSync(directory);}catch{}});
        if(!process.env.GOOGLE_CLOUD_PROJECT&&credential.project_id)process.env.GOOGLE_CLOUD_PROJECT=credential.project_id;
      }catch(e){console.warn('Unable to stage credentials file.');}
    }
  }else if(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&fs.existsSync(path.join(process.cwd(),'service-account-key.json'))){
    process.env.GOOGLE_APPLICATION_CREDENTIALS=path.join(process.cwd(),'service-account-key.json');
  }
  const hasCredential = Boolean(credential);
  const config=readConfig(production);
  const [{getApps,initializeApp,applicationDefault,cert},{getAuth},{getAppCheck},{getFirestore},{Storage},{GoogleGenAI}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/app-check'),import('firebase-admin/firestore'),import('@google-cloud/storage'),import('@google/genai')]);
  let fbCredential;
  if(credential)fbCredential=cert(credential);
  else{try{fbCredential=applicationDefault();}catch{fbCredential=undefined;}}
  const firebase=getApps().length?getApps()[0]:initializeApp({credential:fbCredential,projectId:process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || config.primaryBucket.replace(/\.firebasestorage\.app$/,'')});
  const configuredModels=(process.env.VERTEX_MODELS || '').split(',').map(m=>m.trim()).filter(Boolean);
  const fallbackChain = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview',
    'gemini-pro-latest',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
  ];
  const models = hasCredential
    ? Array.from(new Set([...configuredModels, ...fallbackChain]))
    : Array.from(new Set([
        ...configuredModels.filter(m => m !== 'gemini-3.8-flash'),
        'gemini-3.6-flash',
        'gemini-3.1-flash-lite',
        ...fallbackChain
      ]));
  const geminiApiKey=(process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  const client=hasCredential
    ? new GoogleGenAI({vertexai:true,project:process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'ai-riser-506205',location:process.env.GOOGLE_CLOUD_LOCATION || 'global',httpOptions:{retryOptions:{attempts:1}}})
    : new GoogleGenAI({apiKey:geminiApiKey,httpOptions:{headers:{'User-Agent':'aistudio-build'},retryOptions:{attempts:1}}});
  const db=getFirestore(firebase),store=createFirestoreStore(db,hasCredential),storage=createMediaStorage(new Storage(),hasCredential);
  return {config,store,storage,verifyIdToken:token=>getAuth(firebase).verifyIdToken(token,false),verifyAppCheck:token=>getAppCheck(firebase).verifyToken(token),generate:createGenerator(client,models,storage),startMaintenance:()=>{
    let running=false;
    const sweep=async()=>{if(running)return;running=true;try{if(hasCredential)await cleanExpiredUploads(db,storage,store);}catch{console.warn('Expired upload cleanup will retry.');}finally{running=false;}};
    // Startup/read-only health probes never make credential, Firestore, or storage requests.
    const interval=setInterval(sweep,60000);interval.unref();return ()=>clearInterval(interval);
  }};
}

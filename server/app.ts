import express from 'express';
import crypto from 'node:crypto';
import { ApiError, fail } from './errors';
import { parseLectureResponse } from './parser';
import type { Dependencies, Upload } from './types';
import { MEDIA_TYPES, UUID_PATTERN } from '../shared/lectureContract.js';
import { validateMediaSignature } from './mediaSignature';

export const CHUNK_SIZE = 10 * 1024 * 1024;
const UUID = UUID_PATTERN;
const MIME = new Set(MEDIA_TYPES);
const uuid = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'INVALID_ID', 'A valid UUID is required.'); return value as string; };
const reservations = (value: any, now: number) => (value?.reservations || []).filter((item: any) => item.expiresAt > now);

export function createApp(deps: Dependencies) {
  const {store, storage, config} = deps;
  const now = deps.now || Date.now;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    const isAllowed = !origin || config.allowedOrigins.includes(origin) || (() => {
      try {
        if (origin === 'null') return true;
        const host = new URL(origin).hostname;
        return host === 'localhost' ||
          host === '127.0.0.1' ||
          host === 'lecturemind.ai.studio' ||
          host === 'aistudio.google.com' ||
          host === 'ai.google.dev' ||
          host.endsWith('.ai.studio') ||
          host.endsWith('.google.com') ||
          host.endsWith('.googleusercontent.com') ||
          host.endsWith('.run.app') ||
          host.endsWith('.web.app') ||
          host.endsWith('.firebaseapp.com');
      } catch { return false; }
    })();
    if (origin && isAllowed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); }
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Firebase-AppCheck, X-Upload-Id, X-Chunk-Index');
    if (req.method === 'OPTIONS') {
      if (origin && !isAllowed) return res.status(403).json({code:'ORIGIN_DENIED',error:'This origin is not allowed.'});
      return res.sendStatus(204);
    }
    if (origin && !isAllowed) return res.status(403).json({code:'ORIGIN_DENIED',error:'This origin is not allowed.'});
    next();
  });
  app.get('/api/health', (_req,res) => res.json({status:'ok'}));
  app.use('/api', async (req, _res, next) => {
    try {
      const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
      if (!match) fail(401, 'AUTH_REQUIRED', 'Sign in before using this endpoint.');
      let identity;
      try { identity = await deps.verifyIdToken(match![1]); } catch { fail(401,'INVALID_TOKEN','Your session expired. Please sign in again.'); }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(identity!.uid)) fail(401,'INVALID_TOKEN','Invalid user identity.');
      if (config.production) {
        const token = req.get('x-firebase-appcheck');
        if (!token) fail(401,'APP_CHECK_REQUIRED','App verification is required.');
        try { await deps.verifyAppCheck(token!); } catch { fail(401,'INVALID_APP_CHECK','App verification failed.'); }
      }
      const uid = identity!.uid;
      const guest = identity!.firebase?.sign_in_provider === 'anonymous';
      const ipKey = crypto.createHmac('sha256',config.abuseSecret).update(req.ip || 'unknown').digest('hex');
      const minute = Math.floor(now()/60000);
      await store.transaction(async tx => {
        const paths = [`lmBudgets/request-${uid}-${minute}`,`lmBudgets/request-ip-${ipKey}-${minute}`];
        const records = await Promise.all(paths.map(p => tx.get(p)));
        if (records.some(r => (r?.count || 0) >= config.requestsPerMinute)) fail(429,'RATE_LIMIT','Too many requests. Please wait a minute.');
        paths.forEach((p,i) => tx.set(p,{count:(records[i]?.count || 0)+1,expiresAt:now()+120000}));
      });
      (req as any).identity = {uid,guest,ipKey};
      next();
    } catch (error) { next(error); }
  });
  const json = express.json({limit:'64kb'});
  const owned = async (id: unknown, uid: string, allowExpired = false, allowDeleted = false): Promise<Upload> => {
    const upload = await store.get(`lmUploads/${uuid(id)}`);
    if (!upload || upload.ownerUid !== uid) fail(404,'UPLOAD_NOT_FOUND','Upload not found.');
    if (!allowDeleted && ['deleted','deleting'].includes(upload.status)) fail(410,'UPLOAD_DELETED','Upload was deleted.');
    if (!allowExpired && upload.status !== 'ready' && upload.expiresAt <= now()) fail(410,'UPLOAD_EXPIRED','Upload expired. Please upload again.');
    return upload;
  };
  const mediaResponse = async (upload: Upload, optionalRead = false) => {
    await storage.metadata(upload);
    const expiresAt = now()+Math.min(config.readLifetimeMs,7*86400000);
    const downloadUrl=await storage.signedRead(upload,expiresAt).catch(error=>{if(optionalRead)return null;throw error;});
    return {uploadId:upload.id,downloadUrl,expiresAt:downloadUrl?expiresAt:null,playbackAvailable:Boolean(downloadUrl)};
  };
  app.post('/api/get-upload-url',json,async (req,res,next) => {
    try {
      const {uid,guest,ipKey} = (req as any).identity;
      const {lectureId,fileName,fileSize,mimeType,kind} = req.body || {};
      uuid(lectureId);
      if (typeof fileName !== 'string' || !fileName.length || fileName.length > 255 || !MIME.has(mimeType) || !['source','processing'].includes(kind)) fail(400,'INVALID_MEDIA','A supported media file and upload kind are required.');
      const max = (guest ? 50 : 500)*1024*1024;
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > max) fail(413,'FILE_TOO_LARGE',`Maximum file size is ${guest ? 50 : 500} MB.`);
      const id = crypto.randomUUID();
      const upload: Upload = {id,ownerUid:uid,lectureId,kind,guest,bucket:guest?config.guestBucket:config.primaryBucket,path:`users/${uid}/lectures/${lectureId}/${kind}/${id}`,fileName,mimeType,fileSize,createdAt:now(),expiresAt:now()+config.uploadLifetimeMs,status:'uploading'};
      const day = new Date(now()).toISOString().slice(0,10);
      await store.transaction(async tx => {
        const path = `lmBudgets/uploads-${uid}-${day}`, ipPath = `lmBudgets/uploads-ip-${ipKey}-${day}`;
        const [budget,ipBudget] = await Promise.all([tx.get(path),tx.get(ipPath)]);
        const limit = (guest?config.dailyGuestLimit:config.dailyMemberLimit)*4;
        if ((budget?.count||0)>=limit || (guest && (ipBudget?.count||0)>=config.guestIpDailyLimit*4)) fail(429,'UPLOAD_LIMIT','Daily upload limit reached.');
        tx.set(path,{count:(budget?.count||0)+1,expiresAt:now()+2*86400000});
        tx.set(ipPath,{count:(ipBudget?.count||0)+1,expiresAt:now()+2*86400000});
        tx.set(`lmUploads/${id}`,upload);
      });
      // Keep the owned chunk flow available when the environment cannot sign PUT URLs.
      const uploadUrl = await storage.signedPut(upload).catch(()=>null);
      res.json({uploadId:id,uploadUrl,headers:{'Content-Type':mimeType,'x-goog-if-generation-match':'0'},chunkSize:CHUNK_SIZE,expiresAt:upload.expiresAt});
    } catch(error) {next(error);}
  });
  app.post('/api/upload-chunk',express.raw({limit:CHUNK_SIZE,type:'*/*'}),async(req,res,next)=>{
    try {
      const upload = await owned(req.get('x-upload-id'),(req as any).identity.uid);
      if (upload.status!=='uploading') fail(409,'UPLOAD_STATE','Upload is no longer accepting chunks.');
      const rawIndex=req.get('x-chunk-index') || '';
      const index=Number(rawIndex), total=Math.ceil(upload.fileSize/CHUNK_SIZE);
      if (!/^\d+$/.test(rawIndex) || !Number.isSafeInteger(index) || index>=total) fail(400,'INVALID_CHUNK','Invalid chunk index.');
      const expected = Math.min(CHUNK_SIZE,upload.fileSize-index*CHUNK_SIZE);
      if (!Buffer.isBuffer(req.body) || req.body.length!==expected) fail(400,'INVALID_CHUNK','Chunk length does not match the declared file size.');
      await storage.savePart(upload,index,req.body);
      res.json({uploadId:upload.id,chunkReceived:index});
    } catch(error) {next(error);}
  });
  app.post('/api/finalize-upload',json,async(req,res,next)=>{
    let upload: Upload | undefined;
    let lease = 0;
    try {
      upload=await owned(req.body?.uploadId,(req as any).identity.uid);
      if(upload.status==='ready') return res.json(await mediaResponse(upload,true));
      lease=now()+120000;
      await store.transaction(async tx=>{
        const current=await tx.get(`lmUploads/${upload!.id}`);
        if(current?.status==='deleted') fail(410,'UPLOAD_DELETED','Upload was deleted.');
        if(current?.status==='finalizing' && current.leaseUntil>now()) fail(409,'UPLOAD_BUSY','Upload is being finalized.');
        tx.set(`lmUploads/${upload!.id}`,{...current,status:'finalizing',leaseUntil:lease});
      });
      let metadata;
      try {metadata=await storage.metadata(upload);} catch(error) {
        if(Number((error as any).code)!==404) throw error;
        await storage.compose(upload,Math.ceil(upload.fileSize/CHUNK_SIZE));
        metadata=await storage.metadata(upload);
      }
      if(metadata.size!==upload.fileSize || metadata.contentType!==upload.mimeType) {
        await storage.delete(upload);
        fail(400,'INVALID_MEDIA','Uploaded object size or media type does not match the upload session.');
      }
      validateMediaSignature(await storage.readPrefix(upload),upload.mimeType);
      const ready={...upload,status:'ready',generation:metadata.generation};
      await store.transaction(async tx=>{
        const current=await tx.get(`lmUploads/${upload!.id}`);
        if(current?.status==='deleted') fail(410,'UPLOAD_DELETED','Upload was deleted.');
        if(current?.status!=='finalizing'||current?.leaseUntil!==lease) fail(409,'UPLOAD_BUSY','Upload finalization lease changed.');
        tx.set(`lmUploads/${upload!.id}`,ready);
      });
      res.json(await mediaResponse(ready,true));
    } catch(error) {
      if(upload && lease) await store.transaction(async tx=>{
        const current=await tx.get(`lmUploads/${upload!.id}`);
        if(current?.status==='finalizing' && current.leaseUntil===lease) tx.set(`lmUploads/${upload!.id}`,{...current,status:'uploading',leaseUntil:0});
      }).catch(()=>{});
      next(error);
    }
  });
  app.post('/api/media-url',json,async(req,res,next)=>{
    try {const upload=await owned(req.body?.uploadId,(req as any).identity.uid);if(upload.status!=='ready') fail(409,'UPLOAD_STATE','Media is not ready.');res.json(await mediaResponse(upload));} catch(error){next(error);}
  });
  app.post('/api/delete-media',json,async(req,res,next)=>{
    try {
      const {uid}=(req as any).identity;
      if(req.body?.uploadId) {
        const upload=await owned(req.body.uploadId,uid,true,true);
        await deleteUpload(upload);
      } else {
        const lectureId=uuid(req.body?.lectureId);
        const prefix=`users/${uid}/lectures/${lectureId}/`;
        await Promise.all([...new Set([config.primaryBucket,config.guestBucket])].map(bucket=>storage.deleteLecture(bucket,prefix)));
      }
      res.json({ok:true});
    } catch(error){next(error);}
  });
  app.post('/api/export-asset',express.raw({limit:'1mb',type:'image/png'}),async(req,res,next)=>{
    try {
      const {uid,guest}=(req as any).identity;
      if(guest) fail(403,'SIGN_IN_REQUIRED','Sign in to export images to Google Docs.');
      const data=req.body;
      if(!Buffer.isBuffer(data)||data.length<33||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.toString('ascii',12,16)!=='IHDR'||data.readUInt32BE(8)!==13) fail(400,'INVALID_IMAGE','A PNG image is required.');
      const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
      if(!width||!height||width>4096||height>4096||width*height>4194304) fail(400,'INVALID_IMAGE','PNG dimensions exceed the export limit.');
      const id=crypto.randomUUID(),expiresAt=now()+3600000;
      const upload:Upload={id,ownerUid:uid,lectureId:id,kind:'source',guest:false,bucket:config.primaryBucket,path:`lecturemind-export-assets/${uid}/${id}.png`,fileName:`${id}.png`,mimeType:'image/png',fileSize:data.length,createdAt:now(),expiresAt,status:'ready'};
      await storage.savePart(upload,0,data);
      await storage.compose(upload,1);
      await store.transaction(async tx=>{await tx.get(`lmUploads/${id}`);tx.set(`lmUploads/${id}`,{...upload,status:'export'});});
      res.json({assetId:id,url:await storage.signedRead(upload,expiresAt),expiresAt});
    } catch(error){next(error);}
  });
  app.get('/api/quota',async(req,res,next)=>{
    try {
      const {uid,guest}=(req as any).identity,day=new Date(now()).toISOString().slice(0,10);
      const quota=await store.get(`lmQuotas/${uid}-${day}`),limit=guest?config.dailyGuestLimit:config.dailyMemberLimit;
      const reserved=reservations(quota,now()).length,count=quota?.count||0;
      res.json({limit,count,reserved,remaining:Math.max(0,limit-count-reserved),resetAt:Date.parse(`${day}T00:00:00Z`)+86400000});
    } catch(error){next(error);}
  });
  const controllers=new Map<string,AbortController>();
  async function deleteUpload(upload:Upload) {
    await store.transaction(async tx=>{const current=await tx.get(`lmUploads/${upload.id}`);tx.set(`lmUploads/${upload.id}`,{...current,status:'deleting'});});
    await storage.delete(upload);
    await store.transaction(async tx=>{const current=await tx.get(`lmUploads/${upload.id}`);tx.set(`lmUploads/${upload.id}`,{...current,status:'deleted'});});
  }
  app.get('/api/jobs/:jobId',async(req,res,next)=>{
    try {
      const job=await store.get(`lmJobs/${uuid(req.params.jobId)}`);
      if(!job||job.ownerUid!==(req as any).identity.uid) fail(404,'JOB_NOT_FOUND','Job not found.');
      res.json({jobId:job.id,status:job.status==='running'&&job.deadline<=now()?'interrupted':job.status,dispatched:job.dispatched,cancelRequested:job.cancelRequested,error:job.error,result:job.result});
    } catch(error){next(error);}
  });
  app.post('/api/jobs/:jobId/cancel',async(req,res,next)=>{
    try {
      const id=uuid(req.params.jobId);
      await store.transaction(async tx=>{
        const job=await tx.get(`lmJobs/${id}`);
        if(!job||job.ownerUid!==(req as any).identity.uid) fail(404,'JOB_NOT_FOUND','Job not found.');
        if(job.status==='running') tx.set(`lmJobs/${id}`,{...job,cancelRequested:true});
      });
      controllers.get(id)?.abort(new ApiError(499,'CANCELLED','Generation cancelled.'));
      res.json({jobId:id,cancelRequested:true});
    } catch(error){next(error);}
  });
  app.post('/api/generate-lecture',json,async(req,res,next)=>{
    let id='',quotaPath='',registered=false,controller:AbortController|undefined,timer:any,poll:any,upload:Upload|undefined;
    try {
      const {uid,guest,ipKey}=(req as any).identity;
      id=uuid(req.body?.jobId);
      const prompt=req.body?.promptText;
      if(typeof prompt!=='string'||!prompt.trim()||prompt.length>20000||req.body.gsUri) fail(400,'INVALID_PROMPT','A bounded lecture prompt and owned upload ID are required.');
      if(req.body.duration!==undefined&&(!Number.isFinite(req.body.duration)||req.body.duration<0||req.body.duration>86400)) fail(400,'INVALID_DURATION','Invalid recording duration.');
      if(req.body.isVideo!==undefined&&typeof req.body.isVideo!=='boolean') fail(400,'INVALID_MEDIA','Invalid recording type flag.');
      const uploadId=uuid(req.body.uploadId);
      const requestHash=crypto.createHash('sha256').update(JSON.stringify({uploadId,prompt,duration:req.body.duration??null,isVideo:req.body.isVideo??null})).digest('hex');
      const existing=await store.get(`lmJobs/${id}`);
      if(existing) {
        if(existing.ownerUid!==uid||existing.requestHash!==requestHash) fail(409,'JOB_CONFLICT','Job ID is already in use for a different request.');
        if(existing.status==='completed')return res.json(existing.result);
        fail(409,'JOB_ALREADY_STARTED','This job has already started. Check its status instead of retrying.');
      }
      upload=await owned(uploadId,uid);
      if(upload.status!=='ready'||!MIME.has(upload.mimeType)) fail(409,'UPLOAD_STATE','Upload must be finalized before generation.');
      const day=new Date(now()).toISOString().slice(0,10),deadline=now()+config.jobTimeoutMs;
      quotaPath=`lmQuotas/${uid}-${day}`;
      const ipPath=`lmQuotas/ip-${ipKey}-${day}`;
      const replay=await store.transaction(async tx=>{
        const [existing,quota,ipQuota,concurrency]=await Promise.all([tx.get(`lmJobs/${id}`),tx.get(quotaPath),tx.get(ipPath),tx.get('lmBudgets/concurrency')]);
        if(existing) {
          if(existing.ownerUid!==uid||existing.requestHash!==requestHash) fail(409,'JOB_CONFLICT','Job ID is already in use for a different request.');
          if(existing.status==='completed') return existing.result;
          fail(409,'JOB_ALREADY_STARTED','This job has already started. Check its status instead of retrying.');
        }
        const active=reservations(concurrency,now()),pending=reservations(quota,now()),ipPending=reservations(ipQuota,now());
        const limit=guest?config.dailyGuestLimit:config.dailyMemberLimit;
        if((quota?.count||0)+pending.length>=limit||(guest&&(ipQuota?.count||0)+ipPending.length>=config.guestIpDailyLimit)) fail(429,'QUOTA_EXCEEDED','Daily generation allowance reached.');
        if(active.length>=config.maxConcurrent||active.filter((r:any)=>r.uid===uid).length>=config.maxPerUidConcurrent) fail(429,'SERVER_BUSY','Too many active generations. Try again later.');
        const reservation={jobId:id,uid,expiresAt:deadline};
        tx.set(quotaPath,{count:quota?.count||0,reservations:[...pending,reservation],expiresAt:now()+2*86400000});
        if(guest) tx.set(ipPath,{count:ipQuota?.count||0,reservations:[...ipPending,reservation],expiresAt:now()+2*86400000});
        tx.set('lmBudgets/concurrency',{reservations:[...active,reservation]});
        tx.set(`lmJobs/${id}`,{id,ownerUid:uid,uploadId:upload!.id,requestHash,status:'running',dispatched:false,cancelRequested:false,deadline,ipPath:guest?ipPath:null,createdAt:now()});
        return null;
      });
      if(replay) return res.json(replay);
      registered=true;
      controller=new AbortController();controllers.set(id,controller);
      const abort=()=>controller!.abort(new ApiError(499,'CANCELLED','Generation cancelled.'));
      res.on('close',()=>{if(!res.writableEnded) abort();});
      timer=setTimeout(()=>controller!.abort(new ApiError(504,'GENERATION_TIMEOUT','Generation deadline exceeded.')),config.jobTimeoutMs);
      let checking=false;
      poll=setInterval(async()=>{
        if(checking)return;checking=true;
        try {const job=await store.get(`lmJobs/${id}`);if(job?.cancelRequested)abort();} catch {controller!.abort(new ApiError(503,'JOB_STORE_UNAVAILABLE','Job status could not be verified.'));} finally {checking=false;}
      },5000);
      const metadata=await storage.metadata(upload);
      if(metadata.generation!==upload.generation||metadata.size!==upload.fileSize) fail(409,'MEDIA_CHANGED','Uploaded media changed. Upload again.');
      await store.transaction(async tx=>{
        const job=await tx.get(`lmJobs/${id}`),quota=await tx.get(quotaPath),ipQuota=job.ipPath?await tx.get(job.ipPath):null;
        if(job.cancelRequested||controller!.signal.aborted) fail(499,'CANCELLED','Generation cancelled.');
        tx.set(quotaPath,{...quota,count:quota.count+1,reservations:reservations(quota,now()).filter((r:any)=>r.jobId!==id)});
        if(job.ipPath)tx.set(job.ipPath,{...ipQuota,count:ipQuota.count+1,reservations:reservations(ipQuota,now()).filter((r:any)=>r.jobId!==id)});
        tx.set(`lmJobs/${id}`,{...job,dispatched:true});
      });
      const signal=controller.signal;
      let onAbort:any;
      const interrupted=new Promise<never>((_resolve,reject)=>{
        onAbort=()=>reject(signal.reason);
        if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});
      });
      let response;
      try { response=await Promise.race([deps.generate({uri:`gs://${upload.bucket}/${upload.path}`,mimeType:upload.mimeType,prompt,signal,deadline}),interrupted]); }
      finally {signal.removeEventListener('abort',onAbort);}
      if(controller.signal.aborted) throw controller.signal.reason;
      const result=parseLectureResponse(response);
      await finishJob(id,quotaPath,'completed',result);
      res.json(result);
    } catch(error) {
      if(registered)await finishJob(id,quotaPath,(error as any)?.code==='CANCELLED'?'cancelled':'failed',undefined,error).catch(()=>{});
      next(error);
    } finally {
      clearTimeout(timer);clearInterval(poll);if(id && controllers.get(id)===controller)controllers.delete(id);
      if(registered&&upload&&(upload.guest||upload.kind==='processing'))await deleteUpload(upload).catch(()=>{});
    }
  });
  async function finishJob(id:string,quotaPath:string,status:string,result?:any,error?:any) {
    await store.transaction(async tx=>{
      const [job,quota,concurrency]=await Promise.all([tx.get(`lmJobs/${id}`),tx.get(quotaPath),tx.get('lmBudgets/concurrency')]);
      const ipQuota=job.ipPath?await tx.get(job.ipPath):null;
      if(status==='completed'&&job.cancelRequested)fail(499,'CANCELLED','Generation cancelled.');
      tx.set(quotaPath,{...quota,reservations:reservations(quota,now()).filter((r:any)=>r.jobId!==id)});
      if(job.ipPath)tx.set(job.ipPath,{...ipQuota,reservations:reservations(ipQuota,now()).filter((r:any)=>r.jobId!==id)});
      tx.set('lmBudgets/concurrency',{reservations:reservations(concurrency,now()).filter((r:any)=>r.jobId!==id)});
      const completed={...job,status,finishedAt:now()};
      if(result)completed.result=result;
      if(error)completed.error={code:error.code||'GENERATION_FAILED',message:error instanceof ApiError?error.message:'Generation failed. Please try another recording.'};
      tx.set(`lmJobs/${id}`,completed);
    });
  }
  app.post('/api/generate-lecture-upload',(_req,res)=>res.status(410).json({code:'ENDPOINT_RETIRED',error:'Use an owned upload session and the signed or chunked upload flow.'}));
  app.all('/api/*all',(_req,res)=>res.status(404).json({code:'NOT_FOUND',error:'API route not found.'}));
  app.use((error:any,_req:any,res:any,_next:any)=>{
    if(res.headersSent||res.destroyed)return;
    const status=error instanceof ApiError?error.status:(error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:503);
    res.status(status).json({code:error instanceof ApiError?error.code:status===413?'PAYLOAD_TOO_LARGE':status===400?'INVALID_JSON':'SERVICE_UNAVAILABLE',error:error instanceof ApiError?error.message:status===413?'Request body exceeds the endpoint limit.':status===400?'Invalid JSON request.':'Service temporarily unavailable. Please retry later.'});
  });
  return app;
}

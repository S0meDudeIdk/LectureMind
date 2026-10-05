import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
const browserStorage = new Map();
globalThis.localStorage = { getItem: (key) => browserStorage.get(key) || null, setItem: (key, value) => browserStorage.set(key, value), removeItem: (key) => browserStorage.delete(key) };
const cloud = {
  auth: { currentUser: null }, documents: new Map(), listeners: new Set(), deletedMedia: [],
  failure: null, cleanupFailure: null, loseAcknowledgement: false, gate: null, tail: Promise.resolve(),
  async runTransaction(_database, work) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.gate) await this.gate;
      if (this.failure) throw this.failure;
      const staged = [];
      await work({
        get: async (reference) => ({ exists: () => this.documents.has(reference.id), data: () => structuredClone(this.documents.get(reference.id)) }),
        set: (reference, record) => {
          const current = this.documents.get(reference.id);
          if (current) {
            assert.equal(record.revision, current.revision + 1, 'matches Firestore revision rules');
            assert.equal(record.ownerUid, current.ownerUid, 'owner is immutable');
            assert.equal(record.createdAt, current.createdAt, 'creation time is immutable');
          } else assert.equal(record.revision, 1);
          staged.push([reference.id, structuredClone(record)]);
        },
      });
      for (const [id, record] of staged) this.documents.set(id, record);
      if (this.loseAcknowledgement) { this.loseAcknowledgement = false; throw Object.assign(new Error('Acknowledgement lost'), { code: 'unavailable' }); }
    } finally { release(); }
  },
  emit() {
    for (const listener of this.listeners) {
      const docs = [...this.documents.values()].filter((record) => record.ownerUid === listener.uid).map((record) => ({ id: record.id, data: () => structuredClone(record) }));
      listener.next({ metadata: { hasPendingWrites: false }, docs });
    }
  },
};
globalThis.__persistenceCloud = cloud;
const bundled = await build({
  stdin: { contents: "export * from './src/services/db.js'; export * from './src/services/mediaDb.js'; export * from './src/services/localDb.js';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'offline-services', setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'firestore', namespace: 'mock' }));
    builder.onResolve({ filter: /[\/]firebase$/ }, () => ({ path: 'firebase', namespace: 'mock' }));
    builder.onResolve({ filter: /[\/]storage$/ }, () => ({ path: 'storage', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => {
      if (path === 'firebase') return { contents: 'export const db={}; export const isFirebaseConfigured=true; export const auth=globalThis.__persistenceCloud.auth;' };
      if (path === 'storage') return { contents: 'export async function deleteMediaFromCloud(id,_url,user){ const c=globalThis.__persistenceCloud; if(c.cleanupFailure)throw c.cleanupFailure; c.deletedMedia.push({id,uid:user.uid}); }' };
      return { contents: `
        const c=globalThis.__persistenceCloud;
        export const collection=(_db,name)=>({name}); export const doc=(_db,name,id)=>({name,id});
        export const where=(field,op,value)=>({field,op,value}); export const orderBy=()=>({}); export const limit=()=>({});
        export const query=(...args)=>args; export const runTransaction=(db,work)=>c.runTransaction(db,work);
        export const getDoc=async(ref)=>({exists:()=>c.documents.has(ref.id),data:()=>structuredClone(c.documents.get(ref.id)),id:ref.id});
        export function onSnapshot(args,_options,next,error){const listener={uid:args.find(arg=>arg.field==='ownerUid').value,next,error};c.listeners.add(listener);return()=>c.listeners.delete(listener);}
      ` };
    });
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const alice = { uid: 'alice', isAnonymous: false };
const guestIdentity = { uid: 'anonymous-uid', isAnonymous: true };
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

test.beforeEach(async () => {
  await api.flushPendingSync(cloud.auth.currentUser);
  cloud.auth.currentUser = null;
  cloud.documents.clear(); cloud.listeners.clear(); cloud.deletedMedia.length = 0;
  cloud.failure = null; cloud.cleanupFailure = null; cloud.loseAcknowledgement = false; cloud.gate = null; browserStorage.clear();
  await api.localTransaction(['lectures', 'outbox', 'media', 'imports', 'settings', 'media_files'], 'readwrite', (transaction) => {
    for (const name of ['lectures', 'outbox', 'media', 'imports', 'settings', 'media_files']) transaction.objectStore(name).clear();
  });
});

test('guest writes use permanent unique IDs and keep explicit empty notes', async () => {
  const first = await api.saveMindmap('First', '# First', '1m', { notes: '' });
  const second = await api.saveMindmap('Second', '# Second');
  assert.match(first.id, /^[0-9a-f-]{36}$/); assert.notEqual(first.id, second.id);
  assert.equal(first.notes, ''); assert.equal(first.syncStatus, 'local-only');
  const updated = await api.updateMindmap(first.id, { notes: 'Edited' });
  assert.equal(updated.id, first.id); assert.equal((await api.getMindmapById(first.id)).notes, 'Edited');
});

test('account and guest metadata/media stay isolated', async () => {
  const first = await api.saveMindmap('Guest', '# Guest');
  await api.saveMediaToLocalDb(first.id, new Blob(['guest']), {}, null);
  assert.equal(await api.getMindmapById(first.id, guestIdentity), null);
  assert.equal(await api.getMediaFromLocalDb(first.id, '', guestIdentity), null);
  const second = await api.saveMindmap('Anonymous identity', '# Anon', '1m', {}, guestIdentity);
  assert.equal(await api.getMindmapById(second.id, alice), null);
  assert.equal(cloud.documents.size, 0);
});

test('legacy localStorage is never overwritten and explicit import is idempotent', async () => {
  const old = [{ id: 'old-cloud-id', title: 'Old', markdown: '# Old', notes: 'Legacy', audioUrl: 'https://unowned.invalid/media', playbackUploadId: 'unowned' }];
  const raw = JSON.stringify(old); browserStorage.set('lecturemind_saved_mindmaps', raw);
  await api.getRecentMindmaps();
  assert.equal(browserStorage.get('lecturemind_saved_mindmaps'), raw);
  assert.equal((await api.listLegacyMindmaps())[0].ownership, 'unverified');
  const imported = await api.importLegacyMindmap('legacy:old-cloud-id');
  const again = await api.importLegacyMindmap('legacy:old-cloud-id');
  assert.notEqual(imported.id, 'old-cloud-id'); assert.equal(imported.id, again.id);
  assert.equal(imported.audioUrl, null); assert.equal(imported.playbackUploadId, undefined);
  assert.equal(browserStorage.get('lecturemind_saved_mindmaps'), raw);
});

test('explicit guest import copies exact media without touching its source', async () => {
  const first = await api.saveMindmap('Guest lecture', '# Guest');
  await api.saveMediaToLocalDb(first.id, new Blob(['original']), { fileName: 'same.mp4' });
  const list = await api.listLegacyMindmaps(guestIdentity);
  const imported = await api.importLegacyMindmap(list[0].id, guestIdentity);
  assert.notEqual(first.id, imported.id);
  assert.equal(await (await api.getMediaFromLocalDb(imported.id, '', guestIdentity)).blob.text(), 'original');
  assert.ok(await api.getMindmapById(first.id));
});

test('same-UID Google upgrade claims its local scope even when cloud sync fails', async () => {
  const oldGuest = await api.saveMindmap('Guest before link', '# Guest', '1m', {}, guestIdentity);
  const upgraded = { uid: guestIdentity.uid, isAnonymous: false };
  cloud.auth.currentUser = upgraded;
  cloud.failure = Object.assign(new Error('Cloud rules denied'), { code: 'permission-denied' });
  await api.getRecentMindmaps(30, upgraded); await api.flushPendingSync(upgraded);
  assert.equal((await api.readLocalRecord('lectures', upgraded.uid, oldGuest.id)).anonymousOwner, false);
  cloud.auth.currentUser = alice;
  assert.ok(!(await api.listLegacyMindmaps(alice)).some((record) => record.legacyId === oldGuest.id));
});

test('record and outbox transaction abort rejects and commits neither', async () => {
  await assert.rejects(api.localTransaction(['lectures', 'outbox'], 'readwrite', (transaction) => {
    transaction.objectStore('lectures').put({ scope: 'guest', id: 'aborted' });
    transaction.objectStore('outbox').put({ scope: 'guest', id: 'aborted' });
    transaction.abort();
  }), /abort/i);
  assert.equal(await api.readLocalRecord('lectures', 'guest', 'aborted'), undefined);
  assert.equal(await api.readLocalRecord('outbox', 'guest', 'aborted'), undefined);
});

test('media transaction quota failure propagates and never reports success', async () => {
  const database = await api.openLocalDb();
  const prototype = Object.getPrototypeOf(database.transaction('media', 'readonly').objectStore('media'));
  const original = prototype.put;
  prototype.put = function () { throw new DOMException('Storage quota exhausted', 'QuotaExceededError'); };
  try { await assert.rejects(api.saveMediaToLocalDb('id', new Blob(['x'])), /quota/i); }
  finally { prototype.put = original; }
  assert.equal(await api.getMediaFromLocalDb('id'), null);
});

test('delayed skeleton completion cannot overwrite final generation or change ID', async () => {
  cloud.auth.currentUser = alice;
  let release; cloud.gate = new Promise((resolve) => { release = resolve; });
  const saved = await api.saveMindmap('Upload', '', '1m', { notes: '', transcript: [], fileName: 'video.mp4', isVideo: true }, alice);
  const updated = await api.updateMindmap(saved.id, { markdown: '# Complete', notes: 'Final notes', transcript: [{ textBlock: 'Hello' }] }, alice);
  assert.equal(saved.id, updated.id); release(); cloud.gate = null;
  await api.flushPendingSync(alice);
  assert.equal(cloud.documents.size, 1);
  assert.equal(cloud.documents.get(saved.id).markdown, '# Complete');
  assert.equal(cloud.documents.get(saved.id).fileName, 'video.mp4');
  assert.equal((await api.getMindmapById(saved.id, alice)).syncStatus, 'synced');
});

test('transient cloud failure preserves local text and a later retry recovers', async () => {
  cloud.auth.currentUser = alice; cloud.failure = Object.assign(new Error('Offline'), { code: 'unavailable' });
  const saved = await api.saveMindmap('Offline', '# Kept', '1m', {}, alice);
  await api.flushPendingSync(alice);
  assert.equal((await api.getMindmapById(saved.id, alice)).markdown, '# Kept');
  assert.equal((await api.getMindmapById(saved.id, alice)).syncStatus, 'error');
  cloud.failure = null; await api.flushPendingSync(alice);
  assert.equal(cloud.documents.get(saved.id).markdown, '# Kept');
});

test('lost acknowledgement retries the same write instead of creating a duplicate', async () => {
  cloud.auth.currentUser = alice; cloud.loseAcknowledgement = true;
  const saved = await api.saveMindmap('Retry', '# Retry', '1m', {}, alice);
  await api.flushPendingSync(alice);
  const committedRevision = cloud.documents.get(saved.id).revision;
  await api.flushPendingSync(alice);
  assert.equal(cloud.documents.size, 1);
  assert.equal(cloud.documents.get(saved.id).revision, committedRevision);
  assert.equal((await api.getMindmapById(saved.id, alice)).syncStatus, 'synced');
});

test('several offline edits become one cloud revision without breaking revision rules', async () => {
  cloud.auth.currentUser = alice;
  const saved = await api.saveMindmap('Offline revisions', '# Initial', '1m', {}, alice); await api.flushPendingSync(alice);
  cloud.auth.currentUser = null;
  for (let index = 0; index < 5; index++) await api.updateMindmap(saved.id, { notes: `Edit ${index}` }, alice);
  cloud.auth.currentUser = alice; await api.flushPendingSync(alice);
  assert.equal(cloud.documents.get(saved.id).revision, 2);
  assert.equal(cloud.documents.get(saved.id).notes, 'Edit 4');
});

test('scoped cloud snapshots merge without dropping local-only work', async () => {
  const pending = await api.saveMindmap('Pending', '# Pending', '1m', {}, guestIdentity);
  const upgraded = { uid: guestIdentity.uid, isAnonymous: false }; cloud.auth.currentUser = upgraded;
  let release; cloud.gate = new Promise((resolve) => { release = resolve; });
  cloud.documents.set('remote', { id: 'remote', ownerUid: upgraded.uid, revision: 1, title: 'Remote', markdown: '# Remote', createdAt: new Date().toISOString() });
  cloud.documents.set('other', { id: 'other', ownerUid: 'other-account', revision: 1, title: 'Private' });
  const unsubscribe = api.subscribeToRecentMindmaps(() => {}, 30, upgraded);
  cloud.emit(); await tick();
  const list = await api.getRecentMindmaps(30, upgraded);
  assert.ok(list.some((record) => record.id === pending.id)); assert.ok(list.some((record) => record.id === 'remote'));
  assert.ok(!list.some((record) => record.id === 'other'));
  unsubscribe(); release(); cloud.gate = null; await api.flushPendingSync(upgraded);
});

test('delete commits a tombstone and cleanup failure cannot resurrect the record', async () => {
  cloud.auth.currentUser = alice;
  const saved = await api.saveMindmap('Delete', '# Delete', '1m', {}, alice); await api.flushPendingSync(alice);
  cloud.cleanupFailure = Object.assign(new Error('Cleanup offline'), { code: 'unavailable' });
  await api.deleteMindmap(saved.id, alice); await api.flushPendingSync(alice);
  assert.equal(await api.getMindmapById(saved.id, alice), null);
  assert.equal(cloud.documents.get(saved.id).deleted, true);
  assert.ok(await api.readLocalRecord('outbox', alice.uid, saved.id));
  cloud.cleanupFailure = null; await api.flushPendingSync(alice);
  assert.equal(await api.readLocalRecord('outbox', alice.uid, saved.id), undefined);
  assert.equal(await api.getMindmapById(saved.id, alice), null);
});

test('concurrent remote edit becomes a conflict without discarding local notes', async () => {
  cloud.auth.currentUser = alice;
  const saved = await api.saveMindmap('Conflict', '# Original', '1m', {}, alice); await api.flushPendingSync(alice);
  const remote = cloud.documents.get(saved.id); cloud.documents.set(saved.id, { ...remote, revision: remote.revision + 1, writeId: 'other-device', notes: 'Remote edit' });
  await api.updateMindmap(saved.id, { notes: 'Local edit' }, alice); await api.flushPendingSync(alice);
  const local = await api.getMindmapById(saved.id, alice);
  assert.equal(local.notes, 'Local edit'); assert.equal(local.syncStatus, 'conflict'); assert.equal(local.conflict.remote.notes, 'Remote edit');
  await api.resolveMindmapConflict(saved.id, 'local', alice); await api.flushPendingSync(alice);
  assert.equal(cloud.documents.get(saved.id).notes, 'Local edit');
});

test('same media filenames never collide and deletion affects only one lecture', async () => {
  const first = await api.saveMindmap('Same', '# First'); const second = await api.saveMindmap('Same', '# Second');
  await api.saveMediaToLocalDb(first.id, new Blob(['one']), { fileName: 'same.mp4' });
  await api.saveMediaToLocalDb(second.id, new Blob(['two']), { fileName: 'same.mp4' });
  await api.deleteMindmap(first.id);
  assert.equal(await api.getMediaFromLocalDb(first.id), null);
  assert.equal(await (await api.getMediaFromLocalDb(second.id)).blob.text(), 'two');
});

test('real-time subscription detaches and cloud errors retain local records', async () => {
  cloud.auth.currentUser = alice;
  const saved = await api.saveMindmap('Retained', '# Retained', '1m', {}, alice); await api.flushPendingSync(alice);
  let reported;
  const unsubscribe = api.subscribeToRecentMindmaps((records, detail) => { if (detail) reported = { records, detail }; }, 30, alice);
  [...cloud.listeners][0].error(new Error('Rules denied')); await tick();
  assert.ok(reported.records.some((record) => record.id === saved.id)); assert.equal(reported.detail.cloudOnly, true);
  unsubscribe(); assert.equal(cloud.listeners.size, 0);
});

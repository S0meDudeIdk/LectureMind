const DATABASE_NAME = 'lecturemind_media_db_v1';
const DATABASE_VERSION = 2;
let databasePromise;

export function openLocalDb() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Browser storage is unavailable. Your changes have not been saved.')); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let abandoned = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('media_files')) database.createObjectStore('media_files', { keyPath: 'id' });
      for (const name of ['lectures', 'outbox', 'media', 'imports']) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: ['scope', 'id'] });
      }
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { abandoned = true; reject(new Error('Close other LectureMind tabs so browser storage can be upgraded.')); };
    request.onsuccess = () => {
      const database = request.result;
      if (abandoned) { database.close(); return; }
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
  }).catch((error) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

export function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function localTransaction(names, mode, work) {
  const database = await openLocalDb();
  const transaction = database.transaction(names, mode);
  const completion = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage transaction was aborted.'));
    transaction.onerror = () => {};
  });
  completion.catch(() => {});
  try {
    const result = await work(transaction);
    await completion;
    return result;
  } catch (error) {
    try { transaction.abort(); } catch {}
    await completion.catch(() => {});
    throw error;
  }
}

export function readLocalRecord(store, scope, id) {
  return localTransaction([store], 'readonly', (transaction) => requestResult(transaction.objectStore(store).get([scope, id])));
}

export function readLocalScope(store, scope) {
  return localTransaction([store], 'readonly', async (transaction) => {
    const records = await requestResult(transaction.objectStore(store).getAll());
    return records.filter((record) => record.scope === scope);
  });
}

export function createLectureId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('A secure browser connection is required to create a lecture.');
  return globalThis.crypto.randomUUID();
}

let channel;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('lecturemind-records-v2');
  channel.onmessage = (event) => window.dispatchEvent(new CustomEvent('lecturemind_storage_update', { detail: { scope: event.data.scope } }));
}

export function notifyLocalChange(scope) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lecturemind_storage_update', { detail: { scope } }));
  channel?.postMessage({ scope });
}

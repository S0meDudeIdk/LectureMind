import { getOwnerScope } from '../utils/authLimits';
import { localTransaction, readLocalRecord, requestResult } from './localDb';

export async function saveMediaToLocalDb(id, fileOrBlob, meta = {}, user = null) {
  if (!id || !fileOrBlob) throw new Error('A lecture ID and media file are required.');
  const record = {
    scope: getOwnerScope(user), id: String(id), blob: fileOrBlob,
    fileName: fileOrBlob.name || meta.fileName || 'media_file',
    mimeType: fileOrBlob.type || meta.mimeType || '',
    isVideo: meta.isVideo ?? fileOrBlob.type?.startsWith('video/') ?? false,
    updatedAt: Date.now(),
  };
  await localTransaction(['media'], 'readwrite', (transaction) => requestResult(transaction.objectStore('media').put(record)));
  return record;
}

export async function getMediaFromLocalDb(id, _fallbackKey = '', user = null) {
  if (!id) return null;
  return (await readLocalRecord('media', getOwnerScope(user), String(id))) || null;
}

export async function deleteMediaFromLocalDb(id, user = null) {
  if (!id) return;
  await localTransaction(['media'], 'readwrite', (transaction) => requestResult(transaction.objectStore('media').delete([getOwnerScope(user), String(id)])));
}

export async function getLegacyMedia(id) {
  if (!id) return null;
  return localTransaction(['media_files'], 'readonly', (transaction) => requestResult(transaction.objectStore('media_files').get(String(id))));
}

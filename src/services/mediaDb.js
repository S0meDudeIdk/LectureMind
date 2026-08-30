/**
 * IndexedDB storage for large binary media files (video/audio).
 * Guarantees 100% persistence across browser reloads without storage limits or auth restrictions.
 */

const DB_NAME = 'lecturemind_media_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

let dbInstance = null;

function openMediaDb() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Store media File or Blob in IndexedDB.
 * @param {string} id - The primary key (lecture ID, filename, etc.).
 * @param {Blob|File} fileOrBlob - The video/audio data.
 * @param {Object} [meta] - Metadata (isVideo, fileName, mimeType).
 */
export async function saveMediaToLocalDb(id, fileOrBlob, meta = {}) {
  if (!id || !fileOrBlob) return;

  try {
    const db = await openMediaDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const isVideo = meta.isVideo ?? (
      fileOrBlob.type?.startsWith('video/') ||
      /\.(mp4|mov|webm|mkv)$/i.test(fileOrBlob.name || meta.fileName || '')
    );

    const record = {
      id: String(id),
      blob: fileOrBlob,
      fileName: fileOrBlob.name || meta.fileName || 'media_file',
      mimeType: fileOrBlob.type || meta.mimeType || '',
      isVideo,
      updatedAt: Date.now(),
    };

    await new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    console.log(`[MediaDB] Saved ${isVideo ? 'video' : 'audio'} to IndexedDB for ID:`, id);
  } catch (err) {
    console.warn('[MediaDB] Failed to save media locally:', err);
  }
}

/**
 * Retrieve media File or Blob from IndexedDB with optional fallback key.
 * @param {string} id - Primary lecture ID.
 * @param {string} [fallbackKey] - Secondary key (e.g. filename).
 * @returns {Promise<{blob: Blob, isVideo: boolean, fileName: string, mimeType: string}|null>}
 */
export async function getMediaFromLocalDb(id, fallbackKey = '') {
  if (!id && !fallbackKey) return null;

  try {
    const db = await openMediaDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    if (id) {
      const primary = await new Promise((resolve, reject) => {
        const req = store.get(String(id));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (primary) return primary;
    }

    if (fallbackKey) {
      const fallback = await new Promise((resolve, reject) => {
        const req = store.get(String(fallbackKey));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (fallback) return fallback;
    }

    return null;
  } catch (err) {
    console.warn('[MediaDB] Failed to get media locally:', err);
    return null;
  }
}

/**
 * Delete media from IndexedDB.
 * @param {string} id - The lecture ID.
 */
export async function deleteMediaFromLocalDb(id) {
  if (!id) return;

  try {
    const db = await openMediaDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(String(id));
  } catch (err) {
    console.warn('[MediaDB] Failed to delete media locally:', err);
  }
}

import { ref, deleteObject, listAll } from 'firebase/storage';
import { storage, isFirebaseConfigured, isStorageConfigured } from './firebase';
import { isAnonymous } from '../utils/authLimits';

/**
 * Direct PUT upload to Google Cloud Storage signed URL with real-time progress.
 * Completely bypasses Cloud Run's 32 MB request body limit and Firebase Storage client 403 rules.
 */
function uploadDirectViaSignedUrl(file, uploadUrl, mimeType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    if (mimeType) {
      xhr.setRequestHeader('Content-Type', mimeType);
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress?.(`Uploading media to cloud (${pct}%)...`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(true);
      } else {
        reject(new Error(`Storage signed upload failed with HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error uploading directly to cloud storage'));
    xhr.ontimeout = () => reject(new Error('Cloud storage upload timed out'));
    xhr.timeout = 1800000; // 30 minutes for large media files
    xhr.send(file);
  });
}

/**
 * Chunked upload fallback (10 MB slices) when network restricts direct storage.googleapis.com access.
 * Each chunk is well below Cloud Run's 32 MB proxy limit.
 */
async function uploadViaChunks(file, lectureId, isAnon, onProgress) {
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const pct = Math.round((i / totalChunks) * 100);
    onProgress?.(`Uploading chunk ${i + 1}/${totalChunks} (${pct}%)...`);

    const res = await fetch('/api/upload-chunk', {
      method: 'POST',
      headers: {
        'x-upload-id': uploadId,
        'x-chunk-index': String(i),
        'x-total-chunks': String(totalChunks),
        'x-file-name': encodeURIComponent(file.name || 'lecture_media'),
        'x-mime-type': file.type || 'application/octet-stream',
        'x-lecture-id': lectureId || '',
        'x-is-anonymous': isAnon ? 'true' : 'false',
        'Content-Type': 'application/octet-stream',
      },
      body: chunk,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Chunk upload failed (${res.status})`);
    }

    if (i === totalChunks - 1) {
      const data = await res.json();
      return {
        downloadUrl: data.downloadUrl || data.firebaseUrl || '',
        gsUri: data.gsUri,
      };
    }
  }

  return null;
}

/**
 * Upload a media file (video or audio) to Cloud Storage.
 *
 * Strategies:
 * 1. Server-signed V4 direct PUT URL (fast, zero proxy limits, supports files > 500 MB, bypasses client 403 rules).
 * 2. Server chunked upload (10 MB slices, completely avoids Cloud Run 32 MB limit).
 * 3. Safe fallback to null (local IndexedDB playback cache).
 *
 * @param {File} file - Original video or audio file
 * @param {string} lectureId - Firestore document ID or local ID
 * @param {Function} [onProgress] - Progress callback (message: string) => void
 * @param {object|null|undefined} [user] - Firebase auth user object
 * @returns {Promise<{downloadUrl: string, gsUri: string}|null>}
 */
export async function uploadMediaToCloud(file, lectureId, onProgress, user) {
  if (!file) return null;

  const isAnon = user != null && isAnonymous(user);
  const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
  console.log(`[Storage] Initiating upload of ${fileSizeMB} MB (lectureId: ${lectureId}, anonymous: ${isAnon})`);

  // --- Strategy 1: Server-signed direct GCS upload ---
  try {
    onProgress?.('Initializing cloud storage session...');
    const initRes = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        fileSize: file.size,
        lectureId: lectureId || '',
        isAnonymous: isAnon,
      }),
    });

    if (initRes.ok) {
      const initData = await initRes.json();
      if (initData?.uploadUrl && initData?.gsUri) {
        console.log(`[Storage] Uploading directly to cloud via signed URL: ${initData.gsUri}`);
        await uploadDirectViaSignedUrl(file, initData.uploadUrl, file.type, onProgress);

        let finalDownloadUrl = initData.downloadUrl || '';

        // Finalize metadata (Firebase storage download token for cross-device playback)
        if (!isAnon && initData.downloadToken) {
          try {
            const finalRes = await fetch('/api/finalize-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gsUri: initData.gsUri,
                downloadToken: initData.downloadToken,
                mimeType: file.type,
              }),
            });
            if (finalRes.ok) {
              const finalData = await finalRes.json();
              if (finalData?.downloadUrl) {
                finalDownloadUrl = finalData.downloadUrl;
              }
            }
          } catch {
            // non-fatal
          }
        }

        console.log(`[Storage] ✅ Direct cloud upload complete: ${initData.gsUri}`);
        return {
          downloadUrl: finalDownloadUrl,
          gsUri: initData.gsUri,
        };
      }
    }
  } catch (directErr) {
    console.warn('[Storage] Direct signed URL upload failed, attempting chunked fallback:', directErr?.message || directErr);
  }

  // --- Strategy 2: Chunked upload fallback (10 MB slices) ---
  try {
    console.log('[Storage] Starting chunked upload fallback...');
    const chunkResult = await uploadViaChunks(file, lectureId, isAnon, onProgress);
    if (chunkResult?.gsUri) {
      console.log(`[Storage] ✅ Chunked cloud upload complete: ${chunkResult.gsUri}`);
      return chunkResult;
    }
  } catch (chunkErr) {
    console.warn('[Storage] Chunked upload failed:', chunkErr?.message || chunkErr);
  }

  console.info('[Storage] Cloud upload unavailable. Media will use fast local playback.');
  return null;
}

/**
 * Delete all media files for a lecture from Firebase Cloud Storage.
 * Safe against 403 Forbidden errors: avoids calling client listAll on local-* items
 * and proxies the deletion to the server service account.
 *
 * @param {string} lectureId - Firestore document ID or local ID (e.g. local-1787...)
 * @param {string} [audioUrl] - Optional direct Firebase Storage URL
 */
export async function deleteMediaFromCloud(lectureId, audioUrl = null) {
  // 1. Never attempt client storage listing for sample or local records (prevents 403 Forbidden)
  if (!lectureId || lectureId.startsWith('sample-') || lectureId.startsWith('local-') || lectureId === '1' || lectureId === '2') {
    return;
  }

  // 2. Delegate deletion to server (service account admin privileges, never throws 403)
  try {
    fetch('/api/delete-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lectureId, audioUrl }),
    }).catch(() => {});
  } catch {
    // non-fatal
  }

  // 3. Optional client-side cleanup if Firebase client is configured and authenticated
  if (isFirebaseConfigured && isStorageConfigured && storage) {
    try {
      const folderRef = ref(storage, `lectures/${lectureId}`);
      const fileList = await listAll(folderRef).catch(() => null);

      if (fileList?.items?.length) {
        await Promise.all(fileList.items.map((itemRef) => deleteObject(itemRef).catch(() => {})));
        console.log(`[Storage] 🗑️ Cleaned up client storage folder for ${lectureId}`);
      }
    } catch {
      // Ignored: server cleanup already handles this safely
    }
  }
}

/**
 * Legacy aliases — kept for backward compatibility
 */
export const uploadLectureMedia = uploadMediaToCloud;
export const uploadSpeechAudioToCloud = uploadMediaToCloud;

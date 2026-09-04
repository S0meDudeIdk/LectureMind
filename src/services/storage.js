import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage, isFirebaseConfigured, isStorageConfigured } from './firebase';
import { isAnonymous } from '../utils/authLimits';

/**
 * Upload a media file (video or audio) to Firebase Cloud Storage
 * using Firebase SDK's resumable upload (handles files of any size).
 * Returns a permanent cross-device HTTPS download URL.
 * Falls back safely to null on storage errors (e.g. retry limit exceeded, bucket disabled).
 *
 * @param {File} file - Original video or audio file
 * @param {string} lectureId - Firestore document ID (used as storage key)
 * @param {Function} [onProgress] - Progress callback (message: string) => void
 * @param {object|null|undefined} [user] - Firebase auth user object
 * @returns {Promise<{downloadUrl: string, gsUri: string}|null>} - Public download URL and gs:// URI, or null on failure
 */
export async function uploadMediaToCloud(file, lectureId, onProgress, user) {
  if (!file || !lectureId) return null;

  // Skip Firebase Storage for explicitly anonymous users (local-only mode)
  if (user != null && isAnonymous(user)) {
    return null;
  }

  if (!isFirebaseConfigured || !isStorageConfigured || !storage) {
    console.info('[Storage] Firebase Storage bucket not configured. Using local IndexedDB cache.');
    return null;
  }

  try {
    const ext = (file.name || 'media').split('.').pop()?.toLowerCase() || 'mp4';
    const storagePath = `lectures/${lectureId}/media.${ext}`;
    const storageRef = ref(storage, storagePath);

    console.log(`[Storage] Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB to Firebase Storage...`);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        originalFileName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    return await new Promise((resolve) => {
      let isSettled = false;

      // Stall watchdog: If zero upload progress occurs for 90 seconds, log notice
      let lastActivityTime = Date.now();
      const stallCheckInterval = setInterval(() => {
        if (!isSettled && Date.now() - lastActivityTime > 90000) {
          clearInterval(stallCheckInterval);
          isSettled = true;
          try {
            uploadTask.cancel();
          } catch {}
          console.info('[Storage] Cloud upload stalled for 90s. Continuing with local playback storage.');
          resolve(null);
        }
      }, 10000);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          lastActivityTime = Date.now();
          if (snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress?.(`Uploading to cloud storage (${pct}%)...`);
          }
        },
        (error) => {
          clearInterval(stallCheckInterval);
          if (isSettled) return;
          isSettled = true;

          // Gracefully log recognized non-fatal storage fallback causes
          const errorCode = error?.code || 'unknown';
          if (errorCode === 'storage/retry-limit-exceeded') {
            console.info('[Storage] Cloud storage reached retry limit (unreachable bucket or network restriction). Local media playback will be used.');
          } else if (errorCode === 'storage/unauthorized') {
            console.info('[Storage] Cloud storage unauthorized (check Firebase storage rules). Local media playback will be used.');
          } else if (errorCode === 'storage/canceled') {
            console.info('[Storage] Cloud storage upload canceled.');
          } else {
            console.info(`[Storage] Cloud storage unavailable (${errorCode}). Local media playback will be used.`);
          }

          resolve(null);
        },
        async () => {
          clearInterval(stallCheckInterval);
          if (isSettled) return;
          isSettled = true;

          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const gsUri = `gs://${storageRef.bucket}/${storageRef.fullPath}`;
            console.log('[Storage] ✅ Media uploaded successfully:', downloadUrl, gsUri);
            resolve({ downloadUrl, gsUri });
          } catch {
            console.info('[Storage] Could not retrieve download URL. Using local media playback.');
            resolve(null);
          }
        }
      );
    });
  } catch (err) {
    console.info('[Storage] Cloud upload initialization skipped:', err?.message || err);
    return null;
  }
}

/**
 * Delete all media files for a lecture from Firebase Cloud Storage.
 * Removes the entire lectures/{lectureId}/ folder and/or specific audioUrl.
 *
 * @param {string} lectureId - Firestore document ID or local ID (e.g. local-1787...)
 * @param {string} [audioUrl] - Optional direct Firebase Storage URL
 */
export async function deleteMediaFromCloud(lectureId, audioUrl = null) {
  if (!isFirebaseConfigured || !isStorageConfigured || !storage) return;

  try {
    // 1. Delete all items inside lectures/{lectureId}/ folder
    if (lectureId && !lectureId.startsWith('sample-') && lectureId !== '1' && lectureId !== '2') {
      try {
        const folderRef = ref(storage, `lectures/${lectureId}`);
        const fileList = await listAll(folderRef);

        const deletePromises = fileList.items.map((itemRef) =>
          deleteObject(itemRef).catch(() => {})
        );

        await Promise.all(deletePromises);
        console.log(`[Storage] 🗑️ Deleted all media in lectures/${lectureId}`);
      } catch {
        // non-fatal
      }
    }

    // 2. If direct audioUrl is provided, delete by URL
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.includes('firebasestorage.googleapis.com')) {
      try {
        const fileRef = ref(storage, audioUrl);
        await deleteObject(fileRef);
        console.log(`[Storage] 🗑️ Deleted media by URL:`, audioUrl);
      } catch {
        // file may already be deleted or not found
      }
    }
  } catch (err) {
    console.info('[Storage] Cloud cleanup finished:', err?.message || err);
  }
}

/**
 * Legacy alias — kept for backward compatibility
 */
export const uploadLectureMedia = uploadMediaToCloud;
export const uploadSpeechAudioToCloud = uploadMediaToCloud;

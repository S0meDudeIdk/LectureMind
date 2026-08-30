import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage, isFirebaseConfigured } from './firebase';

/**
 * Upload a media file (video or audio) to Firebase Cloud Storage
 * using Firebase SDK's resumable upload (handles files of any size).
 * Returns a permanent cross-device HTTPS download URL.
 *
 * @param {File} file - Original video or audio file
 * @param {string} lectureId - Firestore document ID (used as storage key)
 * @param {Function} [onProgress] - Progress callback (message: string) => void
 * @returns {Promise<string|null>} - Permanent HTTPS URL or null on failure
 */
export async function uploadMediaToCloud(file, lectureId, onProgress) {
  if (!file || !lectureId) return null;

  if (!isFirebaseConfigured || !storage) {
    console.warn('[Storage] Firebase Storage not initialized. Skipping cloud upload.');
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

    return await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress?.(`Uploading to cloud storage (${pct}%)...`);
          }
        },
        (error) => {
          console.warn('[Storage] Firebase upload error (non-fatal):', error);
          resolve(null);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[Storage] ✅ Media uploaded successfully:', downloadUrl);
            resolve(downloadUrl);
          } catch (urlErr) {
            console.warn('[Storage] Failed to retrieve download URL:', urlErr);
            resolve(null);
          }
        }
      );
    });
  } catch (err) {
    console.warn('[Storage] Upload initialization failed (non-fatal):', err);
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
  if (!isFirebaseConfigured || !storage) return;

  try {
    // 1. Delete all items inside lectures/{lectureId}/ folder
    if (lectureId && !lectureId.startsWith('sample-') && lectureId !== '1' && lectureId !== '2') {
      try {
        const folderRef = ref(storage, `lectures/${lectureId}`);
        const fileList = await listAll(folderRef);

        const deletePromises = fileList.items.map((itemRef) =>
          deleteObject(itemRef).catch((err) =>
            console.warn(`[Storage] Failed to delete ${itemRef.fullPath}:`, err)
          )
        );

        await Promise.all(deletePromises);
        console.log(`[Storage] 🗑️ Deleted all media in lectures/${lectureId}`);
      } catch (folderErr) {
        console.warn(`[Storage] Folder deletion error for ${lectureId}:`, folderErr);
      }
    }

    // 2. If direct audioUrl is provided, delete by URL
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.includes('firebasestorage.googleapis.com')) {
      try {
        const fileRef = ref(storage, audioUrl);
        await deleteObject(fileRef);
        console.log(`[Storage] 🗑️ Deleted media by URL:`, audioUrl);
      } catch (urlErr) {
        // file may already be deleted by folder listAll
      }
    }
  } catch (err) {
    console.warn('[Storage] Cleanup failed (non-fatal):', err);
  }
}

/**
 * Legacy alias — kept for backward compatibility
 */
export const uploadLectureMedia = uploadMediaToCloud;
export const uploadSpeechAudioToCloud = uploadMediaToCloud;

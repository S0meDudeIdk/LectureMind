import { apiFetch, apiJson } from './apiClient';

function uploadDirect(file, session, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    xhr.open('PUT', session.uploadUrl);
    for (const [name, value] of Object.entries(session.headers || { 'Content-Type': file.type })) {
      if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
    }
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(`Uploading recording (${Math.round(e.loaded / e.total * 100)}%)...`); };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Direct upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => { cleanup(); reject(new Error('Direct upload unavailable.')); };
    xhr.ontimeout = () => { cleanup(); reject(new Error('Upload timed out.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
export async function uploadMediaToCloud(file, lectureId, onProgress, user, options = {}) {
  if (!user?.uid) throw new Error('Connect and wait for authentication before uploading.');
  const { signal, kind = 'source' } = options;
  const session = await apiJson('/api/get-upload-url', {
    lectureId, fileName: file.name, mimeType: file.type, fileSize: file.size, kind,
  }, { signal });
  try {
    try {
      if (!session.uploadUrl) throw new Error('Direct upload unavailable.');
      await uploadDirect(file, session, onProgress, signal);
    }
    catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw error;
      // Reuse the owned session; chunks survive routing to another server instance.
      const size = session.chunkSize || 10 * 1024 * 1024;
      for (let index = 0; index < Math.ceil(file.size / size); index++) {
        onProgress?.(`Uploading recording (${Math.round(index * size / file.size * 100)}%)...`);
        await apiFetch('/api/upload-chunk', { method: 'POST', signal,
          headers: { 'Content-Type': 'application/octet-stream', 'x-upload-id': session.uploadId, 'x-chunk-index': String(index) },
          body: file.slice(index * size, Math.min(file.size, (index + 1) * size)),
        });
      }
    }
    return await apiJson('/api/finalize-upload', { uploadId: session.uploadId }, { signal });
  } catch (error) {
    await apiJson('/api/delete-media', { uploadId: session.uploadId }).catch(() => {});
    throw error;
  }
}
export async function getMediaPlaybackUrl(uploadId, signal) {
  return (await apiJson('/api/media-url', { uploadId }, { signal })).downloadUrl;
}
export async function deleteMediaFromCloud(lectureId, _audioUrl, user) {
  if (!user?.uid || user.isAnonymous || lectureId.startsWith('sample-')) return;
  await apiJson('/api/delete-media', { lectureId });
}
export const uploadLectureMedia = uploadMediaToCloud;
export const uploadSpeechAudioToCloud = uploadMediaToCloud;

import { apiJson } from './apiClient';
import { validateLectureContent } from '../../shared/lectureContract.js';

export function resolveMimeType(file) {
  const type = String(file?.type || '').toLowerCase().split(';')[0];
  if (['audio/m4a', 'audio/x-m4a'].includes(type)) return 'audio/mp4';
  if (type === 'audio/mp3') return 'audio/mpeg';
  return type;
}
export async function generateLectureContent(rawFile, onProgress, options = {}) {
  if (!options.uploadId) throw new Error('A completed owned upload is required.');
  onProgress?.('Analyzing the recording...');
  const started = Date.now();
  const timer = setInterval(() => onProgress?.(`Analyzing the recording... (${Math.round((Date.now() - started) / 1000)}s)`), 3000);
  try {
    const data = await apiJson('/api/generate-lecture', {
      uploadId: options.uploadId, jobId: options.jobId,
      duration: options.duration || 0,
      isVideo: options.originalIsVideo ?? rawFile?.type?.startsWith('video/'),
      promptText: 'Produce a hierarchical Markdown mindmap, comprehensive study notes with LaTeX, and a chronological verbatim transcript of this recording. Use ===MINDMAP_START=== and ===MINDMAP_END===, ===NOTES_START=== and ===NOTES_END===, ===TRANSCRIPT_START=== and ===TRANSCRIPT_END=== in that order. For the transcript, output a valid JSON array of {startTime:"HH:MM:SS",textBlock:"spoken words"} in strictly ascending chronological order starting from 00:00:00, grouping speech into natural 15 to 30 second segments so the entire lecture fits within output limits. Do not fabricate unheard speech.',
    }, { signal: options.signal });
    return validateLectureContent(data);
  } finally { clearInterval(timer); }
}
export async function generateLectureContentFromUpload(file, onProgress, options = {}) {
  const { uploadMediaToCloud } = await import('./storage');
  const result = await uploadMediaToCloud(file, options.lectureId, onProgress, options.user, { signal: options.signal, kind: 'processing' });
  return generateLectureContent(file, onProgress, { ...options, uploadId: result.uploadId });
}
export async function cancelGeneration(jobId) {
  if (jobId) await apiJson(`/api/jobs/${jobId}/cancel`, {}).catch(() => {});
}

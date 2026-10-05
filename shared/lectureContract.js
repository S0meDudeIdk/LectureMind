/** Shared wire validation; empty transcript and absent playback media are valid. */
export const SCHEMA_VERSION = 2;
export const MEDIA_TYPES = Object.freeze(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac', 'video/mp4', 'video/webm', 'video/quicktime']);
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function timestampSeconds(value) {
  if (typeof value !== 'string' || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) throw new Error('Invalid transcript timestamp.');
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(n => n > 59)) throw new Error('Invalid transcript timestamp.');
  return parts.reduce((seconds, n) => seconds * 60 + n, 0);
}
export function validateLectureContent(value) {
  if (!value || typeof value.markdown !== 'string' || !value.markdown.trim() || typeof value.notes !== 'string' || !value.notes.trim() || !Array.isArray(value.transcript)) {
    throw new Error('Lecture output is incomplete: mindmap, notes, and transcript are required.');
  }
  let previous = -1;
  for (const chunk of value.transcript) {
    if (!chunk || typeof chunk.textBlock !== 'string' || !chunk.textBlock.trim()) throw new Error('Invalid transcript entry.');
    const current = timestampSeconds(chunk.startTime);
    if (current < previous) throw new Error('Transcript timestamps must be ordered.');
    previous = current;
  }
  return { markdown: value.markdown, notes: value.notes, transcript: value.transcript };
}
export function validateMedia(file, limit) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit) throw new Error('Recording size is invalid or exceeds the upload limit.');
  const mimeType = String(file.type || '').toLowerCase().split(';')[0];
  if (!MEDIA_TYPES.includes(mimeType)) throw new Error('Unsupported recording type.');
  return mimeType;
}

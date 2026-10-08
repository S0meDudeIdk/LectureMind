import { apiJson } from './apiClient';
import { validateLectureContent } from '../../shared/lectureContract.js';

export function resolveMimeType(file) {
  const type = String(file?.type || '').toLowerCase().split(';')[0];
  if (['audio/m4a', 'audio/x-m4a'].includes(type)) return 'audio/mp4';
  if (type === 'audio/mp3') return 'audio/mpeg';
  return type;
}
export const LECTURE_PROMPT = `Analyze the provided lecture recording with utmost academic rigor and generate three comprehensive sections in strict order:

===MINDMAP_START===
Create an extensive, highly detailed multi-level hierarchical Markdown mindmap of the lecture:
# [Central Topic / Lecture Title]
## [Major Theme / Core Unit 1]
- [Key Concept or Principle]
  - [Detailed mechanism, argument, or formula ($inline LaTeX$)]
  - [Sub-concept, supporting evidence, or nuance]
- [Definition or Method]
  - [Step-by-step detail or example]
## [Major Theme / Core Unit 2]
...
(Include 4 to 8 detailed major branches (##) covering all topics discussed in the recording. Under each branch, provide rich sub-branches and deeply nested bullet points with definitions, mechanisms, equations, arguments, and practical examples. Do NOT output a simple or brief outline—ensure deep, comprehensive coverage so the mindmap visually reflects the full depth of the lecture.)
===MINDMAP_END===

===NOTES_START===
Produce comprehensive study notes in Markdown:
# [Lecture Title]
## Executive Summary
Detailed executive summary of the lecture.
## Key Conceptual Frameworks & Detailed Analysis
Detailed sections with in-depth analysis, mechanisms, and equations in LaTeX ($...$ inline and $$...$$ block format).
## Practical Applications & Case Studies
Concrete applications, examples, and implications.
## Key Takeaways
Summary of crucial takeaways and review questions.
===NOTES_END===

===TRANSCRIPT_START===
[
  {"startTime": "00:00:00", "textBlock": "Verbatim spoken words in this segment..."},
  {"startTime": "00:00:20", "textBlock": "Next segment of spoken words..."}
]
===TRANSCRIPT_END===
CRITICAL RULES FOR TRANSCRIPT:
1. The TRANSCRIPT section must contain ONLY a valid JSON array of objects with "startTime" (in strictly ascending HH:MM:SS or MM:SS format) and "textBlock" (exact spoken words).
2. Group speech into natural 15 to 30 second segments starting from 00:00:00.
3. Escape all quotes inside textBlock with backslashes (\\"). Do NOT add trailing commas. Do NOT wrap in markdown code blocks or add text before or after the JSON array.
4. If there is no speech in the recording, output an empty JSON array []. Do not fabricate unheard speech.`;

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
      promptText: LECTURE_PROMPT,
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

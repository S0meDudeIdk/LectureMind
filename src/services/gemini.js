import { getMediaDuration } from './mediaProcessor';

// Server-side model fallback list — the actual fallback loop now runs on the
// /api/generate-lecture server endpoint. Kept here for reference and backwards
// compatibility in case callers still import it.
export const FALLBACK_MODELS = [
  'gemini-3.8-flash',          // Primary high-speed multimodal model (fastest & rock solid)
  'gemini-3.7-flash',          // Secondary fallback
  'gemini-3.6-flash',          // Tertiary fallback
  'gemini-3.5-flash',          // Quaternary fallback
  'gemini-3.5-flash-lite',     // Lightweight fallback
];

// Helper: Resolve exact MIME type from file or extension
export const resolveMimeType = (file) => {
  const rawType = (file?.type || '').split(';')[0].trim().toLowerCase();
  const ext = (file?.name || '').split('.').pop()?.toLowerCase() || '';

  const extMap = {
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    wave: 'audio/wav',
    m4a: 'audio/m4a',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    flac: 'audio/flac',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
  };

  if (extMap[ext]) {
    if (ext === 'mp3') return rawType === 'audio/mpeg' ? 'audio/mpeg' : 'audio/mp3';
    if (ext === 'wav' || ext === 'wave') return 'audio/wav';
    if (ext === 'm4a') return 'audio/m4a';
    if (ext === 'mp4') return 'video/mp4';
    return extMap[ext];
  }

  if (rawType) {
    if (rawType.includes('mpeg') || rawType.includes('mp3')) return 'audio/mp3';
    if (rawType.includes('wav')) return 'audio/wav';
    if (rawType.includes('m4a') || rawType.includes('x-m4a')) return 'audio/m4a';
    if (rawType.includes('aac')) return 'audio/aac';
    if (rawType.includes('flac')) return 'audio/flac';
    if (rawType.includes('ogg')) return 'audio/ogg';
    if (rawType.includes('quicktime')) return 'video/quicktime';
    if (rawType.includes('webm')) return rawType.startsWith('audio') ? 'audio/webm' : 'video/webm';
    if (rawType.includes('mp4')) return rawType.startsWith('audio') ? 'audio/mp4' : 'video/mp4';
    return rawType;
  }

  return 'audio/mp3';
};

// Format seconds into a human-readable timestamp for the prompt context.
const formatDuration = (durationSec) => {
  if (!durationSec || durationSec <= 0) return '';
  const totalSec = Math.floor(durationSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Build the same user prompt text previously sent to Gemini, now passed to the
// server-side /api/generate-lecture endpoint.
const buildPromptText = (formattedDuration) => {
  const durationContext = formattedDuration ? `Total Recording Duration: ${formattedDuration}.` : '';

  return `Synthesize and transcribe this entire lecture. ${durationContext}
Analyze BOTH the spoken audio AND the visual slide snapshots.

Requirements:
1. Mindmap: Rich, multi-level hierarchical tree (flexible 3 to 6+ levels deep). Nodes must be concise phrases of 4 to 6 words MAX. Include real numbers, digits, symbols, and mathematical equations.
2. Verbatim Transcript (CRITICAL HIGHEST PRIORITY):
   - Transcribe the EXACT WORDS the speaker says in the audio track. This is speech-to-text, NOT a summary.
   - The first transcript chunk must start at the EXACT second the speaker's voice first appears (skip intro music/silence/titles).
   - Generate 40-80+ chronological chunks spanning from the first spoken word to the last, across the FULL duration ending near ${formattedDuration || 'the end'}.
   - Timestamps must be HH:MM:SS format for recordings over 1 hour.
   - FORBIDDEN in transcript: summaries, paraphrasing, third-person narration like "The instructor discusses..." or "This section covers...". Only actual spoken words.
3. Study Notes: Comprehensive, detailed textbook-style notes with LaTeX math ($...$ and $$...$$).

Output the three sections using the exact delimiters in this exact order:
===MINDMAP_START===
===TRANSCRIPT_START===
===NOTES_START===`;
};

/**
 * Resilient multi-strategy extractor for verbatim transcript chunks.
 * Handles valid JSON, truncated JSON arrays, raw markdown codeblocks, and regex chunk recovery.
 * @param {string} text - Raw transcript text
 * @returns {Array<{startTime: string, textBlock: string}>}
 */
const extractTranscriptChunks = (text) => {
  if (!text || typeof text !== 'string') return [];

  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }
  cleaned = cleaned.trim();

  // 1. First attempt: Direct JSON.parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((item) => item && (item.textBlock || item.text))
        .map((item) => ({
          startTime: String(item.startTime || item.timestamp || item.time || '00:00').trim(),
          textBlock: String(item.textBlock || item.text || '').trim(),
        }));
    }
  } catch {
    // Continue to next recovery strategy
  }

  // 2. Second attempt: Extract complete JSON array substring [...]
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((item) => item && (item.textBlock || item.text))
          .map((item) => ({
            startTime: String(item.startTime || item.timestamp || item.time || '00:00').trim(),
            textBlock: String(item.textBlock || item.text || '').trim(),
          }));
      }
    } catch {
      // Continue to regex recovery
    }
  }

  // 3. Third attempt: Resilient Regex Object Recovery (handles truncated/incomplete JSON arrays)
  const chunks = [];
  const objRegex = /\{[^{}]*"(?:startTime|timestamp|time)"\s*:\s*"([^"]+)"[^{}]*"(?:textBlock|text|content)"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/gi;
  let match;
  while ((match = objRegex.exec(cleaned)) !== null) {
    try {
      const startTime = match[1].trim();
      const textBlock = match[2].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
      if (startTime && textBlock) {
        chunks.push({ startTime, textBlock });
      }
    } catch {
      // skip malformed item
    }
  }

  if (chunks.length > 0) return chunks;

  // 4. Fourth attempt: Line-by-line timestamp format (e.g. "[00:01:23] Dialogue...")
  const lineRegex = /(?:\[|\b)(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\b)\s*[-:]?\s*(.+)/g;
  let lineMatch;
  while ((lineMatch = lineRegex.exec(cleaned)) !== null) {
    const startTime = lineMatch[1].trim();
    const textBlock = lineMatch[2].trim();
    if (startTime && textBlock && textBlock.length > 2) {
      chunks.push({ startTime, textBlock });
    }
  }

  return chunks;
};

/**
 * Parse Gemini's structured response text into mindmap, notes, and transcript.
 * Robust against missing delimiters, truncated sections, or reordered blocks.
 * @param {string} rawText - Raw text from Gemini model
 * @returns {{ markdown: string, notes: string, transcript: Array }}
 */
const parseGeminiResponse = (rawText) => {
  if (!rawText) return { markdown: "", notes: "", transcript: [] };

  let markdown = "";
  let notes = "";
  let transcript = [];

  // Helper: clean markdown fences
  const cleanFences = (str) => {
    if (!str) return '';
    let s = str.trim();
    if (s.startsWith('```markdown')) s = s.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');
    else if (s.startsWith('```')) s = s.replace(/^```\n?/, '').replace(/\n?```$/, '');
    return s.trim();
  };

  // 1. Extract Mindmap
  if (rawText.includes('===MINDMAP_START===')) {
    const mindmapAfter = rawText.split('===MINDMAP_START===')[1];
    if (mindmapAfter.includes('===MINDMAP_END===')) {
      markdown = mindmapAfter.split('===MINDMAP_END===')[0].trim();
    } else if (mindmapAfter.includes('===TRANSCRIPT_START===')) {
      markdown = mindmapAfter.split('===TRANSCRIPT_START===')[0].trim();
    } else if (mindmapAfter.includes('===NOTES_START===')) {
      markdown = mindmapAfter.split('===NOTES_START===')[0].trim();
    } else {
      markdown = mindmapAfter.trim();
    }
  }

  // 2. Extract Transcript
  if (rawText.includes('===TRANSCRIPT_START===')) {
    const transcriptAfter = rawText.split('===TRANSCRIPT_START===')[1];
    let transcriptText = "";
    if (transcriptAfter.includes('===TRANSCRIPT_END===')) {
      transcriptText = transcriptAfter.split('===TRANSCRIPT_END===')[0].trim();
    } else if (transcriptAfter.includes('===NOTES_START===')) {
      transcriptText = transcriptAfter.split('===NOTES_START===')[0].trim();
    } else {
      transcriptText = transcriptAfter.trim();
    }
    transcript = extractTranscriptChunks(transcriptText);
  }

  // If transcript not found via delimiter, search rawText directly for JSON array containing startTime
  if (transcript.length === 0) {
    transcript = extractTranscriptChunks(rawText);
  }

  // 3. Extract Detailed Notes
  if (rawText.includes('===NOTES_START===')) {
    const notesAfter = rawText.split('===NOTES_START===')[1];
    if (notesAfter.includes('===NOTES_END===')) {
      notes = notesAfter.split('===NOTES_END===')[0].trim();
    } else {
      notes = notesAfter.trim();
    }
  }

  // Fallback for legacy format with ===SECTION_SPLIT===
  if (!markdown && rawText.includes('===SECTION_SPLIT===')) {
    const parts = rawText.split('===SECTION_SPLIT===');
    markdown = parts[0].trim();
    try {
      transcript = extractTranscriptChunks(parts[1]);
    } catch {}
  }

  // Fallback if no delimiter was captured
  if (!markdown) {
    markdown = rawText;
  }

  markdown = cleanFences(markdown);
  notes = cleanFences(notes);

  if (!notes) {
    notes = markdown;
  }

  // Normalize single-line block math to standard multi-line block math format ($$\nformula\n$$)
  if (notes) {
    notes = notes.replace(/(?:^|\n)\s*\$\$([^\n]+?)\$\$\s*(?=\n|$)/g, (match, formula) => {
      return `\n\n$$\n${formula.trim()}\n$$\n\n`;
    });
  }

  return { markdown, notes, transcript };
};

/**
 * Shared progress UI helper for AI generation.
 */
const runGenerationWithProgress = async (fetchPromise, onProgress) => {
  onProgress?.("Synthesizing lecture insights on AI server...");
  const startTime = Date.now();
  const progressTimer = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    onProgress?.(`Synthesizing lecture insights on AI server... (${elapsedSec}s)`);
  }, 3000);

  try {
    const response = await fetchPromise;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`AI lecture synthesis failed (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();

    if (!data || typeof data.markdown !== 'string') {
      throw new Error("AI server returned an invalid response shape.");
    }

    onProgress?.("Lecture synthesis complete!");

    return {
      markdown: data.markdown,
      notes: data.notes || data.markdown,
      transcript: Array.isArray(data.transcript) ? data.transcript : [],
    };
  } catch (err) {
    console.warn('[Gemini] Server generation error:', err);
    throw new Error(`AI lecture synthesis failed: ${err?.message || 'Server internal error. Please try again.'}`);
  } finally {
    clearInterval(progressTimer);
  }
};

/**
 * High-Speed Multimodal Analysis: sends lecture media metadata and prompt to the
 * server-side /api/generate-lecture endpoint, which streams the media from
 * Firebase Storage (gs:// URI) to Vertex AI and returns parsed sections.
 *
 * @param {File} rawFile - Audio/video media file (metadata source)
 * @param {function} onProgress - Status callback
 * @param {object} [options] - Must include { gsUri } from Firebase Storage
 * @returns {Promise<{ markdown: string, notes: string, transcript: Array }>}
 */
export const generateLectureContent = async (rawFile, onProgress, options = {}) => {
  const gsUri = options?.gsUri;
  if (!gsUri) {
    throw new Error("Missing gsUri: media must be uploaded to Firebase Storage before AI generation.");
  }

  const isVideo = rawFile?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(rawFile?.name || '');
  const mediaMimeType = resolveMimeType(rawFile);

  onProgress?.("Inspecting media metadata...");

  // 1. Extract media metadata used by the server to route and prompt Vertex AI.
  const durationSec = await getMediaDuration(rawFile);
  const formattedDuration = formatDuration(durationSec);

  // 2. Build the same user prompt text previously sent to the Gemini model.
  const promptText = buildPromptText(formattedDuration);

  // 3. Send to the server-side Vertex AI endpoint.
  return runGenerationWithProgress(
    fetch('/api/generate-lecture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gsUri,
        mimeType: mediaMimeType,
        duration: durationSec,
        isVideo,
        promptText,
      }),
    }),
    onProgress
  );
};

/**
 * Anonymous-friendly generation: uploads the raw media file to a temporary
 * server-side GCS bucket, then runs Vertex AI and returns parsed sections.
 * The server deletes the staged GCS object after generation.
 *
 * @param {File} rawFile - Audio/video media file
 * @param {function} onProgress - Status callback
 * @returns {Promise<{ markdown: string, notes: string, transcript: Array }>}
 */
export const generateLectureContentFromUpload = async (rawFile, onProgress) => {
  if (!rawFile) {
    throw new Error('Missing media file for upload-based generation.');
  }

  const isVideo = rawFile?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(rawFile?.name || '');
  const mediaMimeType = resolveMimeType(rawFile);

  onProgress?.("Inspecting media metadata...");

  const durationSec = await getMediaDuration(rawFile);
  const formattedDuration = formatDuration(durationSec);
  const promptText = buildPromptText(formattedDuration);

  const formData = new FormData();
  formData.append('file', rawFile);
  formData.append('mimeType', mediaMimeType);
  formData.append('duration', String(durationSec || 0));
  formData.append('isVideo', String(isVideo));
  formData.append('promptText', promptText);

  onProgress?.("Uploading media to temporary AI storage...");

  return runGenerationWithProgress(
    fetch('/api/generate-lecture-upload', {
      method: 'POST',
      body: formData,
    }),
    onProgress
  );
};

// Legacy alias helpers
export const generateMindmap = async (file, onProgress) => {
  const content = await generateLectureContent(file, onProgress);
  return content.markdown;
};

export const generateTranscript = async (file, onProgress) => {
  const content = await generateLectureContent(file, onProgress);
  return content.transcript;
};

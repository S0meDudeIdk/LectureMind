import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractSpeechAudio, extractVideoKeyframes, getMediaDuration } from './mediaProcessor';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// Active Gemini models — prioritized by live availability and reliability
export const FALLBACK_MODELS = [
  'gemini-3.7-flash',          // Primary high-speed multimodal model (fastest & rock solid)
  'gemini-3.6-flash',          // Secondary fallback
  'gemini-3.5-flash',          // Tertiary fallback
  'gemini-flash-latest',       // High-availability alias fallback
  'gemini-3.1-flash-lite-preview', // Fast lightweight fallback
  'gemini-3.8-flash',          // High capacity fallback
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

// Unified Single-Pass System Prompt
export const UNIFIED_SYSTEM_PROMPT = `
You are an expert academic knowledge extractor, university lecture synthesist, and precise audio transcription engine.
Analyze the provided multimedia lecture recording (spoken audio and visual slides/chalkboard) to generate THREE distinct, high-precision sections in one single pass:

1. SECTION 1 (Mindmap Markdown):
   - HIERARCHICAL DEPTH & EXPANSIVENESS: Generate a richly structured, multi-level hierarchical tree. You are NOT limited to 4 levels — flexibly use 3 to 6+ levels of depth (# Core Topic, ## Major Branch / Part, ### Concept / Algorithm, #### Mechanism / Policy, ##### Mathematical Formula / Step, - Granular detail / Example / Tradeoff).
   - EXHAUSTIVE COVERAGE: Scale the mindmap with the lecture's length. For multi-hour or deep technical lectures (e.g. 1 to 4 hours), create an expansive, comprehensive tree branching out into EVERY algorithm, metric, formula, equation, process table, comparison, and case study presented.
   - CONCISE NODE PHRASING: Every single node (headers AND bullets) MUST be a concise, information-dense keyword, formula, or short phrase of 4 to 6 words MAX. NEVER write long conversational sentences or paragraphs in the mindmap.
   - NUMERICAL & MATHEMATICAL PRECISION: ALWAYS use real numbers, digits, symbols, and mathematical equations ($a^2 + b^2 = c^2$, $q = 1$, $T_s = 3$, $T_r / T_s$, $R = \\frac{w + s}{s}$). NEVER spell out numbers or math as English words.
   - Use standard mathematical symbols (+, -, ×, ÷, =, ≠, ≈, ², ³, √, Δ, π, θ, λ, Ω) and LaTeX math ($a^2 + b^2 = c^2$, $\\sqrt{a^2 + b^2}$).

2. SECTION 2 (Verbatim Word-for-Word Audio Transcript) — CRITICAL HIGHEST PRIORITY:
   - ⚠️ CRITICAL RULE: This section must contain the EXACT SPOKEN WORDS from the human audio track. You are a SPEECH-TO-TEXT transcription engine.
   - ABSOLUTELY FORBIDDEN: Do NOT summarize, paraphrase, rephrase, or generate textbook-style prose. Do NOT write third-person narration like "The instructor discusses...", "In this section, the speaker covers...", or "The video explains...". Only actual spoken words from the human voice.
   - LISTEN TO THE AUDIO TRACK: The speaker's voice in the audio is the sole source of truth. Ignore slide text unless the speaker reads it aloud.
   - ACTUAL SPOKEN WORDS: Transcribe the exact words, sentences, explanations, filler words ("um", "uh", "so", "you know"), and remarks spoken by the lecturer/students throughout the recording.
   - LANGUAGE RULE: Transcribe in the EXACT language the speaker's VOICE uses. If the speaker speaks English, the transcript MUST be in English. If the speaker speaks Vietnamese, the transcript MUST be in Vietnamese. NEVER translate.
   - FIRST SPEECH DETECTION: The first transcript chunk must start at the EXACT second the speaker first begins talking (e.g. if speaker starts at 0:53, the first chunk starts at "00:00:53", NOT "00:00:15").
   - CHRONOLOGICAL TIMELINE SPREAD: For a multi-hour recording (e.g. 1 to 4 hours), generate 40 to 80+ chronological chunks spaced across the FULL duration. Each chunk should contain 3-8 sentences of verbatim speech.
   - TIMESTAMP FORMAT: For recordings >= 1 hour, ALWAYS use HH:MM:SS format (e.g. "00:02:15", "01:14:30", "02:35:10", "03:58:20"). For recordings < 1 hour, use MM:SS (e.g. "03:45").
   - Schema: [{"startTime": "HH:MM:SS", "textBlock": "Exact verbatim spoken dialogue from the lecturer at this timestamp..."}]

3. SECTION 3 (Detailed Comprehensive Study Notes):
   - Comprehensive, textbook-quality lecture notes thoroughly synthesizing the lecture.
   - For mathematical, geometric, or scientific formulas, ALWAYS format with standard LaTeX:
     * Inline math: $a^2 + b^2 = c^2$
     * Block equations: ALWAYS put on separate dedicated lines with multi-line delimiters:
$$
\text{Area}_a + \text{Area}_b = \text{Area}_c
$$
     * NEVER put opening and closing $$ on the same line as the formula for block equations.
   - Structure with clean Markdown:
     * # Main Lecture Title
     * Brief executive summary / introduction paragraph.
     * ## Major Concept Headings
     * In-depth explanatory paragraphs detailing key concepts, mechanisms, and theories from the speaker.
     * ### Key Definitions, Principles & Nuances
     * Bulleted breakdowns with clear, full-sentence takeaways and formulas/examples.
     * ## Practical Applications & Case Studies
     * ## Summary & Key Takeaways

OUTPUT FORMAT BOUNDARIES (Follow these exact delimiters in this exact order):
===MINDMAP_START===
[Your 4-6 words per node Mindmap Markdown here]
===MINDMAP_END===

===TRANSCRIPT_START===
[Your JSON verbatim transcript array here — EXACT SPOKEN WORDS ONLY]
===TRANSCRIPT_END===

===NOTES_START===
[Your rich, detailed, comprehensive study notes here]
===NOTES_END===
`;

// Helper: Check if error is an authentication/permission error that cannot be resolved by retrying
const isFatalAuthError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 401 ||
    (status === 403 && (msg.includes('api_key_invalid') || msg.includes('api key not valid') || msg.includes('permission_denied') || msg.includes('consumer suspended'))) ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid')
  );
};

// Helper: Check if error is a transient server error, 500 internal, rate limit, quota, overloaded, or missing model error
const isRetryableModelError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 429 ||
    status === 404 ||
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status >= 500 && status < 600) ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('408') ||
    msg.includes('internal error') ||
    msg.includes('internal') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('capacity') ||
    msg.includes('unavailable') ||
    msg.includes('not found') ||
    msg.includes('no longer available') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset')
  );
};

// Helper: Convert File to Base64 (for small files < 20MB)
const fileToGenerativePart = async (file, mimeType) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: mimeType || file.type || 'audio/wav',
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper: Upload to Gemini File API (for files >= 20MB, supporting up to 1GB+)
// Uses Google's Resumable Chunked Upload protocol (8MB chunks):
// 1. Session is initialized directly (or via /api/gemini-init-upload if client key is missing).
// 2. Chunks are streamed DIRECTLY from browser to Google's upload endpoint (generativelanguage.googleapis.com).
//    - Slices file into 8MB chunks (0 memory bloat)
//    - Zero Nginx proxy bottlenecks or 413 errors
// Helper: Upload large media (>10MB) to Gemini File API
// Multi-strategy architecture:
// Strategy 1: Server Cloud URL Transfer (Fastest & 100% reliable when Firebase Storage upload is active)
// Strategy 2: Direct Server Stream (/api/gemini-upload-media) with live byte-progress & GoogleAIFileManager
// Strategy 3: Resumable chunk upload (fallback)
const uploadLargeFile = async (file, mimeType, onProgress, options = {}) => {
  if (!file || !file.size || file.size <= 0) {
    throw new Error("Invalid or empty file provided for upload.");
  }
  const totalSize = file.size;
  const fileName = (file.name || 'lecture_media').slice(0, 200).replace(/[^\w.\- ]+/g, '_');

  // Strategy 1: Server-side Transfer from Cloud Storage URL (e.g. Firebase Storage)
  if (options?.storageUrl || options?.cloudUploadPromise) {
    try {
      let storageUrl = options.storageUrl;
      if (!storageUrl && options.cloudUploadPromise) {
        onProgress?.("Uploading media to cloud storage for AI analysis...");
        // Wait up to 60 seconds for background cloud upload to complete
        storageUrl = await Promise.race([
          options.cloudUploadPromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 60000)),
        ]);
      }

      if (storageUrl) {
        onProgress?.("Connecting cloud media to Google Gemini AI...");
        const res = await fetch('/api/gemini-upload-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storageUrl,
            mimeType,
            displayName: fileName,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.file || data.fileUri) {
            console.log('[Gemini Upload] Successfully uploaded via cloud URL transfer:', data.name || data.file?.name);
            onProgress?.("Media connected to Gemini AI cloud!");
            return data.file || { name: data.name, uri: data.fileUri, mimeType: data.mimeType, state: 'ACTIVE' };
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.warn('[Gemini Upload] Cloud URL transfer returned error, falling back to direct stream:', res.status, errText);
        }
      }
    } catch (urlErr) {
      console.warn('[Gemini Upload] Cloud URL transfer failed, falling back to direct stream:', urlErr);
    }
  }

  // Strategy 2: Direct High-Speed Stream to Server (/api/gemini-upload-media)
  // Streams binary directly to server, which handles GoogleAIFileManager upload without browser CORS
  try {
    onProgress?.("Uploading media to AI server: 0%...");
    const streamResult = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/gemini-upload-media');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
      xhr.setRequestHeader('x-mime-type', mimeType);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      const startTime = Date.now();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
          const currentLoadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
          const totalMB = (e.total / (1024 * 1024)).toFixed(1);
          const speedMBps = ((e.loaded / (1024 * 1024)) / elapsedSec).toFixed(1);
          const remainingBytes = e.total - e.loaded;
          const etaSec = parseFloat(speedMBps) > 0 ? Math.round((remainingBytes / (1024 * 1024)) / parseFloat(speedMBps)) : 0;
          const etaText = etaSec > 0 ? ` • ETA ${etaSec}s` : '';
          onProgress?.(`Uploading media: ${percent}% (${currentLoadedMB}/${totalMB} MB • ${speedMBps} MB/s${etaText})...`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            resolve(parsed.file || { name: parsed.name, uri: parsed.fileUri, mimeType: parsed.mimeType, state: 'ACTIVE' });
          } catch (parseErr) {
            reject(parseErr);
          }
        } else {
          reject(new Error(`Server media upload failed (${xhr.status}): ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during media upload to AI server"));
      xhr.ontimeout = () => reject(new Error("Media upload to AI server timed out"));
      xhr.timeout = 900000; // 15 min

      xhr.send(file);
    });

    if (streamResult) {
      console.log('[Gemini Upload] Server stream upload completed successfully:', streamResult.name);
      onProgress?.("Media registered with Google Gemini AI!");
      return streamResult;
    }
  } catch (streamErr) {
    console.warn('[Gemini Upload] Server stream failed, falling back to direct chunk upload:', streamErr);
  }

  // Strategy 3: Direct Resumable Chunk Upload session fallback
  let uploadUri = null;
  try {
    const serverInitRes = await fetch('/api/gemini-init-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: fileName,
        mimeType,
        size: totalSize,
      }),
    });

    if (serverInitRes.ok) {
      const serverInitData = await serverInitRes.json();
      uploadUri = serverInitData.uploadUri;
    }
  } catch (serverErr) {
    console.warn('[Gemini Upload Init] Server init helper failed:', serverErr);
  }

  if (!uploadUri && API_KEY) {
    try {
      const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;
      const initRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': totalSize.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: { displayName: fileName }
        }),
      });

      if (initRes.ok) {
        uploadUri = initRes.headers.get('x-goog-upload-url');
      }
    } catch (directInitErr) {
      console.warn('[Gemini Upload Init] Direct init failed:', directInitErr);
    }
  }

  if (!uploadUri) {
    throw new Error("Failed to upload media to Gemini File API. Please check your network connection.");
  }

  // High-Speed Chunked Upload (8MB chunks)
  const CHUNK_SIZE = 8 * 1024 * 1024;
  let offset = 0;
  const startTime = Date.now();
  let finalResult = null;

  while (offset < totalSize) {
    const isLast = (offset + CHUNK_SIZE) >= totalSize;
    const end = isLast ? totalSize : offset + CHUNK_SIZE;
    const chunkBlob = file.slice(offset, end);
    const command = isLast ? 'upload, finalize' : 'upload';

    const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
    const currentUploadedMB = offset / (1024 * 1024);
    const speedMBps = (currentUploadedMB / elapsedSec).toFixed(1);
    const percent = Math.min(99, Math.round((offset / totalSize) * 100));

    onProgress?.(`Uploading media chunks: ${percent}% (${parseFloat(speedMBps) > 0 ? speedMBps + ' MB/s' : 'Starting'})...`);

    let chunkSuccess = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const chunkRes = await fetch(uploadUri, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Command': command,
            'X-Goog-Upload-Offset': offset.toString(),
            'Content-Type': mimeType,
          },
          body: chunkBlob,
        });

        if (chunkRes.ok) {
          if (isLast) {
            finalResult = await chunkRes.json();
          }
          chunkSuccess = true;
          break;
        } else {
          const statusText = await chunkRes.text().catch(() => '');
          lastError = new Error(`Chunk upload failed (${chunkRes.status}): ${statusText}`);
          console.warn(`[Gemini Chunk Upload] Attempt ${attempt} failed:`, lastError);
        }
      } catch (netErr) {
        lastError = netErr;
      }

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!chunkSuccess) {
      throw lastError || new Error(`Failed to upload media chunk at offset ${offset}`);
    }

    offset = end;
  }

  return finalResult?.file;
};

// Helper: Poll File API processing state until file is ACTIVE
const waitForActiveState = async (fileName, onProgress) => {
  let attempts = 0;
  const maxAttempts = 300; // Up to 15-20 minutes for massive 1GB video files

  while (attempts < maxAttempts) {
    attempts++;

    try {
      let data = null;

      // 1. Direct check with API_KEY
      if (API_KEY) {
        try {
          const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`;
          const res = await fetch(checkUrl);
          if (res.ok) {
            data = await res.json();
          }
        } catch (_) {}
      }

      // 2. Server proxy check if direct check failed or API_KEY not client-side
      if (!data) {
        try {
          const proxyRes = await fetch(`/api/gemini-status?fileName=${encodeURIComponent(fileName)}`);
          if (proxyRes.ok) {
            data = await proxyRes.json();
          }
        } catch (_) {}
      }

      if (data) {
        if (data.state === 'ACTIVE') {
          return true;
        }
        if (data.state === 'FAILED') {
          throw new Error(`File processing failed on Gemini server: ${data.error?.message || 'Unsupported format or corrupted file'}`);
        }
      }
    } catch (err) {
      if (err.message?.includes('failed on Gemini server')) throw err;
      console.warn('[Gemini File API] Polling error:', err);
    }

    const elapsedSec = attempts * 3;
    onProgress?.(`AI indexing media: ${elapsedSec}s elapsed...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error("Media processing timed out on Gemini server. Please try again.");
};

// Check if Gemini returned an apology saying no file was attached
const isNoAttachmentApology = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    (lower.includes('no audio') || lower.includes('no video') || lower.includes('no transcript') || lower.includes('no file')) &&
    (lower.includes('attached') || lower.includes('provided') || lower.includes('please provide'))
  );
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

  console.log(`[Gemini Parser] Extracted: Mindmap (${markdown.length} chars), Notes (${notes.length} chars), Transcript (${transcript.length} chunks)`);
  return { markdown, notes, transcript };
};

/**
 * High-Speed Multimodal Analysis: Directly uploads media to Gemini File API (resumable, full speed)
 * + captures 8 visual slide snapshots across the full duration for maximum speed (<45s) and accuracy.
 * 
 * @param {File} rawFile - Audio/video media file (up to 2GB)
 * @param {function} onProgress - Status callback
 * @param {object} [options] - Optional configurations (e.g. { storageUrl, cloudUploadPromise })
 * @returns {Promise<{ markdown: string, notes: string, transcript: Array }>}
 */
export const generateLectureContent = async (rawFile, onProgress, options = {}) => {
  if (!API_KEY) {
    throw new Error("Missing VITE_GEMINI_API_KEY in .env — please add your API key.");
  }

  const isVideo = rawFile?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(rawFile?.name || '');
  const mediaMimeType = resolveMimeType(rawFile);
  const fileSizeMB = rawFile.size / (1024 * 1024);

  // 1. Inspect duration, sample slide keyframes, and optimize speech audio in parallel (1-3s)
  const [durationSec, keyframeParts, speechMedia] = await Promise.all([
    getMediaDuration(rawFile),
    isVideo ? extractVideoKeyframes(rawFile, 8, onProgress) : Promise.resolve([]),
    extractSpeechAudio(rawFile, onProgress).catch((err) => {
      console.warn('[Gemini] Speech extraction bypassed, using raw file:', err);
      return rawFile;
    }),
  ]);

  let formattedDuration = '';
  if (durationSec > 0) {
    const totalSec = Math.floor(durationSec);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    formattedDuration = h > 0 
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 2. Media selection & packaging (supports audio & video up to 1GB+)
  const mediaToProcess = speechMedia || rawFile;
  const effectiveMime = resolveMimeType(mediaToProcess);
  const effectiveSizeMB = mediaToProcess.size / (1024 * 1024);

  // 3. Prepare Media Part (Base64 inline if < 18MB for instant processing, otherwise Gemini File API)
  let mediaPart;
  if (effectiveSizeMB < 18) {
    onProgress?.(`Encoding optimized media for AI analysis (${effectiveSizeMB.toFixed(1)} MB)...`);
    mediaPart = await fileToGenerativePart(mediaToProcess, effectiveMime);
  } else {
    onProgress?.(`Uploading media to Gemini File API (${effectiveSizeMB.toFixed(1)} MB)...`);
    const uploadedFile = await uploadLargeFile(mediaToProcess, effectiveMime, (msg) => onProgress?.(msg), options);
    
    const fileUri = uploadedFile?.uri || (uploadedFile?.name ? `https://generativelanguage.googleapis.com/v1beta/${uploadedFile.name}` : null);
    if (!fileUri) {
      throw new Error("Failed to receive valid file URI from Gemini File API.");
    }

    if (uploadedFile.state !== 'ACTIVE' && uploadedFile.name) {
      onProgress?.("Processing media on Google Gemini cloud...");
      await waitForActiveState(uploadedFile.name, (msg) => onProgress?.(msg));
    }

    mediaPart = {
      fileData: {
        fileUri,
        mimeType: uploadedFile.mimeType || effectiveMime,
      },
    };
  }

  // 4. Multimodal Prompt with exact duration context
  const durationContext = formattedDuration ? `Total Recording Duration: ${formattedDuration}.` : '';
  const prompt = [
    mediaPart,
    ...keyframeParts,
    `Synthesize and transcribe this entire lecture. ${durationContext}
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
===NOTES_START===`
  ];

  // 5. Send to Gemini — resilient per-model retry + seamless fallback across models
  let lastError = null;
  for (const modelName of FALLBACK_MODELS) {
    // Up to 2 attempts per model before moving to next model
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const attemptTag = attempt > 1 ? ` (retry ${attempt})` : '';
        onProgress?.(`Synthesizing lecture insights (${modelName}${attemptTag})...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: UNIFIED_SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 24576,
          },
        });

        const result = await model.generateContent(prompt);
        const rawText = result.response.text().trim();

        // Check if model failed to access the file and output an apology
        if (isNoAttachmentApology(rawText)) {
          console.warn(`[Gemini] Model ${modelName} reported missing attachment, retrying with next model...`);
          break; // Try next model
        }

        return parseGeminiResponse(rawText);
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini] Model [${modelName}] attempt ${attempt} error:`, err?.status || '', err?.message || err);

        // Fail fast only on fatal authentication/key errors
        if (isFatalAuthError(err)) {
          throw new Error(`Gemini API Authentication Error: ${err.message || 'Invalid API Key'}`);
        }

        // Handle retryable / transient server errors (500, 502, 503, 504, 429, etc.)
        if (isRetryableModelError(err)) {
          if (attempt < 2) {
            onProgress?.(`Temporary server delay on [${modelName}], retrying in 3s...`);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          } else {
            onProgress?.(`Model [${modelName}] busy, switching to next model...`);
            await new Promise((r) => setTimeout(r, 1500));
            break; // Proceed to next model in FALLBACK_MODELS
          }
        }

        // For any other unexpected model error, advance to next fallback model rather than crashing immediately
        console.warn(`[Gemini] Non-standard error on [${modelName}], trying next model...`, err);
        onProgress?.(`Model [${modelName}] encountered an issue, trying next fallback model...`);
        await new Promise((r) => setTimeout(r, 1500));
        break;
      }
    }
  }

  throw new Error(`AI lecture synthesis failed across all available models: ${lastError?.message || 'Server internal error. Please try again.'}`);
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

import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractVideoKeyframes, getMediaDuration } from './mediaProcessor';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// Active Gemini models — verified live against API on 2026-08-27
export const FALLBACK_MODELS = [
  'gemini-3.7-flash',          // Latest & primary
  'gemini-3.6-flash',          // High capability fallback (full modern features)
  'gemini-3.5-flash',          // Secondary fallback
  'gemini-2.5-flash',          // High-throughput legacy fallback
];

// Helper: Resolve exact MIME type from file or extension
export const resolveMimeType = (file) => {
  if (file?.type && file.type.trim() !== '') return file.type;
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  const map = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    m4a: 'audio/m4a',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return map[ext] || (file?.name?.match(/\.(mp4|mov|webm|mkv)$/i) ? 'video/mp4' : 'audio/mp3');
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

// Helper: Check if error is a rate limit, quota, overloaded, or missing model error
const isRetryableModelError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 429 ||
    status === 503 ||
    status === 404 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('404') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('capacity') ||
    msg.includes('not found') ||
    msg.includes('no longer available')
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

// Helper: Resumable upload to Gemini File API (for files >= 20MB)
const uploadLargeFile = async (file, mimeType, onProgress) => {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;
  
  const metadata = {
    file: {
      displayName: file.name || 'lecture_media',
    },
  };
  
  // 1. Initialize Resumable Upload
  const initRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  
  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Failed to initialize upload (${initRes.status}): ${errText}`);
  }
  
  const uploadUri = initRes.headers.get('x-goog-upload-url');
  if (!uploadUri) {
    throw new Error("Missing upload URL from Gemini File API.");
  }
  
  // 2. Upload with Live Progress tracking via XHR
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUri);
    xhr.setRequestHeader('X-Goog-Upload-Protocol', 'resumable');
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(`Uploading media to Gemini (${percent}%)...`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          console.log('[Gemini File API] Upload completed:', data.file);
          resolve(data.file);
        } catch (e) {
          reject(new Error("Invalid response JSON from Gemini File API."));
        }
      } else {
        reject(new Error(`Failed to upload file bytes (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during Gemini file upload."));
    };

    xhr.send(file);
  });
};

// Helper: Poll File API processing state until file is ACTIVE
const waitForActiveState = async (fileName, onProgress) => {
  const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`;
  let attempts = 0;
  const maxAttempts = 300; // 20 minutes max (300 × 4s) — required for 4-hour video files

  while (attempts < maxAttempts) {
    attempts++;
    onProgress?.(`Processing media on Google cloud (${attempts * 4}s)...`);
    await new Promise((r) => setTimeout(r, 4000));

    try {
      const res = await fetch(checkUrl);
      if (!res.ok) {
        console.warn(`[Gemini File API] Polling HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      console.log(`[Gemini File API] State for ${fileName}:`, data.state);

      if (data.state === 'ACTIVE') {
        return true;
      }
      if (data.state === 'FAILED') {
        throw new Error(`File processing failed on Gemini server: ${data.error?.message || 'Unsupported format or corrupted file'}`);
      }
    } catch (err) {
      if (err.message.includes('failed on Gemini server')) throw err;
      console.warn('[Gemini File API] Polling error:', err);
    }
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
 * @returns {Promise<{ markdown: string, notes: string, transcript: Array }>}
 */
export const generateLectureContent = async (rawFile, onProgress) => {
  if (!API_KEY) {
    throw new Error("Missing VITE_GEMINI_API_KEY in .env — please add your API key.");
  }

  const isVideo = rawFile?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(rawFile?.name || '');
  const mediaMimeType = resolveMimeType(rawFile);
  const fileSizeMB = rawFile.size / (1024 * 1024);

  // 1. Inspect duration and sample slide keyframes in parallel (1-2s)
  const [durationSec, keyframeParts] = await Promise.all([
    getMediaDuration(rawFile),
    isVideo ? extractVideoKeyframes(rawFile, 8, onProgress) : Promise.resolve([]),
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

  // 2. Prepare Media Part (Base64 inline if < 20MB, otherwise high-speed Gemini File API)
  let mediaPart;
  if (fileSizeMB < 20) {
    onProgress?.("Encoding media for AI analysis...");
    mediaPart = await fileToGenerativePart(rawFile, mediaMimeType);
  } else {
    onProgress?.(`Uploading media to Gemini File API (${fileSizeMB.toFixed(1)} MB)...`);
    const uploadedFile = await uploadLargeFile(rawFile, mediaMimeType, (msg) => onProgress?.(msg));
    
    if (!uploadedFile || !uploadedFile.uri) {
      throw new Error("Failed to receive valid file URI from Gemini File API.");
    }

    onProgress?.("Processing media on Google Gemini cloud...");
    await waitForActiveState(uploadedFile.name, (msg) => onProgress?.(msg));

    mediaPart = {
      fileData: {
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType || mediaMimeType,
      },
    };
  }

  // 3. Multimodal Prompt with exact duration context
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

  // 4. Send to Gemini — fast fallback on 503
  for (const modelName of FALLBACK_MODELS) {
    try {
      onProgress?.(`Synthesizing lecture insights (${modelName})...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: UNIFIED_SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768,
        },
      });

      const result = await model.generateContent(prompt);
      const rawText = result.response.text().trim();

      // Check if model failed to access the file and output an apology
      if (isNoAttachmentApology(rawText)) {
        console.warn(`[Gemini] Model ${modelName} reported missing attachment, retrying with next model...`);
        continue;
      }

      return parseGeminiResponse(rawText);
    } catch (err) {
      if (isRetryableModelError(err)) {
        console.warn(`Model [${modelName}] busy/unavailable, skipping to next model...`, err);
        // Fast fallback: 1.5s pause then move to next model (don't waste time retrying same busy model)
        onProgress?.(`Model [${modelName}] busy, switching to next model...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }

  throw new Error("All AI models are currently busy. Please try again in a moment.");
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

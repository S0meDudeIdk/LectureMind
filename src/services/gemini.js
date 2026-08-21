import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// 1. Fallback models ordered by preference
export const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro',
  'gemini-1.5-flash',
];






const SYSTEM_PROMPT = `
You are an expert academic knowledge extractor. Convert the provided lecture into a deeply nested, hierarchical Markdown mindmap with 3 to 4 levels of depth.

EXTREME BREVITY — HIGHEST PRIORITY UNBREAKABLE RULE:
- EVERY single node (headers AND bullet points) MUST be a concise keyword or phrase of 1 to 4 words MAX.
- Absolutely NO full sentences. NO verbs unless essential.
- Condense complex ideas into punchy, distinct keywords only.
- If a concept needs more than 4 words, split it into separate sub-bullets.

DEEP HIERARCHY STRUCTURE RULES:
- Output ONLY valid Markdown. Nothing else.
- You MUST structure knowledge into at least 3 to 4 levels of depth:
  * Level 1 (#): Single Core Topic (1-3 words).
  * Level 2 (##): Main Branches / Primary Concepts (1-4 words).
  * Level 3 (###): Sub-topics / Dimensions (1-4 words).
  * Level 4 (-): Granular details, metrics, or key facts (1-4 words).
- NO code blocks, NO markdown fences (\`\`\`), NO wrappers.
- NO intro/outro text, NO explanations.
- ABSOLUTELY NO LaTeX or math syntax (no \\sqrt, no ^, no {}, no \\frac).
  Use plain unicode symbols: ², ³, √, π, ≈, ≠, ≤, ≥ or plain words.

EXAMPLE OUTPUT (follow this structure and brevity exactly):
# Topic Name
## Main Concept A
### Sub-concept 1
- Granular detail
- Key metric
### Sub-concept 2
- Action item
- Specific method
## Main Concept B
### Sub-concept 3
- Core element
- Practical insight
### Sub-concept 4
- Implementation step
- Output result
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

// Helper: Convert File to Base64 (for files < 20MB)
const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type || 'audio/mp3',
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper: Resumable upload to Gemini File API (for files >= 20MB)
const uploadLargeFile = async (file, onProgress) => {
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;
  
  const metadata = {
    file: {
      displayName: file.name,
    },
  };
  
  const initRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': file.type || 'audio/mp3',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  
  if (!initRes.ok) throw new Error("Failed to initialize resumable upload.");
  
  const uploadUri = initRes.headers.get('x-goog-upload-url');
  
  const uploadRes = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
    },
    body: file,
  });
  
  if (!uploadRes.ok) throw new Error("Failed to upload file bytes to server.");
  const uploadData = await uploadRes.json();
  return uploadData.file;
};

// Helper: Poll File API processing state until ACTIVE
const waitForActiveState = async (fileName) => {
  const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`;
  let state = 'PROCESSING';
  while (state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(checkUrl);
    const data = await res.json();
    state = data.state;
    if (state === 'FAILED') throw new Error("File processing failed on Gemini server.");
  }
};

// 2. Inline Processing with Waterfall Model Fallback (< 20MB)
export const processAudioWithGemini = async (file, onProgress) => {
  onProgress?.("Encoding audio/video (inline)...");
  const audioPart = await fileToGenerativePart(file);

  const prompt = [
    audioPart,
    "Transcribe and synthesize the core concepts from this lecture into a concise hierarchical markdown outline."
  ];

  for (const modelName of FALLBACK_MODELS) {
    try {
      onProgress?.(`Extracting mindmap (${modelName})...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (isRetryableModelError(err)) {
        console.warn(`Model [${modelName}] rate limited or unavailable, falling back...`, err);
        onProgress?.(`Model [${modelName}] busy, trying fallback model...`);
        continue;
      }
      throw err; // Non-retryable error (e.g. invalid API key)
    }
  }

  throw new Error("All AI models are currently at capacity. Please try again in a minute.");
};

// 5. Large File Processing with Waterfall Model Fallback (>= 20MB)
export const processLargeAudioWithGemini = async (file, onProgress) => {
  onProgress?.("Uploading large media file to Gemini File API...");
  const uploadedFile = await uploadLargeFile(file, onProgress);

  onProgress?.("Processing media on Gemini server (may take a moment)...");
  await waitForActiveState(uploadedFile.name);

  const audioPart = {
    fileData: {
      fileUri: uploadedFile.uri,
      mimeType: file.type || 'audio/mp3',
    },
  };

  const prompt = [
    audioPart,
    "Transcribe and synthesize the core concepts from this lecture into a concise hierarchical markdown outline."
  ];

  for (const modelName of FALLBACK_MODELS) {
    try {
      onProgress?.(`Extracting mindmap (${modelName})...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (isRetryableModelError(err)) {
        console.warn(`Model [${modelName}] rate limited or unavailable, falling back...`, err);
        onProgress?.(`Model [${modelName}] busy, trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error("All AI models are currently at capacity. Please try again in a minute.");
};

// Main Unified Entrypoint
export const generateMindmap = async (file, onProgress) => {
  if (!API_KEY) {
    throw new Error("Missing VITE_GEMINI_API_KEY in .env — please add your API key and restart dev server.");
  }

  const fileSizeMB = file.size / (1024 * 1024);

  if (fileSizeMB < 20) {
    return await processAudioWithGemini(file, onProgress);
  } else {
    return await processLargeAudioWithGemini(file, onProgress);
  }
};

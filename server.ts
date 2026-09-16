import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import busboy from 'busboy';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { createServer as createViteServer } from 'vite';

// Load .env files if present in Node 20+
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    if (fs.existsSync(path.join(process.cwd(), '.env'))) {
      (process as any).loadEnvFile(path.join(process.cwd(), '.env'));
    }
    if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
      (process as any).loadEnvFile(path.join(process.cwd(), '.env.local'));
    }
  }
} catch {
  // ignore if file doesn't exist
}

const PORT = 3000;

// Vertex AI publisher models available on the global endpoint.
const VERTEX_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

// Per-request ceiling for Vertex AI generation calls (10 minutes)
const VERTEX_REQUEST_TIMEOUT_MS = 600000;

/**
 * Resilient extractor for verbatim transcript chunks.
 */
function extractTranscriptChunks(text: string): Array<{ startTime: string; textBlock: string }> {
  if (!text || typeof text !== 'string') return [];

  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }
  cleaned = cleaned.trim();

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
    // Continue to recovery strategies
  }

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

  const chunks: Array<{ startTime: string; textBlock: string }> = [];
  const objRegex = /\{[^{}]*"(?:startTime|timestamp|time)"\s*:\s*"([^"]+)"[^{}]*"(?:textBlock|text|content)"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/gi;
  let match: RegExpExecArray | null;
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

  const lineRegex = /(?:\[|\b)(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\b)\s*[-:]?\s*(.+)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRegex.exec(cleaned)) !== null) {
    const startTime = lineMatch[1].trim();
    const textBlock = lineMatch[2].trim();
    if (startTime && textBlock && textBlock.length > 2) {
      chunks.push({ startTime, textBlock });
    }
  }

  return chunks;
}

/**
 * Parse structured AI response into markdown, notes, and transcript.
 */
function parseLectureResponse(rawText: string): { markdown: string; notes: string; transcript: Array<{ startTime: string; textBlock: string }> } {
  if (!rawText) return { markdown: '', notes: '', transcript: [] };

  let markdown = '';
  let notes = '';
  let transcript: Array<{ startTime: string; textBlock: string }> = [];

  const cleanFences = (str: string) => {
    if (!str) return '';
    let s = str.trim();
    if (s.startsWith('```markdown')) s = s.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');
    else if (s.startsWith('```')) s = s.replace(/^```\n?/, '').replace(/\n?```$/, '');
    return s.trim();
  };

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

  if (rawText.includes('===TRANSCRIPT_START===')) {
    const transcriptAfter = rawText.split('===TRANSCRIPT_START===')[1];
    let transcriptText = '';
    if (transcriptAfter.includes('===TRANSCRIPT_END===')) {
      transcriptText = transcriptAfter.split('===TRANSCRIPT_END===')[0].trim();
    } else if (transcriptAfter.includes('===NOTES_START===')) {
      transcriptText = transcriptAfter.split('===NOTES_START===')[0].trim();
    } else {
      transcriptText = transcriptAfter.trim();
    }
    transcript = extractTranscriptChunks(transcriptText);
  }

  if (transcript.length === 0) {
    transcript = extractTranscriptChunks(rawText);
  }

  if (rawText.includes('===NOTES_START===')) {
    const notesAfter = rawText.split('===NOTES_START===')[1];
    if (notesAfter.includes('===NOTES_END===')) {
      notes = notesAfter.split('===NOTES_END===')[0].trim();
    } else {
      notes = notesAfter.trim();
    }
  }

  if (!markdown && rawText.includes('===SECTION_SPLIT===')) {
    const parts = rawText.split('===SECTION_SPLIT===');
    markdown = parts[0].trim();
    try {
      transcript = extractTranscriptChunks(parts[1]);
    } catch {
      // ignore
    }
  }

  if (!markdown) {
    markdown = rawText;
  }

  markdown = cleanFences(markdown);
  notes = cleanFences(notes);

  if (!notes) {
    notes = markdown;
  }

  if (notes) {
    notes = notes.replace(/(?:^|\n)\s*\$\$([^\n]+?)\$\$\s*(?=\n|$)/g, (_match, formula) => {
      return `\n\n$$\n${formula.trim()}\n$$\n\n`;
    });
  }

  return { markdown, notes, transcript };
}

/**
 * Normalize and validate media MIME types for Vertex AI multimodal input.
 */
function normalizeMimeType(mimeType: string, fileUri: string = ''): string {
  let type = (mimeType || '').trim().toLowerCase().split(';')[0];

  if (type === 'audio/mp3') return 'audio/mpeg';

  if (!type || type === 'application/octet-stream') {
    const target = fileUri.toLowerCase();
    if (target.endsWith('.mp3')) return 'audio/mpeg';
    if (target.endsWith('.wav')) return 'audio/wav';
    if (target.endsWith('.m4a')) return 'audio/m4a';
    if (target.endsWith('.aac')) return 'audio/aac';
    if (target.endsWith('.ogg')) return 'audio/ogg';
    if (target.endsWith('.flac')) return 'audio/flac';
    if (target.endsWith('.mp4')) return 'video/mp4';
    if (target.endsWith('.mov')) return 'video/quicktime';
    if (target.endsWith('.webm')) return 'video/webm';
    return 'audio/mpeg';
  }

  return type;
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(
        `Vertex AI request timed out after ${timeoutMs} ms`,
        'TimeoutError'
      )
    );
  }, timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

// Credentials and Clients initialization
const localKeyPath = path.join(process.cwd(), 'service-account-key.json');
let serviceAccountData: any = null;

const credentialsJson =
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
  process.env.GCP_SERVICE_ACCOUNT_KEY;

if (credentialsJson) {
  try {
    const trimmed = credentialsJson.trim();
    const decoded = trimmed.startsWith('{')
      ? trimmed
      : Buffer.from(trimmed, 'base64').toString('utf8');
    serviceAccountData = JSON.parse(decoded);
    const tmpKeyPath = path.join(os.tmpdir(), 'gcp_sa_creds.json');
    fs.writeFileSync(tmpKeyPath, JSON.stringify(serviceAccountData), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpKeyPath;
    console.log(`[Credentials] Loaded service account credentials from environment for project: ${serviceAccountData.project_id}`);
  } catch (e: any) {
    console.warn('[Credentials] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', e.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const customPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const resolvedPath = path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  if (fs.existsSync(resolvedPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedPath;
    try {
      serviceAccountData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      console.log(`[Credentials] Loaded service account from ${customPath} for project: ${serviceAccountData.project_id}`);
    } catch {
      // ignore invalid json
    }
  }
} else if (fs.existsSync(localKeyPath)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = localKeyPath;
  try {
    serviceAccountData = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    console.log(`[Credentials] Auto-detected local service-account-key.json for project: ${serviceAccountData.project_id}`);
  } catch {
    // ignore invalid json
  }
}

const project =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  serviceAccountData?.project_id ||
  '';

const location =
  process.env.GOOGLE_CLOUD_LOCATION ||
  'global';

const gcsAnonymousBucket =
  process.env.GCS_ANONYMOUS_BUCKET ||
  '';

const vertexClient = project
  ? new GoogleGenAI({
      vertexai: true,
      project,
      location,
    })
  : null;

const storageClient = gcsAnonymousBucket ? new Storage() : null;

console.log(`[Server Setup] Project: "${project}", Location: "${location}", Vertex AI initialized: ${!!vertexClient}`);

async function runVertexGeneration(
  fileUri: string,
  mimeType: string,
  promptText: string,
  res: Response
) {
  if (!vertexClient) {
    return res.status(500).json({
      error: 'Vertex AI client is not initialized. Check GOOGLE_CLOUD_PROJECT and credentials.',
    });
  }

  const validMimeType = normalizeMimeType(mimeType, fileUri);
  console.log(`[Vertex AI] Normalized MIME type: "${mimeType}" -> "${validMimeType}" for file ${fileUri}`);

  const contents = [
    {
      fileData: {
        fileUri,
        mimeType: validMimeType,
      },
    },
    promptText,
  ];

  const config = {
    temperature: 0.1,
    maxOutputTokens: 24576,
  };

  let lastError: any = null;

  for (const modelName of VERTEX_FALLBACK_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { controller, clear } = createTimeoutController(VERTEX_REQUEST_TIMEOUT_MS);
      try {
        console.log(`[Vertex AI] Generating lecture with model ${modelName} (attempt ${attempt})...`);
        const response = await vertexClient.models.generateContent({
          model: modelName,
          contents,
          config: {
            ...config,
            abortSignal: controller.signal,
          },
        });

        const rawText = response?.text?.trim?.() || '';
        if (!rawText) {
          throw new Error('Vertex AI returned an empty response.');
        }

        const parsed = parseLectureResponse(rawText);
        clear();
        return res.status(200).json(parsed);
      } catch (err: any) {
        clear();
        lastError = err;
        console.warn(`[Vertex AI] Model ${modelName} attempt ${attempt} error:`, err?.message || err);

        const status = err?.status || err?.statusCode || 0;
        const msg = (err?.message || '').toLowerCase();
        const isRetryable =
          status === 429 ||
          status === 408 ||
          status >= 500 ||
          msg.includes('resource_exhausted') ||
          msg.includes('quota') ||
          msg.includes('rate limit') ||
          msg.includes('overloaded') ||
          msg.includes('unavailable') ||
          msg.includes('timeout') ||
          msg.includes('econnreset');

        if (isRetryable && attempt < 2) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        break;
      }
    }
  }

  console.error('[Vertex AI] Generation failed across all models:', lastError);
  const isTimeout =
    lastError?.name === 'TimeoutError' ||
    lastError?.message?.toLowerCase().includes('timed out');

  return res.status(isTimeout ? 504 : 500).json({
    error: lastError?.message || 'Server error during lecture generation',
    ...(isTimeout && { code: 'VERTEX_AI_TIMEOUT' }),
  });
}

async function startServer() {
  const app = express();

  // Basic CORS & Preflight handling
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      vertexConfigured: !!vertexClient,
      project: project || 'not configured',
      location,
    });
  });

  // JSON parser for /api/generate-lecture
  app.post('/api/generate-lecture', express.json({ limit: '50mb' }), async (req: Request, res: Response) => {
    try {
      const { gsUri, mimeType, duration, isVideo, promptText } = req.body || {};

      if (!vertexClient) {
        return res.status(500).json({
          error: 'Vertex AI client is not initialized. Check GOOGLE_CLOUD_PROJECT and credentials.',
        });
      }

      console.log('[Vertex AI] Lecture generation request:', {
        gsUri,
        mimeType,
        duration,
        isVideo,
        promptLength: promptText?.length || 0,
      });

      if (!gsUri || typeof gsUri !== 'string' || !gsUri.startsWith('gs://')) {
        return res.status(400).json({
          error: 'Missing or invalid gsUri parameter (must start with gs://)',
        });
      }

      if (!promptText || typeof promptText !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid promptText parameter',
        });
      }

      await runVertexGeneration(gsUri, mimeType, promptText, res);
    } catch (err: any) {
      console.error('[Vertex AI] /api/generate-lecture unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: err.message || 'Server error during lecture generation',
        });
      }
    }
  });

  // Multipart upload endpoint for anonymous users
  app.post('/api/generate-lecture-upload', (req: Request, res: Response) => {
    if (!gcsAnonymousBucket) {
      return res.status(503).json({
        error: 'Anonymous upload is not configured. Set GCS_ANONYMOUS_BUCKET on the server.',
      });
    }

    if (!storageClient) {
      return res.status(503).json({
        error: 'Google Cloud Storage client is not initialized. Check service account credentials.',
      });
    }

    const uploadUuid = crypto.randomUUID();
    let tempFilePath: string | null = null;
    let gcsDestination: string | null = null;
    let originalName = 'upload';
    const fields: Record<string, string> = {};
    let fileWritePromise: Promise<void> | null = null;

    const cleanup = async () => {
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
      try {
        if (gcsDestination && storageClient) {
          await storageClient.bucket(gcsAnonymousBucket).file(gcsDestination).delete({ ignoreNotFound: true });
          console.log(`[GCS] Cleaned up staged anonymous upload: ${gcsDestination}`);
        }
      } catch {}
    };

    let bb: any;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024 } });
    } catch (err: any) {
      return res.status(400).json({ error: 'Invalid multipart upload request: ' + err.message });
    }

    bb.on('field', (name: string, val: string) => {
      fields[name] = val;
    });

    bb.on('file', (name: string, fileStream: any, info: any) => {
      if (name !== 'file') {
        fileStream.resume();
        return;
      }
      originalName = info.filename || 'upload';
      const ext = path.extname(originalName) || '.mp3';
      const tempFileName = `anonymous_upload_${uploadUuid}${ext}`;
      tempFilePath = path.join(os.tmpdir(), tempFileName);
      gcsDestination = `anonymous_uploads/${uploadUuid}${ext}`;

      const writeStream = fs.createWriteStream(tempFilePath);
      fileWritePromise = new Promise((resolve, reject) => {
        fileStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    });

    bb.on('error', async (err: any) => {
      console.error('[Busboy] Upload error:', err);
      await cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process media upload.' });
      }
    });

    bb.on('finish', async () => {
      try {
        if (fileWritePromise) {
          await fileWritePromise;
        }

        const mimeType = fields.mimeType || 'audio/mpeg';
        const promptText = fields.promptText;

        if (!tempFilePath || !fs.existsSync(tempFilePath)) {
          return res.status(400).json({ error: 'Missing file field in multipart upload.' });
        }

        if (!promptText || typeof promptText !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid promptText field.' });
        }

        console.log(`[GCS] Staging anonymous upload to gs://${gcsAnonymousBucket}/${gcsDestination}`);
        const bucket = storageClient.bucket(gcsAnonymousBucket);
        const gcsFile = bucket.file(gcsDestination!);
        await new Promise((resolve, reject) => {
          fs.createReadStream(tempFilePath!)
            .pipe(
              gcsFile.createWriteStream({
                resumable: true,
                contentType: mimeType,
                metadata: {
                  metadata: {
                    originalName,
                    uploadUuid,
                    uploadedAt: new Date().toISOString(),
                  },
                },
              })
            )
            .on('error', reject)
            .on('finish', resolve);
        });

        const gsUri = `gs://${gcsAnonymousBucket}/${gcsDestination}`;
        console.log('[Vertex AI] Lecture generation request from anonymous upload:', {
          gsUri,
          mimeType,
          promptLength: promptText.length,
        });

        await runVertexGeneration(gsUri, mimeType, promptText, res);
      } catch (err: any) {
        console.error('[Vertex AI] /api/generate-lecture-upload error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: err.message || 'Server error during lecture generation' });
        }
      } finally {
        await cleanup();
      }
    });

    req.pipe(bb);
  });

  // Explicit 404 for any other unmatched /api/* route (never return HTML)
  app.all('/api/*all', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Vite development middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LectureMind full-stack server running on http://0.0.0.0:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer().catch((err) => {
  console.error('[Server Start Error]:', err);
  process.exit(1);
});

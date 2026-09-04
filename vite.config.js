import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import busboy from 'busboy';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

// Vertex AI publisher models available on the global endpoint.
// These are exact model IDs, not AI Studio aliases like "gemini-flash-latest".
const VERTEX_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

/**
 * Resilient extractor for verbatim transcript chunks.
 * Handles valid JSON, truncated arrays, raw markdown codeblocks, and regex recovery.
 * @param {string} text - Raw transcript text
 * @returns {Array<{startTime: string, textBlock: string}>}
 */
function extractTranscriptChunks(text) {
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
}

/**
 * Parse the model's structured response into markdown, notes, and transcript.
 * Mirrors the client-side parser in src/services/gemini.js.
 * @param {string} rawText - Raw text from the model
 * @returns {{ markdown: string, notes: string, transcript: Array }}
 */
function parseLectureResponse(rawText) {
  if (!rawText) return { markdown: '', notes: '', transcript: [] };

  let markdown = '';
  let notes = '';
  let transcript = [];

  const cleanFences = (str) => {
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
 * Read the full request body as a string.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function geminiApiPlugin() {
  let vertexClient = null;
  let storageClient = null;
  let gcsAnonymousBucket = '';

  const createVertexClient = (project, location) => {
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  };

  /**
   * Run the Vertex AI generation loop across fallback models and send the JSON response.
   * On success, sends { markdown, notes, transcript }. On failure, sends 500 JSON.
   * @param {string} fileUri - gs:// URI for the media file
   * @param {string} mimeType - Media MIME type
   * @param {string} promptText - Prompt text
   * @param {import('http').ServerResponse} res - Response object
   */
  const runVertexGeneration = async (fileUri, mimeType, promptText, res) => {
    const contents = [
      {
        fileData: {
          fileUri,
          mimeType: mimeType || 'application/octet-stream',
        },
      },
      promptText,
    ];

    const config = {
      temperature: 0.1,
      maxOutputTokens: 24576,
    };

    let lastError = null;

    try {
      for (const modelName of VERTEX_FALLBACK_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[Vertex AI] Generating lecture with model ${modelName} (attempt ${attempt})...`);
            const response = await vertexClient.models.generateContent({
              model: modelName,
              contents,
              config,
            });

            const rawText = response?.text?.trim?.() || '';
            if (!rawText) {
              throw new Error('Vertex AI returned an empty response.');
            }

            const parsed = parseLectureResponse(rawText);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(parsed));
            return;
          } catch (err) {
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

      throw new Error(`Vertex AI lecture generation failed across all models: ${lastError?.message || 'Unknown error'}`);
    } catch (err) {
      console.error('[Vertex AI] Generation error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Server error during lecture generation' }));
    }
  };

  const generateLecture = async (req, res) => {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || '{}');
      const {
        gsUri,
        mimeType,
        duration,
        isVideo,
        promptText,
      } = payload;

      if (!vertexClient) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Vertex AI client is not initialized. Check GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION.' }));
      }

      console.log('[Vertex AI] Lecture generation request:', { gsUri, mimeType, duration, isVideo, promptLength: promptText?.length || 0 });

      if (!gsUri || !gsUri.startsWith('gs://')) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Missing or invalid gsUri parameter (must start with gs://)' }));
      }

      if (!promptText || typeof promptText !== 'string') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Missing or invalid promptText parameter' }));
      }

      await runVertexGeneration(gsUri, mimeType, promptText, res);
    } catch (err) {
      console.error('[Vertex AI] /api/generate-lecture error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err.message || 'Server error during lecture generation' }));
    }
  };

  /**
   * Accept a raw media file from an anonymous client, stage it in a temporary
   * GCS bucket, run Vertex AI generation, then clean up the staged object.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  const generateLectureFromUpload = async (req, res) => {
    if (!gcsAnonymousBucket) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Anonymous upload is not configured. Set GCS_ANONYMOUS_BUCKET on the server.' }));
    }

    if (!storageClient) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Google Cloud Storage client is not initialized. Check GOOGLE_APPLICATION_CREDENTIALS.' }));
    }

    const uploadUuid = crypto.randomUUID();
    let tempFilePath = null;
    let gcsDestination = null;
    let originalName = 'upload';
    const fields = {};
    let fileWritePromise = null;

    const cleanup = async () => {
      try {
        if (gcsDestination && storageClient) {
          await storageClient.bucket(gcsAnonymousBucket).file(gcsDestination).delete({ ignoreNotFound: true });
          console.log(`[GCS] Cleaned up staged anonymous upload: ${gcsDestination}`);
        }
      } catch {
        // ignore cleanup errors
      }
      try {
        if (tempFilePath) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch {
        // ignore cleanup errors
      }
    };

    try {
      const bb = busboy({ headers: req.headers });

      bb.on('field', (name, value) => {
        fields[name] = value;
      });

      bb.on('file', (name, stream, info) => {
        if (name !== 'file') {
          stream.resume();
          return;
        }
        originalName = info.filename || 'upload';
        const tmpName = `${uploadUuid}-${originalName}`;
        tempFilePath = path.join(os.tmpdir(), tmpName);
        gcsDestination = `anonymous/${uploadUuid}/${originalName}`;
        const writeStream = fs.createWriteStream(tempFilePath);
        stream.pipe(writeStream);

        fileWritePromise = new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          stream.on('error', reject);
        });
      });

      const parsePromise = new Promise((resolve, reject) => {
        bb.on('finish', resolve);
        bb.on('error', reject);
      });

      req.pipe(bb);
      await parsePromise;
      if (fileWritePromise) await fileWritePromise;

      const mimeType = fields.mimeType || 'application/octet-stream';
      const promptText = fields.promptText || '';

      if (!tempFilePath || !gcsDestination) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Missing file field in multipart upload.' }));
      }

      if (!promptText || typeof promptText !== 'string') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Missing or invalid promptText field.' }));
      }

      console.log(`[GCS] Staging anonymous upload to gs://${gcsAnonymousBucket}/${gcsDestination}`);
      const bucket = storageClient.bucket(gcsAnonymousBucket);
      const gcsFile = bucket.file(gcsDestination);
      await new Promise((resolve, reject) => {
        fs.createReadStream(tempFilePath)
          .pipe(gcsFile.createWriteStream({
            resumable: true,
            contentType: mimeType,
            metadata: {
              metadata: {
                originalName,
                uploadUuid,
                uploadedAt: new Date().toISOString(),
              },
            },
          }))
          .on('error', reject)
          .on('finish', resolve);
      });

      const gsUri = `gs://${gcsAnonymousBucket}/${gcsDestination}`;
      console.log('[Vertex AI] Lecture generation request from anonymous upload:', { gsUri, mimeType, promptLength: promptText.length });

      await runVertexGeneration(gsUri, mimeType, promptText, res);
    } catch (err) {
      console.error('[Vertex AI] /api/generate-lecture-upload error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Server error during lecture generation' }));
    } finally {
      await cleanup();
    }
  };

  const mountApi = (middlewares) => {
    middlewares.use('/api/generate-lecture', async (req, res, next) => {
      if (req.method !== 'POST') {
        return next();
      }
      return generateLecture(req, res);
    });

    middlewares.use('/api/generate-lecture-upload', async (req, res, next) => {
      if (req.method !== 'POST') {
        return next();
      }
      return generateLectureFromUpload(req, res);
    });
  };

  return {
    name: 'gemini-api-plugin',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      const project = env.GOOGLE_CLOUD_PROJECT || '';
      const location = env.GOOGLE_CLOUD_LOCATION || 'us-central1';
      gcsAnonymousBucket = env.GCS_ANONYMOUS_BUCKET || '';

      // Allow service-account key path to be set via .env so the Google auth
      // library can pick it up without gcloud CLI installed.
      if (env.GOOGLE_APPLICATION_CREDENTIALS) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS;
      }

      vertexClient = project ? createVertexClient(project, location) : null;
      // Storage client uses GOOGLE_APPLICATION_CREDENTIALS already exported in the environment.
      storageClient = gcsAnonymousBucket ? new Storage() : null;
    },
    configureServer(server) {
      mountApi(server.middlewares);
    },
    configurePreviewServer(server) {
      mountApi(server.middlewares);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), geminiApiPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

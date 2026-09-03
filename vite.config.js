import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function geminiApiPlugin() {
  const mountApi = (middlewares) => {
    // 1. Upload directly from Cloud Storage URL (e.g. Firebase Storage cloud media)
    middlewares.use('/api/gemini-upload-from-url', async (req, res, next) => {
      if (req.method !== 'POST') {
        return next();
      }
      let tmpPath = null;
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY on server.' }));
        }

        let bodyStr = '';
        for await (const chunk of req) {
          bodyStr += chunk;
        }
        const { storageUrl, mimeType, displayName } = JSON.parse(bodyStr || '{}');

        if (!storageUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing storageUrl parameter' }));
        }

        console.log('[Server Gemini URL] Fetching media from storage URL...');
        const mediaRes = await fetch(storageUrl);
        if (!mediaRes.ok) {
          res.statusCode = mediaRes.status;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: `Failed to download media from storage URL (${mediaRes.status})` }));
        }

        const safeExt = (displayName || 'media.mp3').split('.').pop() || 'mp3';
        tmpPath = path.join(os.tmpdir(), `gemini_cloud_${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`);
        const outStream = fs.createWriteStream(tmpPath);

        const reader = mediaRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          outStream.write(value);
        }
        outStream.end();
        await new Promise((resolve, reject) => {
          outStream.on('finish', resolve);
          outStream.on('error', reject);
        });

        const downloadedSizeMB = (fs.statSync(tmpPath).size / (1024 * 1024)).toFixed(1);
        console.log(`[Server Gemini URL] Downloaded ${downloadedSizeMB} MB to temp. Uploading via GoogleAIFileManager...`);
        const fileManager = new GoogleAIFileManager(apiKey);
        const uploadResult = await fileManager.uploadFile(tmpPath, {
          mimeType: mimeType || 'audio/mp3',
          displayName: displayName || 'lecture_media',
        });

        console.log(`[Server Gemini URL] Uploaded as ${uploadResult.file.name}. Polling active state...`);
        let activeFile = uploadResult.file;
        let pollCount = 0;
        while (activeFile.state !== 'ACTIVE' && pollCount < 60) {
          if (activeFile.state === 'FAILED') {
            throw new Error(`Media processing failed on Gemini server: ${activeFile.error?.message || 'Unsupported media'}`);
          }
          await new Promise((r) => setTimeout(r, 2000));
          const check = await fileManager.getFile(uploadResult.file.name);
          activeFile = check;
          pollCount++;
        }

        console.log(`[Server Gemini URL] File ready: ${activeFile.name} (state: ${activeFile.state})`);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          ok: true,
          file: activeFile,
          fileUri: activeFile.uri,
          mimeType: activeFile.mimeType,
          name: activeFile.name,
        }));
      } catch (err) {
        console.error('[Server Gemini URL] Error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: err.message || 'Server URL transfer error' }));
      } finally {
        if (tmpPath && fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      }
    });

    // 2. Direct binary media upload stream from browser to server
    middlewares.use('/api/gemini-upload-media', async (req, res, next) => {
      if (req.method !== 'POST') {
        return next();
      }
      let tmpPath = null;
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY on server.' }));
        }

        const rawFileName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'lecture_media.mp3';
        const rawMimeType = req.headers['x-mime-type'] || 'audio/mp3';
        const safeExt = rawFileName.split('.').pop() || 'mp3';

        tmpPath = path.join(os.tmpdir(), `gemini_stream_${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`);
        const outStream = fs.createWriteStream(tmpPath);

        await new Promise((resolve, reject) => {
          req.pipe(outStream);
          outStream.on('finish', resolve);
          outStream.on('error', reject);
          req.on('error', reject);
        });

        const receivedSizeMB = (fs.statSync(tmpPath).size / (1024 * 1024)).toFixed(1);
        console.log(`[Server Gemini Stream] Received ${receivedSizeMB} MB. Uploading to Gemini...`);
        const fileManager = new GoogleAIFileManager(apiKey);
        const uploadResult = await fileManager.uploadFile(tmpPath, {
          mimeType: rawMimeType,
          displayName: rawFileName,
        });

        let activeFile = uploadResult.file;
        let pollCount = 0;
        while (activeFile.state !== 'ACTIVE' && pollCount < 60) {
          if (activeFile.state === 'FAILED') {
            throw new Error(`Media processing failed on Gemini server: ${activeFile.error?.message || 'Unsupported media'}`);
          }
          await new Promise((r) => setTimeout(r, 2000));
          const check = await fileManager.getFile(uploadResult.file.name);
          activeFile = check;
          pollCount++;
        }

        console.log(`[Server Gemini Stream] File ready: ${activeFile.name}`);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          ok: true,
          file: activeFile,
          fileUri: activeFile.uri,
          mimeType: activeFile.mimeType,
          name: activeFile.name,
        }));
      } catch (err) {
        console.error('[Server Gemini Stream] Error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: err.message || 'Server stream upload error' }));
      } finally {
        if (tmpPath && fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      }
    });

    // 3. Resumable Upload Session Init (metadata only)
    middlewares.use('/api/gemini-init-upload', async (req, res, next) => {
      if (req.method !== 'POST') {
        return next();
      }
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY environment variable on server.' }));
        }

        let bodyStr = '';
        for await (const chunk of req) {
          bodyStr += chunk;
        }
        const { displayName, mimeType, size } = JSON.parse(bodyStr || '{}');

        // Initialize Resumable Upload directly with Google Gemini File API (small JSON metadata only)
        const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
        const initRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': (size || 0).toString(),
            'X-Goog-Upload-Header-Content-Type': mimeType || 'application/octet-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: { displayName: displayName || 'lecture_media' }
          })
        });

        if (!initRes.ok) {
          const errText = await initRes.text();
          console.error(`[Server Gemini Init] Failed (${initRes.status}):`, errText);
          res.statusCode = initRes.status;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: `Gemini File API initialization failed: ${errText}` }));
        }

        const uploadUri = initRes.headers.get('x-goog-upload-url');
        if (!uploadUri) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing x-goog-upload-url header from Gemini File API.' }));
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ uploadUri }));
      } catch (err) {
        console.error('[Server Gemini Init] Error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: err.message || 'Server upload session init error' }));
      }
    });

    middlewares.use('/api/gemini-status', async (req, res, next) => {
      if (req.method !== 'GET') {
        return next();
      }
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        const url = new URL(req.url, 'http://localhost');
        const fileName = url.searchParams.get('fileName');
        if (!fileName) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Missing fileName query parameter' }));
        }

        const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
        const checkRes = await fetch(checkUrl);
        const data = await checkRes.json();
        res.statusCode = checkRes.status;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: err.message || 'Status check error' }));
      }
    });
  };

  return {
    name: 'gemini-api-plugin',
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
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(
      process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
    ),
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

/**
 * Browser-side audio extraction and media inspection using ffmpeg.wasm.
 * Provides init, ffprobe-based duration extraction, and audio track extraction.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.10';
// Single-thread core avoids SharedArrayBuffer / cross-origin isolation headers,
// so external audio/video playback is not blocked by COOP/COEP.
const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const CORE_URL = `${CORE_BASE_URL}/ffmpeg-core.js`;
const WASM_URL = `${CORE_BASE_URL}/ffmpeg-core.wasm`;

/** Shared FFmpeg instance; load once and reuse across calls. */
let ffmpegInstance = null;
let ffmpegLoadPromise = null;

/**
 * Initialize (or return) a shared FFmpeg instance loaded from the public CDN.
 * Uses toBlobURL to bypass CORS restrictions on the worker/wasm assets.
 * @returns {Promise<FFmpeg>}
 */
export async function initFfmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    await ffmpeg.load({
      coreURL: await toBlobURL(CORE_URL, 'text/javascript'),
      wasmURL: await toBlobURL(WASM_URL, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoadPromise;
}

/**
 * Get media duration in seconds using ffprobe.
 * Falls back to 0 if ffprobe fails or reports an invalid value.
 * @param {File} file - Audio or video file
 * @returns {Promise<number>} - Duration in seconds (finite number, 0 on failure)
 */
export async function getMediaDurationFfmpeg(file) {
  const ffmpeg = await initFfmpeg();
  const inputName = 'input_media';
  const outputName = 'duration.txt';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.ffprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputName,
      '-o', outputName,
    ]);

    const durationText = await ffmpeg.readFile(outputName, 'utf8');
    const durationSeconds = parseFloat(durationText.trim());

    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return 0;
    }

    return durationSeconds;
  } catch (err) {
    console.warn('[AudioExtractor] ffprobe duration extraction failed:', err);
    return 0;
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // File may not exist; ignore cleanup errors.
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // File may not exist; ignore cleanup errors.
    }
  }
}

/**
 * Extract the audio track from a video file using ffmpeg.wasm.
 * Returns an audio File (audio/mp4) or null if extraction fails.
 * @param {File} file - Input video file
 * @param {Function} [onProgress] - Callback receiving a 0-1 progress number
 * @returns {Promise<File|null>} - Extracted audio file or null
 */
export async function extractAudioFromVideo(file, onProgress) {
  const ffmpeg = await initFfmpeg();
  const inputName = 'input_video';
  const outputName = 'output_audio.m4a';

  ffmpeg.on('progress', ({ progress }) => {
    const normalized = typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(1, progress))
      : 0;
    onProgress?.(normalized);
  });

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: 'audio/mp4' });
    const audioFile = new File(
      [blob],
      (file.name || 'lecture').replace(/\.[^/.]+$/, '') + '_audio.m4a',
      { type: 'audio/mp4' }
    );

    return audioFile;
  } catch (err) {
    console.warn('[AudioExtractor] Audio extraction failed:', err);
    return null;
  } finally {
    if (typeof ffmpeg.off === 'function') {
      try {
        ffmpeg.off('progress');
      } catch {}
    }
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}

/**
 * Terminate the shared FFmpeg instance and free its worker/memory.
 * Safe to call even if ffmpeg was never loaded.
 */
export function terminateFfmpeg() {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
    ffmpegLoadPromise = null;
  }
}

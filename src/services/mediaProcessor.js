/**
 * Browser-side high performance media processing:
 * 1. Fast speech audio extraction using MediaRecorder streaming (no RAM spike).
 * 2. Visual slide snapshot sampling from video canvas.
 */

/**
 * Convert an AudioBuffer to a standard 16-bit PCM WAV Blob.
 */
function audioBufferToWavBlob(audioBuffer, targetSampleRate = 16000) {
  const numChannels = 1; // Mono for speech

  // Downmix to mono if stereo/multichannel
  let monoChannel;
  if (audioBuffer.numberOfChannels === 1) {
    monoChannel = audioBuffer.getChannelData(0);
  } else {
    monoChannel = new Float32Array(audioBuffer.length);
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < audioBuffer.length; i++) {
      monoChannel[i] = (ch0[i] + ch1[i]) / 2;
    }
  }

  // Resample to targetSampleRate if needed
  let finalSamples;
  let finalSampleRate = audioBuffer.sampleRate;

  if (audioBuffer.sampleRate !== targetSampleRate) {
    const ratio = audioBuffer.sampleRate / targetSampleRate;
    const newLength = Math.round(monoChannel.length / ratio);
    finalSamples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.min(Math.round(i * ratio), monoChannel.length - 1);
      finalSamples[i] = monoChannel[srcIdx];
    }
    finalSampleRate = targetSampleRate;
  } else {
    finalSamples = monoChannel;
  }

  // Build 16-bit PCM WAV
  const numSamples = finalSamples.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = finalSampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, finalSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, finalSamples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Extract speech audio using Web Audio API.
 * For files <= 80MB: loads entire buffer into memory (safe).
 * For files > 80MB: falls back to MediaRecorder streaming (no RAM spike).
 *
 * @param {File} file - Input video or audio file
 * @param {Function} [onProgress] - Status callback
 * @returns {Promise<File>} - Extracted speech audio File (or original on failure)
 */
export async function extractSpeechAudio(file, onProgress) {
  if (!file) return file;

  const fileSizeMB = file.size / (1024 * 1024);
  const isVideo = file.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(file.name || '');

  // Pure audio files under 25MB: pass directly, no extraction needed
  if (!isVideo && fileSizeMB < 25) {
    return file;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  // --- Strategy A: decodeAudioData (safe for small/medium files up to 80MB) ---
  if (fileSizeMB <= 80 && AudioContextClass) {
    onProgress?.("Extracting speech audio in browser...");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new AudioContextClass();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const wavBlob = audioBufferToWavBlob(audioBuffer, 16000);
      audioCtx.close();

      const audioFile = new File(
        [wavBlob],
        file.name.replace(/\.[^/.]+$/, '') + '_speech.wav',
        { type: 'audio/wav' }
      );
      console.log(`[MediaProcessor] Audio extracted: ${fileSizeMB.toFixed(1)} MB → ${(audioFile.size / 1024 / 1024).toFixed(1)} MB`);
      return audioFile;
    } catch (err) {
      console.warn('[MediaProcessor] decodeAudioData failed, trying MediaRecorder streaming:', err);
    }
  }

  // --- Strategy B: MediaRecorder streaming (for large files 80MB–500MB+, no RAM spike) ---
  if (typeof MediaRecorder !== 'undefined') {
    onProgress?.("Streaming audio extraction for large file...");
    try {
      const audioFile = await extractAudioViaMediaRecorder(file, onProgress);
      if (audioFile) return audioFile;
    } catch (err) {
      console.warn('[MediaProcessor] MediaRecorder extraction failed:', err);
    }
  }

  // --- Strategy C: Return raw file and let Gemini File API handle it ---
  console.warn('[MediaProcessor] All audio extraction strategies failed. Using raw file for Gemini File API upload.');
  return file;
}

/**
 * Extract audio using MediaRecorder streaming: plays video silently in a hidden element
 * and records the audio stream. Avoids loading the full file into RAM at once.
 * Produces a WebM audio blob.
 */
async function extractAudioViaMediaRecorder(file, onProgress) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = false; // We need real audio
    video.volume = 0;    // Silent playback
    video.playsInline = true;
    video.preload = 'auto';
    video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);

    const fileUrl = URL.createObjectURL(file);
    video.src = fileUrl;

    const cleanup = (blob) => {
      URL.revokeObjectURL(fileUrl);
      video.pause();
      document.body.removeChild(video);

      if (!blob || blob.size < 1000) {
        console.warn('[MediaProcessor] MediaRecorder produced empty audio.');
        resolve(null);
        return;
      }

      // Determine output MIME type from what MediaRecorder gave us
      const outMime = blob.type || 'audio/webm';
      const ext = outMime.includes('ogg') ? 'ogg' : 'webm';
      const outFile = new File(
        [blob],
        file.name.replace(/\.[^/.]+$/, '') + `_speech.${ext}`,
        { type: outMime }
      );
      console.log(`[MediaProcessor] MediaRecorder extracted audio: ${(outFile.size / 1024 / 1024).toFixed(1)} MB (${outMime})`);
      resolve(outFile);
    };

    video.onerror = (e) => {
      URL.revokeObjectURL(fileUrl);
      document.body.removeChild(video);
      reject(new Error('Video element failed to load for MediaRecorder: ' + e));
    };

    video.onloadedmetadata = () => {
      try {
        // Capture audio stream from the video element
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
        if (!stream) {
          document.body.removeChild(video);
          URL.revokeObjectURL(fileUrl);
          resolve(null);
          return;
        }

        // Keep only the audio tracks to produce a small audio-only stream
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          document.body.removeChild(video);
          URL.revokeObjectURL(fileUrl);
          resolve(null);
          return;
        }
        const audioOnlyStream = new MediaStream(audioTracks);

        // Find best supported audio MIME type
        const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
        const supportedMime = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

        const recorder = new MediaRecorder(audioOnlyStream, supportedMime ? { mimeType: supportedMime } : {});
        const chunks = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          cleanup(blob);
        };

        recorder.onerror = (e) => {
          cleanup(null);
        };

        // Start recording and play video at 4× speed to extract audio quickly
        recorder.start(1000); // 1-second chunks
        video.playbackRate = 4.0; // 4× speed — 1-hour video done in 15 minutes
        video.play();

        const duration = video.duration;
        video.ontimeupdate = () => {
          const progress = Math.round((video.currentTime / duration) * 100);
          onProgress?.(`Extracting audio track (${progress}%)...`);
        };

        video.onended = () => {
          recorder.stop();
          audioTracks.forEach((t) => t.stop());
        };
      } catch (err) {
        document.body.removeChild(video);
        URL.revokeObjectURL(fileUrl);
        reject(err);
      }
    };
  });
}

/**
 * Fast helper: inspect media duration (in seconds) without full loading.
 * @param {File} file - Audio or video file
 * @returns {Promise<number>} - Duration in seconds (or 0 if unavailable)
 */
export async function getMediaDuration(file) {
  if (!file) return 0;
  const isVideo = file.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(file.name || '');
  return new Promise((resolve) => {
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'metadata';
    el.muted = true;
    const url = URL.createObjectURL(file);
    el.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
    };

    el.onloadedmetadata = () => {
      const dur = el.duration;
      cleanup();
      resolve(dur && !isNaN(dur) && dur !== Infinity ? dur : 0);
    };

    el.onerror = () => {
      cleanup();
      resolve(0);
    };

    setTimeout(() => {
      cleanup();
      resolve(0);
    }, 3500);
  });
}

/**
 * Capture keyframe slide snapshots from video at spaced intervals across the whole duration.
 * @param {File} file - Video file
 * @param {number} [maxFrames=8] - Maximum frames to sample
 * @param {Function} [onProgress] - Status callback
 * @returns {Promise<Array<{inlineData: {data: string, mimeType: string}}>>}
 */
export async function extractVideoKeyframes(file, maxFrames = 8, onProgress) {
  const isVideo = file.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file.name || '');
  if (!isVideo) return [];

  onProgress?.("Sampling slide keyframes for visual context...");

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const fileUrl = URL.createObjectURL(file);
    video.src = fileUrl;

    const cleanup = () => {
      URL.revokeObjectURL(fileUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      console.warn('[MediaProcessor] Video keyframe extraction failed, proceeding with audio only.');
      cleanup();
      resolve([]);
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || isNaN(duration) || duration <= 0) {
        cleanup();
        resolve([]);
        return;
      }

      // For long videos (e.g. 1-4 hours), sample 6 to 8 frames evenly across the whole lecture
      const frameCount = Math.min(maxFrames, Math.max(4, Math.floor(duration / 300)));
      const timestamps = [];
      const step = (duration * 0.9) / (frameCount + 1);
      for (let i = 1; i <= frameCount; i++) {
        timestamps.push(duration * 0.05 + i * step);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = Math.min(1, 960 / (video.videoWidth || 960));
      canvas.width = Math.max(320, Math.round((video.videoWidth || 640) * scale));
      canvas.height = Math.max(180, Math.round((video.videoHeight || 360) * scale));

      const keyframes = [];

      for (const time of timestamps) {
        try {
          await new Promise((seekResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Jpeg = canvas.toDataURL('image/jpeg', 0.55).split(',')[1];
                if (base64Jpeg) {
                  keyframes.push({ inlineData: { data: base64Jpeg, mimeType: 'image/jpeg' } });
                }
              } catch (e) {
                console.warn('[MediaProcessor] Frame capture error:', e);
              }
              seekResolve();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = time;
          });
        } catch (seekErr) {
          console.warn('[MediaProcessor] Seek error:', seekErr);
        }
      }

      cleanup();
      console.log(`[MediaProcessor] Captured ${keyframes.length} visual slide keyframes.`);
      resolve(keyframes);
    };
  });
}


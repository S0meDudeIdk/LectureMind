import { useCallback, useEffect, useRef, useState } from 'react';
import { generateLectureContent, cancelGeneration, resolveMimeType } from '../services/gemini';
import { saveMindmap, updateMindmap, extractTitleFromMarkdown } from '../services/db';
import { saveMediaToLocalDb } from '../services/mediaDb';
import { uploadMediaToCloud } from '../services/storage';
import { getMaxFileSizeBytes, isAnonymous } from '../utils/authLimits';
import { validateMedia } from '../../shared/lectureContract.js';

export function useAudioUpload({ user, canGenerate, incrementGeneration, onRecord } = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState(null);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(null);
  const operation = useRef(null);
  const recordCallback = useRef(onRecord);
  useEffect(() => { recordCallback.current = onRecord; }, [onRecord]);
  const reset = useCallback(() => {
    const current = operation.current;
    operation.current = null;
    if (current) {
      current.controller.abort();
      cancelGeneration(current.jobId);
      if (current.extracting) import('../services/audioExtractor').then(m => m.terminateFfmpeg()).catch(() => {});
    }
    setIsProcessing(false); setProgressMsg(''); setCloudUploadProgress(null); setError(null);
  }, []);
  useEffect(() => reset, [user?.uid, reset]);
  const processAudio = async (input) => {
    if (operation.current) throw new Error('A recording is already being processed.');
    if (!user?.uid) throw new Error('Connect and wait for authentication before generating.');
    const mime = resolveMimeType(input);
    const file = mime === input.type ? input : new File([input], input.name, { type: mime });
    validateMedia(file, getMaxFileSizeBytes(user));
    if (canGenerate === false) throw new Error('Generation limit reached. Try again after the daily reset.');
    const task = { controller: new AbortController(), jobId: crypto.randomUUID(), extracting: false };
    operation.current = task;
    const signal = task.controller.signal;
    const check = () => { if (operation.current !== task || signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
    const progress = msg => { if (operation.current === task) setProgressMsg(msg); };
    const cloudProgress = msg => { if (operation.current === task) setCloudUploadProgress(msg); };
    setIsProcessing(true); setError(null); progress('Saving recording on this device...');
    let record;
    try {
      record = await saveMindmap(file.name.replace(/\.[^/.]+$/, ''), '', `${(file.size / 1048576).toFixed(1)} MB`, {
        fileName: file.name, fileSize: file.size, mimeType: file.type, isVideo: file.type.startsWith('video/'),
        notes: '', transcript: [], audioUrl: null, generationStatus: 'uploading',
      }, user);
      check();
      await saveMediaToLocalDb(record.id, file, { isVideo: record.isVideo, fileName: file.name, mimeType: file.type }, user);
      check(); recordCallback.current?.(record);
      // Upload the original video for playback; derived audio is a separate temporary asset.
      const source = await uploadMediaToCloud(file, record.id, cloudProgress, user, { signal, kind: 'source' });
      check();
      record = await updateMindmap(record.id, { playbackUploadId: isAnonymous(user) ? null : source.uploadId }, user);
      let processing = file;
      if (record.isVideo && file.size > 50 * 1048576) {
        progress('Extracting audio for analysis...'); task.extracting = true;
        const extractor = await import('../services/audioExtractor');
        check();
        const extracted = await extractor.extractAudioFromVideo(file, fraction => progress(`Extracting audio (${Math.round(fraction * 100)}%)...`));
        task.extracting = false; check();
        if (extracted) processing = extracted;
      }
      const analysis = processing === file ? source : await uploadMediaToCloud(processing, record.id, cloudProgress, user, { signal, kind: 'processing' });
      check(); setCloudUploadProgress(null);
      record = await updateMindmap(record.id, { generationStatus: 'processing' }, user);
      const result = await generateLectureContent(processing, progress, { uploadId: analysis.uploadId, jobId: task.jobId, signal, originalIsVideo: processing.type.startsWith('video/') });
      check();
      record = await updateMindmap(record.id, { ...result, title: extractTitleFromMarkdown(result.markdown, record.title), generationStatus: 'complete' }, user);
      check(); recordCallback.current?.(record); incrementGeneration?.();
      return record;
    } catch (failure) {
      const cancelled = operation.current !== task || signal.aborted || failure.name === 'AbortError';
      if (record) await updateMindmap(record.id, { generationStatus: cancelled ? 'cancelled' : 'failed' }, user).catch(() => {});
      if (cancelled) throw new DOMException('Cancelled', 'AbortError');
      if (operation.current === task) setError(failure.message || 'Recording processing failed.');
      throw failure;
    } finally {
      if (operation.current === task) { operation.current = null; setIsProcessing(false); setProgressMsg(''); setCloudUploadProgress(null); }
    }
  };
  return { processAudio, isProcessing, progressMsg, cloudUploadProgress, error, reset, clearError: () => setError(null) };
}

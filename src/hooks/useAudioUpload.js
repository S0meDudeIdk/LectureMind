import { useState } from 'react';
import { generateLectureContent, generateLectureContentFromUpload } from '../services/gemini';
import { saveMindmap, updateMindmap, extractTitleFromMarkdown } from '../services/db';
import { saveMediaToLocalDb } from '../services/mediaDb';
import { uploadMediaToCloud } from '../services/storage';
import { extractAudioFromVideo } from '../services/audioExtractor';
import { isAnonymous } from '../utils/authLimits';

export function useAudioUpload({ user, canGenerate, incrementGeneration } = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState(null);
  const [markdown, setMarkdown] = useState("");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [savedMindmap, setSavedMindmap] = useState(null);
  const [cloudUploadProgress, setCloudUploadProgress] = useState(null);

  const processAudio = async (file) => {
    setIsProcessing(true);
    setError(null);
    setProgressMsg("Starting process...");
    setCloudUploadProgress(null);

    try {
      if (isAnonymous(user) && canGenerate === false) {
        throw new Error('Anonymous users are limited to 5 generations per day. Sign in for unlimited.');
      }

      const fileIsVideo = file?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file?.name || '');
      setIsVideo(fileIsVideo);
      setMimeType(file?.type || "");

      // 1. Instant local blob URL for immediate playback
      let blobUrl = null;
      if (file) {
        try {
          blobUrl = URL.createObjectURL(file);
          setAudioUrl(blobUrl);
          setFileName(file.name || "Lecture Media");

          // Cache in IndexedDB immediately (same-device fast reload)
          saveMediaToLocalDb(file.name, file, {
            isVideo: fileIsVideo,
            fileName: file.name,
            mimeType: file.type,
          });
        } catch {
          // ignore
        }
      }

      // 2. Save skeleton mindmap record immediately (local-only for anonymous users)
      const fileTitle = file.name ? file.name.replace(/\.[^/.]+$/, "") : "Lecture Mindmap";
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

      let saved = null;
      try {
        saved = await saveMindmap(fileTitle, '', `${fileSizeMB} MB`, {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          isVideo: fileIsVideo,
          audioUrl: null,
          notes: '',
          transcript: [],
        }, user);
        setSavedMindmap(saved);
      } catch (saveErr) {
        console.warn("Initial mindmap save failed:", saveErr);
      }

      // For large video files, extract the audio track to reduce upload size
      // and improve processing reliability. Fallback to original video if extraction fails.
      const LARGE_VIDEO_THRESHOLD_BYTES = 50 * 1024 * 1024;
      const shouldExtractAudio = fileIsVideo && file.size > LARGE_VIDEO_THRESHOLD_BYTES;
      let processingFile = file;

      if (shouldExtractAudio) {
        setProgressMsg('Extracting audio track from video...');
        try {
          const extractedAudio = await extractAudioFromVideo(file, (progress) => {
            const pct = Math.round(progress * 100);
            setProgressMsg(`Extracting audio track (${pct}%)...`);
          });

          if (extractedAudio) {
            processingFile = extractedAudio;
            setProgressMsg('Audio extraction complete.');
          } else {
            setProgressMsg('Audio extraction unavailable, using original video...');
          }
        } catch (extractErr) {
          console.warn('[useAudioUpload] Audio extraction failed:', extractErr);
          setProgressMsg('Audio extraction failed, using original video...');
        }
      }

      let cleanMarkdown = '';
      let cleanNotes = '';
      let transcriptChunks = [];

      if (isAnonymous(user)) {
        // 3a. Anonymous path: stream the media file to a temporary server-side GCS bucket,
        // run Vertex AI, then the server cleans up the staged object.
        const aiAnalysisPromise = generateLectureContentFromUpload(processingFile, (msg) => setProgressMsg(msg), { originalIsVideo: fileIsVideo });

        const result = await aiAnalysisPromise;
        cleanMarkdown = result.markdown;
        cleanNotes = result.notes || result.markdown;
        transcriptChunks = result.transcript || [];

        incrementGeneration?.();
      } else {
        // 3b. Logged-in path: upload media to Firebase Storage and obtain the gs:// URI
        // required by the server-side Vertex AI endpoint.
        const cloudUploadPromise = saved?.id && processingFile
          ? uploadMediaToCloud(processingFile, saved.id, (msg) => {
              setCloudUploadProgress(msg);
            }, user)
          : Promise.resolve(null);

        const cloudUploadResult = await cloudUploadPromise;
        setCloudUploadProgress(null);

        if (!cloudUploadResult?.gsUri) {
          throw new Error(
            'Cloud storage upload is required for AI generation, but it did not complete. ' +
            'Please check your Firebase Storage configuration and try again.'
          );
        }

        const { downloadUrl, gsUri } = cloudUploadResult;

        setAudioUrl(downloadUrl);
        if (saved?.id) {
          updateMindmap(saved.id, { audioUrl: downloadUrl }, user).catch((e) =>
            console.warn('[Storage] Firestore cloud URL update failed:', e)
          );
        }

        const aiAnalysisPromise = generateLectureContent(processingFile, (msg) => setProgressMsg(msg), {
          gsUri,
          originalIsVideo: fileIsVideo,
        });

        const result = await aiAnalysisPromise;
        cleanMarkdown = result.markdown;
        cleanNotes = result.notes || result.markdown;
        transcriptChunks = result.transcript || [];
      }

      setMarkdown(cleanMarkdown);
      setNotes(cleanNotes || cleanMarkdown);
      setTranscript(transcriptChunks || []);
      setProgressMsg("");

      // 4. Update mindmap record with full AI content
      const title = extractTitleFromMarkdown(cleanMarkdown, fileTitle);
      if (saved?.id) {
        try {
          await updateMindmap(saved.id, {
            title,
            markdown: cleanMarkdown,
            notes: cleanNotes || cleanMarkdown,
            transcript: transcriptChunks || [],
          }, user);
          setSavedMindmap((prev) => prev ? { ...prev, title, markdown: cleanMarkdown } : prev);
        } catch (updateErr) {
          console.warn("Mindmap AI content update failed:", updateErr);
        }

        // 5. Save to IndexedDB under all keys for fast same-device reload
        try {
          await saveMediaToLocalDb(saved.id, file, { isVideo: fileIsVideo, fileName: file.name, mimeType: file.type });
          if (title) await saveMediaToLocalDb(title, file, { isVideo: fileIsVideo, fileName: file.name, mimeType: file.type });
        } catch {
          // non-fatal
        }
      }

      return cleanMarkdown;
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during media processing.");
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl);
    }
    setMarkdown("");
    setNotes("");
    setTranscript([]);
    setAudioUrl(null);
    setFileName("");
    setMimeType("");
    setIsVideo(false);
    setSavedMindmap(null);
    setError(null);
    setCloudUploadProgress(null);
  };

  return { 
    processAudio, 
    isProcessing, 
    progressMsg,
    cloudUploadProgress,
    error, 
    markdown, 
    notes,
    setNotes,
    transcript,
    setTranscript,
    audioUrl,
    setAudioUrl,
    fileName,
    mimeType,
    isVideo,
    savedMindmap,
    reset 
  };
}

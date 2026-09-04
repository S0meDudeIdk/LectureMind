import { useState } from 'react';
import { generateLectureContent } from '../services/gemini';
import { saveMindmap, updateMindmap, extractTitleFromMarkdown } from '../services/db';
import { saveMediaToLocalDb } from '../services/mediaDb';
import { uploadMediaToCloud } from '../services/storage';

export function useAudioUpload() {
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

      // 2. Save skeleton Firestore record immediately (to get a stable lectureId)
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
        });
        setSavedMindmap(saved);
      } catch (saveErr) {
        console.warn("Initial Firestore save failed:", saveErr);
      }

      // 3. Upload media to Firebase Storage and obtain the gs:// URI required
      // by the server-side Vertex AI endpoint. AI generation cannot proceed
      // without a valid cloud storage reference.
      const cloudUploadPromise = saved?.id && file
        ? uploadMediaToCloud(file, saved.id, (msg) => {
            setCloudUploadProgress(msg);
          })
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
        updateMindmap(saved.id, { audioUrl: downloadUrl }).catch((e) =>
          console.warn('[Storage] Firestore cloud URL update failed:', e)
        );
      }

      const aiAnalysisPromise = generateLectureContent(file, (msg) => setProgressMsg(msg), {
        gsUri,
      });

      // Wait for AI analysis (primary — shows mindmap as soon as done)
      const {
        markdown: cleanMarkdown,
        notes: cleanNotes,
        transcript: transcriptChunks
      } = await aiAnalysisPromise;

      setMarkdown(cleanMarkdown);
      setNotes(cleanNotes || cleanMarkdown);
      setTranscript(transcriptChunks || []);
      setProgressMsg("");

      // 4. Update Firestore with full AI content
      const title = extractTitleFromMarkdown(cleanMarkdown, fileTitle);
      if (saved?.id) {
        try {
          await updateMindmap(saved.id, {
            title,
            markdown: cleanMarkdown,
            notes: cleanNotes || cleanMarkdown,
            transcript: transcriptChunks || [],
          });
          setSavedMindmap((prev) => prev ? { ...prev, title, markdown: cleanMarkdown } : prev);
        } catch (updateErr) {
          console.warn("Firestore AI content update failed:", updateErr);
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

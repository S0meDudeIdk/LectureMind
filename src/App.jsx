import { useState, useMemo } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import LoadingOverlay from './components/LoadingOverlay';
import MindmapViewer from './components/MindmapViewer';
import MarkdownEditor from './components/MarkdownEditor';
import TranscriptViewer from './components/TranscriptViewer';
import MindmapAudioWidget from './components/MindmapAudioWidget';
import ErrorBanner from './components/ErrorBanner';
import GoogleDocsExportModal from './components/GoogleDocsExportModal';
import { useAudioUpload } from './hooks/useAudioUpload';
import { getMediaFromLocalDb } from './services/mediaDb';
import { updateMindmap } from './services/db';
import { 
  exportMindmapAsJpg, 
  exportMindmapAsPdf, 
  exportMarkdownFile, 
  exportToGoogleDocs 
} from './utils/exportUtils';

export default function App() {
  const [activeLectureId, setActiveLectureId] = useState(null);
  const [customMarkdown, setCustomMarkdown] = useState(null);
  const [customNotes, setCustomNotes] = useState(null);
  const [customTranscript, setCustomTranscript] = useState([]);
  const [customAudioUrl, setCustomAudioUrl] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customIsVideo, setCustomIsVideo] = useState(false);
  const [activeTab, setActiveTab] = useState('mindmap');
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);

  const {
    processAudio,
    isProcessing,
    progressMsg,
    cloudUploadProgress,
    error,
    markdown: uploadedMarkdown,
    notes: uploadedNotes,
    transcript: uploadedTranscript,
    audioUrl: uploadedAudioUrl,
    fileName: uploadedFileName,
    isVideo: uploadedIsVideo,
    reset,
  } = useAudioUpload();

  const activeMarkdown   = customMarkdown !== null ? customMarkdown : (uploadedMarkdown || '');
  const activeNotes      = customNotes !== null ? customNotes : (uploadedNotes || activeMarkdown);
  const activeTranscript = customTranscript.length > 0 ? customTranscript : uploadedTranscript;
  const activeAudioUrl   = customAudioUrl || uploadedAudioUrl;
  const activeIsVideo    = customIsVideo || uploadedIsVideo;
  const hasContent       = !!(activeMarkdown && !isProcessing);

  const activeTitle = useMemo(() => {
    if (customTitle) return customTitle;
    if (uploadedFileName) return uploadedFileName.replace(/\.[^/.]+$/, '');
    const match = activeMarkdown.match(/^#\s+(.+)$/m);
    return match ? match[1] : 'Lecture Mindmap';
  }, [customTitle, uploadedFileName, activeMarkdown]);

  /* ── Handlers ── */
  const handleFileSelect = async (file) => {
    setCustomMarkdown(null);
    setCustomNotes(null);
    setCustomTranscript([]);
    setCustomAudioUrl(null);
    const isVid = file?.type?.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file?.name || '');
    setCustomIsVideo(isVid);
    setCustomTitle(file.name ? file.name.replace(/\.[^/.]+$/, '') : '');
    setActiveLectureId('new');
    setActiveTab('mindmap');
    try {
      await processAudio(file);
    } catch {
      /* handled by hook */
    }
  };

  const handleLectureSelect = async (lec) => {
    if (!lec) return;
    setActiveLectureId(lec.id);

    setCustomMarkdown(lec.markdown !== undefined ? lec.markdown : null);
    setCustomNotes(lec.notes !== undefined ? lec.notes : null);
    setCustomTranscript(lec.transcript || []);
    setCustomTitle(lec.title || '');

    const isVid = !!lec.isVideo || (lec.mimeType?.startsWith('video/') ?? false);
    setCustomIsVideo(isVid);

    // Hybrid Media Resolution:
    // 1. Check local IndexedDB first (instant 0ms playback, 0 network bandwidth on same device)
    let loadedLocally = false;
    try {
      const localRecord = await getMediaFromLocalDb(lec.id, lec.fileName || lec.title);
      if (localRecord && localRecord.blob) {
        const blobUrl = URL.createObjectURL(localRecord.blob);
        setCustomAudioUrl(blobUrl);
        if (localRecord.isVideo !== undefined) {
          setCustomIsVideo(localRecord.isVideo);
        }
        loadedLocally = true;
      }
    } catch (err) {
      console.warn('Local IndexedDB lookup failed, checking cloud URL:', err);
    }

    // 2. If not found in local IndexedDB (different device / cleared cache), use permanent Firebase Cloud URL
    if (!loadedLocally) {
      if (lec.audioUrl) {
        setCustomAudioUrl(lec.audioUrl);
      } else {
        setCustomAudioUrl(null);
      }
    }
  };

  const handleNew = () => {
    setActiveLectureId(null);
    setCustomMarkdown(null);
    setCustomNotes(null);
    setCustomTranscript([]);
    setCustomAudioUrl(null);
    setCustomIsVideo(false);
    setCustomTitle('');
    setActiveTab('mindmap');
    reset();
  };

  const handleRenameLecture = (id, newTitle) => {
    if (id === activeLectureId) {
      setCustomTitle(newTitle);
      if (activeMarkdown) {
        setCustomMarkdown(activeMarkdown.replace(/^#\s+(.+)$/m, `# ${newTitle}`));
      }
      if (activeNotes) {
        setCustomNotes(activeNotes.replace(/^#\s+(.+)$/m, `# ${newTitle}`));
      }
    }
  };

  const handleDeleteLecture = (id) => {
    if (id === activeLectureId) handleNew();
  };

  const handleNotesSave = (rawMd) => {
    setCustomNotes(rawMd);
    if (activeLectureId && activeLectureId !== 'new') {
      updateMindmap(activeLectureId, { notes: rawMd });
    }
  };

  const handleExportMd = () => {
    exportMarkdownFile(activeNotes || activeMarkdown, activeTitle || 'lecture-notes');
  };

  const handleExportDocs = () => {
    setIsDocsModalOpen(true);
  };

  const handleExportMindmapJpg = () => {
    exportMindmapAsJpg(activeTitle || 'lecture-mindmap', activeMarkdown);
  };

  const handleExportMindmapPdf = () => {
    exportMindmapAsPdf(activeTitle || 'lecture-mindmap', activeMarkdown);
  };

  const sidebar = (
    <Sidebar
      activeId={activeLectureId}
      onNew={handleNew}
      onSelectLecture={handleLectureSelect}
      onRenameLecture={handleRenameLecture}
      onDeleteLecture={handleDeleteLecture}
    />
  );

  return (
    <Layout
      sidebar={sidebar}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      hasContent={hasContent}
      onExportMd={handleExportMd}
      onExportDocs={handleExportDocs}
      onExportMindmapJpg={handleExportMindmapJpg}
      onExportMindmapPdf={handleExportMindmapPdf}
    >
      {/* ── Empty state ── */}
      {!activeMarkdown && !isProcessing && (
        <div className="flex flex-col items-center justify-center h-full">
          <ErrorBanner message={error} onDismiss={reset} />
          <DropZone onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* ── Loading ── */}
      {isProcessing && (
        <LoadingOverlay message={progressMsg || 'Analyzing audio with Gemini…'} />
      )}

      {/* ── Content views ── */}
      {hasContent && (
        <div className="flex flex-col h-full">
          {/* Cloud upload background indicator */}
          {cloudUploadProgress && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
              borderBottom: '1px solid rgba(99,102,241,0.25)',
              padding: '6px 16px',
              fontSize: '12px',
              color: 'rgba(165,180,252,0.9)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⟳</span>
              {cloudUploadProgress}
            </div>
          )}
          <div className="flex-1 overflow-hidden relative">
            {/* Mindmap Tab View - Kept mounted and measured in background for instant switching & export readiness */}
            <div
              id="mindmap-tab-pane"
              className={`h-full w-full ${activeTab === 'mindmap' ? 'block relative z-0' : 'absolute inset-0 invisible pointer-events-none -z-10'}`}
            >
              <MindmapViewer markdown={activeMarkdown} />
            </div>

            {/* Note Editor Tab View - Kept mounted to preserve scroll & cursor */}
            <div
              className={`h-full w-full overflow-y-auto p-5 ${activeTab === 'editor' ? 'block relative z-0' : 'absolute inset-0 invisible pointer-events-none -z-10'}`}
            >
              <MarkdownEditor
                markdown={activeMarkdown}
                notes={activeNotes}
                onContentChange={(_html, rawMd) => setCustomNotes(rawMd)}
                onSave={handleNotesSave}
              />
            </div>

            {/* Transcript Tab View */}
            {activeTab === 'transcript' && (
              <div className="h-full overflow-y-auto p-5">
                <TranscriptViewer transcript={activeTranscript} />
              </div>
            )}

            {/* Global Floating Lecture Audio/Video Player & Transcript (persists across all tabs) */}
            <MindmapAudioWidget
              audioUrl={activeAudioUrl}
              transcript={activeTranscript}
              title={activeTitle}
              isVideo={activeIsVideo}
            />

            <GoogleDocsExportModal
              isOpen={isDocsModalOpen}
              onClose={() => setIsDocsModalOpen(false)}
              content={activeNotes || activeMarkdown}
              title={activeTitle || 'Lecture Notes'}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}

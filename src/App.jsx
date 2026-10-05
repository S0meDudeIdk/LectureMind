import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorBanner from './components/ErrorBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { useAudioUpload } from './hooks/useAudioUpload';
import { useGenerationLimit } from './hooks/useGenerationLimit';
import { useAuth } from './services/auth';
import { getMediaFromLocalDb } from './services/mediaDb';
import { updateMindmap } from './services/db';
import { getMediaPlaybackUrl } from './services/storage';

const MindmapViewer = lazy(() => import('./components/MindmapViewer'));
const MarkdownEditor = lazy(() => import('./components/MarkdownEditor'));
const MindmapAudioWidget = lazy(() => import('./components/MindmapAudioWidget'));
const GoogleDocsExportModal = lazy(() => import('./components/GoogleDocsExportModal'));

export default function App() {
  const { user, loading } = useAuth();
  const { canGenerate, increment } = useGenerationLimit(user);
  const [active, setActive] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [activeTab, setActiveTab] = useState('mindmap');
  const [editorOpened, setEditorOpened] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [viewError, setViewError] = useState(null);
  const selection = useRef(0);
  const playbackRequest = useRef(null);
  const ownedBlob = useRef(null);
  const dirty = useRef(false);
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    const protectDraft = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, []);
  const clearPlayback = useCallback(() => {
    playbackRequest.current?.abort();
    if (ownedBlob.current) URL.revokeObjectURL(ownedBlob.current);
    ownedBlob.current = null; setAudioUrl(null);
  }, []);
  const received = useCallback(record => { dirty.current = false; activeRef.current = record; setActive(record); }, []);
  const upload = useAudioUpload({ user, canGenerate, incrementGeneration: increment, onRecord: received });
  const resetUpload = upload.reset;
  const reset = useCallback(() => {
    selection.current++; clearPlayback(); dirty.current = false;
    activeRef.current = null; setActive(null); setActiveTab('mindmap'); setEditorOpened(false); setDocsOpen(false); setViewError(null);
    resetUpload();
  }, [clearPlayback, resetUpload]);
  useEffect(() => { reset(); return () => { playbackRequest.current?.abort(); if (ownedBlob.current) URL.revokeObjectURL(ownedBlob.current); }; }, [user?.uid, reset]);
  useEffect(() => { if (activeTab === 'editor') setEditorOpened(true); }, [activeTab]);
  const select = async record => {
    upload.reset(); const ticket = ++selection.current;
    clearPlayback(); dirty.current = false; activeRef.current = record; setActive(record); setViewError(null);
    const controller = new AbortController(); playbackRequest.current = controller;
    try {
      const cached = await getMediaFromLocalDb(record.id, '', user);
      if (ticket !== selection.current) return;
      if (cached?.blob) { const url = URL.createObjectURL(cached.blob); ownedBlob.current = url; setAudioUrl(url); }
      else if (record.playbackUploadId) {
        const url = await getMediaPlaybackUrl(record.playbackUploadId, controller.signal);
        if (ticket === selection.current) setAudioUrl(url);
      }
    } catch (failure) { if (ticket === selection.current && failure.name !== 'AbortError') setViewError(`Recording unavailable: ${failure.message}`); }
  };
  const onFileSelect = async file => {
    clearPlayback(); const ticket = ++selection.current; dirty.current = false; activeRef.current = null; setActive(null); setActiveTab('mindmap'); setEditorOpened(false); setViewError(null);
    try {
      const record = await upload.processAudio(file);
      if (record) { const local = await getMediaFromLocalDb(record.id, '', user); if (ticket === selection.current && activeRef.current?.id === record.id && local?.blob) { const url = URL.createObjectURL(local.blob); ownedBlob.current = url; setAudioUrl(url); } }
    } catch (failure) { if (ticket === selection.current && failure.name !== 'AbortError') setViewError(failure.message); }
  };
  const saveNotes = async (content, lectureId) => {
    if (!lectureId) throw new Error('Select a lecture before saving.');
    let updated;
    try { updated = await updateMindmap(lectureId, { notes: content }, user); }
    catch (failure) { setViewError(`Notes could not be saved: ${failure.message}`); throw failure; }
    if (activeRef.current?.id === lectureId && activeRef.current.notes === content) { dirty.current = false; setActive(updated); }
    return updated;
  };
  const onRecordsChanged = useCallback(records => {
    setActive(current => {
      const remote = records.find(item => item.id === current?.id);
      if (!remote || (remote.revision === current.revision && remote.syncStatus === current.syncStatus)) return current;
      return dirty.current ? { ...remote, notes: current.notes } : remote;
    });
  }, []);
  const exportImage = async (format, options) => (await import('./utils/exportUtils')).exportMindmapAsImage(active?.title, format, options);
  const hasContent = Boolean(active?.markdown && !upload.isProcessing);
  return (
    <Layout sidebar={<Sidebar activeId={active?.id} onNew={reset} onSelectLecture={select} onRecordsChanged={onRecordsChanged}
      onRenameLecture={(id, title) => setActive(current => current?.id === id ? { ...current, title } : current)}
      onDeleteLecture={id => { if (activeRef.current?.id === id) reset(); }} />}
      activeTab={activeTab} setActiveTab={setActiveTab} hasContent={hasContent}
      onExportMd={async () => (await import('./utils/exportUtils')).exportMarkdownFile(active?.notes ?? active?.markdown, active?.title)}
      onExportDocs={() => setDocsOpen(true)}
      onExportMindmapJpg={opts => exportImage('jpg', opts)} onExportMindmapPng={opts => exportImage('png', opts)} onExportMindmapPdf={opts => exportImage('pdf', opts)}>
      <ErrorBanner message={viewError || upload.error} onDismiss={() => { setViewError(null); upload.clearError(); }} />
      {upload.isProcessing ? <LoadingOverlay message={upload.progressMsg || 'Processing recording...'} /> : !hasContent && (
        <div className="empty-state-wrapper flex flex-col items-center justify-center h-full">
          {loading ? <p role="status">Restoring your session...</p> : <DropZone onFileSelect={onFileSelect} />}
        </div>
      )}
      {hasContent && <div className="flex flex-col h-full">
        {upload.cloudUploadProgress && <p role="status">{upload.cloudUploadProgress}</p>}
        <div className="flex-1 overflow-hidden relative">
            <div id="mindmap-tab-pane" className={`h-full w-full ${activeTab === 'mindmap' ? 'block relative z-0' : 'absolute inset-0 invisible pointer-events-none -z-10'}`}>
              <Suspense fallback={<p role="status" className="p-5">Loading mindmap...</p>}>
              <ErrorBoundary key={`map-${active.id}`} title="Mindmap failed to display"><MindmapViewer markdown={active.markdown} /></ErrorBoundary>
              </Suspense>
            </div>
            {editorOpened && <div className={`h-full w-full overflow-y-auto p-5 ${activeTab === 'editor' ? 'block relative z-0' : 'absolute inset-0 invisible pointer-events-none -z-10'}`}>
              <Suspense fallback={<p role="status">Loading editor...</p>}>
              <ErrorBoundary key={`editor-${active.id}`} title="Notes editor encountered an error">
                <MarkdownEditor lectureId={active.id} markdown={active.markdown} notes={active.notes ?? active.markdown} syncStatus={active.syncStatus}
                  onContentChange={(_html, raw) => { dirty.current = true; setActive(current => ({ ...current, notes: raw })); }} onSave={saveNotes} />
              </ErrorBoundary>
              </Suspense>
            </div>}
            <Suspense fallback={null}>
            <MindmapAudioWidget lectureId={active.id} audioUrl={audioUrl} transcript={active.transcript || []} title={active.title} isVideo={Boolean(active.isVideo)} />
            {docsOpen && <GoogleDocsExportModal isOpen onClose={() => setDocsOpen(false)} content={active.notes ?? active.markdown} title={active.title} />}
            </Suspense>
        </div>
      </div>}
    </Layout>
  );
}

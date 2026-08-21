import { useState } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import LoadingOverlay from './components/LoadingOverlay';
import MindmapViewer from './components/MindmapViewer';
import ExportButton from './components/ExportButton';
import ErrorBanner from './components/ErrorBanner';
import { useAudioUpload } from './hooks/useAudioUpload';

export default function App() {

  const [activeLectureId, setActiveLectureId] = useState(null);
  const [customMarkdown, setCustomMarkdown] = useState("");
  const { 
    processAudio, 
    isProcessing, 
    progressMsg, 
    error, 
    markdown: uploadedMarkdown, 
    savedMindmap,
    reset 
  } = useAudioUpload();

  const activeMarkdown = customMarkdown || uploadedMarkdown;

  const handleFileSelect = async (file) => {
    setCustomMarkdown("");
    setActiveLectureId('new');
    try {
      await processAudio(file);
    } catch {
      // Error handled by hook
    }
  };

  const handleLectureSelect = (lec) => {
    setActiveLectureId(lec.id);
    setCustomMarkdown(lec.markdown || "");
  };

  const handleNew = () => {
    setActiveLectureId(null);
    setCustomMarkdown("");
    reset();
  };


  const handleRenameLecture = (id, newTitle) => {
    if (id === activeLectureId && activeMarkdown) {
      const updatedMd = activeMarkdown.replace(/^#\s+(.+)$/m, `# ${newTitle}`);
      setCustomMarkdown(updatedMd);
    }
  };

  const handleDeleteLecture = (id) => {
    if (id === activeLectureId) {
      handleNew();
    }
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
    <Layout sidebar={sidebar}>
      {!activeMarkdown && !isProcessing && (
        <div className="flex flex-col items-center justify-center h-full pt-12">
          <ErrorBanner message={error} onDismiss={reset} />
          <DropZone onFileSelect={handleFileSelect} />
        </div>
      )}
      
      {isProcessing && (
        <LoadingOverlay message={progressMsg || "Analyzing audio with Gemini..."} />
      )}
      
      {activeMarkdown && !isProcessing && (
        <div className="flex flex-col h-full gap-4">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-1">Generated Mindmap</h2>
              <p className="text-text-muted text-sm">Interactive view. Scroll to zoom, drag to pan.</p>
            </div>
            <ExportButton 
              onExportDocs={() => console.log('Exporting docs...')} 
              onExportMd={() => {
                const blob = new Blob([activeMarkdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mindmap.md';
                a.click();
              }} 
            />
          </div>
          <div className="flex-1 relative">
            <MindmapViewer markdown={activeMarkdown} />
          </div>
        </div>
      )}
    </Layout>
  );
}


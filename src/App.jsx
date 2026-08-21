import { useState } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import LoadingOverlay from './components/LoadingOverlay';
import MindmapViewer from './components/MindmapViewer';
import ExportButton from './components/ExportButton';
import ErrorBanner from './components/ErrorBanner';
import { useAudioUpload } from './hooks/useAudioUpload';

// Mock data for sidebar with pre-populated mindmap markdown for instant testing
const MOCK_LECTURES = [
  { 
    id: '1', 
    title: 'Introduction to Quantum Computing', 
    date: 'Today', 
    duration: '45:20',
    markdown: `# Quantum Computing
## Fundamental Principles
- Superposition states
- Quantum entanglement
- Interference patterns
## Quantum Hardware
- Superconducting qubits
- Trapped ion systems
- Photonic circuits
## Key Algorithms
- Shor factoring algorithm
- Grover search method
- Quantum Fourier transform
## Practical Applications
- Cryptographic security
- Molecular simulation
- Financial modeling`
  },
  { 
    id: '2', 
    title: 'Machine Learning Ethics', 
    date: 'Yesterday', 
    duration: '1:12:05',
    markdown: `# Machine Learning Ethics
## Algorithmic Bias
- Training data disparity
- Historical prejudice
- Feedback loops
## Privacy & Security
- Model inversion attacks
- Differential privacy
- Federated learning
## Governance Models
- Regulatory frameworks
- Audit standards
- Explainability tools`
  },
];

export default function App() {
  const [activeLectureId, setActiveLectureId] = useState(null);
  const [customMarkdown, setCustomMarkdown] = useState("");
  const { processAudio, isProcessing, progressMsg, error, markdown: uploadedMarkdown, reset } = useAudioUpload();

  const activeMarkdown = customMarkdown || uploadedMarkdown;

  const handleFileSelect = (file) => {
    setCustomMarkdown("");
    processAudio(file);
    setActiveLectureId('new');
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

  const sidebar = (
    <Sidebar 
      lectures={MOCK_LECTURES} 
      activeId={activeLectureId}
      onNew={handleNew}
      onSelectLecture={handleLectureSelect}
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


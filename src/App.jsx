import { useState } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import LoadingOverlay from './components/LoadingOverlay';
import MindmapViewer from './components/MindmapViewer';
import ExportButton from './components/ExportButton';

// Mock data
const MOCK_LECTURES = [
  { id: '1', title: 'Introduction to Quantum Computing', date: 'Today', duration: '45:20' },
  { id: '2', title: 'Machine Learning Ethics', date: 'Yesterday', duration: '1:12:05' },
  { id: '3', title: 'Advanced Data Structures', date: 'Aug 15', duration: '55:10' },
];

const MOCK_MARKDOWN = `
# Quantum Computing Intro
## Qubits
- Superposition
- Entanglement
## Logic Gates
- Pauli-X
- Hadamard
## Applications
- Cryptography
- Optimization
`;

export default function App() {
  const [activeLectureId, setActiveLectureId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [markdown, setMarkdown] = useState('');

  const handleFileSelect = (file) => {
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      setMarkdown(MOCK_MARKDOWN);
      setActiveLectureId('new');
    }, 2500);
  };

  const handleNew = () => {
    setActiveLectureId(null);
    setMarkdown('');
  };

  const sidebar = (
    <Sidebar 
      lectures={MOCK_LECTURES} 
      activeId={activeLectureId}
      onNew={handleNew}
    />
  );

  return (
    <Layout sidebar={sidebar}>
      {!markdown && !isProcessing && (
        <DropZone onFileSelect={handleFileSelect} />
      )}
      
      {isProcessing && (
        <LoadingOverlay message="Analyzing audio with Gemini 2.0..." />
      )}
      
      {markdown && !isProcessing && (
        <div className="flex flex-col h-full gap-4">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-1">Generated Mindmap</h2>
              <p className="text-text-muted text-sm">Interactive view. Scroll to zoom, drag to pan.</p>
            </div>
            <ExportButton 
              onExportDocs={() => new Promise(r => setTimeout(r, 1000))} 
              onExportMd={() => new Promise(r => setTimeout(r, 1000))} 
            />
          </div>
          <div className="flex-1 relative">
            <MindmapViewer markdown={markdown} />
          </div>
        </div>
      )}
    </Layout>
  );
}

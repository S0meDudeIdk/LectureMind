import { useState } from 'react';
import { Export, FileText, DownloadSimple, CheckCircle } from '@phosphor-icons/react';

export default function ExportButton({ onExportDocs, onExportMd }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle');

  const handleExport = async (type) => {
    setStatus('exporting');
    try {
      if (type === 'docs') await onExportDocs();
      if (type === 'md') await onExportMd();
      setStatus('done');
      setTimeout(() => {
        setStatus('idle');
        setIsOpen(false);
      }, 2000);
    } catch (e) {
      setStatus('idle');
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-alt border border-border rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
        {status === 'done' ? <CheckCircle className="text-accent" /> : <Export />}
        {status === 'done' ? 'Exported!' : 'Export'}
      </button>
      
      {isOpen && status !== 'done' && (
        <div className="absolute right-0 mt-2 w-48 bg-surface-alt border border-border rounded-lg shadow-xl overflow-hidden z-50">
          <button 
            onClick={() => handleExport('docs')}
            disabled={status === 'exporting'}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-overlay text-sm transition-colors"
          >
            <FileText size={18} className="text-primary-light" />
            <span>Save to Docs</span>
          </button>
          <div className="h-px bg-border/50 w-full"></div>
          <button 
            onClick={() => handleExport('md')}
            disabled={status === 'exporting'}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-overlay text-sm transition-colors"
          >
            <DownloadSimple size={18} className="text-text-muted" />
            <span>Download .md</span>
          </button>
        </div>
      )}
    </div>
  );
}

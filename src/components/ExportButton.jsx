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
      setTimeout(() => { setStatus('idle'); setIsOpen(false); }, 2000);
    } catch (e) {
      setStatus('idle');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
        style={{
          backgroundColor: 'var(--color-surface-overlay)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-subtle)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      >
        {status === 'done' ? (
          <CheckCircle size={14} className="text-emerald-400" />
        ) : (
          <Export size={14} style={{ color: 'var(--color-text-muted)' }} />
        )}
        {status === 'done' ? 'Exported!' : 'Export'}
      </button>

      {isOpen && status !== 'done' && (
        <div
          className="absolute right-0 mt-1.5 w-44 rounded-xl shadow-2xl overflow-hidden z-50 p-1"
          style={{
            backgroundColor: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <button
            onClick={() => handleExport('docs')}
            disabled={status === 'exporting'}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FileText size={14} style={{ color: '#818CF8' }} />
            <span>Save to Docs</span>
          </button>
          <div className="h-px my-1" style={{ backgroundColor: 'var(--color-border)' }} />
          <button
            onClick={() => handleExport('md')}
            disabled={status === 'exporting'}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--color-text)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <DownloadSimple size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span>Download .md</span>
          </button>
        </div>
      )}
    </div>
  );
}

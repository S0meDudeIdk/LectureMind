import { useState } from 'react';
import { Clock, Copy, Check, MagnifyingGlass, FileText } from '@phosphor-icons/react';

export default function TranscriptViewer({ transcript = [] }) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const chunks = Array.isArray(transcript) ? transcript : [];

  const filteredChunks = chunks.filter((chunk) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      chunk.textBlock?.toLowerCase().includes(q) ||
      chunk.startTime?.toLowerCase().includes(q)
    );
  });

  const handleCopyAll = () => {
    const fullText = chunks
      .map((c) => `[${c.startTime || '00:00'}] ${c.textBlock}`)
      .join('\n\n');
    
    if (fullText) {
      navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-alt/40 border border-border/60 rounded-xl overflow-hidden shadow-sm">
      {/* Header & Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-surface/50 gap-3">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary-light" weight="duotone" />
          <h3 className="text-sm font-semibold tracking-tight text-text">
            Verbatim Transcript ({chunks.length} chunks)
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search verbatim transcript..."
              className="bg-surface border border-border/80 rounded-lg pl-8 pr-2.5 py-1 text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-48 transition-all"
            />
          </div>

          <button
            onClick={handleCopyAll}
            disabled={chunks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 bg-surface border border-border/80 hover:bg-surface-overlay text-text text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" weight="bold" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy size={14} className="text-text-muted" />
                <span>Copy All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transcript Chunks List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-border/20">
        {filteredChunks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center text-text-muted">
            <Clock size={32} className="mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {searchQuery ? 'No matching chunks found' : 'No transcript data available'}
            </p>
            <p className="text-xs text-text-muted/70 mt-1">
              {searchQuery ? 'Try another search query' : 'Upload audio/video to generate verbatim word-for-word transcript'}
            </p>
          </div>

        ) : (
          filteredChunks.map((chunk, idx) => (
            <div 
              key={idx} 
              className="pt-3 first:pt-0 group hover:bg-surface-overlay/20 p-2.5 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-primary/10 text-primary-light border border-primary/20">
                  <Clock size={11} weight="bold" />
                  {chunk.startTime || '00:00'}
                </span>
                <span className="text-[11px] text-text-muted/60 font-mono">
                  Chunk #{idx + 1}
                </span>
              </div>
              <p className="text-sm text-text/90 leading-relaxed tracking-normal font-sans pl-0.5">
                {chunk.textBlock}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

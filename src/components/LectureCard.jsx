import { useState, useRef, useEffect } from 'react';
import { 
  FileAudio, 
  DotsThree, 
  PencilSimple, 
  Trash, 
  DownloadSimple, 
  Copy, 
  Check, 
  X 
} from '@phosphor-icons/react';

export default function LectureCard({ 
  id, 
  title, 
  date, 
  duration, 
  markdown, 
  active, 
  onClick, 
  onRename, 
  onDelete 
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title || '');
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Sync edit title if prop changes
  useEffect(() => {
    setEditTitle(title || '');
  }, [title]);

  // Focus input on edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleSaveRename = (e) => {
    e?.stopPropagation();
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== title) {
      onRename?.(id, trimmed);
    } else {
      setEditTitle(title);
    }
    setIsEditing(false);
  };

  const handleCancelRename = (e) => {
    e?.stopPropagation();
    setEditTitle(title);
    setIsEditing(false);
  };

  const handleCopyMarkdown = (e) => {
    e.stopPropagation();
    if (markdown) {
      navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setIsMenuOpen(false);
      }, 1200);
    }
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    if (markdown) {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'mindmap').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsMenuOpen(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    onDelete?.(id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!isEditing) onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isEditing) onClick?.();
      }}
      className={`group relative w-full text-left p-3 rounded-lg border transition-all cursor-pointer select-none ${
        active 
          ? 'bg-surface-overlay border-primary/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' 
          : 'bg-surface-alt border-border/50 hover:bg-surface-overlay hover:border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileAudio size={16} className={active ? 'text-primary-light shrink-0' : 'text-text-muted shrink-0'} />
          
          {isEditing ? (
            <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename(e);
                  if (e.key === 'Escape') handleCancelRename(e);
                }}
                className="w-full bg-surface border border-primary/60 rounded px-1.5 py-0.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSaveRename}
                className="p-1 hover:bg-primary/20 text-primary-light rounded transition-colors"
                title="Save"
              >
                <Check size={14} weight="bold" />
              </button>
              <button
                onClick={handleCancelRename}
                className="p-1 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded transition-colors"
                title="Cancel"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ) : (
            <h3 className={`text-sm font-medium truncate ${active ? 'text-text' : 'text-text-muted group-hover:text-text'}`}>
              {title}
            </h3>
          )}
        </div>

        {!isEditing && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text transition-colors opacity-80 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen((prev) => !prev);
              }}
              aria-label="More options"
            >
              <DotsThree size={16} weight="bold" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div 
                className="absolute right-0 top-full mt-1.5 w-48 border border-border/80 rounded-xl shadow-2xl p-1 z-50"
                style={{ backgroundColor: 'var(--color-surface, #0F172A)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    setIsEditing(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text hover:bg-surface-overlay rounded-lg transition-colors text-left cursor-pointer"
                >
                  <PencilSimple size={15} className="text-text-muted shrink-0" />
                  <span>Rename</span>
                </button>

                <button
                  onClick={handleCopyMarkdown}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text hover:bg-surface-overlay rounded-lg transition-colors text-left cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={15} className="text-emerald-400 shrink-0" weight="bold" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={15} className="text-text-muted shrink-0" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownload}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text hover:bg-surface-overlay rounded-lg transition-colors text-left cursor-pointer"
                >
                  <DownloadSimple size={15} className="text-text-muted shrink-0" />
                  <span>Download (.md)</span>
                </button>

                <div className="h-px bg-border/60 my-1 mx-1" />

                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15 rounded-lg transition-colors text-left cursor-pointer"
                >
                  <Trash size={15} className="shrink-0" />
                  <span>Delete Mindmap</span>
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[11px] text-text-muted">
        <span>{date}</span>
        <span>&middot;</span>
        <span>{duration}</span>
      </div>
    </div>
  );
}

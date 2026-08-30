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

  const activeStyle = {
    backgroundColor: 'var(--color-surface-overlay)',
    borderColor: 'rgba(99,102,241,0.45)',
  };
  const inactiveStyle = {
    backgroundColor: 'transparent',
    borderColor: 'var(--color-border)',
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
      style={active ? activeStyle : inactiveStyle}
      className="group relative w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer select-none"
      onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; } }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileAudio
            size={14}
            className="shrink-0"
            style={{ color: active ? '#818CF8' : 'var(--color-text-muted)' }}
          />
          
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
                className="w-full rounded px-1.5 py-0.5 text-xs focus:outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid rgba(99,102,241,0.6)', color: 'var(--color-text)' }}
              />
              <button onClick={handleSaveRename} className="p-1 rounded transition-colors" title="Save" style={{ color: '#818CF8' }}>
                <Check size={13} weight="bold" />
              </button>
              <button onClick={handleCancelRename} className="p-1 rounded transition-colors" title="Cancel" style={{ color: 'var(--color-text-muted)' }}>
                <X size={13} weight="bold" />
              </button>
            </div>
          ) : (
            <h3
              className="text-xs font-medium truncate"
              style={{ color: active ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
            >
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
                className="absolute right-0 top-full mt-1 w-44 rounded-xl shadow-2xl p-1 z-50"
                style={{
                  backgroundColor: 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border-subtle)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsEditing(true); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <PencilSimple size={13} style={{ color: 'var(--color-text-muted)' }} className="shrink-0" />
                  <span>Rename</span>
                </button>

                <button
                  onClick={handleCopyMarkdown}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-emerald-400 shrink-0" weight="bold" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} style={{ color: 'var(--color-text-muted)' }} className="shrink-0" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownload}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <DownloadSimple size={13} style={{ color: 'var(--color-text-muted)' }} className="shrink-0" />
                  <span>Download (.md)</span>
                </button>

                <div className="h-px my-1 mx-1" style={{ backgroundColor: 'var(--color-border)' }} />

                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-red-400 rounded-lg transition-colors text-left cursor-pointer"
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Trash size={13} className="shrink-0" />
                  <span>Delete Mindmap</span>
                </button>
              </div>
            )}

          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        <span>{date}</span>
        <span>·</span>
        <span>{duration}</span>
      </div>
    </div>
  );
}

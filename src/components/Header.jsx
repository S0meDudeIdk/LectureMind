import { Brain, UserCircle, Sun, Moon, TreeStructure, NotePencil, FileText } from '@phosphor-icons/react';
import { SidebarSimple, Export, DownloadSimple } from '@phosphor-icons/react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

/* ── Small icon button used repeatedly ── */
function IconBtn({ onClick, title, children, style }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md transition-all cursor-pointer"
      style={{ color: 'var(--color-text-muted)', background: 'none', ...style }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
        e.currentTarget.style.color = 'var(--color-text)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--color-text-muted)';
      }}
    >
      {children}
    </button>
  );
}

export default function Header({
  activeTab, setActiveTab, hasContent,
  sidebarOpen, onToggleSidebar,
  onExportMd, onExportDocs,
}) {
  const { theme, toggle } = useTheme();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const NAV_TABS = [
    { id: 'mindmap', label: 'Mindmap',     icon: TreeStructure },
    { id: 'editor',  label: 'Note Editor', icon: NotePencil    },
  ];

  return (
    <header
      className="flex items-center justify-between h-12 px-3 sticky top-0 z-40 shrink-0"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* ── Left: Sidebar toggle + Logo + Nav tabs ── */}
      <div className="flex items-center gap-1 h-full">

        {/* Sidebar collapse toggle — always visible, matches Claude/Gemini pattern */}
        <IconBtn
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <SidebarSimple
            size={16}
            weight="regular"
            style={{
              transform: sidebarOpen ? 'none' : 'scaleX(-1)',
              transition: 'transform 0.2s ease',
            }}
          />
        </IconBtn>

        {/* Divider */}
        <div
          className="w-px h-4 mx-1.5"
          style={{ backgroundColor: 'var(--color-border)' }}
        />

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 mr-4">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
          >
            <Brain weight="fill" size={13} className="text-white" />
          </div>
          <span
            className="text-sm font-bold tracking-tight leading-none"
            style={{ color: 'var(--color-text)' }}
          >
            LectureMind
          </span>
        </div>

        {/* Nav tabs — only when content is loaded */}
        {hasContent && (
          <nav className="flex items-center h-full gap-0.5">
            {NAV_TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab?.(id)}
                  className="relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors cursor-pointer"
                  style={{
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  <Icon size={14} weight={isActive ? 'bold' : 'regular'} />
                  <span>{label}</span>

                  {/* Active underline */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                      style={{ backgroundColor: '#6366F1' }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* ── Right: Export + Ready status + theme + avatar ── */}
      <div className="flex items-center gap-2">

        {/* Export dropdown — only shown when content exists */}
        {hasContent && (
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
              style={{
                backgroundColor: exportOpen ? 'var(--color-surface-overlay)' : 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-subtle)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              <Export size={13} style={{ color: 'var(--color-text-muted)' }} />
              Export
            </button>

            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl p-1 z-50"
                style={{
                  backgroundColor: 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border-subtle)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                }}
              >
                <button
                  onClick={() => { onExportDocs?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileText size={13} style={{ color: '#818CF8' }} />
                  Export to Google Docs
                </button>
                <button
                  onClick={() => { onExportMd?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <DownloadSimple size={13} style={{ color: 'var(--color-text-muted)' }} />
                  Download .md
                </button>
              </div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <IconBtn onClick={toggle} title="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconBtn>

        {/* User avatar */}
        <IconBtn title="Account">
          <UserCircle size={20} />
        </IconBtn>
      </div>
    </header>
  );
}

import { 
  Brain, UserCircle, Sun, Moon, TreeStructure, NotePencil, 
  FileText, FilePdf, Image as ImageIcon, 
  SidebarSimple, Export, FileDoc, SignOut, GoogleLogo, CheckCircle, Copy, Check
} from '@phosphor-icons/react';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../services/auth';

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
  onExportMindmapJpg, onExportMindmapPdf,
}) {
  const { theme, toggle } = useTheme();
  const { user, signInWithGoogle, signOut, isConfigured } = useAuth();
  
  const [exportOpen, setExportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  const exportRef = useRef(null);
  const accountRef = useRef(null);

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

  // Close account dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };
    if (accountOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accountOpen]);

  const [domainCopied, setDomainCopied] = useState(false);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      setAccountOpen(false);
    } catch (err) {
      console.error('Sign in failed:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setAuthError({
          type: 'unauthorized-domain',
          domain: window.location.hostname,
        });
      } else if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed')) {
        // User voluntarily closed the popup, no error needed
        setAuthError(null);
      } else {
        setAuthError({
          type: 'generic',
          message: msg || 'Sign in failed. Please check your Firebase settings.',
        });
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setAccountOpen(false);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

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

        {/* Sidebar collapse toggle */}
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

      {/* ── Right: Export + theme + avatar ── */}
      <div className="flex items-center gap-2">

        {/* Export dropdown — only shown when content exists */}
        {hasContent && (
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              style={{
                backgroundColor: exportOpen ? 'var(--color-surface-overlay)' : 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
              onMouseLeave={e => {
                if (!exportOpen) e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
              }}
              title="Export mindmap or notes"
            >
              <Export size={13} weight="bold" />
              <span>Export</span>
            </button>

            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-60 rounded-xl shadow-xl border p-1.5 z-50 flex flex-col gap-0.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {/* ── Section 1: Note Editor ── */}
                <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase text-text-muted flex items-center gap-1.5">
                  <NotePencil size={12} className="text-primary-light" />
                  <span>Note Editor</span>
                </div>
                <button
                  onClick={() => { onExportMd?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileText size={14} className="text-primary-light" />
                  <span>Export Markdown (.md)</span>
                </button>
                <button
                  onClick={() => { onExportDocs?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileDoc size={14} className="text-blue-500" />
                  <span>Export to Google Docs</span>
                </button>

                {/* Divider */}
                <div className="h-px my-1 mx-1.5 bg-black/10 dark:bg-white/10" />

                {/* ── Section 2: Mindmap ── */}
                <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase text-text-muted flex items-center gap-1.5">
                  <TreeStructure size={12} className="text-indigo-400" />
                  <span>Mindmap</span>
                </div>
                <button
                  onClick={() => { onExportMindmapJpg?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <ImageIcon size={14} className="text-emerald-500" />
                  <span>Download as Image (.jpg)</span>
                </button>
                <button
                  onClick={() => { onExportMindmapPdf?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left cursor-pointer"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FilePdf size={14} className="text-rose-500" />
                  <span>Download as PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <IconBtn onClick={toggle} title="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconBtn>

        {/* User Account / Avatar Dropdown */}
        <div className="relative" ref={accountRef}>
          <button
            onClick={() => setAccountOpen(v => !v)}
            title={user ? `${user.displayName || user.email} (Account)` : 'Sign in with Google'}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-105 cursor-pointer overflow-hidden border border-border/80"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <UserCircle
                size={20}
                weight={user ? 'fill' : 'regular'}
                className={user ? 'text-primary' : 'text-text-muted'}
              />
            )}
          </button>

          {/* Account Popover */}
          {accountOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-72 rounded-2xl shadow-2xl border p-4 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
            >
              {user ? (
                /* Logged In State */
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <h4 className="font-bold text-sm text-text truncate">
                        {user.displayName || 'Google User'}
                      </h4>
                      <p className="text-[11px] text-text-muted truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2 text-[11px]">
                    <CheckCircle size={15} weight="fill" className="shrink-0" />
                    <span>Google Drive Synced & Ready</span>
                  </div>

                  <div className="h-px bg-border/60 my-0.5" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-surface-alt hover:bg-rose-500/15 hover:text-rose-400 border border-border/80 text-text font-medium transition-colors cursor-pointer"
                  >
                    <SignOut size={15} weight="bold" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                /* Logged Out State */
                <div className="flex flex-col gap-3 text-center">
                  <div className="mx-auto w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
                    <GoogleLogo size={22} weight="bold" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-text">Sign in with Google</h4>
                    <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                      Connect your Google Account to export notes directly to your Google Drive in 1 click.
                    </p>
                  </div>

                  {authError && (
                    <div className="text-left p-2.5 text-[11px] rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 space-y-2">
                      {authError.type === 'unauthorized-domain' ? (
                        <>
                          <div className="font-semibold text-rose-300">
                            Domain not authorized in Firebase
                          </div>
                          <p className="text-[10px] text-text-muted leading-relaxed">
                            Add this domain to <strong>Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</strong>:
                          </p>
                          <div className="flex items-center gap-1 bg-surface-alt/80 p-1.5 rounded-lg border border-border/60">
                            <span className="font-mono text-[10px] text-text truncate select-all flex-1">
                              {authError.domain}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(authError.domain);
                                setDomainCopied(true);
                                setTimeout(() => setDomainCopied(false), 2000);
                              }}
                              className="p-1 rounded bg-surface hover:bg-surface-overlay text-text border border-border/50 shrink-0 cursor-pointer"
                              title="Copy domain"
                            >
                              {domainCopied ? (
                                <Check size={13} className="text-emerald-400" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div>{authError.message}</div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleSignIn}
                    disabled={authLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    <GoogleLogo size={16} weight="bold" />
                    <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

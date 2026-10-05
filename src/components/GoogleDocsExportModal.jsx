import { useState, useEffect, useRef } from 'react';
import {
  X,
  GoogleLogo,
  ClipboardText,
  CloudArrowUp,
  CheckCircle,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { exportToDocsViaClipboard, exportToGoogleDriveDirect } from '../utils/exportUtils';
import { useAuth, getStoredDriveToken } from '../services/auth';

export default function GoogleDocsExportModal({ isOpen, onClose, content, title = 'Lecture Notes' }) {
  const { user: authUser, signInWithGoogle, authorizeDrive, driveToken } = useAuth();
  const user = authUser && !authUser.isAnonymous ? authUser : null;
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [createdUrl, setCreatedUrl] = useState(null);

  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    setSuccessMsg(null);
    setCreatedUrl(null);
    setErrorMsg(null);
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector('button')?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') || []);
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first) { event.preventDefault(); dialog?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstantExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    try {
      await exportToDocsViaClipboard(content, title);
      setCreatedUrl('https://docs.new');
      setSuccessMsg('Formatted notes copied. Open a Google Doc and paste (Ctrl+V). Equations remain readable LaTeX text.');
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to copy to clipboard: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDriveDirectExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (!user) {
        await signInWithGoogle();
        setSuccessMsg('Signed in. Choose Authorize Google Drive & Export to grant document access.');
        return;
      }
      let token = driveToken || getStoredDriveToken();
      if (!user || !token) {
        const authorization = await authorizeDrive();
        token = authorization?.token || getStoredDriveToken();
      }

      if (!token) {
        throw new Error('Google sign-in did not return a Drive access token. Please try again.');
      }

      const document = await exportToGoogleDriveDirect(content, title, token);
      setCreatedUrl(document.url);
      setSuccessMsg('Document successfully created on your Google Drive!');

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Google Drive export failed. You can use 1-Click Instant Export below.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-docs-export-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-border shadow-2xl p-6 relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close Google Docs export"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-colors cursor-pointer"
        >
          <X size={18} weight="bold" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
            <GoogleLogo size={22} weight="bold" />
          </div>
          <div>
            <h3 id="google-docs-export-title" className="font-bold text-base text-text">Export to Google Docs</h3>
            <p className="text-xs text-text-muted">Direct exports include equation images. Clipboard exports preserve LaTeX text.</p>
          </div>
        </div>

        {/* Success / Error alerts */}
        {successMsg && (
          <div role="status" className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">
            {errorMsg}
          </div>
        )}

        {createdUrl && <a href={createdUrl} target="_blank" rel="noreferrer" className="block mb-4 text-sm underline text-primary-light">Open Google document</a>}
        {/* Options */}
        <div className="space-y-3 mb-5">
          {/* Method 1: Direct Google Drive Cloud Sync */}
          <div className="p-4 rounded-xl border border-border/80 bg-surface-alt/70 hover:border-primary/50 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CloudArrowUp size={20} weight="duotone" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-text">Export Directly to Google Drive</span>
                    {user && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    {user
                      ? `Uploads directly as a native document to ${user.displayName || user.email}'s Drive.`
                      : 'Sign in with your Google account to automatically create native documents in Drive.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex justify-end">
              <button
                onClick={handleDriveDirectExport}
                disabled={isExporting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <GoogleLogo size={15} weight="bold" />
                <span>{!user ? 'Sign in with Google' : driveToken ? 'Upload to My Drive' : 'Authorize Google Drive & Export'}</span>
              </button>
            </div>
          </div>

          {/* Method 2: Instant 1-Click Export (Clipboard + docs.new) */}
          <button
            onClick={handleInstantExport}
            disabled={isExporting}
            className="w-full text-left p-4 rounded-xl border border-border/80 bg-surface-alt/50 hover:bg-surface-alt hover:border-primary/50 transition-all flex items-start gap-3.5 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary-light flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <ClipboardText size={20} weight="duotone" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-text">Instant 1-Click Clipboard Export</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-surface text-text-muted border border-border">
                  No Login Required
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Copies formatted notes with readable LaTeX equations to clipboard and opens <code className="text-primary-light font-mono">docs.new</code>. Just press <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border text-[11px] font-mono">Ctrl+V</kbd> to paste!
              </p>
            </div>
            <ArrowSquareOut size={18} className="text-text-muted group-hover:text-primary transition-colors shrink-0 mt-1" />
          </button>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60 text-[11px] text-text-muted">
          <span>Target Document: <strong className="text-text">{title}</strong></span>
          <button
            onClick={onClose}
            className="hover:underline text-text-muted cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

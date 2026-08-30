import { useState } from 'react';
import {
  X,
  GoogleLogo,
  ClipboardText,
  CloudArrowUp,
  CheckCircle,
  ArrowSquareOut,
  UserCircle,
} from '@phosphor-icons/react';
import { exportToDocsViaClipboard, exportToGoogleDriveDirect } from '../utils/exportUtils';
import { useAuth } from '../services/auth';

export default function GoogleDocsExportModal({ isOpen, onClose, content, title = 'Lecture Notes' }) {
  const { user, signInWithGoogle } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  const handleInstantExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    try {
      await exportToDocsViaClipboard(content, title);
      setSuccessMsg('Formatted notes copied to clipboard! Paste (Ctrl+V) in your new Google Doc tab.');
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
    try {
      if (!user) {
        await signInWithGoogle();
      }
      await exportToGoogleDriveDirect(content, title);
      setSuccessMsg('Document successfully created on your Google Drive!');
      setTimeout(() => {
        onClose();
      }, 1800);
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
        className="w-full max-w-lg rounded-2xl border border-border shadow-2xl p-6 relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
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
            <h3 className="font-bold text-base text-text">Export to Google Docs</h3>
            <p className="text-xs text-text-muted">Transfer your lecture notes, equations, and tables seamlessly</p>
          </div>
        </div>

        {/* Success / Error alerts */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">
            {errorMsg}
          </div>
        )}

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
                <span>{user ? 'Upload to My Drive' : 'Sign in with Google & Export'}</span>
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
                Copies rich-formatted HTML to clipboard and opens <code className="text-primary-light font-mono">docs.new</code>. Just press <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border text-[11px] font-mono">Ctrl+V</kbd> to paste!
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

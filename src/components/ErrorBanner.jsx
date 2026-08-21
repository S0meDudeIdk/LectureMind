import { WarningCircle, X } from '@phosphor-icons/react';

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="mb-6 w-full max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3 text-red-500 animate-in fade-in slide-in-from-top-4">
      <WarningCircle size={24} className="shrink-0 mt-0.5" weight="fill" />
      <div className="flex-1">
        <h4 className="font-semibold text-sm">Processing Failed</h4>
        <p className="text-sm mt-1 opacity-90">{message}</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="opacity-70 hover:opacity-100 transition-opacity">
          <X size={20} />
        </button>
      )}
    </div>
  );
}

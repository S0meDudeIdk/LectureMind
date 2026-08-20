import { Brain } from '@phosphor-icons/react';

export default function LoadingOverlay({ message = "Processing audio..." }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm rounded-xl">
      <div className="relative w-16 h-16 flex items-center justify-center mb-4">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        <Brain weight="fill" size={24} className="text-primary animate-pulse" />
      </div>
      <p className="text-sm font-medium text-text-muted animate-pulse">{message}</p>
    </div>
  );
}

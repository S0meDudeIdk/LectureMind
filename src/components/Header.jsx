import { Brain, UserCircle } from '@phosphor-icons/react';

export default function Header() {
  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
          <Brain weight="fill" size={20} />
        </div>
        <h1 className="text-xl font-bold tracking-tight">LectureMind</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-surface-alt text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          Ready
        </div>
        <button className="text-text-muted hover:text-text transition-colors">
          <UserCircle size={24} />
        </button>
      </div>
    </header>
  );
}

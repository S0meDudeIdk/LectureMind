import { Brain, UserCircle, Sun, Moon } from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';

export default function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
          <Brain weight="fill" size={20} />
        </div>
        <h1 className="text-xl font-bold tracking-tight">LectureMind</h1>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-surface-alt text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          Ready
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-overlay transition-all"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button className="text-text-muted hover:text-text transition-colors">
          <UserCircle size={24} />
        </button>
      </div>
    </header>
  );
}

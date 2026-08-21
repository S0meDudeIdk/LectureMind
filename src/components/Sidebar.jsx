import { Plus, MagnifyingGlass } from '@phosphor-icons/react';
import LectureCard from './LectureCard';

export default function Sidebar({ lectures, activeId, onNew, onSelectLecture }) {
  return (
    <aside className="w-64 border-r border-border bg-surface-alt/30 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-border/50 space-y-4">
        <button 
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
        >
          <Plus weight="bold" />
          New Mindmap
        </button>
        
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input 
            type="text" 
            placeholder="Search lectures..." 
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-text placeholder:text-text-muted/50"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-1">
          Recent
        </div>
        {lectures.length === 0 ? (
          <p className="text-xs text-text-muted/70 text-center py-4">No recent lectures</p>
        ) : (
          lectures.map((lec) => (
            <LectureCard 
              key={lec.id} 
              {...lec} 
              active={lec.id === activeId} 
              onClick={() => onSelectLecture?.(lec)}
            />
          ))
        )}
      </div>
    </aside>
  );
}


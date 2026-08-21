import { useState, useEffect } from 'react';
import { Plus, MagnifyingGlass, SpinnerGap } from '@phosphor-icons/react';
import LectureCard from './LectureCard';
import { 
  subscribeToRecentMindmaps, 
  getRecentMindmaps, 
  updateMindmap, 
  deleteMindmap 
} from '../services/db';

export default function Sidebar({ 
  lectures: fallbackLectures = [], 
  activeId, 
  onNew, 
  onSelectLecture,
  onRenameLecture,
  onDeleteLecture
}) {
  const [firestoreLectures, setFirestoreLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Subscribe to real-time mindmap updates (LocalStorage + Firestore dual-sync)
  useEffect(() => {
    let unsubscribe = () => {};
    
    try {
      unsubscribe = subscribeToRecentMindmaps((items) => {
        setFirestoreLectures(items);
        setLoading(false);
      });
    } catch (err) {
      console.warn('Real-time listener unavailable, fetching once:', err);
      getRecentMindmaps().then((items) => {
        setFirestoreLectures(items);
        setLoading(false);
      });
    }

    return () => unsubscribe();
  }, []);

  // Use active mindmap list directly from persistent storage
  const allLectures = firestoreLectures;


  // Filter lectures based on search query
  const filteredLectures = allLectures.filter((lec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      lec.title?.toLowerCase().includes(q) ||
      lec.markdown?.toLowerCase().includes(q)
    );
  });

  const handleRename = async (id, newTitle) => {
    await updateMindmap(id, { title: newTitle });
    onRenameLecture?.(id, newTitle);
  };

  const handleDelete = async (id) => {
    await deleteMindmap(id);
    onDeleteLecture?.(id);
    if (id === activeId) {
      onNew?.();
    }
  };

  return (
    <aside className="w-64 border-r border-border bg-surface-alt/30 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-border/50 space-y-4">
        <button 
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus weight="bold" />
          New Mindmap
        </button>
        
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mindmaps..." 
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-text placeholder:text-text-muted/50"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-1">
          <span>Recent Mindmaps</span>
          {loading && <SpinnerGap className="animate-spin text-text-muted" size={12} />}
        </div>

        {filteredLectures.length === 0 ? (
          <div className="text-center py-6 px-2">
            <p className="text-xs text-text-muted/70">
              {searchQuery ? 'No matching mindmaps' : 'No mindmaps saved yet'}
            </p>
          </div>
        ) : (
          filteredLectures.map((lec) => (
            <LectureCard 
              key={lec.id} 
              id={lec.id}
              title={lec.title}
              date={lec.date}
              duration={lec.duration}
              markdown={lec.markdown}
              active={lec.id === activeId} 
              onClick={() => onSelectLecture?.(lec)}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </aside>
  );
}

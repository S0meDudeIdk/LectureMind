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

  const allLectures = firestoreLectures;

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
    if (id === activeId) onNew?.();
  };

  return (
    <aside
      className="w-60 flex flex-col h-full shrink-0"
      style={{
        backgroundColor: 'var(--color-surface-alt)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Header area */}
      <div className="p-3 space-y-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {/* New Mindmap button */}
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg transition-all cursor-pointer text-white"
          style={{ backgroundColor: '#6366F1' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#818CF8'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#6366F1'}
        >
          <Plus weight="bold" size={14} />
          New Mindmap
        </button>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlass
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            size={13}
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mindmaps..."
            className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none transition-all"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        <div
          className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>Recent Mindmaps</span>
          {loading && <SpinnerGap className="animate-spin" size={11} />}
        </div>

        {filteredLectures.length === 0 ? (
          <div className="text-center py-8 px-2">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
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

import { useState, useEffect, useRef } from 'react';
import { Plus, MagnifyingGlass, SpinnerGap } from '@phosphor-icons/react';
import LectureCard from './LectureCard';
import { subscribeToRecentMindmaps, updateMindmap, deleteMindmap, resolveMindmapConflict, flushPendingSync } from '../services/db';
import { useAuth } from '../services/auth';

export default function Sidebar({ activeId, onNew, onSelectLecture, onRenameLecture, onDeleteLecture, onRecordsChanged }) {
  const { user, loading: authLoading } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const callback = useRef(onRecordsChanged);
  useEffect(() => { callback.current = onRecordsChanged; }, [onRecordsChanged]);
  useEffect(() => {
    setLectures([]); setError(null); setLoading(true);
    if (authLoading) return;
    return subscribeToRecentMindmaps((items, status) => {
      setLectures(items); setLoading(false); callback.current?.(items);
      if (status?.error) setError(status.error.message || String(status.error));
    }, 100, user);
  }, [authLoading, user?.uid, user?.isAnonymous]);
  const act = async action => {
    setBusy(true); setError(null);
    try { return await action(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const rename = (id, title) => act(async () => { await updateMindmap(id, { title }, user); onRenameLecture?.(id, title); });
  const remove = id => act(async () => { await deleteMindmap(id, user); onDeleteLecture?.(id); });
  const filtered = lectures.filter(l => `${l.title}\n${l.markdown}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className="w-60 flex flex-col h-full shrink-0" style={{ backgroundColor: 'var(--color-surface-alt)', borderRight: '1px solid var(--color-border)' }}>
    <div className="p-3 space-y-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button onClick={onNew} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg cursor-pointer text-white" style={{ backgroundColor: '#6366F1' }}><Plus size={14} />New Mindmap</button>
      <div className="relative"><MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2" size={13} />
        <input aria-label="Search mindmaps" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mindmaps..." className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
      </div>
      {error && <div role="alert" className="text-xs text-red-400"><p>{error}</p><button disabled={busy} onClick={() => act(() => flushPendingSync(user))}>Retry sync</button></div>}
    </div>
    <div className="flex-1 overflow-y-auto px-2.5 pt-1.5 pb-2.5 space-y-1">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"><span>Recent Mindmaps</span>{loading && <SpinnerGap className="animate-spin" size={11} />}</div>
      {!loading && filtered.length === 0 && <p className="text-xs p-3">{search ? 'No matching mindmaps' : 'No mindmaps saved yet'}</p>}
      {filtered.map(lecture => <div key={lecture.id}>
        <LectureCard id={lecture.id} title={lecture.title} date={lecture.date} duration={lecture.duration} markdown={lecture.markdown} active={lecture.id === activeId}
          onClick={() => onSelectLecture?.(lecture)} onRename={rename} onDelete={remove} />
        {['pending', 'error'].includes(lecture.syncStatus) && <p className="text-[10px] px-2" role="status">{lecture.syncStatus === 'error' ? 'Sync failed — saved on this device' : 'Saved on this device · sync pending'}</p>}
        {lecture.syncStatus === 'conflict' && <div className="p-2 text-xs border border-amber-500 rounded" role="alert"><p>Another device changed this lecture. Both versions are preserved.</p>
          {['local', 'remote', 'copy'].map(choice => <button key={choice} disabled={busy} className="block underline" onClick={() => act(() => resolveMindmapConflict(lecture.id, choice, user))}>{choice === 'local' ? 'Keep this version' : choice === 'remote' ? 'Use cloud version' : 'Keep both as separate lectures'}</button>)}
        </div>}
      </div>)}
    </div>
  </aside>;
}

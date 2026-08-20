import { FileAudio, DotsThree } from '@phosphor-icons/react';

export default function LectureCard({ title, date, duration, active }) {
  return (
    <button 
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        active 
          ? 'bg-surface-overlay border-primary/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' 
          : 'bg-surface-alt border-border/50 hover:bg-surface-overlay hover:border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileAudio size={16} className={active ? 'text-primary-light' : 'text-text-muted'} />
          <h3 className={`text-sm font-medium line-clamp-1 ${active ? 'text-text' : 'text-text-muted'}`}>
            {title}
          </h3>
        </div>
        <button className="text-text-muted hover:text-text shrink-0">
          <DotsThree size={16} weight="bold" />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px] text-text-muted">
        <span>{date}</span>
        <span>&middot;</span>
        <span>{duration}</span>
      </div>
    </button>
  );
}

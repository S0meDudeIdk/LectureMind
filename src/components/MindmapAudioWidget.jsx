import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSimpleSlash,
  ArrowCounterClockwise,
  ArrowClockwise,
  CaretDown,
  CaretUp,
  FileText,
  MagnifyingGlass,
  Copy,
  Check,
  CheckFat,
  X,
  VideoCamera,
  MusicNotes,
  ArrowsOutSimple,
  Minus
} from '@phosphor-icons/react';

/* Helper: parse "MM:SS" or "HH:MM:SS" or "H:MM:SS" to seconds */
function parseTimestampToSeconds(ts) {
  if (!ts || typeof ts !== 'string') return 0;
  const parts = ts.trim().split(':').map(Number);
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  return 0;
}

/* Helper: format seconds to "H:MM:SS" (if >= 1 hr) or "MM:SS" */
function formatSeconds(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const totalSec = Math.floor(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export default function MindmapAudioWidget({
  audioUrl,
  transcript = [],
  isVideo = false
}) {
  const mediaRef = useRef(null);
  const synthTimerRef = useRef(null);
  const speedMenuRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Transcript card state (collapsed by default)
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const chunks = useMemo(() => (Array.isArray(transcript) ? transcript : []), [transcript]);

  // Calculate approximate duration from transcript chunks if no audio file metadata is loaded yet
  const estimatedDuration = useMemo(() => {
    if (chunks.length === 0) return 180; // 3 min default
    const lastChunk = chunks[chunks.length - 1];
    const lastSec = parseTimestampToSeconds(lastChunk?.startTime);
    return Math.max(lastSec + 35, 60);
  }, [chunks]);

  const effectiveDuration = duration > 0 ? duration : estimatedDuration;

  // Close speed dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setIsSpeedMenuOpen(false);
      }
    };
    if (isSpeedMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSpeedMenuOpen]);

  // Handle actual audio/video element loading
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const onLoadedMetadata = () => {
      if (media.duration && !isNaN(media.duration) && media.duration !== Infinity) {
        setDuration(media.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(media.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    media.addEventListener('loadedmetadata', onLoadedMetadata);
    media.addEventListener('timeupdate', onTimeUpdate);
    media.addEventListener('ended', onEnded);

    return () => {
      media.removeEventListener('loadedmetadata', onLoadedMetadata);
      media.removeEventListener('timeupdate', onTimeUpdate);
      media.removeEventListener('ended', onEnded);
    };
  }, [audioUrl, isVideo]);

  // Fallback synthetic playback loop if no real audioUrl stream is active
  useEffect(() => {
    if (!audioUrl && isPlaying) {
      synthTimerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= effectiveDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1 * playbackRate;
        });
      }, 1000);
    } else {
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
    }

    return () => {
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
    };
  }, [audioUrl, isPlaying, effectiveDuration, playbackRate]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (audioUrl && mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
        setIsPlaying(false);
      } else {
        mediaRef.current.play().then(() => setIsPlaying(true)).catch(() => {
          setIsPlaying(true);
        });
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  // Skip time forward/back
  const handleSeekOffset = (deltaSeconds) => {
    const newTime = Math.max(0, Math.min(currentTime + deltaSeconds, effectiveDuration));
    seekTo(newTime);
  };

  const seekTo = (seconds) => {
    setCurrentTime(seconds);
    if (audioUrl && mediaRef.current) {
      mediaRef.current.currentTime = seconds;
    }
  };

  const handleSliderChange = (e) => {
    const newTime = parseFloat(e.target.value);
    seekTo(newTime);
  };

  // Speed selection from list
  const handleSelectSpeed = (speed) => {
    setPlaybackRate(speed);
    setIsSpeedMenuOpen(false);
    if (mediaRef.current) {
      mediaRef.current.playbackRate = speed;
    }
  };

  // Volume slider change
  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (newVol === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
    if (mediaRef.current) {
      mediaRef.current.volume = newVol;
      mediaRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    if (mediaRef.current) {
      mediaRef.current.muted = newMute;
    }
  };

  const handleCopyTranscript = () => {
    const fullText = chunks
      .map((c) => `[${c.startTime || '00:00'}] ${c.textBlock}`)
      .join('\n\n');
    if (fullText) {
      navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Filter chunks for search
  const filteredChunks = chunks.filter((c) => {
    if (!transcriptSearch.trim()) return true;
    const q = transcriptSearch.toLowerCase();
    return c.textBlock?.toLowerCase().includes(q) || c.startTime?.toLowerCase().includes(q);
  });

  // Calculate active chunk index based on currentTime
  const activeChunkIndex = useMemo(() => {
    if (chunks.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < chunks.length; i++) {
      const sec = parseTimestampToSeconds(chunks[i].startTime);
      if (currentTime >= sec) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [chunks, currentTime]);

  const progressPercent = Math.min(100, (currentTime / (effectiveDuration || 1)) * 100);
  const volumePercent = isMuted ? 0 : volume * 100;

  if (isMinimized) {
    return (
      <aside
        aria-label="Lecture Media Player & Transcript (Minimized)"
        className="absolute top-4 right-4 z-20 pointer-events-auto select-none"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-surface-alt)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
          title="Open Media Player & Transcript"
        >
          {isVideo ? (
            <VideoCamera size={15} style={{ color: '#818CF8' }} weight="bold" />
          ) : (
            <MusicNotes size={15} style={{ color: '#818CF8' }} weight="bold" />
          )}
          <span>{isVideo ? 'Lecture Video & Transcript' : 'Lecture Audio & Transcript'}</span>
          {isPlaying && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
          <ArrowsOutSimple size={13} style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Lecture Media Player & Transcript"
      className={`absolute top-4 right-4 z-20 w-[350px] max-w-[calc(100vw-2.5rem)] rounded-xl border shadow-2xl backdrop-blur-md flex flex-col pointer-events-auto select-none transition-all duration-200 ${
        isTranscriptExpanded ? 'bottom-4' : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface-alt)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* ── SECTION 1: STREAMLINED MEDIA PLAYER ── */}
      <div className="relative z-30 p-3 flex flex-col gap-2.5 shrink-0">
        {/* Card Header with Title and Minimize Button */}
        <div className="flex items-center justify-between pb-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
            {isVideo ? (
              <VideoCamera size={14} style={{ color: '#818CF8' }} weight="bold" />
            ) : (
              <MusicNotes size={14} style={{ color: '#818CF8' }} weight="bold" />
            )}
            <span>{isVideo ? 'Lecture Video' : 'Lecture Audio'}</span>
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            title="Minimize media player & transcript"
            className="w-6 h-6 flex items-center justify-center rounded-md transition-all cursor-pointer"
            style={{ color: 'var(--color-text-muted)', background: 'none' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            <Minus size={14} weight="bold" />
          </button>
        </div>

        {/* Optional Video Screen (Shown only when file has video) */}
        {isVideo && audioUrl ? (
          <div className="w-full rounded-lg overflow-hidden bg-black/60 aspect-video relative border border-border/40 shrink-0">
            <video
              ref={mediaRef}
              src={audioUrl}
              playsInline
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
            />
          </div>
        ) : (
          /* Hidden audio element if audio-only */
          audioUrl && (
            <audio
              ref={mediaRef}
              src={audioUrl}
              preload="metadata"
              className="hidden"
            />
          )
        )}

        {/* Progress Bar & Slider */}
        <div className="flex flex-col gap-1">
          <div className="relative flex items-center group cursor-pointer py-0.5">
            <input
              type="range"
              min="0"
              max={effectiveDuration || 100}
              step="0.5"
              value={currentTime}
              onChange={handleSliderChange}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all"
              style={{
                background: `linear-gradient(to right, #6366F1 ${progressPercent}%, var(--color-surface-overlay) ${progressPercent}%)`,
                accentColor: '#6366F1',
              }}
            />
          </div>

          <div
            className="flex items-center justify-between text-xs font-mono font-medium px-0.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>{formatSeconds(currentTime)}</span>
            <span>{formatSeconds(effectiveDuration)}</span>
          </div>
        </div>

        {/* Main Controls Row: True Centered Layout */}
        <div className="relative flex items-center justify-between pt-0.5">
          {/* Left: Volume control with slider */}
          <div className="flex items-center gap-1.5 z-10">
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer shrink-0"
              style={{ color: isMuted ? '#EF4444' : 'var(--color-text)', background: 'none' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isMuted || volume === 0 ? (
                <SpeakerSimpleSlash size={15} />
              ) : volume < 0.5 ? (
                <SpeakerLow size={15} />
              ) : (
                <SpeakerHigh size={15} />
              )}
            </button>

            {/* Volume slider */}
            <div className="w-14 flex items-center py-1">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-1 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all"
                style={{
                  background: `linear-gradient(to right, #818CF8 ${volumePercent}%, var(--color-surface-overlay) ${volumePercent}%)`,
                  accentColor: '#818CF8',
                }}
                title={`Volume: ${Math.round(volumePercent)}%`}
              />
            </div>
          </div>

          {/* Center Transport Controls: Perfectly centered horizontally */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              {/* -10s */}
              <button
                onClick={() => handleSeekOffset(-10)}
                title="Rewind 10 seconds"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer"
                style={{ color: 'var(--color-text)', background: 'none' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <ArrowCounterClockwise size={15} weight="bold" />
              </button>

              {/* Play / Pause button */}
              <button
                onClick={togglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
                className="w-8 h-8 flex items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                style={{ backgroundColor: '#6366F1' }}
              >
                {isPlaying ? (
                  <Pause size={15} weight="bold" />
                ) : (
                  <Play size={15} weight="fill" />
                )}
              </button>

              {/* +10s */}
              <button
                onClick={() => handleSeekOffset(10)}
                title="Forward 10 seconds"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer"
                style={{ color: 'var(--color-text)', background: 'none' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <ArrowClockwise size={15} weight="bold" />
              </button>
            </div>
          </div>

          {/* Right: Speed Dropdown Button & Below-Menu */}
          <div className="relative z-20" ref={speedMenuRef}>
            <button
              onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
              title="Select Playback Speed"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border"
              style={{
                backgroundColor: isSpeedMenuOpen ? 'var(--color-surface-overlay)' : 'var(--color-surface)',
                borderColor: isSpeedMenuOpen ? '#6366F1' : 'var(--color-border)',
                color: playbackRate !== 1.0 ? '#818CF8' : 'var(--color-text)',
              }}
            >
              <span>{playbackRate === 1.0 ? '1x' : `${playbackRate}x`}</span>
              <CaretDown size={10} weight="bold" />
            </button>

            {/* Speed List Menu */}
            {isSpeedMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-36 rounded-xl border p-1 z-50"
                style={{
                  backgroundColor: 'var(--color-surface-alt)',
                  borderColor: 'var(--color-border-subtle)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex flex-col gap-0.5 max-h-[156px] overflow-y-auto scrollbar-thin">
                  {SPEED_OPTIONS.map((spd) => {
                    const isSelected = playbackRate === spd;
                    const label = spd === 1.0 ? '1.0x (Normal)' : `${spd}x`;
                    return (
                      <button
                        key={spd}
                        onClick={() => handleSelectSpeed(spd)}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors text-left cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.22)' : 'transparent',
                          color: isSelected ? '#818CF8' : 'var(--color-text)',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span>{label}</span>
                        {isSelected && <CheckFat size={11} weight="fill" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: SEPARATOR & COLLAPSIBLE TRANSCRIPT ── */}
      <div
        className={`relative z-10 flex flex-col transition-all duration-200 ${
          isTranscriptExpanded ? 'flex-1 min-h-0' : 'shrink-0'
        }`}
        style={{
          borderTop: '1px solid var(--color-border)',
        }}
      >
        {/* Collapsible Header */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsTranscriptExpanded((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsTranscriptExpanded((prev) => !prev);
            }
          }}
          className="w-full flex items-center justify-between p-3 cursor-pointer transition-colors text-left select-none shrink-0"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} style={{ color: '#818CF8' }} weight="duotone" />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Transcript
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-mono font-medium"
              style={{
                backgroundColor: 'var(--color-surface-overlay)',
                color: 'var(--color-text-muted)',
              }}
            >
              {chunks.length} chunks
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {isTranscriptExpanded ? 'Collapse' : 'Expand'}
            </span>
            <div
              className="w-5 h-5 flex items-center justify-center rounded transition-transform duration-200"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {isTranscriptExpanded ? <CaretUp size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
            </div>
          </div>
        </div>

        {/* Expanded Transcript Content — Fills remaining height all the way down */}
        {isTranscriptExpanded && (
          <div
            className="flex-1 min-h-0 flex flex-col transition-all"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            {/* Search and Action Toolbar */}
            <div
              className="flex items-center justify-between gap-2 p-2.5 border-b shrink-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Filter keywords or timestamps..."
                  className="w-full pl-7 pr-6 py-1 text-xs rounded-lg focus:outline-none transition-all"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                {transcriptSearch && (
                  <button
                    onClick={() => setTranscriptSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Copy all button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyTranscript();
                }}
                title="Copy Full Transcript"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: copied ? '#34D399' : 'var(--color-text)',
                }}
              >
                {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Chunks List — Scrollable, preserving font-size */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
              {filteredChunks.length === 0 ? (
                <div className="py-10 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {transcriptSearch ? 'No matching transcript chunks found' : 'No transcript recorded'}
                </div>
              ) : (
                filteredChunks.map((chunk, idx) => {
                  const chunkSec = parseTimestampToSeconds(chunk.startTime);
                  const isCurrent = activeChunkIndex === idx && !transcriptSearch;

                  return (
                    <div
                      key={idx}
                      onClick={() => seekTo(chunkSec)}
                      title={`Click to seek audio to ${chunk.startTime || '00:00'}`}
                      className="p-2.5 rounded-xl text-left transition-all cursor-pointer group"
                      style={{
                        backgroundColor: isCurrent
                          ? 'rgba(99, 102, 241, 0.14)'
                          : 'transparent',
                        border: '1px solid',
                        borderColor: isCurrent ? 'rgba(99, 102, 241, 0.45)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--color-surface-overlay)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono font-semibold transition-colors"
                          style={{
                            backgroundColor: isCurrent ? 'rgba(99, 102, 241, 0.3)' : 'var(--color-surface)',
                            color: isCurrent ? '#818CF8' : 'var(--color-text)',
                            border: '1px solid',
                            borderColor: isCurrent ? 'rgba(99, 102, 241, 0.6)' : 'var(--color-border)',
                          }}
                        >
                          ▶ {chunk.startTime || '00:00'}
                        </span>
                        <span
                          className="text-[10px] font-mono opacity-60"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Chunk #{idx + 1}
                        </span>
                      </div>
                      <p
                        className="text-sm leading-relaxed tracking-normal font-normal"
                        style={{ color: isCurrent ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
                      >
                        {chunk.textBlock}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

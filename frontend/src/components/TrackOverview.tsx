import { useState, useCallback } from 'react';
import type { Track } from '../hooks/useReaper';

interface TrackOverviewProps {
  tracks: Track[];
  selectedTrack: number | null;
  onSelectTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  onToggleSolo: (index: number) => void;
  onToggleArm: (index: number) => void;
  onRefresh: () => void;
  onPlay?: () => Promise<boolean>;
  onStop?: () => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
}

/** Convert linear 0-1 Reaper volume to approximate dB string */
function volumeToDb(vol: number): string {
  if (vol <= 0) return '-∞';
  const dB = 20 * Math.log10(vol);
  return `${dB.toFixed(1)}dB`;
}

/** Render a simple fader bar (visual only — real touch slider via CSS) */
function VolumeBar({ volume }: { volume: number }) {
  const pct = Math.min(volume * 100, 100);
  return (
    <div className="relative w-24 h-5 bg-[var(--bg-tertiary)] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-[var(--accent-green)]/50 transition-all duration-75"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TrackOverview({
  tracks,
  selectedTrack,
  onSelectTrack,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onRefresh,
  onPlay,
  onStop,
  onGetTransportState,
}: TrackOverviewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = useCallback(async () => {
    if (!onPlay) return;
    const ok = await onPlay();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsPlaying(state.playing);
    }
  }, [onPlay, onGetTransportState]);

  const handleStop = useCallback(async () => {
    if (!onStop) return;
    const ok = await onStop();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsPlaying(state.playing);
    }
  }, [onStop, onGetTransportState]);

  return (
    <div className="flex flex-col h-full">
      {/* Transport bar */}
      {onPlay && onStop && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 border-b border-[var(--border)]">
          <button
            data-testid="transport-play"
            onClick={handlePlay}
            className={`
              w-16 h-10 text-sm font-semibold transition-all active:scale-90
              ${isPlaying
                ? 'bg-[var(--accent-green)]/25 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ▶
          </button>
          <button
            data-testid="transport-stop"
            onClick={handleStop}
            className={`
              w-16 h-10 text-sm font-semibold transition-all active:scale-90
              ${!isPlaying
                ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ■
          </button>
          <span className="text-[11px] text-[var(--text-secondary)] w-20 text-center">
            {isPlaying ? 'Playing' : 'Stopped'}
          </span>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Tracks {tracks.length > 0 ? `(${tracks.length})` : ''}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-95"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-[var(--bg-tertiary)] active:scale-95 transition-transform text-sm"
            title="Refresh tracks"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--text-secondary)] space-y-3">
          <div className="text-5xl">🎛️</div>
          <p className="text-sm">No tracks loaded</p>
          <button
            onClick={onRefresh}
            className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:scale-95 transition-transform"
          >
            Refresh
          </button>
        </div>
      ) : collapsed ? (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} — tap Collapse to show
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-4">
          {tracks.map((track) => (
            <TrackRow
              key={track.index}
              track={track}
              isSelected={track.index === selectedTrack}
              onSelect={() => onSelectTrack(track.index)}
              onToggleMute={() => onToggleMute(track.index)}
              onToggleSolo={() => onToggleSolo(track.index)}
              onToggleArm={() => onToggleArm(track.index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual track row ─────────────────────────────────

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
}

function TrackRow({
  track,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
}: TrackRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2.5 px-3 py-2 cursor-pointer
        active:scale-[0.98] transition-all duration-100 select-none
        ${isSelected
          ? 'bg-[var(--bg-tertiary)] ring-1 ring-[var(--accent-orange)]/40'
          : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
        }
        ${track.muted ? 'opacity-50' : ''}
      `}
    >
      {/* Track icon + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg flex-shrink-0">{track.armed ? '🔴' : '🔊'}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {track.name || `Track ${track.index + 1}`}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            Ch. {track.trackNumber}
          </div>
        </div>
      </div>

      {/* Volume bar */}
      <VolumeBar volume={track.volume} />

      {/* Volume dB */}
      <span className="text-[11px] text-[var(--text-secondary)] w-14 text-right tabular-nums">
        {volumeToDb(track.volume)}
      </span>

      {/* Control buttons */}
      <div className="flex gap-1.5 flex-shrink-0">
        {/* Mute */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className={`
            w-9 h-9 text-xs font-semibold transition-all active:scale-90
            ${track.muted
              ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          M
        </button>

        {/* Solo */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSolo(); }}
          className={`
            w-9 h-9 text-xs font-semibold transition-all active:scale-90
            ${track.soloed
              ? 'bg-[var(--accent-yellow)]/25 text-[var(--accent-yellow)] ring-1 ring-[var(--accent-yellow)]/40'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          S
        </button>

        {/* Record Arm */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleArm(); }}
          className={`
            w-9 h-9 text-xs font-semibold transition-all active:scale-90
            ${track.armed
              ? 'bg-[var(--accent-red)]/30 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/50'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          R
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Track } from '../hooks/useReaper';

interface TrackOverviewProps {
  tracks: Track[];
  selectedTrack: number | null;
  onSelectTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  onToggleSolo: (index: number) => void;
  onToggleArm: (index: number) => void;
  onRefresh: () => void;
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
    <div className="relative w-24 h-5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-[var(--accent)]/40 rounded-full transition-all duration-75"
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
}: TrackOverviewProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Tracks {tracks.length > 0 ? `(${tracks.length})` : ''}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs px-2 py-1 rounded-lg bg-white/5 text-[var(--text-secondary)] active:scale-95"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg hover:bg-white/5 active:scale-95 transition-transform text-sm"
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
            className="px-5 py-2.5 bg-white/10 rounded-xl text-sm active:scale-95 transition-transform"
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
        flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer
        active:scale-[0.98] transition-all duration-100 select-none
        ${isSelected
          ? 'bg-[#2a2a3a] ring-1 ring-[var(--accent-dim)]'
          : 'bg-[var(--bg-tertiary)] hover:bg-[#2a2a3a]/60'
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
            w-9 h-9 rounded-lg text-xs font-bold transition-all active:scale-90
            ${track.muted
              ? 'bg-red-500/25 text-red-400 ring-1 ring-red-500/40'
              : 'bg-white/8 text-[var(--text-secondary)]'
            }
          `}
        >
          M
        </button>

        {/* Solo */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSolo(); }}
          className={`
            w-9 h-9 rounded-lg text-xs font-bold transition-all active:scale-90
            ${track.soloed
              ? 'bg-yellow-500/25 text-yellow-400 ring-1 ring-yellow-500/40'
              : 'bg-white/8 text-[var(--text-secondary)]'
            }
          `}
        >
          S
        </button>

        {/* Record Arm */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleArm(); }}
          className={`
            w-9 h-9 rounded-lg text-xs font-bold transition-all active:scale-90
            ${track.armed
              ? 'bg-red-600/30 text-red-400 ring-1 ring-red-500/50'
              : 'bg-white/8 text-[var(--text-secondary)]'
            }
          `}
        >
          R
        </button>
      </div>
    </div>
  );
}

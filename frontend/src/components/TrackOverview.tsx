import { useState, useCallback, useEffect } from 'react';
import type { Track, FxInfo } from '../hooks/useReaper';

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
  onRecord?: () => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
  onAddTrack?: () => Promise<boolean>;
  getTrackFx?: (trackIdx: number) => Promise<FxInfo[]>;
  onSelectFx?: (trackIdx: number, fxIdx: number, fxName: string) => void;
}

/** Convert linear 0-1 Reaper volume to approximate dB string */
function volumeToDb(vol: number): string {
  if (vol <= 0) return '-∞';
  const dB = 20 * Math.log10(vol);
  return `${dB.toFixed(1)}dB`;
}

/** Interactive volume fader with slider and visual bar */
function VolumeBar({ volume, onChange }: { volume: number; onChange?: (value: number) => void }) {
  const pct = Math.min(volume * 100, 100);
  return (
    <div className="relative w-24 h-5">
      {/* Visual bar background */}
      <div className="absolute inset-0 bg-[var(--bg-tertiary)] overflow-hidden pointer-events-none">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--accent-green)]/50"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Invisible slider overlaid on top */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          if (onChange) onChange(val);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Track volume"
        data-testid="track-volume-slider"
      />
    </div>
  );
}

/** Clean FX name for display (strip format prefix like "VST3: ") */
function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '');
}

export function TrackOverview({
  tracks,
  selectedTrack,
  onSelectTrack,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onVolumeChange,
  onRefresh,
  onPlay,
  onStop,
  onRecord,
  onGetTransportState,
  onAddTrack,
  getTrackFx,
  onSelectFx,
}: TrackOverviewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [trackFxMap, setTrackFxMap] = useState<Record<number, FxInfo[]>>({});
  const [fxLoading, setFxLoading] = useState(false);

  const handleRecord = useCallback(async () => {
    if (!onRecord) return;
    const ok = await onRecord();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsRecording(state.recording);
      setIsPlaying(state.playing);
    }
  }, [onRecord, onGetTransportState]);

  // Fetch FX for all tracks on mount / when track list changes
  useEffect(() => {
    if (!getTrackFx || tracks.length === 0) {
      setTrackFxMap({});
      return;
    }
    let cancelled = false;
    setFxLoading(true);
    Promise.all(
      tracks.map(async (t) => {
        try {
          const fx = await getTrackFx(t.index);
          return { index: t.index, fx };
        } catch {
          return { index: t.index, fx: [] as FxInfo[] };
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        const map: Record<number, FxInfo[]> = {};
        for (const r of results) {
          map[r.index] = r.fx;
        }
        setTrackFxMap(map);
        setFxLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setFxLoading(false);
    });
    return () => { cancelled = true; };
  }, [tracks, getTrackFx]);

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
              w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
              ${isPlaying
                ? 'bg-[var(--accent-green)]/25 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ▶
          </button>
          {onRecord && (
            <button
              data-testid="transport-record"
              onClick={handleRecord}
              className={`
                w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
                ${isRecording
                  ? 'bg-[var(--accent-red)]/40 text-[var(--accent-red)] ring-2 ring-[var(--accent-red)]/60'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }
              `}
            >
              ●
            </button>
          )}
          <button
            data-testid="transport-stop"
            onClick={handleStop}
            className={`
              w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
              ${!isPlaying && !isRecording
                ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ■
          </button>
          <span className="text-[11px] text-[var(--text-secondary)] w-20 text-center">
            {isRecording ? 'Recording' : isPlaying ? 'Playing' : 'Stopped'}
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
            className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:brightness-95"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          {onAddTrack && (
            <button
              onClick={onAddTrack}
              className="px-2 py-1 bg-[var(--accent-dim)] text-[var(--accent-orange)] text-xs active:brightness-95 transition-colors"
              title="Add new track"
            >
              + Track
            </button>
          )}
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
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
          {onAddTrack && (
            <button
              onClick={onAddTrack}
              className="px-5 py-2.5 bg-[var(--accent-dim)] text-[var(--accent-orange)] text-sm active:brightness-95 transition-colors"
            >
              + Add Track
            </button>
          )}
          <button
            onClick={onRefresh}
            className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95 transition-colors"
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
          {fxLoading && tracks.length > 0 && (
            <div className="px-3 py-2 text-xs text-[var(--text-secondary)] animate-pulse">
              Loading FX…
            </div>
          )}
          {tracks.map((track) => (
            <div key={track.index}>
              <TrackRow
                track={track}
                isSelected={track.index === selectedTrack}
                onSelect={() => onSelectTrack(track.index)}
                onToggleMute={() => onToggleMute(track.index)}
                onToggleSolo={() => onToggleSolo(track.index)}
                onToggleArm={() => onToggleArm(track.index)}
                onVolumeChange={onVolumeChange ? (v) => onVolumeChange(track.index, v) : undefined}
              />
              {/* FX grid cards under the track row */}
              {getTrackFx && onSelectFx && trackFxMap[track.index]?.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  {trackFxMap[track.index].map((fx) => (
                    <button
                      key={fx.index}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFx(track.index, fx.index, fx.name);
                      }}
                      className="
                        flex flex-col items-center justify-center
                        w-24 h-18 px-2 py-2
                        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
                        ring-1 ring-[var(--border)]
                        active:brightness-95 transition-all duration-100
                        cursor-pointer text-center
                      "
                    >
                      <span className="text-xs font-medium truncate w-full leading-tight">
                        {cleanFxName(fx.name)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
  onVolumeChange?: (volume: number) => void;
}

function TrackRow({
  track,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onVolumeChange,
}: TrackRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2.5 px-3 py-2 cursor-pointer
        active:brightness-95 transition-colors duration-100 select-none
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
      <VolumeBar volume={track.volume} onChange={onVolumeChange} />

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
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
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
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
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
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
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

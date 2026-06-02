import { useState, useCallback, useEffect, useRef } from 'react';
import type { Track, FxInfo } from '../hooks/useReaper';
import { volumeToDb } from '../utils/volume';

interface TrackOverviewProps {
  tracks: Track[];
  selectedTrack: number | null;
  onSelectTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  onToggleSolo: (index: number) => void;
  onToggleArm: (index: number) => void;
  onVolumeChange?: (trackIdx: number, volume: number) => void;
  onPanChange?: (trackIdx: number, pan: number) => void;
  onAddTrack?: () => Promise<boolean>;
  onRefresh: () => void;
  onPlay?: () => Promise<boolean>;
  onStop?: () => Promise<boolean>;
  onRecord?: () => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
  getTrackFx?: (trackIdx: number) => Promise<FxInfo[]>;
  onSelectFx?: (trackIdx: number, fxIdx: number, fxName: string) => void;
  onOpenFx?: (trackIdx: number) => void;
  onReorderFx?: (trackIdx: number, fromIndex: number, toIndex: number) => Promise<boolean>;
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

/** Pan control: horizontal slider -1 to 1, with center position indicator */
function PanBar({ pan, onChange }: { pan: number; onChange?: (value: number) => void }) {
  // Normalize -1..1 to 0..100 for bar width
  const pct = Math.round(Math.abs(pan) * 100);
  const isLeft = pan < -0.05;
  const isRight = pan > 0.05;
  const isCenter = !isLeft && !isRight;

  let label: string;
  if (isCenter) {
    label = 'C';
  } else if (isLeft) {
    label = `L ${pct}%`;
  } else {
    label = `R ${pct}%`;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Visual pan indicator */}
      <div className="relative w-16 h-5">
        {/* Background track */}
        <div className="absolute inset-0 bg-[var(--bg-tertiary)] overflow-hidden">
          {/* Center line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[var(--text-secondary)]/30" />
          {/* Left fill (hard-left = full left fill) */}
          {isLeft && (
            <div
              className="absolute inset-y-0 right-1/2 bg-[var(--accent-orange)]/40"
              style={{ width: `${pct}%` }}
            />
          )}
          {/* Right fill (hard-right = full right fill) */}
          {isRight && (
            <div
              className="absolute inset-y-0 left-1/2 bg-[var(--accent-orange)]/40"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        {/* Invisible slider overlaid on top */}
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (onChange) onChange(val);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Track pan"
          data-testid="track-pan-slider"
        />
      </div>
      {/* Pan label */}
      <span data-testid="pan-label" className="text-[11px] text-[var(--text-secondary)] w-10 text-center tabular-nums">
        {label}
      </span>
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
  onPanChange,
  onRefresh,
  onPlay,
  onStop,
  onRecord,
  onGetTransportState,
  onAddTrack,
  getTrackFx,
  onSelectFx,
  onOpenFx,
  onReorderFx,
}: TrackOverviewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [trackFxMap, setTrackFxMap] = useState<Record<number, FxInfo[]>>({});
  const [fxLoading, setFxLoading] = useState(false);

  // Drag-and-drop state for FX reordering
  // Note: Refs are used for data that must be available synchronously across
  // dragStart → dragOver → drop events (React state updates are batched and
  // not available until the next render cycle).
  const [dragActiveTrack, setDragActiveTrack] = useState<number | null>(null); // which track has an active drag (for visual rendering)
  const [dragSourceFxIdx, setDragSourceFxIdx] = useState<number | null>(null); // which FX is being dragged (for visual rendering)
  const [dropVisualIdx, setDropVisualIdx] = useState<number | null>(null); // visual-only: show insertion indicator
  const dragDataRef = useRef<{trackIdx: number; fxIdx: number} | null>(null);
  const dropTargetRef = useRef<{dropIndex: number} | null>(null);

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
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          {onAddTrack && (
            <button
              data-testid="add-track-button"
              onClick={onAddTrack}
              className="text-xs px-2 py-1 bg-[var(--accent-green)]/25 text-[var(--accent-green)] active:brightness-95"
            >
              + Track
            </button>
          )}
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
            onClick={() => onRefresh()}
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
          <div className="flex gap-2">
            {onAddTrack && (
              <button
                data-testid="add-track-empty"
                onClick={onAddTrack}
                className="px-5 py-2.5 bg-[var(--accent-green)]/25 text-[var(--accent-green)] text-sm active:brightness-95 transition-colors"
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
                onPanChange={onPanChange ? (v) => onPanChange(track.index, v) : undefined}
                onOpenFx={onOpenFx ? () => onOpenFx(track.index) : undefined}
              />
              {/* FX grid cards under the track row — draggable for reorder */}
              {getTrackFx && onSelectFx && (
                <div
                  className="flex flex-wrap gap-2 px-3 pb-2"
                  onDragOver={(e) => {
                    if (!dragDataRef.current) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragData = dragDataRef.current;
                    if (!dragData || !onReorderFx || dragData.trackIdx !== track.index) {
                      dragDataRef.current = null;
                      dropTargetRef.current = null;
                      setDragActiveTrack(null);
                      setDragSourceFxIdx(null);
                      setDropVisualIdx(null);
                      return;
                    }
                    const target = dropTargetRef.current;
                    const toIndex = target?.dropIndex ?? trackFxMap[track.index]?.length ?? 0;
                    if (dragData.fxIdx !== toIndex) {
                      onReorderFx(track.index, dragData.fxIdx, toIndex);
                    }
                    dragDataRef.current = null;
                    dropTargetRef.current = null;
                    setDragActiveTrack(null);
                    setDragSourceFxIdx(null);
                    setDropVisualIdx(null);
                  }}
                >
                  {(trackFxMap[track.index] ?? []).map((fx) => {
                    const isDragSource = dragSourceFxIdx === fx.index && dragActiveTrack === track.index;
                    const isDropTarget = dropVisualIdx === fx.index && dragActiveTrack === track.index;

                    return (
                      <button
                        key={fx.index}
                        draggable={true}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFx!(track.index, fx.index, fx.name);
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `${track.index}:${fx.index}`);
                          e.dataTransfer.effectAllowed = 'move';
                          dragDataRef.current = { trackIdx: track.index, fxIdx: fx.index };
                          setDragActiveTrack(track.index);
                          setDragSourceFxIdx(fx.index);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (!dragDataRef.current || dragDataRef.current.trackIdx !== track.index) return;

                          // Determine where to insert based on cursor X position
                          const rect = e.currentTarget.getBoundingClientRect();
                          const midX = rect.left + rect.width / 2;
                          const dropIndex = e.clientX < midX ? fx.index : fx.index + 1;

                          // Write to ref synchronously (for onDrop)
                          dropTargetRef.current = { dropIndex };
                          setDropVisualIdx(dropIndex);
                        }}
                        onDragLeave={() => {
                          setDropVisualIdx((prev) =>
                            prev === fx.index ? null : prev,
                          );
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const dragData = dragDataRef.current;
                          if (!dragData || !onReorderFx) {
                            dragDataRef.current = null;
                            dropTargetRef.current = null;
                            setDragActiveTrack(null);
                            setDragSourceFxIdx(null);
                            setDropVisualIdx(null);
                            return;
                          }
                          if (dragData.trackIdx !== track.index) {
                            dragDataRef.current = null;
                            dropTargetRef.current = null;
                            setDragActiveTrack(null);
                            setDragSourceFxIdx(null);
                            setDropVisualIdx(null);
                            return;
                          }

                          // Read from ref for synchronous access (state may be stale)
                          const target = dropTargetRef.current;
                          const targetDropIndex = target?.dropIndex ?? fx.index;
                          if (dragData.fxIdx !== targetDropIndex) {
                            onReorderFx(track.index, dragData.fxIdx, targetDropIndex);
                          }
                          dragDataRef.current = null;
                          dropTargetRef.current = null;
                          setDragActiveTrack(null);
                          setDragSourceFxIdx(null);
                          setDropVisualIdx(null);
                        }}
                        onDragEnd={() => {
                          dragDataRef.current = null;
                          dropTargetRef.current = null;
                          setDragActiveTrack(null);
                          setDragSourceFxIdx(null);
                          setDropVisualIdx(null);
                        }}
                        className={`
                          flex flex-col items-center justify-center
                          w-24 h-18 px-2 py-2
                          bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
                          ring-1 ring-[var(--border)]
                          active:brightness-95 transition-all duration-100
                          cursor-pointer text-center relative
                          ${isDragSource ? 'opacity-40' : ''}
                          ${isDropTarget && !isDragSource ? 'ring-[var(--accent-orange)] bg-[var(--accent-orange)]/10' : ''}
                        `}
                      >
                        <span className="text-xs font-medium truncate w-full leading-tight">
                          {cleanFxName(fx.name)}
                        </span>
                      </button>
                    );
                  })}
                  {/* Drop zone at the end (after last card) */}
                  {trackFxMap[track.index]?.length > 0 && dragActiveTrack === track.index && (
                    <div
                      className={`
                        w-24 h-18 flex items-center justify-center
                        ring-1 ring-dashed ring-[var(--border)]
                        text-[11px] text-[var(--text-secondary)]
                        transition-all duration-100
                        ${dropVisualIdx === trackFxMap[track.index].length
                          ? 'ring-[var(--accent-orange)] bg-[var(--accent-orange)]/10'
                          : ''}
                      `}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragDataRef.current?.trackIdx === track.index) {
                          const dropIndex = trackFxMap[track.index].length;
                          dropTargetRef.current = { dropIndex };
                          setDropVisualIdx(dropIndex);
                        }
                      }}
                      onDragLeave={() => {
                        setDropVisualIdx((prev) =>
                          prev === trackFxMap[track.index]?.length ? null : prev,
                        );
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const dragData = dragDataRef.current;
                        if (!dragData || !onReorderFx || dragData.trackIdx !== track.index) {
                          dragDataRef.current = null;
                          dropTargetRef.current = null;
                          setDragActiveTrack(null);
                          setDragSourceFxIdx(null);
                          setDropVisualIdx(null);
                          return;
                        }
                        const toIndex = trackFxMap[track.index].length;
                        if (dragData.fxIdx !== toIndex) {
                          onReorderFx(track.index, dragData.fxIdx, toIndex);
                        }
                        dragDataRef.current = null;
                        dropTargetRef.current = null;
                        setDragActiveTrack(null);
                        setDragSourceFxIdx(null);
                        setDropVisualIdx(null);
                      }}
                    >
                      +
                    </div>
                  )}
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
  onPanChange?: (pan: number) => void;
  onOpenFx?: () => void;
}

function TrackRow({
  track,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onVolumeChange,
  onPanChange,
  onOpenFx,
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

      {/* Pan control */}
      <PanBar pan={track.pan} onChange={onPanChange} />

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

        {/* FX open button (Issue #86) */}
        {onOpenFx && (
          <button
            data-testid="open-fx-button"
            onClick={(e) => { e.stopPropagation(); onOpenFx(); }}
            className={`
              w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
              bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
            `}
          >
            FX
          </button>
        )}
      </div>
    </div>
  );
}

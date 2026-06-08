import { useState, useCallback, useEffect, useRef } from 'react';
import type { MatrixData, ClipSlot, Track } from '../hooks/useReaper';

interface SessionViewProps {
  matrix: MatrixData | null;
  tracks?: Track[];
  getMatrix: () => Promise<MatrixData | null>;
  triggerSlot: (column: number, row: number) => Promise<ClipSlot | null>;
  triggerScene: (row: number) => Promise<ClipSlot[] | null>;
  onEvent?: (pattern: string, handler: (data: any) => void) => () => void;
  onPlay?: () => Promise<boolean>;
  onStop?: () => Promise<boolean>;
  onRecord?: () => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
  /** Launch Playtime 2 (Issue #88) */
  onLaunchPlaytime?: () => Promise<{launched: boolean; message: string}>;
  /** Check if Playtime 2 is available (Issue #88) */
  onCheckPlaytimeAvailable?: () => Promise<{available: boolean}>;
  /** Record into a clip slot (Issue #43) */
  onRecordSlot?: (column: number, row: number) => Promise<ClipSlot | null>;
  /** Toggle reverse on a clip slot (Issue #75) */
  onSetSlotReverse?: (column: number, row: number, reversed: boolean) => Promise<ClipSlot | null>;
}

/** Map slot state to display color hex (for the cell accent) */
function stateColor(state: ClipSlot['state']): string {
  switch (state) {
    case 'empty':     return 'var(--text-secondary)';
    case 'stopped':   return 'var(--accent-dim)';
    case 'playing':   return 'var(--accent-green)';
    case 'recording': return 'var(--accent-red)';
  }
}

export function SessionView({
  matrix,
  tracks,
  getMatrix,
  triggerSlot,
  triggerScene,
  onEvent,
  onPlay,
  onStop,
  onRecord,
  onGetTransportState,
  onLaunchPlaytime,
  onCheckPlaytimeAvailable,
  onRecordSlot,
  onSetSlotReverse,
}: SessionViewProps) {
  const [loading, setLoading] = useState(!matrix);
  const [activeScene, setActiveScene] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playtimeAvailable, setPlaytimeAvailable] = useState<boolean | null>(null);
  const [playtimeLaunching, setPlaytimeLaunching] = useState(false);
  const [playtimeError, setPlaytimeError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Load matrix on mount if not provided
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      getMatrix().then(() => setLoading(false));
      // Check if Playtime is available
      if (onCheckPlaytimeAvailable) {
        onCheckPlaytimeAvailable().then(result => {
          setPlaytimeAvailable(result.available);
        }).catch(() => {
          setPlaytimeAvailable(false);
        });
      } else {
        setPlaytimeAvailable(false);
      }
    }
  }, [getMatrix, onCheckPlaytimeAvailable]);

  // Load initial transport state on mount
  useEffect(() => {
    if (onGetTransportState) {
      onGetTransportState().then(state => {
        setPlaying(state.playing);
        setRecording(state.recording);
      });
    }
  }, [onGetTransportState]);

  // Subscribe to slotStateChanged events for real-time updates
  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('event:slotStateChanged', (_msg: any) => {
      // Matrix state is managed externally via the prop — parent re-renders
      // This hook allows future integration for optimistic UI updates
    });
    return unsub;
  }, [onEvent]);

  const handlePlay = useCallback(async () => {
    if (onPlay) {
      const ok = await onPlay();
      if (ok) setPlaying(true);
    }
  }, [onPlay]);

  const handleStop = useCallback(async () => {
    if (onStop) {
      const ok = await onStop();
      if (ok) {
        setPlaying(false);
        setRecording(false);
      }
    }
  }, [onStop]);

  const handleRecord = useCallback(async () => {
    if (onRecord) {
      await onRecord();
      // Toggle recording state locally (the backend returns actual state)
      setRecording(prev => !prev);
    }
  }, [onRecord]);

  const handleSlotTap = useCallback(async (col: number, row: number) => {
    // Issue #43: Audio recording workflow
    // When transport recording is active and slot is empty/stopped, start recording.
    // When slot is recording, stop recording.
    // Otherwise (transport not recording or slot already playing), trigger the clip.
    const slot = matrix?.slots.find(s => s.column === col && s.row === row);
    const shouldRecord = recording && slot && (slot.state === 'empty' || slot.state === 'stopped' || slot.state === 'recording');

    if (shouldRecord && onRecordSlot) {
      await onRecordSlot(col, row);
    } else {
      await triggerSlot(col, row);
    }
    // Issue #80: Refresh matrix after triggering a slot so the grid
    // reflects the new visual state (playing/stopped). Without this,
    // the matrix prop never updates and the grid stays unchanged.
    getMatrix();
  }, [triggerSlot, getMatrix, recording, matrix, onRecordSlot]);

  const handleSceneLaunch = useCallback(async (row: number) => {
    setActiveScene(row);
    await triggerScene(row);
    setActiveScene(null);
    // Issue #80: Also refresh matrix after scene trigger so all
    // slots in the scene row update their visual state.
    getMatrix();
  }, [triggerScene, getMatrix]);

  const handleReverseToggle = useCallback(async (col: number, row: number, currentReversed: boolean) => {
    if (!onSetSlotReverse) return;
    await onSetSlotReverse(col, row, !currentReversed);
    // Refresh matrix after reverse toggle
    getMatrix();
  }, [onSetSlotReverse, getMatrix]);

  const handleLaunchPlaytime = useCallback(async () => {
    if (!onLaunchPlaytime) return;
    setPlaytimeLaunching(true);
    setPlaytimeError(null);
    try {
      const result = await onLaunchPlaytime();
      if (result.launched) {
        setPlaytimeAvailable(true);
        // Refresh matrix now that Playtime is running
        getMatrix();
      } else {
        setPlaytimeError(result.message || 'Failed to launch Playtime');
      }
    } catch {
      setPlaytimeError('Failed to send launch command');
    } finally {
      setPlaytimeLaunching(false);
    }
  }, [onLaunchPlaytime, getMatrix]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
        Loading clip matrix…
      </div>
    );
  }

  // Show Launch Playtime prompt when matrix is unavailable and Playtime is not running
  if (!matrix) {
    const showLaunchButton = playtimeAvailable === false || playtimeAvailable === null;
    const isActive = playtimeAvailable === true;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-2xl opacity-60">
            🎵
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            {isActive ? 'Playtime Active' : 'Playtime 2'}
          </h3>
          <p className="text-[11px] text-[var(--text-secondary)]/60 max-w-[240px]">
            {isActive
              ? 'Playtime 2 is running but no clip matrix was found. Try refreshing or creating a matrix in REAPER.'
              : 'Playtime 2 powers the clip launcher. Launch it to start triggering clips from your iPad.'}
          </p>
        </div>

        {showLaunchButton && (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleLaunchPlaytime}
              disabled={playtimeLaunching}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold
                transition-all active:brightness-90
                ${playtimeLaunching
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-not-allowed'
                  : playtimeError
                    ? 'bg-[var(--accent-red)]/20 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/30 ring-1 ring-[var(--accent-red)]/30'
                    : 'bg-[var(--accent-orange)] text-black hover:brightness-110'
                }
              `}
              aria-label="Launch Playtime"
            >
              {playtimeLaunching ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Launching…
                </>
              ) : playtimeError ? (
                <>
                  <span>⚠</span>
                  {playtimeError}
                </>
              ) : (
                <>
                  <span>▶</span>
                  Launch Playtime
                </>
              )}
            </button>

            {/* Retry button if Playtime check failed */}
            {onCheckPlaytimeAvailable && playtimeAvailable === null && !playtimeLaunching && (
              <button
                onClick={() => {
                  onCheckPlaytimeAvailable().then(result => {
                    setPlaytimeAvailable(result.available);
                  }).catch(() => {
                    setPlaytimeAvailable(false);
                  });
                }}
                className="text-[10px] text-[var(--text-secondary)]/50 hover:text-[var(--text-secondary)] underline"
                aria-label="Retry Playtime check"
              >
                Check again
              </button>
            )}
          </div>
        )}

        {isActive && (
          <button
            onClick={() => getMatrix()}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all active:brightness-90"
            aria-label="Refresh matrix"
          >
            ↻ Refresh Matrix
          </button>
        )}
      </div>
    );
  }

  const rows = matrix.rows;
  const cols = matrix.columns;

  // Build a lookup: "col,row" -> ClipSlot
  const slotMap = new Map<string, ClipSlot>();
  for (const slot of matrix.slots) {
    slotMap.set(`${slot.column},${slot.row}`, slot);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Session View
        </h2>
        <button
          onClick={() => getMatrix()}
          className="p-2 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
          title="Refresh matrix"
        >
          ↻
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-[var(--text-secondary)] border-b border-[var(--border)]">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--text-secondary)]/30" /> Empty
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-dim)]" /> Stopped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-green)]" /> Playing
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-red)]" /> Recording
        </span>
      </div>

      {/* Transport bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
        <button
          onClick={handlePlay}
          className={`flex items-center justify-center w-8 h-8 rounded text-sm font-bold transition-all active:brightness-90 ${
            playing
              ? 'bg-[var(--accent-green)] text-black'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
          title="Play"
          aria-label="Play"
        >
          ▶
        </button>
        <button
          onClick={handleStop}
          className="flex items-center justify-center w-8 h-8 rounded text-sm font-bold bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:brightness-90 transition-all"
          title="Stop"
          aria-label="Stop"
        >
          ■
        </button>
        <button
          onClick={handleRecord}
          className={`flex items-center justify-center w-8 h-8 rounded text-sm font-bold transition-all active:brightness-90 ${
            recording
              ? 'bg-[var(--accent-red)] text-black animate-pulse'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
          title="Record"
          aria-label="Record"
        >
          ●
        </button>
      </div>

      {/* Column headers */}
      {(() => {
        const matrixTracks = (tracks ?? []).filter(t => !/helgobox|realearn/i.test(t.name));
        return (
          <div className="flex gap-px px-3 pt-2 border-b border-[var(--border)]">
            {Array.from({ length: cols }, (_, col) => {
              const trackName = matrixTracks[col]?.name || `Track ${col + 1}`;
              return (
                <div
                  key={col}
                  className="flex-1 flex items-center justify-center text-[10px] font-semibold text-[var(--text-secondary)] truncate px-1 py-1.5"
                  title={trackName}
                >
                  {trackName}
                </div>
              );
            })}
            <div className="w-8" />
          </div>
        );
      })()}

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-px">
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex gap-px">
              {Array.from({ length: cols }, (_, col) => {
                const slot = slotMap.get(`${col},${row}`);
                const state = slot?.state ?? 'empty';
                const name = slot?.name ?? '';
                const clipType = slot?.clipType ?? 'none';
                return (
                  <button
                    key={col}
                    onClick={() => handleSlotTap(col, row)}
                    className={`
                      relative flex-1 flex flex-col items-center justify-center
                      aspect-square min-h-[44px]
                      transition-all duration-75 cursor-pointer overflow-hidden
                      ${state === 'empty' ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]' : ''}
                      ${state === 'stopped' ? 'bg-[var(--accent-dim)]/20 hover:bg-[var(--accent-dim)]/30 text-[var(--text-primary)]' : ''}
                      ${state === 'playing' ? 'bg-[var(--accent-green)] text-black hover:brightness-110' : ''}
                      ${state === 'recording' ? 'bg-[var(--accent-red)] text-black animate-pulse hover:brightness-110' : ''}
                      active:brightness-90
                    `}
                    aria-label={`Slot ${col + 1},${row + 1}`}
                  >
                    {clipType === 'midi' && <span className="text-[10px] opacity-50">♪</span>}
                    {clipType === 'audio' && <span className="text-[10px] opacity-50">🔊</span>}
                    {name && (
                      <span className="text-[9px] leading-tight text-center px-0.5 truncate w-full mt-0.5">
                        {name}
                      </span>
                    )}
                    {state !== 'empty' && onSetSlotReverse && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReverseToggle(col, row, slot?.reversed ?? false); }}
                        className={`absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold leading-none transition-all active:scale-90 ${slot?.reversed ? 'bg-[var(--accent-orange)] text-black' : 'bg-black/20 text-[var(--text-secondary)] hover:bg-black/40'}`}
                        aria-label={`Reverse slot ${col + 1},${row + 1}`}
                      >
                        {slot?.reversed ? '◄' : '↻'}
                      </button>
                    )}
                    {state === 'playing' && <span className="absolute bottom-0.5 right-0.5 text-[8px] opacity-70">▶</span>}
                    {state === 'recording' && <span className="absolute bottom-0.5 right-0.5 text-[8px] text-[var(--accent-red)] opacity-80">●</span>}
                    {slot?.reversed && state !== 'empty' && <span className="absolute top-0.5 left-0.5 text-[7px] font-bold text-[var(--accent-orange)] opacity-90">R</span>}
                  </button>
                );
              })}
              <button
                onClick={() => handleSceneLaunch(row)}
                className={`
                  w-8 flex items-center justify-center
                  text-[10px] font-semibold
                  transition-colors active:brightness-90 cursor-pointer
                  ${activeScene === row
                    ? 'bg-[var(--accent-orange)]/30 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/50'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }
                `}
                aria-label={`Scene ${row + 1}`}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

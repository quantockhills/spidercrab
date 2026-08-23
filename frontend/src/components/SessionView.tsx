import { useState, useCallback, useEffect, useRef } from 'react';
import type { MatrixData, ClipSlot, Track, FxParam } from '../hooks/useReaper';

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
  /** Playtime's own transport, which is not REAPER's. The matrix plays
   *  whether or not the project transport is rolling. */
  onMatrixPlay?: (on: boolean) => Promise<boolean>;
  onMatrixStopAll?: () => Promise<boolean>;
  /** REAPER's metronome. Called with no argument it just reads the state. */
  onMatrixClick?: (on?: boolean) => Promise<boolean>;
  /** Tempo is the project's — Playtime follows it and offers only tap. */
  onGetTempo?: () => Promise<number>;
  onSetTempo?: (bpm: number) => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
  /** Launch Playtime 2 (Issue #88) */
  onLaunchPlaytime?: () => Promise<{launched: boolean; message: string}>;
  /** Check if Playtime 2 is available (Issue #88) */
  onCheckPlaytimeAvailable?: () => Promise<{available: boolean}>;
  /** Record into a clip slot (Issue #43) */
  onRecordSlot?: (column: number, row: number) => Promise<ClipSlot | null>;
  /** Record into a clip slot after a N-bar count-in (0 = immediate). The
   *  extension fires the trigger at the next bar boundary + N bars and
   *  broadcasts matrix/countdown events for the on-slot display. */
  onRecordSlotCountdown?: (column: number, row: number, bars: number) => Promise<ClipSlot | null>;
  /** Delete the clip in a slot (long-press → confirm) */
  onClearSlot?: (column: number, row: number) => Promise<ClipSlot | null>;
  /** Bounce a slot's source sample to a new RS5K sampler track */
  onAddToSampler?: (column: number, row: number) => Promise<{trackIdx: number; fxIdx: number; name: string} | null>;
  /** Toggle reverse on an RS5K sampler */
  onSamplerSetReverse?: (trackIdx: number, fxIdx: number, reversed: boolean) => Promise<boolean>;
  /** Fetch FX params (for the sampler panel's loop toggle) */
  getFxParams?: (trackIdx: number, fxIdx: number, offset?: number, limit?: number) => Promise<{params: FxParam[]; total: number; offset: number; limit: number}>;
  /** Set an FX param (for the sampler panel's loop toggle) */
  setFxParamValue?: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<unknown>;
  /** Toggle reverse on a clip slot (Issue #75) */
  onSetSlotReverse?: (column: number, row: number, reversed: boolean) => Promise<ClipSlot | null>;
  /** Track arm toggle (Issue #110) */
  onToggleArm?: (trackIdx: number) => void;
  /** Track mute toggle (Issue #110) */
  onToggleMute?: (trackIdx: number) => void;
  /** Track solo toggle (Issue #110) */
  onToggleSolo?: (trackIdx: number) => void;
  /** Track record mode toggle (audio/MIDI) (Issue #110) */
  onToggleRecordMode?: (trackIdx: number) => void;
  /** Navigate to Track view and select this track (Issue #111) */
  onNavigateToTrack?: (trackIdx: number) => void;
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
  onMatrixPlay,
  onMatrixStopAll,
  onMatrixClick,
  onGetTempo,
  onSetTempo,
  onGetTransportState,
  onLaunchPlaytime,
  onCheckPlaytimeAvailable,
  onRecordSlot,
  onRecordSlotCountdown,
  onClearSlot,
  onAddToSampler,
  onSamplerSetReverse,
  getFxParams,
  setFxParamValue,
  onSetSlotReverse,
  onToggleArm,
  onToggleMute,
  onToggleSolo,
  onToggleRecordMode,
  onNavigateToTrack,
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

  // Long-press (500ms) on a non-empty slot → delete confirm; quick tap on the
  // confirming slot → delete. Same gesture as deleting FX cards.
  const [deleteConfirm, setDeleteConfirm] = useState<{col: number; row: number} | null>(null);

  // Record count-in: the selected length (0 = none) and the live countdown
  // per slot, driven by matrix/countdown broadcasts from the extension.
  const [countInBars, setCountInBars] = useState(0);
  const [countdowns, setCountdowns] = useState<Record<string, { bars: number; targetBars: number }>>({});

  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('event:matrix/countdown', (msg: any) => {
      const payload = msg?.payload;
      if (!payload || typeof payload.column !== 'number' || typeof payload.row !== 'number') return;
      const key = `${payload.column},${payload.row}`;
      setCountdowns((prev) => {
        if (!payload.active) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: { bars: payload.bars ?? 0, targetBars: payload.targetBars ?? 0 } };
      });
    });
    return unsub;
  }, [onEvent]);
  // Last sampler track created from a clip (shows the Sampler button)
  const [sampler, setSampler] = useState<{trackIdx: number; fxIdx: number; name: string} | null>(null);
  // Playtime does not report these back, so they are what we last asked
  // for rather than what it is definitely doing.
  const [matrixPlaying, setMatrixPlaying] = useState(false);
  const [clickOn, setClickOn] = useState(false);
  const [tempo, setTempo] = useState<number | null>(null);

  // Read the real metronome state rather than assuming it is off, or the
  // button lies until it happens to be pressed.
  useEffect(() => {
    if (!onMatrixClick) return;
    void onMatrixClick().then(setClickOn);
  }, [onMatrixClick]);
  const [samplerPanelOpen, setSamplerPanelOpen] = useState(false);
  const [samplerBusy, setSamplerBusy] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const handleSlotTap = useCallback(async (col: number, row: number) => {
    // Issue #43: Audio recording workflow
    // When transport recording is active and slot is empty/stopped, start recording.
    // When slot is recording, stop recording.
    // Otherwise (transport not recording or slot already playing), trigger the clip.
    const slot = matrix?.slots.find(s => s.column === col && s.row === row);
    const shouldRecord = recording && slot && (slot.state === 'empty' || slot.state === 'stopped' || slot.state === 'recording');

    if (shouldRecord && onRecordSlot) {
      if (countInBars > 0 && onRecordSlotCountdown) {
        await onRecordSlotCountdown(col, row, countInBars);
      } else {
        await onRecordSlot(col, row);
      }
    } else {
      await triggerSlot(col, row);
    }
    // Issue #80: Refresh matrix after triggering a slot so the grid
    // reflects the new visual state (playing/stopped). Without this,
    // the matrix prop never updates and the grid stays unchanged.
    getMatrix();
  }, [triggerSlot, getMatrix, recording, matrix, onRecordSlot, onRecordSlotCountdown, countInBars]);

  const handleSlotPointerDown = useCallback((col: number, row: number, state: ClipSlot['state']) => {
    longPressTimerRef.current = setTimeout(() => {
      // Long-press: offer delete only for slots that hold a clip
      if (state !== 'empty' && onClearSlot) {
        setDeleteConfirm({ col, row });
      }
      longPressTimerRef.current = null;
    }, 500);
  }, [onClearSlot]);

  const handleSlotPointerUp = useCallback((col: number, row: number) => {
    if (!longPressTimerRef.current) return; // long-press already fired
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    if (deleteConfirm && deleteConfirm.col === col && deleteConfirm.row === row) {
      // Action sheet open for this slot — its buttons handle the tap
      return;
    }
    handleSlotTap(col, row);
  }, [deleteConfirm, onClearSlot, getMatrix, handleSlotTap]);

  const cancelSlotLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleAddToSampler = useCallback(async (col: number, row: number) => {
    if (!onAddToSampler) return;
    setSamplerBusy(true);
    try {
      const info = await onAddToSampler(col, row);
      if (info) {
        setSampler(info);
        setSamplerPanelOpen(true);
      }
    } finally {
      setSamplerBusy(false);
    }
  }, [onAddToSampler]);

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

  // Matrix column N is not REAPER track index N. Playtime names each column's
  // track "Column 1", "Column 2" and so on, and the extension now reports that
  // mapping directly rather than the frontend guessing at it.
  //
  // The guess it replaces excluded any track whose name looked like Helgobox
  // and treated whatever was left as the columns — so an ordinary track in the
  // project became column 0, and every column action pointed somewhere wrong.
  const columnTracks = matrix.columnTracks ?? [];

  // Fallback for an extension that does not report the mapping: exclude
  // anything that looks like the Helgobox control track and take what is left
  // positionally. That is a guess — it treats every unrelated track in the
  // project as a column — which is why the reported mapping wins whenever it
  // is available.
  const fallbackTracks = (tracks ?? []).filter(
    (t) => !/helgobox|realearn|playtime/i.test(t.name ?? ''),
  );

  const trackForColumn = (col: number): Track | undefined => {
    if (columnTracks.length) {
      const mapped = columnTracks.find((c) => c.column === col);
      return mapped ? (tracks ?? []).find((t) => t.index === mapped.trackIdx) : undefined;
    }
    return fallbackTracks[col];
  };

  // Draw only the columns Playtime actually has, when we know what they are.
  const visibleColumns = Array.from(
    { length: columnTracks.length || cols }, (_, col) => col);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Session View
        </h2>
        <div className="flex items-center gap-2">
          {onMatrixPlay && (
            <button
              onClick={async () => { const n = !matrixPlaying; setMatrixPlaying(n); await onMatrixPlay(n); }}
              className={`px-3 py-2 text-xs rounded min-h-[36px] transition-colors ${
                matrixPlaying
                  ? 'bg-[var(--accent-green)]/25 text-[var(--accent-green)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}
              title="Playtime's own playback, separate from REAPER's transport"
            >
              {matrixPlaying ? '■ Matrix' : '▶ Matrix'}
            </button>
          )}
          {onMatrixStopAll && (
            <button
              onClick={() => { setMatrixPlaying(false); void onMatrixStopAll(); }}
              className="px-3 py-2 text-xs rounded min-h-[36px] bg-[var(--bg-tertiary)]
                         text-[var(--text-secondary)] active:brightness-90"
              title="Stop every clip in the matrix"
            >
              Stop all
            </button>
          )}
          {onMatrixClick && (
            <button
              onClick={async () => { setClickOn(await onMatrixClick(!clickOn)); }}
              className={`px-3 py-2 text-xs rounded min-h-[36px] transition-colors ${
                clickOn
                  ? 'bg-[var(--accent-orange)]/25 text-[var(--accent-orange)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}
              title="Playtime's metronome"
            >
              🔔 Metronome
            </button>
          )}
          {onSetTempo && (
            <div className="flex items-center gap-1">
              <input
                type="number" min={20} max={400}
                value={tempo ?? ''}
                placeholder="bpm"
                onFocus={async () => { if (tempo === null && onGetTempo) setTempo(Math.round(await onGetTempo())); }}
                onChange={(e) => setTempo(Number(e.target.value))}
                onBlur={() => { if (tempo && tempo >= 20 && tempo <= 400) void onSetTempo(tempo); }}
                className="w-16 px-2 py-2 text-xs text-center bg-[var(--bg-tertiary)]
                           rounded text-[var(--text-primary)] border-none min-h-[36px]"
                title="Project tempo — Playtime follows it"
              />
            </div>
          )}
          {onRecordSlotCountdown && (
            <select
              aria-label="Record count-in"
              value={countInBars}
              onChange={(e) => setCountInBars(Number(e.target.value))}
              className="px-2 py-2 text-xs bg-[var(--bg-tertiary)] rounded
                         text-[var(--text-primary)] border-none min-h-[36px]"
              title="Count-in before recording a slot (0 = record immediately)"
            >
              <option value={0}>Count-in: none</option>
              <option value={1}>Count-in: 1 bar</option>
              <option value={2}>Count-in: 2 bars</option>
              <option value={4}>Count-in: 4 bars</option>
            </select>
          )}
        <button
          onClick={() => getMatrix()}
          className="p-2 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
          title="Refresh matrix"
        >
          ↻
        </button>
        </div>
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
        <div className="flex-1" />
        {sampler && (
          <button
            onClick={() => setSamplerPanelOpen(true)}
            disabled={samplerBusy}
            className="flex items-center gap-1.5 px-3 h-8 rounded text-xs font-semibold
              bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:brightness-110
              active:brightness-90 transition-all disabled:opacity-50 max-w-[160px]"
            title="Open sampler controls"
            aria-label="Sampler controls"
          >
            🎛 <span className="truncate">{sampler.name}</span>
          </button>
        )}
        {samplerBusy && !sampler && (
          <span className="text-[10px] text-[var(--text-secondary)] animate-pulse px-2">Creating sampler…</span>
        )}
        {onLaunchPlaytime && (
          <button
            onClick={handleLaunchPlaytime}
            disabled={playtimeLaunching}
            className="flex items-center gap-1.5 px-3 h-8 rounded text-xs font-semibold
              bg-[var(--accent-dim)] text-[var(--accent-orange)] hover:brightness-110
              active:brightness-90 transition-all disabled:opacity-50"
            title="Show/hide Playtime 2 window"
            aria-label="Launch Playtime"
          >
            {playtimeLaunching
              ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : '🎹'}
            Playtime
          </button>
        )}
      </div>

      {/* Column headers */}
      {(() => {
        return (
          <div className="px-3 pt-2 border-b border-[var(--border)]">
            <div className="flex gap-px">
              {visibleColumns.map((col) => {
                const track = trackForColumn(col);
                const trackName = track?.name || `Track ${col + 1}`;
                const isArmed = track?.armed ?? false;
                const isMuted = track?.muted ?? false;
                const isSoloed = track?.soloed ?? false;
                const recMode = track?.recMode ?? 0;
                const isMidiMode = recMode >= 7;
                return (
                  <div key={col} className="flex-1 flex flex-col items-center min-w-0 px-px">
                    {/* Track name + nav button */}
                    <div
                      className="w-full flex items-center justify-center gap-0.5 py-1"
                    >
                      <span
                        className="text-[10px] font-semibold text-[var(--text-secondary)] truncate"
                        title={trackName}
                        aria-label={`Column ${col + 1}: ${trackName}`}
                      >
                        {trackName}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigateToTrack?.(track?.index ?? col); }}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] leading-none rounded transition-all active:brightness-90 hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/60 hover:text-[var(--accent-orange)]"
                        aria-label={`Navigate to track ${col + 1}`}
                        title="Go to Track view"
                      >
                        ↗
                      </button>
                    </div>
                    {/* Control buttons row */}
                    <div className="flex items-center gap-px pb-1">
                      {/* Record arm button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleArm?.(track?.index ?? col); }}
                        className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold rounded transition-all active:brightness-90 ${
                          isArmed
                            ? 'bg-[var(--accent-red)]/40 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/50'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/60 hover:bg-[var(--bg-secondary)]'
                        }`}
                        aria-label={`Track ${col + 1} arm toggle`}
                        title={isArmed ? 'Armed' : 'Disarmed'}
                      >
                        R
                      </button>
                      {/* Record mode toggle (A/M) — only visible when armed */}
                      {isArmed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleRecordMode?.(track?.index ?? col); }}
                          className={`w-5 h-5 flex items-center justify-center text-[8px] font-bold rounded transition-all active:brightness-90 ${
                            isMidiMode
                              ? 'bg-[var(--accent-blue)]/30 text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/80 hover:bg-[var(--bg-secondary)]'
                          }`}
                          aria-label={`Track ${col + 1} record mode toggle`}
                          title={isMidiMode ? 'MIDI input' : 'Audio input'}
                        >
                          {isMidiMode ? 'M' : 'A'}
                        </button>
                      )}
                      {/* Mute button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleMute?.(track?.index ?? col); }}
                        className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold rounded transition-all active:brightness-90 ${
                          isMuted
                            ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/60 hover:bg-[var(--bg-secondary)]'
                        }`}
                        aria-label={`Track ${col + 1} mute toggle`}
                        title={isMuted ? 'Muted' : 'Unmuted'}
                      >
                        M
                      </button>
                      {/* Solo button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleSolo?.(track?.index ?? col); }}
                        className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold rounded transition-all active:brightness-90 ${
                          isSoloed
                            ? 'bg-[var(--accent-yellow)]/25 text-[var(--accent-yellow)] ring-1 ring-[var(--accent-yellow)]/40'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/60 hover:bg-[var(--bg-secondary)]'
                        }`}
                        aria-label={`Track ${col + 1} solo toggle`}
                        title={isSoloed ? 'Soloed' : 'Unsoloed'}
                      >
                        S
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="w-8 flex-shrink-0" />
            </div>
          </div>
        );
      })()}

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Tap-outside overlay cancels a pending delete confirm */}
        {deleteConfirm && (
          <div
            className="fixed inset-0 z-10"
            onPointerDown={() => setDeleteConfirm(null)}
          />
        )}
        <div className="flex flex-col gap-px">
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex gap-px">
              {visibleColumns.map((col) => {
                const slot = slotMap.get(`${col},${row}`);
                const state = slot?.state ?? 'empty';
                const name = slot?.name ?? '';
                const clipType = slot?.clipType ?? 'none';
                const isConfirmingDelete = deleteConfirm?.col === col && deleteConfirm?.row === row;
                const countdown = countdowns[`${col},${row}`];
                return (
                  <button
                    key={col}
                    onPointerDown={() => handleSlotPointerDown(col, row, state)}
                    onPointerUp={() => handleSlotPointerUp(col, row)}
                    onPointerLeave={cancelSlotLongPress}
                    onPointerCancel={cancelSlotLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`
                      relative flex-1 flex flex-col items-center justify-center
                      aspect-square min-h-[44px]
                      transition-all duration-75 cursor-pointer overflow-hidden select-none
                      ${isConfirmingDelete ? 'z-20 ring-2 ring-[var(--accent-red)] bg-[var(--accent-red)]/15' : ''}
                      ${!isConfirmingDelete && state === 'empty' ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]' : ''}
                      ${!isConfirmingDelete && state === 'stopped' ? 'bg-[var(--accent-dim)]/20 hover:bg-[var(--accent-dim)]/30 text-[var(--text-primary)]' : ''}
                      ${!isConfirmingDelete && state === 'playing' ? 'bg-[var(--accent-green)] text-black hover:brightness-110' : ''}
                      ${!isConfirmingDelete && state === 'recording' ? 'bg-[var(--accent-red)] text-black animate-pulse hover:brightness-110' : ''}
                      active:brightness-90
                    `}
                    aria-label={`Slot ${col + 1},${row + 1}`}
                  >
                    {isConfirmingDelete ? (
                      <div
                        className="flex items-center justify-center gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        {slot?.hasSource && onAddToSampler && (
                          <button
                            onClick={() => { setDeleteConfirm(null); handleAddToSampler(col, row); }}
                            className="w-8 h-8 flex items-center justify-center rounded bg-[var(--accent-green)]/25 text-sm active:brightness-90"
                            aria-label={`Send slot ${col + 1},${row + 1} to sampler`}
                            title="Bounce to RS5K sampler"
                          >
                            🎹
                          </button>
                        )}
                        <button
                          onClick={() => { setDeleteConfirm(null); onClearSlot?.(col, row).then(() => getMatrix()); }}
                          className="w-8 h-8 flex items-center justify-center rounded bg-[var(--accent-red)]/25 text-sm text-[var(--accent-red)] active:brightness-90"
                          aria-label={`Delete slot ${col + 1},${row + 1}`}
                          title="Delete clip"
                        >
                          ✕
                        </button>
                      </div>
                    ) : countdown ? (
                      /* Record count-in — recording starts when this hits 0 */
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center
                          bg-[var(--bg-primary)]/80 text-[var(--accent-red)]"
                        aria-label={`Record count-in ${countdown.bars}`}
                      >
                        <span className="text-3xl font-bold leading-none">{countdown.bars}</span>
                        <span className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">
                          {countdown.bars === 1 ? 'bar' : 'bars'}
                        </span>
                      </div>
                    ) : (
                      <>
                    {clipType === 'midi' && <span className="text-[10px] opacity-50">♪</span>}
                    {clipType === 'audio' && <span className="text-[10px] opacity-50">🔊</span>}
                    {name && (
                      <span className="text-[9px] leading-tight text-center px-0.5 truncate w-full mt-0.5">
                        {name}
                      </span>
                    )}
                    {state !== 'empty' && onSetSlotReverse && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
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
                      </>
                    )}
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

      {/* Sampler controls panel */}
      {samplerPanelOpen && sampler && (
        <SamplerPanel
          sampler={sampler}
          getFxParams={getFxParams}
          setFxParamValue={setFxParamValue}
          onSetReverse={onSamplerSetReverse}
          onClose={() => setSamplerPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ── Sampler Panel — minimal RS5K controls (loop / reverse) ──────

interface SamplerPanelProps {
  sampler: {trackIdx: number; fxIdx: number; name: string};
  getFxParams?: (trackIdx: number, fxIdx: number, offset?: number, limit?: number) => Promise<{params: FxParam[]; total: number; offset: number; limit: number}>;
  setFxParamValue?: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<unknown>;
  onSetReverse?: (trackIdx: number, fxIdx: number, reversed: boolean) => Promise<boolean>;
  onClose: () => void;
}

function SamplerPanel({ sampler, getFxParams, setFxParamValue, onSetReverse, onClose }: SamplerPanelProps) {
  const [params, setParams] = useState<FxParam[]>([]);
  const [reversed, setReversed] = useState(false);
  const [reverseBusy, setReverseBusy] = useState(false);

  useEffect(() => {
    if (!getFxParams) return;
    getFxParams(sampler.trackIdx, sampler.fxIdx, 0, 32)
      .then((r) => setParams(r.params))
      .catch(() => setParams([]));
  }, [getFxParams, sampler.trackIdx, sampler.fxIdx]);

  // RS5K toggles discovered by name so we don't depend on param indices
  const findParam = (needle: string) =>
    params.find((p) => p.name.toLowerCase().includes(needle)) ?? null;
  const loopParam = findParam('loop');
  const obeyParam = findParam('obey');

  const toggleParam = useCallback(async (param: FxParam) => {
    if (!setFxParamValue) return;
    const isOn = param.value > (param.min + param.max) / 2;
    const next = isOn ? param.min : param.max;
    await setFxParamValue(sampler.trackIdx, sampler.fxIdx, param.index, next);
    setParams((prev) => prev.map((p) => (p.index === param.index ? { ...p, value: next } : p)));
  }, [setFxParamValue, sampler.trackIdx, sampler.fxIdx]);

  const toggleReverse = useCallback(async () => {
    if (!onSetReverse || reverseBusy) return;
    setReverseBusy(true);
    try {
      const ok = await onSetReverse(sampler.trackIdx, sampler.fxIdx, !reversed);
      if (ok) setReversed(!reversed);
    } finally {
      setReverseBusy(false);
    }
  }, [onSetReverse, reverseBusy, reversed, sampler.trackIdx, sampler.fxIdx]);

  const toggleButton = (label: string, on: boolean, onClick: () => void, busy = false) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-4 py-2.5 text-sm font-medium transition-all active:brightness-90 disabled:opacity-50 ${
        on
          ? 'bg-[var(--accent-green)]/25 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
      }`}
    >
      {busy ? '…' : label}
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/40" onPointerDown={onClose} />
      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-secondary)] border-t border-[var(--border)] p-4 space-y-3 safe-area-bottom">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold truncate">🎛 {sampler.name}</h3>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1"
            aria-label="Close sampler panel"
          >
            ✕
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          MIDI-armed — play any key to pitch the sample (original at C4).
        </p>
        <div className="flex flex-wrap gap-2">
          {loopParam && toggleButton(
            'Loop',
            loopParam.value > (loopParam.min + loopParam.max) / 2,
            () => toggleParam(loopParam),
          )}
          {obeyParam && toggleButton(
            'Obey note-offs',
            obeyParam.value > (obeyParam.min + obeyParam.max) / 2,
            () => toggleParam(obeyParam),
          )}
          {onSetReverse && toggleButton('↔ Reverse', reversed, toggleReverse, reverseBusy)}
        </div>
      </div>
    </>
  );
}

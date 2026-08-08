import { useState, useEffect, useCallback, useRef } from 'react';
import type { FxParam, FxPresetInfo, FxPresetNames } from '../hooks/useReaper';
import { useLiveSlider } from '../hooks/useLiveSlider';

// ── Types ────────────────────────────────────────────────────

import type { WsResponse } from '../lib/wsClient';

interface ParamControlProps {
  trackIdx: number;
  trackName: string;
  fxIdx: number;
  fxName: string;
  getFxParams: (trackIdx: number, fxIdx: number, offset?: number, limit?: number) => Promise<{params: FxParam[]; total: number; offset: number; limit: number}>;
  setFxParam: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<WsResponse>;
  deleteFx: (trackIdx: number, fxIdx: number) => Promise<boolean>;
  onEvent: (pattern: string, handler: (data: unknown) => void) => () => void;
  onBack: () => void;
  getFxPreset?: (trackIdx: number, fxIdx: number) => Promise<FxPresetInfo | null>;
  setFxPreset?: (trackIdx: number, fxIdx: number, presetIdx: number) => Promise<FxPresetInfo | null>;
  getAllFxPresetNames?: (trackIdx: number, fxIdx: number) => Promise<FxPresetNames | null>;
}

// Clean FX name for display
function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '');
}

// ── Component ─────────────────────────────────────────────────

export function ParamControl({
  trackIdx,
  trackName,
  fxIdx,
  fxName,
  getFxParams,
  setFxParam,
  deleteFx,
  onEvent,
  onBack,
  getFxPreset,
  setFxPreset,
  getAllFxPresetNames,
}: ParamControlProps) {
  const [params, setParams] = useState<FxParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [paramOffset, setParamOffset] = useState(0);
  const [totalParams, setTotalParams] = useState(0);
  const PAGE_SIZE = 32;
  const draggingParamRef = useRef<number | null>(null);

  // ── Preset state ──
  const [presetInfo, setPresetInfo] = useState<FxPresetInfo | null>(null);
  const [presetLoading, setPresetLoading] = useState(true);
  const [presetNames, setPresetNames] = useState<string[] | null>(null);
  const [presetSearchOpen, setPresetSearchOpen] = useState(false);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const presetDropdownRef = useRef<HTMLDivElement>(null);
  // Load preset info on mount or when trackIdx/fxIdx changes
  // Use a callback ref pattern to avoid setState directly in effect
  const getFxPresetRef = useRef(getFxPreset);
  useEffect(() => { getFxPresetRef.current = getFxPreset; });

  useEffect(() => {
    const ref = getFxPresetRef.current;
    if (!ref) return;
    ref(trackIdx, fxIdx).then((info) => {
      setPresetInfo(info);
      setPresetLoading(false);
      setPresetSearchOpen(false);
      setPresetSearchQuery('');
      setPresetNames(null);
    }).catch(() => {
      setPresetInfo(null);
      setPresetLoading(false);
      setPresetSearchOpen(false);
      setPresetSearchQuery('');
      setPresetNames(null);
    });
  }, [trackIdx, fxIdx, getFxPresetRef]);

  // Filter presets based on search query
  const filteredPresets = presetNames && presetSearchQuery
    ? presetNames
        .map((name, idx) => ({ name, idx }))
        .filter((p) => p.name.toLowerCase().includes(presetSearchQuery.toLowerCase()))
    : presetNames
        ? presetNames.map((name, idx) => ({ name, idx }))
        : [];

  // Load params on mount + subscribe to real-time updates
  const loadParams = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFxParams(trackIdx, fxIdx, offset, PAGE_SIZE);
      setParams(result.params);
      setTotalParams(result.total);
      setParamOffset(result.offset);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parameters');
      setLoading(false);
    }
  }, [trackIdx, fxIdx, getFxParams]);

  useEffect(() => {
    // Schedule initial load — setLoading(true) inside loadParams is intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadParams(0);
  }, [loadParams]);

  const goNextPage = useCallback(() => {
    const next = paramOffset + PAGE_SIZE;
    if (next < totalParams) loadParams(next);
  }, [paramOffset, totalParams, loadParams]);

  const goPrevPage = useCallback(() => {
    const prev = Math.max(0, paramOffset - PAGE_SIZE);
    loadParams(prev);
  }, [paramOffset, loadParams]);

  // ── Preset handlers ──

  const handlePrevPreset = useCallback(() => {
    if (!presetInfo || !setFxPreset || presetInfo.numPresets <= 0) return;
    let newIdx = presetInfo.presetIndex - 1;
    if (newIdx < 0) newIdx = presetInfo.numPresets - 1;
    setFxPreset(trackIdx, fxIdx, newIdx).then((info) => {
      if (info) setPresetInfo(info);
      // Re-fetch params since they may change with preset
      loadParams(paramOffset);
    });
  }, [presetInfo, setFxPreset, trackIdx, fxIdx, paramOffset, loadParams]);

  const handleNextPreset = useCallback(() => {
    if (!presetInfo || !setFxPreset || presetInfo.numPresets <= 0) return;
    let newIdx = presetInfo.presetIndex + 1;
    if (newIdx >= presetInfo.numPresets) newIdx = 0;
    setFxPreset(trackIdx, fxIdx, newIdx).then((info) => {
      if (info) setPresetInfo(info);
      // Re-fetch params since they may change with preset
      loadParams(paramOffset);
    });
  }, [presetInfo, setFxPreset, trackIdx, fxIdx, paramOffset, loadParams]);

  const handleSelectPreset = useCallback(async (idx: number) => {
    if (!setFxPreset) return;
    const info = await setFxPreset(trackIdx, fxIdx, idx);
    if (info) {
      setPresetInfo(info);
      setPresetSearchOpen(false);
      setPresetSearchQuery('');
      loadParams(paramOffset);
    }
  }, [setFxPreset, trackIdx, fxIdx, paramOffset, loadParams]);

  const handleToggleSearch = useCallback(async () => {
    if (presetSearchOpen) {
      setPresetSearchOpen(false);
      setPresetSearchQuery('');
      return;
    }
    setPresetSearchOpen(true);
    // Fetch all preset names if not already cached
    if (presetNames === null && getAllFxPresetNames) {
      try {
        const data = await getAllFxPresetNames(trackIdx, fxIdx);
        if (data) {
          setPresetNames(data.presetNames);
        } else if (presetInfo && presetInfo.numPresets > 0) {
          setPresetNames(Array.from({ length: presetInfo.numPresets }, (_, i) => `Preset ${i + 1}`));
        }
      } catch {
        if (presetInfo && presetInfo.numPresets > 0) {
          setPresetNames(Array.from({ length: presetInfo.numPresets }, (_, i) => `Preset ${i + 1}`));
        }
      }
    }
  }, [presetSearchOpen, presetNames, getAllFxPresetNames, trackIdx, fxIdx, presetInfo]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetSearchOpen(false);
        setPresetSearchQuery('');
      }
    };
    if (presetSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [presetSearchOpen]);

  // Subscribe to real-time param change events (Issue #52)
  // While dragging a param, ignore events for that param to avoid
  // slider jumping (optimistic update vs server event race, Issue #73)
  useEffect(() => {
    const unsubscribe = onEvent('event:fx_param_changed', (msg: unknown) => {
      const m = msg as Record<string, unknown>;
      const payload = m.payload as Record<string, unknown> || {};
      const eventTrack = payload.trackIdx as number;
      const eventFx = payload.fxIdx as number;
      const changedParams = payload.params as Array<Record<string, unknown>>;
      if (eventTrack === trackIdx && eventFx === fxIdx && Array.isArray(changedParams)) {
        setParams((prev) =>
          prev.map((p) => {
            const changed = changedParams.find((cp) => cp.index === p.index);
            // Skip event updates for the param currently being dragged
            if (changed && draggingParamRef.current === p.index) return p;
            return changed ? {
              ...p,
              value: changed.value as number,
              min: changed.min as number,
              max: changed.max as number,
              mid: changed.mid as number,
              formatted: changed.formatted as string | undefined,
            } : p;
          }),
        );
      }
    });
    return unsubscribe;
  }, [trackIdx, fxIdx, onEvent]);

  const dragCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start dragging a specific param — sets the drag guard that prevents
  // real-time fx_param_changed events from clobbering the slider position
  const startDragging = useCallback((paramIdx: number) => {
    draggingParamRef.current = paramIdx;
    if (dragCleanupTimeoutRef.current) {
      clearTimeout(dragCleanupTimeoutRef.current);
      dragCleanupTimeoutRef.current = null;
    }
  }, []);

  // End dragging a param — after a short debounce to allow the final
  // server response to arrive, clears the drag guard so real-time events
  // flow again.
  const finishDragging = useCallback(() => {
    if (dragCleanupTimeoutRef.current) {
      clearTimeout(dragCleanupTimeoutRef.current);
    }
    // Short debounce: wait for any in-flight setFxParam response to arrive
    // before re-enabling fx_param_changed event processing
    dragCleanupTimeoutRef.current = setTimeout(() => {
      draggingParamRef.current = null;
      dragCleanupTimeoutRef.current = null;
    }, 150);
  }, []);

  const handleParamChange = useCallback(
    async (paramIdx: number, value: number) => {
      // Optimistic update for immediate visual feedback
      setParams((prev) =>
        prev.map((p) => (p.index === paramIdx ? { ...p, value } : p)),
      );

      const resp = await setFxParam(trackIdx, fxIdx, paramIdx, value);
      // If server returned a committed value, use it (authoritative)
      if (resp?.payload?.value !== undefined) {
        setParams((prev) =>
          prev.map((p) => {
            if (p.index !== paramIdx) return p;
            const update: Partial<typeof p> = { value: resp.payload.value as number };
            if (resp.payload.formatted !== undefined) {
              update.formatted = resp.payload.formatted as string;
            }
            return { ...p, ...update };
          }),
        );
      }
    },
    [trackIdx, fxIdx, setFxParam],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteFx(trackIdx, fxIdx);
      onBack(); // Go back to FX browser
    } catch (err) {
      console.error('Failed to delete FX:', err);
      setDeleting(false);
    }
  }, [trackIdx, fxIdx, deleteFx, onBack]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:brightness-95 flex-shrink-0"
            aria-label="Back"
          >
            ← Back
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              {cleanFxName(fxName)}
            </h2>
            <p className="text-[10px] text-[var(--text-secondary)] truncate">
              Track: {trackName || `Track ${trackIdx + 1}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-medium
              bg-[var(--accent-red)]/15 text-[var(--accent-red)]
              active:brightness-95 transition-all disabled:opacity-50"
          >
            {deleting ? '...' : 'Remove FX'}
          </button>
        </div>
      </div>

      {/* ── Preset Bar ── */}
      {(getFxPreset || setFxPreset) && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          {presetLoading ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">Presets:</span>
              <div className="h-4 w-24 bg-[var(--bg-tertiary)] animate-pulse rounded" />
            </div>
          ) : !presetInfo || presetInfo.numPresets <= 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">Presets:</span>
              <span className="text-xs text-[var(--text-tertiary)]">—  No presets  —</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 relative" ref={presetDropdownRef}>
              <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">Preset:</span>
              <button
                onClick={handlePrevPreset}
                className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                  active:brightness-95 transition-colors hover:bg-[var(--bg-tertiary)]/80"
                aria-label="Previous preset"
              >
                ◀
              </button>
              <button
                onClick={() => handleSelectPreset(presetInfo.presetIndex)}
                className="flex-1 min-w-0 text-xs text-center truncate px-2 py-1
                  bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                  active:brightness-95 transition-colors hover:bg-[var(--bg-tertiary)]/80"
                title={presetInfo.presetName || `Preset ${presetInfo.presetIndex}`}
              >
                {presetInfo.presetName || `Preset ${presetInfo.presetIndex + 1}`}
              </button>
              <button
                onClick={handleNextPreset}
                className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                  active:brightness-95 transition-colors hover:bg-[var(--bg-tertiary)]/80"
                aria-label="Next preset"
              >
                ▶
              </button>
              <button
                onClick={handleToggleSearch}
                className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
                  active:brightness-95 transition-colors hover:bg-[var(--bg-tertiary)]/80"
                aria-label="Search presets"
              >
                🔍
              </button>

              {/* Preset search dropdown */}
              {presetSearchOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--bg-primary)]
                  border border-[var(--border)] shadow-lg max-h-48 overflow-y-auto"
                >
                  <div className="sticky top-0 bg-[var(--bg-primary)] p-1 border-b border-[var(--border)]">
                    <input
                      type="text"
                      value={presetSearchQuery}
                      onChange={(e) => setPresetSearchQuery(e.target.value)}
                      placeholder="Search presets..."
                      className="w-full px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                        border border-[var(--border)] outline-none placeholder-[var(--text-tertiary)]"
                      autoFocus
                    />
                  </div>
                  {filteredPresets.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[var(--text-tertiary)] text-center">
                      No matching presets
                    </div>
                  ) : (
                    filteredPresets.map((p) => (
                      <button
                        key={p.idx}
                        onClick={() => handleSelectPreset(p.idx)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                          ${p.idx === presetInfo?.presetIndex
                            ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]'
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                          }`}
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
            <div className="text-4xl animate-pulse">⚙️</div>
            <p className="text-sm">Loading parameters...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                getFxParams(trackIdx, fxIdx, 0, 32)
                  .then((r) => { setParams(r.params); setTotalParams(r.total); setParamOffset(r.offset); })
                  .catch((err) => setError(err.message))
                  .finally(() => setLoading(false));
              }}
              className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : params.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-5xl mb-2">🎚️</div>
            <p className="text-sm">No adjustable parameters</p>
            <p className="text-xs">This plugin has no parameters exposed</p>
          </div>
        ) : (
          <>
            {/* Page indicator */}
            {totalParams > PAGE_SIZE && (
              <div className="flex items-center justify-between px-2 pb-2">
                <button
                  onClick={goPrevPage}
                  disabled={paramOffset === 0}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)]
                    text-[var(--text-secondary)] disabled:opacity-30 active:brightness-95"
                >
                  ← Prev
                </button>
                <span className="text-xs text-[var(--text-secondary)]">
                  {paramOffset + 1}–{Math.min(paramOffset + PAGE_SIZE, totalParams)} of {totalParams}
                </span>
                <button
                  onClick={goNextPage}
                  disabled={paramOffset + PAGE_SIZE >= totalParams}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)]
                    text-[var(--text-secondary)] disabled:opacity-30 active:brightness-95"
                >
                  Next →
                </button>
              </div>
            )}
            <div className="space-y-3">
              {params.map((param) => (
                <ParamSlider
                  key={param.index}
                  param={param}
                  onChange={(value) => handleParamChange(param.index, value)}
                  onDragStart={startDragging}
                  onDragEnd={finishDragging}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Parameter Slider ─────────────────────────────────────────

export interface ParamSliderProps {
  param: FxParam;
  onChange: (value: number) => void;
  onDragStart: (paramIdx: number) => void;
  onDragEnd: () => void;
}

export function ParamSlider({ param, onChange, onDragStart, onDragEnd }: ParamSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Shows the finger's position while dragging and REAPER's the rest of the
  // time, and gates sends to one in flight at a time. Previously this fired a
  // command on every pointermove — ~120/sec on an iPad, against an extension
  // that reads ~30/sec — so a drag built a backlog that carried on applying
  // for seconds after the finger lifted.
  const { value: effectiveValue, change, release } = useLiveSlider(param.value, onChange);

  // Tears down the active drag's window listeners. Held in a ref so the
  // unmount cleanup below can reach it — a slider destroyed mid-gesture
  // (page turned, FX closed, track collapsed) leaks exactly the same way a
  // cancelled gesture used to.
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { detachRef.current?.(); }, []);

  const normalized = (effectiveValue - param.min) / (param.max - param.min);
  const pct = Math.max(0, Math.min(100, normalized * 100));

  // Format display value — prefer server-provided formatted string
  // (e.g. "50.0%", "-6.0 dB") over client-side computation (Issue #73)
  // Server uses TrackFX_GetFormattedParamValue for authoritative display.
  const displayValue = param.formatted || formatParamValue(effectiveValue, param.name, param.min, param.max);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      // Notify parent that we started dragging THIS param — sets the guard
      // that prevents real-time fx_param_changed events from overwriting
      onDragStart(param.index);
      setDragging(true);

      const slider = trackRef.current;
      if (!slider) return;

      // Defensive: never leave two drags running on one slider.
      detachRef.current?.();

      const rect = slider.getBoundingClientRect();
      const pointerId = e.pointerId;
      let didMove = false;

      const valueAt = (clientX: number) => {
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        return param.min + (x / rect.width) * (param.max - param.min);
      };

      let detach = () => {};

      const handlePointerMove = (ev: PointerEvent) => {
        // Only the finger that started this drag drives this slider. Without
        // this, any other pointer on the page moves it too.
        if (ev.pointerId !== pointerId) return;
        didMove = true;
        // Always moves the slider; only sends when the previous send has
        // been answered. The final position is sent regardless.
        change(valueAt(ev.clientX));
      };

      const handlePointerUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        setDragging(false);
        detach();

        // Notify parent that drag ended — will schedule cleanup of the
        // drag guard after a short debounce to let the final server response
        // arrive. Prevents stale fx_param_changed events from overwriting
        // the value before the response comes back (Issue #73 fix).
        onDragEnd();

        // If no movement happened, treat as a tap (jump to position)
        if (!didMove) change(valueAt(ev.clientX));
        release();
      };

      // iOS fires pointercancel — not pointerup — when the scrolling
      // parameter list claims the gesture. That path used to end the drag
      // without ever tearing these listeners down, so the abandoned slider
      // kept receiving every pointermove on the page: drag any other slider
      // afterwards and this one moved too, sending fx/setParam for a
      // parameter nobody was touching (#138).
      const handlePointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        setDragging(false);
        detach();
        onDragEnd();
        release();
      };

      detach = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
        detachRef.current = null;
      };
      detachRef.current = detach;

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    },
    [param.min, param.max, param.index, change, release, onDragStart, onDragEnd],
  );

  // Double-tap to reset to mid value
  const handleDoubleTap = useCallback(() => {
    const midValue = param.mid >= param.min && param.mid <= param.max ? param.mid : (param.min + param.max) / 2;
    change(midValue);
    release();
  }, [param.mid, param.min, param.max, change, release]);

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">
          {param.name || `Param ${param.index}`}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)] tabular-nums flex-shrink-0 ml-2">
          {displayValue}
        </span>
      </div>

      {/* Slider track — square corners per design spec */}
      <div
        ref={trackRef}
        className={`
          relative h-8 overflow-hidden cursor-pointer select-none touch-pan-y
          transition-shadow
          ${dragging ? 'ring-2 ring-[var(--accent-orange)]/60' : 'ring-1 ring-[var(--border)]'}
          bg-[var(--bg-tertiary)]
        `}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleTap}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--accent-orange)]/40 to-[var(--accent-orange)]/60 transition-[width] duration-50"
          style={{ width: `${pct}%` }}
        />

        {/* Knob indicator */}
        <div
          className="absolute top-1 bottom-1 w-1 bg-[var(--accent-orange)]/80 transition-[left] duration-50"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
    </div>
  );
}

// ── Display value formatting ──────────────────────────────────

function formatParamValue(value: number, paramName: string, min: number, max: number): string {
  const lower = paramName.toLowerCase();
  const range = max - min;

  // Value is the actual display value (converted from normalized by backend)
  // For volume/gain/dB params: value IS the dB value
  if (lower.includes('db') || lower.includes('gain') || lower.includes('volume')) {
    return `${value.toFixed(1)} dB`;
  }

  if (lower.includes('hz') || lower.includes('freq') || lower.includes('cutoff')) {
    return `${value.toFixed(0)} Hz`;
  }

  if (lower.includes('ms') || lower.includes('time') || lower.includes('delay')) {
    if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
    return `${value.toFixed(1)} s`;
  }

  // Percentage/bliend/mix params: if range is 0-1, scale to 0-100
  if (lower.includes('%') || lower.includes('wet') || lower.includes('dry') || lower.includes('mix')) {
    const pct = range <= 1 ? value * 100 : value;
    return `${pct.toFixed(0)}%`;
  }

  if (lower.includes('q') || lower.includes('ratio')) {
    return value.toFixed(2);
  }

  if (lower.includes('pan') || lower.includes('balance')) {
    const pct = value.toFixed(0);
    const side = parseFloat(pct) < 0 ? 'L' : parseFloat(pct) > 0 ? 'R' : 'C';
    return `${pct}% ${side}`;
  }

  // Default: show actual value
  // If range is 0-1, this is a normalized internal param — show 3 decimal places
  if (range <= 1) {
    return value.toFixed(3);
  }
  if (value > 100 || value < -100) {
    return value.toFixed(0);
  }
  if (value >= 1 || value <= 0) {
    return value.toFixed(3);
  }
  return value.toFixed(2);
}

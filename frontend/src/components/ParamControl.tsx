import { useState, useEffect, useCallback, useRef } from 'react';
import type { FxParam } from '../hooks/useReaper';

// ── Types ────────────────────────────────────────────────────

interface ParamControlProps {
  trackIdx: number;
  trackName: string;
  fxIdx: number;
  fxName: string;
  getFxParams: (trackIdx: number, fxIdx: number) => Promise<FxParam[]>;
  setFxParam: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<any>;
  deleteFx: (trackIdx: number, fxIdx: number) => Promise<any>;
  onEvent: (pattern: string, handler: (data: any) => void) => () => void;
  onBack: () => void;
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
}: ParamControlProps) {
  const [params, setParams] = useState<FxParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const draggingParamRef = useRef<number | null>(null);

  // Load params on mount + subscribe to real-time updates
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFxParams(trackIdx, fxIdx)
      .then((p) => {
        if (!cancelled) {
          setParams(p);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load parameters');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [trackIdx, fxIdx, getFxParams]);

  // Subscribe to real-time param change events (Issue #52)
  // While dragging a param, ignore events for that param to avoid
  // slider jumping (optimistic update vs server event race, Issue #73)
  useEffect(() => {
    const unsubscribe = onEvent('event:fx_param_changed', (msg: any) => {
      const { trackIdx: eventTrack, fxIdx: eventFx, params: changedParams } = msg.payload || {};
      if (eventTrack === trackIdx && eventFx === fxIdx && Array.isArray(changedParams)) {
        setParams((prev) =>
          prev.map((p) => {
            const changed = changedParams.find((cp: any) => cp.index === p.index);
            // Skip event updates for the param currently being dragged
            if (changed && draggingParamRef.current === p.index) return p;
            return changed ? { ...p, value: changed.value, min: changed.min, max: changed.max, mid: changed.mid } : p;
          }),
        );
      }
    });
    return unsubscribe;
  }, [trackIdx, fxIdx, onEvent]);

  const handleParamChange = useCallback(
    async (paramIdx: number, value: number) => {
      // Optimistic update for immediate visual feedback
      setParams((prev) =>
        prev.map((p) => (p.index === paramIdx ? { ...p, value } : p)),
      );
      const resp = await setFxParam(trackIdx, fxIdx, paramIdx, value);
      // If server returned a committed value, use it (corrects rounding)
      if (resp?.payload?.value !== undefined) {
        setParams((prev) =>
          prev.map((p) => (p.index === paramIdx ? { ...p, value: resp.payload.value as number } : p)),
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
                getFxParams(trackIdx, fxIdx)
                  .then(setParams)
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
          <div className="space-y-3">
            {params.map((param) => (
              <ParamSlider
                key={param.index}
                param={param}
                onChange={(value) => handleParamChange(param.index, value)}
                draggingParamRef={draggingParamRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Parameter Slider ─────────────────────────────────────────

interface ParamSliderProps {
  param: FxParam;
  onChange: (value: number) => void;
  draggingParamRef: React.MutableRefObject<number | null>;
}

function ParamSlider({ param, onChange, draggingParamRef }: ParamSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localValue, setLocalValue] = useState(param.value);

  // Sync with external value when not dragging
  useEffect(() => {
    if (!dragging) {
      setLocalValue(param.value);
    }
  }, [param.value, dragging]);

  const normalized = (localValue - param.min) / (param.max - param.min);
  const pct = Math.max(0, Math.min(100, normalized * 100));

  // Format display value
  const displayValue = formatParamValue(localValue, param.name);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingParamRef.current = param.index;
      setDragging(true);

      const slider = trackRef.current;
      if (!slider) return;
      const rect = slider.getBoundingClientRect();
      let didMove = false;

      const handlePointerMove = (ev: PointerEvent) => {
        didMove = true;
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const raw = x / rect.width;
        const value = param.min + raw * (param.max - param.min);
        setLocalValue(value);
        onChange(value);
      };

      const handlePointerUp = (ev: PointerEvent) => {
        setDragging(false);
        draggingParamRef.current = null;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        // If no movement happened, treat as a tap (jump to position)
        if (!didMove) {
          const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
          const raw = x / rect.width;
          const value = param.min + raw * (param.max - param.min);
          setLocalValue(value);
          onChange(value);
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [param.min, param.max, onChange],
  );

  // Double-tap to reset to mid value
  const handleDoubleTap = useCallback(() => {
    const midValue = param.mid >= param.min && param.mid <= param.max ? param.mid : (param.min + param.max) / 2;
    setLocalValue(midValue);
    onChange(midValue);
  }, [param.mid, param.min, param.max, onChange]);

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
          relative h-8 overflow-hidden cursor-pointer select-none
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

function formatParamValue(value: number, paramName: string): string {
  const lower = paramName.toLowerCase();

  // Value is now the actual display value (converted from normalized by backend)
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

  if (lower.includes('%') || lower.includes('wet') || lower.includes('dry') || lower.includes('mix')) {
    return `${value.toFixed(0)}%`;
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
  if (value > 100 || value < -100) {
    return value.toFixed(0);
  }
  if (value >= 1 || value <= 0) {
    return value.toFixed(3);
  }
  return value.toFixed(2);
}

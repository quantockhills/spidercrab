import { useState, useEffect, useCallback, useRef } from 'react';
import { useSampler, type SamplerTrimInfo, type SamplerVelInfo } from '../hooks/useSampler';

// ── Props ──────────────────────────────────────────────

interface SamplerPanelProps {
  trackIdx: number;
  trackName: string;
  fxIdx: number;
  fxName: string;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────

export default function SamplerPanel({
  trackIdx,
  trackName,
  fxIdx,
  fxName,
  onBack,
}: SamplerPanelProps) {
  const { getTrimInfo, setTrimStart, setTrimEnd, getVelocityInfo, setVelocity } = useSampler();

  const [trimInfo, setTrimInfo] = useState<SamplerTrimInfo | null>(null);
  const [velInfo, setVelInfo] = useState<SamplerVelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse trim values — RS5K returns values in beats as strings
  // Normalized to 0.0–1.0 for slider display
  const [startVal, setStartVal] = useState(0);
  const [endVal, setEndVal] = useState(100);
  const [draggingStart, setDraggingStart] = useState(false);
  const [draggingEnd, setDraggingEnd] = useState(false);

  const MAX_BEATS = 64; // Reasonable cap for trim range

  // Velocity sensitivity slider state
  const [velValue, setVelValue] = useState(0);
  const [draggingVel, setDraggingVel] = useState(false);
  const velTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      const [trim, vel] = await Promise.all([
        getTrimInfo(trackIdx, fxIdx),
        getVelocityInfo(trackIdx, fxIdx),
      ]);
      if (cancelled) return;
      if (trim) {
        setTrimInfo(trim);
        // Parse start/end offset values from strings
        const startBeats = parseFloat(trim.startOffset) || 0;
        const endBeats = parseFloat(trim.endOffset) || MAX_BEATS;
        // Clamp and normalize to percentage for sliders
        setStartVal(Math.round((startBeats / MAX_BEATS) * 100));
        setEndVal(Math.round((endBeats / MAX_BEATS) * 100));
      }
      if (vel) {
        setVelInfo(vel);
        // Normalize vel value to percentage for slider
        const range = vel.max - vel.min;
        if (range > 0) {
          setVelValue(Math.round(((vel.value - vel.min) / range) * 100));
        } else {
          setVelValue(0);
        }
      }
      setLoading(false);
    };

    loadData().catch(() => {
      if (!cancelled) {
        setError('Failed to load sampler data');
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [trackIdx, fxIdx, getTrimInfo, getVelocityInfo]);

  // Debounce trim start commit
  const commitStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStartChange = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(endVal - 1, pct));
    setStartVal(clamped);
    const beats = (clamped / 100) * MAX_BEATS;
    // Debounce backend call
    if (commitStartRef.current) clearTimeout(commitStartRef.current);
    commitStartRef.current = setTimeout(() => {
      setTrimStart(trackIdx, fxIdx, beats);
    }, 200);
  }, [endVal, trackIdx, fxIdx, setTrimStart]);

  // Debounce trim end commit
  const commitEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEndChange = useCallback((pct: number) => {
    const clamped = Math.max(startVal + 1, Math.min(100, pct));
    setEndVal(clamped);
    const beats = (clamped / 100) * MAX_BEATS;
    if (commitEndRef.current) clearTimeout(commitEndRef.current);
    commitEndRef.current = setTimeout(() => {
      setTrimEnd(trackIdx, fxIdx, beats);
    }, 200);
  }, [startVal, trackIdx, fxIdx, setTrimEnd]);

  // Debounce velocity commit
  const commitVelRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (commitStartRef.current) clearTimeout(commitStartRef.current);
      if (commitEndRef.current) clearTimeout(commitEndRef.current);
      if (commitVelRef.current) clearTimeout(commitVelRef.current);
    };
  }, []);

  // Pointer drag handlers for start slider
  const startTrackRef = useRef<HTMLDivElement>(null);

  const handleStartPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDraggingStart(true);
    const slider = startTrackRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
      const pct = Math.round((x / rect.width) * 100);
      handleStartChange(pct);
    };

    const up = () => {
      setDraggingStart(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [handleStartChange]);

  // Pointer drag handlers for end slider
  const endTrackRef = useRef<HTMLDivElement>(null);

  const handleEndPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDraggingEnd(true);
    const slider = endTrackRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
      const pct = Math.round((x / rect.width) * 100);
      handleEndChange(pct);
    };

    const up = () => {
      setDraggingEnd(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [handleEndChange]);

  // Clean FX name
  const cleanName = (name: string) =>
    name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
        <button
          onClick={onBack}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mr-3"
          aria-label="Back"
        >
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">
            {cleanName(fxName)}
          </h2>
          <p className="text-[10px] text-[var(--text-secondary)] truncate">
            Track: {trackName || `Track ${trackIdx + 1}`}
          </p>
        </div>
      </div>

      {/* Trim Controls */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
            <div className="text-4xl animate-pulse">🎚️</div>
            <p className="text-sm">Loading sample trim...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Trim Bar Preview */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Sample Trim
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Adjust where the sample starts and ends. Values in beats (0–{MAX_BEATS}).
              </p>

              {/* Visual bar showing active region */}
              <div className="relative h-6 bg-[var(--bg-secondary)] overflow-hidden mt-2">
                {/* Inactive left region */}
                <div
                  className="absolute inset-y-0 left-0 bg-[var(--bg-tertiary)]/60"
                  style={{ width: `${startVal}%` }}
                />
                {/* Active region */}
                <div
                  className="absolute inset-y-0 bg-[var(--accent-orange)]/30"
                  style={{ left: `${startVal}%`, width: `${endVal - startVal}%` }}
                />
                {/* Inactive right region */}
                <div
                  className="absolute inset-y-0 right-0 bg-[var(--bg-tertiary)]/60"
                  style={{ width: `${100 - endVal}%` }}
                />
                {/* Start marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent-orange)] z-10"
                  style={{ left: `${startVal}%` }}
                />
                {/* End marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent-blue)] z-10"
                  style={{ left: `${endVal}%` }}
                />
              </div>

              {/* Start/end labels */}
              <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                <span>Start: {Math.round((startVal / 100) * MAX_BEATS * 10) / 10} beats</span>
                <span>End: {Math.round((endVal / 100) * MAX_BEATS * 10) / 10} beats</span>
              </div>
            </div>

            {/* Start Offset Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">Start Offset</span>
                <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {Math.round((startVal / 100) * MAX_BEATS * 10) / 10} beats
                </span>
              </div>
              <div
                ref={startTrackRef}
                className={`relative h-8 cursor-pointer select-none transition-shadow ${
                  draggingStart ? 'ring-2 ring-[var(--accent-orange)]/60' : 'ring-1 ring-[var(--border)]'
                } bg-[var(--bg-tertiary)]`}
                onPointerDown={handleStartPointerDown}
              >
                {/* Fill from left to start position */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent to-[var(--accent-orange)]/40"
                  style={{ width: `${startVal}%` }}
                />
                {/* Knob */}
                <div
                  className="absolute top-1 bottom-1 w-1 bg-[var(--accent-orange)]/80"
                  style={{ left: `calc(${startVal}% - 2px)` }}
                />
              </div>
            </div>

            {/* End Offset Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">End Offset</span>
                <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {Math.round((endVal / 100) * MAX_BEATS * 10) / 10} beats
                </span>
              </div>
              <div
                ref={endTrackRef}
                className={`relative h-8 cursor-pointer select-none transition-shadow ${
                  draggingEnd ? 'ring-2 ring-[var(--accent-blue)]/60' : 'ring-1 ring-[var(--border)]'
                } bg-[var(--bg-tertiary)]`}
                onPointerDown={handleEndPointerDown}
              >
                {/* Fill from left to end position */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent to-[var(--accent-blue)]/40"
                  style={{ width: `${endVal}%` }}
                />
                {/* Knob */}
                <div
                  className="absolute top-1 bottom-1 w-1 bg-[var(--accent-blue)]/80"
                  style={{ left: `calc(${endVal}% - 2px)` }}
                />
              </div>
            </div>

            {/* Velocity Sensitivity Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">Velocity Sensitivity</span>
                <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                  {velInfo?.formatted || (velInfo ? Math.round((velValue / 100) * (velInfo.max - velInfo.min) + velInfo.min) + '%' : '')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Controls how the sample responds to how hard you hit a MIDI key.
              </p>
              <div
                ref={velTrackRef}
                className={`relative h-8 cursor-pointer select-none transition-shadow ${
                  draggingVel ? 'ring-2 ring-[var(--accent-orange)]/60' : 'ring-1 ring-[var(--border)]'
                } bg-[var(--bg-tertiary)]`}
                onPointerDown={(e: React.PointerEvent) => {
                  e.preventDefault();
                  setDraggingVel(true);
                  const slider = velTrackRef.current;
                  if (!slider) return;
                  const rect = slider.getBoundingClientRect();

                  const move = (ev: PointerEvent) => {
                    const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
                    const pct = Math.round((x / rect.width) * 100);
                    setVelValue(pct);
                    if (velInfo) {
                      const range = velInfo.max - velInfo.min;
                      const val = velInfo.min + (pct / 100) * range;
                      if (commitVelRef.current) clearTimeout(commitVelRef.current);
                      commitVelRef.current = setTimeout(() => {
                        setVelocity(trackIdx, fxIdx, val);
                      }, 200);
                    }
                  };

                  const up = () => {
                    setDraggingVel(false);
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                  };

                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
              >
                {/* Fill from left to vel position */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent to-[var(--accent-orange)]/40"
                  style={{ width: `${velValue}%` }}
                />
                {/* Knob */}
                <div
                  className="absolute top-1 bottom-1 w-1 bg-[var(--accent-orange)]/80"
                  style={{ left: `calc(${velValue}% - 2px)` }}
                />
              </div>
            </div>

            {/* Raw values display */}
            {trimInfo && (
              <div className="bg-[var(--bg-tertiary)] p-3 space-y-1">
                <p className="text-[10px] text-[var(--text-secondary)] font-mono">
                  Raw start: {trimInfo.startOffset}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono">
                  Raw end: {trimInfo.endOffset}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

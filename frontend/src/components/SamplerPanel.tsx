import { useState, useEffect, useCallback, useRef } from 'react';
import { useSampler, type SamplerTrimInfo, type SamplerVelInfo, type SamplerAdsrInfo } from '../hooks/useSampler';
import { useReaperClient } from '../hooks/useReaperClient';

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
  const { getTrimInfo, setTrimStart, setTrimEnd, getVelocityInfo, setVelocity, getAdsrInfo, setAdsrParam, loadFile } = useSampler();
  const { send } = useReaperClient();

  // File browser state
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<{ name: string; type: string }[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

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

  // ADSR envelope state
  const [adsrInfo, setAdsrInfo] = useState<SamplerAdsrInfo | null>(null);
  const [adsrValues, setAdsrValues] = useState<Record<string, number>>({});
  const [draggingAdsr, setDraggingAdsr] = useState<Record<string, boolean>>({});
  const adsrTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      const [trim, vel, adsr] = await Promise.all([
        getTrimInfo(trackIdx, fxIdx),
        getVelocityInfo(trackIdx, fxIdx),
        getAdsrInfo(trackIdx, fxIdx),
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
      if (adsr && adsr.length > 0) {
        setAdsrInfo(adsr);
        const vals: Record<string, number> = {};
        for (const p of adsr) {
          const range = p.max - p.min;
          if (range > 0) {
            vals[p.name] = Math.round(((p.value - p.min) / range) * 100);
          } else {
            vals[p.name] = 0;
          }
        }
        setAdsrValues(vals);
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

  // ADSR debounce refs per param
  const commitAdsrRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const handleAdsrChange = useCallback((name: string, pct: number, paramIdx: number, min: number, max: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setAdsrValues(prev => ({ ...prev, [name]: clamped }));
    const range = max - min;
    const val = min + (clamped / 100) * range;
    if (commitAdsrRefs.current[name]) clearTimeout(commitAdsrRefs.current[name]);
    commitAdsrRefs.current[name] = setTimeout(() => {
      setAdsrParam(trackIdx, fxIdx, paramIdx, val);
    }, 200);
  }, [trackIdx, fxIdx, setAdsrParam]);

  // ── File browser helpers ──────────────────────────────

  const loadDirectory = useCallback(async (path: string) => {
    setBrowseLoading(true);
    try {
      const resp = await send('sample/getDirectory', { path, limit: 200 });
      if (resp.success) {
        const p = resp.payload as Record<string, unknown>;
        setBrowsePath(p.path as string);
        setBrowseEntries(p.entries as { name: string; type: string }[]);
      }
    } catch {
      // ignore
    }
    setBrowseLoading(false);
  }, [send]);

  const handleBrowseOpen = useCallback(() => {
    setShowFileBrowser(true);
    // Start from a known root — use user home or media root
    loadDirectory('/');
  }, [loadDirectory]);

  const handleBrowseEntryClick = useCallback(async (entry: { name: string; type: string }) => {
    if (entry.type === 'dir') {
      const newPath = entry.name === '..'
        ? browsePath.substring(0, browsePath.lastIndexOf('/', browsePath.length - 2) + 1) || '/'
        : browsePath + (browsePath.endsWith('/') ? '' : '/') + entry.name;
      await loadDirectory(newPath);
    } else {
      // File selected — call sampler/loadFile
      const fullPath = browsePath + (browsePath.endsWith('/') ? '' : '/') + entry.name;
      const ok = await loadFile(trackIdx, fxIdx, fullPath);
      if (ok) {
        setLoadedFileName(entry.name);
        setShowFileBrowser(false);
      }
    }
  }, [browsePath, trackIdx, fxIdx, loadFile, loadDirectory]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (commitStartRef.current) clearTimeout(commitStartRef.current);
      if (commitEndRef.current) clearTimeout(commitEndRef.current);
      if (commitVelRef.current) clearTimeout(commitVelRef.current);
      for (const key of Object.keys(commitAdsrRefs.current)) {
        if (commitAdsrRefs.current[key]) clearTimeout(commitAdsrRefs.current[key]);
      }
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
    <div className="flex flex-col h-full relative">
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
        <button
          onClick={handleBrowseOpen}
          className="text-xs px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--text-secondary)]/20 transition-colors border border-[var(--border)]"
          aria-label="Browse"
        >
          Browse
        </button>
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

            {/* ── ADSR Envelope Controls ──────────────────────────────── */}
            {adsrInfo && adsrInfo.length > 0 && (
              <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  ADSR Envelope
                </h3>
                {adsrInfo.map((param) => {
                  const name = param.name;
                  const valPct = adsrValues[name] ?? 0;
                  const isDragging = draggingAdsr[name] ?? false;

                  const handlePointerDown = (e: React.PointerEvent) => {
                    e.preventDefault();
                    setDraggingAdsr(prev => ({ ...prev, [name]: true }));
                    const slider = adsrTrackRefs.current[name];
                    if (!slider) return;
                    const rect = slider.getBoundingClientRect();

                    const move = (ev: PointerEvent) => {
                      const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
                      const pct = Math.round((x / rect.width) * 100);
                      handleAdsrChange(name, pct, param.paramIdx, param.min, param.max);
                    };

                    const up = () => {
                      setDraggingAdsr(prev => ({ ...prev, [name]: false }));
                      window.removeEventListener('pointermove', move);
                      window.removeEventListener('pointerup', up);
                    };

                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                  };

                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{name}</span>
                        <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                          {param.formatted || Math.round(valPct) + '%'}
                        </span>
                      </div>
                      <div
                        ref={(el) => { adsrTrackRefs.current[name] = el; }}
                        className={`relative h-8 cursor-pointer select-none transition-shadow ${
                          isDragging ? 'ring-2 ring-[var(--accent-orange)]/60' : 'ring-1 ring-[var(--border)]'
                        } bg-[var(--bg-secondary)]`}
                        onPointerDown={handlePointerDown}
                      >
                        {/* Fill bar */}
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent to-[var(--accent-orange)]/40"
                          style={{ width: `${valPct}%` }}
                        />
                        {/* Knob */}
                        <div
                          className="absolute top-1 bottom-1 w-1 bg-[var(--accent-orange)]/80"
                          style={{ left: `calc(${valPct}% - 2px)` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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

            {/* Loaded file name indicator */}
            {loadedFileName && (
              <div className="bg-[var(--bg-tertiary)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">
                  Loaded file: <span className="text-[var(--text-primary)] font-medium">{loadedFileName}</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── File Browser Overlay ──────────────────────────────── */}
      {showFileBrowser && (
        <div
          className="absolute inset-0 bg-[var(--bg-primary)] z-50 flex flex-col"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {/* Browser header */}
          <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
            <button
              onClick={() => setShowFileBrowser(false)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mr-3"
              aria-label="Cancel"
            >
              ← Cancel
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold truncate">
                {browsePath}
              </h2>
            </div>
          </div>

          {/* File listing */}
          <div className="flex-1 overflow-y-auto">
            {browseLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-secondary)]">
                Loading...
              </div>
            ) : browseEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-secondary)]">
                No files found
              </div>
            ) : (
              <div className="py-1">
                {browseEntries.map((entry) => (
                  <button
                    key={entry.name}
                    onClick={() => handleBrowseEntryClick(entry)}
                    className={`w-full flex items-center px-4 py-2 text-sm transition-colors hover:bg-[var(--bg-tertiary)] ${
                      entry.type === 'dir'
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="mr-3 flex-shrink-0">
                      {entry.type === 'dir' ? '📁' : '🎵'}
                    </span>
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-secondary)]">
            Click a file to load it into the sampler
          </div>
        </div>
      )}
    </div>
  );
}

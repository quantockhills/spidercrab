import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EnumeratedFx, Track } from '../hooks/useReaper';

// ── Types ────────────────────────────────────────────────────

interface FxBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  enumerateFx: () => Promise<EnumeratedFx[]>;
  getTrackFx: (trackIdx: number) => Promise<FxInfo[]>;
  addFx: (trackIdx: number, fxName: string) => Promise<number>;
  onSelectFx: (trackIdx: number, fxIdx: number, fxName: string) => void;
  onBack: () => void;
}

interface FxInfo {
  index: number;
  name: string;
}

type FormatFilter = 'All' | 'VST' | 'VST3' | 'CLAP' | 'JSFX' | 'AU' | 'DX';

// ── Constants ─────────────────────────────────────────────────

const FORMAT_FILTERS: FormatFilter[] = ['All', 'VST3', 'VST', 'CLAP', 'JSFX', 'AU', 'DX'];

// Helper: clean FX name for display (strip format prefix like "VST3: ")
function cleanFxName(name: string): string {
  // Remove common REAPER prefixes like "VST3: ", "VST: ", "VSTi: ", "CLAP: "
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '');
}

// ── Component ─────────────────────────────────────────────────

export function FxBrowser({
  tracks,
  selectedTrack,
  enumerateFx,
  addFx,
  onSelectFx,
  onBack,
}: FxBrowserProps) {
  const [allFx, setAllFx] = useState<EnumeratedFx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('All');
  const [addingName, setAddingName] = useState<string | null>(null);
  const [addedFx, setAddedFx] = useState<Set<string>>(new Set());

  // Load FX on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    enumerateFx()
      .then((fx) => {
        if (!cancelled) {
          setAllFx(fx);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load FX');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [enumerateFx]);

  // Filtered + grouped FX list
  const groupedFx = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    let filtered = allFx;
    if (formatFilter !== 'All') {
      filtered = filtered.filter((fx) => fx.format === formatFilter);
    }
    if (lowerSearch) {
      filtered = filtered.filter(
        (fx) =>
          fx.name.toLowerCase().includes(lowerSearch) ||
          fx.ident.toLowerCase().includes(lowerSearch),
      );
    }

    // Group by format
    const groups = new Map<string, EnumeratedFx[]>();
    for (const fx of filtered) {
      const group = groups.get(fx.format) || [];
      group.push(fx);
      groups.set(fx.format, group);
    }

    // Sort groups: VST3 first, then by name
    const formatOrder = ['VST3', 'VST2', 'CLAP', 'JSFX', 'AU', 'DX', 'VST'];
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = formatOrder.indexOf(a);
      const bi = formatOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return sorted;
  }, [allFx, search, formatFilter]);

  const handleAddFx = useCallback(
    async (fx: EnumeratedFx) => {
      if (selectedTrack === null) return;
      setAddingName(fx.name);
      try {
        // Use the full FX name from enumeration (includes format prefix like "VST3: ReaEQ")
        // TrackFX_AddByName requires the full name, not the cleaned display name
        const addedIndex = await addFx(selectedTrack, fx.name);
        if (addedIndex >= 0) {
          setAddedFx((prev) => new Set(prev).add(fx.name));
          // Brief flash of success
          setTimeout(() => {
            setAddedFx((prev) => {
              const next = new Set(prev);
              next.delete(fx.name);
              return next;
            });
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to add FX:', err);
      } finally {
        setAddingName(null);
      }
    },
    [selectedTrack, addFx],
  );

  const handleSelectFx = useCallback(
    (trackIdx: number, fxIdx: number, fxName: string) => {
      onSelectFx(trackIdx, fxIdx, fxName);
    },
    [onSelectFx],
  );

  const selectedTrackName = selectedTrack !== null
    ? tracks.find((t) => t.index === selectedTrack)?.name
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Back"
          >
            ← Back
          </button>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            FX Browser
          </h2>
        </div>
        {selectedTrackName && (
          <span className="text-xs text-[var(--text-secondary)]">
            Target: <span className="text-[var(--text-primary)]">{selectedTrackName}</span>
          </span>
        )}
      </div>

      {/* Search + Filter row */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[var(--border)]">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FX..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--bg-tertiary)] text-sm
              text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
              outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
          />
        </div>
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
          className="bg-[var(--bg-tertiary)] text-sm px-3 py-2
            text-[var(--text-primary)] outline-none ring-1 ring-[var(--border)]
            border-none appearance-none cursor-pointer"
        >
          {FORMAT_FILTERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* No track selected warning */}
      {selectedTrack === null && (
        <div className="px-4 py-3 bg-[var(--accent-yellow)]/15 border-b border-[var(--accent-yellow)]/30">
          <p className="text-xs text-[var(--accent-yellow)]">
            ⚠ Select a track first (Tracks tab) to add FX
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
            <div className="text-4xl animate-pulse">🎛️</div>
            <p className="text-sm">Loading FX...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                enumerateFx()
                  .then(setAllFx)
                  .catch((err) => setError(err.message))
                  .finally(() => setLoading(false));
              }}
              className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : allFx.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-5xl mb-2">📦</div>
            <p className="text-sm">No plugins found</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Install some VST/VST3/CLAP/JSFX plugins in Reaper
            </p>
          </div>
        ) : groupedFx.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-4xl">🔍</div>
            <p className="text-sm">No results matching &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className="px-3 py-2 space-y-4">
            {groupedFx.map(([format, fxList]) => (
              <div key={format}>
                {/* Format section header */}
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-blue)]">
                    {format}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    ({fxList.length})
                  </span>
                </div>

                {/* FX items */}
                <div className="space-y-1">
                  {fxList.map((fx) => (
                    <FxRow
                      key={fx.ident || fx.name}
                      fx={fx}
                      selectedTrack={selectedTrack}
                      isAdding={addingName === fx.name}
                      isAdded={addedFx.has(fx.name)}
                      onAdd={handleAddFx}
                      onSelect={handleSelectFx}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Count footer */}
      {!loading && allFx.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-secondary)]">
          <span>{allFx.length} total plugins</span>
          {search && <span>{groupedFx.reduce((s, [_, l]) => s + l.length, 0)} filtered</span>}
        </div>
      )}
    </div>
  );
}

// ── FX Row ────────────────────────────────────────────────────

interface FxRowProps {
  fx: EnumeratedFx;
  selectedTrack: number | null;
  isAdding: boolean;
  isAdded: boolean;
  onAdd: (fx: EnumeratedFx) => void;
  onSelect: (trackIdx: number, fxIdx: number, fxName: string) => void;
}

function FxRow({ fx, selectedTrack, isAdding, isAdded, onAdd, onSelect }: FxRowProps) {
  const displayName = cleanFxName(fx.name);

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2
        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
        active:brightness-95 transition-all duration-100 select-none"
    >
      {/* FX name - tap to view params */}
      <button
        onClick={() => {
          if (selectedTrack !== null) {
            onSelect(selectedTrack, fx.index, fx.name);
          }
        }}
        disabled={selectedTrack === null}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate">{displayName}</div>
        {fx.ident && (
          <div className="text-[10px] text-[var(--text-secondary)] truncate">{fx.ident}</div>
        )}
      </button>

      {/* Format badge */}
      <span
        className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 ${getFormatBadgeStyle(fx.format)}`}
      >
        {fx.format}
      </span>

      {/* Add to Track button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd(fx);
        }}
        disabled={selectedTrack === null || isAdding}
        className={`
          flex-shrink-0 px-3 py-1.5 text-xs font-medium
          transition-all active:brightness-95 min-h-[44px]
          ${selectedTrack === null
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
            : isAdded
              ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
              : isAdding
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
          }
        `}
      >
        {isAdded ? '✓ Added' : isAdding ? '...' : 'Add'}
      </button>
    </div>
  );
}

// Format badge colors (Everforest pastel)
function getFormatBadgeStyle(format: string): string {
  switch (format) {
    case 'VST3':
      return 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]';
    case 'VST2':
      return 'bg-[var(--format-vst2)]/20 text-[var(--format-vst2)]';
    case 'CLAP':
      return 'bg-[var(--format-clap)]/20 text-[var(--format-clap)]';
    case 'JSFX':
      return 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]';
    case 'AU':
      return 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]';
    case 'DX':
      return 'bg-[var(--format-dx)]/20 text-[var(--format-dx)]';
    default:
      return 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]';
  }
}

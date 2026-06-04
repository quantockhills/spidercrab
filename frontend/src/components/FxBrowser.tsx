import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { EnumeratedFx, Track } from '../hooks/useReaper';

// ── Chain search types ───────────────────────────────────────

interface FxChainSearchResult {
  filePath: string;
  name: string;
  size: number;
}

// ── Types ────────────────────────────────────────────────────

interface FxBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  enumerateFx: () => Promise<EnumeratedFx[]>;
  getTrackFx: (trackIdx: number) => Promise<FxInfo[]>;
  addFx: (trackIdx: number, fxName: string) => Promise<number>;
  onSelectFx: (trackIdx: number, fxIdx: number, fxName: string) => void;
  onBack: () => void;
  onOpenFxChains?: () => void;
  // Unified FX + FX chain search (Issue #96)
  fxChainSearchRecursive?: (query: string, rootPath: string) => Promise<{ query: string; results: FxChainSearchResult[] }>;
  fxChainLoad?: (trackIdx: number, filePath: string, mode?: 'replace' | 'append') => Promise<boolean>;
  fxChainPath?: string;
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
  getTrackFx,
  addFx,
  onSelectFx,
  onBack,
  onOpenFxChains,
  fxChainSearchRecursive,
  fxChainLoad,
  fxChainPath,
}: FxBrowserProps) {
  const [allFx, setAllFx] = useState<EnumeratedFx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('All');
  const [addingName, setAddingName] = useState<string | null>(null);
  const [addedFx, setAddedFx] = useState<Set<string>>(new Set());

  // Chain search state (Issue #96)
  const [chainResults, setChainResults] = useState<FxChainSearchResult[] | null>(null);
  const [chainLoadingFile, setChainLoadingFile] = useState<string | null>(null);
  const chainSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load FX on mount
  useEffect(() => {
    let cancelled = false;
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

  // Debounced chain search (Issue #96)
  useEffect(() => {
    if (!search.trim() || !fxChainSearchRecursive || !fxChainPath) {
      return;
    }

    // Clear previous timer
    if (chainSearchTimerRef.current) {
      clearTimeout(chainSearchTimerRef.current);
    }

    // Use a ref to track searching state to avoid synchronous setState
    const timerId = setTimeout(async () => {
      try {
        const result = await fxChainSearchRecursive(search, fxChainPath);
        setChainResults(result.results);
      } catch {
        setChainResults([]);
      }
    }, 300);
    chainSearchTimerRef.current = timerId;

    return () => {
      if (chainSearchTimerRef.current) {
        clearTimeout(chainSearchTimerRef.current);
        chainSearchTimerRef.current = null;
      }
    };
  }, [search, fxChainPath, fxChainSearchRecursive]);

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
    async (trackIdx: number, _fxIdx: number, fxName: string) => {
      // Look up the track-local FX index — fxIdx from the enumerated list is the
      // GLOBAL plugin index, but Reaper's TrackFX_* APIs expect the 0-based index
      // of the FX on the specific track (e.g. 0 = first FX on track).
      try {
        const trackFx = await getTrackFx(trackIdx);
        const match = (trackFx as FxInfo[]).find(
          (tfx: FxInfo) => tfx.name === fxName || tfx.name.includes(fxName.replace(/^.*?:\s*/, ''))
        );
        if (match !== undefined) {
          onSelectFx(trackIdx, match.index, fxName);
        } else {
          // Fallback: use the fxIdx as-is (will likely show no params)
          onSelectFx(trackIdx, 0, fxName);
        }
      } catch {
        onSelectFx(trackIdx, 0, fxName);
      }
    },
    [onSelectFx, getTrackFx],
  );

  const handleLoadChain = useCallback(
    async (filePath: string) => {
      if (selectedTrack === null || !fxChainLoad) return;
      setChainLoadingFile(filePath);
      try {
        await fxChainLoad(selectedTrack, filePath, 'replace');
      } catch (err) {
        console.error('Failed to load FX chain:', err);
      } finally {
        setChainLoadingFile(null);
      }
    },
    [selectedTrack, fxChainLoad],
  );

  const selectedTrackName = selectedTrack !== null
    ? tracks.find((t) => t.index === selectedTrack)?.name
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          FX Browser
        </h2>
        {onOpenFxChains && (
          <button
            onClick={onOpenFxChains}
            className="text-xs px-2.5 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            🔗 Chains
          </button>
        )}
        {selectedTrackName && (
          <span className="text-xs text-[var(--text-secondary)] ml-auto">
            Target: <span className="text-[var(--text-primary)]">{selectedTrackName}</span>
          </span>
        )}
      </div>

      {/* Search + Filter row (with Back button) */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[var(--border)]">
        <button
          onClick={onBack}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          aria-label="Back"
        >
          ← Back
        </button>
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
        ) : (
          <div className="px-3 py-2 space-y-4">
            {/* FX groups */}
            {groupedFx.length > 0 && groupedFx.map(([format, fxList]) => (
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

            {/* No FX results message */}
            {groupedFx.length === 0 && (
              <div className="py-8 text-center">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-sm text-[var(--text-secondary)]">No FX matching &quot;{search}&quot;</p>
              </div>
            )}

            {/* Chain search results (Issue #96) */}
            {(search.trim() && fxChainSearchRecursive && fxChainPath) && (
              <div>
                {/* Chain section header */}
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green)]">
                    🔗 Chains
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {chainResults !== null ? `(${chainResults.length})` : ''}
                  </span>
                </div>

                {/* Chain items */}
                <div className="space-y-1">
                  {chainResults === null ? (
                    <div className="px-3 py-3 text-xs text-[var(--text-secondary)] italic">
                      Searching all folders…
                    </div>
                  ) : chainResults.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-[var(--text-secondary)] italic">
                      No matching chains
                    </div>
                  ) : (
                    chainResults.map((chain) => (
                      <ChainRow
                        key={chain.filePath}
                        chain={chain}
                        selectedTrack={selectedTrack}
                        isLoading={chainLoadingFile === chain.filePath}
                        onLoad={handleLoadChain}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Count footer */}
      {!loading && allFx.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-secondary)]">
          <span>{allFx.length} total plugins</span>
          {search && <span>{groupedFx.reduce((s, arr) => s + arr[1].length, 0)} filtered</span>}
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

// ── Chain Row (Issue #96) ────────────────────────────────────

interface ChainRowProps {
  chain: FxChainSearchResult;
  selectedTrack: number | null;
  isLoading: boolean;
  onLoad: (filePath: string) => void;
}

function ChainRow({ chain, selectedTrack, isLoading, onLoad }: ChainRowProps) {
  // Clean name: remove directory prefix and .RfxChain extension for display
  const displayName = chain.name.replace(/\.RfxChain$/i, '').replace(/^.*[/\\]/, '');

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2
        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
        active:brightness-95 transition-all duration-100 select-none"
    >
      {/* Chain name - tap to load */}
      <button
        onClick={() => {
          if (selectedTrack !== null) {
            onLoad(chain.filePath);
          }
        }}
        disabled={selectedTrack === null}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate">
          <span className="text-[var(--accent-green)]">🔗 Chain:</span> {displayName}
        </div>
        {chain.size > 0 && (
          <div className="text-[10px] text-[var(--text-secondary)] truncate">
            {chain.filePath}
          </div>
        )}
      </button>

      {/* Size badge */}
      {chain.size > 0 && (
        <span className="flex-shrink-0 text-[10px] text-[var(--text-secondary)] px-2 py-0.5 bg-[var(--bg-tertiary)]">
          {chain.size < 1024 ? `${chain.size}B` : `${(chain.size / 1024).toFixed(0)}KB`}
        </span>
      )}

      {/* Load button */}
      <button
        onClick={() => {
          if (selectedTrack !== null) {
            onLoad(chain.filePath);
          }
        }}
        disabled={selectedTrack === null || isLoading}
        className={`
          flex-shrink-0 px-3 py-1.5 text-xs font-medium
          transition-all active:brightness-95 min-h-[44px]
          ${selectedTrack === null
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
            : isLoading
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              : 'bg-[var(--accent-dim)] text-[var(--accent-green)]'
          }
        `}
      >
        {isLoading ? '...' : 'Load'}
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

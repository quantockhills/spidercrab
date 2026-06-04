import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { EnumeratedFx, Track } from '../hooks/useReaper';
import type { FxTagData, TagTarget } from '../hooks/useFx';

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
  // Tag support (Issue #97)
  getFxTags?: () => Promise<FxTagData | null>;
  setFxTags?: (target: TagTarget, ident: string, tags: string[]) => Promise<boolean>;
}

interface FxInfo {
  index: number;
  name: string;
}

type FormatFilter = 'All' | 'VST' | 'VST3' | 'CLAP' | 'JSFX' | 'AU' | 'DX';

// ── Constants ─────────────────────────────────────────────────

const FORMAT_FILTERS: FormatFilter[] = ['All', 'VST3', 'VST', 'CLAP', 'JSFX', 'AU', 'DX'];

// ── Tag color palette (deterministic) ─────────────────────────

const TAG_COLORS: { bg: string; text: string }[] = [
  { bg: 'bg-blue-500/20',   text: 'text-blue-400' },
  { bg: 'bg-green-500/20',  text: 'text-green-400' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  { bg: 'bg-pink-500/20',   text: 'text-pink-400' },
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  { bg: 'bg-red-500/20',    text: 'text-red-400' },
  { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
  { bg: 'bg-teal-500/20',   text: 'text-teal-400' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  { bg: 'bg-cyan-500/20',   text: 'text-cyan-400' },
];

function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[idx];
}

// Helper: clean FX name for display (strip format prefix like "VST3: ")
function cleanFxName(name: string): string {
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
  getFxTags,
  setFxTags,
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

  // Tag state (Issue #97)
  const [tagData, setTagData] = useState<FxTagData | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [editingTagIdent, setEditingTagIdent] = useState<string | null>(null);
  const [editingTagTarget, setEditingTagTarget] = useState<TagTarget | null>(null);
  const [tagEditInput, setTagEditInput] = useState('');

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

  // Load tags on mount (Issue #97)
  useEffect(() => {
    if (!getFxTags) return;
    let cancelled = false;
    getFxTags()
      .then((data) => {
        if (!cancelled && data) {
          setTagData(data);
        }
      })
      .catch(() => {
        // Tags are optional — silently fail
      });
    return () => { cancelled = true; };
  }, [getFxTags]);

  // Debounced chain search (Issue #96)
  useEffect(() => {
    if (!search.trim() || !fxChainSearchRecursive || !fxChainPath) {
      return;
    }

    if (chainSearchTimerRef.current) {
      clearTimeout(chainSearchTimerRef.current);
    }

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

  // Get tags for a given FX ident
  const getTagsForIdent = useCallback((ident: string): string[] => {
    if (!tagData) return [];
    return tagData.fxTags[ident] || [];
  }, [tagData]);

  // Get tags for a chain file path
  const getTagsForChain = useCallback((filePath: string): string[] => {
    if (!tagData) return [];
    return tagData.chainTags[filePath] || [];
  }, [tagData]);

  // Get all unique tags across all FX and chains
  const allUniqueTags = useMemo(() => {
    if (!tagData) return [] as string[];
    const tagSet = new Set<string>();
    for (const tags of Object.values(tagData.fxTags)) {
      for (const t of tags) tagSet.add(t);
    }
    for (const tags of Object.values(tagData.chainTags)) {
      for (const t of tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [tagData]);

  // Filtered + grouped FX list (also filters by tags)
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
    // Tag filter: only show FX matching ANY selected tag (OR logic)
    if (selectedTags.size > 0 && tagData) {
      filtered = filtered.filter((fx) => {
        const tags = tagData.fxTags[fx.ident];
        if (!tags || tags.length === 0) return false;
        return tags.some((t) => selectedTags.has(t));
      });
    }

    // Group by format
    const groups = new Map<string, EnumeratedFx[]>();
    for (const fx of filtered) {
      const group = groups.get(fx.format) || [];
      group.push(fx);
      groups.set(fx.format, group);
    }

    const formatOrder = ['VST3', 'VST2', 'CLAP', 'JSFX', 'AU', 'DX', 'VST'];
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = formatOrder.indexOf(a);
      const bi = formatOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return sorted;
  }, [allFx, search, formatFilter, selectedTags, tagData]);

  // Filter chain results by tags
  const filteredChainResults = useMemo(() => {
    if (!chainResults) return chainResults;
    if (selectedTags.size === 0 || !tagData) return chainResults;
    return chainResults.filter((chain) => {
      const tags = tagData.chainTags[chain.filePath];
      if (!tags || tags.length === 0) return false;
      return tags.some((t) => selectedTags.has(t));
    });
  }, [chainResults, selectedTags, tagData]);

  const handleAddFx = useCallback(
    async (fx: EnumeratedFx) => {
      if (selectedTrack === null) return;
      setAddingName(fx.name);
      try {
        const addedIndex = await addFx(selectedTrack, fx.name);
        if (addedIndex >= 0) {
          setAddedFx((prev) => new Set(prev).add(fx.name));
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
      try {
        const trackFx = await getTrackFx(trackIdx);
        const match = (trackFx as FxInfo[]).find(
          (tfx: FxInfo) => tfx.name === fxName || tfx.name.includes(fxName.replace(/^.*?:\s*/, ''))
        );
        if (match !== undefined) {
          onSelectFx(trackIdx, match.index, fxName);
        } else {
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

  // Tag editing handlers (Issue #97)
  const handleStartEditTags = useCallback((ident: string, target: TagTarget) => {
    let currentTags: string[] = [];
    if (target === 'fx' && tagData) {
      currentTags = tagData.fxTags[ident] || [];
    } else if (target === 'chain' && tagData) {
      currentTags = tagData.chainTags[ident] || [];
    }
    setEditingTagIdent(ident);
    setEditingTagTarget(target);
    setTagEditInput(currentTags.join(', '));
  }, [tagData]);

  const handleSaveTags = useCallback(async () => {
    if (!editingTagIdent || !editingTagTarget || !setFxTags) {
      setEditingTagIdent(null);
      setEditingTagTarget(null);
      return;
    }
    const newTags = tagEditInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const ok = await setFxTags(editingTagTarget, editingTagIdent, newTags);
    if (ok) {
      // Refresh tag data
      if (getFxTags) {
        const data = await getFxTags();
        if (data) setTagData(data);
      }
    }
    setEditingTagIdent(null);
    setEditingTagTarget(null);
  }, [editingTagIdent, editingTagTarget, tagEditInput, setFxTags, getFxTags]);

  const handleCancelEditTags = useCallback(() => {
    setEditingTagIdent(null);
    setEditingTagTarget(null);
  }, []);

  // Tag filter toggle
  const handleToggleTagFilter = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const handleClearTagFilter = useCallback(() => {
    setSelectedTags(new Set());
  }, []);

  const selectedTrackName = selectedTrack !== null
    ? tracks.find((t) => t.index === selectedTrack)?.name
    : null;

  const hasTags = allUniqueTags.length > 0;

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

      {/* Tag filter bar (Issue #97) */}
      {hasTags && (
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleClearTagFilter}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              selectedTags.size === 0
                ? 'bg-[var(--accent-orange)]/30 text-[var(--accent-orange)] font-semibold'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All
          </button>
          {allUniqueTags.map((tag) => {
            const color = getTagColor(tag);
            const isSelected = selectedTags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => handleToggleTagFilter(tag)}
                className={`text-xs px-2 py-1 rounded-full transition-all ${
                  isSelected
                    ? `${color.bg} ${color.text} ring-1 ring-current`
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

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
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-blue)]">
                    {format}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    ({fxList.length})
                  </span>
                </div>

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
                      tags={getTagsForIdent(fx.ident)}
                      onEditTags={() => handleStartEditTags(fx.ident, 'fx')}
                      isEditingTags={editingTagIdent === fx.ident && editingTagTarget === 'fx'}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* No FX results message */}
            {groupedFx.length === 0 && (
              <div className="py-8 text-center">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {selectedTags.size > 0
                    ? 'No FX matching selected tags'
                    : `No FX matching "${search}"`
                  }
                </p>
              </div>
            )}

            {/* Chain search results (Issue #96) */}
            {(search.trim() && fxChainSearchRecursive && fxChainPath) && (
              <div>
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green)]">
                    🔗 Chains
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {filteredChainResults !== null ? `(${filteredChainResults.length})` : ''}
                  </span>
                </div>

                <div className="space-y-1">
                  {filteredChainResults === null ? (
                    <div className="px-3 py-3 text-xs text-[var(--text-secondary)] italic">
                      Searching all folders…
                    </div>
                  ) : filteredChainResults.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-[var(--text-secondary)] italic">
                      {selectedTags.size > 0
                        ? 'No matching chains with selected tags'
                        : 'No matching chains'
                      }
                    </div>
                  ) : (
                    filteredChainResults.map((chain) => (
                      <ChainRow
                        key={chain.filePath}
                        chain={chain}
                        selectedTrack={selectedTrack}
                        isLoading={chainLoadingFile === chain.filePath}
                        onLoad={handleLoadChain}
                        tags={getTagsForChain(chain.filePath)}
                        onEditTags={() => handleStartEditTags(chain.filePath, 'chain')}
                        isEditingTags={editingTagIdent === chain.filePath && editingTagTarget === 'chain'}
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

// ── Tag editor inline ─────────────────────────────────────────

interface TagEditorProps {
  currentTags: string[];
  onSave: () => void;
  onCancel: () => void;
  value: string;
  onChange: (val: string) => void;
}

function TagEditor({ currentTags, onSave, onCancel, value, onChange }: TagEditorProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="tag1, tag2, tag3"
        className="flex-1 text-xs px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)]
          outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={onSave}
        className="text-xs px-2 py-1 bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/30 transition-colors"
      >
        ✓
      </button>
      <button
        onClick={onCancel}
        className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ── Tag badges ────────────────────────────────────────────────

interface TagBadgeProps {
  tag: string;
  onClick?: () => void;
}

function TagBadge({ tag, onClick }: TagBadgeProps) {
  const color = getTagColor(tag);
  return (
    <span
      onClick={onClick}
      className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full ${color.bg} ${color.text} cursor-default`}
    >
      {tag}
    </span>
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
  tags: string[];
  onEditTags: () => void;
  isEditingTags: boolean;
}

function FxRow({ fx, selectedTrack, isAdding, isAdded, onAdd, onSelect, tags, onEditTags, isEditingTags }: FxRowProps) {
  const displayName = cleanFxName(fx.name);

  if (isEditingTags) {
    return (
      <div className="px-3 py-2 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate">{displayName}</span>
          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 ${getFormatBadgeStyle(fx.format)}`}>
            {fx.format}
          </span>
        </div>
        <TagEditor
          currentTags={tags}
          value={tags.join(', ')}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

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
        {/* Tag badges */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </button>

      {/* Format badge */}
      <span
        className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 ${getFormatBadgeStyle(fx.format)}`}
      >
        {fx.format}
      </span>

      {/* Tags edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditTags();
        }}
        className="flex-shrink-0 text-[11px] px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors"
        title="Edit tags"
      >
        ✏️
      </button>

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

// ── Chain Row (Issue #96) ── with tags (Issue #97) ──────────

interface ChainRowProps {
  chain: FxChainSearchResult;
  selectedTrack: number | null;
  isLoading: boolean;
  onLoad: (filePath: string) => void;
  tags: string[];
  onEditTags: () => void;
  isEditingTags: boolean;
}

function ChainRow({ chain, selectedTrack, isLoading, onLoad, tags, onEditTags, isEditingTags }: ChainRowProps) {
  const displayName = chain.name.replace(/\.RfxChain$/i, '').replace(/^.*[/\\]/, '');

  if (isEditingTags) {
    return (
      <div className="px-3 py-2 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate"><span className="text-[var(--accent-green)]">🔗 Chain:</span> {displayName}</span>
        </div>
        <TagEditor
          currentTags={tags}
          value={tags.join(', ')}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2
        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
        active:brightness-95 transition-all duration-100 select-none"
    >
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
        {/* Tag badges */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </button>

      {/* Tags edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditTags();
        }}
        className="flex-shrink-0 text-[11px] px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors"
        title="Edit tags"
      >
        ✏️
      </button>

      {/* Size badge */}
      {chain.size > 0 && (
        <span className="flex-shrink-0 text-[10px] text-[var(--text-secondary)] px-2 py-0.5 bg-[var(--bg-tertiary)]">
          {chain.size < 1024 ? `${chain.size}B` : `${(chain.size / 1024).toFixed(0)}KB`}
        </span>
      )}

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

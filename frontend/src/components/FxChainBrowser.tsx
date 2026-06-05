import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Track, FxChainEntry, FxChainInfo, FxChainSearchResult, FxChainCachedSearchResult } from '../hooks/useReaper';


interface FxChainSearchResult {
  filePath: string;
  name: string;
  size: number;
}

interface DirData { chains: FxChainEntry[]; dirs: string[] }

interface FxChainBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  fxChainGetDirectory: (path: string) => Promise<DirData>;
  fxChainSave: (trackIdx: number, filePath: string) => Promise<boolean>;
  fxChainLoad: (trackIdx: number, filePath: string, mode?: 'replace' | 'append') => Promise<boolean>;
  fxChainGetInfo: (filePath: string) => Promise<FxChainInfo | null>;
  fxChainSearchRecursive?: (query: string, rootPath: string) => Promise<{ query: string; results: FxChainSearchResult[] }>;
  fxChainSearchCached?: (query: string, rootPath: string, offset?: number, limit?: number) => Promise<FxChainCachedSearchResult>;
  fxChainRefreshCache?: (rootPath: string) => Promise<{ refreshed: boolean; count: number }>;

  onBack: () => void;
  initialPath?: string;
}

function joinPath(a: string, b: string): string {
  return a.replace(/\/+$/, '') + '/' + b;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FxChainBrowser({
  tracks,
  selectedTrack,
  fxChainGetDirectory,
  fxChainSave,
  fxChainLoad,
  fxChainGetInfo,
  fxChainSearchRecursive,
  fxChainSearchCached,
  fxChainRefreshCache,
  onBack,
  initialPath,
}: FxChainBrowserProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [rootPath, setRootPath] = useState(initialPath || '');

  const [rootData, setRootData] = useState<DirData>({ chains: [], dirs: [] });
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  // Expanded dir paths -> their loaded data
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subData, setSubData] = useState<Map<string, DirData>>(new Map());
  const [subLoading, setSubLoading] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [remoteSearchResults, setRemoteSearchResults] = useState<FxChainSearchResult[] | null>(null);
  const [remoteSearchTotal, setRemoteSearchTotal] = useState<number>(0);
  const [remoteSearchOffset, setRemoteSearchOffset] = useState<number>(0);
  const [remoteSearching, setRemoteSearching] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 16;
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [chainInfo, setChainInfo] = useState<FxChainInfo | null>(null);
  const [viewMode, setViewMode] = useState<'browse' | 'save'>('browse');
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRoot = useCallback(async (path: string) => {
    if (!path) return;
    setRootLoading(true);
    setRootError(null);
    setExpanded(new Set());
    setSubData(new Map());
    try {
      const data = await fxChainGetDirectory(path);
      setRootData(data);
    } catch (err) {
      setRootError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setRootLoading(false);
    }
  }, [fxChainGetDirectory]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoot(rootPath); }, [rootPath]);


  const toggleDir = useCallback(async (dirPath: string) => {
    if (expanded.has(dirPath)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(dirPath); return s; });
      return;
    }
    setExpanded(prev => new Set(prev).add(dirPath));
    if (!subData.has(dirPath)) {
      setSubLoading(prev => new Set(prev).add(dirPath));
      try {
        const data = await fxChainGetDirectory(dirPath);
        setSubData(prev => new Map(prev).set(dirPath, data));
      } finally {
        setSubLoading(prev => { const s = new Set(prev); s.delete(dirPath); return s; });
      }
    }
  }, [expanded, subData, fxChainGetDirectory]);

  const handleLoad = useCallback(async (filePath: string, mode: 'replace' | 'append') => {
    if (selectedTrack === null) return;
    setLoadingFile(filePath);
    try {
      const ok = await fxChainLoad(selectedTrack, filePath, mode);
      if (ok) {
        setLoadedFiles(prev => new Set(prev).add(filePath));
        setTimeout(() => setLoadedFiles(prev => { const s = new Set(prev); s.delete(filePath); return s; }), 2000);
      }
    } finally {
      setLoadingFile(null);
    }
  }, [selectedTrack, fxChainLoad]);

  const handleSelectChain = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const info = await fxChainGetInfo(filePath);
      setChainInfo(info);
    } catch { setChainInfo(null); }
  }, [fxChainGetInfo]);

  const handleSave = useCallback(async () => {
    if (selectedTrack === null || !saveName.trim()) return;
    let fileName = saveName.trim();
    if (!fileName.toLowerCase().endsWith('.rfxchain')) fileName += '.RfxChain';
    setSaving(true);
    try {
      const ok = await fxChainSave(selectedTrack, joinPath(rootPath, fileName));
      if (ok) { setSaveName(''); setViewMode('browse'); await loadRoot(rootPath); }
    } finally { setSaving(false); }
  }, [selectedTrack, saveName, rootPath, fxChainSave, loadRoot]);

  // Search: collect all visible chains (root + expanded subdirs)
  const allVisibleChains = useMemo(() => {
    const result: { filePath: string; name: string; size: number }[] = [];
    for (const c of rootData.chains) result.push({ filePath: joinPath(rootPath, c.name), name: c.name, size: c.size });
    for (const [dirPath, data] of subData) {
      for (const c of data.chains) result.push({ filePath: joinPath(dirPath, c.name), name: c.name, size: c.size });
    }
    return result;
  }, [rootPath, rootData, subData]);

  // Debounced backend search (300ms)
  // Uses cached search when available, falls back to recursive search
  useEffect(() => {
    if (!search.trim()) {
      setRemoteSearchResults(null);
      setRemoteSearchTotal(0);
      setRemoteSearchOffset(0);
      setRemoteSearching(false);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (!rootPath) {
      setRemoteSearching(false);
      setRemoteSearchResults(null);
      return;
    }

    setRemoteSearching(true);
    setRemoteSearchOffset(0);
    searchTimerRef.current = setTimeout(async () => {
      try {
        if (fxChainSearchCached) {
          // Use cached search (zero IO, supports pagination)
          const result = await fxChainSearchCached(search, rootPath, 0, pageSize);
          setRemoteSearchResults(result.results);
          setRemoteSearchTotal(result.total);
          setRemoteSearchOffset(result.offset + result.results.length);
        } else if (fxChainSearchRecursive) {
          // Fallback to recursive search (deprecated)
          const result = await fxChainSearchRecursive(search, rootPath);
          setRemoteSearchResults(result.results);
          setRemoteSearchTotal(result.results.length);
          setRemoteSearchOffset(result.results.length);
        } else {
          setRemoteSearchResults([]);
          setRemoteSearchTotal(0);
        }
      } catch {
        setRemoteSearchResults([]);
        setRemoteSearchTotal(0);
      } finally {
        setRemoteSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, rootPath, fxChainSearchCached, fxChainSearchRecursive]);

  // Load next page of cached search results
  const handleNextPage = useCallback(async () => {
    if (!search.trim() || !rootPath || !fxChainSearchCached || remoteSearchOffset >= remoteSearchTotal) return;
    try {
      const result = await fxChainSearchCached(search, rootPath, remoteSearchOffset, pageSize);
      setRemoteSearchResults(prev => {
        const merged = [...(prev || [])];
        const seenPaths = new Set(merged.map(r => r.filePath));
        for (const r of result.results) {
          if (!seenPaths.has(r.filePath)) {
            merged.push(r);
            seenPaths.add(r.filePath);
          }
        }
        return merged;
      });
      setRemoteSearchOffset(result.offset + result.results.length);
    } catch {
      // Silently ignore
    }
  }, [search, rootPath, fxChainSearchCached, remoteSearchOffset, remoteSearchTotal]);

  // Merge local and remote results, deduplicate by filePath

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();

    // Start with local visible chains
    const local = allVisibleChains.filter(c => c.name.toLowerCase().includes(q));

    // If remote search hasn't returned yet, just show local
    if (!remoteSearchResults) return local;

    // Merge with remote results, deduplicating by filePath
    const seenPaths = new Set(local.map(c => c.filePath));
    const merged = [...local];
    for (const r of remoteSearchResults) {
      if (!seenPaths.has(r.filePath)) {
        merged.push(r);
        seenPaths.add(r.filePath);
      }
    }
    return merged;
  }, [search, allVisibleChains, remoteSearchResults]);

  const hasMoreResults = remoteSearchTotal > (remoteSearchResults ? remoteSearchResults.length : 0);


  const selectedTrackName = selectedTrack !== null ? tracks.find(t => t.index === selectedTrack)?.name : null;

  function FileRow({ filePath, name, size }: { filePath: string; name: string; size: number }) {
    const isSelected = selectedFile === filePath;
    const isLoading = loadingFile === filePath;
    const isLoaded = loadedFiles.has(filePath);
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors ${isSelected ? 'ring-1 ring-[var(--accent-orange)]/40' : ''}`}>
        <button onClick={() => handleSelectChain(filePath)} className="flex-1 min-w-0 text-left">
          <div className="text-sm truncate">{name}</div>
          {size > 0 && <div className="text-[10px] text-[var(--text-secondary)]">{formatSize(size)}</div>}
        </button>
        {isSelected && chainInfo && (
          <span className="text-[10px] text-[var(--accent-blue)] px-1.5 py-0.5 bg-[var(--accent-blue)]/10 shrink-0">
            {chainInfo.fxCount} FX
          </span>
        )}
        <button
          onClick={() => handleLoad(filePath, 'replace')}
          disabled={selectedTrack === null || isLoading}
          className={`shrink-0 px-3 py-1.5 text-xs font-medium min-h-[44px] transition-all active:brightness-95 ${
            selectedTrack === null ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
            : isLoaded ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
            : isLoading ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'}`}
        >
          {isLoaded ? '✓' : isLoading ? '…' : 'Load'}
        </button>
        <button
          onClick={() => handleLoad(filePath, 'append')}
          disabled={selectedTrack === null || isLoading}
          className="shrink-0 px-2 py-1.5 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] min-h-[44px] hover:text-[var(--text-primary)] transition-colors"
          title="Append"
        >+</button>
      </div>
    );
  }

  function DirSection({ dirPath, dirName, depth }: { dirPath: string; dirName: string; depth: number }) {
    const isExpanded = expanded.has(dirPath);
    const isLoading = subLoading.has(dirPath);
    const data = subData.get(dirPath);
    return (
      <div>
        <button
          onClick={() => toggleDir(dirPath)}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors text-left"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <span className="text-[10px] text-[var(--text-secondary)] w-3">{isExpanded ? '▼' : '▶'}</span>
          <span className="text-sm">📁</span>
          <span className="text-sm font-medium flex-1">{dirName}</span>
          {isLoading && <span className="text-[10px] text-[var(--text-secondary)]">loading…</span>}
        </button>
        {isExpanded && data && (
          <div style={{ paddingLeft: `${depth * 8}px` }}>
            {data.dirs.map(sub => (
              <DirSection key={sub} dirPath={joinPath(dirPath, sub)} dirName={sub} depth={depth + 1} />
            ))}
            {data.chains.map(c => (
              <FileRow key={c.name} filePath={joinPath(dirPath, c.name)} name={c.name} size={c.size} />
            ))}
            {data.dirs.length === 0 && data.chains.length === 0 && (
              <div className="px-4 py-2 text-[11px] text-[var(--text-secondary)] italic">Empty</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">← Back</button>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">FX Chains</h2>
        </div>
        {selectedTrackName && (
          <span className="text-xs text-[var(--text-secondary)]">→ <span className="text-[var(--text-primary)]">{selectedTrackName}</span></span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex border-b border-[var(--border)]">
        {(['browse', 'save'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            disabled={mode === 'save' && selectedTrack === null}
            className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${
              viewMode === mode ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
              : mode === 'save' && selectedTrack === null ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}
          >{mode === 'browse' ? 'Browse & Load' : 'Save Chain'}</button>
        ))}
      </div>

      {viewMode === 'browse' && (
        <>
          {/* Search */}
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">🔍</span>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search all FX chains…"
                className="w-full pl-8 pr-3 py-2 bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
              />
              {remoteSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--accent-orange)] animate-pulse">Searching all folders…</span>

              )}
            </div>
          </div>

          {selectedTrack === null && (
            <div className="px-4 py-3 bg-[var(--accent-yellow)]/15 border-b border-[var(--accent-yellow)]/30">
              <p className="text-xs text-[var(--accent-yellow)]">⚠ Select a track first (Tracks tab) to load FX chains</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {!rootPath ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-8 text-center space-y-2">
                <div className="text-4xl">📁</div>
                <p className="text-sm">Set the FX Chains folder path in Settings</p>
              </div>
            ) : rootLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
                <div className="text-4xl animate-pulse">🔗</div>
                <p className="text-sm">Loading…</p>
              </div>
            ) : rootError ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
                <div className="text-4xl">⚠️</div>
                <p className="text-sm text-[var(--accent-red)]">{rootError}</p>
                <button onClick={() => loadRoot(rootPath)} className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95">Retry</button>
              </div>
            ) : searchResults ? (
              /* Search results — flat list across all loaded dirs */
              <div className="px-3 py-2 space-y-1">
                {searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)] text-sm">No results for &ldquo;{search}&rdquo;</div>
                ) : (
                  <>
                    {searchResults.map(c => (
                      <FileRow key={c.filePath} filePath={c.filePath} name={c.name} size={c.size} />
                    ))}
                    {hasMoreResults && (
                      <div className="flex justify-center pt-2 pb-1">
                        <button
                          onClick={handleNextPage}
                          className="px-6 py-2.5 text-xs font-medium bg-[var(--accent-dim)] text-[var(--accent-orange)] active:brightness-95 transition-colors"
                        >
                          Next ({remoteSearchTotal - (remoteSearchResults?.length || 0)} more)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              /* Tree view */
              <div className="space-y-px">
                {rootData.dirs.map(dir => (
                  <DirSection key={dir} dirPath={joinPath(rootPath, dir)} dirName={dir} depth={0} />
                ))}
                {rootData.chains.map(c => (
                  <FileRow key={c.name} filePath={joinPath(rootPath, c.name)} name={c.name} size={c.size} />
                ))}
                {rootData.dirs.length === 0 && rootData.chains.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)] space-y-2">
                    <div className="text-5xl">📭</div>
                    <p className="text-sm">No FX chains found in this folder</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedFile && chainInfo && (
            <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Chain Info</span>
                <span className="text-[10px] text-[var(--text-secondary)]">{chainInfo.fxCount} FX · {formatSize(chainInfo.fileSize)}</span>
              </div>
              {chainInfo.fxNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {chainInfo.fxNames.map((name, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{name}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {viewMode === 'save' && (
        <div className="flex-1 flex flex-col p-6">
          <div className="bg-[var(--bg-tertiary)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Save FX Chain</h3>
            {selectedTrackName && <p className="text-xs text-[var(--text-secondary)]">From <span className="text-[var(--text-primary)]">{selectedTrackName}</span></p>}
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Name</label>
              <div className="flex items-center gap-2">
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="My Chain"
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                  className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
                />
                <span className="text-[10px] text-[var(--text-secondary)]">.RfxChain</span>
              </div>
            </div>
            <div className="text-xs text-[var(--text-secondary)] font-mono truncate bg-[var(--bg-secondary)] px-3 py-2">{rootPath}/</div>
            <button onClick={handleSave} disabled={!saveName.trim() || saving}
              className={`w-full py-3 text-sm font-medium transition-all active:brightness-95 ${!saveName.trim() || saving ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]/50 cursor-not-allowed' : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'}`}
            >{saving ? 'Saving…' : '💾 Save FX Chain'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

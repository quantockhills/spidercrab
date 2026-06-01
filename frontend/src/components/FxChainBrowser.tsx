import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Track, FxChainEntry, FxChainInfo } from '../hooks/useReaper';

// ── Types ────────────────────────────────────────────────────

interface FxChainBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  fxChainGetDirectory: (path: string) => Promise<{chains: FxChainEntry[]}>;
  fxChainSave: (trackIdx: number, filePath: string) => Promise<boolean>;
  fxChainLoad: (trackIdx: number, filePath: string, mode?: 'replace' | 'append') => Promise<boolean>;
  fxChainGetInfo: (filePath: string) => Promise<FxChainInfo | null>;
  onBack: () => void;
  initialPath?: string;
}

const DEFAULT_CHAIN_DIR = '/tmp';

// ── Component ─────────────────────────────────────────────────

export function FxChainBrowser({
  tracks,
  selectedTrack,
  fxChainGetDirectory,
  fxChainSave,
  fxChainLoad,
  fxChainGetInfo,
  onBack,
  initialPath,
}: FxChainBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || DEFAULT_CHAIN_DIR);
  const [chains, setChains] = useState<FxChainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [chainInfo, setChainInfo] = useState<FxChainInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'browse' | 'save'>('browse');

  const handleNavigate = useCallback((entry: FxChainEntry) => {
    if (entry.type === 'dir') {
      if (entry.name === '..') {
        const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
        setCurrentPath(parent || '/');
      } else {
        setCurrentPath(currentPath + '/' + entry.name);
      }
    }
  }, [currentPath]);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fxChainGetDirectory(path);
      setChains(result.chains || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setChains([]);
    } finally {
      setLoading(false);
    }
}, [fxChainGetDirectory]);

  useEffect(() => {
    let cancelled = false;
    fxChainGetDirectory(currentPath)
      .then((result) => {
        if (cancelled) return;
        setChains(result.chains || []);
        setLoading(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load directory');
        setChains([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  // Get info about a selected FX chain file
  const handleSelectChain = useCallback(async (entry: FxChainEntry) => {
    const filePath = currentPath + '/' + entry.name;
    setSelectedFile(filePath);
    try {
      const info = await fxChainGetInfo(filePath);
      setChainInfo(info);
    } catch {
      setChainInfo(null);
    }
  }, [currentPath, fxChainGetInfo]);

  // Load FX chain onto selected track
  const handleLoadChain = useCallback(async (filePath: string, mode: 'replace' | 'append' = 'replace') => {
    if (selectedTrack === null) return;
    setLoadingName(filePath);
    try {
      const ok = await fxChainLoad(selectedTrack, filePath, mode);
      if (ok) {
        setLoadedFiles((prev) => new Set(prev).add(filePath));
        setTimeout(() => {
          setLoadedFiles((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to load FX chain:', err);
    } finally {
      setLoadingName(null);
    }
  }, [selectedTrack, fxChainLoad]);

  // Save current track's FX chain
  const handleSaveChain = useCallback(async () => {
    if (selectedTrack === null || !saveName.trim()) return;

    // Ensure .RfxChain extension
    let fileName = saveName.trim();
    if (!fileName.endsWith('.RfxChain') && !fileName.endsWith('.rfxchain')) {
      fileName += '.RfxChain';
    }

    const filePath = currentPath + '/' + fileName;
    setSaving(true);
    try {
      const ok = await fxChainSave(selectedTrack, filePath);
      if (ok) {
        // Refresh directory listing
        await loadDirectory(currentPath);
        setSaveName('');
        setViewMode('browse');
      }
    } catch (err) {
      console.error('Failed to save FX chain:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedTrack, saveName, currentPath, fxChainSave, loadDirectory]);

  // Filtered chain list
  const filteredChains = useMemo(() => {
    const lower = search.trim().toLowerCase();
    // Separate dirs from files, sort dirs first
    const dirs = chains.filter((c) => c.type === 'dir' && (!lower || c.name.toLowerCase().includes(lower)));
    const files = chains.filter((c) => c.type !== 'dir' && (!lower || c.name.toLowerCase().includes(lower)));
    // Add '..' for parent navigation if not at root
    // Show '..' parent entry only when not filtering by search
    if (currentPath !== '/' && currentPath !== '' && !lower) {
      return [{name: '..', size: 0, type: 'dir'}, ...dirs, ...files];
    }
    return [...dirs, ...files];
  }, [chains, search, currentPath]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedTrackName = selectedTrack !== null
    ? tracks.find((t) => t.index === selectedTrack)?.name
    : null;

  const hasFxOnTrack = selectedTrack !== null;
  // Check if track has any FX (show save option only if yes)

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
            FX Chains
          </h2>
        </div>
        {selectedTrackName && (
          <span className="text-xs text-[var(--text-secondary)]">
            Target: <span className="text-[var(--text-primary)]">{selectedTrackName}</span>
          </span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setViewMode('browse')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            viewMode === 'browse'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          }`}
        >
          Browse & Load
        </button>
        <button
          onClick={() => setViewMode('save')}
          disabled={selectedTrack === null || !hasFxOnTrack}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            viewMode === 'save'
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
              : selectedTrack === null || !hasFxOnTrack
                ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          }`}
        >
          Save Chain
        </button>
      </div>

      {/* Browse/Load mode */}
      {viewMode === 'browse' && (
        <>
          {/* Path + Search */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate flex-1">
                📁 {currentPath || '/'}
              </span>
              <button
                onClick={() => setCurrentPath(DEFAULT_CHAIN_DIR)}
                className="text-[10px] px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
              >
                Reset
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter chains..."
                className="w-full pl-8 pr-3 py-2 bg-[var(--bg-tertiary)] text-sm
                  text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                  outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
              />
            </div>
          </div>

          {/* No track selected warning */}
          {selectedTrack === null && (
            <div className="px-4 py-3 bg-[var(--accent-yellow)]/15 border-b border-[var(--accent-yellow)]/30">
              <p className="text-xs text-[var(--accent-yellow)]">
                ⚠ Select a track first (Tracks tab) to load FX chains
              </p>
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
                <div className="text-4xl animate-pulse">🔗</div>
                <p className="text-sm">Loading FX chains...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
                <div className="text-4xl">⚠️</div>
                <p className="text-sm text-[var(--accent-red)]">{error}</p>
                <button
                  onClick={() => currentPath && loadDirectory(currentPath)}
                  className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : chains.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
                <div className="text-5xl mb-2">📭</div>
                <p className="text-sm">No FX chain files found</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Save an FX chain first or place .RfxChain files in this directory
                </p>
              </div>
            ) : filteredChains.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
                <div className="text-4xl">🔍</div>
                <p className="text-sm">No results matching &quot;{search}&quot;</p>
              </div>
            ) : (
              <div className="px-3 py-2 space-y-1">
                {filteredChains.map((entry) => {
                  const fullPath = currentPath + '/' + entry.name;
                  const isSelected = selectedFile === fullPath;
                  const isLoading = loadingName === fullPath;
                  const isLoaded = loadedFiles.has(fullPath);

                  return (
                    <div
                      key={entry.name}
                      className={`
                        flex items-center gap-2.5 px-3 py-2
                        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
                        active:brightness-95 transition-colors duration-100 select-none
                        ${isSelected ? 'ring-1 ring-[var(--accent-orange)]/40' : ''}
                      `}
                    >
                      {entry.type === 'dir' ? (
                        <button
                          onClick={() => handleNavigate(entry)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          <span className="text-lg flex-shrink-0">
                            {entry.name === '..' ? '📂' : '📁'}
                          </span>
                          <span className="text-sm font-medium truncate">{entry.name}</span>
                        </button>
                      ) : (
                        <div>
                      {/* Chain info - tap to select */}
                      <button
                        onClick={() => handleSelectChain(entry)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-sm font-medium truncate">{entry.name}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          {formatSize(entry.size)}
                        </div>
                      </button>

                      {/* FX count badge from info */}
                      {isSelected && chainInfo && (
                        <span className="text-[10px] text-[var(--accent-blue)] px-1.5 py-0.5 bg-[var(--accent-blue)]/10">
                          {chainInfo.fxCount} FX
                        </span>
                      )}

                      {/* Load (Replace) button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadChain(fullPath, 'replace');
                        }}
                        disabled={selectedTrack === null || isLoading}
                        className={`
                          flex-shrink-0 px-3 py-1.5 text-xs font-medium
                          transition-all active:brightness-95 min-h-[44px]
                          ${selectedTrack === null
                            ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
                            : isLoaded
                              ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                              : isLoading
                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                                : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                          }
                        `}
                      >
                        {isLoaded ? '✓ Loaded' : isLoading ? '...' : 'Load'}
                      </button>

                      {/* Append button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadChain(fullPath, 'append');
                        }}
                        disabled={selectedTrack === null || isLoading}
                        className="
                          flex-shrink-0 px-2 py-1.5 text-[10px] font-medium
                          bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
                          transition-all active:brightness-95 min-h-[44px]
                          hover:text-[var(--text-primary)]
                        "
                        title="Append to existing FX chain"
                      >
                        +
                      </button>
                    </div>
                  )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chain info panel */}
          {selectedFile && chainInfo && (
            <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Chain Info
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {chainInfo.fxCount} FX · {formatSize(chainInfo.fileSize)}
                </span>
              </div>
              {chainInfo.fxNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {chainInfo.fxNames.map((name, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {!loading && chains.length > 0 && (
            <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{chains.length} chain files{search ? ` (${filteredChains.length} filtered)` : ''}</span>
              {selectedTrackName && <span>→ {selectedTrackName}</span>}
            </div>
          )}
        </>
      )}

      {/* Save mode */}
      {viewMode === 'save' && (
        <div className="flex-1 flex flex-col p-6">
          <div className="bg-[var(--bg-tertiary)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Save FX Chain</h3>

            {selectedTrackName && (
              <p className="text-xs text-[var(--text-secondary)]">
                Save FX chain from <span className="text-[var(--text-primary)]">{selectedTrackName}</span>
              </p>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                Chain Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Chain"
                  className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] text-sm
                    text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                    outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveChain();
                  }}
                />
                <span className="text-[10px] text-[var(--text-secondary)]">.RfxChain</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                Save To
              </label>
              <div className="text-xs text-[var(--text-secondary)] font-mono truncate bg-[var(--bg-secondary)] px-3 py-2">
                {currentPath}/
              </div>
            </div>

            <button
              onClick={handleSaveChain}
              disabled={!saveName.trim() || saving}
              className={`
                w-full py-3 text-sm font-medium transition-all active:brightness-95
                ${!saveName.trim() || saving
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
                  : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                }
              `}
            >
              {saving ? 'Saving...' : '💾 Save FX Chain'}
            </button>

            <div className="text-[10px] text-[var(--text-secondary)] text-center mt-2">
              Saves the entire FX chain (all plugins + their settings) from the selected track
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

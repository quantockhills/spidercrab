import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Track, DirEntry } from '../hooks/useReaper';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { WaveformDisplay } from './WaveformDisplay';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useDragContext } from '../hooks/useDragContext';

// ── Types ────────────────────────────────────────────────────

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
}

interface SampleBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  getDirectory: (path: string) => Promise<{entries: DirEntry[]}>;
  sendSampleToTrack: (path: string, trackIdx: number) => Promise<boolean>;
  sendCommand: (command: string, params?: Record<string, unknown>) => Promise<{ payload: Record<string, unknown> }>;
  onBack: () => void;
  sendToSlot?: (path: string, column: number, row: number) => Promise<boolean>;
  samplePaths?: string[];
}

// ── Component ─────────────────────────────────────────────────

export function SampleBrowser({
  tracks,
  selectedTrack,
  getDirectory,
  sendSampleToTrack,
  sendCommand,
  onBack,
  samplePaths,
}: SampleBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>(
    () => {
      // If samplePaths is provided (even empty), start with empty (show root selector)
      if (samplePaths !== undefined) return '';
      return localStorage.getItem('sampleBrowserRootPath') || '/tmp';
    }
  );
  const [currentRoot, setCurrentRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentFiles, setSentFiles] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Context menu state (Issue #28)
  const [contextMenu, setContextMenu] = useState<{
    entry: DirEntry;
    fullPath: string;
    x: number;
    y: number;
  } | null>(null);

  const { startDrag } = useDragContext();

  // File info modal state (Issue #28)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);

  // Root path editing state (Issue #28)
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootPathInput, setRootPathInput] = useState(currentPath);

  // Cross-root search state (Issue #101, Acceptance Criterion #4)
  const [crossRootResults, setCrossRootResults] = useState<{
    root: string;
    entries: DirEntry[];
    error?: string;
  }[] | null>(null);
  const [crossRootLoading, setCrossRootLoading] = useState(false);

  const audioPreview = useAudioPreview(selectedFile, sendCommand);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      const result = await getDirectory(path);
      setError(null);
      setEntries(result.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [getDirectory]);

  // Save root path to localStorage when it changes (only for legacy single-path mode)
  useEffect(() => {
    if (currentPath) {
      localStorage.setItem('sampleBrowserRootPath', currentPath);
    }
  }, [currentPath]);

  // Cross-root search effect: when at root selector with a search query,
  // fetch directories from ALL configured roots and merge results client-side (Issue #101)
  useEffect(() => {
    if (!currentPath && samplePaths && samplePaths.length > 0 && search.trim()) {
      let cancelled = false;
      setCrossRootLoading(true);
      setCrossRootResults(null);

      const results = samplePaths.map(async (root) => {
        try {
          const result = await getDirectory(root);
          return { root, entries: result.entries || [], error: undefined };
        } catch (err) {
          return {
            root,
            entries: [],
            error: err instanceof Error ? err.message : 'Failed to load directory',
          };
        }
      });

      Promise.all(results).then((all) => {
        if (!cancelled) {
          setCrossRootResults(all);
          setCrossRootLoading(false);
        }
      });

      return () => { cancelled = true; };
    } else {
      // Not in cross-root search mode — clear results
      setCrossRootResults(null);
      setCrossRootLoading(false);
    }
  }, [currentPath, search, samplePaths, getDirectory]);

  // Load directory on mount / path change
  useEffect(() => {
    if (!currentPath) {
      // Root selector mode — don't load any directory
      setLoading(false);
      setEntries([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDirectory(currentPath)
      .then((result) => {
        if (!cancelled) {
          setError(null);
          setEntries(result.entries || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load directory');
          setEntries([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [currentPath, getDirectory]);

  const handleSelectRoot = useCallback((root: string) => {
    setCurrentRoot(root);
    setCurrentPath(root);
    setCrossRootResults(null);
  }, []);

  const handleRootPathSubmit = useCallback(() => {
    const trimmed = rootPathInput.trim();
    if (trimmed) {
      setCurrentPath(trimmed);
      setLoading(true);
    }
    setEditingRoot(false);
  }, [rootPathInput]);

  const handleNavigate = useCallback((entry: DirEntry) => {
    if (entry.type === 'dir') {
      if (entry.name === '..') {
        // Go up one level
        const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
        // If we're at the root of our current root directory, return to root selector
        if (currentRoot && parent === currentRoot) {
          // Root level — go back to root selector
          setCurrentRoot(null);
          setCurrentPath('');
          return;
        }
        setCurrentPath(parent || '/');
      } else {
        setCurrentPath(currentPath + '/' + entry.name);
      }
    }
  }, [currentPath, currentRoot]);

  const handleSendToTrack = useCallback(async (entry: DirEntry, basePath?: string) => {
    if (selectedTrack === null || entry.type !== 'file') return;
    const fullPath = (basePath || currentPath) + '/' + entry.name;
    setSending(entry.name);
    try {
      const ok = await sendSampleToTrack(fullPath, selectedTrack);
      if (ok) {
        setSentFiles((prev) => new Set(prev).add(entry.name));
        setTimeout(() => {
          setSentFiles((prev) => {
            const next = new Set(prev);
            next.delete(entry.name);
            return next;
          });
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to send sample:', err);
    } finally {
      setSending(null);
    }
  }, [selectedTrack, currentPath, sendSampleToTrack]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const lower = search.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(lower));
  }, [entries, search]);

  // Separate dirs and files for display
  const dirs = useMemo(() => filteredEntries.filter((e) => e.type === 'dir'), [filteredEntries]);
  const files = useMemo(() => filteredEntries.filter((e) => e.type === 'file'), [filteredEntries]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Audio file extensions
  const isAudioFile = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['wav', 'mp3', 'flac', 'ogg', 'aiff', 'aif', 'm4a', 'wma'].includes(ext || '');
  };

  // Format time in seconds to mm:ss
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileClick = useCallback((entry: DirEntry, basePath?: string) => {
    if (entry.type !== 'file') return;
    const fullPath = (basePath || currentPath) + '/' + entry.name;
    if (selectedFile === fullPath) {
      // Click same file again — close preview
      audioPreview.stop();
      setSelectedFile(null);
    } else {
      audioPreview.stop();
      setSelectedFile(fullPath);
    }
  }, [currentPath, selectedFile, audioPreview]);

  // Long-press handler for context menu (Issue #28)
  const handleLongPress = useCallback((entry: DirEntry, basePath: string, x: number, y: number) => {
    if (entry.type !== 'file') return;
    const fullPath = basePath + '/' + entry.name;
    setContextMenu({ entry, fullPath, x, y });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Context menu actions (Issue #28)
  const getContextMenuItems = useCallback((entry: DirEntry, fullPath: string): ContextMenuItem[] => {
    const isAudio = isAudioFile(entry.name);
    const items: ContextMenuItem[] = [];

    if (isAudio && selectedTrack !== null) {
      items.push({
        label: 'Send to Track',
        icon: '🎯',
        action: () => {
          sendSampleToTrack(fullPath, selectedTrack).then((ok) => {
            if (ok) {
              setSentFiles((prev) => new Set(prev).add(entry.name));
              setTimeout(() => {
                setSentFiles((prev) => {
                  const next = new Set(prev);
                  next.delete(entry.name);
                  return next;
                });
              }, 2000);
            }
          }).catch(console.error);
        },
      });
    }

    items.push({
      label: 'Start Drag to Slot',
      icon: '↗️',
      action: () => {
        startDrag({ path: fullPath, name: entry.name });
      },
    });

    items.push({
      label: 'File Info',
      icon: 'ℹ️',
      action: () => {
        setFileInfo({
          name: entry.name,
          path: fullPath,
          size: entry.size,
          type: isAudio ? 'Audio' : 'File',
        });
      },
    });

    return items;
  }, [selectedTrack, sendSampleToTrack]);

  const handleCloseFileInfo = useCallback(() => {
    setFileInfo(null);
  }, []);

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
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:brightness-95"
            aria-label="Back to tracks"
          >
            ← Back
          </button>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Media Browser
          </h2>
        </div>
        {selectedTrackName && (
          <span className="text-xs text-[var(--text-secondary)]">
            Target: <span className="text-[var(--text-primary)]">{selectedTrackName}</span>
          </span>
        )}
      </div>

      {/* Path breadcrumb + Search */}
      <div className="px-4 py-2.5 border-b border-[var(--border)] space-y-2">
        {/* Current path / Root indicator (Issue #101) */}
        <div className="flex items-center gap-2">
          {currentRoot && (
            <button
              onClick={() => {
                setCurrentRoot(null);
                setCurrentPath('');
              }}
              className="text-[11px] text-[var(--accent-orange)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0 px-2 py-1"
            >
              ← Roots
            </button>
          )}
          {editingRoot ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={rootPathInput}
                onChange={(e) => setRootPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRootPathSubmit();
                  if (e.key === 'Escape') setEditingRoot(false);
                }}
                className="flex-1 px-2 py-1.5 bg-[var(--bg-tertiary)] text-sm font-mono
                  text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent-orange)]/40
                  placeholder:text-[var(--text-secondary)]"
                placeholder="Enter path..."
                autoFocus
              />
              <button
                onClick={handleRootPathSubmit}
                className="px-3 py-1.5 text-xs bg-[var(--accent-dim)] text-[var(--accent-orange)] min-h-[36px] active:brightness-95"
              >
                Go
              </button>
            </div>
          ) : currentPath ? (
            <button
              onClick={() => {
                setRootPathInput(currentPath);
                setEditingRoot(true);
              }}
              className="flex items-center gap-1 flex-1 text-left"
            >
              <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate flex-1">
                📁 {currentPath || '/'}
              </span>
              {!currentRoot && (
                <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0 ml-1">✏️</span>
              )}
            </button>
          ) : null}
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files..."
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
            ⚠ Select a track first (Tracks tab) to send samples
          </p>
        </div>
      )}

      {/* Content — Root selector, cross-root search results, or directory listing */}
      <div className="flex-1 overflow-y-auto">
        {/* Cross-root search mode (Issue #101, Acceptance Criterion #4) */}
        {crossRootLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
            <div className="text-4xl animate-pulse">🔍</div>
            <p className="text-sm">Searching all directories...</p>
          </div>
        ) : crossRootResults !== null ? (
          <CrossRootSearchResults
            results={crossRootResults}
            searchQuery={search}
            selectedTrack={selectedTrack}
            selectedTrackName={selectedTrackName}
            isAudioFile={isAudioFile}
            formatSize={formatSize}
            sending={sending}
            sentFiles={sentFiles}
            selectedFile={selectedFile}
            onSendToTrack={(entry, basePath) => handleSendToTrack(entry, basePath)}
            onFileClick={(entry, basePath) => handleFileClick(entry, basePath)}
            onLongPress={(entry, basePath, x, y) => handleLongPress(entry, basePath, x, y)}
          />
        ) : !currentPath && samplePaths !== undefined ? (
          samplePaths.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
              <div className="text-5xl mb-2">📁</div>
              <p className="text-sm">No sample directories configured</p>
              <p className="text-xs">Go to Settings to add one.</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                Sample Directories
              </h3>
              {samplePaths.map((root) => (
                <button
                  key={root}
                  onClick={() => handleSelectRoot(root)}
                  className="w-full flex items-center gap-3 px-3 py-3
                    bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
                    active:brightness-95 transition-colors duration-100 text-left"
                >
                  <span className="text-lg flex-shrink-0">📁</span>
                  <span className="text-sm font-mono truncate flex-1">{root}</span>
                  <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
                    tap to browse →
                  </span>
                </button>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3">
            <div className="text-4xl animate-pulse">📂</div>
            <p className="text-sm">Loading...</p>
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
        ) : entries.length === 0 && filteredEntries.length === 0 && !search ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-5xl mb-2">📁</div>
            <p className="text-sm">Empty directory</p>
            <p className="text-xs">No files found</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
            <div className="text-4xl">🔍</div>
            <p className="text-sm">No results matching &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className="px-3 py-2 space-y-1">
            {/* Directories */}
            {dirs.map((entry) => (
              <DirRow
                key={entry.name}
                entry={entry}
                onNavigate={handleNavigate}
              />
            ))}
            {/* Files */}
            {files.map((entry) => (
              <FileRow
                key={entry.name}
                entry={entry}
                isAudio={isAudioFile(entry.name)}
                isSending={sending === entry.name}
                isSent={sentFiles.has(entry.name)}
                canSend={selectedTrack !== null}
                formattedSize={formatSize(entry.size)}
                isSelected={selectedFile !== null && currentPath + '/' + entry.name === selectedFile}
                onSend={() => handleSendToTrack(entry)}
                onSelect={() => handleFileClick(entry)}
                onLongPress={(x, y) => handleLongPress(entry, currentPath, x, y)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu (Issue #28) */}
      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems(contextMenu.entry, contextMenu.fullPath)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* File Info modal (Issue #28) */}
      {fileInfo && (
        <FileInfoModal info={fileInfo} onClose={handleCloseFileInfo} />
      )}

      {/* Audio preview panel */}
      {selectedFile && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-primary)] truncate flex-1">
              🎵 {selectedFile.split('/').pop()}
            </span>
            <button
              onClick={() => { audioPreview.stop(); setSelectedFile(null); }}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 min-h-[36px]"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>

          {audioPreview.isLoading && (
            <div className="px-4 py-8 flex justify-center">
              <div className="text-sm text-[var(--text-secondary)] animate-pulse">Loading audio...</div>
            </div>
          )}

          {audioPreview.error && (
            <div className="px-4 py-4 flex justify-center">
              <div className="text-sm text-[var(--accent-red)]">⚠ {audioPreview.error}</div>
            </div>
          )}

          {audioPreview.peaks && (
            <div className="px-4 pb-3 space-y-2">
              <WaveformDisplay
                peaks={audioPreview.peaks}
                currentTime={audioPreview.currentTime}
                duration={audioPreview.duration}
                isPlaying={audioPreview.isPlaying}
                reverse={audioPreview.reverse}
                onSeek={audioPreview.seek}
                height={64}
              />

              {/* Transport controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={audioPreview.isPlaying ? audioPreview.pause : audioPreview.play}
                  className="px-4 py-2 text-sm font-medium bg-[var(--accent-orange)] text-black min-h-[44px] active:brightness-90"
                  aria-label={audioPreview.isPlaying ? 'Pause' : 'Play'}
                >
                  {audioPreview.isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  onClick={audioPreview.toggleReverse}
                  className={`px-3 py-2 text-sm font-medium min-h-[44px] active:brightness-90 ${
                    audioPreview.reverse
                      ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/40'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}
                  aria-label="Toggle reverse"
                >
                  ↔ Rev
                </button>
                <button
                  onClick={audioPreview.stop}
                  className="px-3 py-2 text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] min-h-[44px] active:brightness-90"
                  aria-label="Stop"
                >
                  ⏹ Stop
                </button>
              </div>

              {/* Time display */}
              <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                <span>{formatTime(audioPreview.currentTime)}</span>
                <span>{formatTime(audioPreview.duration)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer stats */}
      {!loading && currentPath && entries.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-secondary)]">
          <span>{dirs.length} dirs · {files.length} files{search ? ` (filtered)` : ''}</span>
          {currentRoot && <span className="font-mono">📁 {currentRoot}</span>}
          {selectedTrackName && <span>→ {selectedTrackName}</span>}
        </div>
      )}
    </div>
  );
}

// ── Cross-Root Search Results (Issue #101, Acceptance Criterion #4) ──────

interface CrossRootResult {
  root: string;
  entries: DirEntry[];
  error?: string;
}

interface CrossRootSearchResultsProps {
  results: CrossRootResult[];
  searchQuery: string;
  selectedTrack: number | null;
  selectedTrackName: string | null;
  isAudioFile: (name: string) => boolean;
  formatSize: (bytes: number) => string;
  sending: string | null;
  sentFiles: Set<string>;
  selectedFile: string | null;
  onSendToTrack: (entry: DirEntry, basePath: string) => void;
  onFileClick: (entry: DirEntry, basePath: string) => void;
  onLongPress: (entry: DirEntry, basePath: string, x: number, y: number) => void;
}

function CrossRootSearchResults({
  results,
  searchQuery,
  selectedTrack,
  selectedTrackName,
  isAudioFile,
  formatSize,
  sending,
  sentFiles,
  selectedFile,
  onSendToTrack,
  onFileClick,
  onLongPress,
}: CrossRootSearchResultsProps) {
  const lowerQuery = searchQuery.toLowerCase();

  // Filter entries per root by search query, skipping '..' entries
  const filteredResults = useMemo(() => {
    return results
      .map((r) => ({
        root: r.root,
        error: r.error,
        entries: r.entries.filter(
          (e) => e.name !== '..' && e.name.toLowerCase().includes(lowerQuery)
        ),
      }))
      .filter((r) => r.entries.length > 0 || r.error);
  }, [results, lowerQuery]);

  if (filteredResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] space-y-3 p-8 text-center">
        <div className="text-4xl">🔍</div>
        <p className="text-sm">No results matching &quot;{searchQuery}&quot;</p>
      </div>
    );
  }

  let totalFiles = 0;
  filteredResults.forEach((r) => { totalFiles += r.entries.length; });

  return (
    <div className="px-3 py-2 space-y-4">
      <div className="text-[10px] text-[var(--text-secondary)] px-1">
        Searching &quot;{searchQuery}&quot; across {results.length} directories — {totalFiles} result{totalFiles !== 1 ? 's' : ''}
      </div>
      {filteredResults.map((group) => (
        <div key={group.root} className="space-y-1">
          {/* Root header */}
          {group.error ? (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-[11px] font-mono text-[var(--accent-red)] truncate flex-1">
                ⚠ {group.root}: {group.error}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--bg-tertiary)]/50">
              <span className="text-[11px] font-mono text-[var(--accent-orange)] truncate flex-1">
                📁 {group.root}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">
                {group.entries.filter((e) => e.type === 'dir').length} dirs ·{' '}
                {group.entries.filter((e) => e.type === 'file').length} files
              </span>
            </div>
          )}
          {/* Entries within this root */}
          {group.entries.map((entry) => (
            <CrossRootEntryRow
              key={group.root + '/' + entry.name}
              entry={entry}
              basePath={group.root}
              isAudio={isAudioFile(entry.name)}
              isSending={sending === entry.name}
              isSent={sentFiles.has(entry.name)}
              canSend={selectedTrack !== null}
              formattedSize={formatSize(entry.size)}
              isSelected={selectedFile !== null && group.root + '/' + entry.name === selectedFile}
              onSend={() => onSendToTrack(entry, group.root)}
              onSelect={() => onFileClick(entry, group.root)}
              onLongPress={(x, y) => onLongPress(entry, group.root, x, y)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Cross-Root Entry Row ───────────────────────────────────────

interface CrossRootEntryRowProps {
  entry: DirEntry;
  basePath: string;
  isAudio: boolean;
  isSending: boolean;
  isSent: boolean;
  canSend: boolean;
  formattedSize: string;
  isSelected: boolean;
  onSend: () => void;
  onSelect: () => void;
  onLongPress: (x: number, y: number) => void;
}

function CrossRootEntryRow({ entry, basePath, isAudio, isSending, isSent, canSend, formattedSize, isSelected, onSend, onSelect, onLongPress }: CrossRootEntryRowProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(e.clientX, e.clientY);
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (isAudio) {
      onSelect();
    }
  }, [isAudio, onSelect]);

  const icon = entry.type === 'dir' ? '📁' : isAudio ? '🎵' : '📄';

  if (entry.type === 'dir') {
    return (
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2
          bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]/60
          active:brightness-95 transition-colors duration-100 text-left"
      >
        <span className="text-base flex-shrink-0">📁</span>
        <span className="text-sm font-medium truncate flex-1">{entry.name}</span>
        <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">folder</span>
      </button>
    );
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      className={`flex items-center gap-2.5 px-3 py-2
        active:brightness-95 transition-colors duration-100 select-none touch-none
        ${isSelected
          ? 'bg-[var(--accent-orange)]/15 ring-1 ring-[var(--accent-orange)]/30'
          : 'bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]/60'
        }`}
    >
      {/* Play button (audio files only) */}
      {isAudio && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center
            text-sm bg-[var(--bg-tertiary)] hover:bg-[var(--accent-orange)]/20
            active:brightness-90 transition-colors"
          aria-label={isSelected ? 'Close preview' : 'Preview'}
        >
          {isSelected ? '⏹' : '▶'}
        </button>
      )}

      {/* Icon + name */}
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.name}</div>
        {formattedSize && (
          <div className="text-[10px] text-[var(--text-secondary)]">{formattedSize}</div>
        )}
      </div>

      {/* Send to track button (audio files only) */}
      {isAudio && (
        <button
          onClick={(e) => { e.stopPropagation(); onSend(); }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={!canSend || isSending}
          className={`
            flex-shrink-0 px-3 py-1.5 text-xs font-medium
            transition-all active:brightness-95 min-h-[44px]
            ${!canSend
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
              : isSent
                ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                : isSending
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
            }
          `}
        >
          {isSent ? '✓ Sent' : isSending ? '...' : '🎯 Send'}
        </button>
      )}
    </div>
  );
}

// ── Directory Row ─────────────────────────────────────────────

interface DirRowProps {
  entry: DirEntry;
  onNavigate: (entry: DirEntry) => void;
}

function DirRow({ entry, onNavigate }: DirRowProps) {
  return (
    <button
      onClick={() => onNavigate(entry)}
      className="w-full flex items-center gap-3 px-3 py-2.5
        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
        active:brightness-95 transition-colors duration-100 text-left"
    >
      <span className="text-lg flex-shrink-0">
        {entry.name === '..' ? '📂' : '📁'}
      </span>
      <span className="text-sm font-medium truncate flex-1">{entry.name}</span>
      <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0">folder</span>
    </button>
  );
}

// ── File Row ──────────────────────────────────────────────────

interface FileRowProps {
  entry: DirEntry;
  isAudio: boolean;
  isSending: boolean;
  isSent: boolean;
  canSend: boolean;
  formattedSize: string;
  isSelected: boolean;
  onSend: () => void;
  onSelect: () => void;
  onLongPress: (x: number, y: number) => void;
}

function FileRow({ entry, isAudio, isSending, isSent, canSend, formattedSize, isSelected, onSend, onSelect, onLongPress }: FileRowProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(e.clientX, e.clientY);
    }, 500); // 500ms long-press threshold
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(() => {
    // Cancel long-press on drag/move
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressTriggered.current) {
      // Long-press already handled, don't fire click
      longPressTriggered.current = false;
      return;
    }
    if (isAudio) {
      onSelect();
    }
  }, [isAudio, onSelect]);

  const icon = isAudio ? '🎵' : '📄';

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      className={`flex items-center gap-2.5 px-3 py-2
        active:brightness-95 transition-colors duration-100 select-none touch-none
        ${isSelected
          ? 'bg-[var(--accent-orange)]/15 ring-1 ring-[var(--accent-orange)]/30'
          : 'bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]/60'
        }`}
    >
      {/* Play button (audio files only) */}
      {isAudio && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center
            text-sm bg-[var(--bg-tertiary)] hover:bg-[var(--accent-orange)]/20
            active:brightness-90 transition-colors"
          aria-label={isSelected ? 'Close preview' : 'Preview'}
        >
          {isSelected ? '⏹' : '▶'}
        </button>
      )}

      {/* Icon + name */}
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.name}</div>
        {formattedSize && (
          <div className="text-[10px] text-[var(--text-secondary)]">{formattedSize}</div>
        )}
      </div>

      {/* Send to track button (audio files only) */}
      {isAudio && (
        <button
          onClick={(e) => { e.stopPropagation(); onSend(); }}
          onPointerDown={(e) => e.stopPropagation()} // Don't trigger long-press on button
          disabled={!canSend || isSending}
          className={`
            flex-shrink-0 px-3 py-1.5 text-xs font-medium
            transition-all active:brightness-95 min-h-[44px]
            ${!canSend
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]/50 cursor-not-allowed'
              : isSent
                ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                : isSending
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
            }
          `}
        >
          {isSent ? '✓ Sent' : isSending ? '...' : '🎯 Send'}
        </button>
      )}
    </div>
  );
}

// ── File Info Modal (Issue #28) ───────────────────────────────

interface FileInfoModalProps {
  info: FileInfo;
  onClose: () => void;
}

function FileInfoModal({ info, onClose }: FileInfoModalProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl 
          w-[300px] mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">File Info</h3>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[36px] px-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <InfoRow label="Name" value={info.name} />
          <InfoRow label="Type" value={info.type} />
          <InfoRow label="Size" value={formatFileSize(info.size)} />
          <div>
            <span className="text-[11px] text-[var(--text-secondary)] block mb-1">Path</span>
            <div className="text-xs text-[var(--text-primary)] font-mono bg-[var(--bg-tertiary)] p-2 break-all">
              {info.path}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm bg-[var(--accent-dim)] text-[var(--accent-orange)] min-h-[44px] active:brightness-95"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      <span className="text-xs text-[var(--text-primary)] font-medium truncate ml-2 max-w-[200px]">
        {value}
      </span>
    </div>
  );
}

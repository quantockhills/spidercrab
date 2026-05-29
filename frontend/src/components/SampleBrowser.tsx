import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Track, DirEntry } from '../hooks/useReaper';

// ── Types ────────────────────────────────────────────────────

interface SampleBrowserProps {
  tracks: Track[];
  selectedTrack: number | null;
  getDirectory: (path: string) => Promise<{entries: DirEntry[]}>;
  sendSampleToTrack: (path: string, trackIdx: number) => Promise<boolean>;
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────

export function SampleBrowser({
  tracks,
  selectedTrack,
  getDirectory,
  sendSampleToTrack,
  onBack,
}: SampleBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentFiles, setSentFiles] = useState<Set<string>>(new Set());

  // Load initial directory (~/ as default starting point)
  useEffect(() => {
    if (!currentPath) {
      // Detect home dir — defaults to /home/user or /tmp
      setCurrentPath('/tmp');
      return;
    }
    loadDirectory(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDirectory(path);
      setEntries(result.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [getDirectory]);

  const handleNavigate = useCallback((entry: DirEntry) => {
    if (entry.type === 'dir') {
      if (entry.name === '..') {
        // Go up one level
        const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
        setCurrentPath(parent || '/');
      } else {
        setCurrentPath(currentPath + '/' + entry.name);
      }
    }
  }, [currentPath]);

  const handleSendToTrack = useCallback(async (entry: DirEntry) => {
    if (selectedTrack === null || entry.type !== 'file') return;
    const fullPath = currentPath + '/' + entry.name;
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
        {/* Current path */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate flex-1">
            📁 {currentPath || '/'}
          </span>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
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
        ) : entries.length === 0 ? (
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
                onSend={() => handleSendToTrack(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {!loading && entries.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between text-[10px] text-[var(--text-secondary)]">
          <span>{dirs.length} dirs · {files.length} files{search ? ` (filtered)` : ''}</span>
          {selectedTrackName && <span>→ {selectedTrackName}</span>}
        </div>
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
  onSend: () => void;
}

function FileRow({ entry, isAudio, isSending, isSent, canSend, formattedSize, onSend }: FileRowProps) {
  const icon = isAudio ? '🎵' : '📄';

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2
        bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]/60
        active:brightness-95 transition-colors duration-100 select-none"
    >
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
          onClick={onSend}
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

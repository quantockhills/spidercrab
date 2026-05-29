import { useState, useCallback } from 'react';
import { useReaper } from './hooks/useReaper';

function TrackRow({ track, onSelect, onToggleMute, onToggleSolo }: {
  track: { index: number; name: string; muted: boolean; soloed: boolean; selected: boolean };
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer
        active:scale-[0.98] transition-transform
        ${track.selected ? 'bg-[#2a2a3a] ring-1 ring-[var(--accent-dim)]' : 'bg-[var(--bg-tertiary)]'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{track.name || `Track ${track.index + 1}`}</div>
        <div className="text-xs text-[var(--text-secondary)]">Track {track.index + 1}</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSolo(); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${track.soloed
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-white/10 text-[var(--text-secondary)]'}`}
        >
          S
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${track.muted
              ? 'bg-[var(--danger)]/20 text-[var(--danger)]'
              : 'bg-white/10 text-[var(--text-secondary)]'}`}
        >
          {track.muted ? 'MUTED' : 'MUTE'}
        </button>
      </div>
    </div>
  );
}

function App() {
  const { connected, tracks, refreshTracks } = useReaper();
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);

  const handleToggleMute = useCallback((trackIndex: number) => {
    // TODO: implement mute toggle via REAPER API command
    console.log(`Toggle mute on track ${trackIndex}`);
  }, []);

  const handleToggleSolo = useCallback((trackIndex: number) => {
    // TODO: implement solo toggle via REAPER API command
    console.log(`Toggle solo on track ${trackIndex}`);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--bg-secondary)]/95 backdrop-blur-sm
        border-b border-white/5 px-4 py-3
        flex items-center justify-between
        safe-area-top">
        <div>
          <h1 className="text-lg font-bold">Utpaladeva</h1>
          <p className="text-xs text-[var(--text-secondary)]">Reaper Remote</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
          <span className="text-xs text-[var(--text-secondary)]">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 space-y-3 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--text-secondary)] space-y-2">
            <div className="text-4xl">🎛️</div>
            <p className="text-sm">No tracks loaded</p>
            <button
              onClick={() => refreshTracks()}
              className="px-4 py-2 bg-white/10 rounded-xl text-sm active:scale-95 transition-transform"
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Tracks ({tracks.length})
              </h2>
              <button
                onClick={() => refreshTracks()}
                className="p-2 rounded-lg hover:bg-white/5 active:scale-95 transition-transform"
              >
                ↻
              </button>
            </div>
            <div className="space-y-2">
              {tracks.map((track) => (
                <TrackRow
                  key={track.index}
                  track={track}
                  onSelect={() => setSelectedTrack(track.index)}
                  onToggleMute={() => handleToggleMute(track.index)}
                  onToggleSolo={() => handleToggleSolo(track.index)}
                />
              ))}
            </div>
          </>
        )}

        {/* FX section placeholder */}
        {selectedTrack !== null && (
          <div className="mt-6 p-4 bg-[var(--bg-secondary)] rounded-xl">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
              FX on Track {selectedTrack + 1}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Select an FX to edit parameters
            </p>
          </div>
        )}
      </main>

      {/* Bottom safe area spacer */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}

export default App;

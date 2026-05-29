import { useState, useCallback, useEffect } from 'react';
import { useReaper } from './hooks/useReaper';
import { TrackOverview } from './components/TrackOverview';
import { FxBrowser } from './components/FxBrowser';
import { ParamControl } from './components/ParamControl';
import { SampleBrowser } from './components/SampleBrowser';

type Tab = 'media' | 'fx' | 'tracks' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'media',   label: 'Media',   icon: '📂' },
  { id: 'fx',      label: 'FX',      icon: '🎛️' },
  { id: 'tracks',  label: 'Tracks',  icon: '🎚️' },
  { id: 'settings',label: 'Settings',icon: '⚙️' },
];

function App() {
  const {
    connected,
    tracks,
    refreshTracks,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    selectTrack,
    enumerateFx,
    getTrackFx,
    getFxParams,
    setFxParam,
    addFx,
    deleteFx,
    getDirectory,
    sendSampleToTrack,
    play,
    stop,
    getTransportState,
  } = useReaper();

  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);

  // Param control navigation state
  const [paramView, setParamView] = useState<{
    trackIdx: number;
    trackName: string;
    fxIdx: number;
    fxName: string;
  } | null>(null);

  // Refresh tracks on connect
  useEffect(() => {
    if (connected) {
      refreshTracks();
    }
  }, [connected, refreshTracks]);

  const handleSelectTrack = useCallback((index: number) => {
    setSelectedTrack(index);
    selectTrack(index);
  }, [selectTrack]);

  const handleToggleMute = useCallback(async (index: number) => {
    await toggleTrackMute(index);
  }, [toggleTrackMute]);

  const handleToggleSolo = useCallback(async (index: number) => {
    await toggleTrackSolo(index);
  }, [toggleTrackSolo]);

  const handleToggleArm = useCallback(async (index: number) => {
    await toggleTrackArm(index);
  }, [toggleTrackArm]);

  // ── FX / Param navigation ──
  const handleSelectFx = useCallback(
    (trackIdx: number, fxIdx: number, fxName: string) => {
      const track = tracks.find((t) => t.index === trackIdx);
      setParamView({
        trackIdx,
        trackName: track?.name || `Track ${trackIdx + 1}`,
        fxIdx,
        fxName,
      });
    },
    [tracks],
  );

  const handleBackFromParam = useCallback(() => {
    setParamView(null);
  }, []);

  const handleBackFromFxBrowser = useCallback(() => {
    setActiveTab('tracks');
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* ── Status Bar ── */}
      <header className="sticky top-0 z-10 bg-[var(--bg-secondary)]/95 backdrop-blur-sm
        border-b border-white/5 px-4 py-2.5
        flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold">Utpaladeva</h1>
          <span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">
            Reaper Remote
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-secondary)] hidden xs:inline">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
            }`}
          />
          {activeTab === 'tracks' && tracks.length > 0 && (
            <span className="text-[11px] text-[var(--text-secondary)] ml-1">
              {tracks.length} trk
            </span>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'media' && (
          <SampleBrowser
            tracks={tracks}
            selectedTrack={selectedTrack}
            getDirectory={getDirectory}
            sendSampleToTrack={sendSampleToTrack}
            onBack={() => setActiveTab('tracks')}
          />
        )}

        {activeTab === 'fx' && (paramView ? (
          <ParamControl
            key={`${paramView.trackIdx}-${paramView.fxIdx}`}
            trackIdx={paramView.trackIdx}
            trackName={paramView.trackName}
            fxIdx={paramView.fxIdx}
            fxName={paramView.fxName}
            getFxParams={getFxParams}
            setFxParam={setFxParam}
            deleteFx={deleteFx}
            onBack={handleBackFromParam}
          />
        ) : (
          <FxBrowser
            tracks={tracks}
            selectedTrack={selectedTrack}
            enumerateFx={enumerateFx}
            getTrackFx={getTrackFx}
            addFx={addFx}
            onSelectFx={handleSelectFx}
            onBack={handleBackFromFxBrowser}
          />
        ))}

        {activeTab === 'tracks' && (
          <TrackOverview
            tracks={tracks}
            selectedTrack={selectedTrack}
            onSelectTrack={handleSelectTrack}
            onToggleMute={handleToggleMute}
            onToggleSolo={handleToggleSolo}
            onToggleArm={handleToggleArm}
            onRefresh={refreshTracks}
            onPlay={play}
            onStop={stop}
            onGetTransportState={getTransportState}
          />
        )}

        {activeTab === 'settings' && (
          <div className="p-6 text-[var(--text-secondary)] space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider">Settings</h2>
            <div className="bg-[var(--bg-tertiary)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Connection</span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                  <span className="text-xs">{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Server: ws://localhost:9224
              </div>
              <button
                onClick={() => refreshTracks()}
                className="w-full py-2.5 bg-white/10 rounded-xl text-sm active:scale-95 transition-transform"
              >
                Refresh Tracks
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Tab Bar ── */}
      <nav className="sticky bottom-0 z-10 bg-[var(--bg-secondary)]/95 backdrop-blur-sm
        border-t border-white/5 safe-area-bottom">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 gap-0.5
                text-[10px] transition-colors min-h-[52px]
                ${activeTab === tab.id
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-secondary)]'
                }
              `}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom safe area for iPhone notch/home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}

export default App;

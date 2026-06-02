import { useState, useCallback, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { useReaper } from './hooks/useReaper';
import { TrackOverview } from './components/TrackOverview';
import { FxBrowser } from './components/FxBrowser';
import { ParamControl } from './components/ParamControl';
import { SampleBrowser } from './components/SampleBrowser';
import { SessionView } from './components/SessionView';
import { SequencerView } from './components/SequencerView';
import { FxChainBrowser } from './components/FxChainBrowser';
import ErrorBoundary from './components/ErrorBoundary';

type Tab = 'media' | 'fx' | 'tracks' | 'clips' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'media',   label: 'Media',   icon: '📂' },
  { id: 'fx',      label: 'FX',      icon: '🎛️' },
  { id: 'tracks',  label: 'Tracks',  icon: '🎚️' },
  { id: 'clips',   label: 'Playtime',   icon: '🎹' },
  { id: 'settings',label: 'Settings',icon: '⚙️' },
];

function App() {
  const {
    connected,
    tracks,
    refreshTracks,
    addTrack,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    selectTrack,
    setTrackVolume,
    setTrackPan,
    enumerateFx,
    getTrackFx,
    getFxParams,
    setFxParam,
    addFx,
    deleteFx,
    getDirectory,
    sendSampleToTrack,
    sendCommand,
    isRefreshingFx,
    refreshFxCache,
    play,
    stop,
    record,
    getTransportState,
    onEvent,
    updateTrack,
    fxChainGetDirectory,
    fxChainSave,
    fxChainLoad,
    fxChainGetInfo,
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    sequencer,
    getSequencer,
    toggleStep,
    setStep,
    seqClearAll,
    seqSetLength,
    seqSetBaseNote,
  } = useReaper();

  const { preference, isDark, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [sessionMode, setSessionMode] = useState<'session' | 'sequencer'>('session');
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);

  // FX chain browser state (Issue #7)
  const [fxChainView, setFxChainView] = useState(false);
  const [fxChainPath, setFxChainPath] = useState<string>(
    () => localStorage.getItem('fxChainPath') || ''
  );

  useEffect(() => {
    localStorage.setItem('fxChainPath', fxChainPath);
  }, [fxChainPath]);

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

  // Subscribe to real-time track state changes (Issue #57)
  useEffect(() => {
    const unsubTrack = onEvent('event:track_state_changed', (msg: unknown) => {
      const m = msg as Record<string, unknown>;
      const payload = m.payload as Record<string, unknown> || {};
      const trackIdx = payload.trackIdx as number;
      if (trackIdx !== undefined) {
        const updates: Partial<Omit<import('./hooks/useReaper').Track, 'index'>> = {};
        if (payload.muted !== undefined) updates.muted = payload.muted as boolean;
        if (payload.soloed !== undefined) updates.soloed = payload.soloed as boolean;
        if (payload.armed !== undefined) updates.armed = payload.armed as boolean;
        updateTrack(trackIdx, updates);
      }
    });
    const unsubList = onEvent('event:track_list_changed', () => {
      refreshTracks();
    });
    const unsubSlot = onEvent('event:slotStateChanged', () => {
      // Refresh matrix state on any slot change
      getMatrix();
    });
    return () => {
      unsubTrack();
      unsubList();
      unsubSlot();
    };
  }, [onEvent, refreshTracks, updateTrack, getMatrix]);

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

  const handleVolumeChange = useCallback(async (index: number, volume: number) => {
    await setTrackVolume(index, volume);
  }, [setTrackVolume]);

  const handlePanChange = useCallback(async (index: number, pan: number) => {
    await setTrackPan(index, pan);
  }, [setTrackPan]);

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
      // Switch to FX tab so ParamControl appears (Issue #65)
      setActiveTab('fx');
    },
    [tracks],
  );

  const handleBackFromParam = useCallback(() => {
    setParamView(null);
  }, []);

  const handleBackFromFxBrowser = useCallback(() => {
    setFxChainView(false);
    setActiveTab('tracks');
  }, []);

  const handleOpenFxChains = useCallback(() => {
    setFxChainView(true);
  }, []);

  const handleBackFromFxChains = useCallback(() => {
    setFxChainView(false);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col text-[var(--text-primary)]">
      {/* ── Status Bar ── */}
      <header className="sticky top-0 z-10 bg-[var(--bg-secondary)] border-b border-[var(--border)] px-4 py-2.5 safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">Utpaladeva</h1>
            <span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">
              Reaper Remote
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-secondary)] hidden xs:inline">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <div
              className={`w-2 h-2 transition-colors ${
                connected ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'
              }`}
            />
            {activeTab === 'tracks' && tracks.length > 0 && (
              <span className="text-[11px] text-[var(--text-secondary)] ml-1">
                {tracks.length} trk
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary>
        {activeTab === 'media' && (
          <SampleBrowser
            tracks={tracks}
            selectedTrack={selectedTrack}
            getDirectory={getDirectory}
            sendSampleToTrack={sendSampleToTrack}
            sendCommand={sendCommand}
            onBack={() => setActiveTab('tracks')}
          />
        )}

        {activeTab === 'clips' && (
          <div className="flex flex-col h-full">
            {/* Mode toggle */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setSessionMode('session')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  sessionMode === 'session'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                Session
              </button>
              <button
                onClick={() => setSessionMode('sequencer')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  sessionMode === 'sequencer'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                Sequencer
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {sessionMode === 'session' ? (
                <SessionView
                  matrix={matrix}
                  getMatrix={getMatrix}
                  triggerSlot={triggerSlot}
                  triggerScene={triggerScene}
                  onEvent={onEvent}
                  onPlay={play}
                  onStop={stop}
                  onRecord={record}
                  onGetTransportState={getTransportState}
                />
              ) : (
                <SequencerView
                  sequencer={sequencer}
                  getSequencer={getSequencer}
                  toggleStep={toggleStep}
                  setStep={setStep}
                  clearAll={seqClearAll}
                  setLength={seqSetLength}
                  setBaseNote={seqSetBaseNote}
                />
              )}
            </div>
          </div>
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
            onEvent={onEvent}
            onBack={handleBackFromParam}
          />
        ) : fxChainView ? (
          <FxChainBrowser
            tracks={tracks}
            selectedTrack={selectedTrack}
            fxChainGetDirectory={fxChainGetDirectory}
            fxChainSave={fxChainSave}
            fxChainLoad={fxChainLoad}
            fxChainGetInfo={fxChainGetInfo}
            onBack={handleBackFromFxChains}
            initialPath={fxChainPath || undefined}
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
            onOpenFxChains={handleOpenFxChains}
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
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onAddTrack={addTrack}
            onRefresh={refreshTracks}
            onPlay={play}
            onStop={stop}
            onRecord={record}
            onGetTransportState={getTransportState}
            getTrackFx={getTrackFx}
            onSelectFx={handleSelectFx}
          />
        )}

        {activeTab === 'settings' && (
          <div className="p-6 text-[var(--text-secondary)] space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider">Settings</h2>
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Connection</span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 ${connected ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'}`} />
                  <span className="text-xs">{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Server: ws://localhost:9224
              </div>
              <button
                onClick={() => refreshTracks()}
                className="w-full py-2.5 bg-[var(--bg-secondary)] text-sm active:brightness-95 transition-colors"
              >
                Refresh Tracks
              </button>
              <div className="space-y-2">
                <button
                  onClick={() => refreshFxCache()}
                  disabled={isRefreshingFx}
                  className={`w-full py-2.5 text-sm active:brightness-95 transition-colors flex items-center justify-center gap-2 ${
                    isRefreshingFx
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-not-allowed'
                      : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                  }`}
                >
                  {isRefreshingFx && (
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  )}
                  {isRefreshingFx ? 'Refreshing...' : 'Refresh Plugin List'}
                </button>
                {isRefreshingFx && (
                  <p className="text-[11px] text-[var(--text-secondary)] text-center">
                    Scanning installed plugins...
                  </p>
                )}
              </div>
            </div>

            {/* Theme section */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Theme</h3>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 py-2.5 text-sm transition-colors active:brightness-95 ${
                      preference === t
                        ? 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] text-center">
                {isDark ? 'Dark mode active' : 'Light mode active'}
              </p>
            </div>

            {/* FX Chain path setting */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider">FX Chains</h3>
              <input
                type="text"
                value={fxChainPath}
                onChange={(e) => setFxChainPath(e.target.value)}
                placeholder="Path to FXChains folder (e.g. C:\Users\...\REAPER\FXChains)"
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] text-sm
                  text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                  outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
              />
              <button
                onClick={() => {
                  if (fxChainPath) {
                    setFxChainView(true);
                    setActiveTab('fx');
                  }
                }}
                className="w-full py-2.5 bg-[var(--accent-dim)] text-[var(--accent-orange)] text-sm active:brightness-95 transition-colors"
              >
                Browse FX Chains
              </button>
            </div>
          </div>
        )}
        </ErrorBoundary>
      </main>

      {/* ── Tab Bar ── */}
      <nav className="sticky bottom-0 z-10 bg-[var(--bg-secondary)] border-t border-[var(--border)] safe-area-bottom">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 gap-0.5
                text-[10px] transition-colors min-h-[52px]
                ${activeTab === tab.id
                  ? 'text-[var(--accent-orange)]'
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

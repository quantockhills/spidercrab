import { useState, useCallback, useEffect, useRef } from 'react';
import { ReaperClientProvider, useTheme } from './hooks';
import { useReaper } from './hooks/useReaper';
import { TrackOverview } from './components/TrackOverview';
import { FxBrowser } from './components/FxBrowser';
import { ParamControl } from './components/ParamControl';
import { SampleBrowser } from './components/SampleBrowser';
import { SessionView } from './components/SessionView';
import { SequencerView } from './components/SequencerView';
import { FxChainBrowser } from './components/FxChainBrowser';
import ErrorBoundary from './components/ErrorBoundary';
import SampleIndexProgressBar from './components/SampleIndexProgressBar';
import { dirCacheStore, persistDirCache } from './utils/dirCacheStore';
import type { DirResult, ReaperLibrary } from './hooks/useSampleBrowser';

type Tab = 'media' | 'fx' | 'tracks' | 'clips' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'media',   label: 'Media',   icon: '📂' },
  { id: 'fx',      label: 'FX',      icon: '🎛️' },
  { id: 'tracks',  label: 'Tracks',  icon: '🎚️' },
  { id: 'clips',   label: 'Playtime',   icon: '🎹' },
  { id: 'settings',label: 'Settings',icon: '⚙️' },
];

function AppInner() {
  const {
    connected,
    tracks,
    refreshTracks,
    addTrack,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    toggleTrackRecordMode,
    selectTrack,
    setTrackVolume,
    setTrackPan,
    enumerateFx,
    getTrackFx,
    getFxParams,
    setFxParam,
    addFx,
    deleteFx,
    setFxBypass,
    reorderFx,
    getDirectory,
    sendSampleToTrack,
    sendSampleToSlot,
    refreshSampleCache,
    getSampleTags,
    setSampleTags,
    getReaperLibraries,
    getReaperLibraryFiles,
    sendCommand,
    isRefreshingFx,
    refreshFxCache,
    fxChainRefreshCache,
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
    fxChainSearchRecursive,
    fxChainSearchCached,
    fxChainCycle,
    getFxPreset,
    setFxPreset,
    getAllFxPresetNames,
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    recordSlot,
    sequencer,
    getSequencer,
    toggleStep,
    setStep,
    seqClearAll,
    seqSetLength,
    seqSetBaseNote,
    getFxTags,
    setFxTags,
    launchPlaytime,
    checkPlaytimeAvailable,
    convertToClip,
  } = useReaper();

  const { preference, isDark, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [sessionMode, setSessionMode] = useState<'session' | 'sequencer'>('session');
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);

  // Sample directory paths (Issue #101)
  const [samplePaths, setSamplePaths] = useState<string[]>(
    () => {
      // Check new format first
      const stored = localStorage.getItem('sampleBrowserPaths');
      if (stored) {
        try { return JSON.parse(stored) as string[]; }
        catch { return []; }
      }
      // Migration from old single-path format (Issue #101)
      const oldPath = localStorage.getItem('sampleBrowserRootPath');
      if (oldPath) {
        const migrated = [oldPath];
        localStorage.setItem('sampleBrowserPaths', JSON.stringify(migrated));
        localStorage.removeItem('sampleBrowserRootPath');
        return migrated;
      }
      return [];
    }
  );
  const [editingSamplePath, setEditingSamplePath] = useState(false);
  const [newSamplePath, setNewSamplePath] = useState('');

  // Persist samplePaths to localStorage (Issue #101)
  useEffect(() => {
    localStorage.setItem('sampleBrowserPaths', JSON.stringify(samplePaths));
  }, [samplePaths]);

  const handleAddSamplePath = useCallback(() => {
    const trimmed = newSamplePath.trim().replace(/\/+$/, '');
    if (trimmed && !samplePaths.includes(trimmed)) {
      setSamplePaths((prev) => [...prev, trimmed]);
    }
    setNewSamplePath('');
    setEditingSamplePath(false);
  }, [newSamplePath, samplePaths]);

  const handleRemoveSamplePath = useCallback((path: string) => {
    setSamplePaths((prev) => prev.filter((p) => p !== path));
  }, []);

  const [scanStatus, setScanStatus] = useState<{
    phase: 'scanning' | 'transferring' | 'done';
    scanned: number;
    total: number;
  } | null>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleScanPath = useCallback(async (path: string) => {
    if (scanPollRef.current) clearInterval(scanPollRef.current);
    setScanStatus({ phase: 'scanning', scanned: 0, total: 0 });
    await refreshSampleCache(path);
    scanPollRef.current = setInterval(async () => {
      try {
        const resp = await sendCommand('sample/getCacheStatus', { rootPath: path });
        const p = resp.payload as { scanning?: boolean; scanned?: number; total?: number };
        if (p.scanning) {
          setScanStatus({ phase: 'scanning', scanned: p.scanned ?? 0, total: p.total ?? 0 });
        } else {
          if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
          setScanStatus({ phase: 'transferring', scanned: 0, total: 0 });
          try {
            const pathsResp = await sendCommand('sample/getCachedPaths', { rootPath: path });
            const dirPaths = (pathsResp.payload as { paths?: string[] }).paths ?? [];
            const total = dirPaths.length;
            setScanStatus({ phase: 'transferring', scanned: 0, total });
            const BATCH = 20;
            for (let i = 0; i < dirPaths.length; i += BATCH) {
              const batch = dirPaths.slice(i, i + BATCH);
              const results = await Promise.all(
                batch.map(dirPath => sendCommand('sample/getDirectory', { path: dirPath, offset: 0, limit: 10000 }))
              );
              results.forEach((res, idx) => {
                const dir = res.payload as unknown as DirResult;
                if (dir) {
                  const key = dir.path || batch[idx];
                  dirCacheStore.set(key, dir);
                  if (batch[idx] !== key) dirCacheStore.set(batch[idx], dir);
                }
              });
              persistDirCache();
              setScanStatus({ phase: 'transferring', scanned: Math.min(i + BATCH, total), total });
            }
          } catch { /* ignore */ }
          setScanStatus(prev => prev ? { ...prev, phase: 'done' } : null);
        }
      } catch { /* ignore */ }
    }, 300);
  }, [refreshSampleCache, sendCommand]);

  // FX chain browser state (Issue #7)
  const [fxChainView, setFxChainView] = useState(false);
  const [fxChainPath, setFxChainPath] = useState<string>(
    () => localStorage.getItem('fxChainPath') || ''
  );

  const [isRefreshingChains, setIsRefreshingChains] = useState(false);

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
      // Matrix dimensions may change when tracks are added/removed
      getMatrix();
    });
    // Note: the C++ backend broadcasts events with the event name
    // 'matrix/slotStateChanged' not 'slotStateChanged'. The WsClient
    // dispatches to 'event:{msg.event}', so we must match 'matrix/slotStateChanged'.
    // See command_handler.cpp: BroadcastMatrixEvent("matrix/slotStateChanged", ...)
    const unsubSlot = onEvent('event:matrix/slotStateChanged', () => {
      getMatrix();
    });
    const pollInterval = setInterval(() => { getMatrix(); }, 1000);
    return () => {
      unsubTrack();
      unsubList();
      unsubSlot();
      clearInterval(pollInterval);
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

  const handleToggleRecordMode = useCallback(async (index: number) => {
    await toggleTrackRecordMode(index);
  }, [toggleTrackRecordMode]);

  const handleNavigateToTrack = useCallback((trackIdx: number) => {
    setSelectedTrack(trackIdx);
    selectTrack(trackIdx);
    setActiveTab('tracks');
  }, [selectTrack]);

  const handleVolumeChange = useCallback(async (index: number, volume: number) => {
    const ok = await setTrackVolume(index, volume);
    if (ok) updateTrack(index, { volume });
  }, [setTrackVolume, updateTrack]);

  const handlePanChange = useCallback(async (index: number, pan: number) => {
    const ok = await setTrackPan(index, pan);
    if (ok) updateTrack(index, { pan });
  }, [setTrackPan, updateTrack]);

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

  const handleToggleBypass = useCallback(
    async (trackIdx: number, fxIdx: number, currentBypassed: boolean): Promise<boolean> => {
      return setFxBypass(trackIdx, fxIdx, !currentBypassed);
    },
    [setFxBypass],
  );

  // ── FX button from TrackOverview (Issue #86) ──
  const handleOpenFx = useCallback(
    (trackIdx: number) => {
      setSelectedTrack(trackIdx);
      selectTrack(trackIdx);
      setActiveTab('fx');
    },
    [selectTrack],
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
    <div className="h-dvh bg-[var(--bg-primary)] flex flex-col text-[var(--text-primary)] overflow-hidden">
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
      <main className="flex-1 overflow-hidden min-h-0">
        <ErrorBoundary>
        {activeTab === 'media' && (
          <div className="flex flex-col h-full min-h-0">
            <SampleIndexProgressBar onEvent={onEvent} />
            <SampleBrowser
              tracks={tracks}
              selectedTrack={selectedTrack}
              getDirectory={getDirectory}
              sendSampleToTrack={sendSampleToTrack}
              sendCommand={sendCommand}
              onBack={() => setActiveTab('tracks')}
              samplePaths={samplePaths}
              sendToSlot={sendSampleToSlot}
              matrix={matrix}
              getSampleTags={getSampleTags}
              setSampleTags={setSampleTags}
              getReaperLibraries={getReaperLibraries}
              getReaperLibraryFiles={getReaperLibraryFiles}
            />
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="flex flex-col h-full min-h-0">
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
            <div className="flex-1 overflow-hidden min-h-0">
              {sessionMode === 'session' ? (
                <SessionView
                  matrix={matrix}
                  tracks={tracks}
                  getMatrix={getMatrix}
                  triggerSlot={triggerSlot}
                  triggerScene={triggerScene}
                  onEvent={onEvent}
                  onPlay={play}
                  onStop={stop}
                  onRecord={record}
                  onGetTransportState={getTransportState}
                  onLaunchPlaytime={launchPlaytime}
                  onCheckPlaytimeAvailable={checkPlaytimeAvailable}
                  onRecordSlot={recordSlot}
                  onToggleArm={handleToggleArm}
                  onToggleMute={handleToggleMute}
                  onToggleSolo={handleToggleSolo}
                  onToggleRecordMode={handleToggleRecordMode}
                  onNavigateToTrack={handleNavigateToTrack}
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
                  convertToClip={convertToClip}
                  onSwitchToSession={() => setSessionMode('session')}
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
            getFxPreset={getFxPreset}
            setFxPreset={setFxPreset}
            getAllFxPresetNames={getAllFxPresetNames}
          />
        ) : fxChainView ? (
          <FxChainBrowser
            tracks={tracks}
            selectedTrack={selectedTrack}
            fxChainGetDirectory={fxChainGetDirectory}
            fxChainSave={fxChainSave}
            fxChainLoad={fxChainLoad}
            fxChainGetInfo={fxChainGetInfo}
            fxChainSearchRecursive={fxChainSearchRecursive}
            fxChainSearchCached={fxChainSearchCached}
            fxChainRefreshCache={fxChainRefreshCache}
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
            fxChainSearchRecursive={fxChainSearchRecursive}
            fxChainLoad={fxChainLoad}
            fxChainPath={fxChainPath}
            getFxTags={getFxTags}
            setFxTags={setFxTags}
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
            onToggleRecordMode={handleToggleRecordMode}
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
            onToggleBypass={handleToggleBypass}
            onDeleteFx={deleteFx}
            onOpenFx={handleOpenFx}
            onReorderFx={reorderFx}
            getFxParams={getFxParams}
            setFxParam={setFxParam}
            getFxPreset={getFxPreset}
            setFxPreset={setFxPreset}
            getAllFxPresetNames={getAllFxPresetNames}
            fxChainCycle={fxChainCycle}
            enumerateFx={enumerateFx}
            addFx={addFx}
            searchChains={async (query: string) => {
              if (!fxChainPath) return [];
              const result = await fxChainSearchCached(query, fxChainPath, 0, 50);
              return result.results.map(r => ({ filePath: r.filePath, name: r.name }));
            }}
            loadChain={(trackIdx: number, filePath: string) => fxChainLoad(trackIdx, filePath)}
          />
        )}

        {activeTab === 'settings' && (
          <div className="p-6 text-[var(--text-secondary)] space-y-4 overflow-y-auto h-full max-h-full">
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
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (!fxChainPath) return;
                    setIsRefreshingChains(true);
                    try {
                      await fxChainRefreshCache(fxChainPath);
                    } finally {
                      setIsRefreshingChains(false);
                    }
                  }}
                  disabled={isRefreshingChains || !fxChainPath}
                  className={`w-full py-2.5 text-sm active:brightness-95 transition-colors flex items-center justify-center gap-2 ${
                    isRefreshingChains || !fxChainPath
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-not-allowed'
                      : 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                  }`}
                >
                  {isRefreshingChains && (
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  )}
                  {isRefreshingChains ? 'Refreshing...' : 'Refresh Chain Cache'}
                </button>
                {!fxChainPath && (
                  <p className="text-[11px] text-[var(--text-secondary)] text-center">
                    Set FX chain path in Settings to enable cache
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

            {/* Sample Directories (Issue #101) */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider">Sample Directories</h3>
              {samplePaths.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  No sample directories configured. Add one to browse samples in the Media tab.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {samplePaths.map((path) => (
                    <div key={path} className="flex items-center gap-2 px-2 py-2 bg-[var(--bg-secondary)]">
                      <span className="text-sm font-mono truncate flex-1 text-[var(--text-primary)]">
                        📁 {path}
                      </span>
                      <button
                        onClick={() => handleScanPath(path)}
                        className="text-xs px-2 py-1 text-[var(--accent-orange)] hover:bg-[var(--bg-tertiary)] active:brightness-95 min-h-[36px]"
                        title="Scan this directory into cache"
                        aria-label={`Scan ${path}`}
                      >
                        ⟳
                      </button>
                      <button
                        onClick={() => handleRemoveSamplePath(path)}
                        className="text-xs px-2 py-1 text-[var(--accent-red)] hover:bg-[var(--bg-tertiary)] active:brightness-95 min-h-[36px]"
                        aria-label={`Remove ${path}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {scanStatus && (
                <div className="px-2 py-2 bg-[var(--bg-secondary)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {scanStatus.phase === 'done'
                        ? `Done: ${scanStatus.total} dirs cached`
                        : scanStatus.phase === 'transferring'
                        ? `Loading: ${scanStatus.scanned}/${scanStatus.total} dirs`
                        : `Scanning: ${scanStatus.scanned}/${scanStatus.total} files`}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                      {scanStatus.total > 0 ? Math.round((scanStatus.scanned / scanStatus.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[var(--bg-tertiary)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-orange)] transition-all duration-200"
                      style={{ width: `${scanStatus.phase === 'done' ? 100 : scanStatus.total > 0 ? Math.round((scanStatus.scanned / scanStatus.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}
              {editingSamplePath ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSamplePath}
                    onChange={(e) => setNewSamplePath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSamplePath();
                      if (e.key === 'Escape') {
                        setNewSamplePath('');
                        setEditingSamplePath(false);
                      }
                    }}
                    placeholder="/path/to/samples"
                    className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] text-sm font-mono
                      text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                      outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
                    autoFocus
                  />
                  <button
                    onClick={handleAddSamplePath}
                    className="px-3 py-2 text-xs bg-[var(--accent-dim)] text-[var(--accent-orange)] min-h-[36px] active:brightness-95"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => setEditingSamplePath(true)}
                    className="w-full py-2.5 bg-[var(--bg-secondary)] text-sm text-[var(--accent-orange)] active:brightness-95 transition-colors"
                  >
                    + Add Directory
                  </button>
                  <button
                    onClick={async () => {
                      const resp = await sendCommand('sample/purgeStaleCache', { paths: samplePaths });
                      const removed = (resp.payload as { removed?: number }).removed ?? 0;
                      alert(removed > 0 ? `Cleared ${removed} stale cache(s).` : 'Nothing to clear — all cached paths are still active.');
                    }}
                    className="w-full py-2.5 bg-[var(--bg-secondary)] text-sm text-[var(--text-secondary)] active:brightness-95 transition-colors"
                  >
                    Clear stale cache
                  </button>
                </div>
              )}
            </div>

            {/* ReaLearn preset download */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Playtime 2</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Download the ReaLearn OSC preset and import it into ReaLearn's Main compartment to control Playtime 2 clips from the Playtime tab.
              </p>
              <a
                href="/spidercrab-playtime.lua"
                download="spidercrab-playtime.lua"
                className="block w-full py-2.5 text-center bg-[var(--accent-dim)] text-[var(--accent-orange)] text-sm active:brightness-95 transition-colors"
              >
                ↓ Download ReaLearn Preset
              </a>
              <p className="text-[11px] text-[var(--text-secondary)]">
                OSC ports: spidercrab sends triggers to <span className="font-mono">127.0.0.1:9001</span>, receives state feedback on <span className="font-mono">:9011</span>.
              </p>
            </div>

            {/* Build version */}
            <div className="text-[10px] text-[var(--text-secondary)] text-center font-mono opacity-50">
              build {__BUILD_TIME__}
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

export default function App() {
  return (
    <ReaperClientProvider>
      <AppInner />
    </ReaperClientProvider>
  );
}

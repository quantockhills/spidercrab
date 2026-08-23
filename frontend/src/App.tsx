import { useState, useCallback, useEffect, useRef } from 'react';
import { ReaperClientProvider, useTheme, useUIScale, UI_SCALE_STEPS } from './hooks';
import { useReaper } from './hooks/useReaper';
import { TrackOverview } from './components/TrackOverview';
import { FxBrowser } from './components/FxBrowser';
import { ParamControl } from './components/ParamControl';
import { SampleBrowser } from './components/SampleBrowser';
import { SessionView } from './components/SessionView';
import { SequencerView } from './components/SequencerView';
import { useSeqPattern } from './hooks/useSeqPattern';
import { FxChainBrowser } from './components/FxChainBrowser';
import { GridView } from './components/grid/GridView';
import ErrorBoundary from './components/ErrorBoundary';
import SampleIndexProgressBar from './components/SampleIndexProgressBar';
import { dirCacheStore, persistDirCache } from './utils/dirCacheStore';
import type { DirResult, ReaperLibrary } from './hooks/useSampleBrowser';

type Tab = 'media' | 'fx' | 'tracks' | 'clips' | 'settings';

// Grid and Steps are sub-views rather than top-level tabs: Grid is another
// way of looking at a track's FX, and Steps writes the patterns Playtime
// launches. Keeping them beside what they belong to shortens the nav and
// puts each next to the thing it acts on.
type TrackView = 'list' | 'grid';
type ClipsView = 'session' | 'steps';
type NavPosition = 'top' | 'bottom' | 'left' | 'right';

// The step sequencer is built but not yet working reliably, so it's hidden
// from the UI for now. All of its code is intact — flip this to true to bring
// the Session/Sequencer toggle back once it's verified.

// Grid shows the selected track's plugins as a pannable strip of purpose-built
// device layouts. Only Chorus has a module so far, and the layout format is
// still settling — hidden until there's enough there to be useful.

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'media',   label: 'Media',   icon: '📂' },
  { id: 'fx',      label: 'FX',      icon: '🎛️' },
  { id: 'tracks',  label: 'Tracks',  icon: '🎚️' },
  { id: 'clips',   label: 'Playtime',   icon: '🎹' },
  { id: 'settings',label: 'Settings',icon: '⚙️' },
];

/** A pair of sub-tabs inside a main tab. Deliberately plain: the main nav
 *  already carries the icons, and a second row of them competes with it. */
function SubTabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex border-b border-[var(--border)] shrink-0">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 py-2 text-xs font-medium transition-colors min-h-[40px] ${
            value === o.id
              ? 'bg-[var(--bg-tertiary)] text-[var(--accent-orange)]'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
    searchDatabases,
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
    fxChainReorder,
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
    matrixPlay,
    matrixStopAll,
    matrixClick,
    getTempo,
    setTempo,
    tapTempo,
    recordSlot,
    clearSlot,
    samplerFromSlot,
    samplerFromPath,
    samplerSetReverse,
    getFxTags,
    setFxTags,
    launchPlaytime,
    checkPlaytimeAvailable,
  } = useReaper();

  const { preference, isDark, setTheme } = useTheme();
  const { scale: uiScale, setScale: setUiScale, increase: increaseUiScale, decrease: decreaseUiScale, canIncrease: canIncreaseUiScale, canDecrease: canDecreaseUiScale } = useUIScale();

  // The Media tab can send a sample to a drum rack pad, so the Steps grid has
  // a sound on that row rather than a bare note number.
  const { addPad } = useSeqPattern();

  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [trackView, setTrackView] = useState<TrackView>('list');
  const [clipsView, setClipsView] = useState<ClipsView>('session');

  // Tab bar placement (Settings): top / bottom / left / right
  const [navPosition, setNavPosition] = useState<NavPosition>(() => {
    const saved = localStorage.getItem('navPosition');
    return (saved === 'top' || saved === 'bottom' || saved === 'left' || saved === 'right') ? saved : 'bottom';
  });
  useEffect(() => {
    localStorage.setItem('navPosition', navPosition);
  }, [navPosition]);
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

  // ── Global settings sync ──
  // Sample folders and the FX-chains path now live on the PC
  // (spidercrab/settings.json) so they're the same for every project and every
  // device. On first connect we pull them from the backend; if the backend has
  // none yet but this browser has local values, we migrate those up once. After
  // that, changes are pushed to the backend (localStorage above stays as a fast
  // local cache / offline fallback).
  const [settingsSynced, setSettingsSynced] = useState(false);
  const settingsSyncRef = useRef(false);
  useEffect(() => {
    if (!connected || settingsSyncRef.current) return;
    settingsSyncRef.current = true;
    (async () => {
      try {
        const resp = await sendCommand('settings/get');
        const s = resp.payload as { fxChainPath?: string; sampleFolders?: string[] };
        if (s.sampleFolders && s.sampleFolders.length > 0) setSamplePaths(s.sampleFolders);
        else if (samplePaths.length > 0) await sendCommand('settings/setSampleFolders', { folders: samplePaths });
        if (s.fxChainPath) setFxChainPath(s.fxChainPath);
        else if (fxChainPath) await sendCommand('settings/setFxChainPath', { path: fxChainPath });
      } catch { /* older/offline backend — keep local values */ }
      setSettingsSynced(true);
    })();
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settingsSynced) return;
    sendCommand('settings/setSampleFolders', { folders: samplePaths }).catch(() => {});
  }, [samplePaths, settingsSynced, sendCommand]);

  useEffect(() => {
    if (!settingsSynced) return;
    sendCommand('settings/setFxChainPath', { path: fxChainPath }).catch(() => {});
  }, [fxChainPath, settingsSynced, sendCommand]);

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

  // Per-track send counters. A reply that a newer send has already superseded
  // must not be written back, or the fader jumps to a stale position (#137).
  const volumeSeqRef = useRef<Record<number, number>>({});
  const panSeqRef = useRef<Record<number, number>>({});

  const handleVolumeChange = useCallback(async (index: number, volume: number) => {
    const seq = (volumeSeqRef.current[index] ?? 0) + 1;
    volumeSeqRef.current[index] = seq;
    const ok = await setTrackVolume(index, volume);
    if (ok && volumeSeqRef.current[index] === seq) updateTrack(index, { volume });
  }, [setTrackVolume, updateTrack]);

  const handlePanChange = useCallback(async (index: number, pan: number) => {
    const seq = (panSeqRef.current[index] ?? 0) + 1;
    panSeqRef.current[index] = seq;
    const ok = await setTrackPan(index, pan);
    if (ok && panSeqRef.current[index] === seq) updateTrack(index, { pan });
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

  const navVertical = navPosition === 'left' || navPosition === 'right';
  const navBorder = { bottom: 'border-t', top: 'border-b', left: 'border-r', right: 'border-l' }[navPosition];

  const navBar = (
    <nav className={`z-10 flex-shrink-0 bg-[var(--bg-secondary)] ${navBorder} border-[var(--border)] relative ${navPosition === 'bottom' ? 'safe-area-bottom' : ''}`}>
      {/* Connection indicator */}
      <div
        className={`absolute w-2 h-2 transition-colors ${navVertical ? 'top-2 left-1/2 -translate-x-1/2' : 'top-2 right-2'} ${
          connected ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'
        }`}
        title={connected ? 'Connected' : 'Disconnected'}
      />
      <div className={navVertical ? 'flex flex-col w-16 pt-6 gap-1' : 'flex'}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex flex-col items-center justify-center gap-0.5
              text-[10px] transition-colors
              ${navVertical ? 'w-full py-3' : 'flex-1 py-2 min-h-[52px]'}
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
  );

  return (
    // Fixed-size viewport clip. The scaled content below is sized to exactly
    // compensate for its own transform, so it always fills this box no
    // matter which UI scale step is active (Settings → UI Size — Safari on
    // iPad has no ctrl +/- zoom, so this is the equivalent in-app control).
    <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
    <div
      className={`h-dvh bg-[var(--bg-primary)] flex ${navVertical ? 'flex-row' : 'flex-col'} text-[var(--text-primary)] overflow-hidden`}
      style={{
        transform: `scale(${uiScale})`,
        transformOrigin: 'top left',
        width: `${100 / uiScale}%`,
        height: `${100 / uiScale}%`,
      }}
    >
      {(navPosition === 'top' || navPosition === 'left') && navBar}
      {/* ── Main Content ── */}
      <main className="flex-1 overflow-hidden min-h-0 min-w-0">
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
              samplePaths={samplePaths}
              sendToSampler={samplerFromPath}
              sendToSlot={sendSampleToSlot}
              addPad={addPad}
              matrix={matrix}
              getSampleTags={getSampleTags}
              setSampleTags={setSampleTags}
              getReaperLibraries={getReaperLibraries}
              getReaperLibraryFiles={getReaperLibraryFiles}
              searchDatabases={searchDatabases}
            />
          </div>
        )}

        {activeTab === 'clips' && (
          <div className="flex flex-col h-full min-h-0">
            <SubTabs<ClipsView>
              value={clipsView}
              onChange={setClipsView}
              options={[{ id: 'session', label: 'Session' }, { id: 'steps', label: 'Steps' }]}
            />
            <div className="flex-1 overflow-hidden min-h-0">
              {clipsView === 'steps' ? <SequencerView tracks={tracks} /> : (
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
                  onMatrixPlay={matrixPlay}
                  onMatrixStopAll={matrixStopAll}
                  onMatrixClick={matrixClick}
                  onGetTempo={getTempo}
                  onSetTempo={setTempo}
                  onTapTempo={tapTempo}
                  onGetTransportState={getTransportState}
                  onLaunchPlaytime={launchPlaytime}
                  onCheckPlaytimeAvailable={checkPlaytimeAvailable}
                  onRecordSlot={recordSlot}
                  onClearSlot={clearSlot}
                  onAddToSampler={samplerFromSlot}
                  onSamplerSetReverse={samplerSetReverse}
                  getFxParams={getFxParams}
                  setFxParamValue={setFxParam}
                  onToggleArm={handleToggleArm}
                  onToggleMute={handleToggleMute}
                  onToggleSolo={handleToggleSolo}
                  onToggleRecordMode={handleToggleRecordMode}
                  onNavigateToTrack={handleNavigateToTrack}
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
          <div className="flex flex-col h-full min-h-0">
            <SubTabs<TrackView>
              value={trackView}
              onChange={setTrackView}
              options={[{ id: 'list', label: 'Tracks' }, { id: 'grid', label: 'Grid' }]}
            />
            <div className="flex-1 min-h-0">
            {trackView === 'list' ? (
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
            onReorderChain={fxChainReorder}
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
            ) : (
              <GridView
                tracks={tracks}
                selectedTrack={selectedTrack}
                getTrackFx={getTrackFx}
                getFxParams={getFxParams}
                setFxParam={setFxParam}
                getFxPreset={getFxPreset}
                setFxPreset={setFxPreset}
                getAllFxPresetNames={getAllFxPresetNames}
                onEvent={onEvent}
              />
            )}
            </div>
          </div>
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
                Server: ws://{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:9224
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

            {/* UI scale — Safari on iPad has no ctrl +/- zoom, so this is the in-app equivalent */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">UI Size</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={decreaseUiScale}
                  disabled={!canDecreaseUiScale}
                  className="w-11 py-2.5 text-base font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors active:brightness-95 disabled:opacity-30"
                  aria-label="Decrease UI size"
                >
                  −
                </button>
                <div className="flex-1 flex gap-1">
                  {UI_SCALE_STEPS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setUiScale(s)}
                      className={`flex-1 py-2.5 text-xs transition-colors active:brightness-95 ${
                        uiScale === s
                          ? 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      {Math.round(s * 100)}%
                    </button>
                  ))}
                </div>
                <button
                  onClick={increaseUiScale}
                  disabled={!canIncreaseUiScale}
                  className="w-11 py-2.5 text-base font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors active:brightness-95 disabled:opacity-30"
                  aria-label="Increase UI size"
                >
                  +
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] text-center">
                Scales the whole app — handy on Safari/iPad, where ctrl +/- zoom isn't available.
              </p>
            </div>

            {/* Tab bar position */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Tab Bar Position</h3>
              <div className="flex gap-2">
                {(['top', 'bottom', 'left', 'right'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNavPosition(p)}
                    className={`flex-1 py-2.5 text-sm transition-colors active:brightness-95 ${
                      navPosition === p
                        ? 'bg-[var(--accent-dim)] text-[var(--accent-orange)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* FX Chain path setting */}
            <div className="bg-[var(--bg-tertiary)] p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider">FX Chains</h3>
              <input
                type="text"
                value={fxChainPath}
                onChange={(e) => setFxChainPath(e.target.value)}
                placeholder="Path to FXChains folder (e.g. .../REAPER/FXChains)"
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

      {(navPosition === 'bottom' || navPosition === 'right') && navBar}

      {/* Bottom safe area for iPhone notch/home indicator */}
      {navPosition === 'bottom' && <div className="h-[env(safe-area-inset-bottom)]" />}
    </div>
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

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Track, FxInfo, FxParam, FxPresetInfo, FxPresetNames } from '../hooks/useReaper';
import type { EnumeratedFx } from '../hooks/useFx';
import { volumeToDb } from '../utils/volume';
import type { WsResponse } from '../lib/wsClient';
import { ParamSlider } from './ParamControl';
import { ChainCycler } from './ChainCycler';

// ── Chain search type (Issue #105) ───────────────────────────

export interface ChainSearchItem {
  filePath: string;
  name: string;
}

interface TrackOverviewProps {
  tracks: Track[];
  selectedTrack: number | null;
  onSelectTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  onToggleSolo: (index: number) => void;
  onToggleArm: (index: number) => void;
  onToggleRecordMode?: (trackIdx: number) => void;
  onVolumeChange?: (trackIdx: number, volume: number) => void;
  onPanChange?: (trackIdx: number, pan: number) => void;
  onAddTrack?: () => Promise<boolean>;
  onRefresh: () => void;
  onPlay?: () => Promise<boolean>;
  onStop?: () => Promise<boolean>;
  onRecord?: () => Promise<boolean>;
  onGetTransportState?: () => Promise<{playing: boolean; recording: boolean}>;
  getTrackFx?: (trackIdx: number) => Promise<FxInfo[]>;
  onSelectFx?: (trackIdx: number, fxIdx: number, fxName: string) => void;
  onOpenFx?: (trackIdx: number) => void;
  onReorderFx?: (trackIdx: number, fromIndex: number, toIndex: number) => Promise<boolean>;
  // Chain cycle support (Issue #95)
  fxChainCycle?: (trackIdx: number, direction: 'next' | 'prev', chainPath?: string) => Promise<{success: boolean; fx?: FxInfo[]}>;
  // Inline FX search props (Issue #102)
  enumerateFx?: () => Promise<EnumeratedFx[]>;
  addFx?: (trackIdx: number, fxName: string) => Promise<number>;
  // Inline FX drawer props (Issue #94)
  getFxParams?: (trackIdx: number, fxIdx: number, offset?: number, limit?: number) => Promise<{params: FxParam[]; total: number; offset: number; limit: number}>;
  setFxParam?: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<WsResponse>;
  getFxPreset?: (trackIdx: number, fxIdx: number) => Promise<FxPresetInfo | null>;
  setFxPreset?: (trackIdx: number, fxIdx: number, presetIdx: number) => Promise<FxPresetInfo | null>;
  getAllFxPresetNames?: (trackIdx: number, fxIdx: number) => Promise<FxPresetNames | null>;
  // FX bypass (Issue #104)
  onToggleBypass?: (trackIdx: number, fxIdx: number, currentBypassed: boolean) => Promise<boolean>;
  onDeleteFx?: (trackIdx: number, fxIdx: number) => Promise<boolean>;
  // Inline FX chain search (Issue #105)
  searchChains?: (query: string) => Promise<ChainSearchItem[]>;
  loadChain?: (trackIdx: number, filePath: string) => Promise<boolean>;
}



/** Interactive volume fader with slider and visual bar */
function VolumeBar({ volume, onChange }: { volume: number; onChange?: (value: number) => void }) {
  const pct = Math.min(volume * 100, 100);
  return (
    <div className="relative w-24 h-5">
      {/* Visual bar background */}
      <div className="absolute inset-0 bg-[var(--bg-tertiary)] overflow-hidden pointer-events-none">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--accent-green)]/50"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Invisible slider overlaid on top */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          if (onChange) onChange(val);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Track volume"
        data-testid="track-volume-slider"
      />
    </div>
  );
}

/** Pan control: horizontal slider -1 to 1, with center position indicator */
function PanBar({ pan, onChange }: { pan: number; onChange?: (value: number) => void }) {
  // Normalize -1..1 to 0..100 for bar width
  const pct = Math.round(Math.abs(pan) * 100);
  const isLeft = pan < -0.05;
  const isRight = pan > 0.05;
  const isCenter = !isLeft && !isRight;

  let label: string;
  if (isCenter) {
    label = 'C';
  } else if (isLeft) {
    label = `L ${pct}%`;
  } else {
    label = `R ${pct}%`;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Visual pan indicator */}
      <div className="relative w-16 h-5">
        {/* Background track */}
        <div className="absolute inset-0 bg-[var(--bg-tertiary)] overflow-hidden">
          {/* Center line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[var(--text-secondary)]/30" />
          {/* Left fill (hard-left = full left fill) */}
          {isLeft && (
            <div
              className="absolute inset-y-0 right-1/2 bg-[var(--accent-orange)]/40"
              style={{ width: `${pct}%` }}
            />
          )}
          {/* Right fill (hard-right = full right fill) */}
          {isRight && (
            <div
              className="absolute inset-y-0 left-1/2 bg-[var(--accent-orange)]/40"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        {/* Invisible slider overlaid on top */}
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (onChange) onChange(val);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Track pan"
          data-testid="track-pan-slider"
        />
      </div>
      {/* Pan label */}
      <span data-testid="pan-label" className="text-[11px] text-[var(--text-secondary)] w-10 text-center tabular-nums">
        {label}
      </span>
    </div>
  );
}

/** Clean FX name for display (strip format prefix like "VST3: ") */
function cleanFxName(name: string): string {
  return name.replace(/^(VST3?i?:\s*|CLAPi?:\s*|AUi?:\s*|DX:\s*|JS:\s*)/, '');
}

export function TrackOverview({
  tracks,
  selectedTrack,
  onSelectTrack,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onToggleRecordMode,
  onVolumeChange,
  onPanChange,
  onRefresh,
  onPlay,
  onStop,
  onRecord,
  onGetTransportState,
  onAddTrack,
  getTrackFx,
  onSelectFx,
  onOpenFx,
  onReorderFx,
  getFxParams,
  setFxParam,
  getFxPreset,
  setFxPreset,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAllFxPresetNames,
  fxChainCycle,
  enumerateFx,
  addFx,
  onToggleBypass,
  onDeleteFx,
  searchChains,
  loadChain,
}: TrackOverviewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [trackFxMap, setTrackFxMap] = useState<Record<number, FxInfo[]>>({});
  const [fxLoading, setFxLoading] = useState(false);

  // Inline FX drawer state (Issue #94)
  const [expandedFx, setExpandedFx] = useState<{trackIdx: number; fxIdx: number; fxName: string} | null>(null);

  // Chain cycler state (Issue #95)
  const [chainCycler, setChainCycler] = useState<{trackIdx: number; chainPath: string; chainName: string; fxCount: number} | null>(null);

  // Inline FX search state (Issue #102)
  const [inlineSearchTrackIdx, setInlineSearchTrackIdx] = useState<number | null>(null);

  // Drag-and-drop state for FX reordering
  const [dragActiveTrack, setDragActiveTrack] = useState<number | null>(null);
  const [dragSourceFxIdx, setDragSourceFxIdx] = useState<number | null>(null);
  const [dropVisualIdx, setDropVisualIdx] = useState<number | null>(null);
  const [fxRefreshVersion, setFxRefreshVersion] = useState(0);
  const dragDataRef = useRef<{trackIdx: number; fxIdx: number} | null>(null);
  const dropTargetRef = useRef<{dropIndex: number} | null>(null);

  const handleRecord = useCallback(async () => {
    if (!onRecord) return;
    const ok = await onRecord();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsRecording(state.recording);
      setIsPlaying(state.playing);
    }
  }, [onRecord, onGetTransportState]);

  // Wrapper for FX reorder that refreshes the FX list after reorder
  const handleReorderFx = useCallback(async (trackIdx: number, fromIndex: number, toIndex: number): Promise<boolean> => {
    if (!onReorderFx) return false;
    const ok = await onReorderFx(trackIdx, fromIndex, toIndex);
    if (ok) setFxRefreshVersion(v => v + 1);
    return ok;
  }, [onReorderFx]);

  const handleDeleteFx = useCallback(async (trackIdx: number, fxIdx: number): Promise<boolean> => {
    if (!onDeleteFx) return false;
    const ok = await onDeleteFx(trackIdx, fxIdx);
    if (ok) setFxRefreshVersion(v => v + 1);
    return ok;
  }, [onDeleteFx]);

  const handleToggleBypass = useCallback(async (trackIdx: number, fxIdx: number, currentBypassed: boolean): Promise<boolean> => {
    if (!onToggleBypass) return false;
    const ok = await onToggleBypass(trackIdx, fxIdx, currentBypassed);
    if (ok) setFxRefreshVersion(v => v + 1);
    return ok;
  }, [onToggleBypass]);

  // Inline FX search handlers (Issue #102)
  const handleOpenInlineSearch = useCallback((trackIdx: number) => {
    // Close any existing drawer when opening search
    setExpandedFx(null);
    setInlineSearchTrackIdx(trackIdx);
  }, []);

  const handleCloseInlineSearch = useCallback(() => {
    setInlineSearchTrackIdx(null);
  }, []);

  const handleInlineFxAdded = useCallback(() => {
    setFxRefreshVersion(v => v + 1);
    setInlineSearchTrackIdx(null);
  }, []);

  // Fetch FX for all tracks on mount / when track list changes
  useEffect(() => {
    if (!getTrackFx || tracks.length === 0) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFxLoading(true);
    Promise.all(
      tracks.map(async (t) => {
        try {
          const fx = await getTrackFx(t.index);
          return { index: t.index, fx };
        } catch {
          return { index: t.index, fx: [] as FxInfo[] };
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        const map: Record<number, FxInfo[]> = {};
        for (const r of results) {
          map[r.index] = r.fx;
        }
        setTrackFxMap(map);
        setFxLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setFxLoading(false);
    });
    return () => { cancelled = true; };
  }, [tracks, getTrackFx, fxRefreshVersion]);

  const handlePlay = useCallback(async () => {
    if (!onPlay) return;
    const ok = await onPlay();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsPlaying(state.playing);
    }
  }, [onPlay, onGetTransportState]);

  const handleStop = useCallback(async () => {
    if (!onStop) return;
    const ok = await onStop();
    if (ok && onGetTransportState) {
      const state = await onGetTransportState();
      setIsPlaying(state.playing);
    }
  }, [onStop, onGetTransportState]);

  return (
    <div className="flex flex-col h-full">
      {/* Transport bar */}
      {onPlay && onStop && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 border-b border-[var(--border)]">
          <button
            data-testid="transport-play"
            onClick={handlePlay}
            className={`
              w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
              ${isPlaying
                ? 'bg-[var(--accent-green)]/25 text-[var(--accent-green)] ring-1 ring-[var(--accent-green)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ▶
          </button>
          {onRecord && (
            <button
              data-testid="transport-record"
              onClick={handleRecord}
              className={`
                w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
                ${isRecording
                  ? 'bg-[var(--accent-red)]/40 text-[var(--accent-red)] ring-2 ring-[var(--accent-red)]/60'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }
              `}
            >
              ●
            </button>
          )}
          <button
            data-testid="transport-stop"
            onClick={handleStop}
            className={`
              w-16 h-10 text-sm font-semibold transition-colors active:brightness-95
              ${!isPlaying && !isRecording
                ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
          >
            ■
          </button>
          <span className="text-[11px] text-[var(--text-secondary)] w-20 text-center">
            {isRecording ? 'Recording' : isPlaying ? 'Playing' : 'Stopped'}
          </span>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Tracks {tracks.length > 0 ? `(${tracks.length})` : ''}
        </h2>
        <div className="flex gap-2">
          {onAddTrack && (
            <button
              data-testid="add-track-button"
              onClick={onAddTrack}
              className="text-xs px-2 py-1 bg-[var(--accent-green)]/25 text-[var(--accent-green)] active:brightness-95"
            >
              + Track
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:brightness-95"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          {onAddTrack && (
            <button
              onClick={onAddTrack}
              className="px-2 py-1 bg-[var(--accent-dim)] text-[var(--accent-orange)] text-xs active:brightness-95 transition-colors"
              title="Add new track"
            >
              + Track
            </button>
          )}
          <button
            onClick={() => onRefresh()}
            className="p-2 hover:bg-[var(--bg-tertiary)] active:brightness-95 transition-colors text-sm"
            title="Refresh tracks"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Track list */}
      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--text-secondary)] space-y-3">
          <div className="text-5xl">🎛️</div>
          <p className="text-sm">No tracks loaded</p>
          <div className="flex gap-2">
            {onAddTrack && (
              <button
                data-testid="add-track-empty"
                onClick={onAddTrack}
                className="px-5 py-2.5 bg-[var(--accent-green)]/25 text-[var(--accent-green)] text-sm active:brightness-95 transition-colors"
              >
                + Add Track
              </button>
            )}
            <button
              onClick={onRefresh}
              className="px-5 py-2.5 bg-[var(--bg-tertiary)] text-sm active:brightness-95 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      ) : collapsed ? (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} — tap Collapse to show
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-4">
          {fxLoading && tracks.length > 0 && (
            <div className="px-3 py-2 text-xs text-[var(--text-secondary)] animate-pulse">
              Loading FX…
            </div>
          )}
          {tracks.map((track) => (
            <div key={track.index}>
              <TrackRow
                track={track}
                isSelected={track.index === selectedTrack}
                onSelect={() => onSelectTrack(track.index)}
                onToggleMute={() => onToggleMute(track.index)}
                onToggleSolo={() => onToggleSolo(track.index)}
                onToggleArm={() => onToggleArm(track.index)}
                onToggleRecordMode={onToggleRecordMode ? () => onToggleRecordMode(track.index) : undefined}
                onVolumeChange={onVolumeChange ? (v) => onVolumeChange(track.index, v) : undefined}
                onPanChange={onPanChange ? (v) => onPanChange(track.index, v) : undefined}
                onOpenFx={onOpenFx ? () => onOpenFx(track.index) : undefined}
              />
              {/* FX grid cards under the track row — grouped by chainPath (Issue #95) */}
              {getTrackFx && onSelectFx && (
                <FxGrid
                  trackIdx={track.index}
                  fxList={trackFxMap[track.index] ?? []}
                  dragActiveTrack={dragActiveTrack}
                  dragSourceFxIdx={dragSourceFxIdx}
                  dropVisualIdx={dropVisualIdx}
                  dragDataRef={dragDataRef}
                  dropTargetRef={dropTargetRef}
                  expandedFx={expandedFx}
                  setDragActiveTrack={setDragActiveTrack}
                  setDragSourceFxIdx={setDragSourceFxIdx}
                  setDropVisualIdx={setDropVisualIdx}
                  setExpandedFx={setExpandedFx}
                  setChainCycler={setChainCycler}
                  onReorderFx={handleReorderFx}
                  onOpenInlineSearch={enumerateFx && addFx ? handleOpenInlineSearch : undefined}
                  onToggleBypass={onToggleBypass ? handleToggleBypass : undefined}
                  onDeleteFx={onDeleteFx ? handleDeleteFx : undefined}
                />
              )}
              {/* Inline FX search (Issue #102) */}
              {inlineSearchTrackIdx === track.index && enumerateFx && addFx && (
                <>
                  {/* Backdrop for tap-outside-to-close */}
                  <div
                    data-testid="inline-fx-search-backdrop"
                    className="fixed inset-0 z-10"
                    onClick={handleCloseInlineSearch}
                  />
                  {/* Search panel (stop propagation to prevent backdrop close) */}
                  <div className="relative z-20" onClick={(e) => e.stopPropagation()}>
                    <InlineFxSearch
                      trackIdx={track.index}
                      enumerateFx={enumerateFx}
                      addFx={addFx}
                      searchChains={searchChains}
                      loadChain={loadChain}
                      onClose={handleCloseInlineSearch}
                      onFxAdded={handleInlineFxAdded}
                    />
                  </div>
                </>
              )}
              {/* Inline FX drawer (Issue #94) */}
              {expandedFx?.trackIdx === track.index && getFxParams && setFxParam && (
                <InlineFxDrawer
                  trackIdx={track.index}
                  fxIdx={expandedFx.fxIdx}
                  fxName={expandedFx.fxName}
                  getFxParams={getFxParams}
                  setFxParam={setFxParam}
                  getFxPreset={getFxPreset}
                  setFxPreset={setFxPreset}
                  onClose={() => setExpandedFx(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chain cycler popup (Issue #95) */}
      {chainCycler && fxChainCycle && getTrackFx && (
        <ChainCycler
          trackIdx={chainCycler.trackIdx}
          chainPath={chainCycler.chainPath}
          chainName={chainCycler.chainName}
          fxCount={chainCycler.fxCount}
          fxChainCycle={fxChainCycle}
          getTrackFx={getTrackFx}
          onDone={() => setChainCycler(null)}
          onFxChanged={(newFx) => {
            // Update local FX map after cycling
            setTrackFxMap((prev) => ({
              ...prev,
              [chainCycler.trackIdx]: newFx,
            }));
          }}
        />
      )}
    </div>
  );
}

// ── FxGrid — Grouped FX cards with green box chains (Issue #95) ──

interface FxGridProps {
  trackIdx: number;
  fxList: FxInfo[];
  dragActiveTrack: number | null;
  dragSourceFxIdx: number | null;
  dropVisualIdx: number | null;
  dragDataRef: React.MutableRefObject<{trackIdx: number; fxIdx: number} | null>;
  dropTargetRef: React.MutableRefObject<{dropIndex: number} | null>;
  expandedFx: {trackIdx: number; fxIdx: number; fxName: string} | null;
  setDragActiveTrack: (v: number | null) => void;
  setDragSourceFxIdx: (v: number | null) => void;
  setDropVisualIdx: React.Dispatch<React.SetStateAction<number | null>>;
  setExpandedFx: (v: {trackIdx: number; fxIdx: number; fxName: string} | null) => void;
  setChainCycler: (v: {trackIdx: number; chainPath: string; chainName: string; fxCount: number} | null) => void;
  onReorderFx?: (trackIdx: number, fromIndex: number, toIndex: number) => Promise<boolean>;
  onOpenInlineSearch?: (trackIdx: number) => void;
  onToggleBypass?: (trackIdx: number, fxIdx: number, currentBypassed: boolean) => Promise<boolean>;
  onDeleteFx?: (trackIdx: number, fxIdx: number) => Promise<boolean>;
}

/** Extract filename from a chain file path */
function chainDisplayName(chainPath: string): string {
  const parts = chainPath.split('/').pop()?.split('\\').pop() || chainPath;
  // Remove .RfxChain extension if present
  return parts.replace(/\.RfxChain$/i, '');
}

function FxGrid({
  trackIdx,
  fxList,
  dragActiveTrack,
  dragSourceFxIdx,
  dropVisualIdx,
  dragDataRef,
  dropTargetRef,
  expandedFx,
  setDragActiveTrack,
  setDragSourceFxIdx,
  setDropVisualIdx,
  setExpandedFx,
  setChainCycler,
  onReorderFx,
  onOpenInlineSearch,
  onToggleBypass,
  onDeleteFx,
}: FxGridProps) {
  // Group FX by chainPath
  interface FxGroup {
    chainPath: string | null;
    fx: FxInfo[];
  }

  const groups: FxGroup[] = [];
  let currentChain: string | null = null;
  let currentGroup: FxInfo[] = [];

  for (const fx of fxList) {
    if (fx.chainPath !== currentChain) {
      if (currentGroup.length > 0) {
        groups.push({ chainPath: currentChain, fx: currentGroup });
      }
      currentChain = fx.chainPath ?? null;
      currentGroup = [fx];
    } else {
      currentGroup.push(fx);
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ chainPath: currentChain, fx: currentGroup });
  }

  // Long-press timer refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFxLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = useCallback((chainPath: string, chainName: string, fxCount: number) => {
    longPressTimerRef.current = setTimeout(() => {
      setChainCycler({ trackIdx, chainPath, chainName, fxCount });
      longPressTimerRef.current = null;
    }, 2000);
  }, [trackIdx, setChainCycler]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <div
      className="flex flex-wrap gap-2 px-3 pb-2"
      onDragOver={(e) => {
        if (!dragDataRef.current) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const dragData = dragDataRef.current;
        if (!dragData || !onReorderFx || dragData.trackIdx !== trackIdx) {
          dragDataRef.current = null;
          dropTargetRef.current = null;
          setDragActiveTrack(null);
          setDragSourceFxIdx(null);
          setDropVisualIdx(null);
          return;
        }
        const target = dropTargetRef.current;
        const toIndex = target?.dropIndex ?? fxList.length;
        if (dragData.fxIdx !== toIndex) {
          onReorderFx(trackIdx, dragData.fxIdx, toIndex);
        }
        dragDataRef.current = null;
        dropTargetRef.current = null;
        setDragActiveTrack(null);
        setDragSourceFxIdx(null);
        setDropVisualIdx(null);
      }}
    >
      {groups.map((group) => {
        if (group.chainPath) {
          // Green box for chain group
          const displayName = chainDisplayName(group.chainPath);
          return (
            <div
              key={`chain-${group.chainPath}`}
              className="w-full"
            >
              {/* Green box header */}
              <div
                className="flex items-center gap-2 px-2 py-1 bg-[var(--accent-green)]/10 ring-1 ring-[var(--accent-green)]/40 text-xs text-[var(--accent-green)] font-medium cursor-pointer select-none"
                onPointerDown={() => startLongPress(group.chainPath!, displayName, group.fx.length)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                title="Hold 2s to cycle chain"
              >
                <span>📁</span>
                <span className="truncate flex-1">{displayName}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">{group.fx.length} FX</span>
              </div>
              {/* FX cards inside the green box */}
              <div className="flex flex-wrap gap-2 p-2 ring-1 ring-[var(--accent-green)]/20">
                {group.fx.map((fx) => (
                  <FxCard
                    key={fx.index}
                    trackIdx={trackIdx}
                    fx={fx}
                    dragActiveTrack={dragActiveTrack}
                    dragSourceFxIdx={dragSourceFxIdx}
                    dropVisualIdx={dropVisualIdx}
                    dragDataRef={dragDataRef}
                    dropTargetRef={dropTargetRef}
                    expandedFx={expandedFx}
                    setDragActiveTrack={setDragActiveTrack}
                    setDragSourceFxIdx={setDragSourceFxIdx}
                    setDropVisualIdx={setDropVisualIdx}
                    setExpandedFx={setExpandedFx}
                    onReorderFx={onReorderFx}
                    onToggleBypass={onToggleBypass}
                    onDeleteFx={onDeleteFx}
                  />
                ))}
              </div>
            </div>
          );
        } else {
          // Individual FX (no chain) — render as plain cards
          return group.fx.map((fx) => (
            <FxCard
              key={fx.index}
              trackIdx={trackIdx}
              fx={fx}
              dragActiveTrack={dragActiveTrack}
              dragSourceFxIdx={dragSourceFxIdx}
              dropVisualIdx={dropVisualIdx}
              dragDataRef={dragDataRef}
              dropTargetRef={dropTargetRef}
              expandedFx={expandedFx}
              setDragActiveTrack={setDragActiveTrack}
              setDragSourceFxIdx={setDragSourceFxIdx}
              setDropVisualIdx={setDropVisualIdx}
              setExpandedFx={setExpandedFx}
              onReorderFx={onReorderFx}
              onToggleBypass={onToggleBypass}
              onDeleteFx={onDeleteFx}
            />
          ));
        }
      })}
      {/* Drop zone at the end */}
      {fxList.length > 0 && dragActiveTrack === trackIdx && (
        <div
          className={`
            w-24 h-18 flex items-center justify-center
            ring-1 ring-dashed ring-[var(--border)]
            text-[11px] text-[var(--text-secondary)]
            transition-all duration-100
            ${dropVisualIdx === fxList.length
              ? 'ring-[var(--accent-orange)] bg-[var(--accent-orange)]/10'
              : ''}
          `}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragDataRef.current?.trackIdx === trackIdx) {
              const dropIndex = fxList.length;
              dropTargetRef.current = { dropIndex };
              setDropVisualIdx(dropIndex);
            }
          }}
          onDragLeave={() => {
            setDropVisualIdx((prev) =>
              prev === fxList.length ? null : prev,
            );
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragData = dragDataRef.current;
            if (!dragData || !onReorderFx || dragData.trackIdx !== trackIdx) {
              dragDataRef.current = null;
              dropTargetRef.current = null;
              setDragActiveTrack(null);
              setDragSourceFxIdx(null);
              setDropVisualIdx(null);
              return;
            }
            const toIndex = fxList.length;
            if (dragData.fxIdx !== toIndex) {
              onReorderFx(trackIdx, dragData.fxIdx, toIndex);
            }
            dragDataRef.current = null;
            dropTargetRef.current = null;
            setDragActiveTrack(null);
            setDragSourceFxIdx(null);
            setDropVisualIdx(null);
          }}
        >
          +
        </div>
      )}
      {/* Add FX button — long-press to open inline search (Issue #102) */}
      {onOpenInlineSearch && (
        <button
          data-testid="inline-add-fx"
          onPointerDown={() => {
            addFxLongPressTimerRef.current = setTimeout(() => {
              onOpenInlineSearch(trackIdx);
              addFxLongPressTimerRef.current = null;
            }, 500);
          }}
          onPointerUp={() => {
            if (addFxLongPressTimerRef.current) {
              clearTimeout(addFxLongPressTimerRef.current);
              addFxLongPressTimerRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (addFxLongPressTimerRef.current) {
              clearTimeout(addFxLongPressTimerRef.current);
              addFxLongPressTimerRef.current = null;
            }
          }}
          onPointerCancel={() => {
            if (addFxLongPressTimerRef.current) {
              clearTimeout(addFxLongPressTimerRef.current);
              addFxLongPressTimerRef.current = null;
            }
          }}
          className="
            w-24 h-18 flex flex-col items-center justify-center
            bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
            ring-1 ring-dashed ring-[var(--border)]
            text-[11px] text-[var(--text-secondary)]
            active:brightness-95 transition-all duration-100
            cursor-pointer
          "
          title="Hold to search and add FX"
        >
          <span className="text-base leading-none mb-0.5">+</span>
          <span>Add FX</span>
        </button>
      )}
    </div>
  );
}

// ── FxCard — Individual draggable FX card ──

interface FxCardProps {
  trackIdx: number;
  fx: FxInfo;
  dragActiveTrack: number | null;
  dragSourceFxIdx: number | null;
  dropVisualIdx: number | null;
  dragDataRef: React.MutableRefObject<{trackIdx: number; fxIdx: number} | null>;
  dropTargetRef: React.MutableRefObject<{dropIndex: number} | null>;
  expandedFx: {trackIdx: number; fxIdx: number; fxName: string} | null;
  setDragActiveTrack: (v: number | null) => void;
  setDragSourceFxIdx: (v: number | null) => void;
  setDropVisualIdx: React.Dispatch<React.SetStateAction<number | null>>;
  setExpandedFx: (v: {trackIdx: number; fxIdx: number; fxName: string} | null) => void;
  onReorderFx?: (trackIdx: number, fromIndex: number, toIndex: number) => Promise<boolean>;
  onToggleBypass?: (trackIdx: number, fxIdx: number, currentBypassed: boolean) => Promise<boolean>;
  onDeleteFx?: (trackIdx: number, fxIdx: number) => Promise<boolean>;
}

function FxCard({
  trackIdx,
  fx,
  dragActiveTrack,
  dragSourceFxIdx,
  dropVisualIdx,
  dragDataRef,
  dropTargetRef,
  expandedFx,
  setDragActiveTrack,
  setDragSourceFxIdx,
  setDropVisualIdx,
  setExpandedFx,
  onReorderFx,
  onToggleBypass,
  onDeleteFx,
}: FxCardProps) {
  const isDragSource = dragSourceFxIdx === fx.index && dragActiveTrack === trackIdx;
  const isDropTarget = dropVisualIdx === fx.index && dragActiveTrack === trackIdx;
  const isBypassed = fx.bypassed ?? false;

  // Long-press delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Long-press handler for delete
  const handlePointerDown = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setShowDeleteConfirm(true);
      longPressTimerRef.current = null;
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Tap on card toggles bypass
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      // If showing delete confirmation, tap again to confirm
      if (onDeleteFx) {
        onDeleteFx(trackIdx, fx.index);
      }
      setShowDeleteConfirm(false);
      return;
    }
    if (onToggleBypass) {
      onToggleBypass(trackIdx, fx.index, fx.bypassed ?? false);
    }
  }, [trackIdx, fx.index, fx.bypassed, showDeleteConfirm, onToggleBypass, onDeleteFx]);

  // Tap on arrow expands params (separate hit target)
  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
    if (expandedFx?.trackIdx === trackIdx && expandedFx?.fxIdx === fx.index) {
      setExpandedFx(null);
    } else {
      setExpandedFx({ trackIdx, fxIdx: fx.index, fxName: fx.name });
    }
  }, [trackIdx, fx.index, expandedFx, setExpandedFx]);

  return (
    <div
      key={fx.index}
      draggable={true}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `${trackIdx}:${fx.index}`);
        e.dataTransfer.effectAllowed = 'move';
        dragDataRef.current = { trackIdx, fxIdx: fx.index };
        setDragActiveTrack(trackIdx);
        setDragSourceFxIdx(fx.index);
        setExpandedFx(null);
        setShowDeleteConfirm(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragDataRef.current || dragDataRef.current.trackIdx !== trackIdx) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const dropIndex = e.clientX < midX ? fx.index : fx.index + 1;
        dropTargetRef.current = { dropIndex };
        setDropVisualIdx(dropIndex);
      }}
      onDragLeave={() => {
        setDropVisualIdx((prev) => (prev === fx.index ? null : prev));
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const dragData = dragDataRef.current;
        if (!dragData || !onReorderFx) {
          dragDataRef.current = null;
          dropTargetRef.current = null;
          setDragActiveTrack(null);
          setDragSourceFxIdx(null);
          setDropVisualIdx(null);
          return;
        }
        if (dragData.trackIdx !== trackIdx) {
          dragDataRef.current = null;
          dropTargetRef.current = null;
          setDragActiveTrack(null);
          setDragSourceFxIdx(null);
          setDropVisualIdx(null);
          return;
        }
        const target = dropTargetRef.current;
        const targetDropIndex = target?.dropIndex ?? fx.index;
        if (dragData.fxIdx !== targetDropIndex) {
          onReorderFx(trackIdx, dragData.fxIdx, targetDropIndex);
        }
        dragDataRef.current = null;
        dropTargetRef.current = null;
        setDragActiveTrack(null);
        setDragSourceFxIdx(null);
        setDropVisualIdx(null);
      }}
      onDragEnd={() => {
        dragDataRef.current = null;
        dropTargetRef.current = null;
        setDragActiveTrack(null);
        setDragSourceFxIdx(null);
        setDropVisualIdx(null);
      }}
      className={`
        relative flex flex-col items-center justify-center
        w-24 h-18 px-2 py-2
        bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]
        ring-1 ring-[var(--border)]
        transition-all duration-100
        cursor-pointer text-center
        ${isDragSource ? 'opacity-40' : ''}
        ${isDropTarget && !isDragSource ? 'ring-[var(--accent-orange)] bg-[var(--accent-orange)]/10' : ''}
        ${isBypassed && !showDeleteConfirm ? 'opacity-40 grayscale' : ''}
      `}
      onClick={handleCardClick}
    >
      {/* Card body */}
      <div
        className="flex-1 w-full flex flex-col items-center justify-center"
      >
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-[var(--accent-red)]">Delete?</span>
            <span className="text-base text-[var(--accent-red)]">✕</span>
          </div>
        ) : (
          <span className="text-xs font-medium truncate w-full leading-tight">
            {cleanFxName(fx.name)}
          </span>
        )}
      </div>

      {/* Expand arrow (separate hit target) */}
      {!showDeleteConfirm && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center
            bg-[var(--bg-tertiary)] ring-1 ring-[var(--border)]
            text-[9px] text-[var(--text-secondary)] cursor-pointer
            hover:bg-[var(--bg-secondary)] active:brightness-95 z-10"
          onClick={handleExpandClick}
          title="Show parameters"
        >
          ▼
        </div>
      )}
    </div>
  );
}

// ── Inline FX Drawer (Issue #94) ─────────────────────────

interface InlineFxDrawerProps {
  trackIdx: number;
  fxIdx: number;
  fxName: string;
  getFxParams: (trackIdx: number, fxIdx: number, offset?: number, limit?: number) => Promise<{params: FxParam[]; total: number; offset: number; limit: number}>;
  setFxParam: (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => Promise<WsResponse>;
  getFxPreset?: (trackIdx: number, fxIdx: number) => Promise<FxPresetInfo | null>;
  setFxPreset?: (trackIdx: number, fxIdx: number, presetIdx: number) => Promise<FxPresetInfo | null>;
  onClose: () => void;
}

function InlineFxDrawer({
  trackIdx,
  fxIdx,
  fxName,
  getFxParams,
  setFxParam,
  getFxPreset,
  setFxPreset,
  onClose,
}: InlineFxDrawerProps) {
  const [params, setParams] = useState<FxParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [paramOffset, setParamOffset] = useState(0);
  const [totalParams, setTotalParams] = useState(0);
  const PAGE_SIZE = 8;

  // Preset state
  const [presetInfo, setPresetInfo] = useState<FxPresetInfo | null>(null);
  const [presetLoading, setPresetLoading] = useState(true);

  // Pinned params from localStorage
  const pinStorageKey = `fx:pinned:${trackIdx}:${fxIdx}`;
  const [pinnedParams, setPinnedParams] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(pinStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Dragging state for local param slider
  const draggingParamRef = useRef<number | null>(null);
  const dragCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load params on mount
  useEffect(() => {
    let cancelled = false;
    getFxParams(trackIdx, fxIdx, 0, PAGE_SIZE).then((result) => {
      if (!cancelled) {
        setParams(result.params);
        setTotalParams(result.total);
        setParamOffset(result.offset);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [trackIdx, fxIdx, getFxParams]);

  // Load preset info
  useEffect(() => {
    if (!getFxPreset) {
      const t = setTimeout(() => setPresetLoading(false), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    getFxPreset(trackIdx, fxIdx).then((info) => {
      if (!cancelled) {
        setPresetInfo(info);
        setPresetLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setPresetLoading(false);
    });
    return () => { cancelled = true; };
  }, [trackIdx, fxIdx, getFxPreset]);

  // Pagination
  const goNextPage = useCallback(() => {
    const next = paramOffset + PAGE_SIZE;
    if (next < totalParams) {
      setLoading(true);
      getFxParams(trackIdx, fxIdx, next, PAGE_SIZE).then((result) => {
        setParams(result.params);
        setTotalParams(result.total);
        setParamOffset(result.offset);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [paramOffset, totalParams, trackIdx, fxIdx, getFxParams]);

  const goPrevPage = useCallback(() => {
    const prev = Math.max(0, paramOffset - PAGE_SIZE);
    setLoading(true);
    getFxParams(trackIdx, fxIdx, prev, PAGE_SIZE).then((result) => {
      setParams(result.params);
      setTotalParams(result.total);
      setParamOffset(result.offset);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [paramOffset, trackIdx, fxIdx, getFxParams]);

  // Preset navigation
  const handlePrevPreset = useCallback(() => {
    if (!presetInfo || !setFxPreset || presetInfo.numPresets <= 0) return;
    let newIdx = presetInfo.presetIndex - 1;
    if (newIdx < 0) newIdx = presetInfo.numPresets - 1;
    setFxPreset(trackIdx, fxIdx, newIdx).then((info) => {
      if (info) setPresetInfo(info);
      // Re-fetch params
      getFxParams(trackIdx, fxIdx, paramOffset, PAGE_SIZE).then((result) => {
        setParams(result.params);
        setTotalParams(result.total);
      });
    });
  }, [presetInfo, setFxPreset, trackIdx, fxIdx, paramOffset, getFxParams]);

  const handleNextPreset = useCallback(() => {
    if (!presetInfo || !setFxPreset || presetInfo.numPresets <= 0) return;
    let newIdx = presetInfo.presetIndex + 1;
    if (newIdx >= presetInfo.numPresets) newIdx = 0;
    setFxPreset(trackIdx, fxIdx, newIdx).then((info) => {
      if (info) setPresetInfo(info);
      getFxParams(trackIdx, fxIdx, paramOffset, PAGE_SIZE).then((result) => {
        setParams(result.params);
        setTotalParams(result.total);
      });
    });
  }, [presetInfo, setFxPreset, trackIdx, fxIdx, paramOffset, getFxParams]);

  // Param change handler
  const handleParamChange = useCallback(async (paramIdx: number, value: number) => {
    // Optimistic update
    setParams((prev) =>
      prev.map((p) => (p.index === paramIdx ? { ...p, value } : p)),
    );
    await setFxParam(trackIdx, fxIdx, paramIdx, value);
  }, [trackIdx, fxIdx, setFxParam]);

  // Pin/unpin handlers
  const togglePin = useCallback((paramIdx: number) => {
    setPinnedParams((prev) => {
      const next = prev.includes(paramIdx)
        ? prev.filter((p) => p !== paramIdx)
        : [...prev, paramIdx];
      try {
        localStorage.setItem(pinStorageKey, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, [pinStorageKey]);

  // Drag handlers
  const startDragging = useCallback((paramIdx: number) => {
    draggingParamRef.current = paramIdx;
    if (dragCleanupTimeoutRef.current) {
      clearTimeout(dragCleanupTimeoutRef.current);
      dragCleanupTimeoutRef.current = null;
    }
  }, []);

  const finishDragging = useCallback(() => {
    if (dragCleanupTimeoutRef.current) {
      clearTimeout(dragCleanupTimeoutRef.current);
    }
    dragCleanupTimeoutRef.current = setTimeout(() => {
      draggingParamRef.current = null;
      dragCleanupTimeoutRef.current = null;
    }, 150);
  }, []);

  // Determine which params are pinned (filter from the current page)
  const currentPageParamIndices = params.map((p) => p.index);
  const visiblePinned = pinnedParams.filter((pi) => currentPageParamIndices.includes(pi));

  return (
    <div className="mx-3 mb-2 bg-[var(--bg-secondary)] ring-1 ring-[var(--accent-orange)]/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border)]">
        <span className="text-xs font-semibold truncate text-[var(--accent-orange)]">
          {cleanFxName(fxName)}
        </span>
        <button
          onClick={onClose}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:brightness-95 px-1"
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>

      {/* Preset bar */}
      {(getFxPreset || setFxPreset) && (
        <div className="px-3 py-1.5 border-b border-[var(--border)]">
          {presetLoading ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-secondary)]">Presets:</span>
              <div className="h-3 w-20 bg-[var(--bg-tertiary)] animate-pulse rounded" />
            </div>
          ) : !presetInfo || presetInfo.numPresets <= 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-secondary)]">Presets:</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">— No presets —</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-secondary)] whitespace-nowrap">Preset:</span>
              <button
                onClick={handlePrevPreset}
                className="px-1.5 py-1 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:brightness-95"
                aria-label="Previous preset"
              >
                ◀
              </button>
              <span className="flex-1 text-[10px] text-center truncate px-1.5 py-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
                {presetInfo.presetName || `Preset ${presetInfo.presetIndex + 1}`}
              </span>
              <button
                onClick={handleNextPreset}
                className="px-1.5 py-1 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-primary)] active:brightness-95"
                aria-label="Next preset"
              >
                ▶
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pinned params section */}
      {visiblePinned.length > 0 && (
        <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--accent-orange)]/5">
          <div className="text-[10px] text-[var(--text-secondary)] font-medium mb-1">Pinned</div>
          {params
            .filter((p) => visiblePinned.includes(p.index))
            .map((param) => (
              <div key={param.index} className="flex items-center gap-2 py-0.5">
                <div className="flex-1 min-w-0">
                  <ParamSlider
                    param={param}
                    onChange={(value) => handleParamChange(param.index, value)}
                    onDragStart={startDragging}
                    onDragEnd={finishDragging}
                  />
                </div>
                <button
                  onClick={() => togglePin(param.index)}
                  className="text-[10px] text-[var(--accent-orange)] active:brightness-95 px-1 flex-shrink-0"
                  aria-label="Unpin parameter"
                >
                  📌
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Param sliders */}
      <div className="px-3 py-1.5 space-y-1">
        {/* Page indicator */}
        {totalParams > PAGE_SIZE && (
          <div className="flex items-center justify-between pb-1">
            <button
              onClick={goPrevPage}
              disabled={paramOffset === 0}
              className="px-2 py-1 text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-30 active:brightness-95"
            >
              ← Prev
            </button>
            <span className="text-[10px] text-[var(--text-secondary)]">
              {paramOffset + 1}–{Math.min(paramOffset + PAGE_SIZE, totalParams)} of {totalParams}
            </span>
            <button
              onClick={goNextPage}
              disabled={paramOffset + PAGE_SIZE >= totalParams}
              className="px-2 py-1 text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-30 active:brightness-95"
            >
              Next →
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-4 text-center text-[10px] text-[var(--text-secondary)] animate-pulse">
            Loading parameters…
          </div>
        ) : params.length === 0 ? (
          <div className="py-4 text-center text-[10px] text-[var(--text-tertiary)]">
            No adjustable parameters
          </div>
        ) : (
          params.map((param) => (
            <div key={param.index} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ParamSlider
                  param={param}
                  onChange={(value) => handleParamChange(param.index, value)}
                  onDragStart={startDragging}
                  onDragEnd={finishDragging}
                />
              </div>
              <button
                onClick={() => togglePin(param.index)}
                className={`text-[10px] active:brightness-95 px-1 flex-shrink-0 ${
                  pinnedParams.includes(param.index)
                    ? 'text-[var(--accent-orange)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
                aria-label={pinnedParams.includes(param.index) ? 'Unpin parameter' : 'Pin parameter'}
              >
                📌
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Inline FX Search (Issue #102) ──────────────────────────
// ── Chain search integration (Issue #105) ───────────────────

type ResultItem = 
  | { kind: 'fx'; fx: EnumeratedFx }
  | { kind: 'chain'; chain: ChainSearchItem };

interface InlineFxSearchProps {
  trackIdx: number;
  enumerateFx: () => Promise<EnumeratedFx[]>;
  addFx: (trackIdx: number, fxName: string) => Promise<number>;
  searchChains?: (query: string) => Promise<ChainSearchItem[]>;
  loadChain?: (trackIdx: number, filePath: string) => Promise<boolean>;
  onClose: () => void;
  onFxAdded: () => void;
}

function InlineFxSearch({
  trackIdx,
  enumerateFx,
  addFx,
  searchChains,
  loadChain,
  onClose,
  onFxAdded,
}: InlineFxSearchProps) {
  const [allFx, setAllFx] = useState<EnumeratedFx[]>([]);
  const [allChains, setAllChains] = useState<ChainSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [filteredResults, setFilteredResults] = useState<ResultItem[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load FX plugins on mount (chains are fetched on demand via search)
  useEffect(() => {
    let cancelled = false;
    enumerateFx().then((fx) => {
      if (!cancelled) {
        setAllFx(fx);
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enumerateFx]);

  // Debounced search: FX filtered client-side, chains fetched server-side
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      const query = search.toLowerCase().trim();
      const results: ResultItem[] = [];

      // FX: client-side filter
      for (const fx of allFx) {
        if (!query || cleanFxName(fx.name).toLowerCase().includes(query) || fx.ident.toLowerCase().includes(query)) {
          results.push({ kind: 'fx', fx });
        }
      }

      // Chains: server-side search (only when query is non-empty)
      if (query && searchChains) {
        try {
          const chains = await searchChains(query);
          setAllChains(chains);
          for (const chain of chains) {
            results.push({ kind: 'chain', chain });
          }
        } catch { /* ignore */ }
      } else {
        setAllChains([]);
      }

      setFilteredResults(results);
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search, allFx, searchChains]);

  const handleAddFx = useCallback(
    async (fx: EnumeratedFx) => {
      if (adding) return; // Prevent double-tap
      setAdding(fx.name);
      try {
        const idx = await addFx(trackIdx, fx.name);
        if (idx >= 0) {
          onFxAdded();
        }
      } catch {
        // Error handled silently — search stays open
      } finally {
        setAdding(null);
      }
    },
    [trackIdx, addFx, onFxAdded, adding],
  );

  const handleLoadChain = useCallback(
    async (chain: ChainSearchItem) => {
      if (adding || !loadChain) return;
      setAdding(chain.filePath);
      try {
        const ok = await loadChain(trackIdx, chain.filePath);
        if (ok) {
          onFxAdded();
        }
      } catch {
        // Error handled silently
      } finally {
        setAdding(null);
      }
    },
    [trackIdx, loadChain, onFxAdded, adding],
  );

  // Clamp results to first 30 for performance
  const visibleResults = filteredResults.slice(0, 30);

  return (
    <div className="mx-3 mb-2 bg-[var(--bg-secondary)] ring-1 ring-[var(--accent-orange)]/30 overflow-hidden">
      {/* Header with search input */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border)]">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FX or chains..."
            data-testid="inline-fx-search-input"
            className="w-full pl-8 pr-3 py-2 bg-[var(--bg-tertiary)] text-sm
              text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
              outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent-orange)]/40"
          />
        </div>
        <button
          data-testid="inline-fx-search-close"
          onClick={onClose}
          className="text-xs px-2 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:brightness-95"
          aria-label="Close FX search"
        >
          ✕
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div
          data-testid="inline-fx-search-loading"
          className="px-3 py-4 text-center text-xs text-[var(--text-secondary)] animate-pulse"
        >
          Loading plugins…
        </div>
      ) : visibleResults.length === 0 ? (
        <div
          data-testid="inline-fx-search-empty"
          className="px-3 py-4 text-center text-xs text-[var(--text-tertiary)]"
        >
          {search.trim() ? 'No results match your search' : 'No plugins or chains found'}
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {visibleResults.map((item) => {
            if (item.kind === 'fx') {
              const fx = item.fx;
              const displayName = cleanFxName(fx.name);
              const isAddingThis = adding === fx.name;
              return (
                <button
                  key={fx.ident || fx.name}
                  data-testid="inline-fx-result"
                  onClick={() => handleAddFx(fx)}
                  disabled={isAddingThis}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left',
                    isAddingThis
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
                    'active:brightness-95 transition-colors duration-75',
                    'border-b border-[var(--border)] last:border-b-0',
                  ].join(' ')}
                >
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {displayName}
                  </span>
                  <span
                    data-testid="inline-fx-format-badge"
                    className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  >
                    {fx.format}
                  </span>
                </button>
              );
            } else {
              // Chain result
              const chain = item.chain;
              const displayName = chain.name.replace(/\.RfxChain$/i, '');
              const isAddingThis = adding === chain.filePath;
              return (
                <button
                  key={chain.filePath}
                  data-testid="inline-fx-result"
                  onClick={() => handleLoadChain(chain)}
                  disabled={isAddingThis}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left',
                    isAddingThis
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
                    'active:brightness-95 transition-colors duration-75',
                    'border-b border-[var(--border)] last:border-b-0',
                  ].join(' ')}
                >
                  <span
                    data-testid="inline-fx-chain-icon"
                    className="flex-shrink-0 text-sm mr-1"
                  >
                    📦
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {displayName}
                  </span>
                  <span
                    className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                  >
                    Chain
                  </span>
                </button>
              );
            }
          })}
        </div>
      )}

      {/* Result count footer */}
      {!loading && (allFx.length > 0 || allChains.length > 0) && (
        <div className="px-3 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-secondary)] flex justify-between">
          <span>{allFx.length} plugins, {allChains.length} chains</span>
          {search.trim() && (
            <span>{filteredResults.length} match{filteredResults.length !== 1 ? 'es' : ''}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Individual track row ─────────────────────────────────

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
  onToggleRecordMode?: () => void;
  onVolumeChange?: (volume: number) => void;
  onPanChange?: (pan: number) => void;
  onOpenFx?: () => void;
}

function TrackRow({
  track,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onToggleRecordMode,
  onVolumeChange,
  onPanChange,
  onOpenFx,
}: TrackRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2.5 px-3 py-2 cursor-pointer
        active:brightness-95 transition-colors duration-100 select-none
        ${isSelected
          ? 'bg-[var(--bg-tertiary)] ring-1 ring-[var(--accent-orange)]/40'
          : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
        }
        ${track.muted ? 'opacity-50' : ''}
      `}
    >
      {/* Track icon + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg flex-shrink-0">{track.armed ? '🔴' : '🔊'}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {track.name || `Track ${track.index + 1}`}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            Ch. {track.trackNumber}
          </div>
        </div>
      </div>

      {/* Volume bar */}
      <VolumeBar volume={track.volume} onChange={onVolumeChange} />

      {/* Volume dB */}
      <span className="text-[11px] text-[var(--text-secondary)] w-14 text-right tabular-nums">
        {volumeToDb(track.volume)}
      </span>

      {/* Pan control */}
      <PanBar pan={track.pan} onChange={onPanChange} />

      {/* Control buttons */}
      <div className="flex gap-1.5 flex-shrink-0">
        {/* Mute */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className={`
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
            ${track.muted
              ? 'bg-[var(--accent-red)]/25 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/40'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          M
        </button>

        {/* Solo */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSolo(); }}
          className={`
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
            ${track.soloed
              ? 'bg-[var(--accent-yellow)]/25 text-[var(--accent-yellow)] ring-1 ring-[var(--accent-yellow)]/40'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          S
        </button>

        {/* Record Arm */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleArm(); }}
          className={`
            w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
            ${track.armed
              ? 'bg-[var(--accent-red)]/30 text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/50'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }
          `}
        >
          R
        </button>

        {/* Record mode toggle (Issue #99): Audio (0) / MIDI (7-8) — only on armed tracks */}
        {onToggleRecordMode && track.armed && (
          <button
            data-testid="toggle-record-mode"
            onClick={(e) => { e.stopPropagation(); onToggleRecordMode(); }}
            className={`
              w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
              ${track.recMode >= 7
                ? 'bg-[var(--accent-blue)]/25 text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40'
                : track.recMode > 0
                  ? 'bg-[var(--accent-yellow)]/25 text-[var(--accent-yellow)] ring-1 ring-[var(--accent-yellow)]/40'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }
            `}
            title={track.recMode >= 7 ? 'MIDI record mode' : track.recMode > 0 ? `Record mode ${track.recMode}` : 'Audio record mode'}
          >
            {track.recMode >= 7 ? 'M' : track.recMode > 0 ? `M${track.recMode}` : 'A'}
          </button>
        )}

        {/* FX open button (Issue #86) */}
        {onOpenFx && (
          <button
            data-testid="open-fx-button"
            onClick={(e) => { e.stopPropagation(); onOpenFx(); }}
            className={`
              w-11 h-11 text-xs font-semibold transition-colors active:brightness-95
              bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
            `}
          >
            FX
          </button>
        )}
      </div>
    </div>
  );
}

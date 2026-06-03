/**
 * Backward-compatible composite hook that re-exports all domain hooks.
 *
 * This is kept for existing consumers that import useReaper directly.
 * New code should import from the individual domain hooks or from hooks/index.ts.
 *
 * To use this hook, wrap your app with <ReaperClientProvider>.
 * By default it connects to 127.0.0.1:9224.
 *
 * Usage (legacy):
 *   const { connected, tracks, play, ... } = useReaper();
 *
 * Usage (new - preferred):
 *   const { connected, onEvent } = useReaperClient();
 *   const { tracks } = useTrackState();
 *   const { play } = useTransport();
 */

import { useReaperClient } from './useReaperClient';
import { useTransport } from './useTransport';
import { useTrackState } from './useTrackState';
import { useFx } from './useFx';
import { useFxChains } from './useFxChains';
import { useSampleBrowser } from './useSampleBrowser';
import { usePlaytime } from './usePlaytime';
import { useSequencer } from './useSequencer';

// Re-export all types for backward compatibility
export type { Track } from './useTrackState';
export type { FxInfo, EnumeratedFx, FxParam } from './useFx';
export type { DirEntry } from './useSampleBrowser';
export type { FxChainEntry, FxChainInfo } from './useFxChains';
export type { ClipSlot, MatrixData } from './usePlaytime';
export type { StepData, SequencerData } from './useSequencer';

export interface UseReaperOptions {
  host?: string;
  port?: number;
}

export function useReaper(_opts?: UseReaperOptions): ReturnType<typeof useReaperClient> &
  ReturnType<typeof useTransport> &
  ReturnType<typeof useTrackState> &
  ReturnType<typeof useFx> &
  ReturnType<typeof useFxChains> &
  ReturnType<typeof useSampleBrowser> &
  ReturnType<typeof usePlaytime> &
  ReturnType<typeof useSequencer> {
  // _opts is unused — host/port are configured via ReaperClientProvider
  void _opts;
  const { connected, send, onEvent, clientRef } = useReaperClient();
  const transport = useTransport();
  const trackState = useTrackState();
  const fx = useFx();
  const fxChains = useFxChains();
  const sampleBrowser = useSampleBrowser();
  const playtime = usePlaytime();
  const sequencer = useSequencer();
}

export interface FxInfo {
  index: number;
  name: string;
  chainPath?: string | null;
}

export interface EnumeratedFx {
  index: number;
  name: string;
  ident: string;
  format: string;
}

export interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  size: number;
}

// ── FX Chain types (Issue #7) ──

export interface FxChainEntry {
  name: string;
  size: number;
  type?: 'dir' | 'file';
}

export interface FxChainInfo {
  filePath: string;
  fxCount: number;
  fxNames: string[];
  fileSize: number;
}

// ── Playtime 2 / Clip Matrix types ──

export interface ClipSlot {
  column: number;
  row: number;
  state: 'empty' | 'stopped' | 'playing' | 'recording';
  color: string;
  name: string;
  clipType: 'none' | 'audio' | 'midi';
}

export interface MatrixData {
  columns: number;
  rows: number;
  slots: ClipSlot[];
}

export interface FxParam {
  index: number;
  name: string;
  value: number;
  min: number;
  max: number;
  mid: number;
  formatted?: string;
}

export interface FxPresetInfo {
  presetIndex: number;
  presetName: string | null;
  numPresets: number;
}

export interface FxPresetNames {
  presetNames: string[];
  currentIndex: number;
}

export interface StepData {
  column: number;
  row: number;
  active: boolean;
  velocity: number;
  note: number;
}

export interface SequencerData {
  columns: number;
  rows: number;
  length: number;
  baseNote: number;
  playhead: number;
  steps: StepData[];
}

export function useReaper(opts: UseReaperOptions = {}) {
  const clientRef = useRef<WsClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    const client = new WsClient({
      host: opts.host || '127.0.0.1',
      port: opts.port ?? 9224,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onError: (err) => console.error('[reaper-ipad]', err),
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [opts.host, opts.port]);

  type PayloadMap = Record<string, unknown>;

  const getTracks = useCallback(async (): Promise<Track[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('track/getAll');
    return (resp.payload as PayloadMap).tracks as Track[];
  }, []);

  const enumerateFx = useCallback(async (): Promise<EnumeratedFx[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('fx/enumerate', {}, 60000);
    return (resp.payload as PayloadMap).fx as EnumeratedFx[];
  }, []);

  const getTrackFx = useCallback(async (trackIdx: number): Promise<FxInfo[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('track/getFx', { trackIdx }, 30000);
    return (resp.payload as PayloadMap).fx as FxInfo[];
  }, []);

  const getFxParams = useCallback(async (trackIdx: number, fxIdx: number, offset?: number, limit?: number): Promise<{params: FxParam[]; total: number; offset: number; limit: number}> => {
    if (!clientRef.current) return {params: [], total: 0, offset: 0, limit: 32};
    const payload: Record<string, unknown> = { trackIdx, fxIdx };
    if (offset !== undefined) payload.offset = offset;
    if (limit !== undefined) payload.limit = limit;
    const resp = await clientRef.current.send('fx/getParams', payload, 30000);
    const p = resp.payload as PayloadMap;
    return {
      params: p.params as FxParam[],
      total: p.total as number,
      offset: p.offset as number,
      limit: p.limit as number,
    };
  }, []);

  const setFxParam = useCallback(async (trackIdx: number, fxIdx: number, paramIdx: number, value: number): Promise<import('../lib/wsClient').WsResponse> => {
    if (!clientRef.current) return Promise.reject(new Error('Not connected'));
    const resp = await clientRef.current.send('fx/setParam', { trackIdx, fxIdx, paramIdx, value });
    return resp;
  }, []);

  const addFx = useCallback(async (trackIdx: number, fxName: string): Promise<number> => {
    if (!clientRef.current) return -1;
    const resp = await clientRef.current.send('fx/add', { trackIdx, fxName });
    return (resp.payload as PayloadMap).fxIdx as number ?? -1;
  }, []);

  const deleteFx = useCallback(async (trackIdx: number, fxIdx: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fx/delete', { trackIdx, fxIdx });
    return resp.success;
  }, []);

  const reorderFx = useCallback(async (trackIdx: number, fromIndex: number, toIndex: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fx/reorder', { trackIdx, fromIndex, toIndex });
    return resp.success;
  }, []);

  const refreshTracks = useCallback(async () => {
    const t = await getTracks();
    setTracks(t);
    return t;
  }, [getTracks]);

  // Track control commands (#26)
  const addTrack = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/add');
    if (resp.success) await refreshTracks();
    return resp.success;
  }, [refreshTracks]);

  const setTrackMute = useCallback(async (trackIdx: number, muted: boolean): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setMute', { trackIdx, muted: muted ? 'true' : 'false' });
    return resp.success;
  }, []);

  const setTrackSolo = useCallback(async (trackIdx: number, soloed: boolean): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setSolo', { trackIdx, soloed: soloed ? 'true' : 'false' });
    return resp.success;
  }, []);

  const setTrackArm = useCallback(async (trackIdx: number, armed: boolean): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setArm', { trackIdx, armed: armed ? 'true' : 'false' });
    return resp.success;
  }, []);

  const setTrackSelected = useCallback(async (trackIdx: number, selected: boolean): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setSelected', { trackIdx, selected: selected ? 'true' : 'false' });
    return resp.success;
  }, []);

  // Convenience toggles
  const toggleTrackMute = useCallback(async (trackIdx: number): Promise<boolean> => {
    const track = tracks.find(t => t.index === trackIdx);
    if (!track) return false;
    const ok = await setTrackMute(trackIdx, !track.muted);
    if (ok) await refreshTracks();
    return ok;
  }, [tracks, setTrackMute, refreshTracks]);

  const toggleTrackSolo = useCallback(async (trackIdx: number): Promise<boolean> => {
    const track = tracks.find(t => t.index === trackIdx);
    if (!track) return false;
    const ok = await setTrackSolo(trackIdx, !track.soloed);
    if (ok) await refreshTracks();
    return ok;
  }, [tracks, setTrackSolo, refreshTracks]);

  const toggleTrackArm = useCallback(async (trackIdx: number): Promise<boolean> => {
    const track = tracks.find(t => t.index === trackIdx);
    if (!track) return false;
    const ok = await setTrackArm(trackIdx, !track.armed);
    if (ok) await refreshTracks();
    return ok;
  }, [tracks, setTrackArm, refreshTracks]);

  const setTrackVolume = useCallback(async (trackIdx: number, volume: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setVolume', { trackIdx, volume });
    return resp.success;
  }, []);

  const setTrackPan = useCallback(async (trackIdx: number, pan: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('track/setPan', { trackIdx, pan });
    return resp.success;
  }, []);

  // Sample browser commands
  const getDirectory = useCallback(async (path: string): Promise<{entries: DirEntry[]}> => {
    if (!clientRef.current) return {entries: []};
    const resp = await clientRef.current.send('sample/getDirectory', { path });
    return resp.payload as {entries: DirEntry[]};
  }, []);

  const sendSampleToTrack = useCallback(async (path: string, trackIdx: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('sample/sendToTrack', { path, trackIdx });
    return resp.success;
  }, []);

  // ── FX Chain commands (Issue #7) ──

  const fxChainGetDirectory = useCallback(async (path: string): Promise<{chains: FxChainEntry[]; dirs: string[]}> => {
    if (!clientRef.current) return {chains: [], dirs: []};
    const resp = await clientRef.current.send('fxchain/getDirectory', { path }, 60000);
    return resp.payload as {chains: FxChainEntry[]; dirs: string[]};
  }, []);

  const fxChainSave = useCallback(async (trackIdx: number, filePath: string): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fxchain/save', { trackIdx, filePath });
    return resp.success;
  }, []);

  const fxChainLoad = useCallback(async (trackIdx: number, filePath: string, mode: 'replace' | 'append' = 'replace'): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fxchain/load', { trackIdx, filePath, mode });
    return resp.success;
  }, []);

  const fxChainGetInfo = useCallback(async (filePath: string): Promise<FxChainInfo | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('fxchain/getInfo', { filePath });
      return resp.payload as unknown as FxChainInfo;
    } catch {
      return null;
    }
  }, []);

  interface FxChainSearchResult {
    filePath: string;
    name: string;
    size: number;
  }

  const fxChainSearchRecursive = useCallback(async (query: string, rootPath: string): Promise<FxChainSearchResult[]> => {
    if (!clientRef.current || !rootPath) return [];
    try {
      const resp = await clientRef.current.send('fxchain/searchRecursive', { query, rootPath }, 30000);
      if (!resp.success) return [];
      return (resp.payload as { results: FxChainSearchResult[] }).results;
    } catch {
      return [];
    }
  }, []);

  // ── FX Chain cycle commands (Issue #95) ──

  const fxChainCycle = useCallback(async (trackIdx: number, direction: 'next' | 'prev', chainPath?: string): Promise<{success: boolean; fx?: FxInfo[]}> => {
    if (!clientRef.current) return {success: false};
    try {
      const payload: Record<string, unknown> = { trackIdx, direction };
      if (chainPath) payload.chainPath = chainPath;
      const resp = await clientRef.current.send('fxchain/cycle', payload, 30000);
      if (!resp.success) return {success: false};
      return {
        success: true,
        fx: (resp.payload as any)?.fx as FxInfo[] ?? [],
      };
    } catch {
      return {success: false};
    }
  }, []);

  // ── FX Preset commands (Issue #87) ──

  const getFxPreset = useCallback(async (trackIdx: number, fxIdx: number): Promise<FxPresetInfo | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('fx/getPreset', { trackIdx, fxIdx });
      return resp.payload as unknown as FxPresetInfo;
    } catch {
      return null;
    }
  }, []);

  const setFxPreset = useCallback(async (trackIdx: number, fxIdx: number, presetIdx: number): Promise<FxPresetInfo | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('fx/setPreset', { trackIdx, fxIdx, presetIdx });
      return resp.payload as unknown as FxPresetInfo;
    } catch {
      return null;
    }
  }, []);

  const getAllFxPresetNames = useCallback(async (trackIdx: number, fxIdx: number): Promise<FxPresetNames | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('fx/getAllPresetNames', { trackIdx, fxIdx }, 30000);
      return resp.payload as unknown as FxPresetNames;
    } catch {
      return null;
    }
  }, []);

  // Transport commands
  const play = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('transport/play');
    return resp.success;
  }, []);

  const stop = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('transport/stop');
    return resp.success;
  }, []);

  const record = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('transport/record');
    return resp.success;
  }, []);

  const getTransportState = useCallback(async (): Promise<{playing: boolean; recording: boolean}> => {
    if (!clientRef.current) return {playing: false, recording: false};
    const resp = await clientRef.current.send('transport/getState');
    return (resp.payload as Record<string, unknown>) as {playing: boolean; recording: boolean} || {playing: false, recording: false};
  }, []);

  const [isRefreshingFx, setIsRefreshingFx] = useState(false);

  const refreshFxCache = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    setIsRefreshingFx(true);
    try {
      const resp = await clientRef.current.send('fx/refreshCache', {}, 65000);
      return resp.success;
    } finally {
      setIsRefreshingFx(false);
    }
  }, []);

  // ── Playtime 2 / Clip Matrix commands (Issue #61) ──

  const [matrix, setMatrix] = useState<MatrixData | null>(null);

  const getMatrix = useCallback(async (): Promise<MatrixData | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('matrix/getAll');
      const data = resp.payload as unknown as MatrixData;
      setMatrix(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const triggerSlot = useCallback(async (column: number, row: number): Promise<ClipSlot | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('matrix/triggerSlot', { column, row });
      return (resp.payload as any)?.slot as ClipSlot ?? null;
    } catch {
      return null;
    }
  }, []);

  const triggerScene = useCallback(async (row: number): Promise<ClipSlot[] | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('matrix/triggerScene', { row });
      return (resp.payload as any)?.slots as ClipSlot[] ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Step Sequencer commands (Issue #63) ──

  const [sequencer, setSequencer] = useState<SequencerData | null>(null);

  const getSequencer = useCallback(async (): Promise<SequencerData | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('sequencer/getAll');
      const data = resp.payload as unknown as SequencerData;
      setSequencer(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const toggleStep = useCallback(async (column: number, row: number): Promise<StepData | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('sequencer/toggleStep', { column, row });
      const data = resp.payload as unknown as StepData;
      // Optimistic update
      setSequencer((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) =>
            s.column === column && s.row === row ? { ...s, active: data.active, velocity: data.velocity } : s
          ),
        };
      });
      return data;
    } catch {
      return null;
    }
  }, []);

  const setStep = useCallback(async (column: number, row: number, active: boolean, velocity: number = 100): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.send('sequencer/setStep', { column, row, active, velocity });
      setSequencer((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) =>
            s.column === column && s.row === row ? { ...s, active, velocity } : s
          ),
        };
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const seqClearAll = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.send('sequencer/clearAll');
      setSequencer((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) => ({ ...s, active: false })),
        };
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const seqSetLength = useCallback(async (length: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.send('sequencer/setLength', { length });
      setSequencer((prev) => prev ? { ...prev, length } : prev);
      return true;
    } catch {
      return false;
    }
  }, []);

  const seqSetBaseNote = useCallback(async (note: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.send('sequencer/setBaseNote', { note });
      return true;
    } catch {
      return false;
    }
  }, []);

  const convertToClip = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!clientRef.current) return { success: false, error: 'Not connected' };
    try {
      const resp = await clientRef.current.send('sequencer/convertToClip');
      const data = resp.payload as { success: boolean; trackIdx?: number; noteCount?: number; length?: number };
      if (data?.success) {
        // After successful conversion, switch to session mode so user can see the new clip
        return { success: true };
      }
      return { success: false, error: resp.payload?.error || 'Conversion failed' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }, []);

  const updateMatrixSlot = useCallback((column: number, row: number, updates: Partial<ClipSlot>) => {
    setMatrix((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slots: prev.slots.map((s) =>
          s.column === column && s.row === row ? { ...s, ...updates } : s
        ),
      };
    });
  }, []);

  const selectTrack = useCallback(async (trackIdx: number): Promise<boolean> => {
    return await setTrackSelected(trackIdx, true);
  }, [setTrackSelected]);

  // Subscribe to events from the WS client (e.g. fx_param_changed)
  const onEvent = useCallback((pattern: string, handler: (data: unknown) => void): (() => void) => {
    if (!clientRef.current) return () => {};
    return clientRef.current.on(pattern, handler);
  }, []);

  // Update a single track's state (used by real-time event handlers)
  const updateTrack = useCallback((trackIdx: number, updates: Partial<Omit<Track, 'index'>>) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIdx ? { ...t, ...updates } : t)),
    );
  }, []);

  return {
    // From ReaperClient
    connected,
    send,
    onEvent,

    // From useTransport
    ...transport,

    // From useTrackState
    ...trackState,

    // From useFx
    ...fx,

    // From useFxChains
    ...fxChains,

    // From useSampleBrowser
    ...sampleBrowser,

    // From usePlaytime
    ...playtime,

    // From useSequencer
    ...sequencer,

    // Low-level access (kept for backward compat)
    clientRef,
  };
}

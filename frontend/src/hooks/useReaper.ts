import { useState, useEffect, useCallback, useRef } from 'react';
import { WsClient } from '../lib/wsClient';

interface UseReaperOptions {
  host?: string;
  port?: number;
}

export interface Track {
  index: number;
  name: string;
  trackNumber: number;
  selected: boolean;
  muted: boolean;
  soloed: boolean;
  armed: boolean;
  volume: number;
  pan: number;
}

export interface FxInfo {
  index: number;
  name: string;
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

  const getTracks = useCallback(async (): Promise<Track[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('track/getAll');
    return (resp.payload as any).tracks as Track[];
  }, []);

  const enumerateFx = useCallback(async (): Promise<EnumeratedFx[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('fx/enumerate', {}, 60000);
    return (resp.payload as any).fx as EnumeratedFx[];
  }, []);

  const getTrackFx = useCallback(async (trackIdx: number): Promise<FxInfo[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('track/getFx', { trackIdx }, 30000);
    return (resp.payload as any).fx as FxInfo[];
  }, []);

  const getFxParams = useCallback(async (trackIdx: number, fxIdx: number): Promise<FxParam[]> => {
    if (!clientRef.current) return [];
    const resp = await clientRef.current.send('fx/getParams', { trackIdx, fxIdx }, 30000);
    return (resp.payload as any).params as FxParam[];
  }, []);

  const setFxParam = useCallback(async (trackIdx: number, fxIdx: number, paramIdx: number, value: number): Promise<any> => {
    if (!clientRef.current) return {};
    const resp = await clientRef.current.send('fx/setParam', { trackIdx, fxIdx, paramIdx, value });
    return resp;
  }, []);

  const addFx = useCallback(async (trackIdx: number, fxName: string): Promise<number> => {
    if (!clientRef.current) return -1;
    const resp = await clientRef.current.send('fx/add', { trackIdx, fxName });
    return (resp.payload as any).fxIdx ?? -1;
  }, []);

  const deleteFx = useCallback(async (trackIdx: number, fxIdx: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fx/delete', { trackIdx, fxIdx });
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

  const fxChainGetDirectory = useCallback(async (path: string): Promise<{chains: FxChainEntry[]}> => {
    if (!clientRef.current) return {chains: []};
    const resp = await clientRef.current.send('fxchain/getDirectory', { path });
    return resp.payload as {chains: FxChainEntry[]};
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
    return (resp.payload as any) || {playing: false, recording: false};
  }, []);

  const refreshFxCache = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fx/refreshCache', {}, 65000);
    return resp.success;
  }, []);

  // ── Playtime 2 / Clip Matrix commands (Issue #61) ──

  const [matrix, setMatrix] = useState<MatrixData | null>(null);

  const getMatrix = useCallback(async (): Promise<MatrixData | null> => {
    if (!clientRef.current) return null;
    try {
      const resp = await clientRef.current.send('matrix/getAll');
      const data = resp.payload as MatrixData;
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
      const data = resp.payload as SequencerData;
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
      const data = resp.payload as StepData;
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
  const onEvent = useCallback((pattern: string, handler: (data: any) => void): (() => void) => {
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
    connected,
    tracks,
    refreshTracks,
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    updateMatrixSlot,
    // Step sequencer (Issue #63)
    sequencer,
    getSequencer,
    toggleStep,
    setStep,
    seqClearAll,
    seqSetLength,
    seqSetBaseNote,
    getTrackFx,
    getFxParams,
    setFxParam,
    enumerateFx,
    addFx,
    deleteFx,
    setTrackMute,
    setTrackSolo,
    setTrackArm,
    setTrackSelected,
    setTrackVolume,
    setTrackPan,
    addTrack,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    selectTrack,
    play,
    stop,
    record,
    getTransportState,
    getDirectory,
    sendSampleToTrack,
    refreshFxCache,
    onEvent,
    updateTrack,
    fxChainGetDirectory,
    fxChainSave,
    fxChainLoad,
    fxChainGetInfo,
  };
}

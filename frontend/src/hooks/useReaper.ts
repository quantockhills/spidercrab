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

export interface FxParam {
  index: number;
  name: string;
  value: number;
  min: number;
  max: number;
  mid: number;
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

  const setFxParam = useCallback(async (trackIdx: number, fxIdx: number, paramIdx: number, value: number): Promise<boolean> => {
    if (!clientRef.current) return false;
    const resp = await clientRef.current.send('fx/setParam', { trackIdx, fxIdx, paramIdx, value });
    return resp.success;
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
  };
}

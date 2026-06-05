import { useState, useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface Track {
  index: number;
  name: string;
  trackNumber: number;
  selected: boolean;
  muted: boolean;
  soloed: boolean;
  armed: boolean;
  recMode: number;
  volume: number;
  pan: number;
}

// ── Hook ─────────────────────────────────────────────────────

export function useTrackState() {
  const { send } = useReaperClient();
  const [tracks, setTracks] = useState<Track[]>([]);

  type PayloadMap = Record<string, unknown>;

  const getTracks = useCallback(async (): Promise<Track[]> => {
    const resp = await send('track/getAll');
    return (resp.payload as PayloadMap).tracks as Track[];
  }, [send]);

  const refreshTracks = useCallback(async () => {
    const t = await getTracks();
    setTracks(t);
    return t;
  }, [getTracks]);

  const addTrack = useCallback(async (): Promise<boolean> => {
    const resp = await send('track/add');
    if (resp.success) {
      await refreshTracks();
    }
    return resp.success;
  }, [send, refreshTracks]);

  const setTrackMute = useCallback(async (trackIdx: number, muted: boolean): Promise<boolean> => {
    const resp = await send('track/setMute', { trackIdx, muted: muted ? 'true' : 'false' });
    return resp.success;
  }, [send]);

  const setTrackSolo = useCallback(async (trackIdx: number, soloed: boolean): Promise<boolean> => {
    const resp = await send('track/setSolo', { trackIdx, soloed: soloed ? 'true' : 'false' });
    return resp.success;
  }, [send]);

  const setTrackArm = useCallback(async (trackIdx: number, armed: boolean): Promise<boolean> => {
    const resp = await send('track/setArm', { trackIdx, armed: armed ? 'true' : 'false' });
    return resp.success;
  }, [send]);

  const setTrackSelected = useCallback(async (trackIdx: number, selected: boolean): Promise<boolean> => {
    const resp = await send('track/setSelected', { trackIdx, selected: selected ? 'true' : 'false' });
    return resp.success;
  }, [send]);

  const setTrackVolume = useCallback(async (trackIdx: number, volume: number): Promise<boolean> => {
    const resp = await send('track/setVolume', { trackIdx, volume });
    return resp.success;
  }, [send]);

  const setTrackPan = useCallback(async (trackIdx: number, pan: number): Promise<boolean> => {
    const resp = await send('track/setPan', { trackIdx, pan });
    return resp.success;
  }, [send]);

  const setTrackRecordMode = useCallback(async (trackIdx: number, recMode: number): Promise<boolean> => {
    const resp = await send('track/setRecordMode', { trackIdx, recMode });
    return resp.success;
  }, [send]);

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

  const toggleTrackRecordMode = useCallback(async (trackIdx: number): Promise<boolean> => {
    // Find current recMode from local state to determine new mode
    // Toggle between audio (0) and MIDI (7) modes
    const currentTracks = tracks;
    const track = currentTracks.find(t => t.index === trackIdx);
    if (!track) return false;
    const newMode = track.recMode >= 7 ? 0 : 7;
    const ok = await setTrackRecordMode(trackIdx, newMode);
    if (ok) await refreshTracks();
    return ok;
  }, [tracks, setTrackRecordMode, refreshTracks]);

  const selectTrack = useCallback(async (trackIdx: number): Promise<boolean> => {
    return await setTrackSelected(trackIdx, true);
  }, [setTrackSelected]);

  const updateTrack = useCallback((trackIdx: number, updates: Partial<Omit<Track, 'index'>>) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIdx ? { ...t, ...updates } : t)),
    );
  }, []);

  return {
    tracks,
    refreshTracks,
    addTrack,
    setTrackMute,
    setTrackSolo,
    setTrackArm,
    setTrackSelected,
    setTrackVolume,
    setTrackPan,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    toggleTrackRecordMode,
    setTrackRecordMode,
    selectTrack,
    updateTrack,
  };
}

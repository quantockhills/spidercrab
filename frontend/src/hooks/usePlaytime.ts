import { useState, useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface ClipSlot {
  column: number;
  row: number;
  state: 'empty' | 'stopped' | 'playing' | 'recording';
  color: string;
  name: string;
  clipType: 'none' | 'audio' | 'midi';
  reversed?: boolean;
  /** True when the backend knows the clip's source media file */
  hasSource?: boolean;
}

/** Which REAPER track sits behind a matrix column. */
export interface ColumnTrack {
  /** Matrix column index, 0-based. */
  column: number;
  /** The number in the track's name — "Column 3" is 3. */
  number: number;
  trackIdx: number;
}

export interface MatrixData {
  columns: number;
  rows: number;
  slots: ClipSlot[];
  /**
   * Reported by the extension, which reads the track names. Previously the
   * frontend inferred this by excluding anything that looked like Helgobox,
   * so every unrelated track in the project was treated as a column.
   */
  columnTracks?: ColumnTrack[];
}

export interface PlaytimeState {
  playtimeAvailable: boolean;
  instanceId: number;
  hasMatrix: boolean;
}

// ── Hook ─────────────────────────────────────────────────────

export function usePlaytime() {
  const { send } = useReaperClient();
  const [matrix, setMatrix] = useState<MatrixData | null>(null);

  const getMatrix = useCallback(async (): Promise<MatrixData | null> => {
    try {
      const resp = await send('matrix/getAll');
      const data = resp.payload as unknown as MatrixData;
      setMatrix(data);
      return data;
    } catch {
      return null;
    }
  }, [send]);

  const triggerSlot = useCallback(async (column: number, row: number): Promise<ClipSlot | null> => {
    try {
      const resp = await send('matrix/triggerSlot', { column, row });
      // Backend returns the slot object directly as the payload, not wrapped in {slot: ...}.
      // See command_handler.cpp: HandleMatrixTriggerSlot sends updated.toJson() directly.
      return (resp.payload as unknown as ClipSlot) ?? null;
    } catch {
      return null;
    }
  }, [send]);

  const triggerScene = useCallback(async (row: number): Promise<ClipSlot[] | null> => {
    try {
      const resp = await send('matrix/triggerScene', { row });
      const payload = resp.payload as Record<string, unknown>;
      return (payload?.slots as ClipSlot[]) ?? null;
    } catch {
      return null;
    }
  }, [send]);

  const checkPlaytimeAvailable = useCallback(async (): Promise<{available: boolean}> => {
    try {
      const resp = await send('playtime/isAvailable');
      const payload = resp.payload as Record<string, unknown>;
      return {
        available: payload?.available === true,
      };
    } catch {
      return { available: false };
    }
  }, [send]);

  const launchPlaytime = useCallback(async (): Promise<{launched: boolean; message: string}> => {
    try {
      const resp = await send('playtime/launch');
      const payload = resp.payload as Record<string, unknown>;
      return {
        launched: payload?.launched === true,
        message: (payload?.message as string) || '',
      };
    } catch {
      return { launched: false, message: 'Failed to send launch command' };
    }
  }, [send]);

  const setSlotState = useCallback(
    (column: number, row: number, state: ClipSlot['state']) => {
      send('matrix/setSlotState', { column, row, state }).catch(() => {});
    },
    [send],
  );

  const updateMatrixSlot = useCallback(
    (column: number, row: number, updates: Partial<ClipSlot>) => {
      setMatrix((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          slots: prev.slots.map((s) =>
            s.column === column && s.row === row ? { ...s, ...updates } : s,
          ),
        };
      });
    },
    [],
  );

  // Issue #75: Toggle reverse on a clip slot
  const setSlotReverse = useCallback(async (column: number, row: number, reversed: boolean): Promise<ClipSlot | null> => {
    try {
      const resp = await send('matrix/setSlotReverse', { column, row, reversed });
      const slot = (resp.payload as unknown as ClipSlot) ?? null;
      // Update local matrix state optimistically
      if (slot) {
        updateMatrixSlot(column, row, { reversed: slot.reversed });
      }
      return slot;
    } catch {
      return null;
    }
  }, [send, updateMatrixSlot]);

  // Issue #43: Audio recording workflow
  const recordSlot = useCallback(async (column: number, row: number): Promise<ClipSlot | null> => {
    try {
      const resp = await send('matrix/recordSlot', { column, row });
      const slot = (resp.payload as unknown as ClipSlot) ?? null;
      // Update local matrix state optimistically
      if (slot) {
        updateMatrixSlot(column, row, { state: slot.state, color: slot.color });
      }
      return slot;
    } catch {
      return null;
    }
  }, [send, updateMatrixSlot]);

  // Delete the clip in a slot (long-press → confirm in SessionView)
  const clearSlot = useCallback(async (column: number, row: number): Promise<ClipSlot | null> => {
    try {
      const resp = await send('matrix/clearSlot', { column, row });
      const slot = (resp.payload as unknown as ClipSlot) ?? null;
      if (slot) {
        updateMatrixSlot(column, row, { state: slot.state, name: slot.name, clipType: slot.clipType, reversed: slot.reversed });
      }
      return slot;
    } catch {
      return null;
    }
  }, [send, updateMatrixSlot]);

  /** Bounce a Playtime slot's source sample to a new RS5K sampler track */
  const samplerFromSlot = useCallback(async (column: number, row: number): Promise<{trackIdx: number; fxIdx: number; name: string} | null> => {
    try {
      const resp = await send('sampler/create', { column, row });
      if (!resp.success) return null;
      const p = resp.payload as Record<string, unknown>;
      return { trackIdx: p.trackIdx as number, fxIdx: p.fxIdx as number, name: p.name as string };
    } catch {
      return null;
    }
  }, [send]);

  /** Bounce an arbitrary sample file to a new RS5K sampler track */
  const samplerFromPath = useCallback(async (path: string): Promise<{trackIdx: number; fxIdx: number; name: string} | null> => {
    try {
      const resp = await send('sampler/create', { path });
      if (!resp.success) return null;
      const p = resp.payload as Record<string, unknown>;
      return { trackIdx: p.trackIdx as number, fxIdx: p.fxIdx as number, name: p.name as string };
    } catch {
      return null;
    }
  }, [send]);

  /** Toggle reverse on an RS5K sampler (renders a reversed copy server-side) */
  const samplerSetReverse = useCallback(async (trackIdx: number, fxIdx: number, reversed: boolean): Promise<boolean> => {
    try {
      const resp = await send('sampler/setReverse', { trackIdx, fxIdx, reversed }, 60000);
      return resp.success;
    } catch {
      return false;
    }
  }, [send]);

  // Issue #43: Real-time state polling
  const pollState = useCallback(async (): Promise<PlaytimeState> => {
    try {
      const resp = await send('matrix/pollState');
      const payload = resp.payload as Record<string, unknown>;
      return {
        playtimeAvailable: payload?.playtimeAvailable === true,
        instanceId: (payload?.instanceId as number) ?? -1,
        hasMatrix: payload?.hasMatrix === true,
      };
    } catch {
      return { playtimeAvailable: false, instanceId: -1, hasMatrix: false };
    }
  }, [send]);

    /**
   * Playtime's own transport, metronome and panic.
   *
   * Distinct from the play/stop/record buttons, which drive REAPER's
   * transport. The matrix has its own playback that runs whether or not the
   * project is rolling, and its own metronome.
   */
  const matrixPlay = useCallback(async (on: boolean): Promise<boolean> => {
    const r = await send('matrix/play', { on: on ? 'true' : 'false' });
    return r.success;
  }, [send]);

  const matrixStopAll = useCallback(async (): Promise<boolean> => {
    const r = await send('matrix/stopAll');
    return r.success;
  }, [send]);

  const matrixClick = useCallback(async (on: boolean): Promise<boolean> => {
    const r = await send('matrix/click', { on: on ? 'true' : 'false' });
    return r.success;
  }, [send]);

  const matrixPanic = useCallback(async (): Promise<boolean> => {
    const r = await send('matrix/panic');
    return r.success;
  }, [send]);

  /**
   * Tempo.
   *
   * Playtime has no numeric tempo of its own — it follows the project — so
   * setting one means setting REAPER's. Tap tempo is the only tempo control
   * Playtime itself offers.
   */
  const getTempo = useCallback(async (): Promise<number> => {
    const r = await send('transport/getTempo');
    if (!r.success) return 0;
    return (r.payload as unknown as { bpm: number }).bpm;
  }, [send]);

  const setTempo = useCallback(async (bpm: number): Promise<boolean> => {
    const r = await send('transport/setTempo', { bpm: String(bpm) });
    return r.success;
  }, [send]);

  const tapTempo = useCallback(async (): Promise<boolean> => {
    const r = await send('matrix/tapTempo');
    return r.success;
  }, [send]);

return {
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    setSlotState,
    updateMatrixSlot,
    recordSlot,
    clearSlot,
    samplerFromSlot,
    samplerFromPath,
    samplerSetReverse,
    pollState,
    setSlotReverse,
    launchPlaytime,
    checkPlaytimeAvailable,
    matrixPlay,
    matrixStopAll,
    matrixClick,
    matrixPanic,
    getTempo,
    setTempo,
    tapTempo,
  };
}

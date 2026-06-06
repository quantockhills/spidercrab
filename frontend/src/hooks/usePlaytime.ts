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
}

export interface MatrixData {
  columns: number;
  rows: number;
  slots: ClipSlot[];
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

  return {
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    setSlotState,
    updateMatrixSlot,
    recordSlot,
    pollState,
    setSlotReverse,
    launchPlaytime,
    checkPlaytimeAvailable,
  };
}

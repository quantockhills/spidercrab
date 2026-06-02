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
}

export interface MatrixData {
  columns: number;
  rows: number;
  slots: ClipSlot[];
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

  return {
    matrix,
    getMatrix,
    triggerSlot,
    triggerScene,
    setSlotState,
    updateMatrixSlot,
  };
}

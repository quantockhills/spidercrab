import { useState, useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

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

// ── Hook ─────────────────────────────────────────────────────

export function useSequencer() {
  const { send } = useReaperClient();
  const [sequencer, setSequencer] = useState<SequencerData | null>(null);

  const getSequencer = useCallback(async (): Promise<SequencerData | null> => {
    try {
      const resp = await send('sequencer/getAll');
      const data = resp.payload as unknown as SequencerData;
      setSequencer(data);
      return data;
    } catch {
      return null;
    }
  }, [send]);

  const toggleStep = useCallback(
    async (column: number, row: number): Promise<StepData | null> => {
      try {
        const resp = await send('sequencer/toggleStep', { column, row });
        const data = resp.payload as unknown as StepData;
        // Optimistic update
        setSequencer((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.column === column && s.row === row
                ? { ...s, active: data.active, velocity: data.velocity }
                : s,
            ),
          };
        });
        return data;
      } catch {
        return null;
      }
    },
    [send],
  );

  const setStep = useCallback(
    async (column: number, row: number, active: boolean, velocity = 100): Promise<boolean> => {
      try {
        await send('sequencer/setStep', { column, row, active, velocity });
        setSequencer((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.column === column && s.row === row ? { ...s, active, velocity } : s,
            ),
          };
        });
        return true;
      } catch {
        return false;
      }
    },
    [send],
  );

  const seqClearAll = useCallback(async (): Promise<boolean> => {
    try {
      await send('sequencer/clearAll');
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
  }, [send]);

  const seqSetLength = useCallback(async (length: number): Promise<boolean> => {
    try {
      await send('sequencer/setLength', { length });
      setSequencer((prev) => (prev ? { ...prev, length } : prev));
      return true;
    } catch {
      return false;
    }
  }, [send]);

  const seqSetBaseNote = useCallback(async (note: number): Promise<boolean> => {
    try {
      await send('sequencer/setBaseNote', { note });
      return true;
    } catch {
      return false;
    }
  }, [send]);

  return {
    sequencer,
    getSequencer,
    toggleStep,
    setStep,
    seqClearAll,
    seqSetLength,
    seqSetBaseNote,
  };
}

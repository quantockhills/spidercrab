import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Types ─────────────────────────────────────────────

export interface SlicePoint {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  label: string;
}

export interface SlicerDetectResult {
  slices: SlicePoint[];
}

export interface SlicerApplyResult {
  sliceCount: number;
  totalSlices: number;
  trackIdx: number;
  baseNote: number;
}

// ── Hook ──────────────────────────────────────────────

export function useSlicer() {
  const { send } = useReaperClient();

  const detectSlices = useCallback(
    async (filePath: string, sensitivity = 0.5): Promise<SlicerDetectResult | null> => {
      try {
        const resp = await send('slicer/detect', { filePath, sensitivity }, 30000);
        if (!resp.success) return null;
        return resp.payload as unknown as SlicerDetectResult;
      } catch {
        return null;
      }
    },
    [send],
  );

  const applyToRS5K = useCallback(
    async (
      filePath: string,
      sensitivity = 0.5,
      trackIdx?: number,
    ): Promise<SlicerApplyResult | null> => {
      try {
        const payload: Record<string, unknown> = { filePath, sensitivity };
        if (trackIdx !== undefined) payload.trackIdx = trackIdx;
        const resp = await send('slicer/applyToRS5K', payload, 60000);
        if (!resp.success) return null;
        return resp.payload as unknown as SlicerApplyResult;
      } catch {
        return null;
      }
    },
    [send],
  );

  return {
    detectSlices,
    applyToRS5K,
  };
}

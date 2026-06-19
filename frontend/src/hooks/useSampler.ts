import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Types ─────────────────────────────────────────────

export interface SamplerTrimInfo {
  startOffset: string;
  endOffset: string;
}

// ── Hook ──────────────────────────────────────────────

export function useSampler() {
  const { send } = useReaperClient();

  type PayloadMap = Record<string, unknown>;

  const getTrimInfo = useCallback(
    async (trackIdx: number, fxIdx: number): Promise<SamplerTrimInfo | null> => {
      try {
        const resp = await send('sampler/trim/getInfo', { trackIdx, fxIdx }, 10000);
        if (!resp.success) return null;
        const p = resp.payload as PayloadMap;
        return {
          startOffset: p.startOffset as string,
          endOffset: p.endOffset as string,
        };
      } catch {
        return null;
      }
    },
    [send],
  );

  const setTrimStart = useCallback(
    async (trackIdx: number, fxIdx: number, offset: number): Promise<boolean> => {
      try {
        const resp = await send('sampler/trim/setStart', { trackIdx, fxIdx, offset }, 10000);
        return resp.success;
      } catch {
        return false;
      }
    },
    [send],
  );

  const setTrimEnd = useCallback(
    async (trackIdx: number, fxIdx: number, offset: number): Promise<boolean> => {
      try {
        const resp = await send('sampler/trim/setEnd', { trackIdx, fxIdx, offset }, 10000);
        return resp.success;
      } catch {
        return false;
      }
    },
    [send],
  );

  return {
    getTrimInfo,
    setTrimStart,
    setTrimEnd,
  };
}

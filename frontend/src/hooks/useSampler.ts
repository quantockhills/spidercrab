import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Types ─────────────────────────────────────────────

export interface SamplerTrimInfo {
  startOffset: string;
  endOffset: string;
}

export interface SamplerVelInfo {
  paramIdx: number;
  name: string;
  value: number;
  min: number;
  max: number;
  formatted: string;
}

export interface SamplerAdsrParam {
  name: string;       // "Attack", "Decay", "Sustain", "Release"
  paramIdx: number;
  value: number;
  min: number;
  max: number;
  formatted: string;
}

export type SamplerAdsrInfo = SamplerAdsrParam[];

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

  const getVelocityInfo = useCallback(
    async (trackIdx: number, fxIdx: number): Promise<SamplerVelInfo | null> => {
      try {
        const resp = await send('sampler/vel/getInfo', { trackIdx, fxIdx }, 10000);
        if (!resp.success) return null;
        const p = resp.payload as PayloadMap;
        return {
          paramIdx: p.paramIdx as number,
          name: p.name as string,
          value: p.value as number,
          min: p.min as number,
          max: p.max as number,
          formatted: p.formatted as string,
        };
      } catch {
        return null;
      }
    },
    [send],
  );

  const setVelocity = useCallback(
    async (trackIdx: number, fxIdx: number, value: number): Promise<boolean> => {
      try {
        const resp = await send('sampler/vel/set', { trackIdx, fxIdx, value }, 10000);
        return resp.success;
      } catch {
        return false;
      }
    },
    [send],
  );

  const getAdsrInfo = useCallback(
    async (trackIdx: number, fxIdx: number): Promise<SamplerAdsrInfo | null> => {
      try {
        const resp = await send('sampler/adsr/getInfo', { trackIdx, fxIdx }, 10000);
        if (!resp.success) return null;
        const arr = resp.payload as unknown[];
        return arr.map((item: Record<string, unknown>) => ({
          name: item.name as string,
          paramIdx: item.paramIdx as number,
          value: item.value as number,
          min: item.min as number,
          max: item.max as number,
          formatted: item.formatted as string,
        }));
      } catch {
        return null;
      }
    },
    [send],
  );

  const setAdsrParam = useCallback(
    async (trackIdx: number, fxIdx: number, paramIdx: number, value: number): Promise<boolean> => {
      try {
        const resp = await send('sampler/adsr/setParam', { trackIdx, fxIdx, paramIdx, value }, 10000);
        return resp.success;
      } catch {
        return false;
      }
    },
    [send],
  );

  const loadFile = useCallback(
    async (trackIdx: number, fxIdx: number, filePath: string): Promise<boolean> => {
      try {
        const resp = await send('sampler/loadFile', { trackIdx, fxIdx, filePath }, 10000);
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
    getVelocityInfo,
    setVelocity,
    getAdsrInfo,
    setAdsrParam,
    loadFile,
  };
}

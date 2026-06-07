import { useState, useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface FxInfo {
  index: number;
  name: string;
  chainPath?: string | null;
}

export interface EnumeratedFx {
  index: number;
  name: string;
  ident: string;
  format: string;
}

export interface FxPresetInfo {
  presetIndex: number;
  presetName: string | null;
  numPresets: number;
}

export interface FxPresetNames {
  presetNames: string[];
  currentIndex: number;
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

// ── Hook ─────────────────────────────────────────────────────

export function useFx() {
  const { send } = useReaperClient();
  const [isRefreshingFx, setIsRefreshingFx] = useState(false);

  type PayloadMap = Record<string, unknown>;

  const enumerateFx = useCallback(async (): Promise<EnumeratedFx[]> => {
    const resp = await send('fx/enumerate', {}, 60000);
    return (resp.payload as PayloadMap).fx as EnumeratedFx[];
  }, [send]);

  const getTrackFx = useCallback(async (trackIdx: number): Promise<FxInfo[]> => {
    const resp = await send('track/getFx', { trackIdx }, 30000);
    return (resp.payload as PayloadMap).fx as FxInfo[];
  }, [send]);

  const getFxParams = useCallback(
    async (trackIdx: number, fxIdx: number, offset?: number, limit?: number): Promise<{
      params: FxParam[];
      total: number;
      offset: number;
      limit: number;
    }> => {
      const payload: Record<string, unknown> = { trackIdx, fxIdx };
      if (offset !== undefined) payload.offset = offset;
      if (limit !== undefined) payload.limit = limit;
      const resp = await send('fx/getParams', payload, 30000);
      const p = resp.payload as PayloadMap;
      return {
        params: p.params as FxParam[],
        total: p.total as number,
        offset: p.offset as number,
        limit: p.limit as number,
      };
    },
    [send],
  );

  const setFxParam = useCallback(
    async (trackIdx: number, fxIdx: number, paramIdx: number, value: number) => {
      const resp = await send('fx/setParam', { trackIdx, fxIdx, paramIdx, value });
      return resp;
    },
    [send],
  );

  const addFx = useCallback(async (trackIdx: number, fxName: string): Promise<number> => {
    const resp = await send('fx/add', { trackIdx, fxName });
    return ((resp.payload as PayloadMap).fxIdx as number) ?? -1;
  }, [send]);

  const deleteFx = useCallback(async (trackIdx: number, fxIdx: number): Promise<boolean> => {
    const resp = await send('fx/delete', { trackIdx, fxIdx });
    return resp.success;
  }, [send]);

  const refreshFxCache = useCallback(async (): Promise<boolean> => {
    setIsRefreshingFx(true);
    try {
      const resp = await send('fx/refreshCache', {}, 65000);
      return resp.success;
    } finally {
      setIsRefreshingFx(false);
    }
  }, [send]);

  const reorderFx = useCallback(async (trackIdx: number, fromIndex: number, toIndex: number): Promise<boolean> => {
    const resp = await send('fx/reorder', { trackIdx, fromIndex, toIndex });
    return resp.success;
  }, [send]);

  const getFxPreset = useCallback(async (trackIdx: number, fxIdx: number): Promise<FxPresetInfo | null> => {
    try {
      const resp = await send('fx/getPreset', { trackIdx, fxIdx });
      return resp.payload as unknown as FxPresetInfo;
    } catch {
      return null;
    }
  }, [send]);

  const setFxPreset = useCallback(async (trackIdx: number, fxIdx: number, presetIdx: number): Promise<FxPresetInfo | null> => {
    try {
      const resp = await send('fx/setPreset', { trackIdx, fxIdx, presetIdx });
      return resp.payload as unknown as FxPresetInfo;
    } catch {
      return null;
    }
  }, [send]);

  const getAllFxPresetNames = useCallback(async (trackIdx: number, fxIdx: number): Promise<FxPresetNames | null> => {
    try {
      const resp = await send('fx/getAllPresetNames', { trackIdx, fxIdx }, 30000);
      return resp.payload as unknown as FxPresetNames;
    } catch {
      return null;
    }
  }, [send]);

  return {
    enumerateFx,
    getTrackFx,
    getFxParams,
    setFxParam,
    addFx,
    deleteFx,
    reorderFx,
    getFxPreset,
    setFxPreset,
    getAllFxPresetNames,
    refreshFxCache,
    isRefreshingFx,
  };
}

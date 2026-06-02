import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface FxChainEntry {
  name: string;
  size: number;
  type?: 'dir' | 'file';
}

// ── Search result type ──────────────────────────────────────

export interface FxChainSearchResult {
  filePath: string;
  name: string;
  size: number;
}

// ── Public types ─────────────────────────────────────────────

export interface FxChainInfo {
  filePath: string;
  fxCount: number;
  fxNames: string[];
  fileSize: number;
}

// ── Hook ─────────────────────────────────────────────────────

export function useFxChains() {
  const { send } = useReaperClient();

  const fxChainGetDirectory = useCallback(
    async (path: string): Promise<{ chains: FxChainEntry[]; dirs: string[] }> => {
      const resp = await send('fxchain/getDirectory', { path }, 60000);
      return resp.payload as { chains: FxChainEntry[]; dirs: string[] };
    },
    [send],
  );

  const fxChainSave = useCallback(
    async (trackIdx: number, filePath: string): Promise<boolean> => {
      const resp = await send('fxchain/save', { trackIdx, filePath });
      return resp.success;
    },
    [send],
  );

  const fxChainLoad = useCallback(
    async (trackIdx: number, filePath: string, mode: 'replace' | 'append' = 'replace'): Promise<boolean> => {
      const resp = await send('fxchain/load', { trackIdx, filePath, mode });
      return resp.success;
    },
    [send],
  );

  const fxChainGetInfo = useCallback(
    async (filePath: string): Promise<FxChainInfo | null> => {
      try {
        const resp = await send('fxchain/getInfo', { filePath });
        return resp.payload as unknown as FxChainInfo;
      } catch {
        return null;
      }
    },
    [send],
  );

  const fxChainSearchRecursive = useCallback(
    async (query: string, rootPath: string): Promise<{ query: string; results: FxChainSearchResult[] }> => {
      const resp = await send('fxchain/searchRecursive', { query, rootPath }, 60000);
      return resp.payload as { query: string; results: FxChainSearchResult[] };
    },
    [send],
  );

  return { fxChainGetDirectory, fxChainSave, fxChainLoad, fxChainGetInfo, fxChainSearchRecursive };
}

import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  size: number;
}

// ── Hook ─────────────────────────────────────────────────────

export function useSampleBrowser() {
  const { send } = useReaperClient();

  const getDirectory = useCallback(
    async (path: string): Promise<{ entries: DirEntry[] }> => {
      const resp = await send('sample/getDirectory', { path });
      return resp.payload as { entries: DirEntry[] };
    },
    [send],
  );

  const sendSampleToTrack = useCallback(
    async (path: string, trackIdx: number): Promise<boolean> => {
      const resp = await send('sample/sendToTrack', { path, trackIdx });
      return resp.success;
    },
    [send],
  );

  const refreshSampleCache = useCallback(
    async (rootPath?: string): Promise<boolean> => {
      const params: Record<string, unknown> = {};
      if (rootPath) params.rootPath = rootPath;
      const resp = await send('sample/refreshCache', params);
      return resp.success;
    },
    [send],
  );

  return { getDirectory, sendSampleToTrack, refreshSampleCache };
}

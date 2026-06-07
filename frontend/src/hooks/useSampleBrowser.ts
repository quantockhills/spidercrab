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
    async (path?: string): Promise<{ total: number; rootPath: string }> => {
      const resp = await send('sample/refreshCache', path ? { path } : {});
      return resp.payload as { total: number; rootPath: string };
    },
    [send],
  );

  return { getDirectory, sendSampleToTrack, refreshSampleCache };
}

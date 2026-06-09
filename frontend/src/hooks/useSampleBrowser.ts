import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface DirEntry {
  name: string;
  type: 'dir' | 'file';
}

export interface SampleTagData {
  sampleTags: Record<string, string[]>;
}

export interface DirResult {
  entries: DirEntry[];
  total: number;
  offset: number;
  path: string;
}

// ── Hook ─────────────────────────────────────────────────────

export function useSampleBrowser() {
  const { send } = useReaperClient();

  const getDirectory = useCallback(
    async (path: string, offset = 0, limit = 100): Promise<DirResult> => {
      const resp = await send('sample/getDirectory', { path, offset, limit });
      const p = resp.payload as unknown as DirResult;
      return {
        entries: p.entries || [],
        total:   typeof p.total  === 'number' ? p.total  : (p.entries || []).length,
        offset:  typeof p.offset === 'number' ? p.offset : 0,
        path:    p.path || path,
      };
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

  const sendSampleToSlot = useCallback(
    async (path: string, column: number, row: number): Promise<boolean> => {
      const resp = await send('sample/sendToSlot', { path, column, row });
      return resp.success;
    },
    [send],
  );

  const getSampleTags = useCallback(async (): Promise<SampleTagData | null> => {
    try {
      const resp = await send('sample/tags/getAll', {});
      return resp.payload as unknown as SampleTagData;
    } catch { return null; }
  }, [send]);

  const setSampleTags = useCallback(
    async (filePath: string, tags: string[]): Promise<boolean> => {
      try {
        await send('sample/tags/set', { filePath, tags });
        return true;
      } catch { return false; }
    },
    [send],
  );

  return { getDirectory, sendSampleToTrack, refreshSampleCache, sendSampleToSlot, getSampleTags, setSampleTags };
}

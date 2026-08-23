import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface DirEntry {
  name: string;
  type: 'dir' | 'file';
}

/** An optional trimmed region (seconds) to send instead of the whole file. */
export interface SampleRegion {
  start: number;
  end: number;
  reverse?: boolean;
}

function regionParams(region?: SampleRegion): Record<string, unknown> {
  if (!region) return {};
  return {
    regionStart: region.start,
    regionEnd: region.end,
    reverse: region.reverse ? 'true' : undefined,
  };
}

export interface SampleTagData {
  sampleTags: Record<string, string[]>;
}

/** One hit from searching every media database at once. */
export interface DatabaseHit {
  path: string;
  /** Which database it came from — the answer carries its own context. */
  library: string;
}

export interface DatabaseSearchResult {
  results: DatabaseHit[];
  count: number;
  libraries: number;
  /** True when the cap was reached, so the list is a sample not the whole answer. */
  truncated: boolean;
}

export interface ReaperLibrary {
  name: string;
  file: string;
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
      const resp = await send('sample/getDirectory', { path, offset, limit }, 300000);
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
    async (path: string, trackIdx: number, region?: SampleRegion): Promise<boolean> => {
      const resp = await send('sample/sendToTrack', { path, trackIdx, ...regionParams(region) });
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
    async (path: string, column: number, row: number, region?: SampleRegion): Promise<boolean> => {
      const resp = await send('sample/sendToSlot', { path, column, row, ...regionParams(region) });
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

  const getReaperLibraries = useCallback(async (): Promise<ReaperLibrary[]> => {
    try {
      const resp = await send('sample/reaper/libraries', {});
      const p = resp.payload as unknown as { libraries: ReaperLibrary[] };
      return p.libraries || [];
    } catch { return []; }
  }, [send]);

  const getReaperLibraryFiles = useCallback(async (file: string): Promise<string[]> => {
    try {
      const resp = await send('sample/reaper/library/files', { file });
      const p = resp.payload as unknown as { files: string[] };
      return p.files || [];
    } catch { return []; }
  }, [send]);

  /**
   * Search every media database at once.
   *
   * The media explorer makes you pick a database first, which is backwards
   * when what you remember is the sound rather than where you filed it.
   */
  const searchDatabases = useCallback(
    async (query: string, limit = 300): Promise<DatabaseSearchResult> => {
      const empty = { results: [], count: 0, libraries: 0, truncated: false };
      if (query.trim().length < 2) return empty;
      const resp = await send('sample/reaper/searchAll', { query: query.trim(), limit: String(limit) });
      if (!resp.success) return empty;
      return resp.payload as unknown as DatabaseSearchResult;
    }, [send]);

  return { getDirectory, sendSampleToTrack, refreshSampleCache, sendSampleToSlot, getSampleTags, setSampleTags, getReaperLibraries, getReaperLibraryFiles, searchDatabases };
}

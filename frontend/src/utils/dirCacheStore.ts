import type { DirResult } from '../hooks/useSampleBrowser';

const CACHE_KEY = 'sampleDirCache';

function loadFromStorage(): Map<string, DirResult> {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Record<string, DirResult>;
      return new Map(Object.entries(data));
    }
  } catch { /* ignore */ }
  return new Map();
}

export const dirCacheStore: Map<string, DirResult> = loadFromStorage();

export function persistDirCache(): void {
  try {
    const data: Record<string, DirResult> = {};
    dirCacheStore.forEach((v, k) => { data[k] = v; });
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

export function populateDirCache(data: Record<string, DirResult>): void {
  Object.entries(data).forEach(([k, v]) => dirCacheStore.set(k, v));
  persistDirCache();
}

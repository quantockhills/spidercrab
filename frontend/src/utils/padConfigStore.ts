// Pad instrument config, kept module-level and localStorage-persisted so
// the Keys tab's settings survive switching tabs (which unmounts the
// component) and reloads. Same pattern as dirCacheStore.

export interface PadConfig {
  scaleId: string;
  root: number;      // semitone 0-11
  octave: number;    // octave of pad 0
  chordMode: boolean;
  chordTypeId: string;
  latch: boolean;
}

export const PAD_CONFIG_KEY = 'padConfig';

export const DEFAULT_PAD_CONFIG: PadConfig = {
  scaleId: 'Major',
  root: 0,
  octave: 4,
  chordMode: false,
  chordTypeId: 'triad',
  latch: false,
};

function load(): PadConfig {
  try {
    const stored = localStorage.getItem(PAD_CONFIG_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Partial<PadConfig>;
      const merged: PadConfig = { ...DEFAULT_PAD_CONFIG, ...data };
      // Defensive range checks against hand-edited or stale storage
      merged.root = Math.max(0, Math.min(11, Number(merged.root) || 0));
      merged.octave = Math.max(2, Math.min(6, Number(merged.octave) || 4));
      return merged;
    }
  } catch { /* unreadable storage — fall through to defaults */ }
  return { ...DEFAULT_PAD_CONFIG };
}

export const padConfigStore: PadConfig = load();

export function persistPadConfig(): void {
  try {
    localStorage.setItem(PAD_CONFIG_KEY, JSON.stringify(padConfigStore));
  } catch { /* quota exceeded */ }
}

// Test seam: reset to defaults (module state leaks across tests otherwise)
export function resetPadConfigStore(): void {
  Object.assign(padConfigStore, DEFAULT_PAD_CONFIG);
  try {
    localStorage.removeItem(PAD_CONFIG_KEY);
  } catch { /* ignore */ }
}

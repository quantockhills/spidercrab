import { useState, useCallback } from 'react';

const STORAGE_KEY = 'spidercrab-ui-scale';

// Discrete steps rather than a free slider — predictable taps, and every
// value stays legible at touch-target sizes.
export const UI_SCALE_STEPS = [0.85, 0.9, 1, 1.1, 1.25, 1.4] as const;
const DEFAULT_SCALE = 1;

function getStoredScale(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const n = stored ? parseFloat(stored) : NaN;
    if (!isNaN(n) && (UI_SCALE_STEPS as readonly number[]).includes(n)) {
      return n;
    }
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
  return DEFAULT_SCALE;
}

export function useUIScale() {
  const [scale, setScaleState] = useState<number>(getStoredScale);

  const setScale = useCallback((next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage may be unavailable
    }
    setScaleState(next);
  }, []);

  const stepIndex = UI_SCALE_STEPS.indexOf(scale as (typeof UI_SCALE_STEPS)[number]);

  const increase = useCallback(() => {
    const i = UI_SCALE_STEPS.indexOf(scale as (typeof UI_SCALE_STEPS)[number]);
    if (i >= 0 && i < UI_SCALE_STEPS.length - 1) setScale(UI_SCALE_STEPS[i + 1]);
  }, [scale, setScale]);

  const decrease = useCallback(() => {
    const i = UI_SCALE_STEPS.indexOf(scale as (typeof UI_SCALE_STEPS)[number]);
    if (i > 0) setScale(UI_SCALE_STEPS[i - 1]);
  }, [scale, setScale]);

  const reset = useCallback(() => setScale(DEFAULT_SCALE), [setScale]);

  return {
    scale,
    setScale,
    increase,
    decrease,
    reset,
    canIncrease: stepIndex >= 0 && stepIndex < UI_SCALE_STEPS.length - 1,
    canDecrease: stepIndex > 0,
  } as const;
}

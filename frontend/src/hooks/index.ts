// ── ReaperClient context ──
export {
  ReaperClientProvider,
  useReaperClient,
} from './useReaperClient';
export type { ReaperClientContextValue } from './useReaperClient';

// ── Domain hooks ──
export { useTransport } from './useTransport';
export type { TransportState } from './useTransport';

export { useTrackState } from './useTrackState';
export type { Track } from './useTrackState';

export { useFx } from './useFx';
export type { FxInfo, EnumeratedFx, FxParam } from './useFx';

export { useFxChains } from './useFxChains';
export type { FxChainEntry, FxChainInfo } from './useFxChains';

export { useSampleBrowser } from './useSampleBrowser';
export type { DirEntry } from './useSampleBrowser';

export { usePlaytime } from './usePlaytime';
export type { ClipSlot, MatrixData } from './usePlaytime';

export { useSequencer } from './useSequencer';
export type { StepData, SequencerData } from './useSequencer';

// ── Backward-compat composite ──
export { useReaper } from './useReaper';
export type { UseReaperOptions } from './useReaper';

// ── Theme ──
export { useTheme } from './useTheme';

// ── UI scale (Safari/iPad has no ctrl +/- zoom) ──
export { useUIScale, UI_SCALE_STEPS } from './useUIScale';

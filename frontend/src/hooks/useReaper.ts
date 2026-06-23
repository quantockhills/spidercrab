/**
 * Backward-compatible composite hook that re-exports all domain hooks.
 *
 * This is kept for existing consumers that import useReaper directly.
 * New code should import from the individual domain hooks or from hooks/index.ts.
 *
 * To use this hook, wrap your app with <ReaperClientProvider>.
 * By default it connects to 127.0.0.1:9224.
 *
 * Usage (legacy):
 *   const { connected, tracks, play, ... } = useReaper();
 *
 * Usage (new - preferred):
 *   const { connected, onEvent } = useReaperClient();
 *   const { tracks } = useTrackState();
 *   const { play } = useTransport();
 */

import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';
import { useTransport } from './useTransport';
import { useTrackState } from './useTrackState';
import { useFx } from './useFx';
import { useFxChains } from './useFxChains';
import { useSampleBrowser } from './useSampleBrowser';
import { usePlaytime } from './usePlaytime';
import { useSequencer } from './useSequencer';

// Re-export all types for backward compatibility
export type { Track } from './useTrackState';
export type { FxInfo, EnumeratedFx, FxParam, FxPresetInfo, FxPresetNames, MidiCcMapping } from './useFx';
export type { DirEntry, SampleTagData } from './useSampleBrowser';
export type { FxChainEntry, FxChainInfo, FxChainSearchResult, FxChainCachedSearchResult } from './useFxChains';
export type { ClipSlot, MatrixData } from './usePlaytime';
export type { StepData, SequencerData } from './useSequencer';

export interface UseReaperOptions {
  host?: string;
  port?: number;
}

export function useReaper(_opts?: UseReaperOptions) {
  // _opts is unused — host/port are configured via ReaperClientProvider
  void _opts;
  const { connected, send, onEvent, clientRef } = useReaperClient();
  const transport = useTransport();
  const trackState = useTrackState();
  const fx = useFx();
  const fxChains = useFxChains();
  const sampleBrowser = useSampleBrowser();
  const playtime = usePlaytime();
  const sequencer = useSequencer();

  // Generic sendCommand for hooks that need raw access (e.g. useAudioPreview)
  const sendCommand = useCallback(
    async (command: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<{ payload: Record<string, unknown> }> => {
      if (!clientRef.current) throw new Error('Not connected');
      return await clientRef.current.send(command, params || {}, timeoutMs);
    },
    []
  );

  return {
    // From ReaperClient
    connected,
    send,
    onEvent,

    // From useTransport
    ...transport,

    // From useTrackState
    ...trackState,

    // From useFx
    ...fx,

    // From useFxChains
    ...fxChains,

    // From useSampleBrowser
    ...sampleBrowser,

    // From usePlaytime
    ...playtime,

    // From useSequencer
    ...sequencer,

    // Stubs for features not yet in domain hooks
    fxChainCycle: useCallback(async (_trackIdx: number, _dir: 'next' | 'prev', _chainPath?: string) => ({ success: false as boolean }), []),
    convertToClip: useCallback(async (): Promise<{success: boolean; error?: string}> => ({ success: false, error: 'not implemented' }), []),

    // Low-level access (kept for backward compat)
    clientRef,
    sendCommand,
  };
}

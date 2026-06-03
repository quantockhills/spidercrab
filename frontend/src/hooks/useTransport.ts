import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Public types ─────────────────────────────────────────────

export interface TransportState {
  playing: boolean;
  recording: boolean;
}

// ── Hook ─────────────────────────────────────────────────────

export function useTransport() {
  const { send } = useReaperClient();

  const play = useCallback(async (): Promise<boolean> => {
    const resp = await send('transport/play');
    return resp.success;
  }, [send]);

  const stop = useCallback(async (): Promise<boolean> => {
    const resp = await send('transport/stop');
    return resp.success;
  }, [send]);

  const record = useCallback(async (): Promise<boolean> => {
    const resp = await send('transport/record');
    return resp.success;
  }, [send]);

  const getTransportState = useCallback(async (): Promise<TransportState> => {
    const resp = await send('transport/getState');
    const payload = resp.payload as Record<string, unknown> | undefined;
    return {
      playing: (payload?.playing as boolean) ?? false,
      recording: (payload?.recording as boolean) ?? false,
    };
  }, [send]);

  return { play, stop, record, getTransportState };
}

import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';

// ── Types ────────────────────────────────────────────────────

export interface MidiCcParam {
  cc: number;
  name: string;
  value: number;
  min?: number;
  max?: number;
}

// ── Hook ─────────────────────────────────────────────────────

export function useMidiParam() {
  const { send } = useReaperClient();

  const sendMidiCC = useCallback(
    async (channel: number, cc: number, value: number) => {
      const resp = await send('midi/sendCC', { channel, controller: cc, value });
      return resp;
    },
    [send],
  );

  const sendMidiNote = useCallback(
    async (channel: number, note: number, velocity: number) => {
      const resp = await send('midi/event', {
        type: 'noteon',
        channel,
        data1: note,
        data2: velocity,
      });
      return resp;
    },
    [send],
  );

  return {
    sendMidiCC,
    sendMidiNote,
  };
}
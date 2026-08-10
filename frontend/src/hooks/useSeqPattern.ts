import { useCallback } from 'react';
import { useReaperClient } from './useReaperClient';
import { encodeNotes, type SeqNote } from '../lib/seqPattern';

// ── Public types ─────────────────────────────────────────────

export interface SeqItem {
  itemIdx: number;
  name: string;
  position: number;
  length: number;
}

export interface SeqPattern {
  trackIdx: number;
  itemIdx: number;
  position: number;
  length: number;
  /** PPQ bounds of the item, which is what note positions are measured against. */
  ppqStart: number;
  ppqEnd: number;
  notes: SeqNote[];
  /** Per-step detail the notes cannot carry. Empty is normal. */
  ext: string;
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * Reading and writing a pattern that lives in a MIDI item.
 *
 * There is no local copy of the pattern here on purpose. The item is the
 * pattern; anything cached would be a second answer to the same question,
 * and would go stale the moment someone edited the part in REAPER.
 */
export function useSeqPattern() {
  const { send } = useReaperClient();

  const listItems = useCallback(async (trackIdx: number): Promise<SeqItem[]> => {
    const resp = await send('seq/listItems', { trackIdx });
    if (!resp.success) return [];
    const payload = resp.payload as { items?: SeqItem[] } | undefined;
    return payload?.items ?? [];
  }, [send]);

  const readPattern = useCallback(
    async (trackIdx: number, itemIdx: number): Promise<SeqPattern | null> => {
      const resp = await send('seq/readPattern', { trackIdx, itemIdx });
      if (!resp.success) return null;
      return resp.payload as unknown as SeqPattern;
    }, [send]);

  /**
   * Replace the item's notes.
   *
   * Whole-pattern replacement rather than per-note edits: note indices are
   * positional and shift under any deletion, so incremental writes would need
   * bookkeeping that survives someone editing the same item in REAPER's own
   * MIDI editor. The extension wraps this in a single undo block.
   */
  const writePattern = useCallback(
    async (trackIdx: number, itemIdx: number, notes: SeqNote[], ext = ''): Promise<boolean> => {
      const resp = await send('seq/writePattern', {
        trackIdx, itemIdx, notes: encodeNotes(notes), ext,
      });
      return resp.success;
    }, [send]);

  /**
   * Make a track with an empty MIDI item on it.
   *
   * An empty project should not be a dead end with instructions in it. The
   * point of this tab is to get a pattern going quickly, so the first tap
   * should be a step, not a trip to REAPER.
   */
  const createTrack = useCallback(
    async (name = 'Steps', bars = 2): Promise<{ trackIdx: number; itemIdx: number } | null> => {
      const resp = await send('seq/createTrack', { name, bars });
      if (!resp.success) return null;
      const p = resp.payload as unknown as { trackIdx: number; itemIdx: number };
      return { trackIdx: p.trackIdx, itemIdx: p.itemIdx };
    }, [send]);

  /**
   * Hand the pattern to a Playtime slot.
   *
   * A MIDI item only sounds when the playhead crosses it. A Playtime clip
   * plays with the transport stopped, loops, launches from the matrix and is
   * in phase with every other clip — not because two clocks were bridged, but
   * because there is only one.
   *
   * The item stays the editable original; the slot holds a copy. Send again
   * after editing to replace it.
   */
  const sendToSlot = useCallback(
    async (trackIdx: number, itemIdx: number, col: number, row: number): Promise<boolean> => {
      const resp = await send('seq/sendToSlot', { trackIdx, itemIdx, col, row });
      return resp.success;
    }, [send]);

  return { listItems, readPattern, writePattern, createTrack, sendToSlot };
}

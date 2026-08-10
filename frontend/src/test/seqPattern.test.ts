import { describe, it, expect } from 'vitest';
import {
  notesToGrid, gridToNotes, rowsFromNotes, encodeNotes, stepPpq,
  DEFAULT_ROWS, type SeqNote,
} from '../lib/seqPattern';

// One bar of 16ths at REAPER's usual 960 ticks per quarter note.
const PPQ_START = 0;
const PPQ_END = 3840;
const STEPS = 16;
const SP = 240;

const note = (pitch: number, step: number, vel = 100, chan = 0): SeqNote => ({
  pitch, start: PPQ_START + step * SP, end: PPQ_START + step * SP + 120, vel, chan,
});

describe('stepPpq', () => {
  it('divides the item span by the step count', () => {
    expect(stepPpq(0, 3840, 16)).toBe(240);
  });

  it('does not divide by zero', () => {
    expect(stepPpq(0, 3840, 0)).toBe(0);
  });
});

describe('rowsFromNotes', () => {
  it('uses the pitches actually present, highest first', () => {
    expect(rowsFromNotes([note(36, 0), note(42, 1), note(38, 2)])).toEqual([42, 38, 36]);
  });

  it('does not repeat a pitch that appears many times', () => {
    expect(rowsFromNotes([note(36, 0), note(36, 4), note(36, 8)])).toEqual([36]);
  });

  it('falls back to a drum set when the item is empty', () => {
    expect(rowsFromNotes([])).toEqual(DEFAULT_ROWS);
  });
});

describe('notesToGrid', () => {
  it('places a note on its step', () => {
    const g = notesToGrid([note(36, 0), note(36, 4)], PPQ_START, PPQ_END, STEPS);
    expect(g.rows).toEqual([36]);
    expect(g.cells[0][0].on).toBe(true);
    expect(g.cells[0][4].on).toBe(true);
    expect(g.cells[0][1].on).toBe(false);
  });

  it('carries velocity through', () => {
    const g = notesToGrid([note(36, 0, 37)], PPQ_START, PPQ_END, STEPS);
    expect(g.cells[0][0].vel).toBe(37);
  });

  it('counts notes that are off the grid', () => {
    const off: SeqNote = { pitch: 36, start: 100, end: 220, vel: 100, chan: 0 };
    const g = notesToGrid([note(36, 0), off], PPQ_START, PPQ_END, STEPS);
    expect(g.offGrid).toBe(1);
  });

  it('treats a slightly early hit as on the grid', () => {
    // Micro-timing of a few ticks is a groove, not a different step.
    const nudged: SeqNote = { pitch: 36, start: 4 * SP - 10, end: 4 * SP + 110, vel: 100, chan: 0 };
    const g = notesToGrid([nudged], PPQ_START, PPQ_END, STEPS);
    expect(g.offGrid).toBe(0);
    expect(g.cells[0][4].on).toBe(true);
  });

  it('keeps the louder of two notes sharing a cell', () => {
    const g = notesToGrid([note(36, 0, 40), note(36, 0, 110)], PPQ_START, PPQ_END, STEPS);
    expect(g.cells[0][0].vel).toBe(110);
  });

  it('ignores a pitch that has no row', () => {
    const g = notesToGrid([note(36, 0), note(99, 1)], PPQ_START, PPQ_END, STEPS, [36]);
    expect(g.rows).toEqual([36]);
    expect(g.cells[0][1].on).toBe(false);
  });

  it('drops a note beyond the last step rather than folding it back', () => {
    const late: SeqNote = { pitch: 36, start: PPQ_END + SP, end: PPQ_END + SP + 120, vel: 100, chan: 0 };
    const g = notesToGrid([late], PPQ_START, PPQ_END, STEPS, [36]);
    expect(g.cells[0].some((c) => c.on)).toBe(false);
  });
});

describe('gridToNotes', () => {
  it('round-trips a pattern unchanged', () => {
    const input = [note(36, 0), note(38, 4), note(42, 2)];
    const grid = notesToGrid(input, PPQ_START, PPQ_END, STEPS);
    const out = gridToNotes(grid, PPQ_START, PPQ_END);

    expect(out).toHaveLength(3);
    const at = (pitch: number) => out.find((n) => n.pitch === pitch)!;
    expect(at(36).start).toBe(0);
    expect(at(42).start).toBe(2 * SP);
    expect(at(38).start).toBe(4 * SP);
  });

  it('preserves velocity across the round trip', () => {
    const grid = notesToGrid([note(36, 0, 42)], PPQ_START, PPQ_END, STEPS);
    expect(gridToNotes(grid, PPQ_START, PPQ_END)[0].vel).toBe(42);
  });

  it('never emits a zero-length note', () => {
    // The extension rejects end <= start outright, so a tiny gate must still
    // produce something playable rather than failing the whole write.
    const grid = notesToGrid([note(36, 0)], PPQ_START, PPQ_END, STEPS);
    const out = gridToNotes(grid, PPQ_START, PPQ_END, 0, 0);
    expect(out[0].end).toBeGreaterThan(out[0].start);
  });

  it('clamps velocity into what MIDI allows', () => {
    const grid = notesToGrid([], PPQ_START, PPQ_END, STEPS, [36]);
    grid.cells[0][0] = { on: true, vel: 999 };
    grid.cells[0][1] = { on: true, vel: 0 };
    const out = gridToNotes(grid, PPQ_START, PPQ_END);
    expect(out[0].vel).toBe(127);
    expect(out[1].vel).toBe(1);
  });

  it('returns notes in time order', () => {
    const grid = notesToGrid([note(36, 8), note(38, 0), note(42, 4)], PPQ_START, PPQ_END, STEPS);
    const out = gridToNotes(grid, PPQ_START, PPQ_END);
    expect(out.map((n) => n.start)).toEqual([0, 4 * SP, 8 * SP]);
  });

  it('emits nothing for an empty grid', () => {
    const grid = notesToGrid([], PPQ_START, PPQ_END, STEPS, [36]);
    expect(gridToNotes(grid, PPQ_START, PPQ_END)).toEqual([]);
  });
});

describe('encodeNotes', () => {
  it('matches the format seq_notes.h parses', () => {
    expect(encodeNotes([{ pitch: 36, start: 0, end: 120, vel: 100, chan: 0 }]))
      .toBe('36:0:120:100:0');
  });

  it('separates records with commas', () => {
    expect(encodeNotes([
      { pitch: 36, start: 0, end: 120, vel: 100, chan: 0 },
      { pitch: 38, start: 240, end: 360, vel: 90, chan: 9 },
    ])).toBe('36:0:120:100:0,38:240:360:90:9');
  });

  it('encodes an empty pattern as an empty string', () => {
    // Which the extension reads as "clear every note", not as an error.
    expect(encodeNotes([])).toBe('');
  });
});

/**
 * Converting between a MIDI item's notes and a step grid.
 *
 * The pattern lives in the item — these functions are only a view onto it.
 * They are pure so they can be tested without a browser or a running REAPER,
 * which matters because a rounding error here silently moves someone's notes.
 */

export interface SeqNote {
  pitch: number;
  /** PPQ, absolute within the take. */
  start: number;
  end: number;
  vel: number;
  chan: number;
  muted?: boolean;
}

export interface Step {
  on: boolean;
  /** 1..127. Meaningless when `on` is false, but kept so toggling a step off
   *  and on again does not forget how hard it was hit. */
  vel: number;
}

export interface Grid {
  /** MIDI note per row, highest first — the order a piano roll draws them. */
  rows: number[];
  steps: number;
  /** `cells[rowIndex][stepIndex]`. */
  cells: Step[][];
  /**
   * Notes that did not land on a step boundary.
   *
   * Reading is lossy for anything not written on the grid: a part played in
   * loosely, or nudged off the beat on purpose, will be pulled straight the
   * first time the grid is written back. The count is surfaced so the UI can
   * say so before that happens rather than after.
   */
  offGrid: number;
}

/** A drum row set, used when an item has no notes to infer rows from. */
export const DEFAULT_ROWS = [51, 49, 46, 45, 42, 38, 37, 36];

/** How close to a step boundary still counts as on it, as a fraction of a step. */
const ON_GRID_TOLERANCE = 0.12;

export function stepPpq(ppqStart: number, ppqEnd: number, steps: number): number {
  if (steps <= 0) return 0;
  return (ppqEnd - ppqStart) / steps;
}

/**
 * Which rows to draw, given what the item already contains.
 *
 * Rows come from the notes themselves rather than from a base note plus an
 * offset, so an item using three drums shows three rows instead of an octave
 * of mostly-empty ones.
 */
export function rowsFromNotes(notes: SeqNote[], fallback = DEFAULT_ROWS): number[] {
  const present = Array.from(new Set(notes.map((n) => n.pitch)));
  if (!present.length) return [...fallback];
  return present.sort((a, b) => b - a);
}

export function emptyCells(rows: number, steps: number): Step[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: steps }, () => ({ on: false, vel: 100 })));
}

export function notesToGrid(
  notes: SeqNote[],
  ppqStart: number,
  ppqEnd: number,
  steps: number,
  rows?: number[],
): Grid {
  const rowList = rows ?? rowsFromNotes(notes);
  const cells = emptyCells(rowList.length, steps);
  const sp = stepPpq(ppqStart, ppqEnd, steps);

  let offGrid = 0;
  if (sp > 0) {
    const rowOf = new Map(rowList.map((pitch, i) => [pitch, i]));
    for (const n of notes) {
      const r = rowOf.get(n.pitch);
      if (r === undefined) continue;  // a pitch outside the drawn rows

      const exact = (n.start - ppqStart) / sp;
      const idx = Math.round(exact);
      if (Math.abs(exact - idx) > ON_GRID_TOLERANCE) offGrid++;
      if (idx < 0 || idx >= steps) continue;

      // Two notes landing on one cell is a real possibility (a flam, or a
      // ratchet the grid cannot draw yet). The louder one wins, so the cell
      // reflects the hit you would actually hear.
      const cell = cells[r][idx];
      if (!cell.on || n.vel > cell.vel) {
        cell.on = true;
        cell.vel = n.vel;
      }
    }
  }

  return { rows: rowList, steps, cells, offGrid };
}

/**
 * Turn the grid back into notes.
 *
 * `gate` is the fraction of a step each note occupies. Short by default: a
 * drum hit's length rarely matters, and a note running into the next step
 * makes a monophonic sampler cut itself off.
 */
export function gridToNotes(
  grid: Grid,
  ppqStart: number,
  ppqEnd: number,
  chan = 0,
  gate = 0.5,
): SeqNote[] {
  const sp = stepPpq(ppqStart, ppqEnd, grid.steps);
  if (sp <= 0) return [];

  const out: SeqNote[] = [];
  for (let r = 0; r < grid.rows.length; r++) {
    for (let c = 0; c < grid.steps; c++) {
      const cell = grid.cells[r]?.[c];
      if (!cell?.on) continue;
      const start = ppqStart + c * sp;
      out.push({
        pitch: grid.rows[r],
        start,
        // At least one tick, so a very short gate never produces a
        // zero-length note the write path would reject outright.
        end: start + Math.max(1, sp * gate),
        vel: Math.min(127, Math.max(1, Math.round(cell.vel))),
        chan,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/** The wire format the extension expects — see `extension/src/seq_notes.h`. */
export function encodeNotes(notes: SeqNote[]): string {
  return notes
    .map((n) => `${n.pitch}:${n.start}:${n.end}:${n.vel}:${n.chan}`)
    .join(',');
}

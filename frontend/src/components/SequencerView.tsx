import { useCallback, useEffect, useRef, useState } from 'react';
import { useSeqPattern, type SeqItem, type SeqPattern } from '../hooks/useSeqPattern';
import { noteName } from './grid/widgets';
import {
  notesToGrid, gridToNotes, emptyCells, rowsFromNotes,
  type Grid, type Step,
} from '../lib/seqPattern';

// ── Touch constants ──────────────────────────────────────────

/** Apple's minimum comfortable target. Cells are never smaller than this. */
const MIN_CELL_PX = 44;

/** How far a finger travels for velocity 1 → 127. */
const VELOCITY_TRAVEL_PX = 160;

/** Movement before the gesture commits to being a paint or a velocity drag. */
const AXIS_LOCK_PX = 8;

type GestureMode = 'undecided' | 'paint' | 'velocity';

interface Props {
  tracks: { index: number; name: string }[];
}

/**
 * A step grid over a MIDI item.
 *
 * The item is the pattern — this draws it and writes it back. Nothing is
 * cached, because a cached pattern is a second answer to the same question
 * and goes stale as soon as someone edits the part in REAPER.
 *
 * Three gestures, no modes:
 *   tap                       toggle a step
 *   drag sideways             paint a run on, or wipe one off
 *   drag up/down on a step    set its velocity, in place
 *
 * The old version had a velocity *mode* plus a popup with a slider and a
 * confirm button — four interactions to change one number. Here the step's
 * fill height is its velocity, so a groove has a shape you can read without
 * reading any numbers.
 */
export function SequencerView({ tracks }: Props) {
  const { listItems, readPattern, writePattern } = useSeqPattern();

  const [trackIdx, setTrackIdx] = useState<number | null>(null);
  const [items, setItems] = useState<SeqItem[]>([]);
  const [itemIdx, setItemIdx] = useState<number | null>(null);
  const [pattern, setPattern] = useState<SeqPattern | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [steps, setSteps] = useState(16);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gridRef = useRef<Grid | null>(null);
  gridRef.current = grid;

  // ── Loading ────────────────────────────────────────────────

  /** Find the first track that actually has a pattern on it. */
  useEffect(() => {
    if (trackIdx !== null || !tracks.length) return;
    let cancelled = false;
    (async () => {
      for (const t of tracks) {
        const found = await listItems(t.index);
        if (cancelled) return;
        if (found.length) {
          setTrackIdx(t.index);
          setItems(found);
          setItemIdx(found[0].itemIdx);
          return;
        }
      }
      setError('No MIDI items in this project. Make one on a track to sequence it.');
    })();
    return () => { cancelled = true; };
  }, [tracks, trackIdx, listItems]);

  const load = useCallback(async (tIdx: number, iIdx: number, stepCount: number) => {
    const p = await readPattern(tIdx, iIdx);
    if (!p) { setError('Could not read that item.'); return; }
    setError(null);
    setPattern(p);
    setGrid(notesToGrid(p.notes, p.ppqStart, p.ppqEnd, stepCount));
  }, [readPattern]);

  useEffect(() => {
    if (trackIdx === null || itemIdx === null) return;
    void load(trackIdx, itemIdx, steps);
  }, [trackIdx, itemIdx, steps, load]);

  // ── Writing ────────────────────────────────────────────────

  /**
   * Push the grid back to the item.
   *
   * Called on gesture end rather than on every cell change: a drag across
   * sixteen steps is one edit, and one entry in the undo history, not sixteen.
   */
  const commit = useCallback(async (next: Grid) => {
    if (!pattern || trackIdx === null || itemIdx === null) return;
    setBusy(true);
    const notes = gridToNotes(next, pattern.ppqStart, pattern.ppqEnd);
    const ok = await writePattern(trackIdx, itemIdx, notes, pattern.ext);
    setBusy(false);
    if (!ok) {
      setError('Write failed — reloading from the item.');
      void load(trackIdx, itemIdx, steps);
    }
  }, [pattern, trackIdx, itemIdx, writePattern, load, steps]);

  const mutate = useCallback((fn: (cells: Step[][]) => void) => {
    setGrid((g) => {
      if (!g) return g;
      const cells = g.cells.map((row) => row.map((c) => ({ ...c })));
      fn(cells);
      const next = { ...g, cells };
      gridRef.current = next;
      return next;
    });
  }, []);

  // ── Gestures ───────────────────────────────────────────────

  const onCellPointerDown = useCallback((e: React.PointerEvent, row: number, col: number) => {
    e.preventDefault();
    const g = gridRef.current;
    if (!g) return;

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startedOn = g.cells[row][col].on;
    const startVel = g.cells[row][col].vel;
    // The cell you touch first decides what a drag does: starting on an empty
    // step paints steps on, starting on a lit one wipes them off.
    const paintValue = !startedOn;

    let mode: GestureMode = 'undecided';
    let moved = false;
    const painted = new Set<number>([col]);

    // The row element, so a finger straying above or below still extends the
    // run instead of jumping rows. Same reason NoteGrid tracks by geometry.
    const rowEl = e.currentTarget.parentElement;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (mode === 'undecided') {
        if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
        moved = true;
        // Vertical only counts as velocity on a step that exists — dragging up
        // from an empty cell has nothing to make louder.
        mode = Math.abs(dy) > Math.abs(dx) && startedOn ? 'velocity' : 'paint';
        if (mode === 'paint') mutate((c) => { c[row][col].on = paintValue; });
      }

      if (mode === 'velocity') {
        const delta = Math.round((-dy / VELOCITY_TRAVEL_PX) * 127);
        const vel = Math.min(127, Math.max(1, startVel + delta));
        mutate((c) => { c[row][col].vel = vel; });
        return;
      }

      if (!rowEl) return;
      const box = rowEl.getBoundingClientRect();
      const c = Math.floor(((ev.clientX - box.left) / box.width) * g.steps);
      if (c < 0 || c >= g.steps || painted.has(c)) return;
      painted.add(c);
      mutate((cells) => { cells[row][c].on = paintValue; });
    };

    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);

      // No movement at all is a tap, which toggles.
      if (!moved) mutate((c) => { c[row][col].on = !startedOn; });

      const next = gridRef.current;
      if (next) void commit(next);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, [mutate, commit]);

  const clearAll = useCallback(() => {
    const g = gridRef.current;
    if (!g) return;
    const next = { ...g, cells: emptyCells(g.rows.length, g.steps) };
    setGrid(next);
    gridRef.current = next;
    void commit(next);
  }, [commit]);

  // ── Render ─────────────────────────────────────────────────

  if (error && !grid) {
    return (
      <div className="flex items-center justify-center h-full px-8 text-center
                      text-sm text-[var(--text-secondary)]">
        {error}
      </div>
    );
  }

  if (!grid || !pattern) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-secondary)]">
        Loading pattern…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <select
          value={itemIdx ?? ''}
          onChange={(e) => setItemIdx(Number(e.target.value))}
          className="px-2 py-1.5 text-sm bg-[var(--bg-tertiary)] rounded
                     text-[var(--text-primary)] border-none"
        >
          {items.map((it) => (
            <option key={it.itemIdx} value={it.itemIdx}>{it.name || `Item ${it.itemIdx + 1}`}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {[8, 16, 32].map((n) => (
            <button
              key={n}
              onClick={() => setSteps(n)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                steps === n
                  ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={clearAll}
          className="ml-auto px-3 py-1.5 text-xs rounded bg-[var(--bg-tertiary)]
                     text-[var(--text-secondary)] active:brightness-90"
        >
          Clear
        </button>
        {busy && <span className="text-xs text-[var(--text-secondary)]">saving…</span>}
      </div>

      {/* A part that was not written on the grid will be straightened by the
          first edit, so say so before that happens rather than after. */}
      {grid.offGrid > 0 && (
        <div className="px-4 py-2 text-xs bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]">
          {grid.offGrid} note{grid.offGrid === 1 ? '' : 's'} in this item {grid.offGrid === 1 ? 'is' : 'are'} off
          the grid. Editing here will pull {grid.offGrid === 1 ? 'it' : 'them'} onto the nearest step.
        </div>
      )}

      {error && grid && (
        <div className="px-4 py-2 text-xs bg-[var(--accent-red)]/10 text-[var(--accent-red)]">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-1 w-max">
          {grid.rows.map((pitch, r) => (
            <div key={pitch} className="flex items-center gap-2">
              <div className="w-14 shrink-0 text-right text-xs tabular-nums
                              text-[var(--text-secondary)] select-none">
                {noteName(pitch)}
              </div>

              <div className="flex gap-1">
                {grid.cells[r].map((cell, c) => (
                  <button
                    key={c}
                    onPointerDown={(e) => onCellPointerDown(e, r, c)}
                    style={{ width: MIN_CELL_PX, height: MIN_CELL_PX }}
                    className={`relative shrink-0 rounded overflow-hidden touch-none
                                transition-colors duration-75
                                ${cell.on
                                  ? 'bg-[var(--accent-green)]/20'
                                  : 'bg-[var(--bg-tertiary)]'}
                                ${c % 4 === 0 ? 'ring-1 ring-inset ring-[var(--border)]' : ''}`}
                    aria-label={`${noteName(pitch)} step ${c + 1}`}
                  >
                    {/* Velocity is the fill height — the pattern's dynamics are
                        legible without a single number on screen. */}
                    {cell.on && (
                      <div
                        className="absolute inset-x-0 bottom-0 bg-[var(--accent-green)]"
                        style={{ height: `${Math.max(12, (cell.vel / 127) * 100)}%` }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-[var(--text-secondary)]/70 max-w-md">
          Tap a step to turn it on. Drag sideways to fill or wipe a run.
          Drag up or down on a step to set how hard it hits.
        </p>
      </div>
    </div>
  );
}

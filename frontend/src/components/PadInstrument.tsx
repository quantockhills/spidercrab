import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCALES,
  SCALE_IDS,
  ROOTS,
  PAD_COUNT,
  CHORD_TYPES,
  padPitch,
  chordNotesFor,
  chordLabel,
  noteName,
} from '../lib/scales';
import { padConfigStore, persistPadConfig } from '../utils/padConfigStore';

export interface PadInstrumentProps {
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  /** Fast-path socket status; notes are dropped when disconnected. */
  connected?: boolean;
  /** Number of pads: 16 (4x4) by default, 32 (8x4 launchpad style). */
  padCount?: number;
}

const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;

const MIN_VELOCITY = 40;
const MAX_VELOCITY = 127;

// Pressing higher up the pad = louder (GarageBand-style velocity from
// touch position, which works with a single quick tap).
function velocityFromEvent(e: React.PointerEvent): number {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const frac = (rect.bottom - e.clientY) / Math.max(1, rect.height);
  return Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, Math.round(MIN_VELOCITY + frac * (MAX_VELOCITY - MIN_VELOCITY))));
}

export function PadInstrument({ noteOn, noteOff, connected = true, padCount = PAD_COUNT }: PadInstrumentProps) {
  const [scaleId, setScaleId] = useState(padConfigStore.scaleId);
  const [root, setRoot] = useState(padConfigStore.root);
  const [octave, setOctave] = useState(padConfigStore.octave);
  // Where the grid window starts, in scale degrees from the root. The
  // octave buttons move it by whole octaves; dragging the octave pill
  // scrolls it by single degrees, so the grid can start anywhere in
  // between octaves without changing the key.
  const [startOffset, setStartOffset] = useState(padConfigStore.startOffset);
  const [chordMode, setChordMode] = useState(padConfigStore.chordMode);
  const [chordTypeId, setChordTypeId] = useState(padConfigStore.chordTypeId);
  const [latch, setLatch] = useState(padConfigStore.latch);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());

  // Persist config so it survives tab switches (which unmount this view)
  // and reloads.
  useEffect(() => {
    Object.assign(padConfigStore, { scaleId, root, octave, startOffset, chordMode, chordTypeId, latch });
    persistPadConfig();
  }, [scaleId, root, octave, startOffset, chordMode, chordTypeId, latch]);

  const heldRef = useRef(new Map<number, number[]>()); // pointerId -> notes
  const latchedRef = useRef(new Set<number>()); // notes sustained by latch
  const scrollRef = useRef<{ lastY: number; acc: number } | null>(null);
  const [latchedCount, setLatchedCount] = useState(0);

  const scale = SCALES[scaleId] ?? SCALES.Major;
  const chordType = CHORD_TYPES.find((c) => c.id === chordTypeId) ?? CHORD_TYPES[0];

  // Keep the visible window inside the MIDI range: pad 0 >= 0 and the
  // top pad <= 127.
  const clampOffset = useCallback((offset: number): number => {
    let next = offset;
    while (padPitch(next, scale, root, octave) < 0) next++;
    while (padPitch(next + padCount - 1, scale, root, octave) > 127) next--;
    return next;
  }, [scale, root, octave, padCount]);

  const shiftOffset = useCallback((delta: number) => {
    setStartOffset((prev) => clampOffset(prev + delta));
  }, [clampOffset]);

  // Re-clamp after a scale/root/octave change moved the window's bounds
  useEffect(() => {
    setStartOffset((prev) => clampOffset(prev));
  }, [scaleId, root, octave, clampOffset]);

  const notesForPad = useCallback(
    (padIndex: number) => (chordMode
      ? chordNotesFor(padIndex + startOffset, chordType, scale, root, octave)
      : [padPitch(padIndex + startOffset, scale, root, octave)]),
    [chordMode, chordType, scale, root, octave, startOffset],
  );

  // Release the notes under active fingers. Latched notes are concrete
  // MIDI pitches and survive settings changes untouched.
  const releaseHeld = useCallback(() => {
    for (const notes of heldRef.current.values()) {
      for (const n of notes) noteOff(n);
    }
    heldRef.current.clear();
    setActivePads(new Set());
  }, [noteOff]);

  // Full panic: fingers + latched (disconnect, hold-off, session end).
  const panicAll = useCallback(() => {
    releaseHeld();
    for (const n of latchedRef.current) noteOff(n);
    latchedRef.current.clear();
    setLatchedCount(0);
  }, [releaseHeld, noteOff]);

  // Connection loss mid-hold would leave notes stuck on the REAPER side.
  useEffect(() => {
    if (!connected) panicAll();
  }, [connected, panicAll]);

  // A scale/root/octave/scroll change reinterprets the pads — notes under
  // fingers are released so the next press plays the new pitch. Notes the
  // latch is already sustaining keep playing: changing octave must not
  // silence what Hold is holding.
  useEffect(() => {
    releaseHeld();
  }, [scaleId, root, octave, startOffset, chordMode, chordTypeId, releaseHeld]);

  const pressPad = (e: React.PointerEvent, padIndex: number) => {
    if (!connected) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const notes = notesForPad(padIndex);
    const vel = velocityFromEvent(e);
    for (const n of notes) noteOn(n, vel);
    heldRef.current.set(e.pointerId, notes);
    setActivePads((prev) => new Set(prev).add(padIndex));
  };

  // Glissando: slide across pads while holding — release the old pitch,
  // play the new one.
  const movePad = (e: React.PointerEvent, padIndex: number) => {
    if (!heldRef.current.has(e.pointerId)) return;
    const el = document.elementFromPoint?.(e.clientX, e.clientY);
    const padEl = (el?.closest?.('[data-pad]') as HTMLElement | null) ?? null;
    const next = padEl ? Number(padEl.dataset.pad) : padIndex;
    if (next === padIndex) return;

    const vel = velocityFromEvent(e);
    const notes = notesForPad(next);
    for (const n of heldRef.current.get(e.pointerId) ?? []) noteOff(n);
    for (const n of notes) noteOn(n, vel);
    heldRef.current.set(e.pointerId, notes);
    setActivePads((prev) => {
      const copy = new Set(prev);
      copy.delete(padIndex);
      copy.add(next);
      return copy;
    });
  };

  const releasePad = (e: React.PointerEvent, padIndex: number) => {
    const notes = heldRef.current.get(e.pointerId);
    if (!notes) return;
    if (latch) {
      for (const n of notes) {
        if (!latchedRef.current.has(n)) {
          latchedRef.current.add(n);
          setLatchedCount(latchedRef.current.size);
        }
      }
    } else {
      for (const n of notes) noteOff(n);
    }
    heldRef.current.delete(e.pointerId);
    setActivePads((prev) => {
      const copy = new Set(prev);
      copy.delete(padIndex);
      return copy;
    });
  };

  const toggleLatch = () => {
    if (latch) {
      // Turning hold off releases everything the latch was sustaining.
      panicAll();
    }
    setLatch(!latch);
  };

  // DOM order: top row first (highest pitch), bottom row last.
  const cols = padCount === 32 ? 8 : 4;
  const rows = padCount / cols;
  const displayOrder = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (rows - 1 - r) * cols + c),
  ).flat();

  const selectCls =
    'bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs min-h-[44px] px-2 border border-[var(--border)] flex-1 min-w-0';
  const toggleCls = (on: boolean) =>
    `min-h-[44px] px-3 text-xs font-medium border border-[var(--border)] transition-colors ${
      on ? 'bg-[var(--accent-orange)]/25 text-[var(--accent-orange)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
    }`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex items-stretch gap-1 p-1.5 border-b border-[var(--border)] shrink-0">
        <select
          aria-label="Scale"
          className={selectCls}
          value={scaleId}
          onChange={(e) => setScaleId(e.target.value)}
        >
          {SCALE_IDS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Root note"
          className={selectCls}
          value={root}
          onChange={(e) => setRoot(Number(e.target.value))}
        >
          {ROOTS.map((n, i) => (
            <option key={n} value={i}>{n}</option>
          ))}
        </select>
        <div className="flex items-stretch">
          <button
            aria-label="Octave down"
            className={`${toggleCls(false)} border-r-0`}
            onClick={() => setOctave((o) => Math.max(MIN_OCTAVE, o - 1))}
          >
            −
          </button>
          {/* Scrollable window indicator: drag vertically to pan the grid by
              single scale degrees (anything in between octaves); the start
              note stays in the selected key. */}
          <div
            aria-label="Scroll pitch"
            title="Drag up/down to scroll the pitch range by scale steps"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              scrollRef.current = { lastY: e.clientY, acc: 0 };
            }}
            onPointerMove={(e) => {
              if (!scrollRef.current) return;
              const dy = scrollRef.current.lastY - e.clientY;
              scrollRef.current.lastY = e.clientY;
              scrollRef.current.acc += dy;
              const step = 36; // px per scale degree
              while (scrollRef.current.acc >= step) {
                scrollRef.current.acc -= step;
                shiftOffset(1);
              }
              while (scrollRef.current.acc <= -step) {
                scrollRef.current.acc += step;
                shiftOffset(-1);
              }
            }}
            onPointerUp={() => { scrollRef.current = null; }}
            onPointerCancel={() => { scrollRef.current = null; }}
            className="touch-none select-none cursor-ns-resize flex items-center justify-center px-2 min-h-[44px] text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border)] border-r-0"
          >
            {noteName(padPitch(startOffset, scale, root, octave))}
          </div>
          <button
            aria-label="Octave up"
            className={toggleCls(false)}
            onClick={() => setOctave((o) => Math.min(MAX_OCTAVE, o + 1))}
          >
            +
          </button>
        </div>
        <button aria-label="Chord mode" className={toggleCls(chordMode)} onClick={() => setChordMode(!chordMode)}>
          Chord
        </button>
        <select
          aria-label="Chord type"
          className={selectCls}
          value={chordTypeId}
          disabled={!chordMode}
          onChange={(e) => setChordTypeId(e.target.value)}
        >
          {CHORD_TYPES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <button aria-label="Hold" className={toggleCls(latch)} onClick={toggleLatch}>
          Hold{latchedCount > 0 ? ` (${latchedCount})` : ''}
        </button>
      </div>

      {/* Pad grid — ascending left-to-right and bottom-to-top */}
      <div
        className="grid gap-1.5 flex-1 min-h-0 p-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {displayOrder.map((padIndex) => {
          const active = activePads.has(padIndex);
          const pitch = notesForPad(padIndex)[0];
          const label = chordMode
            ? chordLabel(padIndex + startOffset, chordType, scale, root, octave)
            : noteName(pitch);
          return (
            <button
              key={padIndex}
              data-pad={padIndex}
              aria-label={`Pad ${label}`}
              onPointerDown={(e) => pressPad(e, padIndex)}
              onPointerMove={(e) => movePad(e, padIndex)}
              onPointerUp={(e) => releasePad(e, padIndex)}
              onPointerCancel={(e) => releasePad(e, padIndex)}
              className={`touch-none select-none border text-[10px] font-medium flex items-center justify-center min-h-[44px] transition-colors ${
                active
                  ? 'bg-[var(--accent-orange)]/40 text-[var(--accent-orange)] border-[var(--accent-orange)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FxParam } from '../../hooks/useReaper';
import { useLiveSlider } from '../../hooks/useLiveSlider';
import { MODIFIER_KINDS, resolveParam, type ModifierKind, type NoteGridControl } from './modules';
import type {
  KnobControl, FaderControl, SegmentedControl, ToggleControl, StepGridControl,
} from './modules';

// Pixels of vertical travel to move a control across its whole range.
const DRAG_TRAVEL_PX = 190;

/**
 * Vertical drag gesture, shared by every continuous Grid control.
 *
 * Controls carry `touch-action: none` and take the gesture outright. That's
 * possible because the device surface doesn't pan — navigation lives in the
 * strip along the bottom — so there's no sideways swipe to share the screen
 * with. The FX tab's sliders need `pan-y` precisely because they sit in a
 * scrolling list; here there's nothing to defer to.
 *
 * Listens on window because a finger routinely leaves a small control while
 * dragging, and tears down on pointercancel and unmount as well as pointerup —
 * skipping either is what let an abandoned drag follow later gestures (#138).
 */
function useVerticalDrag(
  onStart: () => void,
  onDrag: (totalFraction: number) => void,
  onEnd: () => void,
) {
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { detachRef.current?.(); }, []);

  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      detachRef.current?.();

      const pointerId = e.pointerId;
      const startY = e.clientY;
      // Fine-drag shifts the origin so the value doesn't jump when the
      // modifier is pressed or released mid-gesture.
      let originY = startY;
      let originFraction = 0;
      let fineActive = false;
      let detach = () => {};

      onStart();

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        if (ev.shiftKey !== fineActive) {
          originFraction += ((originY - ev.clientY) * (fineActive ? 0.25 : 1)) / DRAG_TRAVEL_PX;
          originY = ev.clientY;
          fineActive = ev.shiftKey;
        }

        // Total travel since the gesture began, not since the last event —
        // reporting per-event deltas meant the caller kept re-deriving from
        // its start value and the control never accumulated past one step.
        const scale = fineActive ? 0.25 : 1;
        onDrag(originFraction + ((originY - ev.clientY) * scale) / DRAG_TRAVEL_PX);
      };

      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        detach();
        onEnd();
      };

      detach = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        detachRef.current = null;
      };
      detachRef.current = detach;

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [onStart, onDrag, onEnd],
  );
}

/**
 * Shared drag wiring for the continuous controls. Captures the value the
 * gesture started from, then maps total travel onto the parameter's range.
 */
function useRangeDrag(
  value: number,
  min: number,
  max: number,
  change: (v: number) => void,
  release: () => void,
) {
  const span = max - min || 1;
  const startValue = useRef(value);

  const onStart = useCallback(() => { startValue.current = value; }, [value]);
  const onDrag = useCallback(
    (total: number) => change(clamp(startValue.current + total * span, min, max)),
    [change, span, min, max],
  );
  return useVerticalDrag(onStart, onDrag, release);
}

interface Common {
  param: FxParam;
  onChange: (value: number) => void;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}


// ── Labels that explain themselves ───────────────────────────

/** How long a press has to last before it counts as asking for help. */
const HOLD_MS = 450;
/** Movement past this is a scroll or a drag, not a hold. */
const HOLD_SLOP_PX = 8;

/**
 * A control's label, which reveals what the control is for when held.
 *
 * On the label rather than the control body: knobs already own press-and-drag,
 * and a long press there would either fight the gesture or delay it. The label
 * has no gesture of its own, so holding it is unambiguous.
 *
 * The popover is absolutely positioned rather than fixed because the device
 * strip is CSS-transformed to fit the screen, and a fixed element inside a
 * transformed ancestor positions against that ancestor anyway — so fixed would
 * buy nothing and scale differently from everything around it.
 */
export function HelpLabel({
  text, help, className = '',
}: { text: string; help?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => cancel, [cancel]);

  if (!help) return <div className={className}>{text}</div>;

  const start = (e: React.PointerEvent) => {
    origin.current = { x: e.clientX, y: e.clientY };
    cancel();
    timer.current = window.setTimeout(() => setOpen(true), HOLD_MS);
  };
  const move = (e: React.PointerEvent) => {
    const d = Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y);
    if (d > HOLD_SLOP_PX) cancel();
  };

  return (
    <div className="relative">
      <div
        className={`${className} cursor-help underline decoration-dotted decoration-[var(--text-secondary)]/40 underline-offset-2`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        aria-describedby={open ? `help-${text}` : undefined}
      >
        {text}
      </div>
      {open && (
        <>
          {/* Anywhere else dismisses it; there is no room for a close button
              at this size and nothing else to do with the next tap. */}
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div
            id={`help-${text}`}
            role="tooltip"
            className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-56 p-2.5 bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] shadow-xl text-left normal-case tracking-normal"
          >
            <div className="text-[10px] font-semibold text-[var(--text-primary)] mb-1">{text}</div>
            <div className="text-[10px] leading-relaxed text-[var(--text-secondary)]">{help}</div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Knob ─────────────────────────────────────────────────────

// The colour each modulation mode draws its depth ring in, matching the
// plugin's own mod1/mod2/mod3 palette.
const MOD_COLOR: Record<ModifierKind, string> = {
  vel: 'var(--accent-blue, #4a9eff)',
  mod: 'var(--accent-green, #25ec75)',
  lfo: 'var(--accent-purple, #b57edc)',
};

export function Knob({
  param, control, onChange, mode = null, depths = {}, onDepthChange,
}: Common & {
  control: KnobControl;
  /** Which modulation mode is latched, if any. */
  mode?: ModifierKind | null;
  /** Current depth per mode, as a fraction of the parameter's range. */
  depths?: Partial<Record<ModifierKind, { value: number; min: number; max: number }>>;
  onDepthChange?: (kind: ModifierKind, value: number) => void;
}) {
  // In a mode, this knob edits that mode's depth instead of its own value —
  // exactly as the plugin does, and for the same reason: it keeps one gesture
  // instead of needing a second way to reach 70 more parameters. Knobs with no
  // depth for the active mode go inert rather than silently editing the value.
  const depth = mode ? depths[mode] : undefined;
  const editing = mode !== null;
  const inert = editing && !depth;

  const target = depth ?? { value: param.value, min: param.min, max: param.max };
  const commit = useCallback((v: number) => {
    if (mode && onDepthChange) onDepthChange(mode, v);
    else onChange(v);
  }, [mode, onDepthChange, onChange]);

  const { value, change, release } = useLiveSlider(target.value, commit);
  const span = param.max - param.min || 1;
  // The ring always shows the parameter's own value, even while a depth is
  // being dragged — otherwise the knob appears to jump when a mode is entered.
  const shown = editing ? param.value : value;
  const norm = clamp((shown - param.min) / span, 0, 1);
  const drag = useRangeDrag(value, target.min, target.max, change, release);
  const onPointerDown = inert ? undefined : drag;

  // 270° sweep, gap at the bottom
  const SWEEP = 270, START = 135;
  const angle = START + norm * SWEEP;
  const r = 26;
  const polar = (deg: number, radius = r) => {
    const rad = (deg * Math.PI) / 180;
    return [32 + radius * Math.cos(rad), 32 + radius * Math.sin(rad)];
  };
  const arcAt = (from: number, to: number, radius: number) => {
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const arc = (from: number, to: number) => arcAt(from, to, r);
  const [px, py] = polar(angle);

  // Depth rings, nested inward one per mode, drawn from the knob's own
  // position outward by the depth. The plugin does the same with
  // `r_base = r - 4*modifier`, and it means you can read what's modulated
  // without entering a mode to look.
  const rings = MODIFIER_KINDS.map((kind, i) => {
    const d = depths[kind];
    if (!d) return null;
    const dspan = Math.max(Math.abs(d.min), Math.abs(d.max)) || 1;
    const frac = clamp(d.value / dspan, -1, 1);
    // Live while this mode is being dragged, so the ring tracks the finger.
    const live = mode === kind ? clamp(value / dspan, -1, 1) : frac;
    if (Math.abs(live) < 0.002) return null;
    const to = clamp(norm + live, 0, 1);
    const [a, b] = live > 0 ? [norm, to] : [to, norm];
    return (
      <path
        key={kind}
        d={arcAt(START + a * SWEEP, START + b * SWEEP, r - 5 - i * 4)}
        fill="none" strokeWidth="2.5" strokeLinecap="round"
        stroke={MOD_COLOR[kind]}
        opacity={mode === null || mode === kind ? 0.95 : 0.35}
      />
    );
  });

  return (
    <div className={`flex flex-col items-center gap-1 select-none transition-opacity ${
      inert ? 'opacity-30' : ''
    }`}>
      <div
        onPointerDown={onPointerDown}
        className={inert ? 'touch-none' : 'touch-none cursor-ns-resize'}
        role="slider"
        aria-label={depth ? `${control.label} ${mode} depth` : control.label}
        aria-valuemin={target.min}
        aria-valuemax={target.max}
        aria-valuenow={value}
        aria-disabled={inert || undefined}
      >
        <svg width="64" height="64" viewBox="0 0 64 64">
          {/* A knob that has a depth for the latched mode is what the plugin
              calls "lit up" — the cue that this control is modulatable. */}
          {depth && (
            <circle cx="32" cy="32" r={r * 0.82} fill={MOD_COLOR[mode!]} opacity="0.12" />
          )}
          <path d={arc(START, START + SWEEP)} fill="none" strokeWidth="5"
            className="stroke-[var(--bg-tertiary)]" strokeLinecap="round" />
          {norm > 0.001 && (
            <path d={arc(START, angle)} fill="none" strokeWidth="5"
              className="stroke-[var(--accent-orange)]" strokeLinecap="round" />
          )}
          {rings}
          <line x1="32" y1="32" x2={px} y2={py} strokeWidth="3"
            className="stroke-[var(--text-primary)]" strokeLinecap="round" />
        </svg>
      </div>
      <HelpLabel text={control.label} help={control.help}
        className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]" />
      <div className="text-[11px] tabular-nums" style={{
        color: depth ? MOD_COLOR[mode!] : 'var(--text-primary)',
      }}>
        {depth
          ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
          : (control.format ? control.format(value) : (param.formatted ?? value.toFixed(2)))}
      </div>
    </div>
  );
}

// ── Vertical fader ───────────────────────────────────────────

export function Fader({ param, control, onChange }: Common & { control: FaderControl }) {
  const { value, change, release } = useLiveSlider(param.value, onChange);
  const span = param.max - param.min || 1;
  const norm = clamp((value - param.min) / span, 0, 1);
  const onPointerDown = useRangeDrag(value, param.min, param.max, change, release);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        onPointerDown={onPointerDown}
        className="relative w-8 h-28 bg-[var(--bg-tertiary)] overflow-hidden touch-none cursor-ns-resize"
        role="slider"
        aria-label={control.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-[var(--accent-orange)]/50"
          style={{ height: `${norm * 100}%` }}
        />
        <div
          className="absolute inset-x-0 h-0.5 bg-[var(--accent-orange)]"
          style={{ bottom: `calc(${norm * 100}% - 1px)` }}
        />
      </div>
      <HelpLabel text={control.label} help={control.help}
        className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]" />
      <div className="text-[11px] tabular-nums text-[var(--text-primary)]">
        {control.format ? control.format(value) : (param.formatted ?? value.toFixed(1))}
      </div>
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────

export function Toggle({ param, control, onChange }: Common & { control: ToggleControl }) {
  // A JSFX <0,1,1> parameter. Discrete, so no drag and no send gating.
  const on = param.value >= 0.5;
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <button
        onClick={() => onChange(on ? param.min : param.max)}
        role="switch"
        aria-checked={on}
        aria-label={control.label}
        className={`w-11 h-11 transition-colors active:brightness-95 ${
          on
            ? 'bg-[var(--accent-orange)]/25 ring-1 ring-[var(--accent-orange)]/60'
            : 'bg-[var(--bg-tertiary)] ring-1 ring-[var(--border)]'
        }`}
      >
        <span className={`block w-3 h-3 mx-auto ${
          on ? 'bg-[var(--accent-orange)]' : 'bg-[var(--text-secondary)]/40'
        }`} />
      </button>
      {/* Wraps to a second line rather than truncating: "Mix sub in before
          filter" cut to "MIX SUB I…" says nothing at all. */}
      <HelpLabel text={control.label} help={control.help}
        className="text-[10px] leading-tight uppercase tracking-wider text-[var(--text-secondary)] text-center w-20 line-clamp-2" />
    </div>
  );
}

// ── Segmented ────────────────────────────────────────────────

export function Segmented({
  param, control, onChange, columns, hideLabel = false,
}: Common & { control: SegmentedControl; columns?: number; hideLabel?: boolean }) {
  // Discrete: no drag, no gating needed — one tap, one command.
  const current = Math.round(param.value);
  // Short lists sit on one row. Longer ones wrap to however many columns keep
  // them within eight rows, which is what stops Yutani's 29 filter types from
  // running 15 rows deep and pushing the whole device off-screen. It also lands
  // on the plugin's own arrangement: 10 shapes as 2x5, 29 filters as 4x8.
  const cols = columns
    ?? (control.options.length <= 6 ? control.options.length : Math.ceil(control.options.length / 8));
  return (
    <div className="flex flex-col gap-1.5 select-none" role="group" aria-label={control.label}>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {control.options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === current}
            className={`min-w-11 min-h-11 px-1 text-[11px] leading-tight font-medium transition-colors active:brightness-95 ${
              o.value === current
                ? 'bg-[var(--accent-orange)]/25 text-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]/50'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* The panel header already carries this when they match — don't say it twice. */}
      {!hideLabel && (
        <HelpLabel text={control.label} help={control.help}
          className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] text-center" />
      )}
    </div>
  );
}

// ── Step Grid ────────────────────────────────────────────────
//
// Reads step values from 8 packed sliders (4 steps per slider) and draws
// a row of touchable cells. The height of each cell represents the step
// value. Tap to cycle, drag across to paint.
//
// Decoding: each slider packs 4 steps via base-(maxValue+1) encoding.
//   total = step0 + step1 * R + step2 * R^2 + step3 * R^3
//   sliderValue = total / maxTotal, where maxTotal = R^4 - 1, R = maxValue+1
function decodeSteps(sliderValue: number, maxValue: number): number[] {
  const R = maxValue + 1;
  const maxTotal = Math.pow(R, 4) - 1;
  let total = Math.round(sliderValue * maxTotal);
  const steps: number[] = [];
  for (let i = 0; i < 4; i++) {
    steps.push(total % R);
    total = Math.floor(total / R);
  }
  return steps;
}

function encodeSteps(steps: number[], maxValue: number): number {
  const R = maxValue + 1;
  const maxTotal = Math.pow(R, 4) - 1;
  let total = 0;
  for (let i = 3; i >= 0; i--) {
    total = total * R + Math.round(clamp(steps[i], 0, maxValue));
  }
  return maxTotal > 0 ? clamp(total / maxTotal, 0, 1) : 0;
}

/**
 * Unpack all step values from the 8 step sliders into a flat array.
 */
export function readStepGrid(
  params: FxParam[],
  stepSliders: [number, number, number, number, number, number, number, number],
  maxValue: number,
  count: number,
): number[] {
  const out: number[] = [];
  for (let si = 0; si < 8 && out.length < count; si++) {
    const p = params.find((pp) => pp.index === stepSliders[si] - 1);
    const decoded = decodeSteps(p?.value ?? 0, maxValue);
    for (let i = 0; i < 4 && out.length < count; i++) out.push(decoded[i]);
  }
  return out;
}

/**
 * Edit one step in a packed step grid. Returns the new slider value for the
 * slider that contains the edited step.
 */
export function editStep(
  params: FxParam[],
  stepSliders: [number, number, number, number, number, number, number, number],
  maxValue: number,
  stepIndex: number,
  newValue: number,
): { slider: number; value: number } | null {
  const si = Math.floor(stepIndex / 4);
  if (si >= 8) return null;
  const sliderIdx = stepSliders[si] - 1;
  const pi = stepIndex % 4;
  const p = params.find((pp) => pp.index === sliderIdx);
  if (!p) return null;
  const steps = decodeSteps(p.value, maxValue);
  steps[pi] = clamp(Math.round(newValue), 0, maxValue);
  return { slider: sliderIdx, value: encodeSteps(steps, maxValue) };
}

interface StepGridProps {
  stepValues: number[];
  maxValue: number;
  onChange: (stepIndex: number, value: number) => void;
  label: string;
  enabled: boolean;
  cellWidth?: number;
  cellHeight?: number;
}

export function StepGrid({
  stepValues, maxValue, onChange, label, enabled,
  cellWidth = 22, cellHeight = 36,
}: StepGridProps) {
  const dragRef = useRef<{ index: number; value: number } | null>(null);

  const handlePointerDown = useCallback((index: number) => {
    const current = stepValues[index] ?? 0;
    // Cycle: 0→1→2→...→maxValue→0
    const next = current >= maxValue ? 0 : current + 1;
    dragRef.current = { index, value: next };
    onChange(index, next);
  }, [stepValues, maxValue, onChange]);

  const handlePointerEnter = useCallback((index: number) => {
    if (dragRef.current) {
      onChange(index, dragRef.current.value);
    }
  }, [onChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const isToggle = maxValue === 1;

  return (
    <div className={`flex flex-col gap-0.5 select-none ${enabled ? '' : 'opacity-40'}`}>
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </div>
      <div
        className="flex gap-[1px]"
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {stepValues.map((v, i) => {
          const on = v > 0;
          // Block height proportional to value / maxValue
          const pct = maxValue > 0 ? (v / maxValue) * 100 : 0;
          return (
            <button
              key={i}
              onPointerDown={() => handlePointerDown(i)}
              onPointerEnter={() => handlePointerEnter(i)}
              className="relative flex-shrink-0 touch-none"
              style={{ width: cellWidth, height: cellHeight }}
              aria-label={`${label} step ${i + 1}`}
            >
              {/* Background */}
              <div className={`absolute inset-0 ${on ? 'bg-[var(--accent-orange)]/20' : 'bg-[var(--bg-tertiary)]'}`} />
              {/* Filled block — height = value / maxValue */}
              {on && (
                <div
                  className="absolute bottom-0 inset-x-0 bg-[var(--accent-orange)]/70"
                  style={{ height: `${pct}%` }}
                />
              )}
              {/* Value label */}
              <div className="absolute inset-0 flex items-center justify-center text-[9px] font-medium"
                style={{ color: on ? 'var(--accent-orange)' : 'var(--text-secondary)/40' }}>
                {isToggle ? (on ? '•' : '') : v}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Note grid ────────────────────────────────────────────────

/**
 * The arp's pattern grid: rows of steps, each cell a parameter.
 *
 * The plugin's encoding is carried through rather than flattened. A cell is 0
 * when empty, positive when a note starts there, and negative when it holds
 * the note before it. So a run of cells is one long note, not several repeats,
 * and that is what the drag gesture writes — exactly as dragging across the
 * plugin's own grid does.
 *
 * Tapping a filled cell clears the whole note it belongs to, not just the cell,
 * since clearing a note's head and leaving its tail behind would leave the
 * pattern in a state the plugin's own editor cannot produce.
 */
export function NoteGrid({
  control, params, onChange,
}: {
  control: NoteGridControl;
  params: FxParam[];
  onChange: (paramIdx: number, value: number) => void;
}) {
  const { rows, cols, firstSlider } = control;
  const byIndex = useMemo(() => {
    const m = new Map<number, FxParam>();
    for (const p of params) m.set(p.index, p);
    return m;
  }, [params]);

  // Cells are contiguous from firstSlider, so index arithmetic beats a search
  // per cell — this runs 160 times per render.
  const cellParam = useCallback(
    (r: number, c: number) => byIndex.get(firstSlider - 1 + r * cols + c),
    [byIndex, firstSlider, cols],
  );
  const valueAt = useCallback(
    (r: number, c: number) => cellParam(r, c)?.value ?? 0,
    [cellParam],
  );

  const rowOffset = Math.round(
    resolveParam(params, { slider: control.rowOffsetSlider })?.value ?? 0);

  // Live preview of the run being dragged, so the cells fill under the finger
  // rather than only on release.
  const [drag, setDrag] = useState<{ row: number; from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const write = useCallback((r: number, c: number, v: number) => {
    const p = cellParam(r, c);
    if (p && p.value !== v) onChange(p.index, v);
  }, [cellParam, onChange]);

  /** Clear the note this cell belongs to: its head, and every cell holding it. */
  const clearNote = useCallback((r: number, c: number) => {
    let head = c;
    while (head > 0 && valueAt(r, head) < 0) head -= 1;
    write(r, head, 0);
    for (let i = head + 1; i < cols && valueAt(r, i) < 0; i++) write(r, i, 0);
  }, [valueAt, write, cols]);

  const commit = useCallback((row: number, from: number, to: number) => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    // A tap on a filled cell erases; anything else draws.
    if (lo === hi && valueAt(row, lo) !== 0) {
      clearNote(row, lo);
      return;
    }
    write(row, lo, 1);
    for (let c = lo + 1; c <= hi; c++) write(row, c, -1);
  }, [valueAt, clearNote, write]);

  const onPointerDown = useCallback((e: React.PointerEvent, row: number, col: number) => {
    e.preventDefault();
    const pointerId = e.pointerId;
    const grid = e.currentTarget.parentElement;
    setDrag({ row, from: col, to: col });

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !grid) return;
      // Track by geometry rather than hit-testing: a finger that strays above
      // or below the row should still extend the run, not jump rows.
      const box = grid.getBoundingClientRect();
      const c = clamp(Math.floor(((ev.clientX - box.left) / box.width) * cols), 0, cols - 1);
      setDrag((d) => (d && d.to !== c ? { ...d, to: c } : d));
    };
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const d = dragRef.current;
      if (d) commit(d.row, d.from, d.to);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, [cols, commit]);

  const rowLabel = (r: number) => {
    const abs = rowOffset + r;
    return control.rowNames?.[abs] ?? `${abs}`;
  };

  return (
    <div className="flex flex-col gap-1 select-none" data-testid="note-grid">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-1">
          <div className="w-8 text-[9px] uppercase tracking-wider text-[var(--text-secondary)] text-right">
            {rowLabel(r)}
          </div>
          <div className="flex gap-px flex-1 touch-none">
            {Array.from({ length: cols }, (_, c) => {
              const v = valueAt(r, c);
              const inDrag = drag && drag.row === r
                && c >= Math.min(drag.from, drag.to) && c <= Math.max(drag.from, drag.to);
              const on = inDrag || v !== 0;
              // A held cell joins the one before it, so the run reads as a bar.
              const held = inDrag ? c !== Math.min(drag.from, drag.to) : v < 0;
              return (
                <button
                  key={c}
                  onPointerDown={(e) => onPointerDown(e, r, c)}
                  aria-label={`Row ${rowOffset + r} step ${c + 1}`}
                  aria-pressed={v !== 0}
                  className={`h-6 flex-1 min-w-2 transition-colors ${
                    on ? 'bg-[var(--accent-orange)]' : 'bg-[var(--bg-tertiary)]'
                  } ${held ? '' : 'ml-px'} ${c % 4 === 0 && !held ? 'ring-1 ring-inset ring-[var(--border)]' : ''}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

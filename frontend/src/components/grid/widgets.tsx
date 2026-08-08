import { useCallback, useEffect, useRef } from 'react';
import type { FxParam } from '../../hooks/useReaper';
import { useLiveSlider } from '../../hooks/useLiveSlider';
import { MODIFIER_KINDS, type ModifierKind } from './modules';
import type {
  KnobControl, FaderControl, SegmentedControl, ToggleControl,
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        {control.label}
      </div>
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        {control.label}
      </div>
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] text-center max-w-16 truncate">
        {control.label}
      </div>
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
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] text-center">
          {control.label}
        </div>
      )}
    </div>
  );
}

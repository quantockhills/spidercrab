import { useCallback, useEffect, useRef } from 'react';
import type { FxParam } from '../../hooks/useReaper';
import { useLiveSlider } from '../../hooks/useLiveSlider';
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

export function Knob({ param, control, onChange }: Common & { control: KnobControl }) {
  const { value, change, release } = useLiveSlider(param.value, onChange);
  const span = param.max - param.min || 1;
  const norm = clamp((value - param.min) / span, 0, 1);
  const onPointerDown = useRangeDrag(value, param.min, param.max, change, release);

  // 270° sweep, gap at the bottom
  const SWEEP = 270, START = 135;
  const angle = START + norm * SWEEP;
  const r = 26;
  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [32 + r * Math.cos(rad), 32 + r * Math.sin(rad)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const [px, py] = polar(angle);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        onPointerDown={onPointerDown}
        className="touch-none cursor-ns-resize"
        role="slider"
        aria-label={control.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
      >
        <svg width="64" height="64" viewBox="0 0 64 64">
          <path d={arc(START, START + SWEEP)} fill="none" strokeWidth="5"
            className="stroke-[var(--bg-tertiary)]" strokeLinecap="round" />
          {norm > 0.001 && (
            <path d={arc(START, angle)} fill="none" strokeWidth="5"
              className="stroke-[var(--accent-orange)]" strokeLinecap="round" />
          )}
          <line x1="32" y1="32" x2={px} y2={py} strokeWidth="3"
            className="stroke-[var(--text-primary)]" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
        {control.label}
      </div>
      <div className="text-[11px] tabular-nums text-[var(--text-primary)]">
        {control.format ? control.format(value) : (param.formatted ?? value.toFixed(2))}
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
  param, control, onChange, columns = 4, hideLabel = false,
}: Common & { control: SegmentedControl; columns?: number; hideLabel?: boolean }) {
  // Discrete: no drag, no gating needed — one tap, one command.
  const current = Math.round(param.value);
  return (
    <div className="flex flex-col gap-1.5 select-none" role="group" aria-label={control.label}>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {control.options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === current}
            className={`min-w-11 min-h-11 text-xs font-medium transition-colors active:brightness-95 ${
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

import { useCallback, useEffect, useRef, useState } from 'react';

export interface StripDevice {
  key: string | number;
  label: string;
}

interface GridStripProps {
  /** The horizontally-scrolling element the strip drives. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  devices: StripDevice[];
}

/**
 * Navigator for the device strip.
 *
 * The grid surface itself doesn't pan. Scrolling lives here instead, which
 * means the controls above can own their gestures completely — a knob drag is
 * just a knob drag, with no sideways swipe to disambiguate against. That was
 * the alternative design (touch-action juggling on every control) and this
 * avoids the whole class of problem.
 *
 * Drag anywhere along it to move; tap a device to bring it into view.
 */
export function GridStrip({ scrollRef, devices }: GridStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 1, clientWidth: 1 });
  const [offsets, setOffsets] = useState<{ left: number; width: number }[]>([]);

  // Track the scroller's geometry. Measured rather than derived, since device
  // widths depend on their contents.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const read = () => {
      setMetrics({
        scrollLeft: el.scrollLeft,
        scrollWidth: Math.max(el.scrollWidth, 1),
        clientWidth: Math.max(el.clientWidth, 1),
      });
      const row = el.firstElementChild;
      if (row) {
        setOffsets(
          Array.from(row.children).map((c) => {
            const n = c as HTMLElement;
            return { left: n.offsetLeft, width: n.offsetWidth };
          }),
        );
      }
    };

    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [scrollRef, devices.length]);

  const scrollable = metrics.scrollWidth > metrics.clientWidth + 1;

  // Map a position on the strip to a scroll offset, centring the viewport there.
  const seek = useCallback(
    (clientX: number) => {
      const strip = stripRef.current;
      const el = scrollRef.current;
      if (!strip || !el) return;
      const rect = strip.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const max = el.scrollWidth - el.clientWidth;
      el.scrollLeft = Math.max(0, Math.min(max, f * el.scrollWidth - el.clientWidth / 2));
    },
    [scrollRef],
  );

  // Same pointer discipline as the controls: one pointer, torn down on cancel
  // and unmount as well as up (#138).
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { detachRef.current?.(); }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!scrollable) return;
      e.preventDefault();
      detachRef.current?.();
      const pointerId = e.pointerId;
      seek(e.clientX);

      let detach = () => {};
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        seek(ev.clientX);
      };
      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        detach();
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
    [scrollable, seek],
  );

  const jumpTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      const o = offsets[i];
      if (!el || !o) return;
      const max = el.scrollWidth - el.clientWidth;
      el.scrollTo({
        left: Math.max(0, Math.min(max, o.left - (el.clientWidth - o.width) / 2)),
        behavior: 'smooth',
      });
    },
    [scrollRef, offsets],
  );

  const viewLeft = (metrics.scrollLeft / metrics.scrollWidth) * 100;
  const viewWidth = Math.min(100, (metrics.clientWidth / metrics.scrollWidth) * 100);

  return (
    <div
      className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2"
      data-testid="grid-strip"
    >
      <div
        ref={stripRef}
        onPointerDown={onPointerDown}
        className={`relative h-10 select-none touch-none ${scrollable ? 'cursor-ew-resize' : ''}`}
      >
        {/* Device chips, proportional to their real widths */}
        <div className="absolute inset-0 flex gap-1">
          {devices.map((d, i) => (
            <button
              key={d.key}
              onClick={() => jumpTo(i)}
              style={{
                flexGrow: offsets[i]?.width || 1,
                flexBasis: 0,
              }}
              className="min-w-0 h-full bg-[var(--bg-tertiary)] text-[10px] uppercase
                tracking-wider text-[var(--text-secondary)] truncate px-2
                active:brightness-95 transition-colors"
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Where you are */}
        {scrollable && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none
              bg-[var(--accent-orange)]/20 ring-2 ring-[var(--accent-orange)]/70"
            style={{ left: `${viewLeft}%`, width: `${viewWidth}%` }}
            data-testid="grid-strip-viewport"
          />
        )}
      </div>
    </div>
  );
}

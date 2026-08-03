import { useCallback, useEffect, useRef, useState } from 'react';

// If a release event never arrives (lost pointerup, gesture stolen by the
// browser), hand control back to the server value after this much quiet.
const IDLE_RELEASE_MS = 1500;

export interface LiveSlider {
  /** Value to display: the finger's position while interacting, REAPER's otherwise. */
  value: number;
  /** Call on every change from the control. */
  change: (next: number) => void;
  /** Call when the gesture ends (pointerup, pointercancel, keyup, blur). */
  release: () => void;
}

/**
 * Keeps a slider responsive when its value is owned by REAPER (Issue #137).
 *
 * A control bound straight to server state re-renders back to the old value
 * after every change and only moves forward once the reply lands, so the thumb
 * oscillates against the finger. Here the control owns the displayed value for
 * the duration of the gesture, and REAPER takes over again once it ends.
 *
 * Sends are gated to one in flight at a time: the newest value goes out when
 * the previous reply arrives. That adapts to latency without an interval to
 * tune, and because the pump re-fires on reply it is trailing-edge, so the
 * final resting position is always sent.
 */
export function useLiveSlider(
  serverValue: number,
  commit?: (value: number) => void | Promise<unknown>,
): LiveSlider {
  const [localValue, setLocalValue] = useState(serverValue);
  const [active, setActive] = useState(false);

  const inFlight  = useRef(false);
  const pending   = useRef<number | null>(null);
  const lastSent  = useRef<number | null>(null);
  const releasing = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hand control back to the server value, but only once the last send has
  // been answered — otherwise the thumb snaps backwards on release.
  const settle = useCallback(() => {
    if (!releasing.current || inFlight.current) return;
    if (pending.current !== lastSent.current) return;
    releasing.current = false;
    setActive(false);
  }, []);

  const pump = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;

    void (async () => {
      try {
        // Re-reads pending each pass, so whatever the finger did during the
        // await goes out next. Ends on the value the gesture stopped at.
        let next = pending.current;
        while (next !== null && next !== lastSent.current) {
          lastSent.current = next;
          if (!commit) break;
          try {
            await commit(next);
          } catch { /* transport errors surface elsewhere */ }
          next = pending.current;
        }
      } finally {
        inFlight.current = false;
        settle(); // no-op unless the gesture is over and nothing is queued
      }
    })();
  }, [commit, settle]);

  const change = useCallback((next: number) => {
    setActive(true);
    setLocalValue(next);
    pending.current = next;
    releasing.current = false;

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      releasing.current = true;
      settle();
    }, IDLE_RELEASE_MS);

    pump();
  }, [pump, settle]);

  const release = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    releasing.current = true;
    settle();
  }, [settle]);

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  return { value: active ? localValue : serverValue, change, release };
}

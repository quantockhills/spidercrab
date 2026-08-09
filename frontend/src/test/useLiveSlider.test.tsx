import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLiveSlider } from '../hooks/useLiveSlider';

// A commit function whose replies we release by hand, so we can hold the
// network "in flight" for as long as a test needs.
function deferredCommit() {
  const resolvers: Array<() => void> = [];
  const calls: number[] = [];
  const commit = vi.fn((value: number) => {
    calls.push(value);
    return new Promise<void>((resolve) => resolvers.push(() => resolve()));
  });
  return {
    commit,
    calls,
    settleOne: async () => {
      const next = resolvers.shift();
      if (next) await act(async () => { next(); });
    },
  };
}

describe('useLiveSlider (Issue #137)', () => {
  it('shows the server value when nobody is touching it', () => {
    const { result } = renderHook(() => useLiveSlider(0.8));
    expect(result.current.value).toBe(0.8);
  });

  it('follows server updates while idle', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useLiveSlider(v),
      { initialProps: { v: 0.8 } },
    );
    rerender({ v: 0.4 });
    expect(result.current.value).toBe(0.4);
  });

  // The bug itself: the value must not snap back to the stale server value
  // between the change and the reply.
  it('holds the finger position while the reply is still in flight', async () => {
    const net = deferredCommit();
    const { result, rerender } = renderHook(
      ({ v }) => useLiveSlider(v, net.commit),
      { initialProps: { v: 0.8 } },
    );

    act(() => { result.current.change(0.5); });
    expect(result.current.value).toBe(0.5);

    // A re-render with the not-yet-updated server value must not move it back
    rerender({ v: 0.8 });
    expect(result.current.value).toBe(0.5);
  });

  it('ignores a stale server value that arrives mid-gesture', () => {
    const net = deferredCommit();
    const { result, rerender } = renderHook(
      ({ v }) => useLiveSlider(v, net.commit),
      { initialProps: { v: 0.8 } },
    );

    act(() => { result.current.change(0.5); });
    act(() => { result.current.change(0.3); });
    // Late reply for the *first* move lands in server state
    rerender({ v: 0.5 });
    expect(result.current.value).toBe(0.3);
  });

  it('keeps only one command in flight and sends the newest value next', async () => {
    const net = deferredCommit();
    const { result } = renderHook(() => useLiveSlider(0.8, net.commit));

    act(() => { result.current.change(0.5); });
    expect(net.calls).toEqual([0.5]);

    // Three more moves while 0.5 is unanswered — none should be sent yet
    act(() => { result.current.change(0.4); });
    act(() => { result.current.change(0.3); });
    act(() => { result.current.change(0.2); });
    expect(net.calls).toEqual([0.5]);

    // Reply arrives: only the newest value goes out, the middle ones are dropped
    await net.settleOne();
    expect(net.calls).toEqual([0.5, 0.2]);
  });

  it('always sends the value the gesture ended on', async () => {
    const net = deferredCommit();
    const { result } = renderHook(() => useLiveSlider(0.8, net.commit));

    act(() => { result.current.change(0.5); });
    act(() => { result.current.change(0.1); });
    act(() => { result.current.release(); });

    await net.settleOne();
    await waitFor(() => expect(net.calls).toEqual([0.5, 0.1]));
  });

  it('hands control back to the server value once the gesture settles', async () => {
    const net = deferredCommit();
    const { result, rerender } = renderHook(
      ({ v }) => useLiveSlider(v, net.commit),
      { initialProps: { v: 0.8 } },
    );

    act(() => { result.current.change(0.5); });
    act(() => { result.current.release(); });

    // Still holding the finger position until the send is answered, so the
    // thumb doesn't snap backwards on release
    expect(result.current.value).toBe(0.5);

    await net.settleOne();
    rerender({ v: 0.5 });
    await waitFor(() => expect(result.current.value).toBe(0.5));

    // Now genuinely following the server again
    rerender({ v: 0.9 });
    expect(result.current.value).toBe(0.9);
  });

  it('works without a commit target', () => {
    const { result } = renderHook(() => useLiveSlider(0.8));
    expect(() => {
      act(() => { result.current.change(0.5); });
      act(() => { result.current.release(); });
    }).not.toThrow();
  });
});

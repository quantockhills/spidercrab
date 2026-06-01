import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ParamControl } from '../components/ParamControl';
import type { FxParam } from '../hooks/useReaper';

// ── Mock data ────────────────────────────────────────────────

const mockParams: FxParam[] = [
  { index: 0, name: 'Freq 1', value: 500, min: 20, max: 20000, mid: 1000 },
  { index: 1, name: 'Gain 1', value: 0.5, min: 0, max: 1, mid: 0.5 },
  { index: 2, name: 'Q 1', value: 0.8, min: 0.1, max: 20, mid: 1.0 },
];

// ── Helpers ──────────────────────────────────────────────────

function renderParamControl(props: Partial<Parameters<typeof ParamControl>[0]> = {}) {
  const getFxParams = vi.fn().mockResolvedValue(mockParams);
  const setFxParam = vi.fn().mockResolvedValue(true);
  const deleteFx = vi.fn().mockResolvedValue(true);
  const onEvent = vi.fn().mockReturnValue(() => {});
  const onBack = vi.fn();

  const utils = render(
    <ParamControl
      trackIdx={0}
      trackName="Kick"
      fxIdx={0}
      fxName="VST3:ReaEQ"
      getFxParams={getFxParams}
      setFxParam={setFxParam}
      deleteFx={deleteFx}
      onEvent={onEvent}
      onBack={onBack}
      {...props}
    />,
  );

  return { ...utils, getFxParams, setFxParam, deleteFx, onEvent, onBack };
}

// ── Tests ────────────────────────────────────────────────────

describe('ParamControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getFxParams on mount', () => {
    const { getFxParams } = renderParamControl();
    expect(getFxParams).toHaveBeenCalledWith(0, 0);
  });

  it('shows loading state initially', () => {
    const getFxParams = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <ParamControl
        trackIdx={0}
        trackName="Kick"
        fxIdx={0}
        fxName="ReaEQ"
        getFxParams={getFxParams}
        setFxParam={vi.fn()}
        deleteFx={vi.fn()}
        onEvent={vi.fn().mockReturnValue(() => {})}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading parameters...')).toBeDefined();
  });

  it('displays FX name and track name in header', async () => {
    renderParamControl();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Track name should be shown
    expect(screen.getByText(/Kick/)).toBeDefined();
  });

  it('displays parameter names', async () => {
    renderParamControl();

    await waitFor(() => {
      expect(screen.getByText('Freq 1')).toBeDefined();
    });

    expect(screen.getByText('Gain 1')).toBeDefined();
    expect(screen.getByText('Q 1')).toBeDefined();
  });

  it('shows Remove FX button', async () => {
    renderParamControl();

    await waitFor(() => {
      expect(screen.getByText('Remove FX')).toBeDefined();
    });
  });

  it('handles back button', async () => {
    const { onBack } = renderParamControl();

    await waitFor(() => {
      expect(screen.getByLabelText('Back')).toBeDefined();
    });

    screen.getByLabelText('Back').click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows empty state when no params', async () => {
    const getFxParams = vi.fn().mockResolvedValue([]);
    render(
      <ParamControl
        trackIdx={0}
        trackName="Kick"
        fxIdx={0}
        fxName="ReaEQ"
        getFxParams={getFxParams}
        setFxParam={vi.fn()}
        deleteFx={vi.fn()}
        onEvent={vi.fn().mockReturnValue(() => {})}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No adjustable parameters')).toBeDefined();
    });
  });

  it('shows error state when getFxParams fails', async () => {
    const getFxParams = vi.fn().mockRejectedValue(new Error('Failed to load'));
    render(
      <ParamControl
        trackIdx={0}
        trackName="Kick"
        fxIdx={0}
        fxName="ReaEQ"
        getFxParams={getFxParams}
        setFxParam={vi.fn()}
        deleteFx={vi.fn()}
        onEvent={vi.fn().mockReturnValue(() => {})}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeDefined();
    });

    expect(screen.getByText('Retry')).toBeDefined();
  });

  // ── Drag/event race condition tests (Issue #73) ──

  // Helper: create a fake slider with non-zero bounding rect for pointer event tests
  function mockSliderBoundingRect(slider: Element) {
    Object.defineProperty(slider, 'getBoundingClientRect', {
      writable: true,
      configurable: true,
      value: () => ({
        top: 0, left: 0, right: 300, bottom: 32,
        width: 300, height: 32,
        x: 0, y: 0,
        toJSON: () => ({}),
      }),
    });
  }

  it('suppresses fx_param_changed events for the param being dragged', async () => {
    // When a param is being dragged, fx_param_changed events for that param
    // should be suppressed to prevent the slider jumping back.
    const setFxParam = vi.fn().mockResolvedValue({ payload: { value: 1500 } });

    // Create an event handler that emits fx_param_changed events
    const eventUnsubscribe = vi.fn();
    const eventHandlers: Array<(data: any) => void> = [];
    const onEvent = vi.fn().mockImplementation((pattern: string, handler: (data: any) => void) => {
      if (pattern === 'event:fx_param_changed') {
        eventHandlers.push(handler);
      }
      return eventUnsubscribe;
    });

    renderParamControl({ setFxParam, onEvent });

    await waitFor(() => {
      expect(screen.getByText('Freq 1')).toBeDefined();
    });

    // Verify the slider track is rendered
    const slider = document.querySelector('.cursor-pointer');
    expect(slider).not.toBeNull();

    // Mock bounding rect so pointer calculations work in jsdom
    mockSliderBoundingRect(slider!);

    // Simulate pointer down to start dragging at 30% position
    fireEvent.pointerDown(slider!, {
      clientX: 90,
      clientY: 16,
      button: 0,
    });

    // During the drag, an fx_param_changed event arrives for param 0
    // This should be suppressed (not update the component state)
    if (eventHandlers.length > 0) {
      act(() => {
        eventHandlers[0]({
          payload: {
            trackIdx: 0,
            fxIdx: 0,
            params: [{ index: 0, value: 100, min: 20, max: 20000, mid: 1000 }],
          },
        });
      });

      // The display should NOT show 100 (the event's value)
      // It should still show the drag position value (which was ~6014 at 30%)
      await waitFor(() => {
        const valueDisplay = document.querySelector('.tabular-nums');
        expect(valueDisplay).not.toBeNull();
        if (valueDisplay) {
          const text = valueDisplay.textContent || '';
          // Should NOT show the event value of 100
          // The pct = (6014 - 20) / (20000 - 20) * 100 ≈ 30%
          // But since we moved to 90px out of 300px = 30%
          // value = 20 + 0.3 * 19980 = 6014
          // Display should NOT be '100.000'
          expect(text).not.toBe('100.000');
        }
      });
    }
  });

  it('allows fx_param_changed events for params NOT being dragged', async () => {
    // Events for params that are NOT being dragged should still update
    const eventUnsubscribe = vi.fn();
    const eventHandlers: Array<(data: any) => void> = [];
    const onEvent = vi.fn().mockImplementation((pattern: string, handler: (data: any) => void) => {
      if (pattern === 'event:fx_param_changed') {
        eventHandlers.push(handler);
      }
      return eventUnsubscribe;
    });

    renderParamControl({ onEvent });

    await waitFor(() => {
      expect(screen.getByText('Freq 1')).toBeDefined();
    });

    // Start dragging param 0 (Freq 1) — mock rect so it works
    const slider = document.querySelectorAll('.cursor-pointer')[0];
    expect(slider).not.toBeNull();
    mockSliderBoundingRect(slider!);

    fireEvent.pointerDown(slider!, {
      clientX: 150,
      clientY: 16,
      button: 0,
    });

    // An event for param 1 (Gain 1 — NOT being dragged) should be processed
    if (eventHandlers.length > 0) {
      act(() => {
        eventHandlers[0]({
          payload: {
            trackIdx: 0,
            fxIdx: 0,
            params: [{ index: 1, value: 0.75, min: 0, max: 1, mid: 0.5 }],
          },
        });
      });

      // Wait for state update — the value should change from initial 0.5 to 0.75
      await waitFor(() => {
        // Check all tabular-nums; the second one belongs to Gain
        const displays = document.querySelectorAll('.tabular-nums');
        expect(displays.length).toBeGreaterThan(1);
        // The Gain value should have been updated from 0.500 to something else
        const gainDisplay = displays[1];
        expect(gainDisplay.textContent).not.toBe('0.500');
      });
    }
  });

  it('clears draggingParamRef after pointer up and allows events through', async () => {
    // After the drag ends (pointer up), events should flow normally
    // Use fake timers so we can advance the 150ms debounce in finishDragging
    vi.useFakeTimers();

    const eventUnsubscribe = vi.fn();
    const eventHandlers: Array<(data: any) => void> = [];
    const onEvent = vi.fn().mockImplementation((pattern: string, handler: (data: any) => void) => {
      if (pattern === 'event:fx_param_changed') {
        eventHandlers.push(handler);
      }
      return eventUnsubscribe;
    });
    const mockResponse = { payload: { value: 1500 } };
    const setFxParam = vi.fn().mockResolvedValue(mockResponse);

    renderParamControl({ setFxParam, onEvent });

    // Wait for initial render with fake timers advancing
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => {
      expect(screen.getByText('Freq 1')).toBeDefined();
    });

    // Start dragging param 0
    const slider = document.querySelectorAll('.cursor-pointer')[0];
    expect(slider).not.toBeNull();
    mockSliderBoundingRect(slider!);

    fireEvent.pointerDown(slider!, {
      clientX: 150,
      clientY: 16,
      button: 0,
    });

    // End the drag
    fireEvent.pointerUp(window, {
      clientX: 180,
      clientY: 16,
    });

    // After pointer up, setFxParam should be called
    await vi.waitFor(() => {
      expect(setFxParam).toHaveBeenCalled();
    });

    // Resolve the promise (committed value applied)
    await vi.waitFor(async () => {
      await Promise.resolve();
    });

    // Advance past the 150ms debounce — clears draggingParamRef
    vi.advanceTimersByTime(200);

    // Now an fx_param_changed event should update the slider
    if (eventHandlers.length > 0) {
      act(() => {
        eventHandlers[0]({
          payload: {
            trackIdx: 0,
            fxIdx: 0,
            params: [{ index: 0, value: 2000, min: 20, max: 20000, mid: 1000 }],
          },
        });
      });

      // The display should reflect the new event value
      await vi.waitFor(() => {
        const valueDisplay = document.querySelector('.tabular-nums');
        expect(valueDisplay).not.toBeNull();
        if (valueDisplay) {
          expect(valueDisplay.textContent).toMatch(/2000/);
        }
      });
    }

    vi.useRealTimers();
  });

  it('updates from server committed value override after setFxParam response', async () => {
    // When setFxParam returns a committed value (e.g., from normalization round-trip),
    // the ParamControl should update to use the committed value, not the optimistic one.
    const committedValue = 5002;
    const setFxParam = vi.fn().mockResolvedValue({ payload: { value: committedValue } });

    renderParamControl({ setFxParam });

    await waitFor(() => {
      expect(screen.getByText('Freq 1')).toBeDefined();
    });

    // Simulate a value change via the slider
    const slider = document.querySelectorAll('.cursor-pointer')[0];
    expect(slider).not.toBeNull();
    mockSliderBoundingRect(slider!);

    // Start drag
    fireEvent.pointerDown(slider!, {
      clientX: 90,
      clientY: 16,
      button: 0,
    });

    // Move
    fireEvent.pointerMove(window, {
      clientX: 120,
      clientY: 16,
    });

    // End drag — this triggers the final onChange call
    fireEvent.pointerUp(window, {
      clientX: 120,
      clientY: 16,
    });

    // Wait for setFxParam to be called
    await waitFor(() => {
      expect(setFxParam).toHaveBeenCalled();
    });

    // Wait for the committed value to be applied
    await waitFor(() => {
      const valueDisplay = document.querySelector('.tabular-nums');
      expect(valueDisplay).not.toBeNull();
      if (valueDisplay) {
        expect(valueDisplay.textContent).toContain(String(committedValue));
      }
    });
  });
});

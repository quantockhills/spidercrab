import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { findModule, cleanFxName } from '../components/grid/modules';
import { GridView } from '../components/grid/GridView';
import type { Track, FxInfo, FxParam } from '../hooks/useReaper';

// ── Module matching ──────────────────────────────────────────

describe('grid module matching', () => {
  it('strips REAPER format prefixes', () => {
    expect(cleanFxName('JS: Chorus')).toBe('Chorus');
    expect(cleanFxName('VST3: ReaEQ (Cockos)')).toBe('ReaEQ (Cockos)');
    expect(cleanFxName('Chorus')).toBe('Chorus');
  });

  it('finds the Chorus module however REAPER prefixes it', () => {
    expect(findModule('JS: Chorus')).not.toBeNull();
    expect(findModule('Chorus')).not.toBeNull();
  });

  it('does not match unrelated plugins', () => {
    expect(findModule('JS: ReaEQ')).toBeNull();
    expect(findModule('VST3: Pro-Q 3')).toBeNull();
    // Guard against a loose substring match picking up other chorus-ish names
    expect(findModule('JS: Chorus-Ensemble Deluxe')).toBeNull();
  });

  // The module is hand-authored against Cockos Chorus's declaration order.
  // JSFX slider1 is REAPER param 0, so an off-by-one here silently drives the
  // wrong control — worth pinning.
  it('maps Chorus parameters to the right indices', () => {
    const m = findModule('JS: Chorus')!;
    const byLabel: Record<string, number> = {};
    for (const panel of m.panels) {
      for (const c of panel.controls) byLabel[c.label] = c.param;
    }
    expect(byLabel).toEqual({
      Time: 0,    // slider1 Chorus Length (ms)
      Voices: 1,  // slider2 Number Of Voices
      Rate: 2,    // slider3 Rate (Hz)
      Depth: 3,   // slider4 Pitch Fudge Factor
      Wet: 4,     // slider5 Wet Mix (dB)
      Dry: 5,     // slider6 Dry Mix (dB)
    });
  });

  it('offers one segmented option per voice', () => {
    const m = findModule('Chorus')!;
    const seg = m.panels
      .flatMap((p) => p.controls)
      .find((c) => c.kind === 'segmented');
    expect(seg).toBeDefined();
    expect(seg!.kind === 'segmented' && seg!.options.map((o) => o.value))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ── GridView ─────────────────────────────────────────────────

const tracks: Track[] = [
  { index: 0, name: 'Gtr', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, recMode: 0, volume: 0.8, pan: 0 },
];

const chorusParams: FxParam[] = [
  { index: 0, name: 'Chorus Length (ms)', value: 15, min: 1, max: 250, mid: 125 },
  { index: 1, name: 'Number Of Voices', value: 1, min: 1, max: 8, mid: 4 },
  { index: 2, name: 'Rate (Hz)', value: 0.5, min: 0.1, max: 16, mid: 8 },
  { index: 3, name: 'Pitch Fudge Factor', value: 0.7, min: 0, max: 1, mid: 0.5 },
  { index: 4, name: 'Wet Mix (dB)', value: -6, min: -100, max: 12, mid: -44 },
  { index: 5, name: 'Dry Mix (dB)', value: -6, min: -100, max: 12, mid: -44 },
];

function renderGrid(fx: FxInfo[], selectedTrack: number | null = 0) {
  const getTrackFx = vi.fn().mockResolvedValue(fx);
  const getFxParams = vi.fn().mockResolvedValue({
    params: chorusParams, total: chorusParams.length, offset: 0, limit: 64,
  });
  const setFxParam = vi.fn().mockResolvedValue({ payload: {} });
  render(
    <GridView
      tracks={tracks}
      selectedTrack={selectedTrack}
      getTrackFx={getTrackFx}
      getFxParams={getFxParams}
      setFxParam={setFxParam}
    />,
  );
  return { getTrackFx, getFxParams, setFxParam };
}

describe('GridView', () => {
  it('prompts for a track when none is selected', () => {
    renderGrid([], null);
    expect(screen.getByText('No track selected')).toBeDefined();
  });

  it('says so when the track has no FX', async () => {
    renderGrid([]);
    await waitFor(() => expect(screen.getByText(/has no FX/)).toBeDefined());
  });

  // The FX tab stays the way to reach plugins without a layout, so Grid should
  // say that rather than appear broken.
  it('explains when a track has FX but none have a module', async () => {
    renderGrid([{ index: 0, name: 'VST3: ReaEQ' }, { index: 1, name: 'JS: ReaComp' }]);
    await waitFor(() =>
      expect(screen.getByText(/none with a module yet/)).toBeDefined());
  });

  it('renders a device for a plugin with a module', async () => {
    renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    await waitFor(() =>
      expect(screen.getByTestId('grid-device-title').textContent).toBe('Chorus'));
    // Panels
    expect(screen.getByText('Voices')).toBeDefined();
    expect(screen.getByText('Motion')).toBeDefined();
    expect(screen.getByText('Output')).toBeDefined();
  });

  it('renders each control as the type the module asks for', async () => {
    renderGrid([{ index: 0, name: 'JS: Chorus' }]);

    // Knobs and faders expose slider semantics
    await waitFor(() => {
      expect(screen.getByLabelText('Rate')).toBeDefined();
    });
    expect(screen.getByLabelText('Depth')).toBeDefined();
    expect(screen.getByLabelText('Time')).toBeDefined();
    expect(screen.getByLabelText('Wet')).toBeDefined();
    expect(screen.getByLabelText('Dry')).toBeDefined();

    // Voice count is eight buttons, not a slider — the whole point of the module
    const one = screen.getByRole('button', { name: '1' });
    expect(one.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '8' })).toBeDefined();
  });

  it('formats values with the module’s units rather than raw numbers', async () => {
    renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    await waitFor(() => expect(screen.getByText('0.50 Hz')).toBeDefined());
    expect(screen.getByText('70%')).toBeDefined();   // 0.7 depth
    expect(screen.getByText('15 ms')).toBeDefined();
    expect(screen.getAllByText('-6 dB')).toHaveLength(2); // wet + dry
  });

  // Navigation lives in the bottom strip rather than the device surface, so
  // controls don't have to share the screen with a pan gesture.
  it('provides a strip to navigate between devices', async () => {
    renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    await waitFor(() => expect(screen.getByTestId('grid-strip')).toBeDefined());
    // One chip per device, tappable to jump
    expect(screen.getByRole('button', { name: 'Chorus' })).toBeDefined();
  });

  it('does not let the device surface pan by touch', async () => {
    renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    const scroller = await waitFor(() => screen.getByTestId('grid-scroller'));
    // touch-none: the strip owns navigation, so a stray swipe here must not
    // scroll the surface out from under a knob mid-drag.
    expect(scroller.className).toContain('touch-none');
  });

  // A drag arrives as many small pointermove events. The drag handler used to
  // report per-event deltas while the widget re-derived from its current
  // value, so each event landed at roughly the same place and the control
  // never travelled more than a single step — it "barely worked".
  it('accumulates a multi-event drag rather than applying one step', async () => {
    const { setFxParam } = renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    const rate = await waitFor(() => screen.getByLabelText('Rate'));

    // Rate spans 0.1–16 from a start of 0.5. Dragging up 95px is half the
    // 190px travel, so it should land near the middle of the range.
    fireEvent.pointerDown(rate, { clientX: 0, clientY: 300, pointerId: 1, button: 0 });
    for (let y = 295; y >= 205; y -= 5) {
      fireEvent.pointerMove(window, { clientX: 0, clientY: y, pointerId: 1 });
    }
    fireEvent.pointerUp(window, { clientX: 0, clientY: 205, pointerId: 1 });

    await waitFor(() => expect(setFxParam).toHaveBeenCalled());
    const sent = setFxParam.mock.calls.map((c) => c[3] as number);
    const furthest = Math.max(...sent);

    // Half of 15.9 added to 0.5 is ~8.5. Anything near the 0.5 start means the
    // drag stopped accumulating.
    expect(furthest).toBeGreaterThan(6);
  });

  it('drags the whole range without releasing', async () => {
    const { setFxParam } = renderGrid([{ index: 0, name: 'JS: Chorus' }]);
    const depth = await waitFor(() => screen.getByLabelText('Depth'));

    // Depth is 0–1, starting at 0.7. A full 190px upward drag must reach the top.
    fireEvent.pointerDown(depth, { clientX: 0, clientY: 400, pointerId: 1, button: 0 });
    for (let y = 390; y >= 200; y -= 10) {
      fireEvent.pointerMove(window, { clientX: 0, clientY: y, pointerId: 1 });
    }
    fireEvent.pointerUp(window, { clientX: 0, clientY: 200, pointerId: 1 });

    await waitFor(() => expect(setFxParam).toHaveBeenCalled());
    const sent = setFxParam.mock.calls.map((c) => c[3] as number);
    expect(Math.max(...sent)).toBeCloseTo(1, 2);
  });

  it('only renders plugins that have a module, ignoring the rest', async () => {
    renderGrid([
      { index: 0, name: 'VST3: ReaEQ' },
      { index: 1, name: 'JS: Chorus' },
      { index: 2, name: 'VST3: Pro-Q 3' },
    ]);
    await waitFor(() => expect(screen.getAllByTestId('grid-device-title')).toHaveLength(1));
    expect(screen.getByTestId('grid-device-title').textContent).toBe('Chorus');
    expect(screen.getByText(/1 device/)).toBeDefined();
    expect(screen.queryByText('ReaEQ')).toBeNull();
  });
});

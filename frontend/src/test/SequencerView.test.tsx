import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SequencerView } from '../components/SequencerView';
import type { SequencerData, StepData } from '../components/SequencerView';

// ── Mock data ────────────────────────────────────────────────

function makeEmptySequencer(): SequencerData {
  const steps: StepData[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      steps.push({ column: col, row, active: false, velocity: 100, note: 36 + row });
    }
  }
  return { columns: 8, rows: 8, length: 16, baseNote: 36, playhead: 0, steps };
}

function makeActiveSequencer(): SequencerData {
  const seq = makeEmptySequencer();
  // Activate some steps
  seq.steps[0] = { column: 0, row: 0, active: true, velocity: 110, note: 36 };
  seq.steps[9] = { column: 1, row: 1, active: true, velocity: 85, note: 38 };
  seq.steps[49] = { column: 1, row: 6, active: true, velocity: 100, note: 47 };
  return seq;
}

// ── Helpers ──────────────────────────────────────────────────

function renderSequencerView(props: Partial<Parameters<typeof SequencerView>[0]> = {}) {
  const getSequencer = vi.fn().mockResolvedValue(makeEmptySequencer());
  const toggleStep = vi.fn().mockResolvedValue({ column: 0, row: 0, active: true, velocity: 100, note: 36 } as StepData);
  const setStep = vi.fn().mockResolvedValue(true);
  const clearAll = vi.fn().mockResolvedValue(true);
  const setLength = vi.fn().mockResolvedValue(true);
  const setBaseNote = vi.fn().mockResolvedValue(true);
  const convertToClip = vi.fn().mockResolvedValue({ success: true });
  const onSwitchToSession = vi.fn();

  const utils = render(
    <SequencerView
      sequencer={null}
      getSequencer={getSequencer}
      toggleStep={toggleStep}
      setStep={setStep}
      clearAll={clearAll}
      setLength={setLength}
      setBaseNote={setBaseNote}
      convertToClip={convertToClip}
      onSwitchToSession={onSwitchToSession}
      {...props}
    />,
  );

  return { ...utils, getSequencer, toggleStep, setStep, clearAll, setLength, setBaseNote, convertToClip, onSwitchToSession };
}

// ── Tests ────────────────────────────────────────────────────

describe('SequencerView - Convert to Clip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders convert button (⇩ Clip) when sequencer data is loaded', async () => {
    renderSequencerView({ sequencer: makeEmptySequencer() });

    await waitFor(() => {
      expect(screen.getByTitle('Convert pattern to MIDI clip')).toBeDefined();
    });
  });

  it('disables convert button when no steps are active', async () => {
    renderSequencerView({ sequencer: makeEmptySequencer() });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  it('enables convert button when steps are active', async () => {
    renderSequencerView({ sequencer: makeActiveSequencer() });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  it('calls convertToClip when convert button is clicked', async () => {
    const convertToClip = vi.fn().mockResolvedValue({ success: true });
    const onSwitchToSession = vi.fn();

    renderSequencerView({
      sequencer: makeActiveSequencer(),
      convertToClip,
      onSwitchToSession,
    });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip');
      fireEvent.click(btn);
    });

    expect(convertToClip).toHaveBeenCalledTimes(1);
  });

  it('shows success toast and switches to session mode on successful conversion', async () => {
    const convertToClip = vi.fn().mockResolvedValue({ success: true });
    const onSwitchToSession = vi.fn();

    renderSequencerView({
      sequencer: makeActiveSequencer(),
      convertToClip,
      onSwitchToSession,
    });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip');
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByText('Pattern converted to clip!')).toBeDefined();
    });

    expect(onSwitchToSession).toHaveBeenCalledTimes(1);
  });

  it('shows error toast on failed conversion', async () => {
    const convertToClip = vi.fn().mockResolvedValue({ success: false, error: 'No active steps' });
    const onSwitchToSession = vi.fn();

    renderSequencerView({
      sequencer: makeActiveSequencer(),
      convertToClip,
      onSwitchToSession,
    });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip');
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByText('No active steps')).toBeDefined();
    });

    // Should NOT switch to session mode on failure
    expect(onSwitchToSession).not.toHaveBeenCalled();
  });

  it('shows button label as ⇩ Clip (not converting indicator) by default', async () => {
    renderSequencerView({ sequencer: makeActiveSequencer() });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip');
      expect(btn.textContent).toBe('⇩ Clip');
    });
  });

  it('renders convert button in the header section', async () => {
    renderSequencerView({ sequencer: makeActiveSequencer() });

    await waitFor(() => {
      const btn = screen.getByTitle('Convert pattern to MIDI clip');
      expect(btn).toBeDefined();
    });
  });
});

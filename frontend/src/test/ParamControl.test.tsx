import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      onBack={onBack}
      {...props}
    />,
  );

  return { ...utils, getFxParams, setFxParam, deleteFx, onBack };
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
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeDefined();
    });

    expect(screen.getByText('Retry')).toBeDefined();
  });
});

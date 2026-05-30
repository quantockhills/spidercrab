import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackOverview } from '../components/TrackOverview';
import type { Track, FxInfo } from '../hooks/useReaper';

// ── Mock data ────────────────────────────────────────────────

const mockTracks: Track[] = [
  { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
  { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7 },
];

const mockFx: Record<number, FxInfo[]> = {
  0: [
    { index: 0, name: 'VST3: ReaEQ' },
    { index: 1, name: 'VST3: ReaComp' },
  ],
  1: [
    { index: 0, name: 'CLAP: Serum' },
  ],
};

// ── Helpers ──────────────────────────────────────────────────

function renderTrackOverview(props: Partial<Parameters<typeof TrackOverview>[0]> = {}) {
  const getTrackFx = vi.fn().mockImplementation(async (trackIdx: number) => {
    return mockFx[trackIdx] || [];
  });
  const onSelectFx = vi.fn();
  const onSelectTrack = vi.fn();
  const onToggleMute = vi.fn();
  const onToggleSolo = vi.fn();
  const onToggleArm = vi.fn();
  const onRefresh = vi.fn();

  const utils = render(
    <TrackOverview
      tracks={mockTracks}
      selectedTrack={0}
      onSelectTrack={onSelectTrack}
      onToggleMute={onToggleMute}
      onToggleSolo={onToggleSolo}
      onToggleArm={onToggleArm}
      onRefresh={onRefresh}
      getTrackFx={getTrackFx}
      onSelectFx={onSelectFx}
      {...props}
    />,
  );

  return { ...utils, getTrackFx, onSelectFx, onSelectTrack, onToggleMute, onToggleSolo, onToggleArm, onRefresh };
}

// ── Tests ────────────────────────────────────────────────────

describe('TrackOverview — FX grid cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getTrackFx for each track on mount', async () => {
    const { getTrackFx } = renderTrackOverview();
    await waitFor(() => {
      expect(getTrackFx).toHaveBeenCalledTimes(2);
    });
    expect(getTrackFx).toHaveBeenCalledWith(0);
    expect(getTrackFx).toHaveBeenCalledWith(1);
  });

  it('displays FX cards under track rows', async () => {
    renderTrackOverview();

    // Wait for FX cards to appear
    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Track 0 should have ReaEQ and ReaComp, Track 1 should have Serum
    expect(screen.getByText('ReaEQ')).toBeDefined();
    expect(screen.getByText('ReaComp')).toBeDefined();
    expect(screen.getByText('Serum')).toBeDefined();
  });

  it('cleans FX names (strips format prefix)', async () => {
    renderTrackOverview();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Should NOT show the raw names with prefixes
    expect(screen.queryByText('VST3: ReaEQ')).toBeNull();
    expect(screen.queryByText('CLAP: Serum')).toBeNull();
  });

  it('calls onSelectFx when tapping an FX card', async () => {
    const { onSelectFx } = renderTrackOverview();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Click the ReaEQ card
    fireEvent.click(screen.getByText('ReaEQ'));

    expect(onSelectFx).toHaveBeenCalledOnce();
    // trackIdx=0, fxIdx=0, fxName='VST3: ReaEQ' (raw name, not cleaned)
    expect(onSelectFx).toHaveBeenCalledWith(0, 0, 'VST3: ReaEQ');
  });

  it('shows loading indicator while FX are being fetched', async () => {
    // Delay resolution so we can see the loading state
    const delayedGetFx = vi.fn().mockImplementation(
      () => new Promise<FxInfo[]>((resolve) => setTimeout(() => resolve([]), 100)),
    );

    renderTrackOverview({ getTrackFx: delayedGetFx });

    expect(screen.getByText('Loading FX…')).toBeDefined();

    await waitFor(() => {
      expect(screen.queryByText('Loading FX…')).toBeNull();
    });
  });

  it('does not render FX section when getTrackFx and onSelectFx are not provided', async () => {
    render(
      <TrackOverview
        tracks={mockTracks}
        selectedTrack={0}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    // With no getTrackFx, no FX cards should appear
    await waitFor(() => {
      expect(screen.queryByText('ReaEQ')).toBeNull();
      expect(screen.queryByText('Loading FX…')).toBeNull();
    });
  });
});

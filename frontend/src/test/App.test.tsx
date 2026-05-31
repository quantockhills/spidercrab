import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import type { Track, FxInfo } from '../hooks/useReaper';
import { useReaper } from '../hooks/useReaper';

// Mock the useReaper hook
vi.mock('../hooks/useReaper', () => ({
  useReaper: vi.fn(),
}));

const mockTracks: Track[] = [
  { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8 },
  { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7 },
];

const mockFx: Record<number, FxInfo[]> = {
  0: [
    { index: 0, name: 'VST3: ReaEQ' },
    { index: 1, name: 'VST3: ReaComp' },
  ],
};

function setupMockReaper() {
  const mockGetTrackFx = vi.fn().mockImplementation(async (trackIdx: number) => mockFx[trackIdx] || []);
  const mockOnEvent = vi.fn().mockReturnValue(vi.fn());
  const mockGetFxParams = vi.fn().mockResolvedValue([]);
  const mockSetFxParam = vi.fn().mockResolvedValue(true);
  const mockDeleteFx = vi.fn().mockResolvedValue(true);

  (useReaper as ReturnType<typeof vi.fn>).mockReturnValue({
    connected: true,
    tracks: mockTracks,
    refreshTracks: vi.fn().mockResolvedValue(undefined),
    toggleTrackMute: vi.fn().mockResolvedValue(undefined),
    toggleTrackSolo: vi.fn().mockResolvedValue(undefined),
    toggleTrackArm: vi.fn().mockResolvedValue(undefined),
    selectTrack: vi.fn().mockResolvedValue(undefined),
    enumerateFx: vi.fn().mockResolvedValue([]),
    getTrackFx: mockGetTrackFx,
    getFxParams: mockGetFxParams,
    setFxParam: mockSetFxParam,
    addFx: vi.fn(),
    deleteFx: mockDeleteFx,
    getDirectory: vi.fn().mockResolvedValue([]),
    sendSampleToTrack: vi.fn(),
    refreshFxCache: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    getTransportState: vi.fn().mockResolvedValue({playing: false, recording: false}),
    onEvent: mockOnEvent,
    updateTrack: vi.fn(),
  });

  return { mockGetTrackFx, mockOnEvent, mockGetFxParams, mockSetFxParam, mockDeleteFx };
}

describe('App — FX card navigation to ParamControl', () => {
  it('navigates to FX tab when FX card is tapped on TrackOverview', async () => {
    setupMockReaper();
    render(<App />);

    // Should start on the Tracks tab
    expect(screen.getByText('Kick')).toBeDefined();

    // Wait for FX cards to appear
    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Verify we're on the Tracks tab (not FX tab)
    expect(screen.queryByText('Loading parameters...')).toBeNull();

    // Click the ReaEQ FX card
    fireEvent.click(screen.getByText('ReaEQ'));

    // Should now navigate to the FX tab and show loading params
    await waitFor(() => {
      expect(screen.getByText('Loading parameters...')).toBeDefined();
    });

    // The ParamControl view should show the FX name and track info
    expect(screen.getByText('ReaEQ')).toBeDefined();
    expect(screen.getByText('Track: Kick')).toBeDefined();
    expect(screen.getByText('Remove FX')).toBeDefined();
  });

  it('switches back to FX browser when pressing Back from ParamControl', async () => {
    setupMockReaper();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Click FX card
    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Loading parameters...')).toBeDefined();
    });

    // Click Back — goes back to FX tab (showing FxBrowser), not to Tracks tab
    fireEvent.click(screen.getByLabelText('Back'));

    await waitFor(() => {
      // Should show the FX browser (not ParamControl anymore)
      expect(screen.queryByText('Loading parameters...')).toBeNull();
    });
  });
});

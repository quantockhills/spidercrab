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
  const mockGetFxParams = vi.fn().mockResolvedValue({params: [], total: 0, offset: 0, limit: 32});
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
    isRefreshingFx: false,
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
  it('opens inline FX drawer when FX card is tapped on TrackOverview (Issue #94)', async () => {
    setupMockReaper();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Click the ReaEQ card — opens inline drawer on Tracks tab
    fireEvent.click(screen.getAllByText('ReaEQ')[0]);

    // The inline drawer shows close button
    await waitFor(() => {
      expect(screen.getByLabelText('Close drawer')).toBeDefined();
    });

    // Should still be on the Tracks tab (not navigated away)
    expect(screen.getByText('Tracks (2)')).toBeDefined();
  });

  it('closes inline FX drawer when close button is pressed', async () => {
    setupMockReaper();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Click FX card to open drawer
    fireEvent.click(screen.getAllByText('ReaEQ')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close drawer')).toBeDefined();
    });

    // Click Close
    fireEvent.click(screen.getByLabelText('Close drawer'));

    await waitFor(() => {
      // Drawer should be closed
      expect(screen.queryByLabelText('Close drawer')).toBeNull();
    });
  });

  // ── FX button from TrackOverview (Issue #86) ──

  it('navigates to FX tab when FX button is tapped on TrackOverview', async () => {
    setupMockReaper();
    render(<App />);

    // Should start on the Tracks tab
    expect(screen.getByText('Kick')).toBeDefined();

    // Find the FX button on track 0
    await waitFor(() => {
      const fxButtons = screen.getAllByTestId('open-fx-button');
      expect(fxButtons.length).toBeGreaterThanOrEqual(1);
    });

    const fxButtons = screen.getAllByTestId('open-fx-button');
    fireEvent.click(fxButtons[0]);

    // Should navigate to FX tab showing FxBrowser
    await waitFor(() => {
      expect(screen.getByText('FX Browser')).toBeDefined();
    });
  });
});
describe('App — Settings tab', () => {
  it('switches to Settings tab and shows Refresh Plugin List button', async () => {
    setupMockReaper();
    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Plugin List')).toBeDefined();
    });

    // Button should be enabled by default
    const btn = screen.getByText('Refresh Plugin List') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('shows disabled button and Refreshing indicator when isRefreshingFx is true', async () => {
    const mockOnEvent = vi.fn().mockReturnValue(vi.fn());
    (useReaper as ReturnType<typeof vi.fn>).mockReturnValue({
      connected: true,
      tracks: [],
      refreshTracks: vi.fn(),
      toggleTrackMute: vi.fn(),
      toggleTrackSolo: vi.fn(),
      toggleTrackArm: vi.fn(),
      selectTrack: vi.fn(),
      enumerateFx: vi.fn(),
      getTrackFx: vi.fn(),
      getFxParams: vi.fn(),
      setFxParam: vi.fn(),
      addFx: vi.fn(),
      deleteFx: vi.fn(),
      getDirectory: vi.fn(),
      sendSampleToTrack: vi.fn(),
      isRefreshingFx: true,
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    // Should show Refreshing indicator
    await waitFor(() => {
      expect(screen.getByText(/Refreshing/)).toBeDefined();
    });

    // Button should be disabled
    const btn = screen.getByText(/Refreshing/);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls refreshFxCache when Refresh Plugin List is clicked', async () => {
    const mockRefreshFxCache = vi.fn();
    const mockOnEvent = vi.fn().mockReturnValue(vi.fn());
    (useReaper as ReturnType<typeof vi.fn>).mockReturnValue({
      connected: true,
      tracks: [],
      refreshTracks: vi.fn(),
      toggleTrackMute: vi.fn(),
      toggleTrackSolo: vi.fn(),
      toggleTrackArm: vi.fn(),
      selectTrack: vi.fn(),
      enumerateFx: vi.fn(),
      getTrackFx: vi.fn(),
      getFxParams: vi.fn(),
      setFxParam: vi.fn(),
      addFx: vi.fn(),
      deleteFx: vi.fn(),
      getDirectory: vi.fn(),
      sendSampleToTrack: vi.fn(),
      isRefreshingFx: false,
      refreshFxCache: mockRefreshFxCache,
      play: vi.fn(),
      stop: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Plugin List')).toBeDefined();
    });

    // Click the button
    fireEvent.click(screen.getByText('Refresh Plugin List'));

    expect(mockRefreshFxCache).toHaveBeenCalledTimes(1);
  });
});

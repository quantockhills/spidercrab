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
    record: vi.fn(),
    getTransportState: vi.fn().mockResolvedValue({playing: false, recording: false}),
    onEvent: mockOnEvent,
    updateTrack: vi.fn(),
    launchPlaytime: vi.fn(),
    checkPlaytimeAvailable: vi.fn(),
    getMatrix: vi.fn(),
    triggerSlot: vi.fn(),
    triggerScene: vi.fn(),
    sequencer: null,
    getSequencer: vi.fn(),
    toggleStep: vi.fn(),
    setStep: vi.fn(),
    seqClearAll: vi.fn(),
    seqSetLength: vi.fn(),
    seqSetBaseNote: vi.fn(),
    addTrack: vi.fn(),
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
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
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

  it('shows Sample Directories section with empty state', async () => {
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
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Sample Directories')).toBeDefined();
    });

    // Should show empty state message
    expect(screen.getByText(/No sample directories configured/i)).toBeDefined();

    // Should show Add Directory button
    expect(screen.getByText('+ Add Directory')).toBeDefined();
  });

  it('can add a sample directory path', async () => {
    localStorage.clear();
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
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('+ Add Directory')).toBeDefined();
    });

    // Click Add Directory to reveal input
    fireEvent.click(screen.getByText('+ Add Directory'));

    const input = screen.getByPlaceholderText('/path/to/samples');
    expect(input).toBeDefined();

    // Type a path
    fireEvent.change(input, { target: { value: '/home/user/samples' } });
    fireEvent.click(screen.getByText('Add'));

    // Should now show the path in the list
    await waitFor(() => {
      expect(screen.getByText(/\/home\/user\/samples/)).toBeDefined();
    });

    // Should persist to localStorage
    const stored = localStorage.getItem('sampleBrowserPaths');
    expect(stored).toBeDefined();
    if (stored) {
      const paths = JSON.parse(stored);
      expect(paths).toContain('/home/user/samples');
    }

    localStorage.clear();
  });

  it('can remove a sample directory path', async () => {
    localStorage.clear();
    // Seed localStorage with a path
    localStorage.setItem('sampleBrowserPaths', JSON.stringify(['/home/user/samples']));

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
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Sample Directories')).toBeDefined();
    });

    // Should show the seeded path
    expect(screen.getByText(/\/home\/user\/samples/)).toBeDefined();

    // Click the remove button
    const removeButton = screen.getByLabelText(/Remove/);
    fireEvent.click(removeButton);

    // Should no longer show the path
    await waitFor(() => {
      expect(screen.queryByText(/\/home\/user\/samples/)).toBeNull();
    });

    // localStorage should be updated
    const stored = localStorage.getItem('sampleBrowserPaths');
    expect(stored).toBe('[]');

    localStorage.clear();
  });

  it('migrates old single-path format to new array format', async () => {
    localStorage.clear();
    // Simulate old format
    localStorage.setItem('sampleBrowserRootPath', '/legacy/path');

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
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Sample Directories')).toBeDefined();
    });

    // Should show the migrated path
    await waitFor(() => {
      expect(screen.getByText(/\/legacy\/path/)).toBeDefined();
    });

    // Old key should be removed
    expect(localStorage.getItem('sampleBrowserRootPath')).toBeNull();

    // New key should exist
    const stored = localStorage.getItem('sampleBrowserPaths');
    expect(stored).toBeDefined();
    if (stored) {
      const paths = JSON.parse(stored);
      expect(paths).toContain('/legacy/path');
    }

    localStorage.clear();
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
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
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

  it('shows Refresh Chain Cache button when fxChainPath is set', async () => {
    localStorage.setItem('fxChainPath', '/tmp/chains');

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
      refreshFxCache: vi.fn(),
      fxChainSearchCached: vi.fn().mockResolvedValue({ results: [], total: 0, offset: 0, limit: 16 }),
      fxChainRefreshCache: vi.fn().mockResolvedValue({ refreshed: true, count: 5 }),
      fxChainGetDirectory: vi.fn().mockResolvedValue({ chains: [], dirs: [] }),
      fxChainSave: vi.fn().mockResolvedValue(true),
      fxChainLoad: vi.fn().mockResolvedValue(true),
      fxChainGetInfo: vi.fn().mockResolvedValue(null),
      fxChainSearchRecursive: undefined,
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Chain Cache')).toBeDefined();
    });

    const btn = screen.getByText('Refresh Chain Cache') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    localStorage.removeItem('fxChainPath');
  });

  it('disables Refresh Chain Cache button when fxChainPath is empty', async () => {
    localStorage.removeItem('fxChainPath');

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
      refreshFxCache: vi.fn(),
      fxChainSearchCached: vi.fn().mockResolvedValue({ results: [], total: 0, offset: 0, limit: 16 }),
      fxChainRefreshCache: vi.fn().mockResolvedValue({ refreshed: true, count: 5 }),
      fxChainGetDirectory: vi.fn().mockResolvedValue({ chains: [], dirs: [] }),
      fxChainSave: vi.fn().mockResolvedValue(true),
      fxChainLoad: vi.fn().mockResolvedValue(true),
      fxChainGetInfo: vi.fn().mockResolvedValue(null),
      fxChainSearchRecursive: undefined,
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Chain Cache')).toBeDefined();
    });

    const btn = screen.getByText('Refresh Chain Cache') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls fxChainRefreshCache when Refresh Chain Cache is clicked', async () => {
    localStorage.setItem('fxChainPath', '/tmp/chains');

    const mockRefreshChains = vi.fn().mockResolvedValue({ refreshed: true, count: 5 });
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
      refreshFxCache: vi.fn(),
      fxChainSearchCached: vi.fn().mockResolvedValue({ results: [], total: 0, offset: 0, limit: 16 }),
      fxChainRefreshCache: mockRefreshChains,
      fxChainGetDirectory: vi.fn().mockResolvedValue({ chains: [], dirs: [] }),
      fxChainSave: vi.fn().mockResolvedValue(true),
      fxChainLoad: vi.fn().mockResolvedValue(true),
      fxChainGetInfo: vi.fn().mockResolvedValue(null),
      fxChainSearchRecursive: undefined,
      play: vi.fn(),
      stop: vi.fn(),
      record: vi.fn(),
      getTransportState: vi.fn(),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      launchPlaytime: vi.fn(),
      checkPlaytimeAvailable: vi.fn(),
      getMatrix: vi.fn(),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
      sequencer: null,
      getSequencer: vi.fn(),
      toggleStep: vi.fn(),
      setStep: vi.fn(),
      seqClearAll: vi.fn(),
      seqSetLength: vi.fn(),
      seqSetBaseNote: vi.fn(),
      addTrack: vi.fn(),
    });

    render(<App />);

    // Navigate to Settings tab
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Chain Cache')).toBeDefined();
    });

    // Click the button
    fireEvent.click(screen.getByText('Refresh Chain Cache'));

    expect(mockRefreshChains).toHaveBeenCalledWith('/tmp/chains');

    localStorage.removeItem('fxChainPath');
  });
});

// ── Drag-drop: edge-reached tab switch (Issue #74) ──

describe('App — Drag edge-reached tab switch', () => {
  it('renders DragProvider and DragOverlay without crashing', async () => {
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
      getFxParams: vi.fn().mockResolvedValue({params: [], total: 0, offset: 0, limit: 32}),
      setFxParam: vi.fn(),
      addFx: vi.fn(),
      deleteFx: vi.fn(),
      getDirectory: vi.fn().mockResolvedValue({entries: []}),
      sendSampleToTrack: vi.fn(),
      sendToSlot: vi.fn(),
      isRefreshingFx: false,
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      getTransportState: vi.fn().mockResolvedValue({playing: false, recording: false}),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      matrix: null,
      getMatrix: vi.fn().mockResolvedValue(null),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
    });

    const { container } = render(<App />);

    // App should render without crashing
    expect(container.textContent).toContain('Utpaladeva');
  });
});
  it('renders SessionView content when Playtime tab is selected with matrix data', async () => {
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
      getFxParams: vi.fn().mockResolvedValue({params: [], total: 0, offset: 0, limit: 32}),
      setFxParam: vi.fn(),
      addFx: vi.fn(),
      deleteFx: vi.fn(),
      getDirectory: vi.fn().mockResolvedValue({entries: []}),
      sendSampleToTrack: vi.fn(),
      sendToSlot: vi.fn(),
      isRefreshingFx: false,
      refreshFxCache: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      getTransportState: vi.fn().mockResolvedValue({playing: false, recording: false}),
      onEvent: mockOnEvent,
      updateTrack: vi.fn(),
      matrix: { columns: 8, rows: 8, slots: [] },
      getMatrix: vi.fn().mockResolvedValue(null),
      triggerSlot: vi.fn(),
      triggerScene: vi.fn(),
    });

    render(<App />);

    // Navigate to Playtime tab
    fireEvent.click(screen.getByText('Playtime'));

    await waitFor(() => {
      expect(screen.getByText('Session View')).toBeDefined();
    });
  });

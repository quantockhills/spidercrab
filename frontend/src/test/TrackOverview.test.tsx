import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackOverview } from '../components/TrackOverview';
import { volumeToDb } from '../utils/volume';
import type { Track, FxInfo } from '../hooks/useReaper';


// ── Mock data ────────────────────────────────────────────────

const mockTracks: Track[] = [
  { index: 0, name: 'Kick', trackNumber: 1, selected: true, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 },
  { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7, pan: 0.3 },
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

  // Default mocks for inline drawer props (Issue #94)
  const getFxParams = vi.fn().mockResolvedValue({ params: [], total: 0, offset: 0, limit: 8 });
  const setFxParam = vi.fn().mockResolvedValue({ success: true });

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
      getFxParams={getFxParams}
      setFxParam={setFxParam}
      {...props}
    />,
  );

  return { ...utils, getTrackFx, onSelectFx, onSelectTrack, onToggleMute, onToggleSolo, onToggleArm, onRefresh };
}

// ── Tests ────────────────────────────────────────────────────

describe('TrackOverview — transport bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows record button when onRecord is provided', () => {
    renderTrackOverview({ onPlay: vi.fn(), onStop: vi.fn(), onRecord: vi.fn() });
    expect(screen.getByTestId('transport-record')).toBeDefined();
  });

  it('does not show record button when onRecord is not provided', () => {
    renderTrackOverview({ onPlay: vi.fn(), onStop: vi.fn() });
    expect(screen.queryByTestId('transport-record')).toBeNull();
  });

  it('calls onRecord and updates isRecording state on record click', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onStop = vi.fn().mockResolvedValue(true);
    const onRecord = vi.fn().mockResolvedValue(true);
    const onGetTransportState = vi.fn().mockResolvedValue({ playing: false, recording: true });
    renderTrackOverview({ onPlay, onStop, onRecord, onGetTransportState });

    fireEvent.click(screen.getByTestId('transport-record'));

    await waitFor(() => {
      expect(onRecord).toHaveBeenCalledOnce();
    });
    expect(onGetTransportState).toHaveBeenCalledOnce();

    // Should show recording status
    await waitFor(() => {
      expect(screen.getByText('Recording')).toBeDefined();
    });
  });

  it('shows recording status when recording is active', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onStop = vi.fn().mockResolvedValue(true);
    const onRecord = vi.fn().mockResolvedValue(true);
    const onGetTransportState = vi.fn().mockResolvedValue({ playing: false, recording: true });
    renderTrackOverview({ onPlay, onStop, onRecord, onGetTransportState });

    fireEvent.click(screen.getByTestId('transport-record'));

    await waitFor(() => {
      expect(screen.getByText('Recording')).toBeDefined();
    });

    // Record button should have active styling
    const recordBtn = screen.getByTestId('transport-record');
    expect(recordBtn.className).toContain('accent-red');
  });

  it('does not update state when onRecord fails', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onStop = vi.fn().mockResolvedValue(true);
    const onRecord = vi.fn().mockResolvedValue(false);
    const onGetTransportState = vi.fn();
    renderTrackOverview({ onPlay, onStop, onRecord, onGetTransportState });

    fireEvent.click(screen.getByTestId('transport-record'));

    await waitFor(() => {
      expect(onRecord).toHaveBeenCalledOnce();
    });
    // Should NOT call getTransportState when record fails
    expect(onGetTransportState).not.toHaveBeenCalled();

    // Status should remain Stopped
    expect(screen.getByText('Stopped')).toBeDefined();
  });
});

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

  // ── Drag-and-drop FX reorder tests (Issue #89) ──

  it('FX cards are draggable', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // FX cards should have draggable attribute
    const reaeqCard = screen.getByText('ReaEQ').closest('button');
    expect(reaeqCard).not.toBeNull();
    expect(reaeqCard!.getAttribute('draggable')).toBe('true');
  });

  it('shows visual feedback on drag start (increased opacity)', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;

    // Simulate drag start
    fireEvent.dragStart(reaeqCard, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: '',
      },
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // After drag start, the card should have opacity-40 class
    await waitFor(() => {
      expect(reaeqCard.className).toContain('opacity-40');
    });
  });

  it('calls onReorderFx when dropping FX card on another position', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
      expect(screen.getByText('ReaComp')).toBeDefined();
    });

    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;
    const reacompCard = screen.getByText('ReaComp').closest('button')!;

    // Start dragging ReaEQ
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(reaeqCard, {
      dataTransfer,
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Drag over ReaComp (right half — insert after it, i.e., index 2)
    const rect = { left: 0, top: 0, width: 100, height: 50 };
    Object.defineProperty(reacompCard, 'getBoundingClientRect', {
      value: () => rect,
    });

    fireEvent.dragOver(reacompCard, {
      dataTransfer,
      clientX: 80, // right half → insert after
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Drop on ReaComp
    fireEvent.drop(reacompCard, {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Verify reorder was called with correct indices
    await waitFor(() => {
      expect(onReorderFx).toHaveBeenCalledOnce();
      // trackIdx=0, fromIndex=0 (ReaEQ), toIndex=2 (after ReaComp)
      expect(onReorderFx).toHaveBeenCalledWith(0, 0, 2);
    });
  });

  it('does not call onReorderFx when dropping on same position (index falls back to fx.index)', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };

    // Start dragging ReaEQ
    fireEvent.dragStart(reaeqCard, {
      dataTransfer,
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Drop on the same card without a dragOver -
    // dropTargetRef.current is null, so targetDropIndex falls back to fx.index
    // which equals dragData.fxIdx → no-op
    fireEvent.drop(reaeqCard, {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // onReorderFx should NOT have been called (same position)
    await waitFor(() => {
      expect(onReorderFx).not.toHaveBeenCalled();
    });
  });

  it('shows empty drop zone at end of FX list when dragging', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Start dragging an FX card first (end drop zone only appears during drag)
    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;
    fireEvent.dragStart(reaeqCard, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: '',
      },
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Now there should be a drop zone at the end of FX cards with a '+' element
    const plusZones = screen.getAllByText('+');
    expect(plusZones.length).toBeGreaterThanOrEqual(1);

    // End drag to clean up
    fireEvent.dragEnd(reaeqCard, {} as unknown as React.DragEvent<HTMLButtonElement>);
  });

  it('calls onReorderFx when dropping on end drop zone', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };

    // Start dragging ReaEQ
    fireEvent.dragStart(reaeqCard, {
      dataTransfer,
    } as unknown as React.DragEvent<HTMLButtonElement>);

    // Find the end drop zone and drop on it
    const plusZones = screen.getAllByText('+');
    const endZone = plusZones[0].closest('div')!;

    fireEvent.dragOver(endZone, {
      dataTransfer,
    } as unknown as React.DragEvent<HTMLDivElement>);

    fireEvent.drop(endZone, {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.DragEvent<HTMLDivElement>);

    // Track 0 has 2 FX (ReaEQ at 0, ReaComp at 1), so dropping at end = toIndex 2
    await waitFor(() => {
      expect(onReorderFx).toHaveBeenCalledOnce();
      expect(onReorderFx).toHaveBeenCalledWith(0, 0, 2);
    });
  });

  it('clears drag state on drag end', async () => {
    const onReorderFx = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onReorderFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    const reaeqCard = screen.getByText('ReaEQ').closest('button')!;

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
    };

    // Start dragging
    fireEvent.dragStart(reaeqCard, {
      dataTransfer,
    } as unknown as React.DragEvent<HTMLButtonElement>);
    expect(reaeqCard.className).toContain('opacity-40');

    // End drag
    fireEvent.dragEnd(reaeqCard, {} as unknown as React.DragEvent<HTMLButtonElement>);

    // After drag end, opacity class should be cleared
    await waitFor(() => {
      expect(reaeqCard.className).not.toContain('opacity-40');
    });
  });

  it('opens inline drawer when FX card is tapped (Issue #94)', async () => {
    // FX cards now open inline drawer instead of calling onSelectFx
    const { onSelectFx } = renderTrackOverview();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Click the ReaEQ card — should open inline drawer
    fireEvent.click(screen.getByText('ReaEQ'));

    // Drawer shows a close button (✕) which is unique to the drawer
    await waitFor(() => {
      expect(screen.getByLabelText('Close drawer')).toBeDefined();
    });

    // onSelectFx should NOT have been called (no navigation away)
    expect(onSelectFx).not.toHaveBeenCalled();
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

  // ── volumeToDb unit tests (Issue #85) ──

  describe('volumeToDb', () => {
    it('returns "0.0dB" for volume 1.0', () => {
      expect(volumeToDb(1.0)).toBe('0.0dB');
    });

    it('returns "-∞" for volume 0', () => {
      expect(volumeToDb(0)).toBe('-∞');
    });

    it('returns "-∞" for negative volume', () => {
      expect(volumeToDb(-1)).toBe('-∞');
    });

    it('returns "-6.0dB" for volume 0.5', () => {
      expect(volumeToDb(0.5)).toBe('-6.0dB');
    });

    it('returns "-12.0dB" for volume 0.25', () => {
      expect(volumeToDb(0.25)).toBe('-12.0dB');
    });

    it('returns "-3.0dB" for volume 0.7079 (approx -3dB)', () => {
      // 20*log10(0.7079) ≈ -3.0
      expect(volumeToDb(0.7079)).toBe('-3.0dB');
    });

    it('rounds to one decimal place', () => {
      // 20*log10(0.8) = -1.938... should be '-1.9dB'
      expect(volumeToDb(0.8)).toBe('-1.9dB');
    });
  });

  // ── Volume slider integration tests (Issue #85) ──

  it('updates dB label when volume slider is changed (optimistic local state)', async () => {
    // Simulate a parent component that maintains tracks state (like App.tsx)
    function TestHarness() {
      const [testTracks, setTestTracks] = useState<Track[]>(mockTracks);

      const handleVolumeChange = (index: number, volume: number) => {
        setTestTracks((prev) =>
          prev.map((t) => (t.index === index ? { ...t, volume } : t)),
        );
      };

      return (
        <TrackOverview
          tracks={testTracks}
          selectedTrack={0}
          onSelectTrack={vi.fn()}
          onToggleMute={vi.fn()}
          onToggleSolo={vi.fn()}
          onToggleArm={vi.fn()}
          onVolumeChange={handleVolumeChange}
          onRefresh={vi.fn()}
        />
      );
    }

    render(<TestHarness />);

    // Track 0 has volume 0.8, should show "-1.9dB"
    expect(screen.getByText('-1.9dB')).toBeDefined();

    // Change volume of track 0 to 0.5
    const sliders = screen.getAllByTestId('track-volume-slider');
    fireEvent.change(sliders[0], { target: { value: '0.5' } });

    // dB label should now show "-6.0dB"
    await waitFor(() => {
      expect(screen.getByText('-6.0dB')).toBeDefined();
    });
  });

  it('updates pan label when pan slider is changed (optimistic local state)', async () => {
    function TestHarness() {
      const [testTracks, setTestTracks] = useState<Track[]>(mockTracks);

      const handlePanChange = (index: number, pan: number) => {
        setTestTracks((prev) =>
          prev.map((t) => (t.index === index ? { ...t, pan } : t)),
        );
      };

      return (
        <TrackOverview
          tracks={testTracks}
          selectedTrack={0}
          onSelectTrack={vi.fn()}
          onToggleMute={vi.fn()}
          onToggleSolo={vi.fn()}
          onToggleArm={vi.fn()}
          onPanChange={handlePanChange}
          onRefresh={vi.fn()}
        />
      );
    }

    render(<TestHarness />);

    // Track 0 has pan=0, should show "C"
    expect(screen.getByText('C')).toBeDefined();

    // Change pan of track 0 to -0.5
    const panSliders = screen.getAllByTestId('track-pan-slider');
    fireEvent.change(panSliders[0], { target: { value: '-0.5' } });

    // Pan label should now show "L 50%"
    await waitFor(() => {
      expect(screen.getByText('L 50%')).toBeDefined();
    });
  });

  // ── Volume slider tests (Issue #66) ──

  function getSliders() {
    return screen.getAllByTestId('track-volume-slider');
  }

  it('shows VolumeBar reflecting track volume', () => {
    renderTrackOverview();

    // Each track row should have a volume slider element
    const sliders = getSliders();
    expect(sliders).toHaveLength(2); // 2 tracks

    // Track 0 has volume 0.8, Track 1 has volume 0.7
    expect((sliders[0] as HTMLInputElement).value).toBe('0.8');
    expect((sliders[1] as HTMLInputElement).value).toBe('0.7');
  });

  it('calls onVolumeChange when volume slider is changed', () => {
    const onVolumeChange = vi.fn();
    renderTrackOverview({ onVolumeChange });

    const sliders = getSliders();
    expect(sliders).toHaveLength(2);

    // Change volume of track 0 to 0.5
    fireEvent.change(sliders[0], { target: { value: '0.5' } });

    expect(onVolumeChange).toHaveBeenCalledOnce();
    expect(onVolumeChange).toHaveBeenCalledWith(0, 0.5);
  });

  it('calls onVolumeChange with correct track index for each slider', () => {
    const onVolumeChange = vi.fn();
    renderTrackOverview({ onVolumeChange });

    const sliders = getSliders();

    // Change volume of track 1 to 0.2
    fireEvent.change(sliders[1], { target: { value: '0.2' } });

    expect(onVolumeChange).toHaveBeenCalledOnce();
    expect(onVolumeChange).toHaveBeenCalledWith(1, 0.2);
  });

  it('volume slider has correct attributes (min=0, max=1, step=0.01)', () => {
    renderTrackOverview();

    const slider = getSliders()[0] as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
    expect(slider.step).toBe('0.01');
  });

  it('does not crash when onVolumeChange is not provided', () => {
    // onVolumeChange is optional — should not crash if omitted
    renderTrackOverview();

    const sliders = getSliders();
    expect(sliders).toHaveLength(2);

    // Change should not throw even without callback
    expect(() => {
      fireEvent.change(sliders[0], { target: { value: '0.3' } });
    }).not.toThrow();
  });

  // ── Pan slider tests (Issue #53) ──

  it('renders PanBar for each track', () => {
    renderTrackOverview();

    const panSliders = screen.getAllByTestId('track-pan-slider');
    expect(panSliders).toHaveLength(2);
  });

  it('displays correct pan values from track data', () => {
    renderTrackOverview();

    // Track 0: pan=0 (center)
    const panSliders = screen.getAllByTestId('track-pan-slider') as HTMLInputElement[];
    expect(panSliders[0].value).toBe('0');

    // Track 1: pan=0.3 (right)
    expect(panSliders[1].value).toBe('0.3');
  });

  it('shows "C" label for center pan (value 0)', () => {
    renderTrackOverview();

    // Track 0 has pan=0, should show "C"
    const panLabels = screen.getAllByTestId('pan-label');
    expect(panLabels[0].textContent).toBe('C');
  });

  it('shows "R" label for right pan values', () => {
    renderTrackOverview();

    // Track 1 has pan=0.3, should show "R 30%"
    const panLabels = screen.getAllByTestId('pan-label');
    expect(panLabels[1].textContent).toBe('R 30%');
  });

  it('shows "L" label for left pan values', () => {
    // Override with a left-pan track
    const leftTracks: Track[] = [
      { index: 0, name: 'Bass', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: -0.5 },
    ];
    render(
      <TrackOverview
        tracks={leftTracks}
        selectedTrack={0}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const panLabels = screen.getAllByTestId('pan-label');
    expect(panLabels[0].textContent).toBe('L 50%');
  });

  it('shows "C" for near-center pan values (within ±0.05)', () => {
    const nearCenterTracks: Track[] = [
      { index: 0, name: 'Test', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0.03 },
    ];
    render(
      <TrackOverview
        tracks={nearCenterTracks}
        selectedTrack={0}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const panLabels = screen.getAllByTestId('pan-label');
    expect(panLabels[0].textContent).toBe('C');
  });

  it('shows exactly 100% for extreme hard-left pan', () => {
    const hardLeftTracks: Track[] = [
      { index: 0, name: 'Test', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: -1 },
    ];
    render(
      <TrackOverview
        tracks={hardLeftTracks}
        selectedTrack={0}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const panLabels = screen.getAllByTestId('pan-label');
    expect(panLabels[0].textContent).toBe('L 100%');
  });

  it('calls onPanChange when pan slider is changed', () => {
    const onPanChange = vi.fn();
    renderTrackOverview({ onPanChange });

    const panSliders = screen.getAllByTestId('track-pan-slider');
    expect(panSliders).toHaveLength(2);

    // Change pan of track 0 to 0.5
    fireEvent.change(panSliders[0], { target: { value: '0.5' } });

    expect(onPanChange).toHaveBeenCalledOnce();
    expect(onPanChange).toHaveBeenCalledWith(0, 0.5);
  });

  it('calls onPanChange with correct track index for each slider', () => {
    const onPanChange = vi.fn();
    renderTrackOverview({ onPanChange });

    const panSliders = screen.getAllByTestId('track-pan-slider');

    // Change pan of track 1 to -0.8
    fireEvent.change(panSliders[1], { target: { value: '-0.8' } });

    expect(onPanChange).toHaveBeenCalledOnce();
    expect(onPanChange).toHaveBeenCalledWith(1, -0.8);
  });

  it('does not crash when onPanChange is not provided', () => {
    renderTrackOverview();

    const panSliders = screen.getAllByTestId('track-pan-slider');
    expect(panSliders).toHaveLength(2);

    expect(() => {
      fireEvent.change(panSliders[0], { target: { value: '-0.2' } });
    }).not.toThrow();
  });

  it('pan slider has correct attributes (min=-1, max=1, step=0.01)', () => {
    renderTrackOverview();

    const slider = screen.getAllByTestId('track-pan-slider')[0] as HTMLInputElement;
    expect(slider.min).toBe('-1');
    expect(slider.max).toBe('1');
    expect(slider.step).toBe('0.01');
  });

  // ── Add Track button tests (Issue #67) ──

  it('renders Add Track button in header when onAddTrack is provided', () => {
    const onAddTrack = vi.fn();
    renderTrackOverview({ onAddTrack });

    const addBtn = screen.getByTestId('add-track-button');
    expect(addBtn).toBeDefined();
    expect(addBtn.textContent).toBe('+ Track');
  });

  it('calls onAddTrack when Add Track button is clicked', () => {
    const onAddTrack = vi.fn().mockResolvedValue(true);
    renderTrackOverview({ onAddTrack });

    fireEvent.click(screen.getByTestId('add-track-button'));
    expect(onAddTrack).toHaveBeenCalledOnce();
  });

  it('does not render Add Track button when onAddTrack is not provided', () => {
    renderTrackOverview();
    expect(screen.queryByTestId('add-track-button')).toBeNull();
  });

  it('renders Add Track button on empty state when onAddTrack is provided', () => {
    const onAddTrack = vi.fn();
    render(
      <TrackOverview
        tracks={[]}
        selectedTrack={null}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onAddTrack={onAddTrack}
        onRefresh={vi.fn()}
      />,
    );

    const addBtn = screen.getByTestId('add-track-empty');
    expect(addBtn).toBeDefined();
    expect(addBtn.textContent).toBe('+ Add Track');
  });

  it('calls onAddTrack from empty state button', () => {
    const onAddTrack = vi.fn().mockResolvedValue(true);
    render(
      <TrackOverview
        tracks={[]}
        selectedTrack={null}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onAddTrack={onAddTrack}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-track-empty'));
    expect(onAddTrack).toHaveBeenCalledOnce();
  });

  it('does not render Add Track button on empty state when onAddTrack is omitted', () => {
    render(
      <TrackOverview
        tracks={[]}
        selectedTrack={null}
        onSelectTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onToggleArm={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('add-track-empty')).toBeNull();
  });

  // ── FX open button tests (Issue #86) ──

  describe('FX open button', () => {
    it('renders FX button on each track when onOpenFx is provided', () => {
      const onOpenFx = vi.fn();
      renderTrackOverview({ onOpenFx });

      const fxButtons = screen.getAllByTestId('open-fx-button');
      expect(fxButtons).toHaveLength(2); // 2 mock tracks
    });

    it('does not render FX button when onOpenFx is not provided', () => {
      renderTrackOverview();
      expect(screen.queryByTestId('open-fx-button')).toBeNull();
    });

    it('calls onOpenFx with track index when FX button is clicked', () => {
      const onOpenFx = vi.fn();
      renderTrackOverview({ onOpenFx });

      const fxButtons = screen.getAllByTestId('open-fx-button');
      fireEvent.click(fxButtons[1]); // Click FX button on track 1 (Snare)

      expect(onOpenFx).toHaveBeenCalledOnce();
      expect(onOpenFx).toHaveBeenCalledWith(1);
    });

    it('stops click propagation so track selection does not trigger', () => {
      const onOpenFx = vi.fn();
      const onSelectTrack = vi.fn();
      renderTrackOverview({ onOpenFx, onSelectTrack });

      const fxButton = screen.getAllByTestId('open-fx-button')[0];
      fireEvent.click(fxButton);

      // Track selection should NOT have been called
      expect(onSelectTrack).not.toHaveBeenCalled();
      // FX callback should have been called
      expect(onOpenFx).toHaveBeenCalledOnce();
    });
  });

  // ── Original test continues below ──

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

// ── Inline FX drawer tests (Issue #94) ────────────────────────

describe('TrackOverview — Inline FX drawer', () => {
  const mockParams: import('../hooks/useReaper').FxParam[] = Array.from({ length: 12 }, (_, i) => ({
    index: i,
    name: `Param ${i}`,
    value: 0.5 + i * 0.05,
    min: 0,
    max: 1,
    mid: 0.5,
    formatted: `${Math.round((0.5 + i * 0.05) * 100)}%`,
  }));

  const mockPresetInfo: import('../hooks/useReaper').FxPresetInfo = {
    presetIndex: 2,
    presetName: 'Hall Reverb',
    numPresets: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderWithInlineDrawer(props: Partial<Parameters<typeof TrackOverview>[0]> = {}) {
    const getFxParams = vi.fn().mockImplementation(
      async (_trackIdx: number, _fxIdx: number, offset: number = 0, limit: number = 8) => {
        const sliced = mockParams.slice(offset, offset + limit);
        return {
          params: sliced,
          total: mockParams.length,
          offset,
          limit,
        };
      },
    );
    const setFxParam = vi.fn().mockResolvedValue({ success: true });
    const getFxPreset = vi.fn().mockResolvedValue(mockPresetInfo);
    const setFxPreset = vi.fn().mockImplementation(
      async (_trackIdx: number, _fxIdx: number, presetIdx: number) => ({
        presetIndex: presetIdx,
        presetName: `Preset ${presetIdx}`,
        numPresets: 5,
      }),
    );
    const getAllFxPresetNames = vi.fn().mockResolvedValue({
      presetNames: ['Room', 'Hall', 'Plate', 'Spring', 'Reverse'],
      currentIndex: 2,
    });

    const utils = renderTrackOverview({
      getFxParams,
      setFxParam,
      getFxPreset,
      setFxPreset,
      getAllFxPresetNames,
      ...props,
    });

    return { ...utils, getFxParams, setFxParam, getFxPreset, setFxPreset, getAllFxPresetNames };
  }

  it('opens inline drawer when FX card is tapped (instead of navigating away)', async () => {
    const onSelectFx = vi.fn();
    renderWithInlineDrawer({ onSelectFx });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Tap ReaEQ card
    fireEvent.click(screen.getByText('ReaEQ'));

    // Drawer should open — look for close button which is unique to drawer
    await waitFor(() => {
      expect(screen.getByLabelText('Close drawer')).toBeDefined();
    });

    // onSelectFx should NOT have been called (no navigation away)
    expect(onSelectFx).not.toHaveBeenCalled();
  });

  it('collapses inline drawer when same FX card is tapped again', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Tap to open — use getAllByText and take first (the FX card, not drawer header)
    fireEvent.click(screen.getAllByText('ReaEQ')[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('Close drawer')).toBeDefined();
    });

    // Tap same card again to close — use first ReaEQ element (FX card)
    fireEvent.click(screen.getAllByText('ReaEQ')[0]);

    // Drawer should be closed — close button should disappear
    await waitFor(() => {
      expect(screen.queryByLabelText('Close drawer')).toBeNull();
    });
  });

  it('closes current drawer and opens new one when different FX is tapped', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Open ReaEQ drawer
    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Hall Reverb')).toBeDefined();
    });

    // Tap ReaComp (different FX)
    fireEvent.click(screen.getByText('ReaComp'));

    // Previous drawer's preset name should be gone
    await waitFor(() => {
      expect(screen.queryByText('Hall Reverb')).toBeNull();
    });
  });

  it('shows preset info with current preset name and navigation buttons', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Open ReaEQ drawer
    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Hall Reverb')).toBeDefined();
    });

    // Should have preset navigation buttons
    const prevBtn = screen.getByLabelText('Previous preset');
    const nextBtn = screen.getByLabelText('Next preset');
    expect(prevBtn).toBeDefined();
    expect(nextBtn).toBeDefined();
  });

  it('cycles presets with Next/Prev buttons', async () => {
    const { setFxPreset } = renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Hall Reverb')).toBeDefined();
    });

    // Click Next
    fireEvent.click(screen.getByLabelText('Next preset'));
    await waitFor(() => {
      expect(setFxPreset).toHaveBeenCalled();
    });
    const lastCallArgs = setFxPreset.mock.lastCall;
    expect(lastCallArgs[2]).toBe(3); // Next from index 2 should go to 3
  });

  it('shows 8 params per page with page indicator', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    // Wait for params to load
    await waitFor(() => {
      expect(screen.getByText('Param 0')).toBeDefined();
      expect(screen.getByText('Param 7')).toBeDefined();
    });

    // Page indicator: 1–8 of 12
    expect(screen.getByText('1–8 of 12')).toBeDefined();

    // Param 8 should NOT be visible (it's on page 2)
    expect(screen.queryByText('Param 8')).toBeNull();
  });

  it('paginates to next and previous page', async () => {
    const { getFxParams } = renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Param 0')).toBeDefined();
      expect(screen.getByText('1–8 of 12')).toBeDefined();
    });

    // Click Next
    fireEvent.click(screen.getByText('Next →'));
    await waitFor(() => {
      expect(getFxParams).toHaveBeenCalledWith(0, 0, 8, 8);
    });
  });

  it('hides pagination when 8 or fewer params', async () => {
    const fewMockParams: import('../hooks/useReaper').FxParam[] = Array.from({ length: 5 }, (_, i) => ({
      index: i,
      name: `FewParam ${i}`,
      value: 0.5,
      min: 0,
      max: 1,
      mid: 0.5,
    }));

    const getFxParams = vi.fn().mockResolvedValue({
      params: fewMockParams,
      total: fewMockParams.length,
      offset: 0,
      limit: 8,
    });

    renderTrackOverview({
      getFxParams,
      setFxParam: vi.fn().mockResolvedValue({ success: true }),
    });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('FewParam 0')).toBeDefined();
    });

    // Pagination buttons should not appear
    expect(screen.queryByText('Next →')).toBeNull();
    expect(screen.queryByText('← Prev')).toBeNull();
  });

  it('pins and unpins params with pin icon toggle', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Param 0')).toBeDefined();
    });

    // Find the pin buttons — there should be at least 8 (one per param)
    const pinButtons = screen.getAllByLabelText('Pin parameter');
    expect(pinButtons.length).toBeGreaterThanOrEqual(8);

    // Pin Param 0 (first pin button)
    fireEvent.click(pinButtons[0]);

    // Now the first pin button should show 'Unpin parameter'
    await waitFor(() => {
      const unpinButtons = screen.getAllByLabelText('Unpin parameter');
      expect(unpinButtons.length).toBeGreaterThanOrEqual(1);
    });

    // Pinned section should be visible
    expect(screen.getByText('Pinned')).toBeDefined();

    // Unpin by clicking first unpin button
    const unpinButtons = screen.getAllByLabelText('Unpin parameter');
    fireEvent.click(unpinButtons[0]);

    await waitFor(() => {
      // After unpinning, all buttons should be back to 'Pin parameter'
      expect(screen.queryAllByLabelText('Unpin parameter').length).toBe(0);
    });
  });

  it('persists pinned params to localStorage', async () => {
    renderWithInlineDrawer();

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Param 0')).toBeDefined();
    });

    // Pin a param
    const pinBtns = screen.getAllByLabelText('Pin parameter');
    fireEvent.click(pinBtns[1]); // Pin Param 1

    // localStorage should have the pin data
    const stored = localStorage.getItem('fx:pinned:0:0');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain(1);
  });

  it('hides preset section when no presets available', async () => {
    const getFxPreset = vi.fn().mockResolvedValue(null);
    renderTrackOverview({
      getFxParams: vi.fn().mockImplementation(
        async (_trackIdx: number, _fxIdx: number, offset: number = 0, limit: number = 8) => ({
          params: mockParams.slice(offset, offset + limit),
          total: mockParams.length,
          offset,
          limit,
        }),
      ),
      setFxParam: vi.fn().mockResolvedValue({ success: true }),
      getFxPreset,
    });

    await waitFor(() => {
      expect(screen.getByText('ReaEQ')).toBeDefined();
    });

    // Wait for drawer to open with params
    fireEvent.click(screen.getByText('ReaEQ'));

    await waitFor(() => {
      expect(screen.getByText('Param 0')).toBeDefined();
    });

    // Should show 'No presets' instead of preset navigation
    expect(screen.getByText(/No presets/i)).toBeDefined();
  });
});
// ── Inline FX Search tests (Issue #102) ──────────────────────

describe('TrackOverview — Inline FX Search', () => {
  const mockEnumerateFx: EnumeratedFx[] = [
    { index: 0, name: 'VST3: ReaComp', ident: 'reacomp', format: 'VST3' },
    { index: 1, name: 'VST3: ReaEQ', ident: 'reaeq', format: 'VST3' },
    { index: 2, name: 'VST3: ReaVerbate', ident: 'reaverbate', format: 'VST3' },
    { index: 3, name: 'CLAP: Serum', ident: 'serum', format: 'CLAP' },
    { index: 4, name: 'VST3: ValhallaRoom', ident: 'valhallaroom', format: 'VST3' },
    { index: 5, name: 'JS: Delay (JSFX)', ident: 'js_delay', format: 'JSFX' },
    { index: 6, name: 'VST3: Pro-Q 3', ident: 'proq3', format: 'VST3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWithInlineSearch(props: Partial<Parameters<typeof TrackOverview>[0]> = {}) {
    const enumerateFx = vi.fn().mockResolvedValue(mockEnumerateFx);
    const addFx = vi.fn().mockResolvedValue(0);

    const utils = renderTrackOverview({
      enumerateFx,
      addFx,
      ...props,
    });

    return { ...utils, enumerateFx, addFx };
  }

  it('shows "Add FX" button at end of FX grid when enumerateFx and addFx are provided', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    // Should show the Add FX button
    const addFxButtons = screen.getAllByTestId('inline-add-fx');
    expect(addFxButtons.length).toBeGreaterThanOrEqual(1);
    expect(addFxButtons[0].textContent).toContain('Add FX');
  });

  it('does not show Add FX button when enumerateFx and addFx are not provided', () => {
    renderTrackOverview();
    expect(screen.queryByTestId('inline-add-fx')).toBeNull();
  });

  // Helper: long-press the Add FX button and wait for search results to load
  async function longPressAddFx(trackIndex: number = 0) {
    const btn = screen.getAllByTestId('inline-add-fx')[trackIndex];
    fireEvent.pointerDown(btn);
    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-input')).toBeDefined();
    });
    // Wait for async enumerateFx to resolve and results to render
    await waitFor(() => {
      const results = screen.queryAllByTestId('inline-fx-result');
      expect(results.length).toBeGreaterThan(0);
    });
  }

  it('long-pressing Add FX button opens inline search bar and loads plugins', async () => {
    const { enumerateFx } = renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Should call enumerateFx
    expect(enumerateFx).toHaveBeenCalledOnce();

    // Results should show (all plugins)
    expect(screen.getAllByText('Serum').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ReaVerbate').length).toBeGreaterThanOrEqual(1);
  });

  it('filters results as user types in search bar', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Type 'comp'
    const input = screen.getByTestId('inline-fx-search-input');
    fireEvent.change(input, { target: { value: 'comp' } });

    // Wait for debounce (300ms) + filter — the search results should update
    await waitFor(() => {
      // Check search result text content directly via test-id
      const results = screen.queryAllByTestId('inline-fx-result');
      // Only ReaComp should be in search results (matches 'comp')
      const matchingNames = results.map(el => el.textContent).filter(Boolean);
      // Every result should include 'comp' (case-insensitive)
      const allMatch = matchingNames.every(name =>
        name!.toLowerCase().includes('comp')
      );
      expect(allMatch).toBe(true);
    });

    // Serum should NOT be in search results (doesn't match 'comp')
    const serumSearchResults = screen.queryAllByTestId('inline-fx-result').filter(
      (el) => el.textContent?.includes('Serum')
    );
    expect(serumSearchResults.length).toBe(0);
  });

  it('shows "No plugins found" when search has no matches', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Type something that won't match
    const input = screen.getByTestId('inline-fx-search-input');
    fireEvent.change(input, { target: { value: 'xyznonexistent' } });

    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-empty')).toBeDefined();
    });
  });

  it('tapping a search result calls addFx with correct track index and FX name', async () => {
    const { addFx } = renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Wait for search results to load and find Serum
    let serumResult: HTMLElement | undefined;
    await waitFor(() => {
      const results = screen.getAllByTestId('inline-fx-result');
      serumResult = results.find((el) => el.textContent?.includes('Serum'));
      expect(serumResult).toBeDefined();
    });
    fireEvent.click(serumResult!);

    await waitFor(() => {
      expect(addFx).toHaveBeenCalledOnce();
    });
    expect(addFx).toHaveBeenCalledWith(0, 'CLAP: Serum');
  });

  it('closes search bar and refreshes FX after adding an FX', async () => {
    const { addFx } = renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Wait for search results to load and find Serum
    let serumResult: HTMLElement | undefined;
    await waitFor(() => {
      const results = screen.getAllByTestId('inline-fx-result');
      serumResult = results.find((el) => el.textContent?.includes('Serum'));
      expect(serumResult).toBeDefined();
    });
    fireEvent.click(serumResult!);

    await waitFor(() => {
      expect(addFx).toHaveBeenCalledOnce();
    });

    // Search bar should close
    await waitFor(() => {
      expect(screen.queryByTestId('inline-fx-search-input')).toBeNull();
    });
  });

  it('closes search bar when close button is tapped (without adding)', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Tap close button
    fireEvent.click(screen.getByTestId('inline-fx-search-close'));

    // Search bar should close
    await waitFor(() => {
      expect(screen.queryByTestId('inline-fx-search-input')).toBeNull();
    });
  });

  it('closes search bar when tapping backdrop (without adding)', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Tap backdrop to close
    fireEvent.click(screen.getByTestId('inline-fx-search-backdrop'));

    // Search bar should close
    await waitFor(() => {
      expect(screen.queryByTestId('inline-fx-search-input')).toBeNull();
    });
  });

  it('shows loading state while enumerateFx is in progress', async () => {
    // Delayed enumerate
    const delayedEnumerate = vi.fn().mockImplementation(
      () => new Promise<EnumeratedFx[]>((resolve) => setTimeout(() => resolve(mockEnumerateFx), 100)),
    );

    renderWithInlineSearch({ enumerateFx: delayedEnumerate });

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    // Long-press Add FX button
    const btn = screen.getAllByTestId('inline-add-fx')[0];
    fireEvent.pointerDown(btn);

    // Wait for search to appear and show loading state (loading starts as true)
    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-loading')).toBeDefined();
    });

    // Wait for results — check for search result buttons
    await waitFor(() => {
      const results = screen.getAllByTestId('inline-fx-result');
      expect(results.length).toBeGreaterThan(0);
    });

    // Loading should be gone
    expect(screen.queryByTestId('inline-fx-search-loading')).toBeNull();
  });

  it('shows format badge next to each FX name in search results', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Wait for search results to have loaded
    await waitFor(() => {
      const results = screen.getAllByTestId('inline-fx-result');
      expect(results.length).toBeGreaterThan(0);
    });

    // Should have format badges
    const formatBadges = screen.getAllByTestId('inline-fx-format-badge');
    expect(formatBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('only opens one search at a time — opening for track 1 closes track 0 search', async () => {
    renderWithInlineSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    const addFxButtons = screen.getAllByTestId('inline-add-fx');

    // Long-press first Add FX button (track 0)
    fireEvent.pointerDown(addFxButtons[0]);
    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-input')).toBeDefined();
    });

    // Long-press second Add FX button (track 1)
    fireEvent.pointerDown(addFxButtons[1]);
    await waitFor(() => {
      // Only one search input should be visible at a time
      const searchInputs = screen.getAllByTestId('inline-fx-search-input');
      expect(searchInputs).toHaveLength(1);
    });
  });
});

// ── Inline FX Search Chain Integration tests (Issue #105) ──────

describe('TrackOverview — Inline FX Search — Chain Integration', () => {
  const mockEnumerateFx: EnumeratedFx[] = [
    { index: 0, name: 'VST3: ReaComp', ident: 'reacomp', format: 'VST3' },
    { index: 1, name: 'VST3: ReaEQ', ident: 'reaeq', format: 'VST3' },
  ];

  const mockChainResults: { filePath: string; name: string; size: number }[] = [
    { filePath: '/chains/Vocal Chain.RfxChain', name: 'Vocal Chain.RfxChain', size: 2048 },
    { filePath: '/chains/Master Bus.RfxChain', name: 'Master Bus.RfxChain', size: 4096 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWithChainSearch(props: Partial<Parameters<typeof TrackOverview>[0]> = {}) {
    const enumerateFx = vi.fn().mockResolvedValue(mockEnumerateFx);
    const addFx = vi.fn().mockResolvedValue(0);
    const searchChains = vi.fn().mockResolvedValue(mockChainResults);
    const loadChain = vi.fn().mockResolvedValue(true);

    const utils = renderTrackOverview({
      enumerateFx,
      addFx,
      searchChains,
      loadChain,
      ...props,
    });

    return { ...utils, enumerateFx, addFx, searchChains, loadChain };
  }

  // Helper: long-press the Add FX button and wait for search
  async function longPressAddFx(trackIndex: number = 0) {
    const btn = screen.getAllByTestId('inline-add-fx')[trackIndex];
    fireEvent.pointerDown(btn);
    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-input')).toBeDefined();
    });
    await waitFor(() => {
      const results = screen.queryAllByTestId('inline-fx-result');
      expect(results.length).toBeGreaterThan(0);
    });
  }

  it('calls both enumerateFx and searchChains when search is opened with searchChains prop', async () => {
    const { enumerateFx, searchChains } = renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Both should have been called
    expect(enumerateFx).toHaveBeenCalledOnce();
    expect(searchChains).toHaveBeenCalledOnce();
  });

  it('shows chain results with a 📦 icon in search results', async () => {
    renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Chain results should be visible with 📦 indicator
    await waitFor(() => {
      expect(screen.getByText('Vocal Chain')).toBeDefined();
      expect(screen.getByText('Master Bus')).toBeDefined();
    });

    // Chain results should have the chain-icon testid
    const chainIcons = screen.getAllByTestId('inline-fx-chain-icon');
    expect(chainIcons.length).toBe(2);

    // Regular FX results should NOT have the chain icon
    const fxResults = screen.getAllByTestId('inline-fx-result');
    const reacompBtn = fxResults.find(el => el.textContent?.includes('ReaComp'));
    expect(reacompBtn).toBeDefined();
    expect(reacompBtn!.querySelector('[data-testid="inline-fx-chain-icon"]')).toBeNull();
  });

  it('calls loadChain (not addFx) when a chain result is clicked', async () => {
    const { addFx, loadChain } = renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Wait for chain results to appear
    await waitFor(() => {
      expect(screen.getByText('Vocal Chain')).toBeDefined();
    });

    // Click the chain result
    const chainBtn = screen.getByText('Vocal Chain').closest('button');
    expect(chainBtn).not.toBeNull();
    fireEvent.click(chainBtn!);

    // loadChain should be called, not addFx
    await waitFor(() => {
      expect(loadChain).toHaveBeenCalledOnce();
    });
    expect(loadChain).toHaveBeenCalledWith(0, '/chains/Vocal Chain.RfxChain');
    expect(addFx).not.toHaveBeenCalled();
  });

  it('still calls addFx (not loadChain) when a regular FX result is clicked', async () => {
    const { addFx, loadChain } = renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Click a regular FX result (ReaComp)
    const fxBtn = screen.getAllByTestId('inline-fx-result').find(
      el => el.textContent?.includes('ReaComp')
    );
    expect(fxBtn).toBeDefined();
    fireEvent.click(fxBtn!);

    await waitFor(() => {
      expect(addFx).toHaveBeenCalledOnce();
    });
    expect(addFx).toHaveBeenCalledWith(0, 'VST3: ReaComp');
    expect(loadChain).not.toHaveBeenCalled();
  });

  it('filters both FX and chain results as user types', async () => {
    renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // Type 'vocal' — should filter chains but not affect FX
    const input = screen.getByTestId('inline-fx-search-input');
    fireEvent.change(input, { target: { value: 'vocal' } });

    await waitFor(() => {
      // Chain results should be filtered
      const results = screen.queryAllByTestId('inline-fx-result');
      // Only Vocal Chain should remain
      const chainResults = results.filter(r => r.querySelector('[data-testid="inline-fx-chain-icon"]'));
      expect(chainResults.length).toBe(1);
      expect(chainResults[0].textContent).toContain('Vocal Chain');
      // Regular FX results should be filtered out (none match 'vocal')
      const fxResults = results.filter(r => !r.querySelector('[data-testid="inline-fx-chain-icon"]'));
      expect(fxResults.length).toBe(0);
    });
  });

  it('shows no chain results when searchChains returns empty', async () => {
    const searchChains = vi.fn().mockResolvedValue([]);
    renderWithChainSearch({ searchChains });

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    // No chain icons should appear
    const chainIcons = screen.queryAllByTestId('inline-fx-chain-icon');
    expect(chainIcons.length).toBe(0);
  });

  it('does not call searchChains when prop is not provided', async () => {
    const searchChains = vi.fn();
    // Render without searchChains prop
    renderWithChainSearch({ searchChains: undefined });

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    // Override to test without searchChains — renderTrackOverview without it
    vi.clearAllMocks();
    const enumerateFx = vi.fn().mockResolvedValue(mockEnumerateFx);
    const addFx = vi.fn().mockResolvedValue(0);
    renderTrackOverview({ enumerateFx, addFx });

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    const btn = screen.getAllByTestId('inline-add-fx')[0];
    fireEvent.pointerDown(btn);
    await waitFor(() => {
      expect(screen.getByTestId('inline-fx-search-input')).toBeDefined();
    });

    // searchChains should not have been called (not provided)
    expect(searchChains).not.toHaveBeenCalled();
  });

  it('closes search after loading a chain (same as adding FX)', async () => {
    const { loadChain } = renderWithChainSearch();

    await waitFor(() => {
      expect(screen.getAllByText('ReaEQ').length).toBeGreaterThanOrEqual(1);
    });

    await longPressAddFx();

    await waitFor(() => {
      expect(screen.getByText('Vocal Chain')).toBeDefined();
    });

    // Click the chain result
    const chainBtn = screen.getByText('Vocal Chain').closest('button');
    expect(chainBtn).not.toBeNull();
    fireEvent.click(chainBtn!);

    await waitFor(() => {
      expect(loadChain).toHaveBeenCalledOnce();
    });

    // Search should close
    await waitFor(() => {
      expect(screen.queryByTestId('inline-fx-search-input')).toBeNull();
    });
  });
});

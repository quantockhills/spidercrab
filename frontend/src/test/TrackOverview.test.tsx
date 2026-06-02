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

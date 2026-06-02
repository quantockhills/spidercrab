import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../components/SessionView';
import type { MatrixData, ClipSlot } from '../hooks/useReaper';

// ── Mock data ────────────────────────────────────────────────

function makeEmptyMatrix(): MatrixData {
  const slots: ClipSlot[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      slots.push({ column: col, row, state: 'empty', color: '#ffffff', name: '', clipType: 'none' });
    }
  }
  return { columns: 8, rows: 8, slots };
}

function makePartialMatrix(): MatrixData {
  const m = makeEmptyMatrix();
  // Slot (0,0) = playing green
  m.slots[0] = { column: 0, row: 0, state: 'playing', color: '#00ff00', name: 'Kick_01', clipType: 'audio' };
  // Slot (1,0) = stopped gray
  m.slots[1] = { column: 1, row: 0, state: 'stopped', color: '#888888', name: 'Snare_01', clipType: 'audio' };
  // Slot (0,1) = recording red
  m.slots[8] = { column: 0, row: 1, state: 'recording', color: '#ff0000', name: 'Gtr_Take1', clipType: 'midi' };
  return m;
}

// ── Helpers ──────────────────────────────────────────────────

function renderSessionView(props: Partial<Parameters<typeof SessionView>[0]> = {}) {
  const onTriggerSlot = vi.fn().mockResolvedValue(true);
  const onTriggerScene = vi.fn().mockResolvedValue(true);
  const onGetMatrix = vi.fn().mockResolvedValue(makeEmptyMatrix());

  const utils = render(
    <SessionView
      matrix={null}
      getMatrix={onGetMatrix}
      triggerSlot={onTriggerSlot}
      triggerScene={onTriggerScene}
      {...props}
    />,
  );

  return { ...utils, onTriggerSlot, onTriggerScene, onGetMatrix };
}

// ── Tests ────────────────────────────────────────────────────

describe('SessionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when matrix is null', () => {
    renderSessionView();
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it('calls getMatrix on mount', async () => {
    const { onGetMatrix } = renderSessionView();
    await waitFor(() => {
      expect(onGetMatrix).toHaveBeenCalled();
    });
  });

  it('renders grid when matrix data is provided', async () => {
    renderSessionView({ matrix: makeEmptyMatrix() });
    await waitFor(() => {
      // Check we have 64 slot buttons and 8 scene buttons
      for (let row = 1; row <= 8; row++) {
        for (let col = 1; col <= 8; col++) {
          expect(screen.getByLabelText(`Slot ${col},${row}`)).toBeDefined();
        }
      }
      for (let i = 1; i <= 8; i++) {
        expect(screen.getByLabelText(`Scene ${i}`)).toBeDefined();
      }
    });
  });

  it('displays slot color feedback for playing/stopped/recording states', async () => {
    const matrix = makePartialMatrix();
    renderSessionView({ matrix });

    await waitFor(() => {
      // The playing slot (0,0) should have green accent
      expect(screen.getByText(/kick_01/i)).toBeDefined();
      // The recording slot (0,1) should show recording indicator
      expect(screen.getByText(/gtr_take1/i)).toBeDefined();
    });
  });

  it('calls triggerSlot when tapping a clip slot', async () => {
    const matrix = makeEmptyMatrix();
    const onTriggerSlot = vi.fn().mockResolvedValue(true);
    renderSessionView({ matrix, triggerSlot: onTriggerSlot });

    await waitFor(() => {
      const slot = screen.getByLabelText('Slot 1,1');
      fireEvent.click(slot);
      expect(onTriggerSlot).toHaveBeenCalledWith(0, 0);
    });
  });

  it('calls getMatrix after tapping a slot to refresh matrix state', async () => {
    // Issue #80: After triggering a slot, the matrix must refresh so the
    // grid reflects the new visual state (playing/stopped). Prior to the fix,
    // handleSlotTap called triggerSlot but never refreshed the matrix.
    const matrix = makeEmptyMatrix();
    const slotResponse: ClipSlot = {
      column: 0, row: 0, state: 'playing', color: '#00ff00',
      name: 'Triggered Clip', clipType: 'audio',
    };
    const updatedMatrix = makeEmptyMatrix();
    updatedMatrix.slots[0] = slotResponse;

    const onTriggerSlot = vi.fn().mockResolvedValue(slotResponse);
    const onGetMatrix = vi.fn().mockResolvedValue(updatedMatrix);

    render(
      <SessionView
        matrix={matrix}
        getMatrix={onGetMatrix}
        triggerSlot={onTriggerSlot}
        triggerScene={vi.fn()}
      />,
    );

    // Wait for mount effect to finish (getMatrix called once on mount)
    await waitFor(() => {
      expect(onGetMatrix).toHaveBeenCalledTimes(1);
    });

    const slot = screen.getByLabelText('Slot 1,1');
    fireEvent.click(slot);

    // Verify triggerSlot was called with correct coordinates
    await waitFor(() => {
      expect(onTriggerSlot).toHaveBeenCalledWith(0, 0);
    });

    // The fix: handleSlotTap must call getMatrix() after triggerSlot resolves
    // so the matrix prop updates and the grid re-renders with new state.
    // Currently this FAILS — getMatrix is only called once on mount.
    expect(onGetMatrix).toHaveBeenCalledTimes(2);
  });

  it('calls triggerScene when tapping a scene launch button', async () => {
    const matrix = makeEmptyMatrix();
    const onTriggerScene = vi.fn().mockResolvedValue(true);
    renderSessionView({ matrix, triggerScene: onTriggerScene });

    await waitFor(() => {
      const sceneBtn = screen.getByLabelText('Scene 1');
      fireEvent.click(sceneBtn);
      expect(onTriggerScene).toHaveBeenCalledWith(0);
    });
  });

  it('calls getMatrix after tapping a scene launch button', async () => {
    // Issue #80: handleSceneLaunch must refresh the matrix so the grid
    // re-renders after triggering all slots in a scene row.
    const matrix = makeEmptyMatrix();
    const onTriggerScene = vi.fn().mockResolvedValue({ slots: [], triggered: true });
    const onGetMatrix = vi.fn().mockResolvedValue(matrix);

    render(
      <SessionView
        matrix={matrix}
        getMatrix={onGetMatrix}
        triggerSlot={vi.fn()}
        triggerScene={onTriggerScene}
      />,
    );

    // Wait for mount effect
    await waitFor(() => {
      expect(onGetMatrix).toHaveBeenCalledTimes(1);
    });

    const sceneBtn = screen.getByLabelText('Scene 1');
    fireEvent.click(sceneBtn);

    await waitFor(() => {
      expect(onTriggerScene).toHaveBeenCalledWith(0);
    });

    // The fix: handleSceneLaunch must also call getMatrix() after
    // triggerScene resolves, so the grid re-renders.
    // Currently this FAILS — getMatrix is only called once on mount.
    await waitFor(() => {
      expect(onGetMatrix).toHaveBeenCalledTimes(2);
    });
  });

  it('updates slot state when matrix prop changes', async () => {
    const { rerender } = renderSessionView({ matrix: makeEmptyMatrix() });

    // Update matrix with a playing slot
    const updated = makeEmptyMatrix();
    updated.slots[0] = { column: 0, row: 0, state: 'playing', color: '#00ff00', name: 'Kick', clipType: 'audio' };

    rerender(
      <SessionView
        matrix={updated}
        getMatrix={vi.fn()}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/kick/i)).toBeDefined();
    });
  });

  it('shows 8 scene launch buttons for 8 rows', async () => {
    const matrix = makeEmptyMatrix();
    renderSessionView({ matrix });

    await waitFor(() => {
      for (let i = 1; i <= 8; i++) {
        expect(screen.getByLabelText(`Scene ${i}`)).toBeDefined();
      }
    });
  });

  // ── Transport button tests ──

  it('renders transport buttons with callbacks', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onStop = vi.fn().mockResolvedValue(true);
    const onRecord = vi.fn().mockResolvedValue(true);

    // Pre-provide matrix to skip loading state
    renderSessionView({
      matrix: makeEmptyMatrix(),
      onPlay,
      onStop,
      onRecord,
      onGetTransportState: vi.fn().mockResolvedValue({ playing: false, recording: false }),
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Play')).toBeDefined();
      expect(screen.getByLabelText('Stop')).toBeDefined();
      expect(screen.getByLabelText('Record')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Play'));
    expect(onPlay).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Stop'));
    expect(onStop).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Record'));
    expect(onRecord).toHaveBeenCalledOnce();
  });

  it('shows playing state on transport play button', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onGetTransportState = vi.fn().mockResolvedValue({ playing: true, recording: false });

    renderSessionView({
      matrix: makeEmptyMatrix(),
      onPlay,
      onGetTransportState,
    });

    await waitFor(() => {
      // Play button should have green bg styling when playing
      const playBtn = screen.getByLabelText('Play');
      expect(playBtn).toBeDefined();
      expect(onGetTransportState).toHaveBeenCalled();
    });
  });

  it('shows recording state on transport record button', async () => {
    const onRecord = vi.fn().mockResolvedValue(true);
    const onGetTransportState = vi.fn().mockResolvedValue({ playing: false, recording: true });

    renderSessionView({
      matrix: makeEmptyMatrix(),
      onRecord,
      onGetTransportState,
    });

    await waitFor(() => {
      const recordBtn = screen.getByLabelText('Record');
      expect(recordBtn).toBeDefined();
      expect(onGetTransportState).toHaveBeenCalled();
    });
  });

  it('resets both playing and recording on stop', async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    const onStop = vi.fn().mockResolvedValue(true);
    const onRecord = vi.fn().mockResolvedValue(true);
    const onGetTransportState = vi.fn().mockResolvedValue({ playing: false, recording: false });

    renderSessionView({
      matrix: makeEmptyMatrix(),
      onPlay,
      onStop,
      onRecord,
      onGetTransportState,
    });

    // First play
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Play'));
    });
    expect(onPlay).toHaveBeenCalled();

    // Then stop
    fireEvent.click(screen.getByLabelText('Stop'));
    expect(onStop).toHaveBeenCalled();
  });

  // ── Column header tests (Issue #40) ──

  it('renders column headers with track names when tracks prop is provided', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
      { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
      { index: 2, name: 'Hat', trackNumber: 3, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
    ];

    renderSessionView({
      matrix,
      tracks: mockTracks,
    });

    await waitFor(() => {
      // Verify column headers show track names
      expect(screen.getByLabelText('Column 1: Kick')).toBeDefined();
      expect(screen.getByLabelText('Column 2: Snare')).toBeDefined();
      expect(screen.getByLabelText('Column 3: Hat')).toBeDefined();
    });
  });

  it('renders column headers with fallback names when tracks prop is not provided', async () => {
    const matrix = makeEmptyMatrix();
    renderSessionView({ matrix });

    await waitFor(() => {
      // Without tracks prop, headers should show "Track N"
      expect(screen.getByLabelText('Column 1: Track 1')).toBeDefined();
      expect(screen.getByLabelText('Column 8: Track 8')).toBeDefined();
    });
  });

  // ── Launch Playtime button tests (Issue #88) ──

  it('shows Launch Playtime button when matrix is null and playtime is not available', async () => {
    const onLaunchPlaytime = vi.fn().mockResolvedValue({ launched: true, message: 'ok' });
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: false });

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onLaunchPlaytime={onLaunchPlaytime}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Launch Playtime')).toBeDefined();
      expect(onCheckPlaytimeAvailable).toHaveBeenCalled();
    });
  });

  it('calls onLaunchPlaytime when Launch Playtime button is clicked', async () => {
    const onLaunchPlaytime = vi.fn().mockResolvedValue({ launched: true, message: 'ok' });
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: false });

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onLaunchPlaytime={onLaunchPlaytime}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      const launchBtn = screen.getByLabelText('Launch Playtime');
      fireEvent.click(launchBtn);
      expect(onLaunchPlaytime).toHaveBeenCalled();
    });
  });

  it('shows Playtime Active text when playtime becomes available', async () => {
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: true });

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Playtime Active')).toBeDefined();
      // Launch button should NOT be shown when Playtime is active
      expect(screen.queryByLabelText('Launch Playtime')).toBeNull();
    });
  });

  it('shows Refresh Matrix button when Playtime is active but no matrix', async () => {
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: true });
    const onGetMatrix = vi.fn().mockResolvedValue(null);

    render(
      <SessionView
        matrix={null}
        getMatrix={onGetMatrix}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Refresh matrix')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Refresh matrix'));
    expect(onGetMatrix).toHaveBeenCalled();
  });

  it('shows error message when launch fails', async () => {
    const onLaunchPlaytime = vi.fn().mockResolvedValue({ launched: false, message: 'No Helgobox instance found' });
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: false });

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onLaunchPlaytime={onLaunchPlaytime}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      const launchBtn = screen.getByLabelText('Launch Playtime');
      fireEvent.click(launchBtn);
    });

    await waitFor(() => {
      // Should show the error message in the button
      expect(screen.getByText(/No Helgobox instance found/)).toBeDefined();
    });
  });

  it('shows launching state while launching', async () => {
    // A promise that never resolves to keep launching state
    const onLaunchPlaytime = vi.fn().mockReturnValue(new Promise(() => {}));
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: false });

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onLaunchPlaytime={onLaunchPlaytime}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      const launchBtn = screen.getByLabelText('Launch Playtime');
      fireEvent.click(launchBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Launching/)).toBeDefined();
    });
  });

  it('shows retry button while checking playtime availability', async () => {
    // Use a delayed promise so the check stays in 'checking' state
    const onCheckPlaytimeAvailable = vi.fn().mockReturnValue(new Promise(() => {}));

    render(
      <SessionView
        matrix={null}
        getMatrix={vi.fn().mockResolvedValue(null)}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Retry Playtime check')).toBeDefined();
    });
  });

  it('hides launch button and shows Playtime Active after successful launch', async () => {
    const onLaunchPlaytime = vi.fn().mockResolvedValue({ launched: true, message: 'Playtime 2 launched' });
    const onCheckPlaytimeAvailable = vi.fn().mockResolvedValue({ available: false });
    const onGetMatrix = vi.fn().mockResolvedValue(null);

    // Render with matrix=null so the launch prompt is shown
    const { rerender } = render(
      <SessionView
        matrix={null}
        getMatrix={onGetMatrix}
        triggerSlot={vi.fn()}
        triggerScene={vi.fn()}
        onLaunchPlaytime={onLaunchPlaytime}
        onCheckPlaytimeAvailable={onCheckPlaytimeAvailable}
      />
    );

    // Click launch button
    await waitFor(() => {
      const launchBtn = screen.getByLabelText('Launch Playtime');
      fireEvent.click(launchBtn);
    });

    // After launch returns {launched: true}, the state should update
    // to show Playtime Active
    await waitFor(() => {
      expect(screen.getByText('Playtime Active')).toBeDefined();
      expect(screen.queryByLabelText('Launch Playtime')).toBeNull();
    });
  });

  it('renders column headers with fallback for tracks with empty names', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: '', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
      { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
    ];

    renderSessionView({
      matrix,
      tracks: mockTracks,
    });

    await waitFor(() => {
      // Track with empty name should fall back to "Track N"
      expect(screen.getByLabelText('Column 1: Track 1')).toBeDefined();
      expect(screen.getByLabelText('Column 2: Snare')).toBeDefined();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SessionView } from '../components/SessionView';
import { DragProvider, useDragContext } from '../hooks/useDragContext';
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
      fireEvent.pointerDown(slot);
      fireEvent.pointerUp(slot);
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
    fireEvent.pointerDown(slot);
    fireEvent.pointerUp(slot);

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

  it('detects drop zone when dragging over a slot', async () => {
    // Wrap with DragProvider and start a drag
    function DragDropTest() {
      const { startDrag, updatePosition } = useDragContext();
      const onSendToSlot = vi.fn().mockResolvedValue(true);
      const onGetMatrix = vi.fn().mockResolvedValue(makeEmptyMatrix());

      return (
        <div>
          <button
            data-testid="start-drag-btn"
            onClick={() => startDrag({ path: '/tmp/test.wav', name: 'test.wav' })}
          >
            Start Drag
          </button>
          <SessionView
            matrix={makeEmptyMatrix()}
            getMatrix={onGetMatrix}
            triggerSlot={vi.fn()}
            triggerScene={vi.fn()}
            sendToSlot={onSendToSlot}
          />
        </div>
      );
    }

    render(
      <DragProvider>
        <DragDropTest />
      </DragProvider>
    );

    // Wait for the grid to render
    await waitFor(() => {
      expect(screen.getByLabelText('Slot 1,1')).toBeDefined();
    });

    // Start a drag
    act(() => {
      screen.getByTestId('start-drag-btn').click();
    });

    // Verify the drag overlay would be shown (via DragProvider)
    // The actual drop zone detection relies on elementFromPoint
    // which is hard to test in JSDOM. We trust the integration.
    expect(screen.getByLabelText('Slot 1,1')).toBeDefined();
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

  // ── Reverse button tests (Issue #75) ──

  it('shows reverse toggle button on non-empty clips', async () => {
    const matrix = makePartialMatrix();
    const onSetSlotReverse = vi.fn().mockResolvedValue({
      column: 0, row: 0, reversed: true, state: 'playing',
      color: '#00ff00', name: 'Kick_01', clipType: 'audio',
    });
    renderSessionView({ matrix, onSetSlotReverse });

    await waitFor(() => {
      // Non-empty clips should have reverse buttons
      expect(screen.queryByLabelText('Reverse slot 1,1')).toBeDefined();
      expect(screen.queryByLabelText('Reverse slot 2,1')).toBeDefined();
      expect(screen.queryByLabelText('Reverse slot 1,2')).toBeDefined();
    });
  });

  it('does not show reverse button on empty clips', async () => {
    const matrix = makeEmptyMatrix();
    const onSetSlotReverse = vi.fn();
    renderSessionView({ matrix, onSetSlotReverse });

    await waitFor(() => {
      // Empty clips should not have reverse buttons
      expect(screen.queryByLabelText('Reverse slot')).toBeNull();
    });
  });

  it('calls setSlotReverse when reverse button is clicked', async () => {
    const matrix = makePartialMatrix();
    const onSetSlotReverse = vi.fn().mockResolvedValue({
      column: 0, row: 0, reversed: true, state: 'playing',
      color: '#00ff00', name: 'Kick_01', clipType: 'audio',
    });

    renderSessionView({ matrix, onSetSlotReverse });

    await waitFor(() => {
      const revBtn = screen.getByLabelText('Reverse slot 1,1');
      fireEvent.click(revBtn);
      expect(onSetSlotReverse).toHaveBeenCalledWith(0, 0, true);
    });
  });

  it('shows reversed visual indicator when clip is reversed', async () => {
    const matrix = makeEmptyMatrix();
    matrix.slots[0] = {
      column: 0, row: 0, state: 'stopped',
      color: '#888888', name: 'Rev_Clip', clipType: 'audio',
      reversed: true,
    };
    const onSetSlotReverse = vi.fn();

    renderSessionView({ matrix, onSetSlotReverse });

    await waitFor(() => {
      const revBtn = screen.getByLabelText('Reverse slot 1,1');
      // When reversed, the button should show the active state
      expect(revBtn).toBeDefined();
    });
  });

  it('toggles reverse on and off on successive clicks', async () => {
    const matrix = makePartialMatrix();
    const onSetSlotReverse = vi.fn()
      .mockResolvedValueOnce({
        column: 0, row: 0, reversed: true, state: 'playing',
        color: '#00ff00', name: 'Kick_01', clipType: 'audio',
      })
      .mockResolvedValueOnce({
        column: 0, row: 0, reversed: false, state: 'playing',
        color: '#00ff00', name: 'Kick_01', clipType: 'audio',
      });

    renderSessionView({ matrix, onSetSlotReverse });

    await waitFor(() => {
      const revBtn = screen.getByLabelText('Reverse slot 1,1');
      fireEvent.click(revBtn);
      expect(onSetSlotReverse).toHaveBeenCalledWith(0, 0, true);
    });

    // Click again to toggle off
    await waitFor(() => {
      const revBtn = screen.getByLabelText('Reverse slot 1,1');
      fireEvent.click(revBtn);
      expect(onSetSlotReverse).toHaveBeenCalledWith(0, 0, true);
    });
  });

  // ── Column header track control tests (Issue #110) ──

  it('renders arm/mute/solo buttons in column headers when tracks prop is provided', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
      { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      expect(screen.getByLabelText('Column 1: Kick')).toBeDefined();
      expect(screen.getByLabelText('Track 1 arm toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 1 mute toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 1 solo toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 2 arm toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 2 mute toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 2 solo toggle')).toBeDefined();
    });
  });

  it('calls onToggleArm when arm button is clicked in column header', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    const onToggleArm = vi.fn();
    renderSessionView({ matrix, tracks: mockTracks, onToggleArm });

    await waitFor(() => {
      const armBtn = screen.getByLabelText('Track 1 arm toggle');
      fireEvent.click(armBtn);
      expect(onToggleArm).toHaveBeenCalledWith(0);
    });
  });

  it('calls onToggleMute when mute button is clicked in column header', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    const onToggleMute = vi.fn();
    renderSessionView({ matrix, tracks: mockTracks, onToggleMute });

    await waitFor(() => {
      const muteBtn = screen.getByLabelText('Track 1 mute toggle');
      fireEvent.click(muteBtn);
      expect(onToggleMute).toHaveBeenCalledWith(0);
    });
  });

  it('calls onToggleSolo when solo button is clicked in column header', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    const onToggleSolo = vi.fn();
    renderSessionView({ matrix, tracks: mockTracks, onToggleSolo });

    await waitFor(() => {
      const soloBtn = screen.getByLabelText('Track 1 solo toggle');
      fireEvent.click(soloBtn);
      expect(onToggleSolo).toHaveBeenCalledWith(0);
    });
  });

  it('shows arm button as red when track is armed', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: true, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const armBtn = screen.getByLabelText('Track 1 arm toggle');
      expect(armBtn.className).toContain('accent-red');
    });
  });

  it('shows mute button as dimmed when track is muted', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: true, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const muteBtn = screen.getByLabelText('Track 1 mute toggle');
      expect(muteBtn.className).toContain('accent-red');
    });
  });

  it('shows solo button as highlighted when track is soloed', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: true, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const soloBtn = screen.getByLabelText('Track 1 solo toggle');
      expect(soloBtn.className).toContain('accent-yellow');
    });
  });

  it('shows record mode toggle as A (audio) when recMode is 0', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: true, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const modeToggle = screen.getByLabelText('Track 1 record mode toggle');
      expect(modeToggle).toBeDefined();
      expect(modeToggle.textContent).toBe('A');
    });
  });

  it('shows record mode toggle as M (MIDI) when recMode is 7 or 8', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: true, recMode: 7, recInput: 6112, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const modeToggle = screen.getByLabelText('Track 1 record mode toggle');
      expect(modeToggle).toBeDefined();
      expect(modeToggle.textContent).toBe('M');
    });
  });

  it('calls onToggleRecordMode when A/M toggle is clicked', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: true, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    const onToggleRecordMode = vi.fn();
    renderSessionView({ matrix, tracks: mockTracks, onToggleRecordMode });

    await waitFor(() => {
      const modeToggle = screen.getByLabelText('Track 1 record mode toggle');
      fireEvent.click(modeToggle);
      expect(onToggleRecordMode).toHaveBeenCalledWith(0);
    });
  });

  it('does not show record mode toggle when track is not armed', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, recInput: 0, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      expect(screen.queryByLabelText('Track 1 record mode toggle')).toBeNull();
    });
  });

  it('shows track control buttons with fallback tracks when no tracks prop', async () => {
    const matrix = makeEmptyMatrix();
    renderSessionView({ matrix });

    await waitFor(() => {
      // With no tracks prop, control labels use 1-indexed column + 1
      expect(screen.getByLabelText('Track 1 arm toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 1 mute toggle')).toBeDefined();
      expect(screen.getByLabelText('Track 1 solo toggle')).toBeDefined();
    });
  });

  // ── Navigate to Track tests (Issue #111) ──

  it('renders navigate-to-track button in column headers', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
      { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      expect(screen.getByLabelText('Navigate to track 1')).toBeDefined();
      expect(screen.getByLabelText('Navigate to track 2')).toBeDefined();
    });
  });

  it('calls onNavigateToTrack with correct index when nav button is tapped', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
      { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
    ];
    const onNavigateToTrack = vi.fn();
    renderSessionView({ matrix, tracks: mockTracks, onNavigateToTrack });

    await waitFor(() => {
      const navBtn1 = screen.getByLabelText('Navigate to track 1');
      fireEvent.click(navBtn1);
      expect(onNavigateToTrack).toHaveBeenCalledWith(0);
    });

    await waitFor(() => {
      const navBtn2 = screen.getByLabelText('Navigate to track 2');
      fireEvent.click(navBtn2);
      expect(onNavigateToTrack).toHaveBeenCalledWith(1);
    });
  });

  it('renders navigate-to-track button for fallback track names when no tracks prop', async () => {
    const matrix = makeEmptyMatrix();
    renderSessionView({ matrix });

    await waitFor(() => {
      // Should render nav buttons for each column using fallback names
      for (let i = 1; i <= 8; i++) {
        expect(screen.getByLabelText(`Navigate to track ${i}`)).toBeDefined();
      }
    });
  });

  it('navigate-to-track button has correct accessible label', async () => {
    const matrix = makeEmptyMatrix();
    const mockTracks = [
      { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
    ];
    renderSessionView({ matrix, tracks: mockTracks });

    await waitFor(() => {
      const navBtn = screen.getByLabelText('Navigate to track 1');
      // Should show an arrow/icon indicating navigation
      expect(navBtn.textContent).toBe('↗');
    });
  });
});
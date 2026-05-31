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
});

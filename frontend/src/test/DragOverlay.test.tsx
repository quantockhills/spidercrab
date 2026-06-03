import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { DragProvider, DragState, useDragContext } from '../hooks/useDragContext';
import { DragOverlay } from '../components/DragOverlay';

// ── Helper: exposes context state as data attributes ──────────

function ContextInspector() {
  const ctx = useDragContext();
  return (
    <div
      data-has-payload={ctx.payload !== null}
      data-payload-name={ctx.payload?.name ?? ''}
      data-edge-reached={ctx.edgeReached}
      data-pos-x={ctx.position?.x ?? ''}
      data-pos-y={ctx.position?.y ?? ''}
    >
      <button data-testid="start-btn" onClick={() => ctx.startDrag({ path: '/tmp/t.wav', name: 't.wav' })}>S</button>
      <button data-testid="move-btn" onClick={() => ctx.updatePosition(500, 300)}>M</button>
      <button data-testid="end-btn" onClick={() => ctx.endDrag()}>E</button>
      <button data-testid="edge-btn" onClick={() => ctx.updatePosition(750, 300)}>Edge</button>
    </div>
  );
}

function renderWithProviders() {
  const onEdgeReached = vi.fn();
  const utils = render(
    <DragProvider edgeThreshold={0.8} onEdgeReached={onEdgeReached}>
      <ContextInspector />
      <DragOverlay />
    </DragProvider>
  );
  return { ...utils, onEdgeReached };
}

describe('DragOverlay', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with no active drag', () => {
    const { container } = renderWithProviders();
    const inspector = container.querySelector('[data-has-payload]');
    expect(inspector?.getAttribute('data-has-payload')).toBe('false');
  });

  it('shows drag content when startDrag is called', () => {
    const { container } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);

    const inspector = container.querySelector('[data-has-payload]');
    expect(inspector?.getAttribute('data-has-payload')).toBe('true');
    expect(inspector?.getAttribute('data-payload-name')).toBe('t.wav');
  });

  it('clears drag state on endDrag', () => {
    const { container } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);

    let inspector = container.querySelector('[data-has-payload]');
    expect(inspector?.getAttribute('data-has-payload')).toBe('true');

    fireEvent.click(container.querySelector('[data-testid="end-btn"]')!);
    inspector = container.querySelector('[data-has-payload]');
    expect(inspector?.getAttribute('data-has-payload')).toBe('false');
  });

  it('detects edge threshold crossing', () => {
    const { container } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);

    const inspector = container.querySelector('[data-edge-reached]');
    expect(inspector?.getAttribute('data-edge-reached')).toBe('true');
  });

  it('calls onEdgeReached when crossing edge', () => {
    const { container, onEdgeReached } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);

    expect(onEdgeReached).toHaveBeenCalledWith({ path: '/tmp/t.wav', name: 't.wav' });
  });

  it('fires onEdgeReached only once per drag', () => {
    const { container, onEdgeReached } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);

    expect(onEdgeReached).toHaveBeenCalledTimes(1);
  });

  it('does not trigger edge before threshold', () => {
    const { container } = renderWithProviders();
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="move-btn"]')!);

    const inspector = container.querySelector('[data-edge-reached]');
    expect(inspector?.getAttribute('data-edge-reached')).toBe('false');
  });

  it('resets edge state on new drag cycle', () => {
    const { container, onEdgeReached } = renderWithProviders();
    // Cycle 1: start → edge → end
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);
    fireEvent.click(container.querySelector('[data-testid="end-btn"]')!);

    // Cycle 2: start → shouldn't have edge yet
    fireEvent.click(container.querySelector('[data-testid="start-btn"]')!);
    let inspector = container.querySelector('[data-edge-reached]');
    expect(inspector?.getAttribute('data-edge-reached')).toBe('false');

    // Move to edge again
    fireEvent.click(container.querySelector('[data-testid="edge-btn"]')!);
    inspector = container.querySelector('[data-edge-reached]');
    expect(inspector?.getAttribute('data-edge-reached')).toBe('true');
    expect(onEdgeReached).toHaveBeenCalledTimes(2);
  });
});

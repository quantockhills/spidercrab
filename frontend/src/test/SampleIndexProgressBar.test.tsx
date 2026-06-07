import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SampleIndexProgressBar from '../components/SampleIndexProgressBar';

describe('SampleIndexProgressBar', () => {
  it('renders nothing when no progress events received', () => {
    const onEvent = vi.fn().mockReturnValue(vi.fn());
    const { container } = render(<SampleIndexProgressBar onEvent={onEvent} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows progress bar on sampleIndexProgress event', () => {
    const unsub = vi.fn();
    const onEvent = vi.fn().mockImplementation((_pattern: string, handler: (data: unknown) => void) => {
      // Simulate progress event
      setTimeout(() => {
        handler({
          payload: { scanned: 5, total: 10, status: 'scanning' },
        });
      }, 0);
      return unsub;
    });

    render(<SampleIndexProgressBar onEvent={onEvent} />);

    // Wait for the event to be processed
    setTimeout(() => {
      expect(screen.getByText(/Indexing samples/)).toBeDefined();
      expect(screen.getByText(/5\/10/)).toBeDefined();
      expect(screen.getByText(/50%/)).toBeDefined();
    }, 50);
  });

  it('hides after sampleIndexComplete event', () => {
    const unsub = vi.fn();
    const onEvent = vi.fn().mockImplementation((_pattern: string, handler: (data: unknown) => void) => {
      if (_pattern === 'event:sampleIndexProgress') {
        // Show progress first
        setTimeout(() => {
          handler({
            payload: { scanned: 10, total: 10, status: 'scanning' },
          });
        }, 0);
      } else if (_pattern === 'event:sampleIndexComplete') {
        // Then complete
        setTimeout(() => {
          handler({
            payload: { total: 10, rootPath: '/samples' },
          });
        }, 10);
      }
      return unsub;
    });

    render(<SampleIndexProgressBar onEvent={onEvent} />);

    // After both events, the component should fade out and eventually be removed
    setTimeout(() => {
      // Set a long timeout to let the 500ms animation complete
      setTimeout(() => {
        const { container } = render(<SampleIndexProgressBar onEvent={onEvent} />);
        expect(container.firstChild).toBeNull();
      }, 1000);
    }, 100);
  });

  it('subscribes and unsubscribes correctly', () => {
    const unsub = vi.fn();
    const onEvent = vi.fn().mockReturnValue(unsub);

    const { unmount } = render(<SampleIndexProgressBar onEvent={onEvent} />);

    // Should have registered for events
    expect(onEvent).toHaveBeenCalledWith('event:sampleIndexProgress', expect.any(Function));
    expect(onEvent).toHaveBeenCalledWith('event:sampleIndexComplete', expect.any(Function));

    // On unmount, both subscriptions should be cleaned up
    unmount();
    expect(unsub).toHaveBeenCalledTimes(2);
  });

  it('does not show progress bar when scanned is 0', () => {
    const unsub = vi.fn();
    const onEvent = vi.fn().mockImplementation((_pattern: string, handler: (data: unknown) => void) => {
      setTimeout(() => {
        handler({
          payload: { scanned: 0, total: 0, status: 'scanning' },
        });
      }, 0);
      return unsub;
    });

    render(<SampleIndexProgressBar onEvent={onEvent} />);

    setTimeout(() => {
      expect(screen.getByText(/Indexing samples/)).toBeDefined();
      expect(screen.getByText(/0\/0/)).toBeDefined();
    }, 50);
  });
});

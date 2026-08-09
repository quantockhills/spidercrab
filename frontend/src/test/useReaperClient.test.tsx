import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider, useReaperClient } from '../hooks/useReaperClient';
import type { ReactNode } from 'react';

// ── Mock WebSocket ──────────────────────────────────────────

function createMockWsClass() {
  class MockWebSocket {
    static lastInstance: MockWebSocket | null = null;
    url: string;
    readyState = 1;
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.lastInstance = this;
      setTimeout(() => { this.onopen?.(); }, 0);
    }

    send(data: string) {
      this.sentMessages.push(data);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    simulateMessage(data: string) {
      this.onmessage?.({ data });
    }
  }

  return { MockWebSocket };
}

// ── Wrapper component ───────────────────────────────────────

function createWrapper(host = 'test.local', port = 9999) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaperClientProvider host={host} port={port}>
        {children}
      </ReaperClientProvider>
    );
  };
}

describe('useReaperClient', () => {
  let mockWsClass: ReturnType<typeof createMockWsClass>;

  beforeEach(() => {
    mockWsClass = createMockWsClass();
    WsClient.WebSocketFactory = mockWsClass.MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('provides connected state', async () => {
    const { result } = renderHook(() => useReaperClient(), {
      wrapper: createWrapper(),
    });

    // Initially not connected
    expect(result.current.connected).toBe(false);

    // After WebSocket opens, connected should become true
    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it('throws when used outside provider', () => {
    // Suppress console.error from React for the expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useReaperClient());
    }).toThrow('useReaperClient must be used within a <ReaperClientProvider>');

    spy.mockRestore();
  });

  it('provides send function that sends commands via WsClient', async () => {
    const { result } = renderHook(() => useReaperClient(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    const ws = mockWsClass.MockWebSocket.lastInstance!;
    const promise = result.current.send('track/getAll');

    // Verify the command was sent
    expect(ws.sentMessages.length).toBe(1);
    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('track/getAll');

    // Simulate response
    act(() => {
      ws.simulateMessage(
        JSON.stringify({
          type: 'response',
          id: sentMsg.id,
          success: true,
          payload: { tracks: [] },
        }),
      );
    });

    const resp = await promise;
    expect(resp.success).toBe(true);
  });

  it('provides onEvent for subscribing to WS events', async () => {
    const { result } = renderHook(() => useReaperClient(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    const handler = vi.fn();
    act(() => {
      result.current.onEvent('event:transport', handler);
    });

    const ws = mockWsClass.MockWebSocket.lastInstance!;
    act(() => {
      ws.simulateMessage(
        JSON.stringify({
          type: 'event',
          event: 'transport',
          payload: { playing: true },
        }),
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('exposes clientRef for low-level access', async () => {
    const { result } = renderHook(() => useReaperClient(), {
      wrapper: createWrapper(),
    });

    expect(result.current.clientRef.current).not.toBeNull();
    expect(result.current.clientRef.current).toBeInstanceOf(WsClient);
  });
});

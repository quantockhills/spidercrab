import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { useReaper } from '../hooks/useReaper';

/**
 * Creates a mock WebSocket class that opens synchronously.
 * The instance exposes a `simulateMessage` helper for test control.
 */
function createMockWsClass() {
  let instance: Record<string, unknown> | null = null;

  class MockWebSocket {
    static lastInstance: MockWebSocket | null = null;
    url: string;
    readyState = 1; // WebSocket.OPEN
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.lastInstance = this;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
      // Fire onopen asynchronously to simulate connection
      setTimeout(() => { this.onopen?.(); }, 0);
    }

    send(data: string) {
      this.sentMessages.push(data);
    }
    close() {
      this.readyState = 3; // WebSocket.CLOSED
      this.onclose?.();
    }
    simulateMessage(data: string) {
      this.onmessage?.({ data });
    }
  }

  return { MockWebSocket, getInstance: () => instance };
}

describe('useReaper — isRefreshingFx state', () => {
  let mockWsClass: ReturnType<typeof createMockWsClass>;

  beforeEach(() => {
    mockWsClass = createMockWsClass();
    WsClient.WebSocketFactory = mockWsClass.MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  function getMockWs() {
    const ws = mockWsClass.MockWebSocket.lastInstance as {
      sentMessages: string[];
      simulateMessage: (data: string) => void;
    } | null;
    return ws;
  }

  it('starts with isRefreshingFx as false', () => {
    const { result } = renderHook(() => useReaper({ host: 'test.local', port: 9999 }));
    expect(result.current.isRefreshingFx).toBe(false);
  });

  it('sets isRefreshingFx to true while refreshFxCache is in flight and false after completion', async () => {
    const { result } = renderHook(() => useReaper({ host: 'test.local', port: 9999 }));

    // Wait for WebSocket to connect
    await vi.waitFor(() => {
      expect(getMockWs()).not.toBeNull();
    });

    // Start refreshFxCache (no response yet — stays in-flight)
    let promise: Promise<boolean>;
    act(() => {
      promise = result.current.refreshFxCache();
    });

    // Should be true while request is in flight
    expect(result.current.isRefreshingFx).toBe(true);

    // Now simulate a response from the WS server
    const ws = getMockWs()!;
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {},
      }));
    });

    // Wait for the promise to resolve
    await act(async () => {
      await promise;
    });

    // After resolution, isRefreshingFx should be false again
    expect(result.current.isRefreshingFx).toBe(false);
  });

  it('sets isRefreshingFx to false when refreshFxCache fails', async () => {
    const { result } = renderHook(() => useReaper({ host: 'test.local', port: 9999 }));

    // Wait for WebSocket to connect
    await vi.waitFor(() => {
      expect(getMockWs()).not.toBeNull();
    });

    // Start refreshFxCache (no response yet — stays in-flight)
    let promise: Promise<boolean>;
    act(() => {
      promise = result.current.refreshFxCache();
    });

    // Should be true while request is in flight
    expect(result.current.isRefreshingFx).toBe(true);

    // Simulate an error response from the WS server
    const ws = getMockWs()!;
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        payload: { error: 'EnumInstalledFX failed' },
      }));
    });

    // Wait for the promise to settle
    await act(async () => {
      try { await promise; } catch { /* expected */ }
    });

    // After failure, isRefreshingFx should be false
    expect(result.current.isRefreshingFx).toBe(false);
  });
});

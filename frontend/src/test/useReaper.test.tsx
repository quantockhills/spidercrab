import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { useReaper } from '../hooks/useReaper';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import type { ReactNode } from 'react';

/**
 * Creates a mock WebSocket class that opens synchronously.
 * The instance exposes a `simulateMessage` helper for test control.
 */
function createMockWsClass() {
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

  return { MockWebSocket };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ReaperClientProvider host="test.local" port={9999}>
      {children}
    </ReaperClientProvider>
  );
}

function getMockWs() {
  const mocked = mockWsClass.MockWebSocket as unknown as { lastInstance: MockWebSocket | null };
  return mocked.lastInstance as unknown as {
    sentMessages: string[];
    simulateMessage: (data: string) => void;
  } | null;
}

let mockWsClass: ReturnType<typeof createMockWsClass>;

describe('useReaper — composite backward compat', () => {
  beforeEach(() => {
    mockWsClass = createMockWsClass();
    WsClient.WebSocketFactory = mockWsClass.MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('isRefreshingFx starts as false', () => {
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });
    expect(result.current.isRefreshingFx).toBe(false);
  });

  it('sets isRefreshingFx to true while refreshFxCache is in flight and false after completion', async () => {
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });

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
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });

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

  it('provides connected state', async () => {
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });

    // Initially not connected
    expect(result.current.connected).toBe(false);

    // After WebSocket opens, connected should become true
    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it('refreshTracks fetches tracks', async () => {
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(getMockWs()).not.toBeNull());
    const ws = getMockWs()!;

    const promise = result.current.refreshTracks();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('track/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: sentMsg.id, success: true,
        payload: { tracks: [{ index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 }] },
      }));
    });

    const tracks = await promise;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe('Kick');
    await vi.waitFor(() => {
      expect(result.current.tracks[0]?.name).toBe('Kick');
    });
  });

  it('play sends transport/play command', async () => {
    const { result } = renderHook(() => useReaper(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(getMockWs()).not.toBeNull());
    const ws = getMockWs()!;

    const promise = result.current.play();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('transport/play');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: sentMsg.id, success: true, payload: {},
      }));
    });

    expect(await promise).toBe(true);
  });
});

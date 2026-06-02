import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { usePlaytime } from '../hooks/usePlaytime';
import type { ReactNode } from 'react';

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

  send(data: string) { this.sentMessages.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  simulateMessage(data: string) { this.onmessage?.({ data }); }
}

function Wrapper({ children }: { children: ReactNode }) {
  return <ReaperClientProvider host="test.local" port={9999}>{children}</ReaperClientProvider>;
}

describe('usePlaytime', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('starts with null matrix', () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });
    expect(result.current.matrix).toBeNull();
  });

  it('getMatrix fetches and stores matrix data', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.getMatrix();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('matrix/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          columns: 2,
          rows: 2,
          slots: [
            { column: 0, row: 0, state: 'empty', color: '#888', name: '', clipType: 'none' },
            { column: 0, row: 1, state: 'stopped', color: '#888', name: 'Clip 1', clipType: 'audio' },
          ],
        },
      }));
    });

    const data = await promise;
    expect(data).not.toBeNull();
    expect(data!.columns).toBe(2);
    // State updates from async callbacks need to flush — wait for them
    await vi.waitFor(() => {
      expect(result.current.matrix).not.toBeNull();
    });
    expect(result.current.matrix!.slots).toHaveLength(2);
  });

  it('triggerSlot sends matrix/triggerSlot command', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.triggerSlot(0, 0);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('matrix/triggerSlot');
    expect(sentMsg.column).toBe(0);
    expect(sentMsg.row).toBe(0);

    // Backend returns the slot object directly as the payload, not wrapped in {slot: ...}.
    // See command_handler.cpp: HandleMatrixTriggerSlot sends updated.toJson() directly.
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { column: 0, row: 0, state: 'playing', color: '#0f0', name: '', clipType: 'none' },
      }));
    });

    const slot = await promise;
    expect(slot).not.toBeNull();
    expect(slot!.state).toBe('playing');
  });

  it('checkPlaytimeAvailable sends playtime/isAvailable command', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.checkPlaytimeAvailable();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('playtime/isAvailable');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { available: true, version: 'ok' },
      }));
    });

    const resultData = await promise;
    expect(resultData.available).toBe(true);
  });

  it('checkPlaytimeAvailable returns false on error', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.checkPlaytimeAvailable();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        payload: { available: false, reason: 'Not available' },
      }));
    });

    const resultData = await promise;
    expect(resultData.available).toBe(false);
  });

  it('checkPlaytimeAvailable returns false on network error', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.checkPlaytimeAvailable();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        error: 'Connection error',
      }));
    });

    const resultData = await promise;
    expect(resultData.available).toBe(false);
  });

  it('updateMatrixSlot updates local state optimistically', () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    act(() => {
      result.current.updateMatrixSlot(0, 0, { state: 'playing' });
    });

    // Should not crash when matrix is null
    expect(result.current.matrix).toBeNull();
  });
});

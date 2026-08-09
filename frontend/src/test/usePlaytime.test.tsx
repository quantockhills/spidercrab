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

  // ── recordSlot tests (Issue #43) ──

  it('recordSlot sends matrix/recordSlot command', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.recordSlot(3, 5);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('matrix/recordSlot');
    expect(sentMsg.column).toBe(3);
    expect(sentMsg.row).toBe(5);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { column: 3, row: 5, state: 'recording', color: '#f00', name: '', clipType: 'none' },
      }));
    });

    const slot = await promise;
    expect(slot).not.toBeNull();
    expect(slot!.state).toBe('recording');
    expect(slot!.column).toBe(3);
    expect(slot!.row).toBe(5);
  });

  it('recordSlot returns null on failure', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.recordSlot(0, 0);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        error: 'Cannot record on a playing clip',
      }));
    });

    const slot = await promise;
    expect(slot).toBeNull();
  });

  it('recordSlot sends state update to local matrix on success', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    // First get matrix so we have initial state
    const getPromise = result.current.getMatrix();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const getMsgId = JSON.parse(ws.sentMessages[0]).id;
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: getMsgId,
        success: true,
        payload: {
          columns: 8,
          rows: 8,
          slots: Array.from({ length: 64 }, (_, i) => ({
            column: i % 8,
            row: Math.floor(i / 8),
            state: 'empty' as const,
            color: '#ffffff',
            name: '',
            clipType: 'none' as const,
          })),
        },
      }));
    });

    await getPromise;
    await vi.waitFor(() => expect(result.current.matrix).not.toBeNull());

    // Now record a slot
    const recPromise = result.current.recordSlot(2, 4);
    // Find the recordSlot message
    const recMsg = ws.sentMessages.find(m => {
      try {
        const parsed = JSON.parse(m);
        return parsed.command === 'matrix/recordSlot';
      } catch { return false; }
    });
    expect(recMsg).toBeDefined();

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: JSON.parse(recMsg!).id,
        success: true,
        payload: { column: 2, row: 4, state: 'recording', color: '#f00', name: '', clipType: 'none' },
      }));
    });

    await recPromise;
    // Local matrix should now have the recording slot
    await vi.waitFor(() => {
      const slot = result.current.matrix?.slots.find(s => s.column === 2 && s.row === 4);
      expect(slot?.state).toBe('recording');
    });
  });

  // ── pollState tests (Issue #43) ──

  it('pollState sends matrix/pollState command', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.pollState();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('matrix/pollState');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          playtimeAvailable: false,
          instanceId: -1,
          hasMatrix: false,
        },
      }));
    });

    const state = await promise;
    expect(state).not.toBeNull();
    expect(state!.playtimeAvailable).toBe(false);
    expect(state!.instanceId).toBe(-1);
    expect(state!.hasMatrix).toBe(false);
  });

  it('pollState returns available state', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.pollState();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          playtimeAvailable: true,
          instanceId: 5,
          hasMatrix: true,
        },
      }));
    });

    const state = await promise;
    expect(state!.playtimeAvailable).toBe(true);
    expect(state!.instanceId).toBe(5);
    expect(state!.hasMatrix).toBe(true);
  });

  it('pollState returns default state on failure', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.pollState();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        error: 'Not available',
      }));
    });

    const state = await promise;
    expect(state.playtimeAvailable).toBe(false);
    expect(state.instanceId).toBe(-1);
    expect(state.hasMatrix).toBe(false);
  });

  // ── setSlotReverse tests (Issue #75) ──

  it('setSlotReverse sends matrix/setSlotReverse command', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setSlotReverse(2, 4, true);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('matrix/setSlotReverse');
    expect(sentMsg.column).toBe(2);
    expect(sentMsg.row).toBe(4);
    expect(sentMsg.reversed).toBe(true);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { column: 2, row: 4, reversed: true, state: 'stopped', color: '#888', name: '', clipType: 'none' },
      }));
    });

    const slot = await promise;
    expect(slot).not.toBeNull();
    expect(slot!.reversed).toBe(true);
    expect(slot!.column).toBe(2);
    expect(slot!.row).toBe(4);
  });

  it('setSlotReverse toggles reversed flag off', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setSlotReverse(1, 2, false);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('matrix/setSlotReverse');
    expect(sentMsg.reversed).toBe(false);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { column: 1, row: 2, reversed: false, state: 'empty', color: '#fff', name: '', clipType: 'none' },
      }));
    });

    const slot = await promise;
    expect(slot).not.toBeNull();
    expect(slot!.reversed).toBe(false);
  });

  it('setSlotReverse returns null on failure', async () => {
    const { result } = renderHook(() => usePlaytime(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setSlotReverse(0, 0, true);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        error: 'Invalid slot',
      }));
    });

    const slot = await promise;
    expect(slot).toBeNull();
  });
});

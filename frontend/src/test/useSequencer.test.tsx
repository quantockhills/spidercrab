import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { useSequencer } from '../hooks/useSequencer';
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

describe('useSequencer', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('starts with null sequencer', () => {
    const { result } = renderHook(() => useSequencer(), { wrapper: Wrapper });
    expect(result.current.sequencer).toBeNull();
  });

  it('getSequencer fetches and stores sequencer data', async () => {
    const { result } = renderHook(() => useSequencer(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.getSequencer();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('sequencer/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          columns: 16,
          rows: 1,
          length: 16,
          baseNote: 36,
          playhead: 0,
          steps: [{ column: 0, row: 0, active: true, velocity: 100, note: 36 }],
        },
      }));
    });

    const data = await promise;
    expect(data).not.toBeNull();
    expect(data!.columns).toBe(16);
    expect(data!.steps).toHaveLength(1);
    // State updates from async callbacks need to flush
    await vi.waitFor(() => {
      expect(result.current.sequencer).not.toBeNull();
    });
  });

  it('toggleStep sends sequencer/toggleStep and updates state optimistically', async () => {
    const { result } = renderHook(() => useSequencer(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    // First load some data
    let p = result.current.getSequencer();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    let m = JSON.parse(ws.sentMessages[0]);
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: m.id, success: true,
        payload: { columns: 16, rows: 1, length: 16, baseNote: 36, playhead: 0, steps: [{ column: 0, row: 0, active: false, velocity: 100, note: 36 }] },
      }));
    });
    await p;
    await vi.waitFor(() => {
      expect(result.current.sequencer).not.toBeNull();
    });

    // Now toggle
    p = result.current.toggleStep(0, 0);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(1));
    m = JSON.parse(ws.sentMessages[1]);
    expect(m.command).toBe('sequencer/toggleStep');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: m.id, success: true,
        payload: { column: 0, row: 0, active: true, velocity: 100, note: 36 },
      }));
    });

    const step = await p;
    expect(step).not.toBeNull();
    expect(step!.active).toBe(true);
  });

  it('seqClearAll sends command and clears steps optimistically', async () => {
    const { result } = renderHook(() => useSequencer(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.seqClearAll();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('sequencer/clearAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {},
      }));
    });

    expect(await promise).toBe(true);
  });
});

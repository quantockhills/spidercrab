import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { useTransport } from '../hooks/useTransport';
import type { ReactNode } from 'react';

// Mock WebSocket as a class with a proper constructor
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

describe('useTransport', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('play sends transport/play command', async () => {
    const { result } = renderHook(() => useTransport(), { wrapper: Wrapper });

    // Wait for connection
    await vi.waitFor(() => {
      expect(MockWebSocket.lastInstance).not.toBeNull();
    });

    const ws = MockWebSocket.lastInstance!;
    const promise = result.current.play();

    // Wait for the send to happen
    await vi.waitFor(() => {
      expect(ws.sentMessages.length).toBeGreaterThan(0);
    });

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('transport/play');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {},
      }));
    });

    const ok = await promise;
    expect(ok).toBe(true);
  });

  it('stop sends transport/stop command', async () => {
    const { result } = renderHook(() => useTransport(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.stop();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('transport/stop');

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

  it('record sends transport/record command', async () => {
    const { result } = renderHook(() => useTransport(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.record();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('transport/record');

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

  it('getTransportState returns playing state', async () => {
    const { result } = renderHook(() => useTransport(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.getTransportState();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('transport/getState');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { playing: true, recording: false },
      }));
    });

    const state = await promise;
    expect(state.playing).toBe(true);
    expect(state.recording).toBe(false);
  });
});

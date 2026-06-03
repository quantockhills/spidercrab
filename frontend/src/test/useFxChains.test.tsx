import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { useFxChains } from '../hooks/useFxChains';
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

describe('useFxChains', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('fxChainGetDirectory sends fxchain/getDirectory command', async () => {
    const { result } = renderHook(() => useFxChains(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.fxChainGetDirectory('/tmp');
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fxchain/getDirectory');
    expect(sentMsg.path).toBe('/tmp');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { chains: [{ name: 'my_chain.RfxChain', size: 1024 }], dirs: ['subfolder'] },
      }));
    });

    const data = await promise;
    expect(data.chains).toHaveLength(1);
    expect(data.dirs).toContain('subfolder');
  });

  it('fxChainLoad sends fxchain/load command', async () => {
    const { result } = renderHook(() => useFxChains(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.fxChainLoad(0, '/tmp/my_chain.RfxChain', 'replace');
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fxchain/load');
    expect(sentMsg.mode).toBe('replace');

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

  it('fxChainGetInfo returns null on failure', async () => {
    const { result } = renderHook(() => useFxChains(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.fxChainGetInfo('/nonexistent');
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: false,
        payload: { error: 'File not found' },
      }));
    });

    const info = await promise;
    expect(info).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { useFx } from '../hooks/useFx';
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

describe('useFx', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('starts with isRefreshingFx as false', () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });
    expect(result.current.isRefreshingFx).toBe(false);
  });

  it('enumerateFx fetches FX list', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.enumerateFx();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fx/enumerate');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          fx: [
            { index: 0, name: 'VST3: ReaEQ', ident: 'reaeq', format: 'VST3' },
          ],
        },
      }));
    });

    const fxList = await promise;
    expect(fxList).toHaveLength(1);
    expect(fxList[0].name).toBe('VST3: ReaEQ');
  });

  it('getTrackFx fetches FX for a specific track', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.getTrackFx(0);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('track/getFx');
    expect(sentMsg.trackIdx).toBe(0);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { fx: [{ index: 0, name: 'VST3: ReaEQ' }] },
      }));
    });

    const fx = await promise;
    expect(fx).toHaveLength(1);
    expect(fx[0].name).toBe('VST3: ReaEQ');
  });

  it('getFxParams fetches parameters with pagination', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.getFxParams(0, 0, 0, 32);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fx/getParams');
    expect(sentMsg.offset).toBe(0);
    expect(sentMsg.limit).toBe(32);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          params: [{ index: 0, name: 'Frequency', value: 500, min: 20, max: 20000, mid: 1000 }],
          total: 1,
          offset: 0,
          limit: 32,
        },
      }));
    });

    const resultData = await promise;
    expect(resultData.params).toHaveLength(1);
    expect(resultData.params[0].name).toBe('Frequency');
  });

  it('setFxParam sends fx/setParam command', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setFxParam(0, 0, 2, 0.5);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fx/setParam');
    expect(sentMsg.trackIdx).toBe(0);
    expect(sentMsg.fxIdx).toBe(0);
    expect(sentMsg.paramIdx).toBe(2);
    expect(sentMsg.value).toBe(0.5);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { value: 0.5 },
      }));
    });

    const resp = await promise;
    expect(resp.success).toBe(true);
  });

  it('addFx sends fx/add command', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.addFx(0, 'VST3: ReaEQ');
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fx/add');
    expect(sentMsg.trackIdx).toBe(0);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: { fxIdx: 0 },
      }));
    });

    const fxIdx = await promise;
    expect(fxIdx).toBe(0);
  });

  it('deleteFx sends fx/delete command', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.deleteFx(0, 1);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[0]);
    expect(sentMsg.command).toBe('fx/delete');

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

  it('sets isRefreshingFx while refreshFxCache is in flight', async () => {
    const { result } = renderHook(() => useFx(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());

    // Wrap in act() so React flushes the synchronous setIsRefreshingFx(true)
    // before we check it — React 18 batches state updates by default
    let promise: Promise<boolean>;
    act(() => {
      promise = result.current.refreshFxCache();
    });
    expect(result.current.isRefreshingFx).toBe(true);

    const ws = MockWebSocket.lastInstance!;
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {},
      }));
    });

    await promise!;
    await vi.waitFor(() => {
      expect(result.current.isRefreshingFx).toBe(false);
    });
  });
});

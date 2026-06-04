import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WsClient } from '../lib/wsClient';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { useTrackState } from '../hooks/useTrackState';
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

describe('useTrackState', () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    WsClient.WebSocketFactory = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  it('starts with empty tracks', () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });
    expect(result.current.tracks).toEqual([]);
  });

  it('refreshTracks fetches and sets tracks', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.refreshTracks();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('track/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          tracks: [
            { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 },
          ],
        },
      }));
    });

    const tracks = await promise;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe('Kick');
    await vi.waitFor(() => {
      expect(result.current.tracks[0]?.name).toBe('Kick');
    });
  });

  it('addTrack sends track/add command and refreshes', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.addTrack();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    // First message should be track/add
    const addMsg = JSON.parse(ws.sentMessages[0]);
    expect(addMsg.command).toBe('track/add');

    // Respond to track/add
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: addMsg.id,
        success: true,
        payload: {},
      }));
    });

    // Should now send track/getAll to refresh
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(1));
    const getAllMsg = JSON.parse(ws.sentMessages[1]);
    expect(getAllMsg.command).toBe('track/getAll');

    // Respond to track/getAll
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: getAllMsg.id,
        success: true,
        payload: {
          tracks: [
            { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 },
          ],
        },
      }));
    });

    const ok = await promise;
    expect(ok).toBe(true);
    await vi.waitFor(() => {
      expect(result.current.tracks).toHaveLength(1);
    });
  });

  it('setTrackMute sends correct command', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setTrackMute(0, true);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('track/setMute');
    expect(sentMsg.trackIdx).toBe(0);
    expect(sentMsg.muted).toBe('true');

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

  it('updateTrack updates local tracks state', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    // First set some tracks
    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    // Manually inject tracks by calling refresh and responding
    const promise = result.current.refreshTracks();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    const msg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: msg.id,
        success: true,
        payload: {
          tracks: [
            { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 },
            { index: 1, name: 'Snare', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.7, pan: 0 },
          ],
        },
      }));
    });

    await promise;

    act(() => {
      result.current.updateTrack(0, { muted: true, volume: 0.5 });
    });

    expect(result.current.tracks[0].muted).toBe(true);
    expect(result.current.tracks[0].volume).toBe(0.5);
    expect(result.current.tracks[1].muted).toBe(false); // unchanged
  });

  it('toggleTrackMute toggles mute state using local track data', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    // Inject tracks
    let p = result.current.refreshTracks();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));
    let m = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: m.id, success: true,
        payload: { tracks: [{ index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 }] },
      }));
    });
    await p;
    await vi.waitFor(() => {
      expect(result.current.tracks).toHaveLength(1);
    });

    // Now toggle mute (track is not muted, so it should set to muted=true)
    p = result.current.toggleTrackMute(0);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(1));
    m = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(m.command).toBe('track/setMute');
    expect(m.muted).toBe('true'); // toggling: !false = true

    act(() => {
      ws.simulateMessage(JSON.stringify({ type: 'response', id: m.id, success: true, payload: {} }));
    });

    // Should trigger refresh
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(2));
    m = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(m.command).toBe('track/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response', id: m.id, success: true,
        payload: { tracks: [{ index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: true, soloed: false, armed: false, volume: 0.8, pan: 0 }] },
      }));
    });

    await p;
    await vi.waitFor(() => {
      expect(result.current.tracks[0]?.muted).toBe(true);
    });
  });

  it('setTrackRecordMode sends correct command', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.setTrackRecordMode(0, 7);
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('track/setRecordMode');
    expect(sentMsg.trackIdx).toBe(0);
    expect(sentMsg.recMode).toBe(7);

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

  it('recMode is included in track response from refreshTracks', async () => {
    const { result } = renderHook(() => useTrackState(), { wrapper: Wrapper });

    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull());
    const ws = MockWebSocket.lastInstance!;

    const promise = result.current.refreshTracks();
    await vi.waitFor(() => expect(ws.sentMessages.length).toBeGreaterThan(0));

    const sentMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(sentMsg.command).toBe('track/getAll');

    act(() => {
      ws.simulateMessage(JSON.stringify({
        type: 'response',
        id: sentMsg.id,
        success: true,
        payload: {
          tracks: [
            { index: 0, name: 'Kick', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, recMode: 0, volume: 0.8, pan: 0 },
            { index: 1, name: 'Synth', trackNumber: 2, selected: false, muted: false, soloed: false, armed: true, recMode: 7, volume: 0.6, pan: -0.3 },
          ],
        },
      }));
    });

    const tracks = await promise;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].recMode).toBe(0);
    expect(tracks[1].recMode).toBe(7);
  });
});

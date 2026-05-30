import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsClient } from '../lib/wsClient';

/** Creates a mock WebSocket that opens synchronously */
function createMockWsClass() {
  let instance: any = null;

  class MockWebSocket {
    static lastInstance: any = null;
    url: string;
    readyState = 1; // WebSocket.OPEN
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      (MockWebSocket as any).lastInstance = this;
      instance = this;
      // Fire onopen synchronously on construction
      setTimeout(() => { this.onopen?.(); }, 0);
    }

    send(data: string) { this.sentMessages.push(data); }
    close() { this.readyState = 3; this.onclose?.(); } // WebSocket.CLOSED = 3
    simulateMessage(data: string) { this.onmessage?.({ data }); }
  }

  return { MockWebSocket, getInstance: () => instance };
}

describe('WsClient', () => {
  let mockWsClass: ReturnType<typeof createMockWsClass>;

  beforeEach(() => {
    mockWsClass = createMockWsClass();
    WsClient.WebSocketFactory = mockWsClass.MockWebSocket as any;
  });

  afterEach(() => {
    WsClient.WebSocketFactory = null;
  });

  function createClient(opts: Record<string, any> = {}): WsClient {
    const client = new WsClient({ host: 'test.local', port: 9999, autoReconnect: false, ...opts });
    client.connect();
    return client;
  }

  function getMockWs(): any {
    return (mockWsClass.MockWebSocket as any).lastInstance;
  }

  it('connects and resolves URL correctly', async () => {
    createClient();
    await vi.waitFor(() => expect(getMockWs()).toBeDefined());
    const ws = getMockWs();
    expect(ws.url).toBe('ws://test.local:9999');
  });

  it('triggers onConnect callback when connected', async () => {
    const onConnect = vi.fn();
    createClient({ onConnect });
    await vi.waitFor(() => expect(onConnect).toHaveBeenCalled());
  });

  it('sends a command and resolves with response', async () => {
    const client = createClient();
    const ws = getMockWs();
    const promise = client.send('track/getAll');

    expect(ws.sentMessages.length).toBe(1);
    const sentMsg = JSON.parse(ws.sentMessages[0]);

    ws.simulateMessage(JSON.stringify({
      type: 'response',
      id: sentMsg.id,
      success: true,
      payload: { tracks: [] },
    }));

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.payload).toEqual({ tracks: [] });
  });

  it('rejects on command error response', async () => {
    const client = createClient();
    const ws = getMockWs();
    const promise = client.send('track/getAll');
    const sentMsg = JSON.parse(ws.sentMessages[0]);

    ws.simulateMessage(JSON.stringify({
      type: 'response',
      id: sentMsg.id,
      success: false,
      payload: { error: 'No track selected' },
    }));

    await expect(promise).rejects.toThrow('No track selected');
  });

  it('times out slow commands', async () => {
    const client = createClient();
    const promise = client.send('track/getAll', {}, 100);
    await expect(promise).rejects.toThrow('timed out');
  }, 5000);

  it('dispatches events to registered handlers', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('event:transport', handler);

    ws.simulateMessage(JSON.stringify({
      type: 'event', event: 'transport', payload: { playing: true },
    }));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'event', event: 'transport',
    }));
  });

  it('dispatches to wildcard handlers', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('*', handler);

    ws.simulateMessage(JSON.stringify({
      type: 'event', event: 'transport', payload: {},
    }));

    expect(handler).toHaveBeenCalled();
  });

  it('queues messages when disconnected and flushes on connect', async () => {
    const client = createClient();
    client.disconnect();

    // Send while disconnected
    client.send('transport/play');

    // Create a fresh mock for the reconnect
    const freshMock = createMockWsClass();
    WsClient.WebSocketFactory = freshMock.MockWebSocket as any;

    client.connect();

    const newWs = (freshMock.MockWebSocket as any).lastInstance;
    
    await vi.waitFor(() => {
      expect(newWs.sentMessages.length).toBeGreaterThan(0);
      expect(newWs.sentMessages[0]).toContain('transport/play');
    });
  });

  it('supports unsubscribe from events', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    const unsubscribe = client.on('event:transport', handler);
    unsubscribe();

    ws.simulateMessage(JSON.stringify({
      type: 'event', event: 'transport', payload: {},
    }));

    expect(handler).not.toHaveBeenCalled();
  });

  // Real-time track state event tests (Issue #57)
  it('dispatches track_mute_changed events to registered handlers', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('event:track_mute_changed', handler);

    ws.simulateMessage(JSON.stringify({
      type: 'event',
      event: 'track_mute_changed',
      payload: { trackIdx: 0, value: true },
    }));

    expect(handler).toHaveBeenCalledTimes(1);
    const msg = handler.mock.calls[0][0];
    expect(msg.payload).toEqual({ trackIdx: 0, value: true });
  });

  it('dispatches track_solo_changed events to registered handlers', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('event:track_solo_changed', handler);

    ws.simulateMessage(JSON.stringify({
      type: 'event',
      event: 'track_solo_changed',
      payload: { trackIdx: 2, value: false },
    }));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_solo_changed',
      payload: { trackIdx: 2, value: false },
    }));
  });

  it('dispatches track_arm_changed events with correct data', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('event:track_arm_changed', handler);

    ws.simulateMessage(JSON.stringify({
      type: 'event',
      event: 'track_arm_changed',
      payload: { trackIdx: 1, value: true },
    }));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      event: 'track_arm_changed',
      payload: { trackIdx: 1, value: true },
    }));
  });

  it('track state events do not interfere with other event types', () => {
    const client = createClient();
    const ws = getMockWs();
    const muteHandler = vi.fn();
    const fxHandler = vi.fn();
    const wildcardHandler = vi.fn();

    client.on('event:track_mute_changed', muteHandler);
    client.on('event:fx_param_changed', fxHandler);
    client.on('*', wildcardHandler);

    // Send a mute event
    ws.simulateMessage(JSON.stringify({
      type: 'event',
      event: 'track_mute_changed',
      payload: { trackIdx: 0, value: true },
    }));

    expect(muteHandler).toHaveBeenCalledTimes(1);
    expect(fxHandler).not.toHaveBeenCalled();
    expect(wildcardHandler).toHaveBeenCalledTimes(1);
  });

  it('handles multiple sequential track state events', () => {
    const client = createClient();
    const ws = getMockWs();
    const handler = vi.fn();
    client.on('*', handler);

    // Simulate a rapid sequence of track state changes
    const events = [
      { type: 'event', event: 'track_mute_changed', payload: { trackIdx: 0, value: true } },
      { type: 'event', event: 'track_solo_changed', payload: { trackIdx: 1, value: false } },
      { type: 'event', event: 'track_arm_changed', payload: { trackIdx: 2, value: true } },
      { type: 'event', event: 'track_mute_changed', payload: { trackIdx: 0, value: false } },
    ];

    for (const evt of events) {
      ws.simulateMessage(JSON.stringify(evt));
    }

    expect(handler).toHaveBeenCalledTimes(4);
  });
});

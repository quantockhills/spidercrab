/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastMidiClient } from '../lib/fastMidiClient';

function createMockWsClass() {
  class MockWebSocket {
    static lastInstance: any = null;
    url: string;
    readyState = 1; // WebSocket.OPEN
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.lastInstance = this;
      setTimeout(() => this.onopen?.(), 0);
    }

    send(data: string) { this.sentMessages.push(data); }
    close() { this.readyState = 3; this.onclose?.(); }
  }

  return { MockWebSocket };
}

describe('FastMidiClient', () => {
  let mockWsClass: ReturnType<typeof createMockWsClass>;

  beforeEach(() => {
    mockWsClass = createMockWsClass();
    FastMidiClient.WebSocketFactory = mockWsClass.MockWebSocket as any;
  });

  afterEach(() => {
    FastMidiClient.WebSocketFactory = null;
    vi.useRealTimers();
  });

  function createClient(opts: Record<string, any> = {}): FastMidiClient {
    const client = new FastMidiClient({
      host: 'test.local',
      port: 9225,
      autoReconnect: false,
      ...opts,
    });
    client.connect();
    return client;
  }

  function getMockWs(): any {
    return (mockWsClass.MockWebSocket as any).lastInstance;
  }

  it('connects to the fast port', async () => {
    createClient();
    await vi.waitFor(() => expect(getMockWs()).toBeDefined());
    expect(getMockWs().url).toBe('ws://test.local:9225');
  });

  it('sends noteOn with velocity and channel', async () => {
    createClient();
    await vi.waitFor(() => expect(getMockWs()).toBeDefined());
    const ws = getMockWs();

    ws.sentMessages = [];
    // wait for open so sends are not dropped
    await vi.waitFor(() => expect(ws.onopen).toBeDefined());
    // simulate open
    ws.onopen?.();

    const client = new FastMidiClient({ host: 'test.local', port: 9225, autoReconnect: false });
    (client as any).ws = ws;
    client.noteOn(60, 100, 0);

    expect(ws.sentMessages.length).toBe(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.type).toBe('command');
    expect(msg.command).toBe('midi/noteOn');
    expect(msg.note).toBe(60);
    expect(msg.velocity).toBe(100);
    expect(msg.channel).toBe(0);
  });

  it('sends noteOff as status 0x80 style command', async () => {
    const client = createClient();
    const ws = getMockWs();
    await vi.waitFor(() => expect(ws.onopen).toBeDefined());
    ws.onopen?.();

    (client as any).ws = ws;
    client.noteOff(60, 9);

    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.command).toBe('midi/noteOff');
    expect(msg.note).toBe(60);
    expect(msg.channel).toBe(9);
  });

  it('clamps out-of-range notes and velocities', async () => {
    const client = createClient();
    const ws = getMockWs();
    await vi.waitFor(() => expect(ws.onopen).toBeDefined());
    ws.onopen?.();

    (client as any).ws = ws;
    client.noteOn(999, 999);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.note).toBe(127);
    expect(msg.velocity).toBe(127);
  });

  it('drops notes while disconnected (no stale queue)', async () => {
    const client = new FastMidiClient({ host: 'test.local', port: 9225, autoReconnect: false });
    // never connected
    client.noteOn(60);
    expect(client.isConnected).toBe(false);
    expect((client as any).ws).toBeNull();
  });

  it('reconnects after close when autoReconnect is on', async () => {
    vi.useFakeTimers();
    const onDisconnect = vi.fn();
    const client = new FastMidiClient({
      host: 'test.local',
      port: 9225,
      autoReconnect: true,
      reconnectDelayMs: 100,
      onDisconnect,
    });
    client.connect();

    const first = getMockWs();
    await vi.waitFor(() => expect(first.onopen).toBeDefined());
    first.close(); // sets readyState=CLOSED and fires onclose

    expect(onDisconnect).toHaveBeenCalled();
    vi.advanceTimersByTime(150);

    await vi.waitFor(() => expect(getMockWs()).not.toBe(first));
    client.disconnect();
  });
});

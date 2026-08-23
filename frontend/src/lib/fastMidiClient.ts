// FastMidiClient — fire-and-forget note stream to the extension's
// low-latency endpoint (WebSocket port = main port + 1).
//
// The main WsClient rides REAPER's ~30Hz Run() dispatch, which adds up
// to 33ms of polling latency per note. The extension's FastMidiServer
// runs its own 1ms thread, so notes sent here bypass the Run() clock
// entirely. No request/response tracking — notes are one-way; a dropped
// frame is less harmful than a stalled gesture.

export interface FastMidiClientConfig {
  host?: string;
  port: number;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
}

export class FastMidiClient {
  // Override for testing — provide a custom WebSocket constructor
  static WebSocketFactory: typeof WebSocket | null = null;

  private ws: WebSocket | null = null;
  private config: Required<FastMidiClientConfig>;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: FastMidiClientConfig) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      onConnect: config.onConnect || (() => {}),
      onDisconnect: config.onDisconnect || (() => {}),
      onError: config.onError || (() => {}),
    };
  }

  get url(): string {
    return `ws://${this.config.host}:${this.config.port}`;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const WS = FastMidiClient.WebSocketFactory || WebSocket;
      this.ws = new WS(this.url);
    } catch (err) {
      this.config.onError?.(err as Error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => this.config.onConnect();
    this.ws.onclose = () => {
      this.config.onDisconnect();
      this.scheduleReconnect();
    };
    // onerror swallows errors — the close handler owns reconnect.
    this.ws.onerror = () => {};
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.config.autoReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  // -- Note API (fire and forget) --

  noteOn(note: number, velocity = 100, channel = 0): void {
    this.sendNote('midi/noteOn', note, velocity, channel);
  }

  noteOff(note: number, channel = 0): void {
    this.sendNote('midi/noteOff', note, 0, channel);
  }

  private sendNote(command: string, note: number, velocity: number, channel: number): void {
    const msg = {
      type: 'command',
      command,
      note: Math.max(0, Math.min(127, Math.round(note))),
      velocity: Math.max(0, Math.min(127, Math.round(velocity))),
      channel: channel & 0x0f,
    };
    this.send(JSON.stringify(msg));
  }

  private send(payload: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
    // No queue: notes are real-time, a stale queue would replay old
    // gestures. If the socket is down, the note is simply lost.
  }

  private scheduleReconnect(): void {
    if (!this.config.autoReconnect) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.config.reconnectDelayMs);
  }
}

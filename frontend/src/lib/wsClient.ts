// WebSocket client for connecting to the Reaper extension
// Wraps the native WebSocket API with auto-reconnect, message queuing,
// and typed message handling for the reaper-ipad protocol.

export type MessageHandler = (data: unknown) => void;

export interface ConnectionStatus {
  connected: boolean;
  host: string;
  port: number;
}

export interface WsClientConfig {
  host?: string;
  port?: number;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
}

// Protocol message types matching the C++ extension
export interface WsCommand {
  type: 'command';
  command: string;
  id?: string;
  [key: string]: unknown;
}

export interface WsResponse {
  type: 'response';
  id?: string;
  success: boolean;
  payload: Record<string, unknown>;
}

export interface WsEvent {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
}

export class WsClient {
  // Override for testing - provide a custom WebSocket constructor
  static WebSocketFactory: typeof WebSocket | null = null;

  private ws: WebSocket | null = null;
  private config: Required<WsClientConfig>;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private commandIdCounter = 0;
  private pendingCommands = new Map<string, {
    resolve: (val: WsResponse) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private messageQueue: string[] = [];

  constructor(config: WsClientConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port ?? 9224,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelayMs: config.reconnectDelayMs ?? 3000,
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
      const WS = WsClient.WebSocketFactory || WebSocket;
      this.ws = new WS(this.url);
    } catch (err) {
      this.config.onError(err as Error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.config.onConnect();
      // Flush queued messages
      for (const msg of this.messageQueue) {
        this.ws?.send(msg);
      }
      this.messageQueue = [];
    };

    this.ws.onclose = () => {
      this.config.onDisconnect();
      this.scheduleReconnect();
    };

    this.ws.onerror = (_ev) => {
      this.config.onError(new Error('WebSocket error'));
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsResponse | WsEvent;

        if (msg.type === 'response' && msg.id && this.pendingCommands.has(msg.id)) {
          const pending = this.pendingCommands.get(msg.id)!;
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(msg.id);
          if (msg.success) {
            pending.resolve(msg);
          } else {
            pending.reject(new Error((msg.payload as any)?.error || 'Command failed'));
          }
        }

        // Dispatch to wildcard handlers
        this.dispatch('*', msg);

        // Dispatch to event-specific handlers
        if (msg.type === 'event') {
          this.dispatch(`event:${msg.event}`, msg);
        }
      } catch {
        // Invalid JSON — ignore
      }
    };
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

  send(command: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<WsResponse> {
    return new Promise((resolve, reject) => {
      const id = `cmd_${++this.commandIdCounter}`;
      const msg: WsCommand = { type: 'command', command, id, ...params };
      const payload = JSON.stringify(msg);

      // Set up pending command
      this.pendingCommands.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingCommands.delete(id);
          reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      });

      // Send or queue
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(payload);
      } else {
        this.messageQueue.push(payload);
      }
    });
  }

  // Subscribe to messages (event type or '*' for all)
  on(pattern: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);
    return () => this.handlers.get(pattern)?.delete(handler);
  }

  private dispatch(pattern: string, data: unknown): void {
    this.handlers.get(pattern)?.forEach((h) => {
      try { h(data); } catch { /* handler error */ }
    });
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

// Factory for test mocking
export function createMockClient(): WsClient {
  return new WsClient({ autoReconnect: false });
}

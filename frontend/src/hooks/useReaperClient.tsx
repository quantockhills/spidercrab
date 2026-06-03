/* eslint-disable react-refresh/only-export-components */
// This file deliberately exports the context, provider, and consumer hook together.
// Separating them would require circular type references or duplicating the context type.

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { WsClient } from '../lib/wsClient';
import type { WsResponse } from '../lib/wsClient';

// ── Context types ────────────────────────────────────────────

export interface ReaperClientContextValue {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Send a command to the REAPER extension */
  send: (command: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<WsResponse>;
  /** Subscribe to events from the WS client. Returns an unsubscribe function. */
  onEvent: (pattern: string, handler: (data: unknown) => void) => () => void;
  /** Low-level access to the WsClient ref (for advanced usage) */
  clientRef: React.MutableRefObject<WsClient | null>;
}

// ── Context + Provider ───────────────────────────────────────

const ReaperClientContext = createContext<ReaperClientContextValue | null>(null);

interface ReaperClientProviderProps {
  children: ReactNode;
  host?: string;
  port?: number;
}

export function ReaperClientProvider({
  children,
  host = '127.0.0.1',
  port = 9224,
}: ReaperClientProviderProps) {
  const clientRef = useRef<WsClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new WsClient({
      host,
      port,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onError: (err) => console.error('[reaper-ipad]', err),
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [host, port]);

  const send = useCallback(
    (command: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<WsResponse> => {
      if (!clientRef.current) {
        return Promise.reject(new Error('Not connected'));
      }
      return clientRef.current.send(command, params || {}, timeoutMs);
    },
    [],
  );

  const onEvent = useCallback(
    (pattern: string, handler: (data: unknown) => void): (() => void) => {
      if (!clientRef.current) return () => {};
      return clientRef.current.on(pattern, handler);
    },
    [],
  );

  const value: ReaperClientContextValue = {
    connected,
    send,
    onEvent,
    clientRef,
  };

  return (
    <ReaperClientContext.Provider value={value}>
      {children}
    </ReaperClientContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────

export function useReaperClient(): ReaperClientContextValue {
  const ctx = useContext(ReaperClientContext);
  if (!ctx) {
    throw new Error('useReaperClient must be used within a <ReaperClientProvider>');
  }
  return ctx;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReaperClient } from '../hooks/useReaperClient';
import { FastMidiClient } from '../lib/fastMidiClient';
import { PadInstrument } from './PadInstrument';
import { GridView, type GridViewProps } from './grid/GridView';

// Keys: a performance surface (scale pad grid) next to the selected
// track's FX grid, so notes and parameter tweaks happen in one view.
//
// Notes ride the low-latency fast socket (main port + 1, 1ms thread on
// the extension side). When it is down, they fall back to the main
// WebSocket, which is slower (~30Hz) but still works.
export function KeysView(props: GridViewProps) {
  const { clientRef, send, connected } = useReaperClient();
  const fastRef = useRef<FastMidiClient | null>(null);
  const initializedRef = useRef(false);
  const [fastConnected, setFastConnected] = useState(false);

  // The provider creates the main client in its own effect, which runs
  // after this one — so wait until the main socket exists (connected
  // flips true) before deriving the fast port from its URL.
  useEffect(() => {
    if (initializedRef.current) return;
    const url = clientRef.current?.url; // ws://host:port
    if (!url) return;
    const match = url.match(/^ws:\/\/([^:]+):(\d+)$/);
    const host = match?.[1] || 'localhost';
    const port = match ? Number(match[2]) : 9224;

    initializedRef.current = true;
    const client = new FastMidiClient({
      host,
      port: port + 1,
      onConnect: () => setFastConnected(true),
      onDisconnect: () => setFastConnected(false),
    });
    fastRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      fastRef.current = null;
      initializedRef.current = false;
    };
  }, [clientRef, connected]);

  const noteOn = useCallback((note: number, velocity: number) => {
    if (fastRef.current?.isConnected) {
      fastRef.current.noteOn(note, velocity);
    } else {
      send('midi/noteOn', { note, velocity }).catch(() => {});
    }
  }, [send]);

  const noteOff = useCallback((note: number) => {
    if (fastRef.current?.isConnected) {
      fastRef.current.noteOff(note);
    } else {
      send('midi/noteOff', { note }).catch(() => {});
    }
  }, [send]);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-1/2 flex-shrink-0 border-r border-[var(--border)] min-h-0">
        <PadInstrument noteOn={noteOn} noteOff={noteOff} connected={fastConnected} />
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <GridView {...props} />
      </div>
    </div>
  );
}

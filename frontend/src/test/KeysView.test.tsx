/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { ReaperClientProvider } from '../hooks/useReaperClient';
import { WsClient } from '../lib/wsClient';
import { FastMidiClient } from '../lib/fastMidiClient';
import { KeysView } from '../components/KeysView';
import { resetPadConfigStore } from '../utils/padConfigStore';

vi.mock('../components/grid/GridView', () => ({
  GridView: () => <div data-testid="grid-view" />,
}));

function createMockWsClass() {
  class MockWebSocket {
    static instances: any[] = [];
    url: string;
    readyState = 1;
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      MockWebSocket.instances.push(this);
      setTimeout(() => this.onopen?.(), 0);
    }

    send(data: string) { this.sentMessages.push(data); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  return { MockWebSocket };
}

describe('KeysView', () => {
  let mockWsClass: ReturnType<typeof createMockWsClass>;

  beforeEach(() => {
    mockWsClass = createMockWsClass();
    (WsClient as any).WebSocketFactory = mockWsClass.MockWebSocket;
    (FastMidiClient as any).WebSocketFactory = mockWsClass.MockWebSocket;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    document.elementFromPoint = vi.fn(() => null) as any;
    resetPadConfigStore();
  });

  afterEach(() => {
    (WsClient as any).WebSocketFactory = null;
    (FastMidiClient as any).WebSocketFactory = null;
    vi.clearAllMocks();
  });

  function renderKeys() {
    return render(
      <ReaperClientProvider host="test.local" port={9224}>
        <KeysView
          tracks={[]}
          selectedTrack={null}
          getTrackFx={async () => []}
          getFxParams={async () => ({ params: [], total: 0, offset: 0, limit: 0 })}
          setFxParam={async () => ({ type: 'response', success: true, payload: {} })}
          onEvent={() => () => {}}
        />
      </ReaperClientProvider>,
    );
  }

  function fastSocket(): any {
    return mockWsClass.MockWebSocket.instances.find((w: any) => w.url.endsWith(':9225'));
  }

  it('opens a fast socket on port+1 alongside the main one', async () => {
    renderKeys();
    await waitFor(() => expect(fastSocket()).toBeDefined());
    expect(mockWsClass.MockWebSocket.instances.some((w: any) => w.url.endsWith(':9224'))).toBe(true);
    expect(fastSocket().url).toMatch(/^ws:\/\/test\.local:9225$/);
  });

  it('sends notes over the fast socket when a pad is pressed', async () => {
    renderKeys();
    await waitFor(() => expect(fastSocket()).toBeDefined());
    await waitFor(() => expect(fastSocket().onopen).toBeDefined());
    fastSocket().onopen?.();

    const c4 = screen.getByLabelText('Pad C4');
    fireEvent.pointerDown(c4, { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(c4, { pointerId: 1 });

    await waitFor(() => expect(fastSocket().sentMessages.length).toBe(2));
    const on = JSON.parse(fastSocket().sentMessages[0]);
    const off = JSON.parse(fastSocket().sentMessages[1]);
    expect(on.command).toBe('midi/noteOn');
    expect(on.note).toBe(60);
    expect(off.command).toBe('midi/noteOff');
    expect(off.note).toBe(60);
  });

  it('shows the FX grid on the right half', async () => {
    renderKeys();
    await waitFor(() => expect(screen.getByTestId('grid-view')).toBeDefined());
    expect(screen.getByLabelText('Pad C4')).toBeDefined();
  });

  it('grid toggle swaps 16 pads + grid for 32 pads full width', async () => {
    renderKeys();
    await waitFor(() => expect(screen.getByTestId('grid-view')).toBeDefined());
    expect(screen.getAllByLabelText(/^Pad /)).toHaveLength(16);

    fireEvent.click(screen.getByLabelText('Toggle FX grid'));

    await waitFor(() => expect(screen.queryByTestId('grid-view')).toBeNull());
    expect(screen.getAllByLabelText(/^Pad /)).toHaveLength(32);
    expect(screen.getByText('Grid: off')).toBeDefined();

    // Back again
    fireEvent.click(screen.getByLabelText('Toggle FX grid'));
    await waitFor(() => expect(screen.getByTestId('grid-view')).toBeDefined());
    expect(screen.getAllByLabelText(/^Pad /)).toHaveLength(16);
  });
});

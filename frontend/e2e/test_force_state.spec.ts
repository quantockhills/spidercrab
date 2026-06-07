import { test, expect } from '@playwright/test';

test.describe('Force State', () => {
  test('Force state update via React internals', async ({ page }) => {
    test.setTimeout(30000);

    await page.addInitScript(() => {
      class MockWebSocket {
        readyState = 0;
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 3;
        onopen: ((ev: any) => void) | null = null;
        onclose: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;
        onmessage: ((ev: any) => void) | null = null;
        constructor(public url: string) {
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.({});
          }, 50);
        }
        send(data: string): void {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'command') {
              const { command, id } = msg;
              // Just send responses, no progress events
              setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify({
                  type: 'response', id, success: true,
                  payload: command === 'track/getAll' 
                    ? { tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] }
                    : { success: true }
                })});
              }, 30);
            }
          } catch (e) {}
        }
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('sampleIndex') || t.includes('Scanning') || t.includes('Indexing') || t.includes('[FORCE]')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // First, let's manually trigger the React state via our mock WS client
    // We need to find the wsClient instance and send an event
    const result = await page.evaluate(() => {
      // Try to find the WsClient by looking through React fiber tree
      const rootEl = document.getElementById('root');
      if (!rootEl) return 'no root';

      // Access React internal fiber
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return 'no fiber';

      // Walk the fiber tree to find state
      console.log('[FORCE] found fiber');
      
      // Since we can't easily access the client, let's directly modify the DOM
      // to check if the UI changes when we add the right state
      
      return 'fiber found';
    });
    console.log('Result:', result);

    // Let's try a different approach: directly fire the event through wsClient
    // by getting the client reference
    await page.evaluate(() => {
      // The wsClient uses WebSocket, and we mocked it. Our mock sends responses.
      // But the wsClient receives them via onmessage. We can't directly access it.
      
      // Let's find the handlers by checking the window object for the WsClient prototype
      // We'll inject a getter on the mock WebSocket that logs when messages are received
      console.log('[FORCE] trying to find WsClient...');
    });

    // Actually, let me try a COMPLETELY different approach.
    // Let me use page.evaluate to directly send a WebSocket event
    // by intercepting the WebSocket's onmessage
    
    // First, let me check what the actual issue is by simulating
    // what the wsClient does when it receives an event
    await page.evaluate(() => {
      // The wsClient.onmessage handler does:
      // 1. Parse JSON
      // 2. If type === 'event', log it
      // 3. Dispatch to 'event:xyz' handlers
      
      // The handlers were registered via onEvent. Let me try to find them
      // by looking at the wsClient's handlers Map.
      
      // Actually, we can find the WsClient by looking at all objects
      // that have a 'handlers' Map property
      function findWsClient(obj: any, depth = 0): any {
        if (depth > 5 || !obj || typeof obj !== 'object') return null;
        try {
          if (obj.handlers instanceof Map) {
            console.log('[FORCE] Found WsClient with handlers:', [...obj.handlers.keys()]);
            return obj;
          }
          // Check common properties
          if (obj.current && obj.current.handlers instanceof Map) {
            console.log('[FORCE] Found WsClient in ref:', [...obj.current.handlers.keys()]);
            return obj.current;
          }
          for (const key of Object.getOwnPropertyNames(obj)) {
            const val = obj[key];
            if (val && typeof val === 'object') {
              const found = findWsClient(val, depth + 1);
              if (found) return found;
            }
          }
        } catch (e) {}
        return null;
      }
      
      setTimeout(() => {
        const wsClient = findWsClient(window);
        if (wsClient) {
          console.log('[FORCE] Found client, triggering event...');
          // Manually dispatch the event
          wsClient.dispatch('event:sampleIndexProgress', {
            type: 'event',
            event: 'sampleIndexProgress',
            payload: { scanned: 2500, total: 5000, status: 'scanning' }
          });
          console.log('[FORCE] Dispatched!');
        } else {
          console.log('[FORCE] Could not find WsClient');
        }
      }, 3000);
    });

    await page.waitForTimeout(6000);

    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', finalText.includes('Scanning'));
    console.log('Has Indexing:', finalText.includes('Indexing'));
    
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-force-state.png' });
  });
});

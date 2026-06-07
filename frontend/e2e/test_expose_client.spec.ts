import { test, expect } from '@playwright/test';

test.describe('Expose Client', () => {
  test('Expose wsClient on window and debug', async ({ page }) => {
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
              setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify({
                  type: 'response', id, success: true,
                  payload: command === 'track/getAll'
                    ? { tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] }
                    : { success: true }
                })});
              }, 30);
              if (command === 'sample/refreshCache') {
                setTimeout(() => {
                  this.onmessage?.({ data: JSON.stringify({
                    type: 'event', event: 'sampleIndexProgress',
                    payload: { scanned: 500, total: 5000, status: 'scanning' }
                  })});
                }, 200);
              }
            }
          } catch (e) {}
        }
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    // Also inject code to expose wsClient after React renders
    await page.addInitScript(() => {
      // We'll poll to find the WsClient after page load
      // by patching WsClient.prototype to expose instances
      const origOn = (window as any).__origWsClientOn;
      
      // After module loads, we need to find the WsClient class
      // Since we can't easily import it, let's use a different approach:
      // patch the WebSocket mock to capture the wsClient reference
      
      // Actually, the WsClient instance is stored in useRef in the React component tree.
      // We can find it by looking at the WebSocket mock's onmessage callback.
      // The wsClient sets this.ws.onmessage = (ev) => { ... }
      // So when our mock's onmessage is called, it's from the wsClient.
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('registered') || t.includes('event received') || t.includes('ERROR') || t.includes('[WS_EXPOSE]')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Try to capture the wsClient by patching the WebSocket's onmessage setter
    // When wsClient sets this.ws.onmessage = handler, we save a reference to the wsClient
    await page.evaluate(() => {
      // The MockWebSocket is our mocked class. 
      // When wsClient creates `this.ws = new WebSocket(this.url)`, it gets a MockWebSocket instance.
      // Then wsClient sets `this.ws.onmessage = (ev) => { ... }` which is the wsClient's message handler.
      // We can intercept this by patching the onmessage setter.
      
      const MockClass = window.WebSocket as any;
      
      // All MockWebSocket instances share a prototype. Let's intercept the onmessage setter.
      const instances: any[] = [];
      const origConstructor = MockClass;
      
      // After instances are created, intercept onmessage assignment
      Object.defineProperty(MockClass.prototype, 'onmessage', {
        set(handler: any) {
          console.log('[WS_EXPOSE] onmessage being set!');
          // Store it
          this._onmessage = handler;
          // The handler is the wsClient's message handler.
          // We can store it globally for later use
          (window as any).__lastWsMessageHandler = handler;
        },
        get() {
          return this._onmessage;
        },
        configurable: true,
      });
      
      console.log('[WS_EXPOSE] Patched onmessage setter');
    });

    await page.waitForTimeout(2000);

    // Now go to Settings and click refresh
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Before clicking, let's manually try to trigger the handler
    const handlerResult = await page.evaluate(() => {
      const handler = (window as any).__lastWsMessageHandler;
      if (!handler) return 'no handler found';
      
      console.log('[WS_EXPOSE] Found handler, calling directly...');
      
      // Simulate the event that wsClient would dispatch
      const mockEvent = {
        data: JSON.stringify({
          type: 'event',
          event: 'sampleIndexProgress',
          payload: { scanned: 2500, total: 5000, status: 'scanning' }
        })
      };
      
      try {
        handler(mockEvent);
        console.log('[WS_EXPOSE] Handler called successfully');
        return 'handler called';
      } catch (e: any) {
        console.log('[WS_EXPOSE] Handler error:', e.message, e.stack);
        return 'error: ' + e.message;
      }
    });
    console.log('Direct handler call result:', handlerResult);

    await page.waitForTimeout(2000);

    // Now click the actual refresh button
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh');

    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', text.includes('Scanning'));
    console.log('Has Indexing:', text.includes('Indexing'));
  });
});

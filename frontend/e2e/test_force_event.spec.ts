import { test, expect } from '@playwright/test';

test.describe('Force Event', () => {
  test('Use addInitScript to patch WsClient and intercept dispatch', async ({ page }) => {
    test.setTimeout(30000);

    await page.addInitScript(() => {
      // First, save the original dispatch method
      // We'll find it by patching the on method
      const origOn = WsClient?.prototype?.on;
      
      // Use a MutationObserver to detect when WsClient is loaded
      // But WsClient is a module, so we can't access it directly here.
      
      // Instead, let's just mock the WebSocket and track everything
      class MockWebSocket {
        readyState = 0;
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 3;
        onopen: ((ev: any) => void) | null = null;
        onclose: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;
        onmessage: ((ev: any) => void) | null = null;
        
        // Store the reference to the wsClient's onmessage handler
        private _wsClientHandler: ((ev: any) => void) | null = null;
        
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
              // Send response
              setTimeout(() => {
                this._triggerMessage({ type: 'response', id, success: true,
                  payload: command === 'track/getAll'
                    ? { tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] }
                    : { success: true }
                });
              }, 30);
              
              // For refreshCache, send progress event
              if (command === 'sample/refreshCache') {
                setTimeout(() => {
                  this._triggerMessage({
                    type: 'event',
                    event: 'sampleIndexProgress',
                    payload: { scanned: 500, total: 5000, status: 'scanning' }
                  });
                }, 200);
              }
            }
          } catch (e) {}
        }
        
        private _triggerMessage(msg: any): void {
          const json = JSON.stringify(msg);
          // Call onmessage as the browser would
          if (this.onmessage) {
            // This is the arrow function from wsClient: (ev) => { ... }
            // It captures `this` (the WsClient) via closure
            this.onmessage({ data: json, type: 'message' } as any);
          }
        }
        
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      console.log(`[${msg.type()}] ${t}`);
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Go to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Click refresh
    const refreshBtn = page.locator('button:has-text("Refresh Sample Index")');
    await refreshBtn.click();
    console.log('=== CLICKED ===');

    await page.waitForTimeout(5000);

    const text = await page.evaluate(() => document.body.innerText);
    console.log('=== RESULT ===');
    console.log('Scanning:', text.includes('Scanning'));
    console.log('Indexing:', text.includes('Indexing'));
    console.log('Snippet:', text.substring(200, 500));
  });
});

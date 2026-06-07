import { test, expect } from '@playwright/test';

test.describe('Inspect Handlers', () => {
  test('Check if event handlers trigger React state', async ({ page }) => {
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
              this.handleCommand(msg);
            }
          } catch (e) {}
        }
        private handleCommand(msg: any): void {
          const { command, id } = msg;
          const sendResponse = (payload: any) => {
            setTimeout(() => {
              this.onmessage?.({ data: JSON.stringify({ type: 'response', id, success: true, payload }) });
            }, 30);
          };
          switch (command) {
            case 'track/getAll':
              sendResponse({ tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] });
              break;
            case 'sample/refreshCache':
              sendResponse({ total: 5000, rootPath: '/samples' });
              // Send progress events
              [500, 1000, 1500].forEach((scanned, i) => {
                setTimeout(() => {
                  this.onmessage?.({ data: JSON.stringify({
                    type: 'event', event: 'sampleIndexProgress',
                    payload: { scanned, total: 5000, status: 'scanning' }
                  })});
                }, 200 + i * 300);
              });
              break;
            default:
              sendResponse({ success: true });
          }
        }
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Check if connected
    const statusText = await page.evaluate(() => {
      const text = document.body.innerText;
      return { connected: text.includes('Connected'), disconnected: text.includes('Disconnected') };
    });
    console.log('Status:', JSON.stringify(statusText));

    // Now inject a global listener to trace React state changes
    await page.evaluate(() => {
      // Monkey-patch React's setState for the sampleIndexProgress state
      const origDefineProperty = Object.defineProperty;
      // We'll watch for the specific React component
      console.log('[DEBUG] Setting up state watcher');
      
      // Patch wsClient dispatch to log what handlers are called
      // Find the WsClient instance by looking for the handlers map
      const checkHandlers = () => {
        // Look for any property on window that has a handlers Map
        const keys = Object.keys(window);
        for (const key of keys) {
          const val = (window as any)[key];
          if (val && typeof val === 'object' && val.handlers instanceof Map) {
            console.log('[DEBUG] Found WsClient! Handlers keys:', [...val.handlers.keys()]);
            // Wrap the dispatch method
            const origDispatch = val.dispatch.bind(val);
            val.dispatch = (pattern: string, data: any) => {
              console.log('[DEBUG] dispatch called:', pattern, 'data:', JSON.stringify(data).substring(0, 100));
              const handlers = val.handlers.get(pattern);
              console.log('[DEBUG] handlers for', pattern, ':', handlers ? handlers.size : 0);
              if (handlers) {
                handlers.forEach((h: Function) => {
                  try {
                    console.log('[DEBUG] calling handler...');
                    h(data);
                    console.log('[DEBUG] handler returned');
                  } catch (e: any) {
                    console.log('[DEBUG] handler ERROR:', e.message);
                  }
                });
              }
              // Also call original
              origDispatch(pattern, data);
            };
          }
        }
      };
      setTimeout(checkHandlers, 2000);
    });

    // Wait for patch to apply
    await page.waitForTimeout(2000);

    // Click refresh
    const refreshBtn = page.locator('button:has-text("Refresh Sample Index")');
    await refreshBtn.click();
    console.log('Clicked refresh');

    await page.waitForTimeout(5000);
    
    // Check final state
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', finalText.includes('Scanning'));
    console.log('Has Indexing:', finalText.includes('Indexing'));
  });
});

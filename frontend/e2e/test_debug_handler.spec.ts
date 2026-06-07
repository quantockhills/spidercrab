import { test, expect } from '@playwright/test';

test.describe('Debug Handler', () => {
  test('Debug if event handler fires', async ({ page }) => {
    test.setTimeout(30000);

    // Mock WebSocket at script level
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
              let response: any = { type: 'response', id: msg.id, success: true };
              switch (msg.command) {
                case 'track/getAll':
                  response.payload = { tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] };
                  break;
                case 'sample/refreshCache':
                  response.payload = { total: 5000, rootPath: '/samples' };
                  break;
                default:
                  response.payload = { success: true };
              }
              setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify(response) });
              }, 50);
            }
          } catch (e) {}
        }
        close(): void {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.({ code: 1000 });
        }
        addEventListener() {}
        removeEventListener() {}
      }
      (window as any).NativeWebSocket = window.WebSocket;
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      // Log everything
      if (t.includes('handler') || t.includes('dispatch') || t.includes('sampleIndex') || t.includes('state') || t.includes('setSample') || t.includes('scanning') || t.includes('Scanning')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Patch the wsClient to log when dispatching our event
    await page.evaluate(() => {
      // Monkey-patch the dispatch method to trace sampleIndexProgress
      const origDispatch = (window as any).__origDispatch;
      console.log('[DEBUG] trying to find wsClient...');
    });

    // Go to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Add a global debug listener
    await page.evaluate(() => {
      // Listen for all wsClient events by patching onmessage handler
      // We can use the existing registered handlers
      console.log('[DEBUG] about to click refresh');
    });

    // Click refresh
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh');

    // Wait for event
    await page.waitForTimeout(5000);

    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('Final text includes Scanning:', finalText.includes('Scanning'));
    console.log('Final text includes Indexing:', finalText.includes('Indexing'));
    console.log('Final text snippet:', finalText.substring(200, 500));
  });
});

import { test, expect } from '@playwright/test';

test.describe('Full Mock', () => {
  test('Sample index progress with proper event flow', async ({ page }) => {
    test.setTimeout(30000);

    // Mock WebSocket
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
          // Simulate async connection
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
              this.onopen({});
            }
          }, 50);
        }

        send(data: string): void {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'command') {
              this.handleCommand(msg);
            }
          } catch (e) {
            console.error('[MockWS] parse error');
          }
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
              // Send response first
              sendResponse({ total: 5000, rootPath: '/samples' });
              // Then send progress event
              setTimeout(() => {
                console.log('[MockWS] sending progress event');
                this.onmessage?.({ data: JSON.stringify({
                  type: 'event',
                  event: 'sampleIndexProgress',
                  payload: { scanned: 500, total: 5000, status: 'scanning' }
                })});
                // Send another after a bit
                setTimeout(() => {
                  this.onmessage?.({ data: JSON.stringify({
                    type: 'event',
                    event: 'sampleIndexProgress',
                    payload: { scanned: 1000, total: 5000, status: 'scanning' }
                  })});
                }, 1000);
              }, 200);
              break;

            default:
              sendResponse({ success: true });
          }
        }

        close(): void {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.({ code: 1000 });
        }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('sampleIndexProgress') || t.includes('sampleIndex') || t.includes('Scanning') || t.includes('dispatch') || t.includes('handler') || t.includes('[MockWS]')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Check connected state
    const isConnected = await page.evaluate(() => document.body.innerText.includes('Connected'));
    console.log('Connected:', isConnected);

    // Click Refresh Sample Index
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh at', Date.now());

    // Wait and check
    await page.waitForTimeout(5000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', bodyText.includes('Scanning'));
    console.log('Has Indexing:', bodyText.includes('Indexing'));
    
    // Also take screenshot
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-full-mock.png' });
  });
});

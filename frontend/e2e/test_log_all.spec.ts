import { test, expect } from '@playwright/test';

test.describe('Log All', () => {
  test('Log ALL console messages', async ({ page }) => {
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

    const allLogs: string[] = [];
    page.on('console', msg => {
      const t = msg.text();
      allLogs.push(`[${msg.type()}] ${t}`);
    });
    page.on('pageerror', err => allLogs.push(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Go to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Click refresh
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh');

    await page.waitForTimeout(3000);

    // Print ALL logs for the last 3 seconds
    const recentLogs = allLogs.filter(l => !l.includes('registered handler') && !l.includes('vite'));
    for (const l of recentLogs) {
      console.log(l);
    }

    // Final check
    const text = await page.evaluate(() => document.body.innerText);
    console.log('=== DOM TEXT SNIPPET ===');
    console.log(text.substring(200, 500));
    console.log('========================');
    console.log('Has Scanning:', text.includes('Scanning'));
    console.log('Has Indexing:', text.includes('Indexing'));
  });
});

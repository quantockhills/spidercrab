import { test, expect } from '@playwright/test';

test.describe('State Check', () => {
  test('Check React state after refresh click', async ({ page }) => {
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
              // Also send progress event
              if (msg.command === 'sample/refreshCache') {
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
      if (t.includes('sampleIndexProgress') || t.includes('sampleIndex') || t.includes('error') || t.includes('state') || t.includes('Scanning')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Go to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Check initial state
    const initialSampleState = await page.evaluate(() => {
      // We need to access React state somehow
      // Let's check the DOM for the progress bar
      const progressText = document.body.innerText;
      return {
        showsConnected: progressText.includes('Connected'),
        showsScanning: progressText.includes('Scanning'),
        showsIndexing: progressText.includes('Indexing'),
        showsRefreshSample: progressText.includes('Refresh Sample Index'),
      };
    });
    console.log('Initial state:', JSON.stringify(initialSampleState));

    // Click refresh
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh at', Date.now());

    // Wait and check state over time
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          showsScanning: text.includes('Scanning'),
          showsIndexing: text.includes('Indexing'),
          showsRefreshSample: text.includes('Refresh Sample Index'),
          hasProgressEvent: false,
        };
      });
      console.log(`Second ${i+1}:`, JSON.stringify(state));
      if (state.showsScanning) {
        console.log('SUCCESS: Scanning text visible!');
        break;
      }
    }

    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-state-check.png' });
  });
});

import { test, expect } from '@playwright/test';

test.describe('Patched WebSocket', () => {
  test('Sample index progress with patched WS', async ({ page }) => {
    test.setTimeout(60000);

    // Patch WebSocket to always connect and respond to commands
    await page.addInitScript(() => {
      interface PendingCmd {
        resolve: (data: any) => void;
        reject: (err: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
      }

      class MockWebSocket {
        readyState = 0;
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 3;
        
        onopen: ((ev: any) => void) | null = null;
        onclose: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;
        onmessage: ((ev: any) => void) | null = null;
        
        private pendingCommands = new Map<string, PendingCmd>();
        private cmdIdCounter = 0;
        private progressIntervals: ReturnType<typeof setInterval>[] = [];

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
          } catch (e) {
            console.error('[MockWS] parse error:', e);
          }
        }

        close(): void {
          this.readyState = MockWebSocket.CLOSED;
          this.progressIntervals.forEach(clearInterval);
          this.onclose?.({ code: 1000, reason: 'Mock close' });
        }

        private handleCommand(msg: any): void {
          const { command, id } = msg;
          let response: any = { type: 'response', id, success: true };

          switch (command) {
            case 'track/getAll':
              response.payload = {
                tracks: [
                  { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
                ]
              };
              this.sendToPage(response);
              break;

            case 'sample/refreshCache':
              response.payload = { total: 5000, rootPath: '/samples' };
              this.sendToPage(response);
              // Send progress events
              let progress = 0;
              const total = 5000;
              const interval = setInterval(() => {
                progress += 500;
                if (progress > total) progress = total;
                this.sendToPage({
                  type: 'event',
                  event: 'sampleIndexProgress',
                  payload: { scanned: progress, total, status: 'scanning' },
                });
                if (progress >= total) {
                  clearInterval(interval);
                  setTimeout(() => {
                    this.sendToPage({
                      type: 'event',
                      event: 'sampleIndexComplete',
                      payload: { total, rootPath: '/samples' },
                    });
                  }, 500);
                }
              }, 300);
              break;

            case 'transport/getState':
              response.payload = { playing: false, recording: false };
              this.sendToPage(response);
              break;

            default:
              response.payload = { success: true };
              this.sendToPage(response);
          }
        }

        private sendToPage(data: any): void {
          setTimeout(() => {
            if (this.readyState === MockWebSocket.OPEN && this.onmessage) {
              this.onmessage({ data: JSON.stringify(data) });
            }
          }, 10);
        }

        addEventListener() {}
        removeEventListener() {}
      }

      (window as any).__MockWebSocket = MockWebSocket;
    });

    // After init script, the mock is set up but not active yet.
    // We need to tell wsClient to use our mock.
    // The WsClient has a static WebSocketFactory field.
    // But since the module hasn't loaded yet, we need to patch after load.
    // Instead, let's override the native WebSocket.
    await page.addInitScript(() => {
      (window as any).NativeWebSocket = window.WebSocket;
      window.WebSocket = (window as any).__MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('sampleIndexProgress') || t.includes('connected') || t.includes('error') || t.includes('Scanning') || t.includes('scanning') || t.includes('Connected') || t.includes('Disconnected')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 2360, height: 1640 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // ── Step 1: Navigate to Settings ──
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Check connection status
    const settingsText = await page.evaluate(() => document.body.innerText);
    console.log('Connection status:', settingsText.includes('Connected') ? 'Connected' : 'Disconnected');

    // Verify Refresh Sample Index button
    const refreshBtn = page.locator('button:has-text("Refresh Sample Index")');
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════
    // Screenshot 1: Settings with Refresh button
    // ════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-settings-refresh-btn.png' });

    // ── Step 2: Click refresh ──
    await refreshBtn.click();
    await page.waitForTimeout(500);

    // Wait for scanning state
    await expect(page.getByText('Scanning Samples...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Indexing samples:')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(2000);

    // ════════════════════════════════════
    // Screenshot 2: Progress bar during scan
    // ════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-progress-bar-active.png' });

    // ── Step 3: Wait for completion ──
    await page.waitForTimeout(6000);

    await expect(page.getByText('Indexing samples:')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Refresh Sample Index")')).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════
    // Screenshot 3: After completion
    // ════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-progress-complete.png' });
  });
});

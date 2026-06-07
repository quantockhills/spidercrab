/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/spidercrab-playtime/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

test.describe('Issue #107 — Sample Index Cache Screenshots', () => {
  test.setTimeout(90000);

  test('Capture sample index progress bar and settings refresh button', async ({ page }) => {
    // Inject mock WebSocket before page loads (replaces routeWebSocket which doesn't
    // trigger onopen in React Strict Mode — see main.tsx StrictMode removal)
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
              const sendResponse = (payload: any) => {
                setTimeout(() => {
                  this.onmessage?.({
                    data: JSON.stringify({ type: 'response', id, success: true, payload }),
                  });
                }, 30);
              };
              switch (command) {
                case 'track/getAll':
                  sendResponse({
                    tracks: [
                      { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
                      { index: 1, name: 'Track 2', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
                    ],
                  });
                  break;
                case 'sample/getDirectory':
                  sendResponse({
                    entries: [
                      { name: 'Kick.wav', type: 'file', size: 2048576 },
                      { name: 'Snare.wav', type: 'file', size: 1024576 },
                      { name: 'HiHat.wav', type: 'file', size: 512576 },
                      { name: 'Bass.wav', type: 'file', size: 4096576 },
                      { name: 'Piano.wav', type: 'file', size: 8192576 },
                      { name: 'Drums', type: 'dir', size: 0 },
                      { name: 'Synth', type: 'dir', size: 0 },
                    ],
                  });
                  break;
                case 'sample/refreshCache':
                  sendResponse({ total: 5000, rootPath: '/home/sasha/samples' });
                  // Send progress events quickly (300ms intervals for test speed)
                  let progress = 0;
                  const total = 5000;
                  const interval = setInterval(() => {
                    progress += 500;
                    if (progress > total) progress = total;
                    this.onmessage?.({
                      data: JSON.stringify({
                        type: 'event',
                        event: 'sampleIndexProgress',
                        payload: { scanned: progress, total, status: 'scanning' },
                      }),
                    });
                    if (progress >= total) {
                      clearInterval(interval);
                      setTimeout(() => {
                        this.onmessage?.({
                          data: JSON.stringify({
                            type: 'event',
                            event: 'sampleIndexComplete',
                            payload: { total, rootPath: '/home/sasha/samples' },
                          }),
                        });
                      }, 500);
                    }
                  }, 300);
                  break;
                case 'sample/sendToTrack':
                  sendResponse({ success: true });
                  break;
                case 'transport/getState':
                  sendResponse({ playing: false, recording: false });
                  break;
                default:
                  sendResponse({ success: true });
              }
            }
          } catch (e) { /* ignore parse errors */ }
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

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(5000);

    // ── Step 1: Navigate to Settings tab ──
    const settingsTab = page.locator('button', { hasText: 'Settings' });
    await expect(settingsTab).toBeVisible({ timeout: 10000 });

    await settingsTab.click();
    await page.waitForTimeout(1000);

    // Verify the "Refresh Sample Index" button is present
    const refreshSampleBtn = page.locator('button:has-text("Refresh Sample Index")');
    await expect(refreshSampleBtn).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════
    // Screenshot 1: Settings tab showing Refresh Sample Index button
    // ════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-settings-refresh-btn.png` });

    // ── Step 2: Click "Refresh Sample Index" button ──
    await refreshSampleBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Scanning Samples...')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Indexing samples:')).toBeVisible({ timeout: 8000 });

    await page.waitForTimeout(2000);

    // ════════════════════════════════════════════════
    // Screenshot 2: Progress bar visible during scanning
    // ════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-progress-bar-active.png` });

    // ── Step 3: Wait for index to complete ──
    // Progress events fire every 300ms with 500 increment, so 10 events = 3s
    await page.waitForTimeout(6000);

    await expect(page.getByText('Indexing samples:')).not.toBeVisible({ timeout: 8000 });
    await expect(page.locator('button:has-text("Refresh Sample Index")')).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════
    // Screenshot 3: After completion
    // ════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-progress-complete.png` });
  });
});

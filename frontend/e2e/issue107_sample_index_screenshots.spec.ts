/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/spidercrab-playtime/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Mock WebSocket handler for Issue #107 — Sample Index Cache.
 */
function makeMockWsHandler() {
  return (ws: any): void => {
    let pendingProgressInterval: ReturnType<typeof setInterval> | null = null;

    ws.onMessage((message: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(message.toString());
      } catch {
        return;
      }

      const { type, command, id } = msg;
      if (type !== 'command' || !id) return;

      let responsePayload: any = {};
      switch (command) {
        case 'track/getAll':
          responsePayload = {
            tracks: [
              { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
              { index: 1, name: 'Track 2', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
            ],
          };
          break;
        case 'sample/getDirectory':
          responsePayload = {
            entries: [
              { name: 'Kick.wav', type: 'file', size: 2048576 },
              { name: 'Snare.wav', type: 'file', size: 1024576 },
              { name: 'HiHat.wav', type: 'file', size: 512576 },
              { name: 'Bass.wav', type: 'file', size: 4096576 },
              { name: 'Piano.wav', type: 'file', size: 8192576 },
              { name: 'Drums', type: 'dir', size: 0 },
              { name: 'Synth', type: 'dir', size: 0 },
            ],
          };
          break;
        case 'sample/refreshCache':
          responsePayload = { total: 5000, rootPath: '/home/sasha/samples' };
          let progress = 0;
          const total = 5000;
          if (pendingProgressInterval) clearInterval(pendingProgressInterval);
          pendingProgressInterval = setInterval(() => {
            progress += 500;
            if (progress > total) progress = total;
            ws.send(JSON.stringify({
              type: 'event',
              event: 'sampleIndexProgress',
              payload: { scanned: progress, total, status: 'scanning' },
            }));
            if (progress >= total) {
              if (pendingProgressInterval) clearInterval(pendingProgressInterval);
              pendingProgressInterval = null;
              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: 'event',
                  event: 'sampleIndexComplete',
                  payload: { total, rootPath: '/home/sasha/samples' },
                }));
              }, 500);
            }
          }, 2000);
          break;
        case 'sample/sendToTrack':
          responsePayload = { success: true };
          break;
        case 'transport/getState':
          responsePayload = { playing: false, recording: false };
          break;
      }

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'response',
          id,
          success: true,
          payload: responsePayload,
        }));
      }, 0);
    });
  };
}

test.describe('Issue #107 — Sample Index Cache Screenshots', () => {
  test.setTimeout(90000);

  test('Capture sample index progress bar and settings refresh button', async ({ page }) => {
    // Collect console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[ERROR] ${err.message}`));

    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(5000);

    // DEBUG: log all console messages
    for (const log of consoleLogs) {
      console.log('CONSOLE:', log);
    }

    // Check if there's any content
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    console.log('HTML length:', html.length);
    console.log('HTML first 2000 chars:', html.substring(0, 2000));

    // DEBUG: Take initial screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-debug-initial.png` });

    // Check what's on the page
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Page body text:', bodyText.substring(0, 500));

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

    await page.waitForTimeout(3000);

    // ════════════════════════════════════════════════
    // Screenshot 2: Progress bar visible during scanning
    // ════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-progress-bar-active.png` });

    // ── Step 3: Wait for index to complete ──
    await page.waitForTimeout(15000);

    await expect(page.getByText('Indexing samples:')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Refresh Sample Index")')).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════
    // Screenshot 3: After completion
    // ════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-107-progress-complete.png` });
  });
});

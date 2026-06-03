/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue90';
const IPAD_PRO = { width: 2360, height: 1640 };

test.describe('Issue #90 — MIDI CC Recording Screenshots', () => {
  test.setTimeout(120000);

  test('App running after midi/event command implementation', async ({ page }) => {
    // Log console messages for debugging
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Wait for Connected status
    let connected = false;
    for (let i = 0; i < 40; i++) {
      const text = await page.evaluate(() => document.body.textContent ?? '');
      if (text.includes('Connected')) {
        connected = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    console.log('Connected:', connected);

    // Screenshots
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-90-app-state.png` });
    console.log('Screenshot 1 captured');

    if (connected) {
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-90-with-data.png` });
      console.log('Screenshot 2 captured');
    }

    console.log('Screenshots captured in', SCREENSHOT_DIR);
  });
});

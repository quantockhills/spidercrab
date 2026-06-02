/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

function setupRealWsProxy(page: any): void {
  page.routeWebSocket(WS_REAL, (ws: any) => {
    const realWs = new WebSocket(WS_REAL);
    realWs.on('open', () => {
      ws.onMessage((msg: Buffer) => realWs.send(msg.toString()));
    });
    realWs.on('message', (data: Buffer) => ws.send(data.toString()));
    realWs.on('error', () => {});
    ws.on('close', () => realWs.close());
  });
}

test.describe('Issue #78 Screenshots', () => {
  test.setTimeout(90000);

  test('Capture FX chain browser', async ({ page }) => {
    setupRealWsProxy(page);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(4000);

    // Verify connected and tracks visible
    const text = await page.evaluate(() => document.body.textContent ?? '');
    console.log('Page:', text.substring(0, 400));

    // Take screenshot of tracks view
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-tracks.png` });

    // Click FX tab (look for the tab with 'FX' text at the bottom)
    const fxTab = page.locator('button:has-text("FX"), [role=tab]:has-text("FX"), a:has-text("FX")').last();
    if (await fxTab.isVisible().catch(() => false)) {
      await fxTab.click();
      await page.waitForTimeout(2000);
      console.log('FX tab clicked');
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-fx-tab.png` });

    // Check if the page text changed after clicking FX
    const text2 = await page.evaluate(() => document.body.textContent ?? '');
    console.log('After FX click:', text2.substring(0, 300));

    // Check what buttons are available now
    const buttons = await page.locator('button').allTextContents();
    console.log('Buttons:', buttons.join(' | '));

    // Look for Chains button
    const chainsBtn = page.locator('button').filter({ hasText: /Chains/ }).first();
    if (await chainsBtn.isVisible().catch(() => false)) {
      await chainsBtn.click();
      await page.waitForTimeout(3000);
      console.log('Chains button clicked');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-chain-browser.png` });

      const text3 = await page.evaluate(() => document.body.textContent ?? '');
      console.log('After Chains click:', text3.substring(0, 500));
    } else {
      console.log('Chains button NOT found');
      // Try clicking on the Settings tab to use FX Chain path setting
      const settingsTab = page.locator('button:has-text("Settings")').last();
      if (await settingsTab.isVisible().catch(() => false)) {
        await settingsTab.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-settings.png` });
        const text3 = await page.evaluate(() => document.body.textContent ?? '');
        console.log('Settings text:', text3.substring(0, 500));
      }
    }
  });
});

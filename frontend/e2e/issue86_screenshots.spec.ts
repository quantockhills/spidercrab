/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

function setupMockWsProxy(page: any): void {
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

test.describe('Issue #86 Screenshots — FX button + Back button', () => {
  test.setTimeout(90000);

  test('Capture TrackOverview with FX buttons and FX browser with Back button', async ({ page }) => {
    setupMockWsProxy(page);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(6000);

    // Wait for tracks to load via mock WS
    const text = await page.evaluate(() => document.body.textContent ?? '');
    console.log('Page text (first 800):', text.substring(0, 800));

    // Log all buttons
    const buttons = await page.locator('button').allTextContents();
    console.log('All buttons:', buttons.join(' | '));

    // Screenshot 1: TrackOverview showing FX buttons on track rows
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-86-track-overview.png` });
    console.log('Screenshot 1 saved: ss-86-track-overview.png');

    // Look for Open FX button by testid
    const openFxButton = page.locator('[data-testid="open-fx-button"]').first();
    const openFxVisible = await openFxButton.isVisible().catch(() => false);
    console.log('Open FX button (data-testid) visible:', openFxVisible);

    // Also try text-based or icon-based FX buttons
    const fxButton = page.locator('button').filter({ hasText: /FX/i }).first();
    const fxButtonVisible = await fxButton.isVisible().catch(() => false);
    console.log('FX text button visible:', fxButtonVisible);

    // Count all data-testid="open-fx-button" elements
    const fxButtonCount = await page.locator('[data-testid="open-fx-button"]').count();
    console.log(`Found ${fxButtonCount} open-fx-button elements`);

    // Click the FX button on first track if visible
    if (openFxVisible) {
      await openFxButton.click();
      console.log('Clicked FX button (data-testid)');
    } else if (fxButtonVisible) {
      await fxButton.click();
      console.log('Clicked FX button (text match)');
    }
    await page.waitForTimeout(3000);

    // Screenshot 2: FX Browser view (after clicking FX button)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-86-fx-browser.png` });
    console.log('Screenshot 2 saved: ss-86-fx-browser.png');

    // Log state after navigation
    const text2 = await page.evaluate(() => document.body.textContent ?? '');
    console.log('After FX click text:', text2.substring(0, 800));
    const buttons2 = await page.locator('button').allTextContents();
    console.log('After FX click buttons:', buttons2.join(' | '));

    // Look for Back button
    const backButton = page.locator('button').filter({ hasText: /Back|←|↩|⬅/i }).first();
    const backVisible = await backButton.isVisible().catch(() => false);
    console.log('Back button (text) visible:', backVisible);

    // Also check aria-label
    const backButtonByLabel = page.locator('button[aria-label="Back"]').first();
    const backByLabelVisible = await backButtonByLabel.isVisible().catch(() => false);
    console.log('Back button (aria-label) visible:', backByLabelVisible);

    if (backVisible) {
      await backButton.click();
      console.log('Clicked Back button');
    } else if (backByLabelVisible) {
      await backButtonByLabel.click();
      console.log('Clicked Back button (aria-label)');
    }
    await page.waitForTimeout(3000);

    // Screenshot 3: Returned to TrackOverview
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-86-back-to-overview.png` });
    console.log('Screenshot 3 saved: ss-86-back-to-overview.png');

    const text3 = await page.evaluate(() => document.body.textContent ?? '');
    console.log('After Back click text:', text3.substring(0, 800));
  });
});

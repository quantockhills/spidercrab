/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue87';
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

test.describe('Issue #87 — FX Preset Browser Screenshots', () => {
  test.setTimeout(120000);

  async function waitForConnected(page: any, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await page.evaluate(() => document.body.textContent ?? '');
      if (text.includes('Connected')) return;
      await page.waitForTimeout(300);
    }
    throw new Error('Timed out waiting for Connected status');
  }

  async function waitForText(page: any, text: string, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const t = await page.evaluate(() => document.body.textContent ?? '');
      if (t.includes(text)) return;
      await page.waitForTimeout(300);
    }
    console.log(`WARNING: Timed out waiting for "${text}"`);
  }

  test('Capture FX param view with preset bar', async ({ page }) => {
    setupRealWsProxy(page);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await page.waitForTimeout(2000);

    // Check initial state - fresh instance with no tracks (or one track from default template)
    const text0 = await page.evaluate(() => document.body.textContent ?? '');
    console.log('Initial text:', text0.substring(0, 200));

    // If there's a "+ Track" button, click it to add a track first
    const addTrackBtn = page.locator('button:has-text("+")').first();
    if (await addTrackBtn.isVisible().catch(() => false)) {
      await addTrackBtn.click();
      await page.waitForTimeout(2000);
      console.log('Added track');
    }

    // Wait for track to appear
    await waitForText(page, 'Track', 5000);

    // Click on Track 1 to select it
    const track1 = page.getByText('Track 1').first();
    if (await track1.isVisible().catch(() => false)) {
      await track1.click();
      await page.waitForTimeout(500);
      console.log('Selected Track 1');
    }

    // Take screenshot of tracks view
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-87-tracks.png` });
    console.log('Screenshot: tracks');

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await page.waitForTimeout(2000);
    console.log('FX tab clicked');

    // Search for ReaEQ
    const searchInput = page.getByPlaceholder('Search FX...');
    await searchInput.fill('ReaEQ');
    await page.waitForTimeout(1000);

    // Take screenshot of FX browser with ReaEQ visible
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-87-fx-browser-reaeq.png` });
    console.log('Screenshot: fx-browser-reaeq');

    // Click the Add button next to ReaEQ
    const addButtons = page.locator('button:has-text("Add")');
    const addCount = await addButtons.count();
    console.log('Add buttons count:', addCount);

    if (addCount > 0) {
      await addButtons.first().click();
      await page.waitForTimeout(2000);
      console.log('Clicked Add button');
    }

    // Now navigate to param view - click on ReaEQ in the FX list
    const fxTabContent = page.locator('text=ReaEQ').first();
    const fxVisible = await fxTabContent.isVisible().catch(() => false);
    console.log('ReaEQ in FX list visible:', fxVisible);

    if (fxVisible) {
      await fxTabContent.click();
      await page.waitForTimeout(3000);
      console.log('Clicked ReaEQ for param view');

      // Wait for param view to load
      const paramText = await page.evaluate(() => document.body.textContent ?? '');
      console.log('Param view text (first 400):', paramText.substring(0, 400));

      // Check for preset bar
      const hasPresetLabel = paramText.includes('Preset');
      const hasNoPresets = paramText.includes('No presets');
      console.log('Has Preset label:', hasPresetLabel, '| Has "No presets":', hasNoPresets);

      // Take screenshot of param view (with or without presets)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-87-param-view.png` });
      console.log('Screenshot: param-view');
    }

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

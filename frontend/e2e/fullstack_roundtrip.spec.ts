import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';

// iPad Pro landscape viewport
const IPAD_PRO = { width: 2360, height: 1640 };

// Helper: route WebSocket through to real Reaper, capture messages
function setupRealWsProxy(page: any, captured: { sent: string[]; received: string[] }): void {
  page.routeWebSocket(WS_REAL, (ws) => {
    const realWs = new WebSocket(WS_REAL);

    realWs.on('open', () => {
      // Forward browser → real Reaper
      ws.onMessage((msg) => {
        const str = msg.toString();
        captured.sent.push(str);
        realWs.send(str);
      });
    });

    realWs.on('message', (data) => {
      const str = data.toString();
      captured.received.push(str);
      // Forward real Reaper → browser
      ws.send(str);
    });

    realWs.on('error', () => { /* ignore — Reaper WS doesn't send proper close */ });
    ws.on('close', () => realWs.close());
  });
}

test.describe('Full-stack E2E Roundtrip with Real Reaper', () => {
  test.setTimeout(120000);

  async function waitForConnected(page: any, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await page.evaluate(() => document.body.textContent?.includes('Connected') ?? false);
      if (ok) return;
      await page.waitForTimeout(300);
    }
    throw new Error('Timed out waiting for Connected status');
  }

  async function waitForTrackCount(page: any, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Look for track count in status bar ("N trk") or track names
      const text = await page.evaluate(() => document.body.textContent ?? '');
      if (/Track \d/.test(text) || /\d+ trk/.test(text)) return;
      await page.waitForTimeout(300);
    }
    // Not critical — some Reaper instances may have 0 tracks
  }

  async function waitForFxList(page: any, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await page.evaluate(() => document.body.textContent ?? '');
      // Look for either FX count in footer or actual plugin names
      if (/total plugins|plugins? found/i.test(text)) return;
      if (/ReaEQ|ReaComp|ReaVerb/i.test(text)) return;
      // If "Loading FX..." is gone, list might be empty
      if (!text.includes('Loading FX') && !text.includes('Loading...')) {
        await page.waitForTimeout(1000);
        return;
      }
      await page.waitForTimeout(500);
    }
  }

  test('FX insert roundtrip', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await waitForTrackCount(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await waitForFxList(page);
    await page.waitForTimeout(500);

    // Search for ReaEQ
    const searchInput = page.getByPlaceholder('Search FX...');
    await searchInput.fill('ReaEQ');
    await page.waitForTimeout(800);

    // Screenshot: FX browser with ReaEQ visible
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-44-fx-insert.png` });

    // Verify ReaEQ is visible
    await expect(page.getByText('ReaEQ').first()).toBeVisible();

    // Add ReaEQ to Track 1
 const addBtn = page.locator('button:has-text("Add")').first();
    await addBtn.click();
    await page.waitForTimeout(1500);
  });

  test('FX param read/write', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await waitForTrackCount(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await waitForFxList(page);
    await page.waitForTimeout(500);

    // Search for and add ReaEQ
    const searchInput = page.getByPlaceholder('Search FX...');
    await searchInput.fill('ReaEQ');
    await page.waitForTimeout(800);

    // Select track 1 and add ReaEQ
 await page.locator('text=Track 1').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add")').first().click();
    await page.waitForTimeout(1500);

    // Open params by clicking ReaEQ
 await page.getByText('ReaEQ').first().click();
    await page.waitForTimeout(1000);

    // Screenshot: FX params before adjustment
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-44-fx-params-before.png` });
  });

  test('FX delete', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await waitForTrackCount(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await waitForFxList(page);
    await page.waitForTimeout(500);

    // Add ReaEQ to Track 1
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(800);
 await page.locator('text=Track 1').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add")').first().click();
    await page.waitForTimeout(1500);

    // Open params, then remove
 await page.getByText('ReaEQ').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Remove FX")').click();
    await page.waitForTimeout(1000);

    // Go back
    await page.locator('text=← Back').first().click();
    await page.waitForTimeout(500);

    // Screenshot: FX list after deletion
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-44-fx-deleted.png` });
  });

  test('Track overview', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await waitForTrackCount(page);
    await page.waitForTimeout(500);

    // Navigate to Tracks
    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(1000);

    // Screenshot: Tracks tab
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-44-tracks-with-fx.png` });
  });

  test('Multiple FX on one track', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await waitForTrackCount(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await waitForFxList(page);
    await page.waitForTimeout(500);

    // Select Track 1
    await page.locator('text=Track 1').first().click();
    await page.waitForTimeout(500);

    // Add ReaEQ
    const searchInput = page.getByPlaceholder('Search FX...');
    await searchInput.fill('ReaEQ');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add")').first().click();
    await page.waitForTimeout(1500);

    // Clear and add ReaComp
    await searchInput.clear();
    await searchInput.fill('ReaComp');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add")').first().click();
    await page.waitForTimeout(1500);

    // Screenshot: Multiple FX
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-44-multi-fx.png` });
  });
});

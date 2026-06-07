import { test, expect } from '@playwright/test';

test.describe('Issue #107 — Real WS Server Screenshots', () => {
  test('Capture sample index progress bar and settings refresh button', async ({ page }) => {
    // Don't use routeWebSocket — the real mock server is on port 9224
    test.setTimeout(60000);

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('connected') || text.includes('error') || text.includes('sampleIndexProgress') || text.includes('Scanning') || text.includes('scanning')) {
        console.log(`[PAGE ${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 2360, height: 1640 });
    await page.goto('/');
    
    // Wait for WebSocket connection to establish
    await page.waitForTimeout(3000);

    // Check if connected by looking at DOM
    const initialText = await page.evaluate(() => document.body.innerText);
    console.log('Initial connect status:', initialText.includes('Connected') ? 'Connected' : 'Disconnected/Unknown');

    // ── Step 1: Navigate to Settings tab ──
    const settingsTab = page.locator('button', { hasText: 'Settings' });
    await expect(settingsTab).toBeVisible({ timeout: 10000 });
    await settingsTab.click();
    await page.waitForTimeout(1000);

    // Verify connection status in settings
    const settingsText = await page.evaluate(() => document.body.innerText);
    console.log('Settings connection status:', settingsText.includes('Connected') ? 'Connected' : 'Disconnected');

    // Verify the "Refresh Sample Index" button is present
    const refreshSampleBtn = page.locator('button:has-text("Refresh Sample Index")');
    await expect(refreshSampleBtn).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════
    // Screenshot 1: Settings tab showing Refresh Sample Index button
    // ════════════════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-settings-refresh-btn.png' });

    // ── Step 2: Click "Refresh Sample Index" button ──
    await refreshSampleBtn.click();
    await page.waitForTimeout(500);

    // Wait for scanning state to appear
    await expect(page.getByText('Scanning Samples...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Indexing samples:')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(2000);

    // ════════════════════════════════════════════════
    // Screenshot 2: Progress bar visible during scanning
    // ════════════════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-progress-bar-active.png' });

    // ── Step 3: Wait for index to complete ──
    // The mock sends progress every 300ms, so 5000/500*300 = 3000ms + buffer
    await page.waitForTimeout(6000);

    await expect(page.getByText('Indexing samples:')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Refresh Sample Index")')).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════
    // Screenshot 3: After completion
    // ════════════════════════════════════════════════
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-progress-complete.png' });
  });
});

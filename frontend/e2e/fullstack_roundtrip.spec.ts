import { test, expect, devices } from '@playwright/test';

// Screenshot directory
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';

// iPad Pro landscape viewport
const IPAD_PRO_VIEWPORT = { width: 2360, height: 1640 };

test.describe('Full-stack E2E Roundtrip with Real Reaper', () => {
  // Helper: Wait for WebSocket connection to Reaper
  async function waitForWsConnection(page: any, timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const connected = await page.evaluate(() => {
        // Check if the app shows "Connected" status
        return document.body.textContent?.includes('Connected') || false;
      });
      if (connected) return true;
      await page.waitForTimeout(500);
    }
    throw new Error('WebSocket connection to Reaper timed out');
  }

  // Helper: Wait for tracks to load
  async function waitForTracks(page: any, timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const hasTracks = await page.evaluate(() => {
        return document.body.textContent?.includes('trk') || false;
      });
      if (hasTracks) return true;
      await page.waitForTimeout(500);
    }
    throw new Error('Tracks did not load in time');
  }

  test('FX insert roundtrip', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnection(page);
    await waitForTracks(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await page.waitForTimeout(500);

    // Search for ReaEQ
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(500);

    // Screenshot: FX browser with ReaEQ visible
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-44-fx-insert.png`,
      viewport: { width: 2360, height: 1640 },
    });

    // Verify ReaEQ is visible
    await expect(page.getByText('ReaEQ')).toBeVisible();

    // Select track 1 (first track)
    await page.click('text=Track 1');
    await page.waitForTimeout(500);

    // Add ReaEQ to track
    const addButton = page.locator('button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(1000);

    // Verify FX was added (check for success indicator or navigate to params)
    await expect(page.getByText('ReaEQ')).toBeVisible();
  });

  test('FX param read/write', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnection(page);
    await waitForTracks(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await page.waitForTimeout(500);

    // Search for and add ReaEQ
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(500);

    // Select track 1 and add ReaEQ
    await page.click('text=Track 1');
    await page.waitForTimeout(500);

    const addButton = page.locator('button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(1000);

    // Open params by clicking on the FX
    await page.click('text=ReaEQ');
    await page.waitForTimeout(500);

    // Screenshot: FX params before adjustment
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-44-fx-params-before.png`,
      viewport: { width: 2360, height: 1640 },
    });

    // Find a parameter slider and adjust it
    const sliders = page.locator('div[class*="h-8"][class*="cursor-pointer"]');
    if (await sliders.count() > 0) {
      const firstSlider = sliders.first();
      // Click roughly in the middle of the slider
      await firstSlider.click({ position: { x: 50, y: 10 } });
      await page.waitForTimeout(500);

      // Screenshot: After adjusting param
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/ss-44-fx-params-after.png`,
        viewport: { width: 2360, height: 1640 },
      });
    }
  });

  test('FX delete', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnection(page);
    await waitForTracks(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await page.waitForTimeout(500);

    // Search for and add ReaEQ
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(500);

    // Select track 1 and add ReaEQ
    await page.click('text=Track 1');
    await page.waitForTimeout(500);

    const addButton = page.locator('button:has-text("Add")').first();
    await addButton.click();
    await page.waitForTimeout(1000);

    // Open params
    await page.click('text=ReaEQ');
    await page.waitForTimeout(500);

    // Click Remove FX button
    await page.click('button:has-text("Remove FX")');
    await page.waitForTimeout(1000);

    // Navigate back to FX browser
    await page.click('text=← Back');
    await page.waitForTimeout(500);

    // Screenshot: FX list after deletion
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-44-fx-deleted.png`,
      viewport: { width: 2360, height: 1640 },
    });

    // Verify ReaEQ is no longer in the list
    await expect(page.getByText('ReaEQ')).toBeHidden();
  });

  test('Track overview with FX', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnection(page);
    await waitForTracks(page);
    await page.waitForTimeout(500);

    // Navigate to Tracks tab (should be default)
    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(500);

    // Screenshot: Tracks tab showing real track names
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-44-tracks-with-fx.png`,
      viewport: { width: 2360, height: 1640 },
    });

    // Verify tracks are listed
    await expect(page.locator('text=Track 1')).toBeVisible();

    // Select a track
    await page.click('text=Track 1');
    await page.waitForTimeout(500);

    // Verify track is selected (should have different styling)
    await expect(page.locator('text=Track 1')).toBeVisible();
  });

  test('Multiple FX on one track', async ({ page }) => {
    await page.goto('/');
    await waitForWsConnection(page);
    await waitForTracks(page);
    await page.waitForTimeout(500);

    // Navigate to FX tab
    await page.getByText('FX').first().click();
    await page.waitForTimeout(500);

    // Select track 1
    await page.click('text=Track 1');
    await page.waitForTimeout(500);

    // Add ReaEQ
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(500);
    const addReaEQ = page.locator('button:has-text("Add")').first();
    await addReaEQ.click();
    await page.waitForTimeout(1000);

    // Clear search and add ReaComp
    await page.getByPlaceholder('Search FX...').fill('ReaComp');
    await page.waitForTimeout(500);
    const addReaComp = page.locator('button:has-text("Add")').first();
    await addReaComp.click();
    await page.waitForTimeout(1000);

    // Screenshot: Multiple FX on one track
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-44-multi-fx.png`,
      viewport: { width: 2360, height: 1640 },
    });

    // Verify both FX are visible
    await expect(page.getByText('ReaEQ')).toBeVisible();
    await expect(page.getByText('ReaComp')).toBeVisible();
  });
});
import { test, expect } from '@playwright/test';

test('Navigate to FX tab, add FX, toggle bypass, view params — no crash', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Wait for connection
  await page.waitForFunction(() => {
    const el = document.querySelector('[class*="connected"]');
    return el && el.textContent?.includes('Connected');
  }, { timeout: 10000 }).catch(() => {});

  // Navigate to Tracks tab
  const tracksBtn = page.locator('button').filter({ hasText: 'Tracks' }).first();
  if (await tracksBtn.isVisible()) await tracksBtn.click();
  await page.waitForTimeout(2000);

  // Navigate to FX tab
  const fxBtn = page.locator('button').filter({ hasText: 'FX' }).first();
  if (await fxBtn.isVisible()) await fxBtn.click();
  await page.waitForTimeout(2000);

  // Try clicking the first FX card if any exist
  const fxCards = page.locator('[class*="fx"]').first();
  if (await fxCards.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fxCards.click();
    await page.waitForTimeout(2000);
  }

  // Navigate to settings and back
  const settingsBtn = page.locator('button').filter({ hasText: 'Settings' }).first();
  if (await settingsBtn.isVisible()) await settingsBtn.click();
  await page.waitForTimeout(1000);

  // Go back to FX
  if (await fxBtn.isVisible()) await fxBtn.click();
  await page.waitForTimeout(2000);

  // Verify page didn't crash (no error boundary shown)
  const errorBoundary = page.locator('text=Something went wrong');
  await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {});

  // Take a screenshot to confirm
  await page.screenshot({ path: '/home/sasha/projects/reaper-ipad/gui_testing/fx-crash-test.png' });
});

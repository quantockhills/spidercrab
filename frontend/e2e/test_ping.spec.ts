import { test, expect } from '@playwright/test';

test.describe('Ping', () => {
  test('Just check page loads', async ({ page }) => {
    test.setTimeout(30000);
    
    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('error') || t.includes('Error') || t.includes('connect') || t.includes('Connected') || t.includes('Disconnected')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(8000);

    // Check if Connected appears in text anywhere
    const text = await page.evaluate(() => document.body.innerText);
    console.log('Has Connected:', text.includes('Connected'));
    console.log('Has Disconnected:', text.includes('Disconnected'));
    console.log('First 500 chars:', text.substring(0, 500));
    
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-ping.png' });
  });
});

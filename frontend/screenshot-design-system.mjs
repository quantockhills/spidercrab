import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:5174';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2360, height: 1640 }, // iPad Pro resolution
  });
  const page = await context.newPage();

  // 1. Tracks tab (default)
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/screenshot-tracks.png', fullPage: true });
  console.log('✓ Screenshot: tracks tab');

  // 2. FX Browser tab
  await page.click('button:has-text("FX")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-fx.png', fullPage: true });
  console.log('✓ Screenshot: fx browser tab');

  // 3. Media Browser tab
  await page.click('button:has-text("Media")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-media.png', fullPage: true });
  console.log('✓ Screenshot: media browser tab');

  // 4. Settings tab
  await page.click('button:has-text("Settings")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-settings.png', fullPage: true });
  console.log('✓ Screenshot: settings tab');

  await browser.close();
  console.log('\nAll screenshots captured successfully');
}

main().catch(err => { console.error(err); process.exit(1); });

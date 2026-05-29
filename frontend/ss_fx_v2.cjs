const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Select Track 2
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const row of rows) {
      const name = row.querySelector('[class*="font-medium"]');
      if (name && name.textContent.trim() === 'Track 2') {
        row.click();
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  // Click FX tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const btn of btns) {
      if (btn.textContent.includes('FX')) { btn.click(); break; }
    }
  });

  // Wait for FX to enumerate — might be slow (249 plugins)
  await page.waitForTimeout(5000);

  // Check what's on the page
  const state = await page.evaluate(() => {
    // Look for loading/error/empty states
    const body = document.body.textContent;
    const hasLoading = body.includes('Loading FX');
    const hasNoPlugins = body.includes('No plugins found');
    const hasNoResult = body.includes('No results matching');
    const hasError = body.includes('Failed to load');
    const fxNames = Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
      .map(e => e.textContent.trim());
    return { hasLoading, hasNoPlugins, hasNoResult, hasError, fxNames };
  });
  console.log('FX tab state:', JSON.stringify(state, null, 2));

  // Screenshot the current state
  await page.screenshot({ path: `${GUI}/ss-fx-loading.png`, fullPage: false });

  // If still loading, wait more
  if (state.hasLoading) {
    console.log('Still loading, waiting 10 more seconds...');
    await page.waitForTimeout(10000);
    const state2 = await page.evaluate(() => {
      const fxNames = Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
        .map(e => e.textContent.trim());
      return { fxNames, text: document.body.textContent.substring(0, 200) };
    });
    console.log('After 15s:', JSON.stringify(state2, null, 2));
  }

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e.message); process.exit(1); });

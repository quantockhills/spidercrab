const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';

  // Fresh page load
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  console.log('Page loaded');

  // Wait for WS connection — watch for "Connected" text
  for (let i = 0; i < 20; i++) {
    const connected = await page.evaluate(() => document.body.textContent.includes('Connected'));
    if (connected) {
      console.log(`Connected after ${i+1}s`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  // Check connection status
  const status = await page.evaluate(() => document.body.textContent.substring(0, 500));
  console.log('Page state:', status.substring(0, 200));

  // Select Track 2
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const row of rows) {
      const name = row.querySelector('[class*="font-medium"]');
      if (name && name.textContent.trim() === 'Track 2') {
        row.click(); break;
      }
    }
  });
  console.log('Selected Track 2');

  // Now navigate to FX tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const btn of btns) {
      if (btn.textContent.includes('FX')) { btn.click(); break; }
    }
  });
  console.log('Clicked FX tab, waiting 40s for enumerate...');

  // Wait for enumeration to complete — poll for FX names
  let found = false;
  for (let i = 0; i < 60; i++) {
    const fxNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
        .map(e => e.textContent.trim());
    });
    if (fxNames.length > 0) {
      console.log(`FX loaded after ${i+1}s: ${fxNames.length} plugins`);
      found = true;
      break;
    }
    const stillLoading = await page.evaluate(() => document.body.textContent.includes('Loading FX'));
    if (!stillLoading) {
      const text = await page.evaluate(() => document.body.textContent.substring(0, 200));
      console.log(`Loading FX ended. State: ${text}`);
      break;
    }
    if (i % 10 === 0) console.log(`  waiting... ${i+1}s`);
    await page.waitForTimeout(1000);
  }

  if (!found) console.log('FX never loaded');

  // Screenshot whatever state we're in
  await page.screenshot({ path: `${GUI}/ss-02-fx-list-landscape.png`, fullPage: false });
  console.log('Captured FX list');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

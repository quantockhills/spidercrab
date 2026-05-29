// Screenshot: select track → FX tab → wait 40s → click ReaEQ → param view
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  console.log('Page loaded, waiting 4s for WS...');
  await page.waitForTimeout(4000); // Let WS connect

  // Step 1: Select Track 2 (which has ReaEQ)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const row of rows) {
      const name = row.querySelector('[class*="font-medium"]');
      if (name && name.textContent.trim() === 'Track 2') {
        row.click();
        console.log('Clicked Track 2');
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  // Step 2: Click FX tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const btn of btns) {
      if (btn.textContent.includes('FX')) {
        btn.click();
        console.log('Clicked FX tab');
        break;
      }
    }
  });

  // Step 3: WAIT for FX enumeration — takes ~30s
  console.log('Waiting 40s for FX enumeration...');
  await page.waitForTimeout(40000);

  // Check what we got
  const fxInfo = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
      .map(e => e.textContent.trim());
    const hasLoading = document.body.textContent.includes('Loading FX');
    const headerText = document.querySelector('h2')?.textContent || '';
    return { names, hasLoading, headerText };
  });
  console.log('After 40s:', JSON.stringify(fxInfo, null, 2));

  // Take an FX list screenshot before navigating to params
  await page.screenshot({ path: `${GUI}/ss-02-fx-list-landscape.png`, fullPage: false });
  console.log('Captured FX list');

  // Step 4: Click ReaEQ to navigate to params
  if (fxInfo.names.length > 0) {
    const reaeq = fxInfo.names.find(n => n.includes('ReaEQ'));
    if (reaeq) {
      console.log('Clicking:', reaeq);
      await page.evaluate(() => {
        const all = document.querySelectorAll('[class*="font-medium"][class*="truncate"]');
        for (const el of all) {
          if (el.textContent.includes('ReaEQ')) {
            const btn = el.closest('button');
            if (btn) btn.click();
            break;
          }
        }
      });
      await page.waitForTimeout(5000); // Wait for params to load
    } else {
      // Try any FX
      console.log('No ReaEQ found, trying first FX');
      await page.evaluate(() => {
        const el = document.querySelector('[class*="font-medium"][class*="truncate"]');
        if (el) {
          const btn = el.closest('button');
          if (btn) btn.click();
        }
      });
      await page.waitForTimeout(5000);
    }
  }

  // Step 5: Screenshot params view
  const paramInfo = await page.evaluate(() => {
    return {
      text: document.body.textContent.substring(0, 300),
      hasParams: document.body.textContent.includes('Loading parameters'),
      hasNoParams: document.body.textContent.includes('No adjustable parameters'),
    };
  });
  console.log('Param view state:', JSON.stringify(paramInfo));
  await page.screenshot({ path: `${GUI}/ss-06-fx-params-landscape.png`, fullPage: false });
  console.log('Captured ss-06-fx-params-landscape.png');

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e.message); process.exit(1); });

// Screenshot: Tracks tab → select track → FX tab → click FX → params view
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WS to connect and tracks to load
  await page.waitForTimeout(3000);

  // Step 1: Find the track row for Track 2 (has ReaEQ, index 1)
  // In the TrackOverview, track rows are divs with class containing "cursor-pointer" inside the scroll area
  const trackRows = await page.evaluate(() => {
    // Find all divs with cursor-pointer class (track rows)
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    return rows
      .filter(r => r.tagName === 'DIV' && r.querySelector('[class*="font-medium"]'))
      .map((r, i) => ({ index: i, text: r.textContent.trim().substring(0, 60) }));
  });
  console.log('Track rows:', JSON.stringify(trackRows));

  // Click the second track (index 1 = Track 2 with ReaEQ)
  const rows = await page.$$('[class*="cursor-pointer"]');
  let clicked = false;
  for (const row of rows) {
    const hasName = await row.$('[class*="font-medium"]');
    if (hasName) {
      const text = await hasName.textContent();
      console.log('  Row text:', text.trim());
      if (text.trim() === 'Track 2') {
        await row.click();
        clicked = true;
        console.log('Clicked Track 2');
        break;
      }
    }
  }
  if (!clicked) {
    // Fallback: click first track row
    for (const row of rows) {
      const hasName = await row.$('[class*="font-medium"]');
      if (hasName) {
        await row.click();
        console.log('Fallback: clicked first track row');
        break;
      }
    }
  }
  await page.waitForTimeout(500);

  // Step 2: Navigate to FX tab
  const navBtns = await page.$$('nav button');
  for (const btn of navBtns) {
    const text = await btn.textContent();
    if (text && text.includes('FX')) {
      await btn.click();
      console.log('Clicked FX tab');
      break;
    }
  }
  await page.waitForTimeout(3000);

  // Step 3: Find ReaEQ in the FX list and click it
  // In FxBrowser, FX names are in buttons with "text-sm font-medium truncate" class
  const fxNames = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'));
    return els.map(e => e.textContent.trim());
  });
  console.log('FX names found:', fxNames);

  // Click ReaEQ
  let clickedFx = false;
  for (const fxName of fxNames) {
    if (fxName === 'ReaEQ (Cockos)' || fxName === 'ReaEQ') {
      // Find the clickable parent button
      const el = await page.$(`[class*="font-medium"][class*="truncate"]`);
      if (el) {
        const text = await el.textContent();
        if (text.trim() === fxName) {
          const btn = await el.$('xpath=ancestor::button');
          if (btn) await btn.click();
          else { await el.click(); }
          clickedFx = true;
          console.log('Clicked:', fxName);
          break;
        }
      }
    }
  }

  if (!clickedFx) {
    // fallback: try by text using page.evaluate
    await page.evaluate(() => {
      const all = document.querySelectorAll('[class*="font-medium"][class*="truncate"]');
      for (const el of all) {
        if (el.textContent.includes('ReaEQ')) {
          el.closest('button')?.click();
          break;
        }
      }
    });
    console.log('Clicked ReaEQ via fallback');
  }

  await page.waitForTimeout(3000);

  // Step 4: Screenshot the params view
  await page.screenshot({ path: `${GUI}/ss-06-fx-params-landscape.png`, fullPage: false });
  console.log('Captured ss-06-fx-params-landscape.png');

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e.message); process.exit(1); });

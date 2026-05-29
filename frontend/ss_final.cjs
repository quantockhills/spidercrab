const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';
fs.mkdirSync(GUI, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WS connection
  let connected = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    connected = await page.evaluate(() => document.body.textContent.includes('Connected'));
    if (connected) { console.log('WS at', i+1, 's'); break; }
  }
  if (!connected) {
    console.log('WS FAILED');
    await page.screenshot({ path: GUI+'/ss-fail.png' });
    await browser.close();
    process.exit(1);
  }

  // Wait for tracks to appear
  let trackNames = [];
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500);
    trackNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="font-medium"]'))
        .map(e => e.textContent.trim())
        .filter(n => n.startsWith('Track'));
    });
    if (trackNames.length >= 3) break;
  }
  console.log('Tracks:', JSON.stringify(trackNames));

  // Select Track 2
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const r of rows) {
      const n = r.querySelector('[class*="font-medium"]');
      if (n && n.textContent.trim() === 'Track 2') { r.click(); return; }
    }
    // Fallback: click any
    for (const r of rows) {
      const n = r.querySelector('[class*="font-medium"]');
      if (n && n.textContent.trim().startsWith('Track')) { r.click(); return; }
    }
  });
  console.log('Track selected');

  // Click FX tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const b of btns) { if (b.textContent.includes('FX')) { b.click(); return; } }
  });
  console.log('FX tab clicked');

  // Poll for FX list (up to 50s — enumeration takes ~30s)
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(1000);
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
        .map(e => e.textContent.trim())
    );
    if (names.length > 0) {
      console.log(`FX loaded: ${names.length} plugins at ${i+1}s`);
      console.log('First 3:', JSON.stringify(names.slice(0,3)));

      // FX list screenshot
      await page.screenshot({ path: GUI+'/ss-02-fx-list-landscape.png' });
      console.log('Captured FX list');

      // Click ReaEQ
      let clicked = false;
      for (const n of names) {
        if (n.includes('ReaEQ')) {
          await page.evaluate(() => {
            const all = document.querySelectorAll('[class*="font-medium"][class*="truncate"]');
            for (const el of all) {
              if (el.textContent.includes('ReaEQ')) {
                const btn = el.closest('button');
                if (btn) btn.click();
                return;
              }
            }
          });
          clicked = true;
          console.log('ReaEQ clicked');
          break;
        }
      }
      if (!clicked) console.log('ReaEQ not found');

      await page.waitForTimeout(5000);
      await page.screenshot({ path: GUI+'/ss-06-fx-params-landscape.png' });
      console.log('PARAMS CAPTURED');
      await browser.close();
      return;
    }
    if (i % 10 === 9) console.log('Waiting', i+1, 's...');
  }

  console.log('FX never loaded');
  const body = await page.evaluate(() => document.body.textContent.substring(0, 300));
  console.log('Page:', body);
  await page.screenshot({ path: GUI+'/ss-fx-timeout.png' });
  await browser.close();
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });

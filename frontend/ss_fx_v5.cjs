// Fresh page load, wait for WS connect, then navigate to FX tab with full 30s wait
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  const GUI = '/home/sasha/projects/reaper-ipad/gui_testing';

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WebSocket connection to establish
  console.log('Waiting for WS connect...');
  let connected = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    connected = await page.evaluate(() => document.body.textContent.includes('Connected'));
    if (connected) { console.log(`Connected at ${i+1}s`); break; }
  }

  if (!connected) {
    console.log('WS never connected. Page content:');
    const text = await page.evaluate(() => document.body.textContent);
    console.log(text.substring(0, 400));
    await page.screenshot({ path: `${GUI}/ss-disconnected.png`, fullPage: false });
    await browser.close();
    return;
  }

  // Wait for tracks to load
  let hasTracks = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500);
    const names = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="font-medium"]'))
        .map(e => e.textContent.trim());
    });
    const trackNames = names.filter(n => n.startsWith('Track'));
    if (trackNames.length > 0) {
      console.log(`Tracks loaded: ${trackNames.join(', ')}`);
      hasTracks = true;
      break;
    }
  }

  if (!hasTracks) {
    console.log('No tracks loaded. Taking screenshot.');
    await page.screenshot({ path: `${GUI}/ss-no-tracks.png`, fullPage: false });
  }

  // Select Track 2
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const row of rows) {
      const name = row.querySelector('[class*="font-medium"]');
      if (name && name.textContent.trim() === 'Track 2') {
        row.click(); return;
      }
    }
    // Fallback: click any track row
    for (const row of rows) {
      const name = row.querySelector('[class*="font-medium"]');
      if (name && name.textContent.trim().startsWith('Track')) {
        row.click(); return;
      }
    }
  });
  console.log('Track selected');

  // Click FX tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const btn of btns) {
      if (btn.textContent.includes('FX')) { btn.click(); return; }
    }
  });
  console.log('FX tab clicked, waiting for enumerate (~30s)...');

  // Wait patiently for enumeration to complete
  let found = false;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(1000);
    const fxNames = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
        .map(e => e.textContent.trim());
    });
    if (fxNames.length > 0) {
      console.log(`FX loaded at ${i+1}s: ${fxNames.length} plugins`);
      console.log('First 5:', fxNames.slice(0, 5));
      await page.screenshot({ path: `${GUI}/ss-07-fx-list-landscape.png`, fullPage: false });
      found = true;

      // Now find ReaEQ and click it
      const reaeq = fxNames.find(n => n.includes('ReaEQ'));
      if (reaeq) {
        console.log('Navigating to ReaEQ params...');
        await page.evaluate(() => {
          const all = document.querySelectorAll('[class*="font-medium"][class*="truncate"]');
          for (const el of all) {
            if (el.textContent.includes('ReaEQ')) {
              const btn = el.closest('button');
              if (btn) { btn.click(); return; }
            }
          }
        });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${GUI}/ss-06-fx-params-landscape.png`, fullPage: false });
        console.log('Params screenshot captured');
      } else {
        console.log('ReaEQ not found in first 5, trying full list');
      }
      break;
    }
    if (i % 10 === 9) {
      const text = await page.evaluate(() => document.body.textContent.substring(0, 200));
      console.log(`Still waiting (${i+1}s)... ${text.substring(0, 80)}`);
    }
  }

  if (!found) {
    console.log('FX never loaded after 50s');
    await page.screenshot({ path: `${GUI}/ss-fx-timeout.png`, fullPage: false });
  }

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });

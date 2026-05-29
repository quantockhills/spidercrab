const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/screenshots';
const URL = 'http://127.0.0.1:5173';
async function sl(ms) { return new Promise(r=>setTimeout(r,ms)); }

(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});

  // Log console and WS for debugging
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('websocket', ws => {
    console.log('WEBSOCKET:', ws.url());
    ws.on('framereceived', f => console.log('WS-RECV:', (f.payload||'').toString().substring(0,100)));
    ws.on('framesent', f => console.log('WS-SENT:', (f.payload||'').toString().substring(0,100)));
  });

  // Screenshot 1: Tracks
  console.log('[1/4] Tracks...');
  await page.goto(URL, {waitUntil:'networkidle'});
  await page.getByText('Tracks').first().click();
  await page.waitForSelector('text=Track 1', {timeout:15000});
  await page.waitForSelector('text=Track 2', {timeout:15000});
  await page.waitForSelector('text=Track 3', {timeout:15000});
  await page.getByText('Track 2').first().click();
  await sl(500);
  await page.screenshot({path:path.join(OUT,'ss-01-tracks.png')});
  console.log('[1/4] DONE');

  // Screenshot 2: FX Browser
  console.log('[2/4] FX Browser...');
  await page.getByText('FX').first().click();
  await sl(500);

  // Wait up to 90s for FX to load
  let fxLoaded = false;
  for (let i = 0; i < 90; i++) {
    const hasLoading = await page.evaluate(() => document.body.textContent.includes('Loading FX...'));
    if (!hasLoading) {
      fxLoaded = true;
      break;
    }
    await sl(1000);
  }
  console.log('FX loaded:', fxLoaded);

  // Wait for count footer
  for (let i = 0; i < 30; i++) {
    const hasCount = await page.evaluate(() => {
      for (const s of document.querySelectorAll('span')) {
        if (/\\d+ total plugins/.test(s.textContent)) return true;
      }
      return false;
    });
    if (hasCount) break;
    await sl(1000);
  }
  await sl(600);
  await page.screenshot({path:path.join(OUT,'ss-02-fx-browser.png')});
  console.log('[2/4] DONE');

  // Screenshot 3: Search ReaVerb
  console.log('[3/4] Search ReaVerb...');
  const searchInput = page.locator('input[placeholder="Search FX..."]');
  await searchInput.fill('ReaVerb');
  await sl(1500);
  // Just wait for the search results to appear
  for (let i = 0; i < 20; i++) {
    const hasReaVerb = await page.evaluate(() => document.body.innerText.includes('ReaVerb'));
    if (hasReaVerb) break;
    await sl(500);
  }
  await sl(500);
  await page.screenshot({path:path.join(OUT,'ss-03-fx-search.png')});
  console.log('[3/4] DONE');

  // Screenshot 4: ReaEQ params
  console.log('[4/4] ReaEQ params...');
  await searchInput.fill('');
  await sl(500);
  await searchInput.fill('ReaEQ');
  await sl(1500);
  await page.locator('button:has-text("ReaEQ")').first().click();
  await page.waitForSelector('text=Freq', {timeout:15000});
  await page.waitForSelector('text=Gain', {timeout:15000});
  await sl(500);
  await page.screenshot({path:path.join(OUT,'ss-04-params.png')});
  console.log('[4/4] DONE');

  await browser.close();
  console.log('ALL DONE');
})();

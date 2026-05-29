const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/screenshots';
const URL = 'http://127.0.0.1:5173';
async function sl(ms) { return new Promise(r=>setTimeout(r,ms)); }
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const b = await chromium.launch({headless:true});
  const p = await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});

  // 1. Tracks
  console.log('[1/4] tracks');
  await p.goto(URL, {waitUntil:'networkidle'});
  await p.getByText('Tracks').first().click();
  await p.waitForSelector('text=Track 1', {timeout:15000});
  await p.waitForSelector('text=Track 2', {timeout:15000});
  await p.waitForSelector('text=Track 3', {timeout:15000});
  await p.getByText('Track 2').first().click(); await sl(400);
  await p.screenshot({path:path.join(OUT,'ss-01-tracks.png')});
  console.log('[1/4] ok');

  // 2. FX Browser - use a long wait instead of waitForFunction
  console.log('[2/4] fx browser');
  await p.getByText('FX').first().click(); await sl(500);
  // Wait for loading to finish - poll with longer timeout
  let loaded = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const hasLoading = await p.evaluate(() => document.body.textContent.includes('Loading FX...'));
    if (!hasLoading) {
      loaded = true;
      break;
    }
    await sl(2000);
  }
  if (!loaded) {
    console.log('FX still loading after 60s, taking screenshot anyway');
  }
  // Wait for count footer
  for (let attempt = 0; attempt < 15; attempt++) {
    const hasCount = await p.evaluate(() => {
      for (const s of document.querySelectorAll('span')) {
        if (/\d+ total plugins/.test(s.textContent)) return true;
      }
      return false;
    });
    if (hasCount) break;
    await sl(2000);
  }
  await sl(600);
  await p.screenshot({path:path.join(OUT,'ss-02-fx-browser.png')});
  console.log('[2/4] ok');

  // 3. Search ReaVerb
  console.log('[3/4] search');
  const si = p.locator('input[placeholder="Search FX..."]');
  await si.fill('ReaVerb'); await sl(1000);
  await p.waitForFunction(() => document.body.innerText.includes('ReaVerb'), {timeout:15000});
  await sl(500);
  await p.screenshot({path:path.join(OUT,'ss-03-fx-search.png')});
  console.log('[3/4] ok');

  // 4. ReaEQ params
  console.log('[4/4] params');
  await si.fill(''); await sl(500);
  await si.fill('ReaEQ'); await sl(1000);
  await p.locator('button:has-text("ReaEQ")').first().click();
  await p.waitForSelector('text=Freq', {timeout:15000});
  await p.waitForSelector('text=Gain', {timeout:15000});
  await sl(500);
  await p.screenshot({path:path.join(OUT,'ss-04-params.png')});
  console.log('[4/4] ok');

  await b.close();
  console.log('DONE');
})();

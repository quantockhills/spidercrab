
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

  // Log all WS connections
  p.on('websocket', ws => {
    console.log('WS:', ws.url());
    ws.on('framereceived', f => console.log('WS recv:', f.payload.toString().substring(0,100)));
    ws.on('framesent', f => console.log('WS sent:', f.payload.toString().substring(0,100)));
  });

  await p.goto(URL, {waitUntil:'networkidle'});
  await p.getByText('Tracks').first().click();
  await p.waitForSelector('text=Track 1', {timeout:15000});
  await p.waitForSelector('text=Track 2', {timeout:15000});
  await p.waitForSelector('text=Track 3', {timeout:15000});
  await p.getByText('Track 2').first().click(); await sl(400);
  await p.screenshot({path:path.join(OUT,'ss-01-tracks.png')});
  console.log('ss-01 tracks ok');

  await p.getByText('FX').first().click(); await sl(500);
  await p.waitForFunction(()=>!document.body.textContent.includes('Loading FX...'), {timeout:120000});
  await p.waitForFunction(()=>{for(const s of document.querySelectorAll('span'))if(/\d+ total plugins/.test(s.textContent))return true;return false;}, {timeout:30000});
  await sl(600);
  await p.screenshot({path:path.join(OUT,'ss-02-fx-browser.png')});
  console.log('ss-02 fx ok');

  const si=p.locator('input[placeholder="Search FX..."]');
  await si.fill('ReaVerb'); await sl(1000);
  await p.waitForFunction(()=>document.body.innerText.includes('ReaVerb'), {timeout:15000});
  await sl(500);
  await p.screenshot({path:path.join(OUT,'ss-03-fx-search.png')});
  console.log('ss-03 search ok');

  await si.fill(''); await sl(500);
  await si.fill('ReaEQ'); await sl(1000);
  await p.locator('button:has-text("ReaEQ")').first().click();
  await p.waitForSelector('text=Freq', {timeout:15000});
  await p.waitForSelector('text=Gain', {timeout:15000});
  await sl(500);
  await p.screenshot({path:path.join(OUT,'ss-04-params.png')});
  console.log('ss-04 params ok');

  await b.close();
  console.log('DONE');
})();

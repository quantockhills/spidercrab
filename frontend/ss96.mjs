import { chromium } from 'playwright';
const G = '/home/sasha/projects/reaper-ipad/gui_testing';

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 2360, height: 1640 } });

  // Load, set localStorage, reload
  await p.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.evaluate(() => {
    localStorage.setItem('fxChainPath', '/tmp/test-fx-chains');
    console.log('localStorage set');
  });
  await p.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Page loaded:', await p.title());

  // Wait for WebSocket
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    const text = await p.textContent('body');
    if (text && text.includes('Connected')) {
      console.log('Connected after', i+1, 's');
      break;
    }
  }

  // Verify fxChainPath is set
  const checkPath = await p.evaluate(() => localStorage.getItem('fxChainPath'));
  console.log('fxChainPath in localStorage:', checkPath);

  // Click FX button
  await p.locator('button:has-text("FX")').click();
  await p.waitForTimeout(1500);

  // Full browser screenshot before search
  await p.screenshot({ path: `${G}/ss-96-full-browser.png`, fullPage: false });
  console.log('Full browser saved');

  // Search for "comp"
  const inputs = await p.locator('input').all();
  if (inputs.length > 0) {
    await inputs[0].fill('comp');
    console.log('Searched comp');
  }
  await p.waitForTimeout(3000);

  await p.screenshot({ path: `${G}/ss-96-search-comp.png`, fullPage: false });
  console.log('Comp search saved');

  // Search for "rea"
  await inputs[0].fill('');
  await p.waitForTimeout(300);
  await inputs[0].fill('rea');
  await p.waitForTimeout(3000);

  await p.screenshot({ path: `${G}/ss-96-search-rea.png`, fullPage: false });
  console.log('Rea search saved');

  await b.close();
  console.log('Done');
})();

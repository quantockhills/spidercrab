const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();

  // Intercept WS
  const wsLog = [];
  p.on('websocket', ws => {
    console.log('WS opened:', ws.url());
    ws.on('framereceived', f => {
      const txt = f.payload.toString();
      wsLog.push({dir:'recv', text: txt.substring(0,200)});
      console.log('WS recv:', txt.substring(0,150));
    });
    ws.on('framesent', f => {
      const txt = f.payload.toString();
      wsLog.push({dir:'sent', text: txt.substring(0,200)});
      console.log('WS sent:', txt.substring(0,150));
    });
    ws.on('close', () => console.log('WS closed'));
    ws.on('socketerror', err => console.log('WS error:', err));
  });

  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await p.getByText('Tracks').first().click();
  await p.waitForSelector('text=Track 1', { timeout: 15000 });
  await p.getByText('Track 2').first().click();

  // Click FX tab
  await p.getByText('FX').first().click();
  console.log('Clicked FX, waiting 15s...');
  await new Promise(r => setTimeout(r, 15000));

  // Take screenshot of current state
  await p.screenshot({ path: '/tmp/debug-browser-ws.png' });
  const text = await p.evaluate(() => document.body.innerText);
  console.log('Page text:', text.substring(0, 2000));

  console.log('\nWS log entries:', wsLog.length);
  for (const entry of wsLog.slice(0, 20)) {
    console.log(`  ${entry.dir}: ${entry.text}`);
  }

  await b.close();
})();

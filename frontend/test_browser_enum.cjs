const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();

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

  // Click FX tab
  console.log('Clicking FX tab...');
  await p.getByText('FX').first().click();

  // Wait up to 60s for fx/enumerate response
  console.log('Waiting for fx/enumerate response...');
  await new Promise(r => setTimeout(r, 60000));

  console.log('\n=== WS Log ===');
  for (const entry of wsLog) {
    console.log(`${entry.dir}: ${entry.text}`);
  }

  await p.screenshot({ path: '/tmp/debug-fx-long.png' });
  const text = await p.evaluate(() => document.body.innerText);
  console.log('\nPage text:', text.substring(0, 2000));

  await b.close();
})();

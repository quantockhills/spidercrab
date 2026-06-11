import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { createConnection } from 'net';
import crypto from 'crypto';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      s.once('data', d => { if (d.includes('101')) resolve(s); else reject('handshake failed'); });
    });
    s.on('error', reject);
    setTimeout(() => reject('connect timeout'), 8000);
  });
}

function wsSend(sock, msg) {
  const data = Buffer.from(JSON.stringify(msg));
  const mask = crypto.randomBytes(4);
  const len = data.length;
  let hdr;
  if (len < 126) hdr = Buffer.from([0x81, 0x80 | len]);
  else hdr = Buffer.from([0x81, 0x80 | 126, (len >> 8) & 0xFF, len & 0xFF]);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  sock.write(Buffer.concat([hdr, mask, masked]));
}

process.env.DISPLAY = ':99';
const xvfb = spawn('Xvfb', [':99', '-screen', '0', '2360x1640x24'], { stdio: 'ignore' });
await sleep(1000);

const reaper = spawn('/home/sasha/reaper-portable/reaper', ['-new'], {
  stdio: 'ignore', env: { ...process.env, DISPLAY: ':99' }
});
await sleep(12000);

// Populate tracks + FX
const ws = await wsConnect(9224);
for (let i = 0; i < 3; i++) {
  wsSend(ws, { type: 'command', command: 'track/add', id: `add_${i}` });
  await sleep(800);
}
wsSend(ws, { type: 'command', command: 'fx/add', payload: { trackIdx: 0, name: 'ReaEQ (Cockos)' }, id: 'fx1' });
await sleep(1500);
wsSend(ws, { type: 'command', command: 'fx/add', payload: { trackIdx: 0, name: 'ReaComp (Cockos)' }, id: 'fx2' });
await sleep(1500);
wsSend(ws, { type: 'command', command: 'fx/add', payload: { trackIdx: 1, name: 'ReaVerbate' }, id: 'fx3' });
await sleep(1500);
ws.end();

// Playwright at true iPad Air M3 landscape (2360x1640)
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });

await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 20000 });
await sleep(4000);

// Zoom 2x to make elements readable at iPad res
await page.evaluate(() => { document.body.style.zoom = '2'; });
await sleep(1000);

// Click through each tab and screenshot
const tabLabels = ['📂Media', '🎛️FX', '🎚️Tracks', '🎹Playtime', '⚙️Settings'];
const tabIds = ['media', 'fx', 'tracks', 'playtime', 'settings'];

for (let i = 0; i < tabLabels.length; i++) {
  try {
    const btn = page.locator('button').filter({ hasText: tabLabels[i].slice(2) }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await sleep(2500);
    }
  } catch(e) {
    const btns = await page.$$('button');
    if (btns[i]) { await btns[i].click(); await sleep(2500); }
  }
  await page.screenshot({ path: `/home/sasha/projects/reaper-ipad/gui_testing/hero-${tabIds[i]}.png` });
  console.log(`hero-${tabIds[i]}.png`);
}

await browser.close();
reaper.kill('SIGTERM');
xvfb.kill('SIGTERM');
console.log('Done!');

import { chromium } from '@playwright/test';

const IPAD_PRO = { width: 2360, height: 1640 };

const MOCK_DIR_ENTRIES = [
  { name: '..', type: 'dir', size: 0 },
  { name: 'Audio Files', type: 'dir', size: 0 },
  { name: 'kick.wav', type: 'file', size: 48201 },
  { name: 'snare.wav', type: 'file', size: 36204 },
  { name: 'hihat.wav', type: 'file', size: 24100 },
  { name: 'bass_line.wav', type: 'file', size: 125400 },
  { name: 'guitar_strum.flac', type: 'file', size: 298000 },
];

function makeMockWsHandler() {
  return (ws) => {
    ws.onMessage((message) => {
      let msg;
      try { msg = JSON.parse(message.toString()); } catch { return; }
      const { type, command, id } = msg;
      if (type !== 'command' || !id) return;
      let responsePayload = {};
      switch (command) {
        case 'track/getAll':
          responsePayload = {
            tracks: [
              { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
              { index: 1, name: 'Track 2', trackNumber: 2, selected: true,  muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
            ],
          };
          break;
        case 'track/getFx':
          responsePayload = {
            fx: [
              { index: 0, name: 'VST3: RS5K (ReaSamplOmatic 5000)', format: 'VST3', ident: 'rs5k' },
              { index: 1, name: 'VST3: ReaEQ', format: 'VST3', ident: 'reaeq' },
            ],
          };
          break;
        case 'fx/enumerate':
          responsePayload = {
            fx: [
              { index: 0, name: 'VST3: RS5K (ReaSamplOmatic 5000)', format: 'VST3', ident: 'rs5k' },
              { index: 1, name: 'VST3: ReaEQ', format: 'VST3', ident: 'reaeq' },
              { index: 2, name: 'VST3: ReaComp', format: 'VST3', ident: 'reacomp' },
            ],
          };
          break;
        case 'sampler/trim/getInfo':
          responsePayload = { startOffset: '0.000', endOffset: '1.000' };
          break;
        case 'sampler/vel/getInfo':
          responsePayload = { paramIdx: 5, name: 'Velocity', value: 100, min: 0, max: 127, formatted: '100' };
          break;
        case 'sampler/loadFile':
          responsePayload = { success: true, filePath: '/Audio Files/kick.wav', displayName: 'kick.wav' };
          break;
        case 'sample/getDirectory':
          responsePayload = { entries: MOCK_DIR_ENTRIES, path: msg.payload?.path || '/' };
          break;
        default:
          responsePayload = {};
      }
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'response', id, success: true, payload: responsePayload }));
      }, 0);
    });
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize(IPAD_PRO);

  page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

  await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/home/sasha/projects/reaper-ipad/gui_testing/debug-126-initial.png' });
  console.log('Initial screenshot saved');

  // Navigate to FX tab
  const fxBtn = page.locator('nav button:has-text("FX")');
  await fxBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/home/sasha/projects/reaper-ipad/gui_testing/debug-126-fx-tab.png' });
  console.log('FX tab screenshot saved');

  const fxContent = await page.textContent('body');
  console.log('FX TAB BODY:', fxContent.substring(0, 2000));

  const trackElements = await page.locator('text=Track').all();
  console.log('Track elements found:', trackElements.length);
  for (const el of trackElements) {
    console.log('  -', await el.textContent());
  }

  const buttons = await page.locator('button').all();
  console.log('Buttons:', buttons.length);
  for (const b of buttons) {
    const txt = await b.textContent();
    if (txt && txt.length < 60) console.log('  Button:', txt);
  }

  await browser.close();
})();

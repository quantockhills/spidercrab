/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
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

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * needed for the SamplerPanel Browse flow (Issue #126).
 */
function makeMockWsHandler() {
  return (ws: any): void => {
    ws.onMessage((message: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(message.toString());
      } catch {
        return;
      }

      const { type, command, id } = msg;
      if (type !== 'command' || !id) return;

      let responsePayload: any = {};
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
          // Return RS5K on Track 2 so the sampler panel can open
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
          break;
      }

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'response',
          id,
          success: true,
          payload: responsePayload,
        }));
      }, 0);
    });
  };
}

async function setupWithMock(page: any) {
  await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());
  await page.goto('/');
  // Wait for track data to appear
  try {
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 10000 });
  } catch {
    const refreshBtn = page.getByTitle('Refresh tracks');
    await refreshBtn.click();
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 10000 });
  }
}

test.describe('Issue #126 — Sampler Load Sample from Media Browser Screenshots', () => {
  test.setTimeout(120000);

  test('SS-126: Sampler Browse button and file browser overlay', async ({ page }) => {
    await page.setViewportSize(IPAD_PRO);
    await setupWithMock(page);
    await page.waitForTimeout(1000);

    // Select Track 2 on the TrackOverview first (so FxBrowser knows which track)
    const track2InOverview = page.getByText('Track 2').first();
    await expect(track2InOverview).toBeVisible({ timeout: 5000 });
    await track2InOverview.click();
    await page.waitForTimeout(500);

    // Now navigate to FX tab (selectedTrack is set)
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(1000);

    // Wait for FX browser to appear with Track 2 as target
    await expect(page.getByText('FX Browser')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Target:').first()).toBeVisible({ timeout: 5000 });

    // Find RS5K in the FX browser list and click it to open SamplerPanel
    const rs5kBtn = page.getByText('RS5K').first();
    await expect(rs5kBtn).toBeVisible({ timeout: 5000 });
    await rs5kBtn.click();
    await page.waitForTimeout(2000);

    // We should now see the SamplerPanel with trim controls and Browse button
    // Verify the Browse button is visible
    const browseBtn = page.getByRole('button', { name: /Browse/i });
    await expect(browseBtn).toBeVisible({ timeout: 5000 });

    // Take screenshot 1: SamplerPanel with Browse button visible
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-126-sampler-panel-with-browse.png` });
    console.log('Screenshot 1: Sampler panel with Browse button');

    // Click Browse button to open file browser overlay
    await browseBtn.click();
    await page.waitForTimeout(1500);

    // File browser overlay should be showing directory entries
    // Verify entries are visible
    await expect(page.getByText('kick.wav').first()).toBeVisible({ timeout: 5000 });

    // Take screenshot 2: File browser overlay showing directory listing
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-126-file-browser-overlay.png` });
    console.log('Screenshot 2: File browser overlay');

    // Click on kick.wav to load it into the sampler
    await page.getByText('kick.wav').first().click();
    await page.waitForTimeout(2000);

    // After loading, the overlay should close and show the loaded file name
    await expect(page.getByText('Loaded file:').first()).toBeVisible({ timeout: 5000 });

    // Take screenshot 3: Sampler panel showing loaded file
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-126-sampler-loaded-file.png` });
    console.log('Screenshot 3: Sampler panel showing loaded file');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

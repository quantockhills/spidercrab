/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue94';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Generate 12 mock FX params with realistic names and values.
 */
function makeFxParams() {
  const paramDefs = [
    { name: 'Frequency', value: 0.5, min: 20, max: 20000, mid: 0.3, formatted: '1.0 kHz' },
    { name: 'Gain', value: 0.6, min: 0, max: 1, mid: 0.5, formatted: '+3.2 dB' },
    { name: 'Q Factor', value: 0.3, min: 0, max: 1, mid: 0.3, formatted: '0.71' },
    { name: 'Threshold', value: 0.4, min: 0, max: 1, mid: 0.5, formatted: '-18.0 dB' },
    { name: 'Ratio', value: 0.5, min: 0, max: 1, mid: 0.5, formatted: '4:1' },
    { name: 'Attack', value: 0.2, min: 0, max: 1, mid: 0.3, formatted: '10 ms' },
    { name: 'Release', value: 0.7, min: 0, max: 1, mid: 0.5, formatted: '150 ms' },
    { name: 'Mix', value: 0.5, min: 0, max: 1, mid: 0.5, formatted: '50%' },
    { name: 'Dry/Wet', value: 0.8, min: 0, max: 1, mid: 0.5, formatted: '80%' },
    { name: 'Pre-Filter', value: 0.0, min: 0, max: 1, mid: 0.0, formatted: 'Off' },
    { name: 'Post-Filter', value: 1.0, min: 0, max: 1, mid: 1.0, formatted: 'On' },
    { name: 'Stereo Width', value: 0.5, min: 0, max: 1, mid: 0.5, formatted: '100%' },
  ];
  return paramDefs.map((p, i) => ({ index: i, ...p }));
}

/**
 * Build a mock WebSocket handler that responds to all commands the app
 * needs during the inline FX drawer screenshot test.
 */
function makeMockWsHandler() {
  const allParams = makeFxParams();
  const paramsFetches: Record<string, number> = {};

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
              {
                index: 0, name: 'Bass', trackNumber: 1,
                selected: true, muted: false, soloed: false, armed: false,
                volume: 0.75, pan: 0,
              },
              {
                index: 1, name: 'Synth Pad', trackNumber: 2,
                selected: false, muted: false, soloed: false, armed: false,
                volume: 0.50, pan: -0.3,
              },
            ],
          };
          break;

        case 'track/getFx':
          if (msg.trackIdx === 0) {
            responsePayload = {
              fx: [
                { index: 0, name: 'ReaEQ (Cockos)' },
                { index: 1, name: 'ReaComp (Cockos)' },
              ],
            };
          } else {
            responsePayload = { fx: [] };
          }
          break;

        case 'fx/getParams': {
          const { trackIdx, fxIdx, offset = 0, limit = 8 } = msg;
          const fetchKey = `${trackIdx}:${fxIdx}:${offset}`;
          paramsFetches[fetchKey] = (paramsFetches[fetchKey] || 0) + 1;

          const sliced = allParams.slice(offset, offset + limit);
          responsePayload = {
            params: sliced,
            total: allParams.length,
            offset,
            limit,
          };
          break;
        }

        case 'fx/setParam':
          responsePayload = { success: true };
          break;

        case 'fx/getPreset':
          responsePayload = {
            presetIndex: 2,
            presetName: 'Hall Reverb',
            numPresets: 5,
          };
          break;

        case 'fx/setPreset':
          responsePayload = {
            presetIndex: msg.presetIdx,
            presetName: `Preset ${msg.presetIdx}`,
            numPresets: 5,
          };
          break;

        case 'fx/getAllPresetNames':
          responsePayload = {
            presetNames: ['Room', 'Hall', 'Plate', 'Spring', 'Reverse'],
            currentIndex: 2,
          };
          break;

        case 'transport/getState':
          responsePayload = { playing: false, recording: false };
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

/**
 * Wait for the connection status to show "Connected".
 */
async function waitForConnected(page: any) {
  let connected = false;
  for (let i = 0; i < 30; i++) {
    const text = await page.evaluate(() => document.body.textContent ?? '');
    if (text.includes('Connected')) {
      connected = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  console.log('Connected:', connected);
  return connected;
}

test.describe('Issue #94 — Inline FX Param Expansion Screenshots', () => {
  test.setTimeout(90000);

  test('Capture inline FX drawer with params, preset bar, pinning, and pagination', async ({ page }) => {
    // Log console errors for debugging
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Intercept WebSocket — frontend connects to 127.0.0.1:9224 (useReaper default)
    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for Connected status
    const connected = await waitForConnected(page);
    console.log('App connected:', connected);

    // Wait for track data to appear
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Bass') ?? false,
        { timeout: 10000 },
      );
      console.log('Tracks loaded');
    } catch {
      console.log('Tracks may not have loaded, continuing');
    }

    // Log visible buttons for debugging
    const buttons = await page.locator('button').allTextContents();
    console.log('Buttons:', buttons.join(' | '));

    // Wait for FX cards to appear (ReaEQ, ReaComp)
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.textContent ?? '';
          return text.includes('ReaEQ') || text.includes('ReaComp');
        },
        { timeout: 10000 },
      );
      console.log('FX cards loaded');
    } catch {
      console.log('FX cards may not have loaded, continuing');
    }

    await page.waitForTimeout(500);

    // ── Screenshot 1: Track overview with FX cards visible (before opening drawer) ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-94-track-with-fx-cards.png` });
    console.log('Screenshot 1 saved: ss-94-track-with-fx-cards.png');

    // ── Click the ReaEQ FX card to open the inline drawer ──
    const reaeqCard = page.locator('button:has-text("ReaEQ")');
    const reaeqVisible = await reaeqCard.isVisible().catch(() => false);
    console.log('ReaEQ card visible:', reaeqVisible);

    if (reaeqVisible) {
      await reaeqCard.click();
      console.log('Clicked ReaEQ card to open inline drawer');
      await page.waitForTimeout(1500);
    }

    // Verify drawer is open by checking for close button
    const closeBtn = page.locator('button[aria-label="Close drawer"]');
    const drawerOpen = await closeBtn.isVisible().catch(() => false);
    console.log('Drawer open:', drawerOpen);

    if (drawerOpen) {
      // Wait for params to load
      try {
        await page.waitForFunction(
          () => {
            const text = document.body.textContent ?? '';
            return text.includes('Frequency') && text.includes('Gain');
          },
          { timeout: 10000 },
        );
        console.log('Params loaded in drawer');
      } catch {
        console.log('Params may not have loaded fully, continuing');
      }

      await page.waitForTimeout(500);

      // ── Screenshot 2: Inline drawer with preset bar and param sliders ──
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-94-inline-drawer-params.png` });
      console.log('Screenshot 2 saved: ss-94-inline-drawer-params.png');

      // ── Pin the first parameter (Frequency) ──
      const pinButtons = page.locator('button[aria-label="Pin parameter"]');
      const pinCount = await pinButtons.count();
      console.log('Pin buttons found:', pinCount);

      if (pinCount > 0) {
        await pinButtons.first().click();
        console.log('Clicked first pin button');
        await page.waitForTimeout(500);
      }

      // ── Screenshot 3: Pinned params section visible at top of drawer ──
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-94-inline-drawer-pinned.png` });
      console.log('Screenshot 3 saved: ss-94-inline-drawer-pinned.png');

      // ── Navigate to next page of params ──
      const nextBtn = page.locator('button:has-text("Next →")');
      const nextVisible = await nextBtn.isVisible().catch(() => false);
      console.log('Next button visible:', nextVisible);

      if (nextVisible) {
        const nextEnabled = await nextBtn.isDisabled().catch(() => true);
        console.log('Next button disabled:', nextEnabled);
        if (!nextEnabled) {
          await nextBtn.click();
          console.log('Clicked Next → to paginate');
          await page.waitForTimeout(1000);

          // ── Screenshot 4: Page 2 of params ──
          await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-94-inline-drawer-page2.png` });
          console.log('Screenshot 4 saved: ss-94-inline-drawer-page2.png');
        }
      }
    } else {
      // Take fallback screenshot if drawer didn't open
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-94-drawer-not-opened.png` });
      console.log('Fallback screenshot saved: drawer did not open');
    }

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

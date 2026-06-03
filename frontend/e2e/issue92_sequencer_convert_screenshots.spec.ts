/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue92';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Generate sequencer data with 16 columns, 8 rows, and some active steps.
 */
function makeSequencerData() {
  const columns = 16;
  const rows = 8;
  const baseNote = 36; // C2
  const steps: any[] = [];

  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      // Kick drum on row 0 (columns 0,4,8,12)
      const isKick = row === 0 && (col % 4 === 0);
      // Snare on row 2 (columns 4,12)
      const isSnare = row === 2 && (col === 4 || col === 12);
      // Hi-hat on row 4 (every other step)
      const isHihat = row === 4 && col % 2 === 0;
      // Open hat on row 5 (columns 6, 14)
      const isOpenHat = row === 5 && (col === 6 || col === 14);
      // Crash on row 7 (columns 0, 8)
      const isCrash = row === 7 && (col === 0 || col === 8);

      const active = isKick || isSnare || isHihat || isOpenHat || isCrash;
      steps.push({
        column: col,
        row,
        active,
        velocity: active ? Math.floor(Math.random() * 40 + 80) : 100,
        note: baseNote + row,
      });
    }
  }

  return {
    columns,
    rows,
    length: 16,
    baseNote,
    playhead: 3,
    steps,
  };
}

/**
 * Make a mock WebSocket handler that responds to all commands the app
 * needs during the sequencer convert-to-clip test.
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

        case 'sequencer/getAll':
          responsePayload = makeSequencerData();
          break;

        case 'sequencer/toggleStep': {
          // Toggle the step and return the new state
          // We'll generate fresh data each time (simplification)
          responsePayload = { success: true };
          break;
        }

        case 'sequencer/convertToClip':
          responsePayload = {
            success: true,
            trackIdx: 0,
            noteCount: 14,
            length: 16,
          };
          break;

        case 'matrix/getAll':
          // Return empty matrix (no clips) to prevent SessionView crash
          responsePayload = {
            columns: 4,
            rows: 4,
            slots: [],
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
 * Helper: wait for Connected status in the app header.
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

test.describe('Issue #92 — Sequencer Convert to Clip Screenshots', () => {
  test.setTimeout(90000);

  test('Capture sequencer view with convert-to-clip button (before and after)', async ({ page }) => {
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

    // Wait for track data to appear (indicates WS mock is working)
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Track 1') ?? false,
        { timeout: 10000 },
      );
      console.log('Tracks loaded');
    } catch {
      console.log('Tracks may not have loaded, continuing');
    }

    // Log visible buttons
    const buttons = await page.locator('button').allTextContents();
    console.log('Buttons:', buttons.join(' | '));

    // Click the "Playtime" tab in the bottom nav to access the clips/sequencer view
    const playtimeTab = page.locator('nav button:has-text("Playtime")');
    await playtimeTab.click();
    await page.waitForTimeout(1000);
    console.log('Clicked Playtime tab');

    // Now click "Sequencer" mode button inside the clips view
    const sequencerModeBtn = page.locator('button:has-text("Sequencer")');
    await sequencerModeBtn.click();
    await page.waitForTimeout(1000);
    console.log('Clicked Sequencer mode');

    // Wait for sequencer data to load (grid should appear with step buttons)
    try {
      await page.waitForFunction(
        () => {
          const buttons = document.querySelectorAll('[data-active]');
          return buttons.length > 10;
        },
        { timeout: 10000 },
      );
      console.log('Sequencer grid loaded');
    } catch {
      console.log('Sequencer grid may not have loaded fully, continuing');
    }

    // Wait a moment for rendering
    await page.waitForTimeout(500);

    // ── Screenshot 1: Sequencer view with active steps and enabled "⇩ Clip" button ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-92-sequencer-with-pattern.png` });
    console.log('Screenshot 1 saved: ss-92-sequencer-with-pattern.png');

    // ── Click the "⇩ Clip" convert button ──
    const clipButton = page.locator('button:has-text("Clip")');
    const clipButtonVisible = await clipButton.isVisible().catch(() => false);
    console.log('Clip button visible:', clipButtonVisible);

    // Check if the clip button is enabled
    const clipButtonDisabled = await clipButton.isDisabled().catch(() => true);
    console.log('Clip button disabled:', clipButtonDisabled);

    if (clipButtonVisible && !clipButtonDisabled) {
      await clipButton.click();
      console.log('Clicked ⇩ Clip button');
      await page.waitForTimeout(1500);
    }

    // ── Screenshot 2: After conversion — should show success toast and switch to Session mode ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-92-after-convert.png` });
    console.log('Screenshot 2 saved: ss-92-after-convert.png');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

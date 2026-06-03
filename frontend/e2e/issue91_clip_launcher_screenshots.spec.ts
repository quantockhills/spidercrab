/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue91';
const IPAD_PRO = { width: 2360, height: 1640 };

function padSlot(col: number, row: number, state: string, name = ''): any {
  return {
    column: col,
    row,
    state,
    color: state === 'playing' ? '#00ff88' : state === 'stopped' ? '#6688aa' : '#444444',
    name,
    clipType: state !== 'empty' ? (row % 2 === 0 ? 'midi' : 'audio') : 'none',
  };
}

/** Build a full 4×4 matrix with a mix of states */
function makeSessionMatrix() {
  const cols = 4;
  const rows = 4;
  const slots: any[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Row 0: mixed states — slot(0,0) playing, (1,0) stopped, rest empty
      if (r === 0) {
        if (c === 0) {
          slots.push(padSlot(c, r, 'playing', 'Loop 1'));
        } else if (c === 1) {
          slots.push(padSlot(c, r, 'stopped', 'Kick' ));
        } else {
          slots.push(padSlot(c, r, 'empty'));
        }
      }
      // Row 1: one playing, one stopped, two empty
      else if (r === 1) {
        if (c === 0) {
          slots.push(padSlot(c, r, 'playing', 'Lead'));
        } else if (c === 2) {
          slots.push(padSlot(c, r, 'stopped', 'Bass'));
        } else {
          slots.push(padSlot(c, r, 'empty'));
        }
      }
      // Row 2: mostly stopped
      else if (r === 2) {
        if (c === 1) {
          slots.push(padSlot(c, r, 'stopped', 'Pad'));
        } else if (c === 3) {
          slots.push(padSlot(c, r, 'stopped', 'FX'));
        } else {
          slots.push(padSlot(c, r, 'empty'));
        }
      }
      // Row 3: empty
      else {
        slots.push(padSlot(c, r, 'empty'));
      }
    }
  }
  return {
    columns: cols,
    rows,
    transport: { playing: true, recording: false },
    slots,
  };
}

/**
 * Create a minimal matrix response (all empty, for initial load).
 */
function makeEmptyMatrix() {
  const cols = 4;
  const rows = 4;
  const slots: any[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push(padSlot(c, r, 'empty'));
    }
  }
  return { columns: cols, rows: rows, transport: { playing: false, recording: false }, slots };
}

/**
 * Build a mock WS handler that responds to common commands.
 */
function makeMockWsHandler() {
  const matrixData = makeSessionMatrix();

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

        case 'matrix/getAll':
          responsePayload = matrixData;
          break;

        case 'matrix/triggerSlot': {
          const col = msg.column as number;
          const row = msg.row as number;
          // Toggle the slot state: empty/stopped -> playing, playing -> stopped
          const slotIndex = matrixData.slots.findIndex(
            (s: any) => s.column === col && s.row === row
          );
          if (slotIndex >= 0) {
            const slot = matrixData.slots[slotIndex];
            if (slot.state === 'empty') {
              slot.state = 'playing';
              slot.color = '#00ff88';
              slot.clipType = row % 2 === 0 ? 'midi' : 'audio';
            } else if (slot.state === 'stopped') {
              slot.state = 'playing';
              slot.color = '#00ff88';
            } else {
              slot.state = 'stopped';
              slot.color = '#6688aa';
            }
            responsePayload = { slot };
          } else {
            responsePayload = { slot: null };
          }
          break;
        }

        case 'matrix/triggerScene':
          responsePayload = { slots: matrixData.slots.filter((s: any) => s.row === msg.row) };
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

test.describe('Issue #91 — Clip Launcher / ReaLearn MIDI Feedback Screenshots', () => {
  test.setTimeout(90000);

  test('Capture SessionView with mixed clip states and triggered slot transition', async ({ page }) => {
    // Log console errors
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Intercept WebSocket
    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Wait for Connected
    const connected = await waitForConnected(page);
    console.log('App connected:', connected);

    // Wait for tracks to load (indicates WS mock is working)
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Track 1') ?? false,
        { timeout: 10000 },
      );
      console.log('Tracks loaded');
    } catch {
      console.log('Tracks may not have loaded, continuing');
    }

    // Click "Playtime" tab to show SessionView
    const playtimeTab = page.locator('nav button:has-text("Playtime")');
    await playtimeTab.click();
    await page.waitForTimeout(1500);
    console.log('Clicked Playtime tab');

    // Wait for Session mode (should be default) and matrix data to load
    try {
      await page.waitForFunction(
        () => {
          const slots = document.querySelectorAll('[data-state]');
          return slots.length >= 8;
        },
        { timeout: 10000 },
      );
      console.log('Session view loaded with slots');
    } catch {
      console.log('Session slots may not have loaded fully, continuing');
    }

    // Log slot states for debugging
    const slotStates = await page.evaluate(() => {
      const slots = document.querySelectorAll('[data-state]');
      return Array.from(slots).map((el) => ({
        col: el.getAttribute('data-col'),
        row: el.getAttribute('data-row'),
        state: el.getAttribute('data-state'),
      }));
    });
    console.log('Slot states:', JSON.stringify(slotStates));

    await page.waitForTimeout(500);

    // ── Screenshot 1: SessionView with mixed clip states ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-91-mixed-clip-states.png` });
    console.log('Screenshot 1 saved: ss-91-mixed-clip-states.png');

    // ── Tap a stopped slot (R0,C1) to trigger it ──
    const stoppedSlot = page.locator('button[data-col="1"][data-row="0"]');
    const stoppedVisible = await stoppedSlot.isVisible().catch(() => false);
    console.log('Stopped slot (1,0) visible:', stoppedVisible);

    if (stoppedVisible) {
      await stoppedSlot.click();
      console.log('Clicked slot (1,0) to trigger');
      await page.waitForTimeout(1500);
    }

    // ── Screenshot 2: After triggering a slot — should show state transition ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-91-after-slot-trigger.png` });
    console.log('Screenshot 2 saved: ss-91-after-slot-trigger.png');

    // ── Now tap an empty slot to see it become playing ──
    const emptySlot = page.locator('button[data-col="2"][data-row="0"]');
    const emptyVisible = await emptySlot.isVisible().catch(() => false);
    console.log('Empty slot (2,0) visible:', emptyVisible);

    if (emptyVisible) {
      await emptySlot.click();
      console.log('Clicked empty slot (2,0) to trigger');
      await page.waitForTimeout(1500);
    }

    // ── Screenshot 3: After triggering an empty slot ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-91-empty-to-playing.png` });
    console.log('Screenshot 3 saved: ss-91-empty-to-playing.png');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

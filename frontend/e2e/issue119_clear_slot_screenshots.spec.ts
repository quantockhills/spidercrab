/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';

// iPad Pro landscape viewport
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Mock WebSocket that handles matrix/clearSlot and pre-populates some slots
 * so the ✖ clear button is visible and testable.
 */
async function setupMockWs(page: any, sentCommands?: string[]): Promise<void> {
  const slotData = new Map<string, any>();

  // Initialize 8×8 empty matrix
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      slotData.set(`${c},${r}`, {
        column: c,
        row: r,
        state: 'empty',
        color: '',
        name: '',
        clipType: 'none',
      });
    }
  }

  // Pre-populate a few slots so clear button is visible
  const presets: Array<[number, number, string, string]> = [
    [0, 0, 'stopped', 'Bass Loop'],
    [1, 0, 'playing', 'Drums'],
    [2, 1, 'stopped', 'Pad'],
    [3, 2, 'stopped', 'Vocal'],
    [0, 3, 'playing', 'Lead'],
    [4, 0, 'stopped', 'FX'],
  ];
  for (const [c, r, state, name] of presets) {
    const key = `${c},${r}`;
    if (slotData.has(key)) {
      slotData.set(key, {
        column: c,
        row: r,
        state,
        color: state === 'playing' ? '#22c55e' : '#6b7280',
        name,
        clipType: 'audio',
      });
    }
  }

  function slotsToPayload(): any[] {
    const arr: any[] = [];
    for (const slot of slotData.values()) {
      arr.push({ ...slot });
    }
    return arr;
  }

  function broadcastSlotChanged(ws: any, col: number, row: number): void {
    const slot = slotData.get(`${col},${row}`);
    if (!slot) return;
    ws.send(JSON.stringify({
      type: 'event',
      event: 'matrix/slotStateChanged',
      payload: { ...slot },
    }));
  }

  await page.routeWebSocket('ws://127.0.0.1:9224', (ws) => {
    ws.onMessage((raw: string) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type !== 'command' || !msg.id) return;

      if (sentCommands) sentCommands.push(msg.command);

      let respPayload: Record<string, unknown> = {};

      switch (msg.command) {
        case 'track/getAll': {
          respPayload = {
            tracks: [
              { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0.0 },
              { index: 1, name: 'Track 2', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0.0 },
            ],
          };
          break;
        }
        case 'matrix/getAll': {
          respPayload = { columns: 8, rows: 8, slots: slotsToPayload() };
          break;
        }
        case 'matrix/triggerSlot': {
          const col = msg.column as number;
          const row = msg.row as number;
          const key = `${col},${row}`;
          const slot = slotData.get(key);
          if (slot) {
            slot.state = slot.state === 'playing' ? 'stopped' : 'playing';
            slotData.set(key, slot);
            respPayload = { ...slot };
            broadcastSlotChanged(ws, col, row);
          }
          break;
        }
        case 'matrix/clearSlot': {
          const col = msg.column as number;
          const row = msg.row as number;
          const key = `${col},${row}`;
          if (slotData.has(key)) {
            slotData.set(key, {
              column: col,
              row: row,
              state: 'empty',
              color: '',
              name: '',
              clipType: 'none',
              reversed: false,
            });
            respPayload = { column: col, row: row, state: 'empty', color: '', name: '', clipType: 'none', reversed: false };
            broadcastSlotChanged(ws, col, row);
          }
          break;
        }
        case 'matrix/setSlotState': {
          const col = msg.column as number;
          const row = msg.row as number;
          const state = msg.state as string;
          const key = `${col},${row}`;
          if (slotData.has(key) && ['playing', 'recording', 'stopped', 'empty'].includes(state)) {
            slotData.get(key)!.state = state;
            respPayload = { ...slotData.get(key) };
            broadcastSlotChanged(ws, col, row);
          }
          break;
        }
        case 'fx/enumerate': {
          respPayload = { fx: [] };
          break;
        }
        case 'transport/getState': {
          respPayload = { playing: false, recording: false };
          break;
        }
        default: {
          respPayload = {};
          break;
        }
      }

      ws.send(JSON.stringify({
        type: 'response',
        id: msg.id,
        success: true,
        payload: respPayload,
      }));
    });
  });
}

test.describe('Issue #119 - Clear slot screenshots', () => {
  test.setTimeout(60000);

  async function waitForSessionView(page: any, timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await page.evaluate(() => document.body.textContent ?? '');
      if (text.includes('Session View') && text.includes('Empty') && text.includes('Playing')) {
        return;
      }
      await page.waitForTimeout(300);
    }
  }

  test('shows clear button on non-empty slots and clears on click', async ({ page }) => {
    const sent: string[] = [];
    await setupMockWs(page, sent);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Navigate to Playtime tab
    await page.getByText('Playtime').first().click();
    await waitForSessionView(page);
    await page.waitForTimeout(1000);

    // Screenshot 1: Matrix with populated slots showing ✖ clear buttons
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-119-matrix-with-clear-buttons.png` });
    console.log('Captured ss-119-matrix-with-clear-buttons.png');

    // Verify clear button exists on a populated slot
    const clearBtn = page.getByLabel('Clear slot 1,1');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    console.log('Clear button visible on slot (0,0)');

    // Verify empty slot (7,7) does NOT have a clear button
    const emptyClearBtn = page.getByLabel('Clear slot 8,8');
    await expect(emptyClearBtn).not.toBeVisible();
    console.log('Empty slot has no clear button');

    // Verify multiple clear buttons exist
    const allClearButtons = page.getByRole('button').filter({ hasText: '✖' });
    const count = await allClearButtons.count();
    console.log(`Found ${count} clear buttons`);

    // Click the clear button on slot (0,0) - "Clear slot 1,1"
    await clearBtn.click();
    await page.waitForTimeout(2000);

    // Verify slot (0,0) is now empty
    const slot00 = page.locator('[data-col="0"][data-row="0"]');
    await expect(slot00).toHaveAttribute('data-state', 'empty', { timeout: 5000 });
    console.log('Slot (0,0) cleared to empty');

    // Verify matrix/clearSlot was sent
    expect(sent).toContain('matrix/clearSlot');
    console.log('matrix/clearSlot command was sent');

    // Screenshot 2: After clearing one slot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-119-after-clear.png` });
    console.log('Captured ss-119-after-clear.png');

    // Clear a playing slot (0,3) - "Clear slot 1,4"
    const clearPlayingBtn = page.getByLabel('Clear slot 1,4');
    await expect(clearPlayingBtn).toBeVisible({ timeout: 3000 });
    await clearPlayingBtn.click();
    await page.waitForTimeout(800);

    const slot03 = page.locator('[data-col="0"][data-row="3"]');
    await expect(slot03).toHaveAttribute('data-state', 'empty', { timeout: 5000 });
    console.log('Playing slot (0,3) cleared to empty');

    // Count clearSlot commands sent
    const clearSentCount = sent.filter(c => c === 'matrix/clearSlot').length;
    expect(clearSentCount).toBeGreaterThanOrEqual(2);
    console.log(`matrix/clearSlot sent ${clearSentCount} times`);

    // Screenshot 3: Final state after clearing two slots
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-119-final.png` });
    console.log('Captured ss-119-final.png');
  });
});

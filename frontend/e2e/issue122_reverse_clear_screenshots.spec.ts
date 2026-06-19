/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';

// iPad Pro landscape viewport
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Mock WebSocket that handles matrix/setSlotReverse, matrix/clearSlot,
 * and pre-populates slots with reversed flips for visual verification.
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
        reversed: false,
      });
    }
  }

  // Pre-populate slots: some normal, one reversed
  const presets: Array<[number, number, string, string, boolean]> = [
    [0, 0, 'stopped', 'Bass Loop', false],
    [1, 0, 'playing', 'Drums', false],
    [2, 1, 'stopped', 'Pad', true],     // reversed slot
    [3, 2, 'stopped', 'Vocal', false],
    [0, 3, 'playing', 'Lead', true],    // reversed + playing
    [4, 0, 'stopped', 'FX', false],
  ];
  for (const [c, r, state, name, reversed] of presets) {
    const key = `${c},${r}`;
    if (slotData.has(key)) {
      slotData.set(key, {
        column: c,
        row: r,
        state,
        color: state === 'playing' ? '#22c55e' : '#6b7280',
        name,
        clipType: 'audio',
        reversed,
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
        case 'matrix/setSlotReverse': {
          const col = msg.column as number;
          const row = msg.row as number;
          const reversed = msg.reversed as boolean;
          const key = `${col},${row}`;
          if (slotData.has(key)) {
            const slot = slotData.get(key)!;
            slot.reversed = reversed;
            slotData.set(key, slot);
            respPayload = { column: col, row: row, reversed };
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

test.describe('Issue #122 - Reverse & Clear Clip Operations', () => {
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

  test('shows reverse toggle and clear buttons on populated slots, verifies reversed state', async ({ page }) => {
    const sent: string[] = [];
    await setupMockWs(page, sent);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Navigate to Playtime tab
    await page.getByText('Playtime').first().click();
    await waitForSessionView(page);
    await page.waitForTimeout(1000);

    // Screenshot 1: Full matrix showing reverse buttons (↻/◄) and clear buttons (✖)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-122-matrix-with-reverse-clear.png` });
    console.log('Captured ss-122-matrix-with-reverse-clear.png');

    // Verify reverse button exists on a populated slot (0,0)
    const reverseBtn00 = page.getByLabel('Reverse slot 1,1');
    await expect(reverseBtn00).toBeVisible({ timeout: 5000 });
    console.log('Reverse button visible on slot (0,0)');

    // Verify clear button exists on the same slot
    const clearBtn00 = page.getByLabel('Clear slot 1,1');
    await expect(clearBtn00).toBeVisible({ timeout: 3000 });
    console.log('Clear button visible on slot (0,0)');

    // Verify reversed slot (2,1) shows ◄ and 'R' badge
    const reverseBtn21 = page.getByLabel('Reverse slot 3,2');
    await expect(reverseBtn21).toBeVisible({ timeout: 3000 });
    const reverseBtn21Text = await reverseBtn21.textContent();
    expect(reverseBtn21Text?.trim()).toBe('◄');
    console.log(`Slot (2,1) reverse button shows '◄' (reversed): "${reverseBtn21Text?.trim()}"`);

    // Verify reversed+playing slot (0,3) shows ◄ and 'R' badge
    const reverseBtn03 = page.getByLabel('Reverse slot 1,4');
    await expect(reverseBtn03).toBeVisible({ timeout: 3000 });
    const reverseBtn03Text = await reverseBtn03.textContent();
    expect(reverseBtn03Text?.trim()).toBe('◄');
    console.log(`Slot (0,3) reverse button shows '◄' (reversed + playing): "${reverseBtn03Text?.trim()}"`);

    // Verify non-reversed slot (0,0) shows ↻
    const reverseBtn00Text = await reverseBtn00.textContent();
    expect(reverseBtn00Text?.trim()).toBe('↻');
    console.log(`Slot (0,0) reverse button shows '↻' (not reversed): "${reverseBtn00Text?.trim()}"`);

    // Toggle reverse on slot (0,0) from ↻ to ◄
    await reverseBtn00.click();
    await page.waitForTimeout(1000);

    expect(sent).toContain('matrix/setSlotReverse');
    console.log('matrix/setSlotReverse command was sent');

    // After toggle, should show ◄
    const newReverseBtn00Text = await reverseBtn00.textContent();
    expect(newReverseBtn00Text?.trim()).toBe('◄');
    console.log(`After toggle, slot (0,0) reverse button shows '◄': "${newReverseBtn00Text?.trim()}"`);

    // Screenshot 2: After toggling reverse on slot (0,0)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-122-after-reverse-toggle.png` });
    console.log('Captured ss-122-after-reverse-toggle.png');

    // Toggle reverse back off on slot (0,0)
    await reverseBtn00.click();
    await page.waitForTimeout(1000);

    const toggledBackText = await reverseBtn00.textContent();
    expect(toggledBackText?.trim()).toBe('↻');
    console.log('Reverse toggled back off');

    // Now test clear on the reversed slot (2,1)
    const clearBtn21 = page.getByLabel('Clear slot 3,2');
    await expect(clearBtn21).toBeVisible({ timeout: 3000 });
    await clearBtn21.click();
    await page.waitForTimeout(1000);

    // Verify slot (2,1) is now empty
    const slot21 = page.locator('[data-col="2"][data-row="1"]');
    await expect(slot21).toHaveAttribute('data-state', 'empty', { timeout: 5000 });
    console.log('Reversed slot (2,1) cleared to empty');

    // Screenshot 3: After clearing the reversed slot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-122-after-clear-reversed.png` });
    console.log('Captured ss-122-after-clear-reversed.png');

    // Verify empty slot (7,7) has neither reverse nor clear buttons
    const emptyReverseBtn = page.getByLabel('Reverse slot 8,8');
    await expect(emptyReverseBtn).not.toBeVisible();
    const emptyClearBtn = page.getByLabel('Clear slot 8,8');
    await expect(emptyClearBtn).not.toBeVisible();
    console.log('Empty slot has no reverse or clear buttons');

    // Count commands sent
    const reverseSentCount = sent.filter(c => c === 'matrix/setSlotReverse').length;
    const clearSentCount = sent.filter(c => c === 'matrix/clearSlot').length;
    console.log(`matrix/setSlotReverse sent ${reverseSentCount} times`);
    console.log(`matrix/clearSlot sent ${clearSentCount} times`);

    // Screenshot 4: Final state
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-122-final.png` });
    console.log('Captured ss-122-final.png');
  });
});

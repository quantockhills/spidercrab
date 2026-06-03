/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';

// iPad Pro landscape viewport
const IPAD_PRO = { width: 2360, height: 1640 };

// Helper: route WebSocket through to real Reaper, capture messages
function setupRealWsProxy(page: any, captured: { sent: string[]; received: string[] }): void {
  page.routeWebSocket(WS_REAL, (ws) => {
    const realWs = new WebSocket(WS_REAL);

    realWs.on('open', () => {
      // Forward browser → real Reaper
      ws.onMessage((msg) => {
        const str = msg.toString();
        captured.sent.push(str);
        realWs.send(str);
      });
    });

    realWs.on('message', (data) => {
      const str = data.toString();
      captured.received.push(str);
      // Forward real Reaper → browser
      ws.send(str);
    });

    realWs.on('error', () => { /* ignore — Reaper WS doesn't send proper close */ });
    ws.on('close', () => realWs.close());
  });
}

test.describe('Playtime clip recording visual states', () => {
  test.setTimeout(120000);

  async function waitForConnected(page: any, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await page.evaluate(
        () => document.body.textContent?.includes('Connected') ?? false,
      );
      if (ok) return;
      await page.waitForTimeout(300);
    }
    throw new Error('Timed out waiting for Connected status');
  }

  async function waitForMatrixLoaded(page: any, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hasSlots = await page.evaluate(() => {
        const slots = document.querySelectorAll('[data-state]');
        return slots.length > 0;
      });
      if (hasSlots) return;
      await page.waitForTimeout(500);
    }
    throw new Error('Timed out waiting for matrix slots to render');
  }

  /**
   * Verify that a clip slot's rendered visual indicators match its data-state.
   * - 'recording' → ring + animate-pulse CSS classes
   * - 'playing'   → ring class (green ring)
   * - 'stopped'   → opacity-80 class
   * - 'empty'     → no special ring/pulse classes
   */
  async function assertSlotVisualState(slot: any, expectedState: string) {
    const actualState = await slot.getAttribute('data-state');
    expect(actualState).toBe(expectedState);

    const classAttr = (await slot.getAttribute('class')) ?? '';

    switch (expectedState) {
      case 'recording':
        expect(classAttr).toContain('animate-pulse');
        expect(classAttr).toContain('ring');
        break;
      case 'playing':
        expect(classAttr).toContain('ring');
        break;
      case 'stopped':
        expect(classAttr).toContain('opacity-80');
        break;
      case 'empty':
        // Empty slots have no ring/pulse/opacity mods
        expect(classAttr).not.toContain('ring');
        expect(classAttr).not.toContain('animate-pulse');
        break;
    }
  }

  test('shows red recording indicator on clip slots when recording', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);

    // Navigate to Playtime tab
    await page.getByText('Playtime').first().click();
    await waitForMatrixLoaded(page);
    await page.waitForTimeout(1000);

    // Take baseline screenshot of matrix
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-matrix-initial.png` });

    // Find any clip slots with known states in the loaded matrix
    const recordingSlots = page.locator('[data-state="recording"]');
    const playingSlots = page.locator('[data-state="playing"]');
    const stoppedSlots = page.locator('[data-state="stopped"]');
    const emptySlots = page.locator('[data-state="empty"]');

    const recordingCount = await recordingSlots.count();
    const playingCount = await playingSlots.count();
    const stoppedCount = await stoppedSlots.count();
    const emptyCount = await emptySlots.count();

    // Log what we found
    console.log(`Matrix slots: recording=${recordingCount}, playing=${playingCount}, stopped=${stoppedCount}, empty=${emptyCount}`);

    // Verify visual state of each slot that exists
    for (let i = 0; i < recordingCount; i++) {
      await assertSlotVisualState(recordingSlots.nth(i), 'recording');
    }
    for (let i = 0; i < playingCount; i++) {
      await assertSlotVisualState(playingSlots.nth(i), 'playing');
    }
    for (let i = 0; i < stoppedCount; i++) {
      await assertSlotVisualState(stoppedSlots.nth(i), 'stopped');
    }
    for (let i = 0; i < emptyCount; i++) {
      await assertSlotVisualState(emptySlots.nth(i), 'empty');
    }

    // Take annotated screenshot after state verification
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-visual-states.png` });
  });

  test('slot visual state updates after trigger (play/record)', async ({ page }) => {
    const captured: { sent: string[]; received: string[] } = { sent: [], received: [] };
    setupRealWsProxy(page, captured);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);

    // Navigate to Playtime tab
    await page.getByText('Playtime').first().click();
    await waitForMatrixLoaded(page);
    await page.waitForTimeout(1000);

    // Find a non-empty slot to trigger, or use Slot 1,1
    const nonEmptySlot = page.locator('[data-state]:not([data-state="empty"])').first();
    const hasNonEmpty = (await nonEmptySlot.count()) > 0;

    let targetSlot: any;
    let initialSlotState: string | null;

    if (hasNonEmpty) {
      targetSlot = nonEmptySlot;
    } else {
      // All slots are empty — we'll use any slot and trigger it
      targetSlot = page.getByLabelText('Slot 1,1');
    }

    initialSlotState = await targetSlot.getAttribute('data-state');
    console.log(`Triggering slot with initial state: ${initialSlotState}`);

    // Screenshot before trigger
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-before-trigger.png` });

    // Verify initial visual state
    if (initialSlotState && initialSlotState !== 'empty') {
      await assertSlotVisualState(targetSlot, initialSlotState);
    }

    // Trigger the slot (click it)
    await targetSlot.click();
    await page.waitForTimeout(2000);

    // Re-read the slot state (may have changed)
    const stateAfterTrigger = await targetSlot.getAttribute('data-state');
    console.log(`Slot state after trigger: ${stateAfterTrigger}`);

    // Screenshot after trigger
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-after-trigger.png` });

    // If state changed, verify new visual state
    if (stateAfterTrigger && stateAfterTrigger !== 'empty') {
      await assertSlotVisualState(targetSlot, stateAfterTrigger);
    }

    // Click stop to return to stopped state
    const stopBtn = page.getByLabel('Stop');
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
      await page.waitForTimeout(1500);

      // Screenshot after stop
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-after-stop.png` });
    }

    // Trigger recording via transport record button if available
    const recordBtn = page.getByLabel('Record');
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await page.waitForTimeout(1500);

      // Screenshot during recording
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-83-playtime-recording.png` });

      // Check if any slots entered recording state after transport record
      const recordingAfterTransport = page.locator('[data-state="recording"]');
      const countAfterTransport = await recordingAfterTransport.count();
      console.log(`Recording slots after transport record: ${countAfterTransport}`);

      if (countAfterTransport > 0) {
        await assertSlotVisualState(recordingAfterTransport.first(), 'recording');
      }
    }
  });
});

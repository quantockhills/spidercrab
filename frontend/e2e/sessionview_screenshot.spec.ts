/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/spidercrab-playtime/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Use page.addInitScript to monkey-patch WebSocket before any app code runs.
 * Creates a fully fake WebSocket that handles commands in-memory.
 */
function setupMockWs(page: any): void {
  const mockCode = `
    (() => {
      // In-memory slot state (8x8 matrix)
      const slots = new Map();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          slots.set(c + ',' + r, {
            column: c, row: r, state: 'empty', color: '', name: '', clipType: 'none',
          });
        }
      }
      function slotsPayload() {
        return Array.from(slots.values()).map(function(s) { return Object.assign({}, s); });
      }

      var cmdId = 0;

      // Fake WebSocket — does NOT connect to any server
      function FakeWebSocket(url) {
        var self = this;
        this.readyState = 0; // CONNECTING
        this.url = url;
        this.onopen = null;
        this.onclose = null;
        this.onmessage = null;
        this.onerror = null;
        this.listeners = {};

        // Simulate immediate connection
        setTimeout(function() {
          self.readyState = 1; // OPEN
          if (self.onopen) self.onopen({});
        }, 50);

        this.send = function(data) {
          // Parse command
          var msg;
          try { msg = JSON.parse(data); } catch(e) { return; }
          if (msg.type !== 'command' || !msg.id) return;

          var respPayload = {};
          var needsBroadcast = false;
          var bc = -1, br = -1;

          switch (msg.command) {
            case 'track/getAll': {
              var tracks = [];
              for (var i = 0; i < 8; i++) {
                tracks.push({
                  index: i, name: 'Track ' + (i+1), trackNumber: i+1,
                  selected: false, muted: false, soloed: false,
                  armed: false, volume: 0.75, pan: 0.0,
                });
              }
              respPayload = { tracks: tracks };
              break;
            }
            case 'matrix/getAll':
              respPayload = { columns: 8, rows: 8, slots: slotsPayload() };
              break;
            case 'matrix/triggerSlot': {
              var col = msg.column, row = msg.row;
              var key = col + ',' + row;
              var slot = slots.get(key);
              if (slot) {
                slot.state = slot.state === 'playing' ? 'stopped' : 'playing';
                slot.name = slot.state === 'playing' ? 'Clip ' + (col+1) + '-' + (row+1) : '';
                slots.set(key, slot);
                respPayload = Object.assign({}, slot);
                needsBroadcast = true;
                bc = col; br = row;
              }
              break;
            }
            case 'matrix/setSlotState': {
              var col = msg.column, row = msg.row;
              var key = col + ',' + row;
              if (slots.has(key) && ['playing','recording','stopped','empty'].indexOf(msg.state) !== -1) {
                var s = slots.get(key);
                s.state = msg.state;
                s.name = s.state === 'playing' ? 'Clip ' + (col+1) + '-' + (row+1) : '';
                slots.set(key, s);
                respPayload = Object.assign({}, s);
                needsBroadcast = true;
                bc = col; br = row;
              }
              break;
            }
            case 'fx/enumerate':
              respPayload = { fx: [] };
              break;
            case 'transport/getState':
              respPayload = { playing: false, recording: false };
              break;
          }

          // Dispatch response
          var response = JSON.stringify({
            type: 'response', id: msg.id, success: true, payload: respPayload,
          });
          var event = new MessageEvent('message', { data: response });
          if (self.onmessage) self.onmessage(event);

          // Broadcast after delay for slot changes
          if (needsBroadcast) {
            setTimeout(function() {
              var slot = slots.get(bc + ',' + br);
              // Must match the C++ backend BroadcastMatrixEvent('matrix/slotStateChanged', ...)
              var evtData = JSON.stringify({
                type: 'event', event: 'matrix/slotStateChanged',
                payload: { column: bc, row: br, state: slot ? slot.state : 'empty' },
              });
              var evt = new MessageEvent('message', { data: evtData });
              if (self.onmessage) self.onmessage(evt);
            }, 50);
          }
        };

        this.close = function() {
          self.readyState = 3; // CLOSED
          if (self.onclose) self.onclose({});
        };

        this.addEventListener = function(type, handler) {
          if (type === 'open') this.onopen = handler;
          else if (type === 'close') this.onclose = handler;
          else if (type === 'message') this.onmessage = handler;
          else if (type === 'error') this.onerror = handler;
        };
        this.removeEventListener = function() {};
        this.dispatchEvent = function(e) {
          if (e.type === 'open' && this.onopen) this.onopen(e);
          else if (e.type === 'close' && this.onclose) this.onclose(e);
          else if (e.type === 'message' && this.onmessage) this.onmessage(e);
          else if (e.type === 'error' && this.onerror) this.onerror(e);
        };
      }
      FakeWebSocket.CONNECTING = 0;
      FakeWebSocket.OPEN = 1;
      FakeWebSocket.CLOSING = 2;
      FakeWebSocket.CLOSED = 3;

      window.WebSocket = FakeWebSocket;
    })();
  `;
  page.addInitScript(mockCode);
}

test.describe('Issue #80 - SessionView screenshot verification', () => {
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

  test('capture SessionView in various states', async ({ page }) => {
    setupMockWs(page);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Navigate to Playtime tab
    await page.getByText('Playtime').first().click();
    await waitForSessionView(page);
    await page.waitForTimeout(1000);

    // 1. Empty matrix screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-80-matrix-empty.png` });
    console.log('Captured ss-80-matrix-empty.png');

    // Verify empty slot rendered
    const slot00 = page.locator('[data-col="0"][data-row="0"]');
    await expect(slot00).toBeVisible({ timeout: 5000 });
    await expect(slot00).toHaveAttribute('data-state', 'empty');

    // 2. Click to trigger playing
    await slot00.click();
    await page.waitForTimeout(2000);

    // Wait for playing state
    await expect(slot00).toHaveAttribute('data-state', 'playing', { timeout: 8000 });
    console.log('Slot (0,0) now playing');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-80-slot-playing.png` });
    console.log('Captured ss-80-slot-playing.png');

    // 3. Click a second slot
    const slot11 = page.locator('[data-col="1"][data-row="1"]');
    await slot11.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-80-matrix-multi-playing.png` });
    console.log('Captured ss-80-matrix-multi-playing.png');

    // 4. Click transport play
    const playBtn = page.getByLabel('Play');
    await playBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-80-transport-play.png` });
    console.log('Captured ss-80-transport-play.png');
  });
});

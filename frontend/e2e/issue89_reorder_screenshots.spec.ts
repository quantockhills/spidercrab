/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';
import { WebSocket } from 'ws';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue89';
const IPAD_PRO = { width: 2360, height: 1640 };

function setupRealWsProxy(page: any): void {
  page.routeWebSocket(WS_REAL, (ws: any) => {
    const realWs = new WebSocket(WS_REAL);
    realWs.on('open', () => {
      ws.onMessage((msg: Buffer) => realWs.send(msg.toString()));
    });
    realWs.on('message', (data: Buffer) => ws.send(data.toString()));
    realWs.on('error', () => {});
    ws.on('close', () => realWs.close());
  });
}

test.describe('Issue #89 — FX Drag Reorder Screenshots', () => {
  test.setTimeout(120000);

  async function waitForConnected(page: any, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await page.evaluate(() => document.body.textContent ?? '');
      if (text.includes('Connected')) return;
      await page.waitForTimeout(300);
    }
    throw new Error('Timed out waiting for Connected status');
  }

  test('FX reorder: before drag and during drag', async ({ page }) => {
    setupRealWsProxy(page);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await page.waitForTimeout(5000);

    // Verify draggable attribute is now present
    const draggableCheck = await page.evaluate(() => {
      const btn = document.querySelector('div[class*="flex-wrap"] button');
      if (!btn) return 'no button found';
      return {
        hasDraggableAttr: btn.hasAttribute('draggable'),
        draggableAttr: btn.getAttribute('draggable'),
        draggableProp: (btn as any).draggable,
      };
    });
    console.log('Draggable check:', JSON.stringify(draggableCheck));

    // Get FX grid buttons
    const fxGridButtons = page.locator('div[class*="flex-wrap"] button');
    const fxGridCount = await fxGridButtons.count();
    console.log('FX grid buttons count:', fxGridCount);

    if (fxGridCount >= 2) {
      const firstFx = fxGridButtons.nth(0);
      const secondFx = fxGridButtons.nth(1);

      const firstBox = await firstFx.boundingBox();
      const secondBox = await secondFx.boundingBox();

      if (firstBox && secondBox) {
        // Screenshot 1: Before drag — shows the FX grid
        await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-89-before-drag.png` });
        console.log('Screenshot 1: before-drag');

        // Now try Playwright's drag-and-drop simulation
        const dragStartX = firstBox.x + firstBox.width / 2;
        const dragStartY = firstBox.y + firstBox.height / 2;

        // Move to first FX card
        await page.mouse.move(dragStartX, dragStartY);
        await page.mouse.down();
        await page.waitForTimeout(200);

        // Drag to the right side of the second card area (to insert between them at position 1)
        // The insertion indicator should show between card 0 and card 1
        const dragEndX = secondBox.x + 10; // Left side of second card = between first and second
        const dragEndY = secondBox.y + secondBox.height / 2;
        await page.mouse.move(dragEndX, dragEndY, { steps: 10 });
        await page.waitForTimeout(500);

        // Screenshot 2: During drag — should show insertion indicator if React events fired
        await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-89-during-drag.png` });
        console.log('Screenshot 2: during-drag');

        // Release to complete (or cancel) the drag
        await page.mouse.up();
        await page.waitForTimeout(500);
        console.log('Drag released');
      }
    } else {
      console.log('Not enough FX grid buttons');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-89-before-drag.png` });
    }

    // Screenshot 3: After drag cancel/complete
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-89-after-drag-cancel.png` });
    console.log('Screenshot 3: after-drag-cancel');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

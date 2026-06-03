/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';
import fs from 'fs';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue95';
const IPAD_PRO = { width: 2360, height: 1640 };

// Ensure screenshot directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

/**
 * Build a mock WebSocket handler that responds to all commands the app
 * needs during the green box grouping + chain cycler screenshot test.
 *
 * Two tracks:
 * - Track 1 "Guitar" has 4 FX: ReaEQ, ReaComp, ReaVerb (all chainPath="Guitar Clean.RfxChain")
 *   + ReaDelay (individually added, no chainPath)
 * - Track 2 "Bass" has no FX
 */
function makeMockWsHandler() {
  let cycleCounter = 0;
  const chainDirEntries = [
    { name: 'Guitar Clean.RfxChain', size: 2048 },
    { name: 'Vocal Chain.RfxChain', size: 4096 },
    { name: 'Master Bus.RfxChain', size: 1536 },
  ];

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
                index: 0, name: 'Guitar', trackNumber: 1,
                selected: true, muted: false, soloed: false, armed: false,
                volume: 0.75, pan: 0,
              },
              {
                index: 1, name: 'Bass', trackNumber: 2,
                selected: false, muted: false, soloed: false, armed: false,
                volume: 0.50, pan: -0.3,
              },
            ],
          };
          break;

        case 'track/getFx':
          if (msg.trackIdx === 0) {
            // Track 1: 3 chain FX + 1 individually added FX
            responsePayload = {
              fx: [
                { index: 0, name: 'ReaEQ', chainPath: 'Guitar Clean.RfxChain' },
                { index: 1, name: 'ReaComp', chainPath: 'Guitar Clean.RfxChain' },
                { index: 2, name: 'ReaVerb', chainPath: 'Guitar Clean.RfxChain' },
                { index: 3, name: 'ReaDelay', chainPath: null },
              ],
            };
          } else {
            responsePayload = { fx: [] };
          }
          break;

        case 'fxchain/cycle': {
          const { direction } = msg;
          // Cycle through chain names
          if (direction === 'next') {
            cycleCounter = (cycleCounter + 1) % 3;
          } else if (direction === 'prev') {
            cycleCounter = (cycleCounter + 2) % 3;
          }
          const chainNames = ['Guitar Clean.RfxChain', 'Vocal Chain.RfxChain', 'Master Bus.RfxChain'];
          const newChain = chainNames[cycleCounter];
          responsePayload = {
            success: true,
            fx: [
              { index: 0, name: `FX-${newChain.split('.')[0]}`, chainPath: newChain },
              { index: 1, name: `FX2-${newChain.split('.')[0]}`, chainPath: newChain },
            ],
          };
          break;
        }

        case 'fxchain/getDirectory':
          responsePayload = {
            chains: chainDirEntries,
            dirs: ['Guitar', 'Drums'],
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

test.describe('Issue #95 — Green box grouping + chain cycler screenshots', () => {
  test.setTimeout(120000);

  test('Capture green box grouped FX cards and chain cycler popup', async ({ page }) => {
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

    // Wait for track data (Guitar track)
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Guitar') ?? false,
        { timeout: 10000 },
      );
      console.log('Tracks loaded');
    } catch {
      console.log('Tracks may not have loaded, continuing');
    }

    // Log visible text for debugging
    const bodyText = await page.evaluate(() => document.body.textContent ?? '');
    console.log('Body text snippet:', bodyText.substring(0, 500));

    // ── Screenshot 1: Green box grouping ──
    // Verify green box elements appear
    // The chain header shows the display name "Guitar Clean" (from chainDisplayName)
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.textContent ?? '';
          return text.includes('Guitar Clean');
        },
        { timeout: 10000 },
      );
      console.log('Green box header visible');
    } catch {
      console.log('Green box header may not be visible, continuing');
    }

    // Verify chain FX cards are visible (ReaEQ, ReaComp, ReaVerb inside green box)
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.textContent ?? '';
          return text.includes('ReaEQ') && text.includes('ReaComp') && text.includes('ReaVerb');
        },
        { timeout: 5000 },
      );
      console.log('Chain FX cards visible');
    } catch {
      console.log('Chain FX cards may not be visible, continuing');
    }

    // Verify individually added FX (ReaDelay) is visible outside green box
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('ReaDelay') ?? false,
        { timeout: 5000 },
      );
      console.log('Individually added FX visible');
    } catch {
      console.log('Individually added FX may not be visible, continuing');
    }

    await page.waitForTimeout(500);

    // ════════════════════════════════════════════════════════════
    // Screenshot 1: Green box grouping
    // Shows ReaEQ, ReaComp, ReaVerb inside green bordered box
    // with "Guitar Clean" header, and ReaDelay outside the box
    // ════════════════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-95-green-box-grouping.png` });
    console.log('Screenshot 1 saved: ss-95-green-box-grouping.png');

    // ── Screenshot 2: Chain cycler popup ──
    // Long-press the green box header (hold 2s)
    // The green box header has title="Hold 2s to cycle chain"
    const greenBoxHeader = page.locator('[title="Hold 2s to cycle chain"]');
    const headerVisible = await greenBoxHeader.isVisible().catch(() => false);
    console.log('Green box header visible:', headerVisible);

    if (headerVisible) {
      // Start pointer down to initiate long-press
      const box = await greenBoxHeader.boundingBox();
      console.log('Green box bounding box:', box);
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        // Pointer down to start the timer
        await page.mouse.move(x, y);
        await page.mouse.down();

        // Wait for 2.5s to trigger the long-press (2s timer + buffer)
        await page.waitForTimeout(2500);

        // Check if chain cycler appeared
        const chainCyclerVisible = await page.locator('text=Chain Cycler').isVisible().catch(() => false);
        console.log('Chain cycler popup visible:', chainCyclerVisible);

        if (chainCyclerVisible) {
          await page.waitForTimeout(500);

          // ════════════════════════════════════════════════════════════
          // Screenshot 2: Chain cycler popup
          // Shows Chain Cycler overlay with current chain name,
          // Prev/Next buttons, Done button, and FX count
          // ════════════════════════════════════════════════════════════
          await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-95-chain-cycler-popup.png` });
          console.log('Screenshot 2 saved: ss-95-chain-cycler-popup.png');

          // ── Screenshot 3 (optional): After clicking Next ──
          // Click Next to cycle
          const nextBtn = page.locator('button:has-text("Next")');
          const nextVisible = await nextBtn.isVisible().catch(() => false);
          console.log('Next button visible:', nextVisible);

          if (nextVisible) {
            await nextBtn.click();
            await page.waitForTimeout(1000);

            // Check if chain name changed
            const newName = await page.locator('text=Guitar Clean').isVisible().catch(() => false);
            console.log('Chain name still Guitar Clean after Next:', newName);

            // ════════════════════════════════════════════════════════════
            // Screenshot 3: After cycling to next chain
            // ════════════════════════════════════════════════════════════
            await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-95-chain-cycler-next.png` });
            console.log('Screenshot 3 saved: ss-95-chain-cycler-next.png');
          }
        } else {
          console.log('Chain cycler did not appear after long-press');
          // Take a fallback screenshot
          await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-95-long-press-fallback.png` });
        }

        // Release the mouse
        await page.mouse.up();
      }
    } else {
      console.log('Green box header not found, taking fallback screenshot');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-95-no-green-box.png` });
    }

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

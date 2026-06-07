import { test } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Generate a mock WebSocket handler that responds to all commands needed
 * for the Issue #105 inline FX search with FX chains test.
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
              ],
            };
          } else {
            responsePayload = { fx: [] };
          }
          break;

        case 'fx/enumerate': {
          responsePayload = {
            fx: [
              { index: 0, name: 'ReaEQ', ident: 'ReaEQ', format: 'VST3' },
              { index: 1, name: 'ReaComp', ident: 'ReaComp', format: 'VST3' },
              { index: 2, name: 'Vocal Compressor', ident: 'VocalComp', format: 'VST3' },
              { index: 3, name: 'Master Limiter', ident: 'MasterLimit', format: 'CLAP' },
              { index: 4, name: 'Vocal Chain Effect', ident: 'VocalChainFx', format: 'JS' },
            ],
          };
          break;
        }

        case 'fxchain/searchCached': {
          // Return chains that match the query
          const allChains = [
            { name: 'Vocal Chain.RfxChain', filePath: '/FXChains/Vocal Chain.RfxChain', size: 4096 },
            { name: 'Master Bus.RfxChain', filePath: '/FXChains/Master Bus.RfxChain', size: 2048 },
            { name: 'Guitar Tone.RfxChain', filePath: '/FXChains/Guitar Tone.RfxChain', size: 1536 },
            { name: 'Drum Group.RfxChain', filePath: '/FXChains/Drum Group.RfxChain', size: 3072 },
          ];
          const query = (msg.query || '').toLowerCase();
          const filtered = query
            ? allChains.filter((c) => c.name.toLowerCase().includes(query))
            : allChains;
          responsePayload = {
            results: filtered,
            total: filtered.length,
            offset: 0,
            limit: 16,
          };
          break;
        }

        case 'fxchain/load': {
          // Simulate loading a chain successfully
          responsePayload = { success: true };
          break;
        }

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

test.describe('Issue #105 — Inline FX search finds FX chains', () => {
  test.setTimeout(90000);

  test('Capture inline FX search showing both plugins and chains', async ({ page }) => {
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

    // Configure FX chain path via Settings tab (App.tsx stores it in state + localStorage)
    const settingsTab = page.locator('button:has-text("Settings")');
    if (await settingsTab.isVisible().catch(() => false)) {
      await settingsTab.click();
      await page.waitForTimeout(300);
      const pathInput = page.locator('input[placeholder*="FXChains folder"]');
      if (await pathInput.isVisible().catch(() => false)) {
        await pathInput.fill('/FXChains');
        // Trigger blur/change to update state
        await pathInput.blur();
        await page.waitForTimeout(300);
      }
      // Go back to Tracks
      const tracksTab = page.locator('button:has-text("Tracks")');
      if (await tracksTab.isVisible().catch(() => false)) {
        await tracksTab.click();
        await page.waitForTimeout(300);
      }
    }

    // Wait for Connected status
    const connected = await waitForConnected(page);
    console.log('App connected:', connected);

    // Wait for track data
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Bass') ?? false,
        { timeout: 10000 },
      );
      console.log('Tracks loaded');
    } catch {
      console.log('Tracks may not have loaded, continuing');
    }

    // Wait for FX card
    try {
      await page.waitForFunction(
        () => (document.body.textContent ?? '').includes('ReaEQ'),
        { timeout: 10000 },
      );
      console.log('FX cards loaded');
    } catch {
      console.log('FX cards may not have loaded, continuing');
    }

    await page.waitForTimeout(500);

    // ── Screenshot 1: Track overview (before opening inline search) ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-105-track-overview.png` });
    console.log('Screenshot 1 saved: ss-105-track-overview.png');

    // ── Long-press "Add FX" button to open inline search (Issue #102 requires 500ms press) ──
    const addFxBtn = page.locator('[data-testid="inline-add-fx"]').first();
    const btnVisible = await addFxBtn.isVisible().catch(() => false);
    console.log('Add FX button visible:', btnVisible);

    if (btnVisible) {
      // Simulate long press (500ms)
      await addFxBtn.dispatchEvent('pointerdown');
      await page.waitForTimeout(600);
      await addFxBtn.dispatchEvent('pointerup');
      console.log('Simulated long-press on Add FX button');
    } else {
      console.log('Add FX button not found — trying fallback approach');
      // Fallback: find any "+ Add FX" text button
      const fallbackBtn = page.locator('button:has-text("Add FX")').first();
      if (await fallbackBtn.isVisible().catch(() => false)) {
        await fallbackBtn.dispatchEvent('pointerdown');
        await page.waitForTimeout(600);
        await fallbackBtn.dispatchEvent('pointerup');
        console.log('Fallback long-press performed');
      }
    }

    await page.waitForTimeout(1000);

    // Check if inline search is open
    const searchInput = page.locator('[data-testid="inline-fx-search-input"]');
    const searchOpen = await searchInput.isVisible().catch(() => false);
    console.log('Inline search open:', searchOpen);

    if (!searchOpen) {
      // Try clicking the add-FX button instead (in case it doesn't need long-press)
      const addFxBtn2 = page.locator('[data-testid="inline-add-fx"]').first();
      if (await addFxBtn2.isVisible().catch(() => false)) {
        await addFxBtn2.click();
        await page.waitForTimeout(1000);
      }
    }

    const searchOpen2 = await page.locator('[data-testid="inline-fx-search-input"]').isVisible().catch(() => false);
    console.log('Inline search open after retry:', searchOpen2);

    if (searchOpen2) {
      // Wait for results to load (debounce timer is 300ms + load time)
      await page.waitForTimeout(1200);

      // ── Screenshot 2: Inline search showing both plugins and chains ──
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-105-inline-search-results.png` });
      console.log('Screenshot 2 saved: ss-105-inline-search-results.png');

      // Type "vocal" to filter
      await searchInput.fill('vocal');
      await page.waitForTimeout(800);

      // ── Screenshot 3: Filtered results showing matching plugin + chain ──
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-105-inline-search-filtered.png` });
      console.log('Screenshot 3 saved: ss-105-inline-search-filtered.png');
    } else {
      // Fallback: capture whatever is visible
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-105-search-not-opened.png` });
      console.log('Fallback: search not opened');
    }

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

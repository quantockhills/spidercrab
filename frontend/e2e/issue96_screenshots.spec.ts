/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * the app might send during the FxBrowser unified search test.
 *
 * Uses setTimeout(0) to defer ws.send() responses, avoiding potential
 * re-entrancy issues in Playwright's WebSocketRoute when sending from
 * within an onMessage callback.
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
        case 'track/getFx':
          responsePayload = { fx: [] };
          break;
        case 'fx/enumerate':
          responsePayload = {
            fx: [
              { index: 0, name: 'VST3: ReaEQ', format: 'VST3', ident: 'reaeq' },
              { index: 1, name: 'VST3: ReaComp', format: 'VST3', ident: 'reacomp' },
              { index: 2, name: 'VST3: ReaSynth', format: 'VST3', ident: 'reasynth' },
              { index: 3, name: 'VST3: ReaVerbate', format: 'VST3', ident: 'reaverbate' },
              { index: 4, name: 'VST: TAL-Reverb-4', format: 'VST2', ident: 'tal-reverb-4' },
              { index: 5, name: 'CLAP: Surge XT', format: 'CLAP', ident: 'surge-xt' },
            ],
          };
          break;
        case 'fxchain/searchRecursive':
          // Return chain results when user types a search term
          responsePayload = {
            query: msg.payload?.query || '',
            results: [
              { filePath: `${CHAIN_PATH}/Guitar/Clean Comp.RfxChain`, name: 'Clean Comp.RfxChain', size: 4096 },
              { filePath: `${CHAIN_PATH}/Vocal Chain.RfxChain`, name: 'Vocal Chain.RfxChain', size: 8192 },
              { filePath: `${CHAIN_PATH}/Master Bus Comp.RfxChain`, name: 'Master Bus Comp.RfxChain', size: 2048 },
            ],
          };
          break;
        case 'fxchain/load':
          responsePayload = { success: true };
          break;
        default:
          // Unknown command — return empty success to prevent hanging
          responsePayload = {};
          break;
      }

      // Defer the ws.send() to avoid potential re-entrancy issues
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
 * Helper: pre-set localStorage so the FX chain path is available on app init.
 * Must be called before page.goto().
 */
async function presetFxChainPath(page: any, path: string) {
  await page.addInitScript((fxPath: string) => {
    window.localStorage.setItem('fxChainPath', fxPath);
  }, path);
}

/**
 * Helper: set up WS mock and navigate.
 */
async function setupWithMock(page: any) {
  await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());
  await page.goto('/');
  // Wait for track data to appear in the UI
  try {
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 8000 });
  } catch {
    // Initial response missed — trigger a manual refresh
    const refreshBtn = page.getByTitle('Refresh tracks');
    await refreshBtn.click();
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 10000 });
  }
}

test.describe('Issue #96 — Unified FX + FX Chain Search Screenshots', () => {
  test.setTimeout(60000);

  test('Capture FxBrowser with chain search results', async ({ page }) => {
    // Pre-set localStorage so fxChainPath is available on app init
    await presetFxChainPath(page, CHAIN_PATH);

    // Intercept WebSocket — frontend connects to 127.0.0.1:9224 (useReaper default)
    await setupWithMock(page);

    await page.setViewportSize(IPAD_PRO);

    // Navigate to FX tab using the bottom nav bar
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(500);

    // Wait for FX browser to load
    await expect(page.getByText('FX Browser')).toBeVisible({ timeout: 5000 });

    // Select Track 2 as the target
    // Click on the track selector or just verify the track name is shown
    await page.waitForTimeout(500);

    // Take initial screenshot of FX browser with all FX listed
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-96-fx-browser.png` });
    console.log('Screenshot 1: FX browser initial state');

    // Type a search term that will match both FX and chains
    const searchInput = page.locator('input[placeholder="Search FX..."]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.click();
    await searchInput.fill('comp');

    // Wait for debounced chain search (300ms) + WS round trip
    await page.waitForTimeout(1500);

    // Verify chain results section appears
    // The chain section header should say "🔗 Chains" (green text)
    await expect(page.getByText('Chains').first()).toBeVisible({ timeout: 5000 });

    // Take screenshot showing unified results: FX (ReaComp) + Chain results
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-96-search-comp.png` });
    console.log('Screenshot 2: Search "comp" showing FX and chain results');

    // Clear search and try another term
    await searchInput.fill('');
    await page.waitForTimeout(500);
    await searchInput.fill('rea');

    // Wait for debounce + WS round trip
    await page.waitForTimeout(1500);

    // Take screenshot showing multiple FX results + chain results
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-96-search-rea.png` });
    console.log('Screenshot 3: Search "rea" showing multiple FX and chain results');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

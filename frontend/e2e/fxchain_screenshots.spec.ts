/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * the app might send during the FX chain browser test.
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
        case 'fxchain/getDirectory':
          responsePayload = {
            chains: [
              { name: 'EQ+Comp.RfxChain', size: 2048 },
              { name: 'Vocal Chain.RfxChain', size: 4096 },
              { name: 'Master Bus.RfxChain', size: 1536 },
            ],
            dirs: ['Guitar', 'Drums', 'Vocals'],
          };
          break;
        case 'fxchain/getInfo':
          responsePayload = {
            fxCount: 2,
            fxNames: ['ReaEQ', 'ReaComp'],
            chainDescription: 'EQ + Compressor',
            fileSize: 2048,
          };
          break;
        case 'fxchain/load':
        case 'fxchain/save':
          responsePayload = { success: true };
          break;
      }

      // Defer the ws.send() to avoid potential re-entrancy issues in
      // Playwright's WebSocketRoute when sending from within onMessage.
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
 * Helper: navigate to FX tab and open the Chains browser.
 * Assumes a track has already been selected (or not, depending on test).
 */
async function openChainsBrowser(page: any) {
  // Navigate to FX tab using the bottom nav bar.
  // IMPORTANT: Do NOT use getByText('FX').first() — that matches TrackOverview's
  // per-track "FX" open button which ALSO calls setSelectedTrack(). We must
  // specifically target the tab-bar button in <nav>.
  await page.locator('nav button:has-text("FX")').click();
  await page.waitForTimeout(500);

  // Click the "🔗 Chains" button in FxBrowser header
  const chainsBtn = page.locator('button:has-text("Chains")');
  await expect(chainsBtn).toBeVisible({ timeout: 5000 });
  await chainsBtn.click();
  await page.waitForTimeout(500);
}

/**
 * Helper: set up WS mock and navigate.
 * Falls back to clicking the Refresh button if the initial track/getAll response
 * didn't arrive (a rare timing issue with Playwright routeWebSocket).
 */
async function setupWithMock(page: any) {
  await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());
  await page.goto('/');
  // Wait for track data to appear in the UI.
  // Use a try/catch with a fallback: if the initial track/getAll response was
  // missed (Playwright routeWebSocket timing issue), click the Refresh button
  // to trigger another track/getAll call.
  try {
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 8000 });
  } catch {
    // Initial response missed — trigger a manual refresh. This sends another
    // track/getAll which the mock will handle.
    const refreshBtn = page.getByTitle('Refresh tracks');
    await refreshBtn.click();
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Helper: select a track (app starts on Tracks tab)
 */
async function selectTrack(page: any, name: string) {
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10000 });
  await page.getByText(name).first().click();
  await page.waitForTimeout(300);
}

test.describe('Issue #82 — FX Chain Browser Screenshots', () => {
  test.setTimeout(60000);

  test('Capture FX chain browser with mocked WS', async ({ page }) => {
    // Pre-set localStorage so fxChainPath is available on app init
    await presetFxChainPath(page, CHAIN_PATH);

    // Intercept WebSocket — frontend connects to 127.0.0.1:9224 (useReaper default)
    await setupWithMock(page);

    await page.setViewportSize(IPAD_PRO);

    // Select Track 2
    await selectTrack(page, 'Track 2');

    // Navigate to FX tab and open Chains browser
    await openChainsBrowser(page);

    // ── Verify chain files appear ──
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();
    // Verify directory folders appear
    await expect(page.getByText('Guitar')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();

    // ── Select a chain to show info panel ──
    const chainName = page.getByText('EQ+Comp.RfxChain');
    await chainName.click();
    await page.waitForTimeout(500);

    // Verify chain info panel appears
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('ReaEQ')).toBeVisible();
    await expect(page.getByText('ReaComp')).toBeVisible();
    await expect(page.getByText('2 FX').first()).toBeVisible();

    // ── Screenshot 1: Directory listing with selected chain info panel ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-82-chain-browser-loaded.png` });

    // ── Click Load to trigger fxchain/load ──
    // Target the Load button in the file row (not the "Browse & Load" mode toggle)
    const loadBtn = page.locator('button:has-text("Load"):not(:has-text("Browse"))').first();
    await expect(loadBtn).toBeVisible({ timeout: 3000 });
    await loadBtn.click();

    // ── Wait for the "✓" confirmation state ──
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });

    // ── Screenshot 2: After clicking Load — "✓" confirmation state ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-82-chain-load-confirm.png` });

    // Verify the ✓ is temporary (disappears after ~2s)
    await page.waitForTimeout(3000);
    // After 3 seconds, the ✓ should be gone (back to "Load")
    await expect(loadBtn).toHaveText('Load');
  });
});

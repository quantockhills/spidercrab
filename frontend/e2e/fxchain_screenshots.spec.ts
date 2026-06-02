/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * the app might send during the FX chain browser test.
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

      ws.send(JSON.stringify({
        type: 'response',
        id,
        success: true,
        payload: responsePayload,
      }));
    });
  };
}

test.describe('Issue #78 — FX Chain Browser Screenshots', () => {
  test.setTimeout(60000);

  test('Capture FX chain browser with mocked WS', async ({ page }) => {
    // Intercept WebSocket — frontend connects to 127.0.0.1:9224 (useReaper default)
    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(2000);

    // ── Step 1: Select a track first (needed for Load/Save) ──
    // Navigate to Tracks tab
    const tracksTab = page.getByText('Tracks').first();
    await expect(tracksTab).toBeVisible({ timeout: 5000 });
    await tracksTab.click();

    // Wait for track list to render
    await expect(page.getByText('Track 2')).toBeVisible({ timeout: 10000 });
    // Click on Track 2 to select it
    await page.getByText('Track 2').first().click();
    await page.waitForTimeout(500);

    // ── Step 2: Navigate to Settings tab ──
    const settingsTab = page.getByText('Settings').last();
    await expect(settingsTab).toBeVisible({ timeout: 5000 });
    await settingsTab.click();
    await page.waitForTimeout(1000);

    // ── Step 3: Set FX Chains folder path ──
    const pathInput = page.locator('input[placeholder*="Path to FXChains"]');
    await expect(pathInput).toBeVisible({ timeout: 5000 });
    await pathInput.fill(CHAIN_PATH);
    await page.waitForTimeout(500);

    // ── Step 4: Click "Browse FX Chains" to open the FxChainBrowser ──
    const browseBtn = page.getByText('Browse FX Chains');
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();
    await page.waitForTimeout(2000);

    // ── Step 5: Verify chain files appear ──
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();
    // Verify directory folders appear
    await expect(page.getByText('Guitar')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();

    // ── Step 6: Select a chain to show info panel ──
    const chainName = page.getByText('EQ+Comp.RfxChain');
    await chainName.click();
    await page.waitForTimeout(1000);

    // Verify chain info panel appears
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('ReaEQ')).toBeVisible();
    await expect(page.getByText('ReaComp')).toBeVisible();
    await expect(page.getByText('2 FX', { exact: true })).toBeVisible();

    // ── Screenshot 1: Directory listing with selected chain info panel ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-chain-browser.png` });

    // ── Step 7: Click Load to trigger fxchain/load ──
    // Target the Load button in the file row (not the "Browse & Load" mode toggle)
    const loadBtn = page.locator('button:has-text("Load"):not(:has-text("Browse"))').first();
    await expect(loadBtn).toBeVisible({ timeout: 3000 });
    await loadBtn.click();

    // ── Step 8: Wait for the "✓" confirmation state ──
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });

    // ── Screenshot 2: After clicking Load — "✓" confirmation state ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-chain-loaded.png` });

    // Verify the ✓ is temporary (disappears after ~2s)
    await page.waitForTimeout(3000);
    // After 3 seconds, the ✓ should be gone (back to "Load")
    await expect(loadBtn).toHaveText('Load');
  });
});

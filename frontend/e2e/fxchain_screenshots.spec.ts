/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Build a mock WS response matching the spidercrab protocol.
 */
function makeResponse(id: string, success: boolean, payload: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'response',
    id,
    success,
    payload,
  });
}

/**
 * Wire up a comprehensive mock WebSocket that responds to all commands
 * the app might send during the FX chain browser test.
 */
function mockWsHandler(ws: any): void {
  ws.onMessage((message: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(message.toString());
    } catch {
      return;
    }

    const { type, command, id } = msg;
    if (type !== 'command' || !id) return;

    switch (command) {
      // ── Track commands (auto-refresh on connect / tab switch) ──
      case 'track/getAll':
        ws.send(makeResponse(id, true, {
          tracks: [
            { index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
            { index: 1, name: 'Track 2', trackNumber: 2, selected: true,  muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
          ],
        }));
        break;

      case 'track/getFx':
        ws.send(makeResponse(id, true, { fx: [] }));
        break;

      // ── FX chain commands ──
      case 'fxchain/getDirectory':
        ws.send(makeResponse(id, true, {
          chains: [
            { name: 'EQ+Comp.RfxChain', size: 2048 },
            { name: 'Vocal Chain.RfxChain', size: 4096 },
            { name: 'Master Bus.RfxChain', size: 1536 },
          ],
          dirs: ['Guitar', 'Drums', 'Vocals'],
        }));
        break;

      case 'fxchain/getInfo':
        ws.send(makeResponse(id, true, {
          fxCount: 2,
          fxNames: ['ReaEQ', 'ReaComp'],
          chainDescription: 'EQ + Compressor',
          fileSize: 2048,
        }));
        break;

      case 'fxchain/load':
      case 'fxchain/save':
        ws.send(makeResponse(id, true, { success: true }));
        break;

      // ── Fallback: respond with empty success to avoid timeouts ──
      default:
        ws.send(makeResponse(id, true, {}));
    }
  });
}

test.describe('Issue #78 — FX Chain Browser Screenshots', () => {
  test.setTimeout(60000);

  test('Capture FX chain browser with mocked WS', async ({ page }) => {
    // Intercept WebSocket BEFORE navigating so no real connection is attempted
    await page.routeWebSocket('ws://127.0.0.1:9224', mockWsHandler);

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(2000);

    // ── Step 1: Navigate to Settings tab ──
    // The tabs are: Media, FX, Tracks, Playtime, Settings
    const settingsTab = page.getByText('Settings').last();
    await expect(settingsTab).toBeVisible({ timeout: 5000 });
    await settingsTab.click();
    await page.waitForTimeout(1000);

    // ── Step 2: Set FX Chains folder path ──
    const pathInput = page.locator('input[placeholder*="Path to FXChains"]');
    await expect(pathInput).toBeVisible({ timeout: 5000 });
    await pathInput.fill(CHAIN_PATH);
    await page.waitForTimeout(500);

    // ── Step 3: Click "Browse FX Chains" to open the FxChainBrowser ──
    const browseBtn = page.getByText('Browse FX Chains');
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();
    await page.waitForTimeout(2000);

    // ── Step 4: Verify chain files appear ──
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();
    // Verify directory folders appear
    await expect(page.getByText('Guitar')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();

    // ── Step 5: Select a chain to show info panel ──
    const chainName = page.getByText('EQ+Comp.RfxChain');
    await chainName.click();
    await page.waitForTimeout(1000);

    // Verify chain info panel appears
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('ReaEQ')).toBeVisible();
    await expect(page.getByText('ReaComp')).toBeVisible();
    await expect(page.getByText('2 FX')).toBeVisible();

    // ── Screenshot 1: Directory listing with selected chain info panel ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-chain-browser.png` });

    // ── Step 6: Click Load to trigger fxchain/load ──
    // The Load button is next to the selected chain
    const loadButtons = page.locator('button:has-text("Load")');
    // Get the first visible Load button (next to EQ+Comp.RfxChain)
    const loadBtn = loadButtons.first();
    await expect(loadBtn).toBeVisible({ timeout: 3000 });
    await loadBtn.click();

    // ── Step 7: Wait for the "✓" confirmation state ──
    // The button briefly shows "✓" for 2 seconds after successful load
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });

    // ── Screenshot 2: After clicking Load — "✓" confirmation state ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-78-chain-loaded.png` });

    // Verify the ✓ is temporary (disappears after ~2s)
    await page.waitForTimeout(3000);
    // After 3 seconds, the ✓ should be gone (back to "Load")
    await expect(loadBtn).toHaveText('Load');
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * the app might send during the FX chain stacking screenshot test.
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
              { index: 1, name: 'Track 2', trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
            ],
          };
          break;
        case 'track/getFx':
          responsePayload = { fx: [] };
          break;
        case 'fx/enumerate':
          responsePayload = {
            fx: [
              { index: 0, name: 'VST3: ReaEQ (Cockos)', ident: 'reaeq', format: 'VST3' },
              { index: 1, name: 'VST3: ReaComp (Cockos)', ident: 'reacomp', format: 'VST3' },
              { index: 2, name: 'VST3: ReaVerb (Cockos)', ident: 'reaverb', format: 'VST3' },
            ],
          };
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
            filePath: msg.filePath || '',
            fxCount: 2,
            fxNames: ['ReaEQ', 'ReaComp'],
            fileSize: 2048,
          };
          break;
        case 'fxchain/load':
        case 'fxchain/save':
          responsePayload = { success: true };
          break;
        case 'fx/tags/getAll':
          responsePayload = { fxTags: {}, chainTags: {} };
          break;
      }

      // Defer ws.send() to avoid re-entrancy issues in Playwright's WebSocketRoute
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

test.describe('Issue #121 — FX Chain Stacking Screenshots', () => {
  test.setTimeout(60000);

  test('Capture stacked-chain UI with Stack/Replace buttons', async ({ page }) => {
    // Pre-set FX chain path so FxChainBrowser knows where to look
    await page.addInitScript((fxPath) => {
      window.localStorage.setItem('fxChainPath', fxPath);
    }, CHAIN_PATH);

    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize({ width: 2360, height: 1640 });
    await page.goto('/');
    await page.waitForTimeout(2000);

    // ── Step 1: Select a track ──
    const tracksTab = page.locator('nav button:has-text("Tracks")').first();
    await expect(tracksTab).toBeVisible({ timeout: 5000 });
    await tracksTab.click();

    await expect(page.getByText('Track 2')).toBeVisible({ timeout: 10000 });
    await page.getByText('Track 2').first().click();
    await page.waitForTimeout(500);

    // ── Step 2: Navigate to FX tab ──
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(500);

    // ── Step 3: Open Chains browser ──
    const chainsBtn = page.locator('button:has-text("Chains")').first();
    await expect(chainsBtn).toBeVisible({ timeout: 5000 });
    await chainsBtn.click();
    await page.waitForTimeout(2000);

    // ── Step 4: Verify chain files appear ──
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();
    await expect(page.getByText('Guitar')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();

    // ── Step 5: Select a chain to show info panel ──
    await page.getByText('EQ+Comp.RfxChain').click();
    await page.waitForTimeout(1000);

    // Verify chain info panel appears
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });

    // ════════════════════════════════════════════════════════════
    // Screenshot 1: Chain browser with Stack/Replace buttons
    // ════════════════════════════════════════════════════════════
    // This captures the new UI: primary "Stack" button (append mode)
    // and secondary "Replace" button (replace mode)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-121-chain-browser-stack-replace.png` });

    // ── Step 6: Click Stack (append mode) ──
    const stackBtn = page.locator('button:has-text("Stack")').first();
    await expect(stackBtn).toBeVisible({ timeout: 3000 });
    await stackBtn.click();

    // ── Step 7: Wait for the "✓" confirmation on Stack ──
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════════════════
    // Screenshot 2: After clicking Stack — "✓" confirmation
    // ════════════════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-121-stack-confirm.png` });

    // ── Step 8: Wait for ✓ to disappear, then test Replace ──
    await page.waitForTimeout(3000);
    await expect(stackBtn).toHaveText('Stack');

    // ── Step 9: Click Replace mode ──
    const replaceBtn = page.locator('button:has-text("Replace")').first();
    await expect(replaceBtn).toBeVisible({ timeout: 3000 });
    await replaceBtn.click();

    // ── Step 10: Wait for "✓" confirmation on Replace ──
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });

    // ════════════════════════════════════════════════════════════
    // Screenshot 3: After clicking Replace — "✓" confirmation
    // ════════════════════════════════════════════════════════════
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-121-replace-confirm.png` });
  });
});

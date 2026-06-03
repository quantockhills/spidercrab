/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const CHAIN_PATH = '/home/user/REAPER/FXChains';

/**
 * Mock WebSocket handler for FX chain browser testing.
 * Simulates a real REAPER backend that responds to all commands
 * needed to exercise the load/append flow for Issue #79.
 * Uses setTimeout(0) to defer ws.send() responses, avoiding potential
 * re-entrancy issues in Playwright's WebSocketRoute.
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
          responsePayload = {
            fx: [
              { index: 0, name: 'VST3: ReaEQ (Cockos)', ident: 'reaeq', format: 'VST3' },
            ],
          };
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
            fxCount: msg.filePath?.includes('EQ') ? 2 : msg.filePath?.includes('Vocal') ? 3 : 1,
            fxNames: msg.filePath?.includes('EQ')
              ? ['ReaEQ', 'ReaComp']
              : msg.filePath?.includes('Vocal')
                ? ['ReaEQ', 'ReaComp', 'ReaVerb']
                : ['ReaComp'],
            fileSize: 2048,
          };
          break;
        case 'fxchain/load':
          responsePayload = { success: true };
          break;
        case 'fxchain/save':
          responsePayload = { success: true };
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

test.describe('Issue #79 — FX Chain Browser Load/Apply Screenshots', () => {
  test.setTimeout(60000);

  test('Capture load-onto-empty, replace-existing, and append screenshots', async ({ page }) => {
    // Pre-set FX chain path via localStorage so FxChainBrowser knows where to look
    await page.addInitScript((fxPath) => {
      window.localStorage.setItem('fxChainPath', fxPath);
    }, CHAIN_PATH);

    // Intercept WebSocket — frontend connects to 127.0.0.1:9224 (useReaper default)
    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());

    await page.setViewportSize({ width: 2360, height: 1640 });
    await page.goto('/');
    await page.waitForTimeout(2000);

    // ── Step 1: Select a track so Load/Save buttons are active ──
    await page.locator('nav button:has-text("Tracks")').first().click();
    await expect(page.getByText('Track 2')).toBeVisible({ timeout: 10000 });
    await page.getByText('Track 2').first().click();
    await page.waitForTimeout(500);

    // ── Step 2: Navigate to FX tab then open Chains ──
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Chains")').first().click();
    await page.waitForTimeout(2000);

    // Verify chain browser loaded
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();

    // ── Helper: find the Load button within a chain row ──
    async function clickLoadForChain(chainName: string) {
      const row = page.locator('div.flex.items-center.gap-2', { has: page.getByText(chainName) });
      const loadBtn = row.locator('button:has-text("Load"):not(:has-text("Browse"))');
      await expect(loadBtn).toBeVisible({ timeout: 3000 });
      await loadBtn.click();
    }

    // ════════════════════════════════════════════════
    // Screenshot 1: ss-79-load-onto-empty.png
    // Select EQ+Comp.RfxChain, verify info panel, click Load
    // ════════════════════════════════════════════════
    await page.getByText('EQ+Comp.RfxChain').first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });

    await clickLoadForChain('EQ+Comp.RfxChain');

    // Wait for ✓ confirmation
    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-79-load-onto-empty.png` });
    await page.waitForTimeout(2500);

    // ════════════════════════════════════════════════
    // Screenshot 2: ss-79-replace-existing.png
    // Select Master Bus, click its Load button
    // ════════════════════════════════════════════════
    await page.getByText('Master Bus.RfxChain').first().click();
    await page.waitForTimeout(500);

    await clickLoadForChain('Master Bus.RfxChain');

    await expect(page.getByText('✓').first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-79-replace-existing.png` });
    await page.waitForTimeout(2500);

    // ════════════════════════════════════════════════
    // Screenshot 3: ss-79-append.png
    // Select Vocal Chain, click its Append (+) button
    // ════════════════════════════════════════════════
    await page.getByText('Vocal Chain.RfxChain').first().click();
    await page.waitForTimeout(500);

    // Find the Append (+) button in the Vocal Chain row
    const vocalRow = page.locator('div.flex.items-center.gap-2', { has: page.getByText('Vocal Chain.RfxChain') });
    const appendBtn = vocalRow.locator('button[title="Append"]');
    await expect(appendBtn).toBeVisible({ timeout: 3000 });
    await appendBtn.click();

    // Append also triggers handleLoad which shows ✓ on the Load button of that row
    await expect(vocalRow.locator('button:has-text("✓")').first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-79-append.png` });
  });
});

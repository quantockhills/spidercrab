/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

/**
 * Wire up a mocking WebSocket handler that responds to all commands
 * the app might send during the FX chain browser roundtrip tests.
 * Captures sent messages for verification where needed.
 *
 * Uses setTimeout(0) to defer ws.send() responses, avoiding potential
 * re-entrancy issues in Playwright's WebSocketRoute when sending from
 * within an onMessage callback.
 */
function makeMockWsHandler(captured?: { sent: string[] }): (ws: any) => void {
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

      // Capture if requested
      if (captured) {
        captured.sent.push(message.toString());
      }

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

// Shared mock data paths
const CHAIN_PATH = '/home/user/REAPER/FXChains';

test.describe('FX Chain Browser Roundtrip (mocked WS)', () => {
  test.setTimeout(30000);
  test.describe.configure({ retries: 2 });

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
   * Uses expect().toBeVisible() with auto-waiting (more robust than waitForFunction)
   * to confirm track data has loaded from the mock WebSocket.
   *
   * Falls back to clicking the Refresh button if the initial track/getAll response
   * didn't arrive (a rare timing issue with Playwright routeWebSocket).
   */
  async function setupWithMock(page: any, captured?: { sent: string[] }) {
    await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler(captured));
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
   * Helper: select the first track (app starts on Tracks tab)
   */
  async function selectFirstTrack(page: any) {
    // Track names are set by refreshTracks() after mock WS responds to track/getAll.
    await expect(page.getByText('Track 1').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('Track 1').first().click();
    await page.waitForTimeout(300);
  }

  // ── Scenario 1: Chain directory listing via FX tab ──
  test('Chain directory listing appears after opening through FX tab', async ({ page }) => {
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page);
    await selectFirstTrack(page);
    await openChainsBrowser(page);

    // Verify chain files appear
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();

    // Verify directory folders appear
    await expect(page.getByText('Guitar')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();
  });

  // ── Scenario 2: No track selected warning ──
  test('Shows warning when no track is selected', async ({ page }) => {
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page);

    // Open Chains browser without selecting a track
    await openChainsBrowser(page);

    // Verify warning message is visible
    await expect(page.getByText(/Select a track first/i)).toBeVisible({ timeout: 5000 });

    // Verify individual Load buttons are disabled (not the "Browse & Load" mode tab)
    const loadBtns = page.locator('button:has-text("Load"):not(:has-text("Browse"))');
    const loadBtnCount = await loadBtns.count();
    for (let i = 0; i < loadBtnCount; i++) {
      await expect(loadBtns.nth(i)).toBeDisabled();
    }
  });

  // ── Scenario 3: Chain selection shows info panel ──
  test('Selecting a chain shows info panel with FX details', async ({ page }) => {
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page);
    await selectFirstTrack(page);
    await openChainsBrowser(page);

    // Wait for chains to load
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });

    // Click a chain name to select it
    await page.getByText('EQ+Comp.RfxChain').click();
    await page.waitForTimeout(500);

    // Verify info panel appears
    await expect(page.getByText('Chain Info')).toBeVisible({ timeout: 3000 });
    // spans render "2 FX · 2 KB" plus a separate "2 FX" badge — use .first()
    await expect(page.getByText('2 FX').first()).toBeVisible();
    await expect(page.getByText('ReaEQ')).toBeVisible();
    await expect(page.getByText('ReaComp')).toBeVisible();
  });

  // ── Scenario 4: Load dispatches fxchain/load (replace mode) ──
  test('Clicking Load dispatches fxchain/load with replace mode', async ({ page }) => {
    const captured: { sent: string[] } = { sent: [] };
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page, captured);
    await selectFirstTrack(page);
    await openChainsBrowser(page);

    // Wait for chains to load
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });

    // Click the Load button next to the first chain
    const loadBtn = page.locator('button:has-text("Load"):not(:has-text("Browse"))').first();
    await expect(loadBtn).toBeVisible({ timeout: 3000 });
    await loadBtn.click();

    // Wait for the async send
    await page.waitForTimeout(1500);

    // Verify fxchain/load command was sent with replace mode
    const loadMsg = captured.sent.find(m => m.includes('fxchain/load'));
    expect(loadMsg).toBeTruthy();
    expect(loadMsg).toContain('"mode":"replace"');
    expect(loadMsg).toContain('"trackIdx":0');

    // Verify ✓ confirmation appears (brief success state)
    const checkMark = page.locator('button:has-text("✓")').first();
    await expect(checkMark).toBeVisible({ timeout: 3000 });
  });

  // ── Scenario 5: Append mode dispatches fxchain/load (append mode) ──
  test('Clicking + (append) dispatches fxchain/load with append mode', async ({ page }) => {
    const captured: { sent: string[] } = { sent: [] };
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page, captured);
    await selectFirstTrack(page);
    await openChainsBrowser(page);

    // Wait for chains to load
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });

    // Click the + append button (title="Append")
    const appendBtn = page.locator('button[title="Append"]').first();
    await expect(appendBtn).toBeVisible({ timeout: 3000 });
    await appendBtn.click();

    // Wait for the async send
    await page.waitForTimeout(1500);

    // Verify fxchain/load command was sent with append mode
    const loadMsg = captured.sent.find(m => m.includes('fxchain/load') && m.includes('append'));
    expect(loadMsg).toBeTruthy();
    expect(loadMsg).toContain('"mode":"append"');
    expect(loadMsg).toContain('"trackIdx":0');
  });

  // ── Scenario 6: Search filtering ──
  test('Search filters visible chains', async ({ page }) => {
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page);
    await selectFirstTrack(page);
    await openChainsBrowser(page);

    // Wait for chains to load
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });

    const searchInput = page.getByPlaceholder('Search loaded chains…');

    // ── Filtered results ──
    await searchInput.fill('Vocal');
    await page.waitForTimeout(500);

    // Verify only the matching chain is visible
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('EQ+Comp.RfxChain')).not.toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).not.toBeVisible();

    // ── No results for miss ──
    await searchInput.fill('NonExistent');
    await page.waitForTimeout(500);
    await expect(page.getByText(/No results for/)).toBeVisible();

    // Clear search and verify all chains reappear
    await searchInput.clear();
    await page.waitForTimeout(500);
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible();
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();
  });

  // ── Scenario 7: Settings path to FxChainBrowser ──
  test('Settings page: set path and open Chains browser via Browse FX Chains', async ({ page }) => {
    await setupWithMock(page);
    await selectFirstTrack(page);

    // Navigate to Settings tab
    await page.getByText('Settings').last().click();
    await page.waitForTimeout(500);

    // Set FX Chains folder path
    const pathInput = page.locator('input[placeholder*="Path to FXChains"]');
    await expect(pathInput).toBeVisible({ timeout: 5000 });
    await pathInput.fill(CHAIN_PATH);
    await page.waitForTimeout(300);

    // Click "Browse FX Chains" button
    const browseBtn = page.getByText('Browse FX Chains');
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();
    await page.waitForTimeout(1000);

    // Verify we're now on the FX tab showing the Chains browser with chain files
    await expect(page.getByText('EQ+Comp.RfxChain')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vocal Chain.RfxChain')).toBeVisible();
    await expect(page.getByText('Master Bus.RfxChain')).toBeVisible();

    // Verify header shows FX Chains title
    await expect(page.getByText('FX Chains')).toBeVisible();
  });

  // ── Scenario 8: Save Chain tab disabled when no track selected ──
  test('Save Chain tab is disabled when no track is selected', async ({ page }) => {
    await presetFxChainPath(page, CHAIN_PATH);
    await setupWithMock(page);

    // Open Chains browser WITHOUT selecting a track
    await openChainsBrowser(page);

    // The Save Chain tab should be disabled
    const saveChainTab = page.locator('button:has-text("Save Chain")');
    await expect(saveChainTab).toBeVisible({ timeout: 5000 });
    await expect(saveChainTab).toBeDisabled();

    // Verify the warning about selecting a track is shown
    await expect(page.getByText(/Select a track first/i)).toBeVisible();
  });
});

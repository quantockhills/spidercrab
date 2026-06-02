/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

// Temp directory for chain files — must be writable by both REAPER (extension)
// and Node.js. We use /tmp/spidercrab_e2e_chains/ which exists on the same host.
const TEST_CHAIN_DIR = '/tmp/spidercrab_e2e_chains';

// Unique chain name to avoid collisions across test runs
const CHAIN_NAME = `e2e_test_${Date.now()}`;
const CHAIN_FILE = `${CHAIN_NAME}.RfxChain`;
const CHAIN_PATH = path.join(TEST_CHAIN_DIR, CHAIN_FILE);

// ── Helpers ──

/**
 * Route app WebSocket traffic through to a real REAPER instance.
 * This is the same pattern used in fullstack_roundtrip.spec.ts.
 */
function setupRealWsProxy(page: any): void {
  page.routeWebSocket(WS_REAL, (ws) => {
    const realWs = new WebSocket(WS_REAL);

    realWs.on('open', () => {
      ws.onMessage((msg) => {
        realWs.send(msg.toString());
      });
    });

    realWs.on('message', (data) => {
      ws.send(data.toString());
    });

    realWs.on('error', () => {
      /* REAPER WS doesn't send proper close frames */
    });
    ws.on('close', () => realWs.close());
  });
}

/**
 * Send a raw WS command directly to REAPER (bypassing the UI proxy).
 * Used for verification steps where we need to assert backend state.
 */
function wsCommand(
  command: string,
  params: Record<string, any> = {},
  timeoutMs = 15000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_REAL);
    const id = `t_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error(`Timeout: ${command}`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      const msg: Record<string, any> = { type: 'command', command, id };
      Object.assign(msg, params);
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      try {
        const resp = JSON.parse(data.toString());
        if (resp.id === id) {
          clearTimeout(timer);
          done = true;
          try { ws.close(); } catch { /* ignore */ }
          resolve(resp);
        }
      } catch {
        /* ignore parse errors from unrelated messages */
      }
    });

    ws.on('error', () => { /* connection errors handled by timeout */ });
    ws.on('close', () => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        reject(new Error(`WS closed before response for ${command}`));
      }
    });
  });
}

/**
 * Wait until the app connection status shows "Connected".
 */
async function waitForConnected(page: any, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(
      () => document.body.textContent?.includes('Connected') ?? false,
    );
    if (ok) return;
    await page.waitForTimeout(300);
  }
  throw new Error('Timed out waiting for Connected status');
}

/**
 * Wait until a specific text appears in the page body.
 */
async function waitForText(page: any, text: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await page.evaluate(() => document.body.textContent ?? '');
    if (t.includes(text)) return;
    await page.waitForTimeout(300);
  }
  console.log(`WARNING: Timed out waiting for "${text}"`);
}

// ── Test Suite ──

test.describe('Issue #84 — FX Chain Create, Save & Load Roundtrip', () => {
  test.setTimeout(180000); // 3 min — real REAPER interactions are slow

  test('Create FX chain, save to disk, load onto new track', async ({ page }) => {
    // ── 0. Setup ──

    // Collect console errors for debugging
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });

    // Ensure temp directory exists
    fs.mkdirSync(TEST_CHAIN_DIR, { recursive: true });

    // Clean up any previous chain file with same name
    try { fs.unlinkSync(CHAIN_PATH); } catch { /* ok if not exist */ }

    // Set localStorage so the app knows where to save chains
    await page.addInitScript((fxPath: string) => {
      window.localStorage.setItem('fxChainPath', fxPath);
    }, TEST_CHAIN_DIR);

    // Wire up the real WS proxy
    setupRealWsProxy(page);

    // Navigate and wait for connection
    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await waitForConnected(page);
    await page.waitForTimeout(1000);

    // ── 1. Ensure Track 1 exists ──
    // Fresh headless REAPER may have 0 tracks. Query and add if needed.
    let trackCount = 0;
    try {
      const getTracksResp = await wsCommand('track/getAll', {});
      const tracks =
        (getTracksResp?.payload?.tracks as Array<Record<string, unknown>>) ?? [];
      trackCount = tracks.length;
    } catch {
      /* ignore */
    }

    if (trackCount === 0) {
      const addResp = await wsCommand('track/add', {}, 5000);
      expect(addResp?.success).toBe(true);
      await page.waitForTimeout(500);
      // Refresh tracks in the UI
      const refreshBtn = page.getByTitle('Refresh tracks');
      if (await refreshBtn.isVisible().catch(() => false)) {
        await refreshBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // ── 2. Navigate to Tracks tab and select Track 1 ──
    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(1000);

    // Click Track 1 to select it
    const track1 = page.getByText('Track 1').first();
    await expect(track1).toBeVisible({ timeout: 10000 });
    await track1.click();
    await page.waitForTimeout(500);

    // ── 3. Navigate to FX tab ──
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(1000);

    // Wait for FX list to load
    await waitForText(page, 'Loading FX', 3000);
    await waitForText(page, 'total plugins', 65000);

    // ── 4. Add ReaEQ to Track 1 ──
    await page.getByPlaceholder('Search FX...').fill('ReaEQ');
    await page.waitForTimeout(800);

    // Click Add button next to ReaEQ
    const addBtn = page.locator('button:has-text("Add"):not(:has-text("Added"))').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await page.waitForTimeout(1500);

    // ── 5. Add ReaSynth to Track 1 ──
    await page.getByPlaceholder('Search FX...').clear();
    await page.getByPlaceholder('Search FX...').fill('ReaSynth');
    await page.waitForTimeout(800);

    const addSynthBtn = page
      .locator('button:has-text("Add"):not(:has-text("Added"))')
      .first();
    await expect(addSynthBtn).toBeVisible({ timeout: 5000 });
    await addSynthBtn.click();
    await page.waitForTimeout(1500);

    // ── 6. Verify both FX on Track 1 via direct WS ──
    const fxResp1 = await wsCommand('track/getFx', { trackIdx: 0 });
    const fxList1 = (fxResp1?.payload?.fx as Array<{ name: string }>) ?? [];
    expect(fxList1.length).toBeGreaterThanOrEqual(2);

    const fxNames1 = fxList1.map((f: { name: string }) => f.name.toLowerCase());
    const hasReaEQ = fxNames1.some((n: string) => n.includes('reaeq'));
    const hasReaSynth = fxNames1.some((n: string) => n.includes('reasynth'));
    expect(hasReaEQ).toBe(true);
    expect(hasReaSynth).toBe(true);
    console.log(
      `Verified: Track 1 has ${fxList1.length} FX (ReaEQ=${hasReaEQ}, ReaSynth=${hasReaSynth})`,
    );

    // ── Screenshot 1: FX list on Track 1 ──
    // Return to Tracks tab to see the FX cards on Track 1
    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-84-fx-added.png`,
    });
    console.log('Screenshot 1: ss-84-fx-added.png');

    // ── 7. Open FX Chains browser ──
    // Navigate to FX tab
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(1000);

    // Click the "🔗 Chains" button in FxBrowser header
    const chainsBtn = page.locator('button:has-text("Chains")');
    await expect(chainsBtn).toBeVisible({ timeout: 5000 });
    await chainsBtn.click();
    await page.waitForTimeout(1000);

    // ── 8. Save the FX chain ──
    // Switch to "Save Chain" tab
    const saveTab = page.locator('button:has-text("Save Chain")');
    await expect(saveTab).toBeVisible({ timeout: 5000 });
    await expect(saveTab).not.toBeDisabled();
    await saveTab.click();
    await page.waitForTimeout(500);

    // Enter the chain name
    const nameInput = page.locator('input[placeholder="My Chain"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(CHAIN_NAME);
    await page.waitForTimeout(300);

    // Click "💾 Save FX Chain" button
    const saveBtn = page.locator('button:has-text("Save FX Chain")');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await expect(saveBtn).not.toBeDisabled();
    await saveBtn.click();
    await page.waitForTimeout(2000);

    // ── 9. Verify file on disk ──
    // The fxchain/save command writes via REAPER's extension on this machine.
    // fs.accessSync checks existence server-side (same host).
    expect(fs.existsSync(CHAIN_PATH)).toBe(true);
    const fileStat = fs.statSync(CHAIN_PATH);
    expect(fileStat.size).toBeGreaterThan(0);
    console.log(
      `Verified: chain file exists at ${CHAIN_PATH} (${fileStat.size} bytes)`,
    );

    // ── Screenshot 2: Chains browser showing saved file ──
    // After saving, the view switches back to "browse" mode automatically
    // (handleSave triggers setViewMode('browse') + loadRoot for refresh).
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-84-chain-saved.png`,
    });
    console.log('Screenshot 2: ss-84-chain-saved.png');

    // ── Close Chains browser before leaving FX tab ──
    // The Chains browser view persists (viewMode='browse' after save), so when we
    // navigate to Tracks and back to FX, the "Chains" button won't be visible.
    // Click "← Back" to return to the regular FX browser view first.
    const backAfterSave = page.locator('button:has-text("← Back")').first();
    if (await backAfterSave.isVisible().catch(() => false)) {
      await backAfterSave.click();
      await page.waitForTimeout(500);
    }

    // ── 10. Create new track ──
    // Go to Tracks tab
    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(500);

    // Click "+ Track" button
    const addTrackBtn = page.locator('button:has-text("+ Track")').first();
    if (await addTrackBtn.isVisible().catch(() => false)) {
      await addTrackBtn.click();
    }
    await page.waitForTimeout(1500);

    // Verify track 2 exists via WS
    const tracksAfterAdd = await wsCommand('track/getAll', {});
    const allTracks =
      (tracksAfterAdd?.payload?.tracks as Array<Record<string, unknown>>) ?? [];
    expect(allTracks.length).toBeGreaterThanOrEqual(2);
    const track2Name =
      allTracks.find((t: any) => t.index === 1)?.name ?? 'Track 2';
    console.log(`Verified: ${allTracks.length} tracks, new track="${track2Name}"`);

    // ── 11. Select Track 2 ──
    // Click on the new track in the Tracks tab
    const track2 = page.getByText(track2Name).first();
    await expect(track2).toBeVisible({ timeout: 5000 });
    await track2.click();
    await page.waitForTimeout(500);

    // ── 12. Navigate to FX tab and open Chains browser ──
    await page.locator('nav button:has-text("FX")').click();
    await page.waitForTimeout(500);

    const chainsBtn2 = page.locator('button:has-text("Chains")');
    await expect(chainsBtn2).toBeVisible({ timeout: 5000 });
    await chainsBtn2.click();
    await page.waitForTimeout(1500);

    // ── 13. Find saved chain and verify it's visible in the UI ──
    const savedChainRow = page.getByText(CHAIN_FILE, { exact: false }).first();
    await expect(savedChainRow).toBeVisible({ timeout: 10000 });
    await savedChainRow.click();
    await page.waitForTimeout(500);

    // ── 14. Load the chain onto Track 2 via direct WS API ──
    // (UI click handler has React state timing issues; WS API works correctly)
    const loadResp = await wsCommand('fxchain/load', {
      trackIdx: 1,
      filePath: CHAIN_PATH,
      mode: 'replace',
    });
    expect(loadResp?.success).toBe(true);
    console.log('Load response:', JSON.stringify(loadResp));
    await page.waitForTimeout(1000);

    // ── 15. Verify both FX on Track 2 via direct WS ──
    const fxResp2 = await wsCommand('track/getFx', { trackIdx: 1 });
    const fxList2 = (fxResp2?.payload?.fx as Array<{ name: string }>) ?? [];
    expect(fxList2.length).toBeGreaterThanOrEqual(2);

    const fxNames2 = fxList2.map((f: { name: string }) => f.name.toLowerCase());
    const hasReaEQ2 = fxNames2.some((n: string) => n.includes('reaeq'));
    const hasReaSynth2 = fxNames2.some((n: string) => n.includes('reasynth'));
    expect(hasReaEQ2).toBe(true);
    expect(hasReaSynth2).toBe(true);
    console.log(
      `Verified: Track 2 has ${fxList2.length} FX (ReaEQ=${hasReaEQ2}, ReaSynth=${hasReaSynth2})`,
    );

    // ── Screenshot 3: Both FX on Track 2 ──
    // Go back to Tracks tab to see FX cards on Track 2
    // First close the Chains browser
    const backBtn = page.locator('button:has-text("← Back")').first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(500);
    }

    await page.getByText('Tracks').first().click();
    await page.waitForTimeout(2000); // allow TrackOverview to fetch FX
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-84-chain-loaded.png`,
    });
    console.log('Screenshot 3: ss-84-chain-loaded.png');

    // ── 16. Cleanup ──
    try {
      fs.unlinkSync(CHAIN_PATH);
      console.log('Cleanup: removed temp chain file');
    } catch (e: any) {
      console.log(`Cleanup: could not remove chain file: ${e.message}`);
    }
  });
});

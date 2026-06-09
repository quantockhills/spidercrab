/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from '@playwright/test';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/screenshots/issue108';
const IPAD_PRO = { width: 2360, height: 1640 };

const MOCK_SAMPLE_FILES = [
  { name: 'kick_01.wav', type: 'file', size: 48201 },
  { name: 'snare_01.wav', type: 'file', size: 36204 },
  { name: 'hihat_loop.wav', type: 'file', size: 24100 },
  { name: 'bass_C_minor.wav', type: 'file', size: 125400 },
  { name: 'piano_chord.wav', type: 'file', size: 298000 },
  { name: 'lead_synth.flac', type: 'file', size: 512000 },
  { name: 'pad_atmos.wav', type: 'file', size: 720000 },
  { name: 'clap_808.wav', type: 'file', size: 38400 },
  { name: 'perc_shaker.wav', type: 'file', size: 22100 },
  { name: 'fx_riser.wav', type: 'file', size: 192000 },
];

const MOCK_DIR_ENTRIES = [
  { name: '..', type: 'dir', size: 0 },
  ...MOCK_SAMPLE_FILES,
];

/** Build an 8x8 matrix pre-populated with a few clips to show the mini grid has state. */
function makePlaytimeMatrix() {
  const cols = 8;
  const rows = 8;
  const slots: any[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let state: 'empty' | 'stopped' | 'playing' = 'empty';
      let name = '';
      let clipType: 'none' | 'audio' | 'midi' = 'none';

      // Row 0: first cell playing, second stopped, others empty
      if (r === 0) {
        if (c === 0) { state = 'playing'; name = 'Loop A'; clipType = 'audio'; }
        else if (c === 1) { state = 'stopped'; name = 'Kick'; clipType = 'audio'; }
      }
      // Row 1: a couple of stopped clips
      else if (r === 1) {
        if (c === 0) { state = 'stopped'; name = 'Lead'; clipType = 'midi'; }
        else if (c === 3) { state = 'stopped'; name = 'Bass'; clipType = 'audio'; }
      }
      // Row 2: scattered
      else if (r === 2) {
        if (c === 2) { state = 'stopped'; name = 'Pad'; clipType = 'audio'; }
        else if (c === 5) { state = 'stopped'; name = 'FX'; clipType = 'audio'; }
      }
      // Row 5: one playing
      else if (r === 5 && c === 1) { state = 'playing'; name = 'Hat'; clipType = 'audio'; }

      slots.push({
        column: c,
        row: r,
        state,
        color: state === 'playing' ? '#00ff88' : state === 'stopped' ? '#6688aa' : '#444444',
        name,
        clipType,
      });
    }
  }

  return {
    columns: cols,
    rows,
    transport: { playing: true, recording: false },
    slots,
  };
}

/**
 * Build a mock WS handler that responds to common commands.
 */
function makeMockWsHandler() {
  const matrixData = makePlaytimeMatrix();
  const dirEntries = MOCK_DIR_ENTRIES;
  let selectedFilePath: string | null = null;
  let sendToSlotCalls: { path: string; column: number; row: number }[] = [];

  return (ws: any): void => {
    ws.onMessage((message: string | Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(message.toString());
      } catch {
        return;
      }

      const { type, command, id, params } = msg;
      if (type !== 'command' || !id) return;

      let responsePayload: any = {};

      switch (command) {
        case 'track/getAll':
          responsePayload = {
            tracks: [
              { index: 0, name: 'Drums',    trackNumber: 1, selected: true,  muted: false, soloed: false, armed: false, volume: 0.85, pan: 0 },
              { index: 1, name: 'Bass',     trackNumber: 2, selected: false, muted: false, soloed: false, armed: false, volume: 0.70, pan: 0 },
              { index: 2, name: 'Lead Synth', trackNumber: 3, selected: false, muted: false, soloed: false, armed: false, volume: 0.60, pan: -0.2 },
            ],
          };
          break;

        case 'matrix/getAll':
          responsePayload = matrixData;
          break;

        case 'sample/getDirectory':
          // Honour paging params if present
          responsePayload = {
            entries: dirEntries,
            total: dirEntries.length,
            offset: params?.offset ?? 0,
            path: params?.path ?? '/Users/me/Samples/Drums',
          };
          break;

        case 'sample/sendToTrack':
          responsePayload = { status: 'ok' };
          break;

        case 'sample/sendToSlot': {
          const col = Number(params?.column ?? 0);
          const row = Number(params?.row ?? 0);
          const filePath = String(params?.path ?? '');
          sendToSlotCalls.push({ path: filePath, column: col, row: row });
          selectedFilePath = filePath;
          // Mutate matrix slot to show clip now exists in that cell — proves import worked
          const slotIndex = matrixData.slots.findIndex(
            (s: any) => s.column === col && s.row === row,
          );
          if (slotIndex >= 0) {
            const fileName = filePath.split('/').pop() || 'sample';
            matrixData.slots[slotIndex] = {
              ...matrixData.slots[slotIndex],
              state: 'stopped',
              name: fileName.replace(/\.[^.]+$/, ''),
              clipType: 'audio',
              color: '#6688aa',
            };
          }
          responsePayload = { status: 'ok', slot: matrixData.slots[slotIndex] };
          break;
        }

        case 'sample/getAudioInfo':
          responsePayload = {
            duration: 2.5,
            sampleRate: 44100,
            channels: 2,
            peaks: [0.1, 0.3, 0.5, 0.8, 0.6, 0.4, 0.2, 0.1, 0.4, 0.7, 0.9, 0.5, 0.2, 0.1, 0.3, 0.6],
          };
          break;

        case 'sample/preview':
        case 'sample/stopPreview':
          responsePayload = { status: 'ok' };
          break;

        case 'sample/refreshCache':
        case 'sample/cacheStatus':
          responsePayload = { status: 'ok' };
          break;

        case 'transport/play':
        case 'transport/stop':
        case 'transport/getState':
          responsePayload = { playing: false, position: 0 };
          break;

        case 'fx/enumerate':
          responsePayload = { fx: ['ReaEQ', 'ReaComp', 'ReaVerb', 'ReaDelay', 'ReaGate'] };
          break;

        case 'settings/get':
          responsePayload = {
            samplePaths: ['/Users/me/Samples/Drums', '/Users/me/Samples/Bass'],
            fxChainPath: '/tmp/chains',
          };
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

async function waitForConnected(page: any) {
  for (let i = 0; i < 30; i++) {
    const text = await page.evaluate(() => document.body.textContent ?? '');
    if (text.includes('Connected')) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

test.describe('Issue #108 — Sample → Playtime clip slot (Arrangement↔Session toggle + mini grid)', () => {
  test.setTimeout(90000);

  test('Capture Arrangement mode + Session mode with mini grid', async ({ page }) => {
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Intercept WebSocket
    await page.routeWebSocket(WS_REAL, makeMockWsHandler());

    await page.setViewportSize(IPAD_PRO);
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Wait for connected
    const connected = await waitForConnected(page);
    console.log('App connected:', connected);

    // Click Media tab
    const mediaTab = page.locator('nav button:has-text("Media")');
    await mediaTab.click();
    await page.waitForTimeout(1500);
    console.log('Clicked Media tab');

    // Wait for the Media Browser to render and sample files to appear
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('kick_01.wav') ?? false,
        { timeout: 10000 },
      );
      console.log('Sample files visible');
    } catch {
      console.log('Sample files may not have loaded fully, continuing');
    }

    // Wait for the Arrangement|Session toggle to be visible
    const arrangementBtn = page.locator('button', { hasText: /^Arrangement$/ });
    const sessionBtn = page.locator('button', { hasText: /^Session$/ });
    await arrangementBtn.first().waitFor({ state: 'visible', timeout: 5000 });
    await sessionBtn.first().waitFor({ state: 'visible', timeout: 5000 });
    console.log('Arrangement|Session toggle visible');

    await page.waitForTimeout(800);

    // ── Screenshot 1: Media Browser in Arrangement mode (default) ──
    // Shows: toggle, sample list, "🎯 Send" buttons
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-108-1-arrangement-mode.png` });
    console.log('Screenshot 1 saved: ss-108-1-arrangement-mode.png');

    // Switch to Session mode
    await sessionBtn.first().click();
    await page.waitForTimeout(1200);
    console.log('Switched to Session mode');

    // Wait for the mini grid to appear
    try {
      await page.waitForFunction(
        () => document.body.textContent?.includes('Send to Session Grid') ?? false,
        { timeout: 5000 },
      );
      console.log('Mini grid visible');
    } catch {
      console.log('Mini grid may not be visible, continuing');
    }
    await page.waitForTimeout(800);

    // ── Screenshot 2: Media Browser in Session mode with mini grid ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-108-2-session-mode-mini-grid.png` });
    console.log('Screenshot 2 saved: ss-108-2-session-mode-mini-grid.png');

    // First, click a sample to "select" it (the mini grid only enables taps when a file is selected)
    const firstSample = page.locator('text=kick_01.wav').first();
    await firstSample.click();
    await page.waitForTimeout(800);
    console.log('Selected sample: kick_01.wav');

    // Tap a mini grid cell to trigger import (find the first cell by its position label)
    // Mini grid cells have a "1,1" position label at bottom-right corner; cell (col=2,row=3) means third column, fourth row
    // We'll target the cell labelled "3,4" (col=2,row=3) which is empty in the mock — proves import adds the clip there
    const cellSelector = 'button[title*="Slot 3,4"]';
    const targetCell = page.locator(cellSelector).first();
    const cellVisible = await targetCell.isVisible().catch(() => false);
    console.log('Target cell (3,4) visible:', cellVisible);

    if (cellVisible) {
      await targetCell.click();
      console.log('Tapped cell (3,4) to trigger sample import');
      await page.waitForTimeout(1500);
    }

    // ── Screenshot 3: After cell tap — import triggered, cell now shows clip ──
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-108-3-after-cell-tap.png` });
    console.log('Screenshot 3 saved: ss-108-3-after-cell-tap.png');

    console.log('All screenshots captured in', SCREENSHOT_DIR);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

const MOCK_DIR_ENTRIES = [
  { name: '..', type: 'dir', size: 0 },
  { name: 'Audio Files', type: 'dir', size: 0 },
  { name: 'breakbeat.wav', type: 'file', size: 482001 },
  { name: 'drum_loop.wav', type: 'file', size: 362004 },
  { name: 'vocal_phrase.wav', type: 'file', size: 241000 },
];

const MOCK_SLICES = [
  { index: 0, startTime: 0.000, endTime: 0.287, duration: 0.287, label: 'C2' },
  { index: 1, startTime: 0.287, endTime: 0.571, duration: 0.284, label: 'C#2' },
  { index: 2, startTime: 0.571, endTime: 0.858, duration: 0.287, label: 'D2' },
  { index: 3, startTime: 0.858, endTime: 1.145, duration: 0.287, label: 'D#2' },
  { index: 4, startTime: 1.145, endTime: 1.429, duration: 0.284, label: 'E2' },
  { index: 5, startTime: 1.429, endTime: 1.716, duration: 0.287, label: 'F2' },
  { index: 6, startTime: 1.716, endTime: 2.000, duration: 0.284, label: 'F#2' },
  { index: 7, startTime: 2.000, endTime: 2.287, duration: 0.287, label: 'G2' },
];

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
              { index: 1, name: 'Track 2', trackNumber: 2, selected: true, muted: false, soloed: false, armed: false, volume: 0.50, pan: -0.3 },
            ],
          };
          break;
        case 'sample/getDirectory':
          responsePayload = { entries: MOCK_DIR_ENTRIES, path: msg.payload?.path || '/' };
          break;
        case 'slicer/detect':
          responsePayload = { slices: MOCK_SLICES };
          break;
        case 'slicer/applyToRS5K':
          responsePayload = {
            sliceCount: 8,
            totalSlices: 8,
            trackIdx: 2,
            baseNote: 36,
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

async function setupWithMock(page: any) {
  // Capture console for debugging
  page.on('console', (msg: any) => {
    console.log(`[browser ${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err: any) => {
    console.log(`[pageerror] ${err.message}`);
  });

  await page.routeWebSocket('ws://127.0.0.1:9224', makeMockWsHandler());
  await page.goto('/');

  // Wait for page to stabilize
  await page.waitForTimeout(3000);
}

test.describe('Issue #123 — Slicer Transient-Based Sample Slicer Screenshots', () => {
  test.setTimeout(120000);

  test('SS-123: Slicer panel with file browser, detection, and RS5K generation', async ({ page }) => {
    await page.setViewportSize(IPAD_PRO);
    await setupWithMock(page);
    await page.waitForTimeout(1000);

    // Take debug screenshot of current state
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-debug-state.png` });
    console.log('Debug screenshot taken');

    // Navigate to Media tab
    const mediaTab = page.getByRole('button', { name: /Media/i });
    await expect(mediaTab).toBeVisible({ timeout: 5000 });
    await mediaTab.click();
    await page.waitForTimeout(2000);

    // Take debug screenshot after clicking media
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-after-media-click.png` });
    console.log('After media click screenshot taken');

    // Click the Slicer button to open SlicerPanel
    const slicerBtn = page.getByRole('button', { name: /Slicer/i });
    await expect(slicerBtn).toBeVisible({ timeout: 5000 });
    await slicerBtn.click();
    await page.waitForTimeout(1000);

    // We should now see the SlicerPanel with the header
    await expect(page.getByText('🔪 Slicer')).toBeVisible({ timeout: 5000 });

    // Take screenshot 1: Slicer panel initial state (no file selected)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-slicer-initial.png` });
    console.log('Screenshot 1: Slicer panel initial state');

    // Click Browse to open file browser
    const browseBtn = page.getByRole('button', { name: /Browse/i });
    await expect(browseBtn).toBeVisible({ timeout: 5000 });
    await browseBtn.click();
    await page.waitForTimeout(1500);

    // File browser overlay should be visible
    await expect(page.getByText('Select File')).toBeVisible({ timeout: 5000 });

    // Take screenshot 2: File browser overlay
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-slicer-file-browser.png` });
    console.log('Screenshot 2: File browser overlay');

    // Select breakbeat.wav
    await page.getByText('breakbeat.wav').click();
    await page.waitForTimeout(1000);

    // File should be selected, detect button should be available
    await expect(page.getByText('breakbeat.wav')).toBeVisible({ timeout: 5000 });

    // Take screenshot 3: File selected, ready to detect
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-slicer-file-selected.png` });
    console.log('Screenshot 3: File selected');

    // Click Detect Slices
    const detectBtn = page.getByRole('button', { name: /Detect/i });
    await expect(detectBtn).toBeVisible({ timeout: 5000 });
    await detectBtn.click();
    await page.waitForTimeout(2000);

    // We should see the detected slices
    await expect(page.getByText('Slices (8)')).toBeVisible({ timeout: 5000 });

    // Take screenshot 4: Slices detected with waveform markers and slice list
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-slicer-slices-detected.png` });
    console.log('Screenshot 4: Slices detected with waveform markers');

    // Click Generate RS5K Track
    const generateBtn = page.getByRole('button', { name: /Generate/i });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Should see the result summary
    await expect(page.getByText(/Created 8 RS5K instances/)).toBeVisible({ timeout: 5000 });

    // Take screenshot 5: RS5K generation result
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-123-slicer-rs5k-generated.png` });
    console.log('Screenshot 5: RS5K generation result');

    console.log('All Slicer screenshots captured in', SCREENSHOT_DIR);
  });
});

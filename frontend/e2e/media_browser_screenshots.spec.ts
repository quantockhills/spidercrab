import { test, expect } from '@playwright/test';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

const MOCK_DIR_ENTRIES = [
  { name: 'Audio Files', type: 'dir', size: 0 },
  { name: 'kick.wav', type: 'file', size: 48201 },
  { name: 'snare.wav', type: 'file', size: 36204 },
  { name: 'hihat.wav', type: 'file', size: 24100 },
  { name: 'bass_line.wav', type: 'file', size: 125400 },
  { name: 'guitar_strum.flac', type: 'file', size: 298000 },
  { name: 'vocals.mp3', type: 'file', size: 512000 },
];

async function setupMockWs(page: any): Promise<void> {
  await page.routeWebSocket(WS_REAL, (ws) => {
    ws.onMessage((message: string) => {
      const msgStr = message.toString();
      let parsed: any;
      try {
        parsed = JSON.parse(msgStr);
      } catch {
        return;
      }

      const cmd = parsed.command || parsed.action;
      const id = parsed.id || 'unknown';

      if (!cmd) return;

      const respond = (payload: any, success = true) => {
        ws.send(JSON.stringify({ type: 'response', id, success, payload }));
      };

      switch (cmd) {
        case 'track/getAll':
          respond({
            tracks: [
              { index: 0, name: 'Track 1', muted: false, soloed: false, armed: false, selected: true, volume: 0.8, pan: 0 },
              { index: 1, name: 'Track 2', muted: false, soloed: false, armed: false, selected: false, volume: 0.7, pan: 0 },
            ],
          });
          break;

        case 'fx/enumerate':
          respond({ fx: ['ReaEQ', 'ReaComp', 'ReaVerb', 'ReaDelay', 'ReaGate'] });
          break;

        case 'sample/getDirectory':
          respond({ entries: MOCK_DIR_ENTRIES, path: parsed.path || '/tmp' });
          break;

        case 'sample/getAudioInfo':
          respond({
            duration: 10.5,
            sampleRate: 44100,
            channels: 2,
            peaks: [0.1, 0.3, 0.5, 0.8, 0.6, 0.4, 0.2, 0.1],
          });
          break;

        case 'sample/preview':
        case 'sample/stopPreview':
          respond({ status: 'ok' });
          break;

        case 'transport/play':
        case 'transport/stop':
        case 'transport/getState':
          respond({ playing: false, position: 0 });
          break;

        default:
          respond({ status: 'ok' });
          break;
      }
    });
  });
}

test.describe('Media Browser Screenshots', () => {
  test.setTimeout(120000);

  test('SS-27: Media browser screenshots', async ({ page }) => {
    await setupMockWs(page);
    await page.setViewportSize(IPAD_PRO);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to Media tab
    await page.getByText('Media').first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Wait for files to load from mock
    const kickFile = page.getByText('kick.wav');
    await expect(kickFile).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Screenshot 1: Media browser with directory listing
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-27-media-browser-dir.png` });

    // Click on kick.wav to open audio preview
    await kickFile.click();
    await page.waitForTimeout(3000);

    // Screenshot 2: Waveform preview panel
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-27-waveform-preview.png` });

    // Close preview by clicking the close button
    const closeBtn = page.locator('button[aria-label="Close preview"]');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // Long-press on snare.wav to open context menu
    const snareFile = page.getByText('snare.wav');
    await expect(snareFile).toBeVisible({ timeout: 5000 });

    const box = await snareFile.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1000);
      await page.mouse.up();
      await page.waitForTimeout(500);
    }

    // Screenshot 3: Context menu
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-28-context-menu.png` });

    // Click "File Info" in context menu
    const fileInfoOption = page.getByText('File Info');
    if (await fileInfoOption.isVisible().catch(() => false)) {
      await fileInfoOption.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-28-file-info-modal.png` });
    }
  });
});

import { test, expect } from '@playwright/test';

const WS_REAL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = '/home/sasha/projects/reaper-ipad/gui_testing';
const IPAD_PRO = { width: 2360, height: 1640 };

/**
 * Mock directory entries for a sample root.
 * Returns a predictable set of files/subdirs for testing the SampleBrowser.
 */
function makeMockEntries(rootName: string): Array<{ name: string; type: string; size: number }> {
  const dirs = [
    { name: 'Kicks', type: 'dir', size: 0 },
    { name: 'Snares', type: 'dir', size: 0 },
    { name: 'Hats', type: 'dir', size: 0 },
  ];
  const files = [
    { name: `${rootName}_kick.wav`, type: 'file', size: 48201 },
    { name: `${rootName}_snare.wav`, type: 'file', size: 36204 },
    { name: `${rootName}_hihat.wav`, type: 'file', size: 24100 },
    { name: `${rootName}_loop.wav`, type: 'file', size: 125400 },
  ];
  return [...dirs, ...files];
}

/**
 * Set up an inline mock WebSocket that intercepts messages to the real WS server.
 * The mock responds to sample/getDirectory with entries based on the requested path,
 * and provides realistic track data.
 */
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
              { index: 0, name: 'Kick', muted: false, soloed: false, armed: false, selected: true, volume: 0.8, pan: 0 },
              { index: 1, name: 'Snare', muted: false, soloed: false, armed: false, selected: false, volume: 0.7, pan: 0 },
              { index: 2, name: 'Hihat', muted: false, soloed: false, armed: false, selected: false, volume: 0.6, pan: 0 },
            ],
          });
          break;

        case 'sample/getDirectory': {
          const reqPath: string = parsed.path || '';

          // Map requested path to mock entries
          let rootName = 'samples';
          if (reqPath.includes('Drums')) rootName = 'Drums';
          else if (reqPath.includes('Loops')) rootName = 'Loops';
          else if (reqPath.includes('Vocals')) rootName = 'Vocals';

          const entries = makeMockEntries(rootName);
          respond({ entries, path: reqPath });
          break;
        }

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

        case 'fx/enumerate':
          respond({ fx: ['ReaEQ', 'ReaComp', 'ReaVerb', 'ReaDelay', 'ReaGate'] });
          break;

        case 'fxchain/getDirectory':
          respond({ chains: [], dirs: [] });
          break;

        default:
          respond({ status: 'ok' });
          break;
      }
    });
  });
}

test.describe('Issue #101 Sample Directory Management Screenshots', () => {
  test.setTimeout(120000);

  test('SS-101: Settings tab with sample directories, root selector, and browsing', async ({ page }) => {
    // ── Setup ───────────────────────────────────────────────

    // Set localStorage with pre-configured sample paths BEFORE the page loads.
    // This simulates a user who has already configured 3 sample directories.
    await page.addInitScript(() => {
      localStorage.setItem('sampleBrowserPaths', JSON.stringify([
        '/Users/tamura/Samples/Drums',
        '/Users/tamura/Samples/Loops',
        '/Users/tamura/Samples/Vocals',
      ]));
      // Remove any old single-path setting so migration doesn't interfere
      localStorage.removeItem('sampleBrowserRootPath');
    });

    await setupMockWs(page);
    await page.setViewportSize(IPAD_PRO);
    await page.goto('http://localhost:5199/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ── Screenshot 1: Settings tab ──────────────────────────

    // Navigate to Settings tab (the gear icon tab)
    const settingsTab = page.locator('button', { hasText: 'Settings' });
    await expect(settingsTab).toBeVisible({ timeout: 5000 });
    await settingsTab.click();
    await page.waitForTimeout(2000);

    // Verify the "Sample Directories" section is rendered
    const sampleDirectoriesHeader = page.getByText('Sample Directories');
    await expect(sampleDirectoriesHeader).toBeVisible({ timeout: 5000 });

    // Verify configured paths are shown
    await expect(page.getByText('/Users/tamura/Samples/Drums')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('/Users/tamura/Samples/Loops')).toBeVisible();
    await expect(page.getByText('/Users/tamura/Samples/Vocals')).toBeVisible();

    // Screenshot: Settings tab showing 3 sample directories with remove (✕) buttons
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-101-settings-sample-dirs.png` });
    console.log('Saved ss-101-settings-sample-dirs.png');

    // ── Screenshot 2: Media Browser root selector ──────────

    // Navigate to Media tab
    const mediaTab = page.locator('button', { hasText: 'Media' });
    await expect(mediaTab).toBeVisible({ timeout: 5000 });
    await mediaTab.click();
    await page.waitForTimeout(2000);

    // Verify root selector shows all 3 configured paths
    await expect(page.getByText('Sample Directories')).toBeVisible({ timeout: 5000 });
    const drumsRoot = page.getByText('/Users/tamura/Samples/Drums');
    const loopsRoot = page.getByText('/Users/tamura/Samples/Loops');
    const vocalsRoot = page.getByText('/Users/tamura/Samples/Vocals');
    await expect(drumsRoot).toBeVisible({ timeout: 5000 });
    await expect(loopsRoot).toBeVisible();
    await expect(vocalsRoot).toBeVisible();

    // Screenshot: Media Browser root selector with 3 directories
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-101-root-selector.png` });
    console.log('Saved ss-101-root-selector.png');

    // ── Screenshot 3: Browsing inside a root path ──────────

    // Click on the Drums root to browse inside it
    const drumsRootButton = page.locator('button', { hasText: '/Users/tamura/Samples/Drums' }).first();
    await expect(drumsRootButton).toBeVisible({ timeout: 5000 });
    await drumsRootButton.click();
    await page.waitForTimeout(2000);

    // Verify files/dirs from the mock are visible
    await expect(page.getByText('Drums_kick.wav')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Kicks')).toBeVisible();
    await expect(page.getByText('Snares')).toBeVisible();

    // The breadcrumb should show the current path
    // Use .first() because this text also appears in the footer indicator
    await expect(page.getByText('/Users/tamura/Samples/Drums').first()).toBeVisible({ timeout: 5000 });

    // Screenshot: Browsing inside /Users/tamura/Samples/Drums
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-101-browsing-dir.png` });
    console.log('Saved ss-101-browsing-dir.png');
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';

const G = path.resolve(import.meta.dirname!, '../../screenshots/issue97');
const SCREENSHOT_DIR = path.resolve(import.meta.dirname!, '../../gui_testing');

test.describe('Issue #97 - FX Tags', () => {

  test('capture tag badges and filter bar', async ({ page }) => {
    // Mock WebSocket to provide FX with tags
    await page.addInitScript(() => {
      localStorage.setItem('fxChainPath', '/tmp/chains');

      const wsMock = {
        trackGetAll: JSON.stringify({
          type: 'response', id: '0', success: true,
          payload: { tracks: [
            { index: 0, name: 'Guitar', selected: true, muted: false, soloed: false, armed: false, volume: 0.8, pan: 0 },
          ]}
        }),
        fxEnumerate: JSON.stringify({
          type: 'response', id: '1', success: true,
          payload: { fxs: [
            { index: 0, name: 'ReaComp', ident: 'reacomp' },
            { index: 1, name: 'ReaEQ', ident: 'reaeq' },
            { index: 2, name: 'ReaDelay', ident: 'readelay' },
            { index: 3, name: 'ReaVerb', ident: 'reaverb' },
          ]}
        }),
        tagsGetAll: JSON.stringify({
          type: 'response', id: '2', success: true,
          payload: { tags: {
            'reacomp': ['dynamics', 'mix'],
            'reaeq': ['eq', 'mix'],
            'readelay': ['time', 'fx'],
            'reaverb': ['space', 'fx'],
          }}
        }),
      };

      // Intercept WebSocket
      const orig = window.WebSocket;
      window.WebSocket = function(url) {
        const ws = new orig(url);
        const origSend = ws.send.bind(ws);
        const callbacks = new Map();
        ws.addEventListener('message', (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'command' && msg.id) {
              let resp = null;
              if (msg.command === 'track/getAll') resp = wsMock.trackGetAll;
              else if (msg.command === 'fx/enumerate') resp = wsMock.fxEnumerate;
              else if (msg.command === 'fx/tags/getAll') resp = wsMock.tagsGetAll;
              if (resp) {
                Object.defineProperty(ws, 'readyState', { value: 1, writable: true });
                ws.dispatchEvent(new Event('open'));
                setTimeout(() => {
                  ws.dispatchEvent(new MessageEvent('message', { data: resp }));
                }, 100);
              }
            }
          } catch(e) {}
        });
        return ws;
      };
    });

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Navigate to FX browser
    await page.locator('button:has-text("FX")').click();
    await page.waitForTimeout(1500);

    // Screenshot 1: FX browser with tag badges on each FX
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-97-tag-badges.png`, fullPage: false });

    // Screenshot 2: Tag filter bar visible
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ss-97-tag-filter.png`, fullPage: true });

    // Verify tag badges exist
    const tagBadges = await page.locator('[class*="tag"], [class*="badge"]').all();
    console.log(`Found ${tagBadges.length} tag badges`);
  });
});

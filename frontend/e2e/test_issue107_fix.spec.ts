import { test, expect } from '@playwright/test';

test.describe('Issue #107 — Debug', () => {
  test('Debug sample index progress', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

    await page.routeWebSocket('ws://127.0.0.1:9224', ws => {
      ws.onMessage(message => {
        try {
          const msg = JSON.parse(message.toString());
          console.log('MOCK: received command:', msg.command);
          if (msg.command === 'sample/refreshCache') {
            console.log('MOCK: got refreshCache, sending progress...');
            // Send response first
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: { total: 5000, rootPath: '/test' } }));
            // Then send progress event
            setTimeout(() => {
              console.log('MOCK: sending progress event now');
              ws.send(JSON.stringify({ type: 'event', event: 'sampleIndexProgress', payload: { scanned: 500, total: 5000, status: 'scanning' } }));
            }, 300);
          } else {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: msg.command === 'track/getAll' ? {
              tracks: [{ index: 0, name: 'T1', trackNumber: 1 }, { index: 1, name: 'T2', trackNumber: 2 }]
            } : { success: true } }));
          }
        } catch (e) {
          console.log('MOCK: error parsing message:', e);
        }
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(5000);

    // Log initial connection status
    const connectedText = await page.evaluate(() => {
      const el = document.querySelector('span.text-\\[11px\\].text-\\[var\\(--text-secondary\\)\\]');
      return el ? el.textContent : 'not found';
    });
    console.log('Connection status:', connectedText);

    // Go to Settings and click refresh
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Click refresh button
    const refreshBtn = page.locator('button:has-text("Refresh Sample Index")');
    console.log('Refresh btn visible:', await refreshBtn.isVisible());
    await refreshBtn.click();
    console.log('Clicked refresh at', Date.now());

    // Wait for event
    await page.waitForTimeout(5000);

    // Log all error console messages
    for (const l of logs) {
      if (l.includes('ERROR') || l.includes('error') || l.includes('PAGE_ERROR') || l.includes('sampleIndexProgress')) {
        console.log('RELEVANT LOG:', l);
      }
    }

    // Check all buttons
    const btns = await page.locator('button').allTextContents();
    console.log('All buttons:', btns);

    // Check if scanning text appears anywhere
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Contains Scanning:', bodyText.includes('Scanning'));
    console.log('Contains Indexing:', bodyText.includes('Indexing'));

    // Take screenshot
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-debug2.png' });
  });
});

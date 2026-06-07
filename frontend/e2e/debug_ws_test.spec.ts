import { test, expect } from '@playwright/test';

test.describe('Debug End-to-End Scan', () => {
  test('Click refresh and wait for scanning state', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('registered') || text.includes('sampleIndexProgress') || text.includes('Scanning') || text.includes('scanning') || text.includes('error') || text.includes('Error')) {
        console.log(`[PAGE ${msg.type()}] ${text}`);
      }
    });

    await page.routeWebSocket('ws://127.0.0.1:9224', ws => {
      ws.onMessage(message => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.command === 'sample/refreshCache') {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: { total: 5000, rootPath: '/test' } }));
            // Send progress event quickly (200ms instead of 2000ms)
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'event', event: 'sampleIndexProgress', payload: { scanned: 500, total: 5000, status: 'scanning' } }));
            }, 200);
          } else {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: msg.command === 'track/getAll' ? {
              tracks: [{ index: 0, name: 'T1', trackNumber: 1 }, { index: 1, name: 'T2', trackNumber: 2 }]
            } : { success: true } }));
          }
        } catch (e) { /* ignore */ }
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(5000);

    console.log('=== Initial load complete ===');

    // Log all button texts
    const buttons = await page.locator('button').allTextContents();
    console.log('Buttons:', buttons);

    // Go to Settings
    await page.locator('button', { hasText: 'Settings' }).click();
    await page.waitForTimeout(1000);

    // Find refresh button
    const refreshBtn = page.locator('button', { hasText: 'Refresh Sample Index' });
    console.log('Refresh btn visible:', await refreshBtn.isVisible());

    // Click it
    await refreshBtn.click();
    console.log('Clicked refresh at', Date.now());

    // Wait for progress event to arrive and state to update
    await page.waitForTimeout(5000);

    // Check button text
    const btnAfter = await page.locator('button').allTextContents();
    console.log('Buttons after 5s:', btnAfter);

    // Check for scanning text
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body text:', bodyText.substring(200, 500));
    console.log('Contains "Scanning":', bodyText.includes('Scanning'));
    console.log('Contains "Indexing":', bodyText.includes('Indexing'));

    // Try waiting longer
    // Re-check every second
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const btns = await page.locator('button').allTextContents();
      if (btns.some(b => b.includes('Scanning'))) {
        console.log(`Found Scanning at iteration ${i}! Buttons:`, btns);
        break;
      }
    }

    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-debug-e2e.png' });
  });
});

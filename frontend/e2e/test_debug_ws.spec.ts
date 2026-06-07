import { test, expect } from '@playwright/test';

test.describe('WS Connection Debug', () => {
  test('Debug WebSocket onopen', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

    await page.routeWebSocket('ws://127.0.0.1:9224', ws => {
      console.log('MOCK: WebSocket connection established');
      ws.onMessage(message => {
        try {
          const msg = JSON.parse(message.toString());
          console.log('MOCK: received:', msg.type, msg.command || msg.event);
          if (msg.command === 'track/getAll') {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: {
              tracks: [{ index: 0, name: 'T1', trackNumber: 1 }, { index: 1, name: 'T2', trackNumber: 2 }]
            } }));
          } else {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: { success: true } }));
          }
        } catch (e) { console.log('MOCK: error', e); }
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    
    // Wait and check every second for connection status
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const status = await page.evaluate(() => {
        // Try to find the connected/disconnected text
        const allSpans = document.querySelectorAll('span');
        for (const s of allSpans) {
          if (s.textContent === 'Connected') return 'Connected';
          if (s.textContent === 'Disconnected') return 'Disconnected';
        }
        return 'not found';
      });
      console.log(`Second ${i + 1}: connection status = ${status}`);
      
      if (status === 'Connected') {
        console.log('Connected! Checking logs for onopen...');
        const relevantLogs = logs.filter(l => l.includes('registered') || l.includes('event') || l.includes('ERROR'));
        for (const l of relevantLogs) console.log('LOG:', l);
        break;
      }
    }
    
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-ws-debug.png' });
  });
});

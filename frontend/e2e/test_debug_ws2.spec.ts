import { test, expect } from '@playwright/test';

test.describe('WS State Debug', () => {
  test('Check WebSocket readyState in browser', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

    await page.routeWebSocket('ws://127.0.0.1:9224', ws => {
      console.log('MOCK: WS connected');
      ws.onMessage(message => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.command === 'track/getAll') {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: {
              tracks: [{ index: 0, name: 'T1', trackNumber: 1 }]
            } }));
          } else {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, success: true, payload: { success: true } }));
          }
        } catch (e) { console.log('MOCK: error', e); }
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check WebSocket states in browser
    const result = await page.evaluate(() => {
      const wsRef = (window as any).__spidercrab_ws_ref;
      // Look for the WsClient instance
      const allKeys = Object.keys(window);
      const reactFiber = (document as any).__reactFiber$;
      
      // Try to find the ws property on React components
      // First determine if connected by reading DOM
      const allText = document.body.innerText;
      const isConnected = allText.includes('Connected');
      
      // Try to get React state
      const root = (document.getElementById('root') as any);
      
      return {
        textIncludesConnected: allText.includes('Connected'),
        textIncludesDisconnected: allText.includes('Disconnected'),
        bodyText: allText.substring(0, 300),
      };
    });
    
    console.log('Page state:', JSON.stringify(result, null, 2));
    
    // Check console for ws open/close events
    const wsLogs = logs.filter(l => l.includes('onopen') || l.includes('onclose') || l.includes('onerror') || l.includes('connected') || l.includes('connect'));
    console.log('WS logs:', wsLogs);
    
    // Check all logs for errors
    const errLogs = logs.filter(l => l.includes('error') || l.includes('Error') || l.includes('ERROR'));
    if (errLogs.length > 0) {
      console.log('Error logs:', errLogs);
    }
    
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-107-ws-state.png' });
  });
});

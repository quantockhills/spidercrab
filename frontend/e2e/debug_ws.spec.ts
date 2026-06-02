import { test, expect } from '@playwright/test';

test('debug ws with responses', async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'log') {
      const t = msg.text();
      if (t.includes('wsClient') || t.includes('WebSocket') || t.includes('error'))
        console.log('PAGE:', msg.type(), t);
    }
  });

  const captured: { sent: string[] } = { sent: [] };
  
  // Use the exact URL the app connects to (from debug output)
  await page.routeWebSocket('ws://127.0.0.1:9224/', (ws) => {
    console.log('=== WS ROUTE CREATED ===');
    ws.onMessage((message) => {
      const msgStr = typeof message === 'string' ? message : message.toString();
      captured.sent.push(msgStr);
      
      try {
        const msg = JSON.parse(msgStr);
        console.log('WS RX:', msg.command, 'id:', msg.id);
        
        if (msg.type === 'command' && msg.id) {
          let responsePayload = {};
          if (msg.command === 'track/getAll') {
            responsePayload = {
              tracks: [{ index: 0, name: 'Track 1', trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 }]
            };
          }
          
          const resp = JSON.stringify({
            type: 'response',
            id: msg.id,
            success: true,
            payload: responsePayload,
          });
          console.log('WS TX:', resp.substring(0, 100));
          ws.send(resp);
        }
      } catch (e) {
        console.log('WS ERROR:', (e as Error).message);
      }
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('fxChainPath', '/home/user/REAPER/FXChains');
  });

  await page.goto('/');
  await page.waitForTimeout(3000);

  const bodyText = await page.textContent('body');
  console.log('--- BODY SAMPLE:', bodyText?.substring(0, 400));
  console.log('Track 1:', bodyText?.includes('Track 1'));
  console.log('Connected:', bodyText?.includes('Connected'));
  console.log('No tracks:', bodyText?.includes('No tracks'));
  console.log('Captured:', captured.sent.length);
});

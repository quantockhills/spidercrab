import { test, expect } from '@playwright/test';

test.describe('Raw WS Check', () => {
  test('Check wsClient directly from page context', async ({ page }) => {
    test.setTimeout(30000);

    // Use a REAL WebSocket connection - let's create our own ws server 
    // inline using page.evaluate to intercept WebSocket
    await page.addInitScript(() => {
      // Store a reference to the WsClient instance by patching the WsClient class
      // The WsClient is created via `new WsClient(...)` in useReaperClient.tsx
      // We need to intercept the constructor
      
      // Since we can't import WsClient, let's intercept the WebSocket constructor
      // to capture the wsClient reference
      const NativeWS = window.WebSocket;
      
      // Patch the WebSocket to track instances
      window.WebSocket = class extends NativeWS {
        constructor(url: string, protocols?: string | string[]) {
          console.log('[WS_CAPTURE] WebSocket created:', url);
          super(url, protocols);
          // After open, we can check the wsClient via the onmessage handler
          const realOnOpen = this.onopen;
          this.addEventListener('open', () => {
            console.log('[WS_CAPTURE] WebSocket opened');
          });
          this.addEventListener('message', (ev) => {
            console.log('[WS_CAPTURE] WebSocket message:', ev.data.substring(0, 100));
          });
          this.addEventListener('error', (ev) => {
            console.log('[WS_CAPTURE] WebSocket error');
          });
        }
      } as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      console.log(`[${msg.type()}] ${t}`);
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(5000);
    
    console.log('=== Page loaded, checking connection state ===');
    const text = await page.evaluate(() => document.body.innerText);
    console.log('Connected:', text.includes('Connected'));
  });
});

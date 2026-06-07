import { test, expect } from '@playwright/test';

test.describe('Patch onEvent', () => {
  test('Patch onEvent to trace handler calls', async ({ page }) => {
    test.setTimeout(30000);

    await page.addInitScript(() => {
      class MockWebSocket {
        readyState = 0;
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSED = 3;
        onopen: ((ev: any) => void) | null = null;
        onclose: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;
        onmessage: ((ev: any) => void) | null = null;
        constructor(public url: string) {
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.({});
          }, 50);
        }
        send(data: string): void {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'command') {
              const { command, id } = msg;
              setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify({
                  type: 'response', id, success: true,
                  payload: command === 'track/getAll'
                    ? { tracks: [{ index: 0, name: 'T1', trackNumber: 1 }] }
                    : { success: true }
                })});
              }, 30);
              if (command === 'sample/refreshCache') {
                setTimeout(() => {
                  this.onmessage?.({ data: JSON.stringify({
                    type: 'event', event: 'sampleIndexProgress',
                    payload: { scanned: 500, total: 5000, status: 'scanning' }
                  })});
                }, 200);
              }
            }
          } catch (e) {}
        }
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;

      // Patch console.log to intercept wsClient logs
      const origLog = console.log;
      console.log = (...args: any[]) => {
        const str = args.join(' ');
        origLog.apply(console, args);
        // Forward to parent process via custom event
        if (str.includes('[wsClient] event received: sampleIndexProgress') || 
            str.includes('sampleIndex')) {
          // Can't do window.postMessage in addInitScript context
          // Just note it
        }
      };
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('registered') || t.includes('event received') || t.includes('ERROR') || t.includes('PAGE_ERROR') || t.includes('TRACE')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // After page loads, patch the onEvent to add tracing
    await page.evaluate(() => {
      // We need to find the WsClient. Let's traverse React's fiber tree
      // from #root
      const root = document.getElementById('root');
      if (!root) return;
      
      // Find React fiber
      const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$'));
      if (!fiberKey) return;
      
      let fiber = (root as any)[fiberKey];
      
      // Walk the fiber tree to find a component that has clientRef or wsClient
      function walkFiber(f: any, depth: number): any {
        if (!f || depth > 20) return null;
        
        // Check stateNode for wsClient reference
        const stateNode = f.stateNode;
        if (stateNode && stateNode.handlers instanceof Map) {
          return stateNode; // This is the WsClient!
        }
        
        // Check memoizedState for hooks
        let hook = f.memoizedState;
        while (hook) {
          const val = hook.memoizedState;
          if (val && typeof val === 'object' && val.current && val.current.handlers instanceof Map) {
            return val.current; // Found WsClient via useRef
          }
          hook = hook.next;
        }
        
        // Check child and sibling
        const child = walkFiber(f.child, depth + 1);
        if (child) return child;
        const sibling = walkFiber(f.sibling, depth + 1);
        if (sibling) return sibling;
        
        return null;
      }
      
      const client = walkFiber(fiber, 0);
      if (client && client.handlers instanceof Map) {
        console.log('[TRACE] Found WsClient!');
        // Now dispatch with tracing
        const origDispatch = client.dispatch.bind(client);
        client.dispatch = (pattern: string, data: any) => {
          console.log(`[TRACE] dispatch(${pattern})`);
          const handlers = client.handlers.get(pattern);
          if (handlers) {
            console.log(`[TRACE]   handlers: ${handlers.size}`);
            handlers.forEach((h: Function, i: any) => {
              console.log(`[TRACE]   calling handler...`);
              try {
                h(data);
                console.log(`[TRACE]   handler returned OK`);
              } catch (e: any) {
                console.log(`[TRACE]   handler ERROR: ${e.message}`);
              }
            });
          } else {
            console.log(`[TRACE]   no handlers for ${pattern}`);
          }
          // Also call original
          origDispatch(pattern, data);
        };
      } else {
        console.log('[TRACE] Could not find WsClient via fiber');
      }
    });

    await page.waitForTimeout(2000);

    // Go to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Click refresh
    await page.locator('button:has-text("Refresh Sample Index")').click();
    console.log('Clicked refresh');

    await page.waitForTimeout(4000);

    const text = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', text.includes('Scanning'));
    console.log('Has Indexing:', text.includes('Indexing'));
  });
});

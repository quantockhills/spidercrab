import { test, expect } from '@playwright/test';

test.describe('Direct State', () => {
  test('Manually set scanning state via page.evaluate', async ({ page }) => {
    test.setTimeout(30000);

    // Minimal mock - just enough to not crash
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
              setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify({
                  type: 'response', id: msg.id, success: true,
                  payload: { success: true }
                })});
              }, 30);
            }
          } catch (e) {}
        }
        close(): void { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        addEventListener() {}
        removeEventListener() {}
      }
      window.WebSocket = MockWebSocket as any;
    });

    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('error') || t.includes('Error') || t.includes('[DIRECT]')) {
        console.log(`[${msg.type()}] ${t}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE_ERROR] ${err.message}`));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Navigate to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Take a before screenshot
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-before-direct-state.png' });

    // Manually trigger the handler by finding it through React internals
    const result = await page.evaluate(() => {
      // Walk the React fiber tree to find AppInner and its hooks
      const root = document.getElementById('root');
      if (!root) return 'no root';
      
      const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$'));
      if (!fiberKey) return 'no fiber key';
      
      let fiber = (root as any)[fiberKey];
      
      // Walk to find the AppInner component
      function findFunctionComponent(f: any, name: string, depth: number): any {
        if (!f || depth > 30) return null;
        if (f.type && (f.type.name === name || f.type.displayName === name)) return f;
        let found = findFunctionComponent(f.child, name, depth + 1);
        if (found) return found;
        return findFunctionComponent(f.sibling, name, depth + 1);
      }
      
      // Look for AppInner
      const appFiber = findFunctionComponent(fiber, 'AppInner', 0);
      if (!appFiber) return 'no AppInner fiber';
      
      // Find hooks from memoizedState linked list
      // useState hooks store [state, setState] in queue
      let hook = appFiber.memoizedState;
      let hookIndex = 0;
      while (hook) {
        const state = hook.memoizedState;
        if (state && typeof state === 'object' && 'scanning' in state && 'progress' in state) {
          console.log(`[DIRECT] Found sampleIndexProgress state at hook ${hookIndex}:`, JSON.stringify(state));
          // Call the setter
          const setter = hook.queue.dispatch;
          if (setter) {
            console.log('[DIRECT] Calling setter...');
            setter({
              scanning: true,
              progress: 2500,
              total: 5000,
              status: 'scanning'
            });
            console.log('[DIRECT] Setter called!');
            return `state set via hook ${hookIndex}`;
          }
        }
        hook = hook.next;
        hookIndex++;
      }
      
      return `checked ${hookIndex} hooks, state not found`;
    });
    console.log('Direct result:', result);

    // Wait for React re-render
    await page.waitForTimeout(1000);

    // Take an after screenshot
    await page.screenshot({ path: '/home/sasha/spidercrab-playtime/gui_testing/ss-after-direct-state.png' });

    const text = await page.evaluate(() => document.body.innerText);
    console.log('Has Scanning:', text.includes('Scanning'));
    console.log('Has Indexing:', text.includes('Indexing'));
    console.log('Has Refresh Sample Index:', text.includes('Refresh Sample Index'));
    
    // Also check if the global progress bar appeared
    const globalBarVisible = await page.evaluate(() => {
      return document.body.innerText.includes('Indexing samples:');
    });
    console.log('Global bar visible:', globalBarVisible);
  });
});

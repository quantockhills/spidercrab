# Playwright E2E Test Framework

## Overview

Playwright is used for end-to-end testing of the React frontend against a real
Reaper backend. Tests live in `frontend/e2e/`.

## Setup

- Config: `frontend/playwright.config.ts`
- Browser: Chromium (headless)
- Browser binary: installed via `npm install` → `@playwright/test` → cached in `~/.cache/ms-playwright/`
- Runner: `npm run test:e2e`

### System Dependencies

Playwright requires system libraries for Chromium that may not be present on a bare system.
Install them to run E2E tests:

```bash
# Debian/Ubuntu
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libatk1.0-0 libcups2 libdrm2

# After installing deps, verify with:
npx playwright test
```

## Conventions

- Test files: `frontend/e2e/*.spec.ts`
- Vitest is excluded from `e2e/` via `vite.config.ts: test.exclude`
- UI elements have `data-testid` attributes for reliable targeting

---

## Quick Reference (our usage)

### Configuration

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    timeout: 15000,
    reuseExistingServer: true,
  },
});
```

### Writing Tests

```ts
import { test, expect } from '@playwright/test';

test('descriptive name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('my-element')).toBeVisible();
  await page.getByTestId('my-button').click();
});
```

### Intercepting WebSocket Messages

```ts
const wsMessages: string[] = [];
await page.routeWebSocket(/ws:\/\/localhost:9224/, (ws) => {
  ws.on('framesent', (frame) => {
    wsMessages.push(frame.payload as string);
  });
  ws.on('framereceived', (frame) => {
    // incoming frames
  });
});
```

### Common Assertions

| Assertion | Description |
|-----------|-------------|
| `expect(page).toHaveTitle(/.../)` | Page title matches |
| `expect(page.getByRole(...)).toBeVisible()` | Element visible |
| `expect(page.getByTestId('x'))` | Element by test ID |
| `expect(page.getByText('pattern'))` | Element by text |
| `expect(locator).toHaveText('...')` | Element has exact text |
| `expect(locator).toContainText('...')` | Element contains text |

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run a single file
npx playwright test e2e/transport.spec.ts

# With headed browser (for debugging)
npx playwright test --headed
```

---

## Screenshot Capture (for Screenshot Verifier)

The Screenshot Verifier agent uses Playwright to capture UI screenshots
for visual verification. Screenshots go to `gui_testing/`.

### Basic Capture Pattern

```javascript
const { chromium } = require('playwright');
const G = '/home/sasha/projects/reaper-ipad/gui_testing';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 2360, height: 1640 } });
  await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WS connection before interacting
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    if (await p.evaluate(() => document.body.textContent.includes('Connected'))) break;
  }

  await p.screenshot({ path: G + '/ss-descriptive-name.png', fullPage: false });
  await b.close();
})();
```

### Memory-Constrained Environments

If the system has limited RAM (Reaper + Chromium can exceed 3.7GB),
use the lighter `chromium_headless_shell` instead:

```javascript
const SHELL = '/home/sasha/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const b = await chromium.launch({
  executablePath: SHELL,
  args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
});
```

### Avoiding X11 Display Conflicts

Reaper and Chromium should NOT share the same X display. Use separate
displays to avoid SWELL layer crashes:
- Reaper: `DISPLAY=:99` (Xvfb)
- Chromium: `DISPLAY=:100` (separate Xvfb)

### Known Limitation

`EnumInstalledFX` crashes Reaper when Chromium WS is connected
(see issue #34). Workaround: pre-cache FX enumeration via Python
WS before opening the frontend. The cache makes FX loading instant.

---

## Architecture

Browser tests follow this flow:

```
Playwright (browser)     React frontend (Vite)     Reaper extension (WS)
       │                       │                         │
       │── goto('/') ──────────┤                         │
       │── click ▶  ──────────┤                         │
       │                       │── ws: transport/play ───┤
       │                       │                         │── CSurf_OnPlay()
       │                       │── ws: transport/getState │
       │                       │                         │── API: GetPlayState()
       │── see "Playing" ─────┤                         │
```

## Future Tests

- FX browser: add/remove effects, check UI updates
- Track mute/solo/arm: click M/S/R buttons, verify server response
- Sample browser: browse directories, preview samples

---

_Source: https://playwright.dev/docs/intro_

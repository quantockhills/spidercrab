# Playwright E2E Test Framework

## Overview

Playwright is used for end-to-end testing of the React frontend against a real
Reaper backend. Tests live in `frontend/e2e/`.

## Setup

- Config: `frontend/playwright.config.ts`
- Browser: Chromium (headless)
- Runner: `npx playwright test`

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

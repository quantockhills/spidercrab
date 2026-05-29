# Playwright — Project-Specific Notes

Official docs: https://playwright.dev/docs/intro

This file only documents things specific to *this project*.
Everything else (installation, writing tests, assertions) is in the official docs.

## Project-Specific Setup

- Config: `frontend/playwright.config.ts`
- Tests: `frontend/e2e/*.spec.ts`
- Browser: Chromium (headless), installed via Playwright
- WS endpoint: `ws://127.0.0.1:9224`
- UI elements use `data-testid` attributes for reliable selection

## Screenshot Capture (for Screenshot Verifier agent)

Screenshots go to `gui_testing/`. Use iPad landscape viewport (2360×1640).

### Basic Pattern

```javascript
const { chromium } = require('playwright');
const G = '/home/sasha/projects/reaper-ipad/gui_testing';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 2360, height: 1640 } });
  await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WS before interacting
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    if (await p.evaluate(() => document.body.textContent.includes('Connected'))) break;
  }

  await p.screenshot({ path: G + '/ss-name.png', fullPage: false });
  await b.close();
})();
```

### Memory-Constrained Environments

Use the lighter headless shell if RAM is tight (< 2GB free):
```javascript
const SHELL = '/home/sasha/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const b = await chromium.launch({
  executablePath: SHELL,
  args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
});
```

### X11 Display Conflicts

Reaper and Chromium on the same X display can cause SWELL crashes.
Use separate displays:
- Reaper: `DISPLAY=:99` (Xvfb)
- Chromium: `DISPLAY=:100` (separate Xvfb)

### Known Limitation

`EnumInstalledFX` crashes Reaper when Chromium WS is connected (issue #34).
Pre-cache via Python WS before opening the frontend.

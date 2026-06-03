# Plan for Issue #84: E2E — Create FX chain (ReaEQ+ReaSynth), save to disk, load on

## Background

The FX chain save/load backend (C++) and frontend (FxChainBrowser.tsx) are fully implemented and unit-tested:
- 197 C++ tests passing (fxchain save/load/directory/info, edge cases, corrupt files, empty chains, append)
- 22 frontend unit tests passing (FxChainBrowser load/save/search/info/loading/error states)

The **verification gap** is that no test proves the **end-to-end pipeline** works with real REAPER:
1. The `fullstack_verify.cjs` Part 3 (`testFxChainRoundtrip`) does test save→load via WS but is labeled as Issue #44, **doesn't verify the file exists on disk**, and is not integrated with the Playwright E2E suite
2. The `fxchain_roundtrip.spec.ts` (Issue #82) uses mocked WS — it tests the frontend UI in isolation but doesn't exercise real REAPER or the filesystem
3. No existing test verifies the saved `.RfxChain` file physically exists on disk and can be re-read

## What Needs to Change

### Root Cause of Gap
The test coverage for FX chain save/load has a middle layer missing: a **real Reaper E2E test** that:
- Exercises the C++ backend's `HandleFxChainSave` → writes `.RfxChain` file to real filesystem
- Verifies file on disk via `fs.existsSync()` + content check
- Exercises `HandleFxChainLoad` → reads file, splices into track chunk
- Verifies FX appear on destination track via `track/getFx`
- Runs as part of the test suite (not just ad-hoc script)

### Files to Create

| File | Purpose |
|------|---------|
| `frontend/e2e/issue84_chain_saveload.spec.ts` | Playwright E2E test: real Reaper WS proxy, file-on-disk verification, save+load roundtrip via frontend UI |
| `frontend/e2e/issue84_chain_saveload.cjs` (optional) | Standalone Node.js WS-only test if Playwright approach is too slow for CI |

### Recommended Approach: Playwright E2E spec (primary)

Create `frontend/e2e/issue84_chain_saveload.spec.ts` following the real-WS proxy pattern from `fullstack_roundtrip.spec.ts`:

**Test flow:**

```
1. Connect to real Reaper WS via page.routeWebSocket() proxy
2. Navigate to Tracks → select Track 1
3. Navigate to FX tab → wait for FX enumeration → add ReaEQ
4. Add ReaSynth to same track
5. Navigate to FX Chains → Save Chain tab
6. Save chain as a uniquely-named .RfxChain file (e.g. /tmp/spidercrab_e2e_save_chain.RfxChain)
   - Use page.evaluate() to call fxChainSave() directly through the app's useReaper hook 
   - OR type name in Save Chain input and click "Save FX Chain"
7. Verify file exists: use Node.js fs.accessSync() in the Playwright test (not in browser)
8. Verify file content: read file, check it contains <FXCHAIN or ITEM markers
9. Create new track (via WS command or app)
10. Load saved chain onto new track
    - Navigate to new track (or use WS command directly)
    - Load via Browse & Load tab
11. Verify both FX appear: page.evaluate() to call track/getFx, check for ReaEQ + ReaSynth
12. Cleanup: delete temp chain file
13. Take screenshots as evidence
```

**Key difference from existing tests:**
- Uses real WS proxy (not mock), so the C++ backend actually saves/loads files
- Verifies file existence and content on disk (Node.js `fs` in Playwright)
- Tests the full pipeline: add FX → save → file → load → verify FX

### Why Playwright (not just Node.js WS script)

1. Playwright is already in the test suite (`npx playwright test` or `make frontend-e2e`)
2. Can use `page.evaluate()` to invoke frontend hooks directly (no UI navigation needed for some steps)
3. Can verify both the frontend state AND backend file system from one test
4. Pattern already proven in `fullstack_roundtrip.spec.ts` (real WS proxy)
5. Screenshot capture for visual verification

### Edge Cases the Builder Must Handle

| Edge Case | Expected Handling |
|-----------|-------------------|
| ReaEQ or ReaSynth not found in plugin list | Skip test gracefully or fail with clear message (not just crash) |
| Chain file already exists from prior run | Overwrite or use unique temp name (timestamp-based) |
| No tracks in fresh Reaper | Add track first (track/add) |
| File path contains spaces or special chars | Use simple temp path: `/tmp/spidercrab_e2e_{timestamp}.RfxChain` |
| Chain file save returns success but file doesn't exist | Fail with clear diagnostic (filesystem permissions, path issues) |
| Load chain on wrong track index | Verify track index matches expected |
| Cleanup on failure | Use try/finally to delete chain file even if test fails |

### APIs/Docs Consulted

- `extension/src/command_handler.cpp` — `HandleFxChainSave`, `HandleFxChainLoad`, `HandleFxChainGetInfo` implementations
- `frontend/src/hooks/useReaper.ts` — `fxChainSave`, `fxChainLoad`, `fxChainGetInfo` WS call wrappers
- `frontend/src/components/FxChainBrowser.tsx` — Save Chain tab UI flow
- `frontend/e2e/fullstack_roundtrip.spec.ts` — Real WS proxy pattern
- `frontend/e2e/fxchain_roundtrip.spec.ts` — Mocked WS pattern for reference
- `frontend/e2e/fullstack_verify.cjs` — `testFxChainRoundtrip()` for protocol-level test logic

### Screenshot Plan

| # | Step | What to Capture |
|---|------|-----------------|
| 1 | After adding ReaEQ + ReaSynth | FX list on track showing both plugins (FxView component) |
| 2 | After saving chain | Save Chain tab showing success/confirmation state, or Browse & Load tab showing the new chain file in the listing |
| 3 | After loading chain on new track | FxView showing ReaEQ + ReaSynth on the new track |

Screenshots go to `~/projects/reaper-ipad/gui_testing/ss-84-*.png`.

### Dependencies

- Requires REAPER running headless on `:99` with WS on port 9224 (same as other real-Reaper tests)
- Requires frontend running on localhost:5173 (Playwright's `webServer` config handles this)
- Requires ReaEQ + ReaSynth to be available in the REAPER plugin list (they are bundled with REAPER)
- Filesystem write access to `/tmp/` (or configurable temp path)

### Gotchas

1. **ReaSynth may use a different format prefix than ReaEQ** — ReaEQ is `VST3: ReaEQ (Cockos)`, ReaSynth might be `VST: ReaSynth (Cockos)` or `VSTi: ReaSynth (Cockos)`. Use the full name from `fx/enumerate` response.
2. **`page.evaluate()` scope** — Can't use `fs` inside browser context. File system checks must be in Node.js Playwright scope (outside `page.evaluate()`).
3. **Real WS proxy timing** — The proxy adds latency. Use generous timeouts (see fullstack_roundtrip.spec.ts pattern with `waitForConnected()`).
4. **Chain file may be empty if track has no FX** — Our test adds FX first, so this shouldn't happen, but guard with assertion.
5. **No `data-testid` attributes** — Use text matching for UI elements (consistent with existing tests).
6. **Playwright `routeWebSocket` must be called before `page.goto()`** — Same pattern as existing tests.
7. **The Save Chain UI requires selecting the "Save Chain" tab** — The tab is disabled when no track is selected. Must have a track selected first.

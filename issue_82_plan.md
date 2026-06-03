# Plan for Issue #82: FX chain browser E2E test — load/apply chains via Playwright

## Background

The FX chain browser backend (C++) and frontend (FxChainBrowser.tsx) are implemented
and unit-tested (197 C++ tests, 22 frontend unit tests). However, the UI→WS protocol
roundtrip has no Playwright E2E coverage. Issue #78 was reopened for this exact reason.

## What Needs to Change

**Create one new file:** `frontend/e2e/fxchain_roundtrip.spec.ts`

No C++ changes, no frontend component changes, no changes to existing test files.

## Two Navigation Paths

1. **FX tab → Chains button** (primary): Tracks → select track → FX → 🔗 Chains
2. **Settings tab → Browse FX Chains** (alt): Settings → fill path → Browse FX Chains

## Mock WS Handler

Via `page.routeWebSocket()`, respond to:

| Command | Response |
|---------|----------|
| `track/getAll` | `{tracks: [Track 1, Track 2]}` (Track 2 selected) |
| `fxchain/getDirectory` | `{chains: [EQ+Comp, Vocal Chain, Master Bus], dirs: [Guitar, Drums, Vocals]}` |
| `fxchain/getInfo` | `{fxCount: 2, fxNames: [ReaEQ, ReaComp], fileSize: 2048}` |
| `fxchain/load` | `{success: true}` |
| `fxchain/save` | `{success: true}` |
| `track/getFx` | `{fx: [ReaEQ, ReaComp]}` |
| `fx/enumerate` | `{fx: [ReaEQ, ReaComp, ReaSynth]}` |

## Test Scenarios

1. **Chain directory listing** — navigate FX→Chains, verify files and dirs visible
2. **No track selected warning** — warning banner visible, Load/Append disabled
3. **Chain selection shows info panel** — click chain, verify Chain Info with FX names
4. **Load dispatches fxchain/load** — capture WS message, verify command+params+trackIdx
5. **Append mode** — click "+", verify mode=append in WS message
6. **Search filtering** — type query, verify filtered results + "No results" for miss
7. **Settings path** — fill path in Settings, Browse FX Chains, verify Load works
8. **Save mode disabled** — Save Chain tab disabled when no track selected

## Screenshot Plan

1. **ss-82-chain-browser-loaded.png** — After selecting track, navigating FX→Chains,
   clicking a chain — directory listing + Chain Info panel with FX names visible
2. **ss-82-chain-load-confirm.png** — After clicking Load — ✓ confirmation state on
   loaded file row (green ✓ replaces "Load" button)

## Files

| File | Action |
|------|--------|
| `frontend/e2e/fxchain_roundtrip.spec.ts` | **Create** |

## Gotchas

1. `page.routeWebSocket()` before `page.goto('/')`
2. Select track first on Tracks tab before testing Load
3. App starts on Tracks tab by default
4. Chain info panel requires click to trigger fxchain/getInfo
5. ✓ timeout is 2s — capture within window
6. No `data-testid` attributes — use text matching
7. Mock must handle all commands the app sends during navigation

# Plan for Issue #78: FX chain browser E2E verification

## Current Status

Issue #78 was addressed in commits 8967763 and e6a4e73:
- **8967763**: Fixed .RfxChain format (REAPER native files are raw body without outer tag → wrapped in `<FXCHAIN\n...\n>` before splicing into track chunk), bumped `GetTrackStateChunk` buffer to 4MB, implemented lazy folder tree navigation
- **e6a4e73**: Updated unit tests to match component strings/behavior (157 frontend + 197 C++ tests passing)

Issue was **reopened** because it lacks E2E verification. Related issues #82 and #84 define the actual E2E gate.

## What Already Works

### C++ Backend (`extension/src/command_handler.cpp`)
- ✅ `HandleFxChainGetDirectory` — returns `{chains: [{name, size}], dirs: [string]}` at a given path
- ✅ `HandleFxChainSave` — extracts `<FXCHAIN>...</FXCHAIN>` from `GetTrackStateChunk`, writes to file as raw body (no outer wrapper)
- ✅ `HandleFxChainLoad` — reads .RfxChain file, wraps raw body in `<FXCHAIN\n...>` tag, replaces/splices into track state chunk via `SetTrackStateChunk`
- ✅ `HandleFxChainGetInfo` — parses chain file, returns FX count and names
- ✅ Buffer size: 4MB heap-allocated (was stack 64KB)

### Frontend (`frontend/src/components/FxChainBrowser.tsx`)
- ✅ Directory tree with expandable subdirectories (lazy-load one level at a time)
- ✅ Search across all loaded chains
- ✅ "Load" button → replace mode
- ✅ "Append" (+) button → append mode
- ✅ Save mode (name input + save button)
- ✅ File selection → shows chain info panel
- ✅ Warning when no track selected
- ✅ Empty/folder-prompt/error states

### Unit Tests (`frontend/src/test/FxChainBrowser.test.tsx`)
- ✅ 22 tests covering: loading states, file listing, Load/Append button clicks, chain info display, search, save, error handling, empty states, folder prompt, back navigation

## What's Missing (E2E Verification)

The E2E test must bridge two verification gaps:

### Gap 1: WS Protocol Roundtrip (via mock/real Reaper)
The full-stack E2E test should verify the **protocol-level** flow:
1. `fxchain/save` on a track → returns `{saved: true, filePath: "..."}`
2. `fxchain/load` on the same or different track → returns `{loaded: true}`
3. `track/getFx` on the target track → shows the loaded FX
4. `fxchain/getDirectory` → returns directory listing
5. Edge cases: empty chain, corrupt file, non-existent path

### Gap 2: UI E2E via Playwright (through ipad frontend)
The UI-level test should:
1. Mock WS responses for `fxchain/getDirectory`, `fxchain/load`, `fxchain/getInfo`
2. Navigate: Tracks tab → select track → FX tab → Chains button
3. Verify chains are listed (from mock data)
4. Click "Load" → verify `fxchain/load` WS message was sent
5. Click chain name → verify chain info panel appears

## What Needs to Change

### 1. Mock WS Server (`frontend/e2e/mock_ws_server.cjs`)
**Status**: Currently doesn't respond to any `fxchain/*` commands (returns `{}` default).
**Fix needed**: Add handlers for:
- `fxchain/getDirectory` — returns mock directory listing with chains and dirs
- `fxchain/save` — returns success
- `fxchain/load` — returns success
- `fxchain/getInfo` — returns mock chain info

### 2. E2E Screenshot Test (`frontend/e2e/fxchain_screenshots.spec.ts`)
**Status**: Only captures screenshots without mocking WS. Relies on real Reaper connection.
**Fix needed**: Rewrite to:
- Use `page.routeWebSocket()` to mock WS responses (like transport.spec.ts pattern)
- Provide realistic mock data for `fxchain/getDirectory`, `fxchain/getInfo`
- Navigate: select track → FX tab → Chains button → verify chain list renders
- Verify chain info panel when a chain is selected
- Verify Load button sends correct WS message
- Capture 1-2 screenshots as evidence

### 3. E2E Full-Stack Test (`frontend/e2e/fullstack_verify.cjs`)
**Status**: Tests track/FX commands but not fxchain commands.
**Fix needed** (for issue #84): Add fxchain save/load roundtrip section:
- Add ReaEQ + ReaSynth to track
- Save chain via `fxchain/save`
- Create new track
- Load chain onto new track via `fxchain/load`
- Verify both FX appear via `track/getFx`

### 4. No C++ Changes Needed
The backend logic is correct and unit-tested (197 C++ tests). The issue is purely verification-gap, not a logic bug.

## Existing Edge Cases Already Handled

| Edge Case | Handler | Tested? |
|-----------|---------|---------|
| Empty chain file (.RfxChain with 0 bytes) | Returns error in HandleFxChainLoad | ✅ Covered |
| Corrupt file (no valid FXCHAIN content) | extractFxChainFromChunk returns empty → raw body wrapped | ✅ Works |
| Non-existent file path | fopen fails → error response | ✅ Covered |
| Permission denied (directory) | filesystem_error catch → error response | ✅ Covered |
| No FX on track (save) | extractFxChainFromChunk returns empty → error | ✅ Covered |
| Append mode (chain with existing FX) | Merges ITEM entries | ✅ Covered |
| Missing path parameter | Returns error response | ✅ Covered |
| Invalid track index | Returns error response | ✅ Covered |

## Screenshot Plan for Verifier

1. **Screenshot 1**: FX Chain Browser showing directory listing with chain files and selected chain info panel below
2. **Screenshot 2**: After clicking Load — brief "✓" confirmation state on the loaded chain (visible for 2s)

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `frontend/e2e/mock_ws_server.cjs` | Add fxchain/* command handlers | **High** |
| `frontend/e2e/fxchain_screenshots.spec.ts` | Rewrite with mocked WS, proper assertions | **High** |
| `frontend/e2e/fullstack_verify.cjs` (or new file for issue #84) | Add save+load roundtrip | **Med** |

## No-Change Zones

- `extension/src/command_handler.cpp` — backend is correct, no changes needed
- `frontend/src/components/FxChainBrowser.tsx` — UI is correct, no changes needed
- `frontend/src/test/FxChainBrowser.test.tsx` — unit tests pass (22/22)

## Dependencies

- None — this is a pure test/verification issue

## Gotchas

1. The `fullstack_verify.cjs` test connects to **real** Reaper (port 9224) and requires headless Reaper running. The E2E Playwright test should work with **mocked** WS (no Reaper needed).
2. The transport E2E test (`transport.spec.ts`) provides the correct pattern for mocking WS in Playwright — use `page.routeWebSocket()` with `onMessage` interception.
3. The frontend's `useReaper` hook re-exports `fxChainGetDirectory`, `fxChainSave`, `fxChainLoad`, `fxChainGetInfo` from `wsClient` — all callbacks are at `frontend/src/App.tsx` lines 51-54.
4. Screenshots go to `~/projects/reaper-ipad/gui_testing/`.

# Testing Strategy

## Layers

This project has four distinct testing layers. Each catches different bugs.

```
                    ┌──────────────────────┐
                    │   Windows CI (CI)     │
                    │  GitHub Actions       │
                    │  MSVC + clang-cl      │
                    │  deploy_and_test.ps1  │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │  Integration (Linux) │
                    │  Headless REAPER     │
                    │  WS protocol tests   │
                    │  run_headless_test.sh│
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────┴───────┐ ┌─────┴──────┐ ┌──────┴────────┐
     │ C++ Unit       │ │ Frontend   │ │ E2E/Playwright│
     │ Google Test    │ │ Vitest     │ │ Browser tests │
     │ No REAPER req. │ │ jsdom env  │ │ Screenshots   │
     │ `make test`    │ │ `npm test` │ │ gui_testing/  │
     └────────────────┘ └────────────┘ └───────────────┘
```

## Tools & Commands

| Layer | Tool | Command | Config |
|-------|------|---------|--------|
| C++ unit | Google Test (FetchContent) | `make test` | `extension/CMakeLists.txt` |
| Frontend unit | Vitest + React Testing Library | `cd frontend && npm test` | `frontend/vitest.config.ts` |
| Frontend E2E | Playwright (Chromium) | `make frontend-e2e` | `frontend/playwright.config.ts` |
| Integration (Linux) | headless REAPER + Python WS client | `make headless-test` | `extension/test/run_headless_test.sh` |
| Integration (Windows) | MSVC REAPER + Python WS client | `deploy_and_test.ps1` | `extension/test/ws_integration_test.py` |
| CI (Windows) | GitHub Actions + clang-cl | push triggers workflow | `.github/workflows/windows-build.yml` |

## C++ Testing (Google Test)

- **Location:** `extension/test/*.cpp`
- **Req:** `make test` — downloads GTest via FetchContent, builds, runs
- **134 tests** across 16 test suites
- **No REAPER required** — tests use mocks/fakes for REAPER API
- **Test patterns:**
  - `WebSocketFrame.*` — frame encoding/decoding
  - `WebSocketHandshake.*` — WS upgrade parsing
  - `JsonParser.*` — JSON command parsing
  - `CommandHandler.*` — command dispatch and response
  - `SHA1Tests.*` — SHA-1 (used in WS handshake)

## Frontend Testing (Vitest)

- **Location:** `frontend/src/test/*.test.tsx`
- **65 tests** across 6 files
- **jsdom environment** — no browser needed
- **WebSocket mocking:** `WebSocketFactory` seam injects mock connections
- **Component tests:** `TrackOverview`, `FxBrowser`, `ParamControl`, `SampleBrowser`, `designSystem`
- **`wsClient.test.ts`** — tests reconnect, message dispatch, error handling

## Integration Testing (Linux)

- **Script:** `extension/test/run_headless_test.sh`
- **Flow:** Start Xvfb → launch portable REAPER → connect via WS → send commands → verify responses
- **Tests:** `transport/*`, `track/*`, `fx/*`, `track/setSelected`
- **Separate Python scripts for heavy lifting:**
  - `fx_operations_test.py` — enumerate, add, params, set, delete FX
  - `reaeq_param_test.py` — ReaEQ param roundtrip (5 params)
  - `hardened_fx_test.py` — multi-track isolation, exact name matching
- **Exit codes:** 0 = pass, 1 = setup fail, 2 = test failures

### Headless Test Workflow

#### Prerequisites

| Requirement | How to Install |
|-------------|----------------|
| Xvfb | `sudo apt install xvfb` (Debian/Ubuntu) or `brew install xorg-server` (macOS) |
| Python 3 | Usually pre-installed; verify with `python3 --version` |
| REAPER Portable | Download from <https://www.reaper.fm/download.php> → extract to `~/reaper-portable/` |
| Extension built | Run `make build` to compile `reaper_spidercrab.so` |

#### Quick Start

```bash
# One-command test run
make headless-test

# Or step-by-step for debugging
make headless-launch    # Start Xvfb + Reaper in background
make headless-status    # Check if WebSocket is ready
# ... run tests manually ...
make headless-stop      # Clean shutdown
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPLAY_NUM` | `99` | Xvfb display number |
| `REAPER_PORT` | `9224` | WebSocket port to test |
| `REAPER_HOME` | `~/reaper-portable` | Path to portable Reaper |
| `EXT_SO` | (auto-detect) | Path to extension `.so` |
| `TIMEOUT_START` | `10` | Seconds to wait for Reaper startup |
| `VERBOSE` | `0` | Set to `1` for debug output |
| `KEEP_CONFIG` | (unset) | Keep temp config dir after test (for debugging) |

#### What Gets Tested

1. **WebSocket handshake** — SEC-WebSocket upgrade, Accept header
2. **transport/getState** — live play/recording state from `GetPlayState()`
3. **transport/play & stop** — command dispatch + live state verification
4. **track/getAll** — enumerate all tracks with correct structure
5. **hello message** — client greeting handling
6. **unknown command error** — proper error response for invalid commands
7. **FX operations** — enumerate, add, param get/set, delete
8. **ReaEQ param roundtrip** — add ReaEQ, change 5 params, verify values stick
9. **Hardened FX tests** — multi-track isolation, exact FX name matching

#### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Xvfb not found` | X virtual framebuffer not installed | `sudo apt install xvfb` or `brew install xorg-server` |
| `Extension .so not found` | Extension not built or wrong path | Run `make build` or set `EXT_SO=/path/to/so` |
| `WebSocket did not become ready` | REAPER didn't start or wrong port | Check REAPER logs, verify `REAPER_PORT` matches extension |
| `Reaper died during startup` | Missing libraries or config error | Check `LD_LIBRARY_PATH`, use `KEEP_CONFIG=1` to inspect config |
| `Broken pipe` | REAPER crashed or closed connection | Check REAPER console for crash info, run with `VERBOSE=1` |
| `Segmentation fault` | Extension bug or REAPER API misuse | Run with `make build-debug` for ASan output |

## Integration Testing (Windows)

- **Script:** `extension/test/deploy_and_test.ps1`
- **Flow:** Build DLL with clang-cl → deploy to portable REAPER → launch → test via WS
- **Test script:** `extension/test/ws_integration_test.py`
- **REAPER location:** `extension/test/reaper-portable/reaper.exe`
- **CI:** GitHub Actions `windows-2022` runner, clang-cl + MSVC headers via vcvarsall.bat

## Debug Builds (ASan + UBSan)

- **Command:** `make build-debug`
- **Flags:** `-fsanitize=address -fsanitize=undefined -O0 -g3`
- **Linux only** — MinGW CRT doesn't support ASan
- Catches: buffer overflows, use-after-free, undefined behavior, leaks
- Output `.so` is `reaper-ipad-ext-debug.so`

## What to Test Where

| Bug type | Catch at layer |
|----------|---------------|
| C++ memory safety | ASan debug build (Linux) |
| WS protocol parsing | C++ unit tests |
| JSON command dispatch | C++ unit tests |
| Frontend rendering | Vitest component tests |
| Frontend WS reconnect | Vitest wsClient tests |
| REAPER API integration | Headless integration tests |
| Windows ABI / MSVC | Windows CI / deploy_and_test.ps1 |
| Visual regressions | Playwright screenshots → Kimi K2.6 verification |

## Test File Conventions

- **C++:** `extension/test/test_*.cpp` — one per module being tested
- **React:** `frontend/src/test/*.test.tsx` — co-located with components
- **E2E:** `frontend/e2e/*.spec.ts` — Playwright
- **Integration:** `extension/test/*_test.py` — Python + WS
- **Windows:** `extension/test/ws_integration_test.py` — runs on both platforms

## Assembly Line (per issue type)

| Pipeline | Stages |
|----------|--------|
| UI Feature | Builder → Reviewer → Screenshot Verifier → Tester → Close |
| Backend/C++ | Builder → Reviewer → Integration Tester → Close |
| Design/Layout | Designer → Builder → Reviewer → Screenshot Verifier → Close |
| Docs/Meta | Builder → Reviewer → Tester → Close |

Builder writes failing tests first (TDD). Tester runs all tests and closes.

## Issue #125: Document Headless Test Workflow

**Status:** ✅ Complete

Comprehensive documentation added to `docs/TESTING.md` covering:
- Prerequisites for Xvfb, Python, REAPER Portable
- Quick start commands (`make headless-test`)
- Environment variables reference table
- Test coverage summary
- Troubleshooting guide

All tests pass:
- C++: 326 tests passed
- Frontend: 422 tests passed (17 skipped)

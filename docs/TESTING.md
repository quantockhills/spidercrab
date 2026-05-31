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

See `docs/workflows.md` for which pipeline applies to each task type.

| Pipeline | Stages |
|----------|--------|
| UI Feature | Builder → Reviewer → Screenshot Verifier → Tester → Close |
| Backend/C++ | Builder → Reviewer → Integration Tester → Close |
| Design/Layout | Designer → Builder → Reviewer → Screenshot Verifier → Close |
| Docs/Meta | Builder → Reviewer → Close |

Builder writes failing tests first (TDD). Tester only runs them.

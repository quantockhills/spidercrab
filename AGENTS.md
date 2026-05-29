# AGENTS.md — Project Operating Manual

This file is the single source of truth for the `reaper-ipad` project.
Read this on every session start. Update it when decisions change.

---

## 🎯 Project Identity

**Name:** reaper-ipad  
**Agent name:** Utpaladeva  
**Human:** Tamura (Madhav) — private builder, casual vibe, music production/live setup  
**Dynamic:** Low ceremony, high signal. Build music tools together. Justin Frankel energy.  
**Work style:** Nonlinear — ideas come when they come. Capture everything, organize later.

---

## 📋 Daily Routine

**Background worker:** An hourly cron job (`reaper-ipad autonomous worker`) runs silently
in isolated sessions, picks the next open issue, works on it, commits, and pushes.
It does NOT announce to Telegram — progress appears as commits and Gitea comments.
The daily check-in (10am UTC) is separate and handles the summary/flagging.

**Once per day, or at session start:**
1. Check **Gitea issues** for anything new or updated:
   ```
   tea issues list --repo madhav/reaper-ipad
   ```
2. Ask Tamura: _"Does AGENTS.md need updates?"_ — or proactively update if things clearly changed.
3. Check what we were last working on (the last open issue or the TODO.md Now section).

---

## 🏗️ Project Structure

```
~/projects/reaper-ipad/
├── AGENTS.md              ← This file. Read on startup.
├── README.md              ← Quick start guide
├── IDEAS.md               ← Legacy ideas (now using Gitea issues instead)
├── TODO.md                ← Legacy todo (now using Gitea issues instead)
├── Makefile               ← All common tasks: make build/test/lint/deploy
├── .clang-format          ← C++ code formatter rules
├── .gitignore
│
├── extension/             ← C++ REAPER extension (WebSocket server)
│   ├── src/
│   │   ├── main.cpp               ← Entry point + control surface registration
│   │   ├── websocket_server.cpp   ← WebSocket protocol (handshake, framing)
│   │   └── command_handler.cpp    ← Maps JSON commands to Reaper API calls
│   ├── test/
│   │   ├── test_main.cpp
│   │   └── test_command_handler.cpp  ← Google Test scaffolding
│   ├── build.sh                   ← Compile extension
│   ├── lint.sh                    ← clang-tidy
│   ├── deploy.sh                  ← Copy .so to Reaper's UserPlugins/
│   ├── check.sh                   ← lint + build in one shot
│   └── CMakeLists.txt             ← CMake build (for Google Test)
│
├── frontend/              ← React PWA (iPad/phone web app)
│   ├── src/
│   │   ├── lib/wsClient.ts        ← WebSocket client with auto-reconnect
│   │   ├── hooks/useReaper.ts     ← React hook for Reaper state
│   │   └── test/wsClient.test.ts  ← 9 Vitest tests
│   └── package.json
│
├── docs/                  ← Library repos + design docs (everything referenceable)
│   ├── ARCHITECTURE.md    ← Design decisions and rationale
│   ├── UI.md              ← UI/UX design spec (screens, interactions)
│   ├── helgobox/          ← Cloned helgobox repo (Playtime 2 / ReaLearn API)
│   ├── reaper-sdk/        ← REAPER C/C++ extension SDK headers
│   ├── WDL/               ← Cockos Foundation Library (jnetlib networking)
│   └── workflows.md       ← Task pipeline definitions (which stages per task type)
│
├── design/                ← Design system reference
│   ├── design-guidelines.md ← Visual design rules (colors, shapes, typography)
│   ├── designer-prompt.md ← Brief for a UI designer
│   └── original-theme/    ← 80gray v2.2 REAPER themes (reference material)
│
└── reaper/                ← (not in repo) Portable Reaper at ~/reaper-portable/
```

---

## 🧰 Tools & Workflow

### Git
- Repo: local, pushed to Gitea at `http://localhost:3000/madhav/reaper-ipad`
- Remote: `origin` → `http://madhav:***@localhost:3000/madhav/reaper-ipad.git`
- Commit messages should be descriptive. Include changelogs for significant changes.
- `git commit -m "type: short description"` pattern preferred.

### Gitea (self-hosted, local)
- **URL:** `http://localhost:3000` (user: `madhav`)
- **CLI:** `tea` is installed and logged in
- **Issues** are our task tracker. All ideas, bugs, features go here.  
- **Labels:** `bug`, `feature`, `enhancement`, `idea`, `question`, `wontfix`  
- **Milestones:** `Phase 1 MVP`, `Phase 2`, `Future`, `Process`  

**Milestone focus rule — HARD CONSTRAINT:**
We are currently laser-focused on **Phase 1 MVP** only.
Do NOT work on Phase 2, Future, or Process issues until Phase 1 MVP hits 100%.
If you're in an autonomous work cycle and Phase 1 MVP is done, exit immediately.

**Pull Requests** — used when submitting code changes for review

**When to check Gitea:**
- At session start — check for new/updated issues
- Before committing — close related issues if the commit resolves them
- When Tamura has a new idea — create an issue immediately

**Useful commands:**
```bash
tea issues list --repo madhav/reaper-ipad
tea issues show --repo madhav/reaper-ipad <N>
tea issues create --repo madhav/reaper-ipad --title "..." --labels "feature"
tea issues close --repo madhav/reaper-ipad <N>
tea pr create --repo madhav/reaper-ipad
```

### Development
| Command | What it does |
|---------|-------------|
| `make build` | Compile C++ extension (release) |
| `make build-debug` | Compile with ASan + UBSan |
| `make test` | Build & run Google Test suite (C++) |
| `make lint` | clang-tidy on C++ source |
| `make lint-fix` | Auto-fix clang-tidy issues |
| `make fmt` | clang-format all C++ files |
| `make deploy` | Copy .so to Reaper's UserPlugins/ |
| `make check` | lint + build + test |
| `make frontend-test` | Run Vitest (React) |
| `make frontend-lint` | ESLint on React source |
| `make frontend-dev` | Start Vite dev server |

### Test-Driven Development (TDD)
- Every feature starts with a failing test, then we make it pass.
- C++ code without tests is considered incomplete.
- Frontend components without tests are considered incomplete.
- Run `make test` (C++) and `cd frontend && npm test` before committing.

### Testing Philosophy
- **C++:** Google Test. Tests should NOT require Reaper to run.
- **React:** Vitest. `WebSocketFactory` seam allows mocking WebSocket without browser.
- **Integration:** Extension + actual Reaper for end-to-end verification.
- Run `make test` before committing.


### Implementation & Verification Workflow

**See `docs/workflows.md` for the full pipeline definitions per task type.**
Use the appropriate pipeline (UI Feature, Backend, Design/Layout, etc.)
before closing any issue.

Every feature goes through this sequence before its issue is closed:

**1. Before coding** — review the spec:
- [ ] Read the Gitea issue for requirements
- [ ] Check `docs/UI.md` for screen layouts and interactions
- [ ] Check `docs/ARCHITECTURE.md` for patterns and constraints
- [ ] Confirm the approach with Tamura if unclear

**When debugging crashes/bugs:**
- [ ] **Check API/SDK docs FIRST** — if a crash involves a platform API (Reaper SDK,
      WebSocket, stdlib, etc.), read the official docs before reaching for debug
      tools. Wrong function signatures or parameter semantics cause crashes that
      look like memory corruption but are just API misuse.
- [ ] `docs/reaper-sdk/sdk/reaper_plugin_functions.h` — function signatures + docs
- [ ] `docs/reaper-sdk/sdk/reaper_plugin.h` — types + interfaces
- [ ] Check if the error is reproducible without the platform (mock/fake the API)

**2. Implement** — write code + tests:
- [ ] **Keep the issue updated** — add progress comments as you go (bug found, fix attempted, tested, etc.). Don't wait until the end.
- [ ] Write failing tests first (TDD)
- [ ] Implement the feature
- [ ] Make all tests pass
- [ ] `make lint` and `make check` clean

**3. Verify** — confirm the implementation matches the spec:
- [ ] **Re-read the issue, UI.md, and ARCHITECTURE.md** — did you actually build what was asked, or just something that looks similar?
- [ ] **Challenge your assumptions** — does your test actually prove the thing works, or just that the extension responds? (A passing test that tests the wrong thing is worse than no test.)
- [ ] Does the UI behave as described in `docs/UI.md`? (run it and look)
- [ ] Does the code follow the architecture in `docs/ARCHITECTURE.md`?
- [ ] Does the implementation cover everything in the Gitea issue?
- [ ] Are edge cases handled? (empty state, errors, network disconnect)
- [ ] Are there tests for the new feature?
- [ ] Do existing tests still pass? (`make test` + `cd frontend && npm test`)
- [ ] Does the signal flow work end-to-end? (app → WS → extension → Reaper → back)

**4. Close out:**
- [ ] **Evidence required** — never close an issue without proof:
      - Code changes: attach test output (`make test` / headless test run)
      - UI features: screenshot or video
      - Reaper integration: headless test script output showing the command and verified response
- [ ] Close the Gitea issue
- [ ] Update `docs/UI.md` or `docs/ARCHITECTURE.md` if the implementation diverged from the original design
- [ ] Add to changelog

**Sloppy close prevention — hard rules:**
- Issues MUST NOT be closed based on "code compiles" alone
- Issues MUST NOT be closed based on "I wrote the code, it should work"
- If an issue can't be verified, it stays open. No exceptions.

**Label workflow:** When code is done but not yet verified, tag the issue with `needs-verification`. Once verified by running the app and matching against the UI doc, remove the label and close the issue.

### Assembly Line Pattern — Faster Sub-agents

Instead of one sub-agent doing everything, chain specialized sub-agents.

```
📋 Planner (1-2 min) — optional, for complex features
   Read issue + docs → write brief plan → comment on Gitea
   Sets direction before building starts

👷 Builder (3-5 min)
   Read plan or issue → write code + tests → compile → commit
   Done. No verifying, no closing.
   ⚠️ Write failing tests first (TDD), even if they're simple.
      The Tester will run them later — but they must exist.

   **When stuck / looped back:**
   - Check API/SDK docs (`docs/reaper-sdk/sdk/`) before guessing — wrong
     API usage can look like memory corruption
   - Use `make build-debug` (ASan) to catch buffer overflows early
   - `fprintf(stderr, ...)` for printf debugging
   - See `DEBUGGING.md` for all debugging tools

   **Compilation fails?**
   - Check the FIRST error, not the last — earlier errors cause cascading ones
   - Look for new compiler warnings — they often point to real bugs
   - Check the sysroot (`/tmp/sysroot`) exists if brew GCC complains about missing headers

🔍 Reviewer (2-3 min) — fires after builder
   Read diff → check against AGENTS.md + UI.md + issue
   → approve OR flag issues → comment on Gitea

   **Diff review checklist:**
   - [ ] New compiler warnings? (check build output)
   - [ ] Memory safety (C++): RAII, smart pointers, no raw new/delete?
   - [ ] Error handling: what happens when WS disconnects? Reaper not running?
   - [ ] Edge cases: empty track list, no FX, null pointers?
   - [ ] Tests written? (builder must write tests — Tester just runs them)
   - [ ] Do the tests actually prove the behavior, or just that code ran?
   - [ ] API usage matches SDK docs? (`docs/reaper-sdk/sdk/reaper_plugin_functions.h`)
   - [ ] No I_SELECTED calls? (known crash trigger — use GetSetMediaTrackInfo_String instead)

   **Debugging tools available:**
   - `docs/reaper-sdk/sdk/reaper_plugin_functions.h` — API signatures + docs
   - `make build-debug` — compiles with ASan (catches buffer overflows, use-after-free)
   - `gdb -batch -x /tmp/gdb_script.gdb --args env ...` — catch segfaults
   - `fprintf(stderr, ...)` — printf debugging in extension
   - `DEBUGGING.md` — full reference for all tools

   **When something looks wrong:**
   1. Check API/SDK docs FIRST — wrong function signatures cause crashes
      that look like memory corruption (e.g., GetSetMediaTrackInfo(buffer)
      sets the property, it does NOT read into the buffer)
   2. Check if the error is reproducible without the platform (mock the API)
   3. Check DEBUGGING.md for known crashes and fixes
   4. Only then reach for GDB/ASan/valgrind

   ⚠️ If issues found → loop back to Builder
   ✅ If clean → pass to Tester

📸 Screenshot Verifier (1-2 min) — required before closing UI features
   For any UI feature: launch full stack (Reaper headless + extension + frontend),
   take screenshots via Playwright, then have a vision-capable agent (Kimi K2.6)
   analyze each screenshot against claimed content.

   🎯 **Always spawn with:** `model: "openrouter/moonshotai/kimi-k2.6"`
   (DeepSeek V4 Flash can't do vision. The model override is explicit per-spawn.)
   Rules:
   - Wait for async data to arrive before capturing (wait for WebSocket responses,
     not just wall-clock timeouts)
   - Verify what you *actually* see, not what you expect to see
   - Flag discrepancies immediately — don't paper over them
   - ✅ Only pass if screenshots match claims
   ⚠️ If screenshots show loading states instead of real data → fix timing, retake,
     re-verify. Don't pass broken/incomplete views.

🧪 Tester (3-5 min) — fires after reviewer + screenshot verifier clear
   Run headless tests → C++ tests → frontend tests
   → report results
   ⚠️ If tests fail → loop back to Builder + Reviewer
   ✅ If all green → close issue
```

Testing is conditional — it only runs after the reviewer approves.
If tests fail, the whole build-review loop resets so the builder fixes
with test feedback in hand.

This keeps each sub-agent fast and focused. Chaining is manual
(I spawn the next after the previous completes) to avoid merge conflicts.

### Sub-agent / Autonomous Worker Guidelines

When working as an isolated sub-agent (20-min cron, spawned task):

1. **Start with a plan** — read the issue, read the relevant docs, think about what needs to happen. Comment a brief plan on the issue before writing code.
2. **Read AGENTS.md first** — every time. The project rules may have changed.
2. **Read the relevant docs** — UI.md, ARCHITECTURE.md, the issue itself. Don't code from memory.
3. **Re-read before closing** — don't assume your first read is enough. Check again before you call it done.
4. **Question your test** — does it prove the thing actually works, or just that the code ran? Test the behavior, not the response.
5. **Phase 1 MVP only** — do NOT touch Phase 2, Future, or Process issues. If Phase 1 MVP is complete, exit.
6. **Create issues as needed** — if you discover work that isn't tracked yet, create a new issue and add it to the Phase 1 MVP milestone with proper labels.
7. **No silent failures** — if you're stuck, write to ~/blockers.md and move to the next issue. Don't pretend it's fine.
8. **Evidence or nothing** — don't close issues without proof. "Code compiles" is not proof.

### Getting Unstuck
If you're stuck:
1. **UI/UX design** — `docs/UI.md` for full screen layouts and interaction specs
2. **Reaper API** — `docs/reaper-sdk/sdk/reaper_plugin_functions.h` (every function)
3. **Networking** — `docs/WDL/WDL/jnetlib/` (listen.h, connection.h)
4. **Playtime 2** — `docs/helgobox/playtime-api/src/lib.rs` (Rust API)
5. **ReaLearn** — `docs/helgobox/doc/` for controller integration docs
6. Ask Tamura — they know Reaper's internals better than any doc

### Debugging
- **ASan+UBSan** are baked into debug builds — they catch bugs at runtime automatically.
- **GDB** for manual debugging: `gdb --args ~/reaper-portable/reaper`
- See `DEBUGGING.md` for full pipeline.

---

## 🔧 Tech Stack & Key Decisions

| Layer | Choice | Why |
|-------|--------|-----|
| Extension language | C++17 | Reaper SDK is C, C++ for control surface interface |
| Networking | WDL jnetlib | Zero external dependencies, already in the SDK dep tree |
| WebSocket | Hand-rolled | WebSocket upgrade + framing is simple; no need for a library |
| SHA-1 | Embedded implementation | No OpenSSL dependency needed for handshake |
| Frontend | React + TypeScript + Tailwind v4 | Robust ecosystem, Vite for fast dev |
| Frontend testing | Vitest | Fast, Vite-native, React Testing Library |
| C++ testing | Google Test | Industry standard, CMake FetchContent for auto-download |
| Linting | clang-tidy (C++), ESLint (React) | Catch issues early |
| Build | bash scripts + CMake | bash for daily dev, CMake for tests + cross-compile |
| Communication | JSON over WebSocket | Reamo-compatible protocol |
| Dev platform | Linux first, cross-compile to Windows later | We're on Linux; Windows .dll via MinGW later |
| Task tracking | Gitea issues + tea CLI | Self-hosted, full GitHub-like features, CLI-friendly |
| Code formatting | clang-format (WebKit style) | Consistent C++ without debate |

### Protocol
Messages follow the reamo pattern:
```json
// Request
{"type":"command", "command":"track/getAll", "id":"cmd_1"}
// Response
{"type":"response", "id":"cmd_1", "success":true, "payload":{...}}
// Event (broadcast ~30ms)
{"type":"event", "event":"transport", "payload":{...}}
```

### Current Commands Implemented
- `track/getAll`, `track/getFx`
- `fx/getParams`, `fx/setParam`, `fx/add`, `fx/delete`
- `transport/play`, `transport/stop`

---

## 📝 What Goes Where

| Content | Destination |
|---------|------------|
| Bugs, features, tasks | **Gitea issues** (not markdown) |
| Architecture decisions | **docs/ARCHITECTURE.md** |
| Quick start / how to build | **README.md** |
| Blue-sky ideas | **Gitea issues** with `idea` label |
| Design values / vibe | **AGENTS.md** (this file) |
| Build environment notes | **AGENTS.md** → Build Environment section |
| Daily notes / work log | **memory/YYYY-MM-DD.md** (in workspace) |

IDEAS.md and TODO.md are kept in the repo as legacy references but **ideas and tasks now live in Gitea issues**.

---

## ✅ Build Environment (current state)

- **OS:** Ubuntu 24.04, Linux 6.8.0-52-generic (x64)
- **Compiler:** Brew GCC 15.2.0 (`g++-15`)
- **Node:** v22.22.2
- **Sysroot:** `/tmp/sysroot` (extracted .deb packages, since no system libc6-dev)
- **Reaper:** 7.73 portable at `~/reaper-portable/reaper`
- **Xvfb:** Running on `:99` for headless Reaper testing
- **Gitea:** Running on port 3000
- **Deps installed via brew:** cmake, pkg-config, ALSA, GTK3, Mesa, X11, xorg-server, binutils, clang-tidy

---

## 🔄 Session Startup Checklist

1. [ ] Check if Gitea is running (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`)
2. [ ] List open issues (`tea issues list --repo madhav/reaper-ipad`)
3. [ ] Greet Tamura, let them know what's open
4. [ ] Ask if AGENTS.md needs updates
5. [ ] Pick up from the top-priority open issue

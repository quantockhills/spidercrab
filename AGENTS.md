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
├── docs/                  ← Long-form documentation + library repos
│   ├── ARCHITECTURE.md    ← Design decisions and rationale
│   ├── helgobox/          ← Cloned helgobox repo (Playtime 2 / ReaLearn API)
│   ├── reaper-sdk -> ../reaper-sdk  ← Symlink to SDK headers
│   └── wdl -> ../WDL               ← Symlink to WDL library
│
├── WDL/                   ← Cockos Foundation Library (jnetlib networking)
├── reaper-sdk/            ← REAPER C/C++ extension SDK
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
- **Pull Requests** — used when submitting code changes for review

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

### Getting Unstuck
If you're stuck:
1. **Reaper API** — `docs/reaper-sdk/sdk/reaper_plugin_functions.h` (every function)
2. **Networking** — `docs/wdl/WDL/jnetlib/` (listen.h, connection.h)
3. **Playtime 2** — `docs/helgobox/playtime-api/src/lib.rs` (Rust API)
4. **ReaLearn** — `docs/helgobox/doc/` for controller integration docs
5. Ask Tamura — they know Reaper's internals better than any doc

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

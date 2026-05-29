# ✅ TODO.md — Actionable Items

> Things we're actually working on or planning to build next.
> *Now tracked in Gitea issues instead. See AGENTS.md for workflow.*
> *Kept as legacy reference: all 16 issues migrated to Gitea.*

---

## 🔴 Now — Immediate

- [x] **Fix control surface auto-registration** — Extension loads but doesn't hook into Reaper's Run() loop. Need to create `iPadControlSurface` object and register via `csurf_inst` directly in entry point.
- [x] **Confirm extension works in Reaper** — Launch Reaper with Xvfb, verify WebSocket server starts on port 9224, connect with a test client.

## 🟡 Next — Soon

- [ ] **Write real C++ tests** — SHA-1 handshake verification, WebSocket frame masking/unmasking, JSON command parsing.
- [ ] **Wire up frontend to extension** — Connect the React app to the running WebSocket server, verify end-to-end communication.
- [ ] **Refactor SHA-1 into standalone function** — Extract from `websocket_server.cpp` so it's independently testable.

## 🟢 Future — Eventually

- [ ] **Playtime 2 integration** — Study `playtime-api` Rust crate, figure out how to push samples/FX to clips.
- [ ] **Sample browser** — Enumerate sample directories, browse files from iPad, load to tracks.
- [ ] **FX chain save/load** — Persist FX chains, push to selected tracks.
- [ ] **Real-time param control UI** — Touch sliders on iPad that control FX params in real time.
- [ ] **Windows cross-compile** — Set up MinGW cross-compilation from Linux.
- [ ] **Clip launching from iPad** — Trigger Playtime 2 clips remotely.
- [ ] **MIDI synth param control** — Live synth parameter tweaking from iPad.

---

## ✅ Done

- [x] Named AI Utpaladeva, set up IDENTITY.md + USER.md
- [x] Research phase: Reaper SDK, WDL, reamo, reaper-bridge
- [x] Dev environment: brew gcc, cmake, ALSA, Mesa, X11, Xvfb
- [x] Reaper 7.73 portable installed at `~/reaper-portable/`
- [x] C++ extension: WebSocket server + command handler + entry point
- [x] React frontend scaffolded (Vite + TypeScript + Tailwind + Vitest)
- [x] 9 frontend tests passing (WsClient)
- [x] C++ extension compiles and loads (ReaperPluginEntry resolves)
- [x] Google Test integrated — 84 C++ tests passing
- [x] Git repo initialized, 2 commits
- [x] Root README.md with build/test/deploy instructions
- [x] clang-format + clang-tidy linting
- [x] Makefile for all common tasks
- [x] Gateway running, Telegram paired
- [x] **Control surface auto-registration verified** — Extension creates `iPadControlSurface` and registers via `csurf_inst` in `REAPER_PLUGIN_ENTRYPOINT`
- [x] **Headless Reaper test passed** — WebSocket server starts on port 9224, responds to `transport/getState`, `transport/play`, `transport/stop`, `track/getAll`, `fx/enumerate`
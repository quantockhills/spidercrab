# 🧠 IDEAS.md — Brain Dump

> Captured as they come. Nothing gets lost.
> *Nonlinear ideas, future features, half-baked thoughts, workflow improvements.*

*Note: New ideas now go to **Gitea issues** with the `idea` label.
This file is kept as a legacy reference. See AGENTS.md for workflow.*
---

---

## 🚀 Vision

A **sample + FX browser/manager** iPad app for controlling REAPER during live sets.
Browse and push samples, FX chains, and presets to tracks — tweak parameters in real-time from a touch-friendly PWA, all over WiFi.

---

## ⭐ Feature Ideas

### Phase 1 (MVP)
- [ ] Browse samples on iPad → push to selected tracks
- [ ] Browse FX → add to selected tracks
- [ ] FX chains: save/load/push to tracks
- [ ] Push samples/FX to **Playtime 2** clips (Ableton-like session view)
- [ ] Real-time FX parameter tweaking from iPad (touch sliders reflect in Reaper live)
- [ ] Remove FX from tracks

### Phase 2 (Future)
- [ ] Clip launching from the iPad
- [ ] Session view clip matrix in the app
- [ ] Real-time MIDI synth param control (play live synth, tweak params on iPad)
- [ ] Sexy/elegant GUI (touch-friendly, dark theme)

---

## 💡 Workflow / Process Ideas

*Note: These are now tracked in Gitea issues. See AGENTS.md for workflow.*
---


### Sub-agents for parallel work
Spawn isolated OpenClaw agents to work on separable tasks simultaneously.
E.g.: one sub-agent writes C++ tests while another refactors the WebSocket server.
Coordinator agent (me) reviews and merges results.

### Git worktrees
Check out multiple branches simultaneously in separate directories.
Work on different features without switching branches:
```bash
git worktree add ../reaper-ipad-fx feature/fx-browser
git worktree add ../reaper-ipad-playtime feature/playtime
```

### Git-based task tracking
Use markdown files (TODO.md, IDEAS.md) in-repo instead of GitHub Issues.
Version-controlled, always in sync, works offline. Keep IDEAS.md for blue-sky
thoughts, TODO.md for actionable items.

---

## 🎨 Design Values
- **Modular architecture** — clean separation, each piece testable in isolation
- **Test-driven development** from day 1
- **Debugging pipeline built in** — GDB, ASan, React DevTools, iPad Web Inspector
- If something breaks, you know if it's in the extension or the frontend

---

## 🧩 Identity & Vibe
- **Name:** Utpaladeva (named after Tamura's favorite philosopher)
- **Vibe:** Justin Frankel — build lean, build powerful, get out of the way
- Low ceremony, high signal. Ships practical music tools

---

## 🤝 Work Style
- **Nonlinear** — ideas come as they come, not in order
- Casually add features/asides mid-conversation, don't expect linear progression
- **Nothing gets lost** — capture everything, organize later
- We build projects together — collaborative, not "assign and wait"

---

## 🔧 Tech Decisions
- Linux dev first → cross-compile for Windows later
- C++ for Reaper extension (native SDK)
- React + TypeScript + Tailwind for frontend
- Vitest for frontend testing
- Google Test for C++ testing
- Minimal external deps — hand-rolled WebSocket server (WDL jnetlib)
- Embed SHA-1 for WebSocket handshake (no OpenSSL dependency)
- `WsClient.WebSocketFactory` seam for test mocking

---

## 🏗️ Build Environment
- Brew gcc 15.2.0 as C++ compiler
- Custom sysroot at `/tmp/sysroot` (no system libc6-dev)
- WDL jnetlib for networking
- ALSA + GTK3 + Mesa + X11 via brew (Reaper runtime deps)
- Reaper 7.73 portable at `~/reaper-portable`
- Xvfb running for headless Reaper testing

# Project Ideas & Brain Dump

> Captured as they come. Nothing gets lost.

## Core Project: Reaper iPad Remote

A sample + FX browser/manager + controller iPad app for live music with Reaper.

### Architecture
- **C++ extension** (Reaper SDK) running on Windows 11 laptop — hosts samples, FX, FX chains
- **React PWA** on iPad — browser/controller surface
- **WebSocket** over WiFi/LAN — iPad talks to extension
- Later cross-compile from Linux dev → Windows target

### MVP Features (Phase 1)
- [ ] Browse samples on iPad → push to selected tracks in Reaper
- [ ] Browse FX → add to selected tracks
- [ ] FX chains: save/load/push to tracks
- [ ] Push samples/FX to **Playtime 2** clips (Ableton-like session view)
- [ ] Real-time FX parameter tweaking from iPad (sliders that reflect in Reaper live)
- [ ] Remove FX from tracks

### Future Features
- [ ] Clip launching from the iPad
- [ ] Session view clip matrix in the app
- [ ] Real-time MIDI synth param control (play live w/ synth, tweak params on iPad)
- [ ] Sexy/elegant GUI (touch-friendly, dark theme)

### Design Values
- **Modular architecture** — clean separation, each piece testable in isolation
- **Test-driven development** from day 1
- **Debugging pipeline built in** — GDB, ASan, React DevTools, iPad Web Inspector
- If something breaks, you know if it's in the extension or the frontend

### Feedback on Naming / Identity
- Name: **Utpaladeva** (named after Tamura's favorite philosopher)
- Vibe: **Justin Frankel** — build lean, build powerful, get out of the way
- Low ceremony, high signal. Ships practical music tools

### Notes on Work Style
- **Nonlinear** — ideas come as they come, not in order
- Casually add features/asides mid-conversation, don't expect linear progression
- **Nothing gets lost** — capture everything, organize later
- We build projects together — collaborative, not "assign and wait"

## Tech Decisions
- Linux dev first → cross-compile for Windows later
- C++ for Reaper extension (native SDK)
- React + TypeScript + Tailwind for frontend
- Vitest for frontend testing
- Minimal external deps — hand-rolled WebSocket server in C++ (WDL jnetlib)
- Embed SHA-1 for WebSocket handshake (no OpenSSL dependency)
- `WsClient.WebSocketFactory` seam for test mocking

## Build Environment (current state)
- Brew gcc 15.2.0 as C++ compiler
- Custom sysroot at `/tmp/sysroot` (since no system libc6-dev)
- WDL jnetlib for networking
- ALSA + GTK3 + Mesa + X11 libs installed via brew for Reaper runtime
- Reaper 7.73 portable at `~/reaper-portable`
- Reaper binary loads — need Xvfb or display for full GUI test

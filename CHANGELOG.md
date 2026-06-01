
## Phase 1 MVP — 2026-05-30

### Features
- **Real-time remote control** — all state changes push via CSURF_EXT callbacks (no polling):
  - Mute/solo/arm updates
  - FX param changes (real-time slider updates)
  - Transport state (play/stop)
  - FX list changes (add/delete/reorder)
  - FX bypass/enable toggle
  - FX preset changes
- **Track management** — view all tracks with mute/solo/arm buttons
- **FX browser** — search and add FX plugins to tracks
- **FX parameter control** — sliders for all adjustable parameters
- **FX grid layout** — clickable card grid on TrackOverview
- **Built-in HTTP server** — serves the React frontend directly from the extension
- **Full-stack E2E** — Playwright tests verify GUI ↔ Reaper roundtrip
- **Design system** — Everforest pastel palette + Inter font + square corners
- **Zero dependencies** — WebSocket + HTTP server built on WDL jnetlib, no external libraries

### Infrastructure
- 134 C++ unit tests (Google Test) + 65 frontend tests (Vitest)
- ASan+UBSan debug builds for memory safety
- Headless Reaper testing with Xvfb
- Gitea-based issue tracking with autonomous CI pipeline

### Known Issues (Phase 2)
- Track names show "Track N" (no real names yet)
- Several secondary controls below 44px touch target minimum
- Reaper headless startup can be unstable

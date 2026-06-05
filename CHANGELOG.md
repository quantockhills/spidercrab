
## Media Browser enhancements — 2026-06-05

### Features
- **Sample directory management** — manage multiple sample directories via Settings (Issue #101):
  - Settings tab shows a list of configured sample directories
  - Add directories via text input (+ Add Directory button)
  - Remove directories via ✕ button
  - All changes persist to localStorage
  - Old single-path setting auto-migrates to multi-path format
- **Multi-root Media Browser** — browse any configured root directory (Issue #101):
  - Root selector at the top level shows all configured directories
  - Tap a root to browse its contents
  - "← Roots" button returns to root selector
  - ".." at root level also returns to root selector
- **Cross-root search** — search across ALL configured directories simultaneously (Issue #101):
  - Type a search query at the root selector level
  - Results are fetched from all roots and displayed grouped by root
  - Individual root failure is handled gracefully (shows error for that root, results for others)
  - Clearing search returns to the root selector view

## Phase 1 MVP — 2026-05-30

### Features
- **Track record mode toggle** — toggle armed tracks between audio/MIDI recording mode (Issue #99):
  - New `track/setRecordMode` command sets both I_RECMODE and I_RECINPUT
  - `track/getAll` now includes `recMode` and `recInput` fields
  - Frontend toggle button ('A'/'M') appears only on armed tracks
  - 7 C++ unit tests + 4 frontend tests + Playwright screenshot verification
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
- **macOS (dylib) build target** — `TARGET=macos bash extension/build.sh` produces `reaper_spidercrab.dylib`
  - Native macOS via Xcode CLT (`xcrun clang++`)
  - Cross-compile via osxcross on Linux
  - Ad-hoc codesigning for SIP compatibility
  - Cocoa + Carbon frameworks linked for SWELL

### Known Issues (Phase 2)
- Track names show "Track N" (no real names yet)
- Several secondary controls below 44px touch target minimum
- Reaper headless startup can be unstable

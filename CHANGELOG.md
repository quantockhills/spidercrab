
## v0.5.1-beta — 2026-07-29

### Highlights
- **macOS installer** — `SpidercrabInstaller.pkg` mirrors the Windows `.exe`: copies the plugin + web UI into `UserPlugins`, clears Gatekeeper's quarantine flag, and warns (without hard-blocking) if REAPER is still running.
- **Both installers auto-register the Clip Launcher's OSC device** — adds the `spidercrab` device straight into ReaLearn's own OSC device list (`Helgoboss/ReaLearn/osc.json`), so the only manual step left is picking it from ReaLearn's Input/Output dropdowns once.
- **Sample region trim, reverse-region playback, and loop** — the Media tab's waveform now has always-present L/R trim handles; Reverse renders real reversed audio (previously a no-op UI flag) and can be combined with a trimmed region; a Loop toggle repeats preview playback.

### Features
- **Browser tab favicon** — uses the spider-crab illustration from the README instead of the generic app icon.
- **UI Size setting** — Settings gets a 85%–140% scale control for Safari/iPad, which has no `ctrl +/-` zoom shortcut.

### Fixes
- **Row-level ▶ play button in the Media tab** — was calling the same handler as tapping the rest of the card (open/close the preview panel) instead of actually starting playback.
- **FX chain deletion could absorb the FX before it** — deleting a chain's first (or only) member shifted the chain's tracked index range onto whatever FX sat before it, silently folding an unrelated effect into the chain box. Root cause was an off-by-one in how chain index ranges were adjusted on delete vs. insert.
- **Session grid column headers using the wrong track index** — the Helgobox/ReaLearn/Playtime control track sits in the track list but isn't itself a matrix column, so column-header actions (arm, record mode, navigate to track) could operate on the wrong track.
- **Stale FX gesture docs** — docs described tap-to-bypass/hold-to-delete; actual behavior is double-tap-to-bypass, hold-then-tap-again-to-confirm-delete, with params opened via a separate corner arrow. Also documents the FX chain browser's pagination/tabs, the Remove FX button, and the Media tab's region/loop controls.

### Privacy / repo hygiene
- Removed `fx_tags.json` (personal FX tag data that had been accidentally committed to the repo root) and added it to `.gitignore` alongside its siblings.

## v0.3.0-alpha — 2026-06-11

### Highlights
- **Codebase refactor** — `command_handler.cpp` split into domain-specific handler files (`track_handlers.cpp`, `fx_handlers.cpp`, `sample_handlers.cpp`, `matrix_handlers.cpp`, `playtime_handlers.cpp`, `transport_handlers.cpp`, `settings_handlers.cpp`, `fxchain_handlers.cpp`)
- **Crash fixes** — resolved FX un-bypass crash (dereferencing `CSURF_EXT_SETFXENABLED` parm3), exit crash dump (double teardown guard), rewritten handler bugs
- **MiniBPM restored** — tempo detection via `breakfastquay::MiniBPM` properly ported to refactored structure
- **All handler functions restored** from working originals (replaced buggy auto-rewritten implementations)

### Features
- **Two-up sample cards** — sample browser now shows 2-column grid layout
- **Configurable tab bar position** — move tab bar to top or bottom
- **Delete Playtime clips** — long-press a clip in the session grid to delete it
- **Media browser UX cleanup** — remembers last browsed directory, side-by-side grid + preview layout, less chrome
- **FX card double-tap bypass** — double-tap on FX card toggles bypass with live param value display in drawer

### Fixes
- **Crash on FX un-bypass** — removed invalid `parm3` dereference in `CSURF_EXT_SETFXENABLED` handler (Issue #121)
- **Exit crash dump** — guarded against double teardown when both `CloseNoReset()` and entry-point unload run cleanup
- **MiniBPM tempo detection** — restored proper `breakfastquay::MiniBPM` integration for sample-to-slot import (was stubbed to 0 in refactor)
- **Handler function restoration** — all 52 rewritten handler functions replaced with working originals from master (fixes BPM detection, sample directory, clamp macros, and more)
- **Scrollbar on Settings page** — overflow content no longer hidden
- **Window build compatibility** — `std::max` wrapped in parens for MSVC
- **Missing source files** — `sample_tags.cpp`, `MiniBpm.cpp` added to build.sh

### Infrastructure
- **Codebase refactor** — `command_handler.cpp` slimmed from ~3000 lines to 515 lines; domain logic extracted into 8 handler files
- **Updated docs** — README screenshots at proper iPad Air M3 resolution, ARCHITECTURE.md with Playtime/OSC/sample cache, UI.md rewritten for 5-tab app
- **Removed stale tracked artifacts** from git history

## v0.2.5-alpha — 2026-06-10

### Features
- **Persistent frontend sample cache** — background scans sample directories and caches results per-folder with progress bar (Issue #107):
  - `SampleCache` class indexes files on disk, persists to localStorage
  - Iterative loading shows progress per directory
  - Cache survives page refreshes
- **Sample tags** — tag samples with custom labels, persist across sessions (Issue #108)
- **Playtime launch button** — button in Settings to launch Playtime 2 from the frontend
- **System track sort** — tracks sorted by system track index, not display order
- **MiniBPM tempo matching** — automatically detects BPM of samples on insert to Playtime slot (Issue #108)
- **Clip names on Playtime grid** — clip names shown prominently in SessionView cells (Issue #109)
- **Track controls on Playtime columns** — arm/mute/solo/record-mode per column header (Issue #110)
- **Go to track nav** — navigate from Playtime column to Track view (Issue #111)

### Fixes
- **Sample browser timeouts** — fixed pagination and directory listing timeouts for large sample dirs
- **Snap clips to bars** — inserted clips now snap to bar boundaries
- **Untrack dev/AI-only files** — workspace config files properly gitignored
- **C++ test suite**: 307/307 tests passing
- **Frontend test suite**: 388/388 tests passing

---

## v0.2.4-alpha — 2026-06-07

### Features
- **Inline FX search** — long-press on the FX area of a track card to open an inline search bar (Issue #102):
  - Long-press (500ms) on Add FX button triggers inline search
  - Search filters installed plugins by name with 300ms debounce
  - Tap result to add FX directly to the track
  - Backdrop/tap-outside-to-close behavior
  - FX chain cycler removed from FxGrid (dead code)
- **FX chain index cache** — build in-memory index of all .RfxChain files on startup (Issue #103):
  - `FxChainCache` class scans once, caches results
  - `fxchain/searchRecursive` uses cache (zero filesystem IO)
  - Auto-caches on `SetConfigDir` change
  - Paginated results (16/page)
  - Refresh Cache button in Settings
- **Inline FX search + FX chains** — inline search now also finds and loads FX chains (Issue #105)
- **Tap to bypass FX, long-press to remove** — tap toggles bypass on track cards, long-press (500ms) shows delete confirmation (Issue #104)
- **macOS (dylib) build target** — extension compiles as `reaper_spidercrab.dylib` (Issue #100)
- **Windows cross-compilation** — build Windows DLL from Linux using xwin + clang-cl (Issue #72)
- **OSC over UDP** — replace MIDI polling with OSC for ReaLearn two-way sync (Issue #98):
  - OSC sender + receiver implementation
  - Slot trigger, scene trigger, record slot message formats
  - Integration tests for send/receive round-trip

### Fixes
- **Restored 18 C++ tests** — merge regression left MakeMockHandler missing 10 API function pointer assignments (FxReorder, FxPreset, SequencerConvert)
- **Fixed fxChainSearchCached destructure** — missing hook destructure in App.tsx caused ReferenceError on chain search (Issue #105)
- **Host-side audio preview** — replace sample/getAudioData with sample/getAudioInfo + sample/preview + sample/stopPreview (Issue #106):
  - Waveform from downsampled peaks (~2000 points, a few KB)
  - Playback through REAPER host audio (PCM_Source_CreateFromFile + PlayPreview/StopPreview)
  - No more 5MB base64 limit — works with 60MB+ WAV files
  - Canvas CSS var() rendering fixed with getComputedStyle
- **C++ test suite**: 307/307 tests passing
- **Frontend test suite**: 388/388 tests passing
- **Fixed I_RECINPUT** — record mode toggle now sets I_RECINPUT alongside I_RECMODE (Issue #99)
- **ESLint**: Clean
- **make lint + make check**: Clean

---

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

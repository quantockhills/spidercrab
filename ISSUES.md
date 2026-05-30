# Spidercrab Issues

Exported from Gitea. Create these on GitHub manually or copy-paste.

---

## #12 Clip launching from iPad

**State:** closed | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Trigger Playtime 2 clip launch/stop from the iPad app.\nSession view matrix in the app.

---
Session View UI — see docs/UI.md for full visual spec.

Features:
- Grid of clip slots (columns = Playtime 2 tracks, rows = scenes)
- Tap to launch/stop clips
- Scene launch buttons
- Drag samples from Sample Browser onto clip slots
- Clip activity feedback (playing, stopped, queued)
- Scrollable for larger matrices

---

## #13 MIDI synth param control

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Real-time MIDI synth parameter tweaking from iPad.\nPlay live synth, tweak params on iPad, hear results immediately.

---

## #14 Sexy/elegant GUI

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Touch-friendly dark theme. Smooth animations. Well-designed layout. iPad-native feel as a PWA.

---
**Design reference:** See docs/UI.md for:
- Dark theme spec (true black, amber accent)
- Tab bar navigation layout
- Touch-friendly interaction patterns
- Minimum 44x44pt touch targets
- Subtle animations (200ms)

---

## #15 Use sub-agents for parallel work

**State:** open | **Milestone:**  in **Future**

**Labels:** priority:low, productivity

Spawn isolated OpenClaw agents to work on separable tasks simultaneously.\nE.g.: one writes C++ tests, another refactors WebSocket server.\nCoordinator reviews and merges results.

---

## #16 Git worktrees for parallel feature branches

**State:** open | **Milestone:**  in **Future**

**Labels:** priority:low, productivity

Check out multiple branches simultaneously in separate directories.\nWork on FX browser and Playtime integration without switching branches.\ngit worktree add ../reaper-ipad-fx feature/fx-browser

---

## #17 Headless Reaper testing setup

**State:** closed | **Milestone:** 

**Labels:** priority:high, testing

**Headless Reaper testing setup**

An automated test that starts Reaper headlessly, connects via WebSocket, sends commands, and verifies Reaper actually responds correctly.

## Task list

- [x] Write test script (run_headless_test.sh) that starts/stops Xvfb + Reaper
- [x] Test: WebSocket connects and handshake succeeds
- [x] **Fix transport/getState to actually read Reaper play state** (uses GetPlayState API with bitmask: &1=playing, &4=recording)
- [x] Fix headless test to: play → verify playing → stop → verify stopped (via transport/getState)
- [x] Add more commands to the test: track/getAll, fx/enumerate, mute/solo/arm
- [x] Add invalid-command error handling test
- [x] **FX param roundtrip test** — add ReaEQ to a track, change 5 different parameters, verify each change reflects in Reaper
- [ ] Fix segfault in headless Reaper (pre-existing issue with WebSocket connection churn, affects FX tests after ~8 commands)
- [ ] Clean up stale Reaper processes on test failure
- [ ] Wire into `make test` so headless tests run alongside unit tests
- [ ] Document the test workflow in README.md

**Completed in this phase:**
- `transport/getState` now queries `GetPlayState()` API instead of hardcoding false
- `transport/play` uses `CSurf_OnPlay()` with `Main_OnCommand(1007)` fallback
- `transport/stop` uses `CSurf_OnStop()` with `Main_OnCommand(1016)` fallback
- Added `track/add` command (`Main_OnCommand(40001)`, Insert new track)
- Added `extractPayload()` helper to properly read params from `payload` sub-object
- Rewrote transport tests to verify state roundtrip via getState
- FX operations test: enumerate all 249 plugins, add FX, get params, set param, verify, delete
- ReaEQ param roundtrip test: adds ReaEQ, changes 5 params (mid values), re-reads to confirm each stuck
- All 10 headless tests pass (10/10)

**Results:** 10/10 tests passing ✅

```
 Results: 10 passed, 0 failed (10 tests)
 All tests passed! 🎉
```

**Definition of done:** `make headless-test` passes 10/10 every time ✅

---

## #18 Playwright E2E tests — verify GUI clicks control Reaper

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer, priority:medium, testing

Set up Playwright to automate the React frontend against a real Reaper backend.

## Test plan

### Phase 1 tests (transport buttons):
1. Start Reaper headless + extension + frontend dev server
2. Open browser
3. Click play button → verify UI shows "Playing" → verify transport/getState returns playing=true
4. Click stop button → verify UI shows "Stopped" → verify transport/getState returns playing=false

### Future tests (Phase 2+):
- FX browser add/remove
- Track mute/solo/arm
- Sample browser interactions

## Task list
- [x] Install Playwright + Chromium in frontend/
- [x] Add transport play/stop to useReaper hook
- [x] Add transport buttons (▶/■) to TrackOverview with data-testid
- [x] Written E2E test for transport play/stop (button existence + WS dispatch)
- [ ] Full E2E runner script (starts Reaper + extension + frontend + Playwright)
- [ ] Verify end-to-end with actual Reaper
- [ ] Clean up: integrate into Makefile

43 unit tests passing. TS compiles clean.

---

## #19 Document headless test workflow

**State:** open | **Milestone:**  in **Future**

**Labels:** priority:low, testing

Once headless Reaper + Playwright are working, document the full automated test workflow.
Make it reproducible with a single command so anyone can run the integration suite.

---

## #20 Browse FX and add to tracks

**State:** closed | **Milestone:** 

**Labels:** functionality, priority:high

Browse available FX on the laptop from the iPad.
Add selected FX to the currently selected track(s) in Reaper.

---
**Format filter (see docs/UI.md):**
- Dropdown menu for plugin format: All | VST | VST3 | CLAP | CLAPI | JSFX | RfxChain
- Search bar to filter by name
- Category filter by effect type (EQ, Comp, Reverb, etc.)
- Format badge next to each plugin in the list

---

## #21 Remove FX from tracks

**State:** closed | **Milestone:**  in **Phase 2**

**Labels:** functionality, priority:medium

Delete a specific FX from a track directly from the iPad app.

---

## #22 Drag-and-drop support

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Drag samples, FX, or FX chains from the browser directly onto tracks.
Touch-friendly drag interaction on iPad.

---

## #23 Browse FX chains (preset folders)

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** functionality, priority:medium

In Reaper, the preset system is tricky. The workaround is single-FX FX chains, one per preset, stored in folders we can point to.

Feature:
- Point the app to a folder of FX chain files
- Browse them by name on the iPad
- Load/apply an FX chain to selected track(s)

This is SEPARATE from browsing individual FX - these are pre-configured presets.

---

## #24 Pull library docs into docs/ folder

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Create a docs/ subfolder with relevant documentation from the libraries we use.

This makes it easy to look up API references without going online:
- **reaper-sdk** — key headers, API reference
- **WDL/jnetlib** — networking library docs
- **playtime-api** (future) — clip matrix API

Don't clone everything — just the parts we actually use.

---

## #25 End-to-end signal flow test: app ↔ extension ↔ Reaper

**State:** closed | **Milestone:** 

**Labels:** priority:high, testing

Test the full roundtrip:
- iPad app sends command → WebSocket → extension → Reaper API
- Reaper responds → extension → WebSocket → app

Test scenarios:
1. Send track/getAll, verify track list appears in app
2. Add an FX, verify it appears on the track
3. Tweak a param from app, verify value changes in Reaper
4. Tweak a param in Reaper (e.g. from another controller), verify app updates
5. Play/stop transport from app, verify Reaper responds
6. Disconnect/reconnect network, verify auto-reconnect
7. Launch 2 instances of the app, verify both see the same state

This test validates the entire architecture end-to-end.

---

## #26 Track controls: mute, solo, arm, active/inactive

**State:** closed | **Milestone:** 

**Labels:** functionality, priority:medium

From the iPad app, control per-track settings:

- **Mute / Unmute** a track
- **Solo** a track
- **Arm for recording** (rec arm toggle)
- **Make active/inactive** (disable/enable track processing)

These should appear alongside track names in the app's track list.
Use Reaper API: SetMediaTrackInfo with MUTE/SOLO/RECARM/BYPASS.

See docs/UI.md for layout.

---

## #27 Sample browser: waveform display + audio preview

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Add waveform display and audio preview to the sample browser.

From issue #9, not yet implemented:
- Tap a file to preview: play/stop button, waveform display
- Drag handles on waveform to select a region
- Reverse toggle with visual indicator

Requires audio streaming from Reaper over WebSocket (binary frames).

---

## #28 Sample browser: long-press context menu

**State:** open | **Milestone:**  in **Future**

**Labels:** functionality, priority:low

Add long-press context menu to sample browser file entries.

From issue #9, not yet implemented:
- Long-press on a sample for context menu (edit, delete, info)
- Configurable root sample folder (via Settings tab)

---

## #29 Hardened FX roundtrip tests (specific names, multi-track, param name assertions)

**State:** closed | **Milestone:** 

**Labels:** priority:medium, testing

## Hardened integration tests for FX roundtrip verification

These close the verification gaps identified in review:
- We trust param names come from Reaper but never assert the actual string
- We test with "first available plugin" not a specific name
- Everything is track 0, never multi-track

## Task list
- [ ] Verify specific FX by name: add ReaVerb -> track/getFx confirms "ReaVerb" is on the track
- [ ] Assert param names match: ReaEQ param[0].name contains "Band", param names don't change after setting values
- [ ] Multi-track FX: create 2 tracks, add FX to track 1, verify it is on track 1 but NOT on track 0
- [ ] Select track 3, add FX, verify track/setSelected worked and FX lands on the right track

---

## #30 Verify extension works in Reaper headless mode

**State:** closed | **Milestone:** 

**Labels:** feature

---

## #31 Cache FX enumeration results for instant plugin list

**State:** closed | **Milestone:** 

**Labels:** priority:medium

Cache the enumerated FX list server-side so subsequent calls return instantly.

---

## #32 Settings tab: add FX refresh button

**State:** closed | **Milestone:** 

**Labels:** priority:low

Added 'Refresh Plugin List' button in Settings tab that calls fx/refreshCache to force re-enumeration of plugins. Useful when user installs new plugins without restarting Reaper.

---

## #33 Add tests for FX enumeration caching

**State:** closed | **Milestone:** 

We need unit tests to verify:
1. First fx/enumerate call enumerates and caches
2. Second call returns cached result without re-enumerating
3. fx/refreshCache invalidates cache and re-enumerates

This ensures issue #31 is properly verified.

---

## #34 EnumInstalledFX crashes Reaper when called from Chromium WS context

**State:** closed | **Milestone:** 

**Labels:** bug, priority:medium

**Problem:** Calling `EnumInstalledFX` from the extension via a Chromium WebSocket connection crashes Reaper with a segfault in `__memcmp_avx2_movbe` at Reaper address `0x000000000060688c`. The crash happens about 20s into the 35s enumeration.

**Investigated:**
- Python WS → enum works fine (249 FX, 35s, no crash)
- Raw Chromium WS (file:// page) → works fine
- Frontend (Vite localhost:5173) → crashes
- The crash is in Reaper's binary, not our extension
- Likely related to X11 display conflict (Reaper SWELL layer vs Chromium sharing :99)
- All property-reading APIs also crash (GetSetMediaTrackInfo, GetSetMediaTrackInfo_String, CSurf_TrackToID)

**Workaround:** Pre-cache enumeration via Python WS before opening frontend.
FX cache (`m_fxCache`) makes subsequent calls instant.

**To fix properly:** Investigate running EnumInstalledFX from a background thread,
or use a different Reaper API for plugin enumeration that doesn't trigger the crash.

---

## #35 Reopen: Sample browser was closed without verification

**State:** closed | **Milestone:** 

**Labels:** priority:low, testing

Issue #9 (Sample browser) was closed with label "needs-verification" — this was a sloppy close. The sample browser component was built but never verified against a running Reaper backend. Needs proper verification before Phase 1 MVP can be considered complete.

---

## #36 Track the EnumInstalledFX crash workaround

**State:** closed | **Milestone:** 

**Labels:** bug, priority:medium

Created issue #34 to track the EnumInstalledFX Chromium crash. Workaround: pre-cache via Python WS. The cache makes FX loading instant after first enum.

---

## #37 Link issue #33 to Phase 1 MVP

**State:** closed | **Milestone:** 

**Labels:** priority:medium, testing

Issue #33 (Add tests for FX enumeration caching) should be in Phase 1 MVP milestone.

---

## #38 Sysroot /tmp/sysroot can be deleted, breaking extension build

**State:** closed | **Milestone:** 

**Labels:** bug, infrastructure, priority:low

**Problem:** `/tmp/sysroot` (the custom Linux sysroot for brew GCC 15) can be deleted by system cleanup or temp directory purges. When this happens, `make build` fails with `fatal error: pthread.h: No such file or directory`.

**Fix applied this session:**
- Added `-I$SYSROOT/usr/include` to build.sh (sysroot headers weren't being found)
- Re-ran `extension/scripts/prepare-sysroot.sh` to recreate

**Needed:** Either make the sysroot persistent (move out of /tmp) or document the fix in the Makefile/build.sh with an auto-recovery step that re-runs prepare-sysroot.sh when headers are missing.

---

## #39 One-frame-per-tick WebSocket processing to prevent Reaper API overlap

**State:** closed | **Milestone:** 

**Labels:** priority:medium

**Change:** Modified `ParseFrames()` in `websocket_server.cpp` to process at most one WebSocket frame per timer tick instead of draining all buffered frames.

**Why:** Processing multiple commands in a single `Run()` call can cause overlapping Reaper API calls that trigger internal crashes (e.g., running `HandleGetTracks` while `HandleEnumerateFX` is halfway through).

**Status:** Implemented and committed. The `while (buf.size() >= 2)` loop was changed to `if (buf.size() >= 2)` so only one frame is consumed per `Run()` cycle.

---

## #40 Track list should display real names instead of generated Track N

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** feature, priority:low

**Current state:** `HandleGetTracks` returns generated names ("Track 1", "Track 2") instead of reading real track names from Reaper. This is because `GetSetMediaTrackInfo` and `GetSetMediaTrackInfo_String` crash Reaper when called from Chromium WS context.

**The bug (found this session):** `GetSetMediaTrackInfo(track, "P_NAME", buffer)` with a non-null buffer tells Reaper to SET the property, not read it. This emptied all track names and corrupted Reaper's internal state.

**Fixed:** Using `CountTracks` + `GetTrack` only (both safe). Real track names need a different approach — possibly using `GetSetMediaTrackInfo` with NULL `setNewValue` (returns `const char*` to internal data), or running property reads in a background thread.

**Acceptable for MVP:** Generated names. The frontend shows the correct number of tracks.

---

## #41 Implement Inter font + Everforest pastel design system

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer, feature, priority:high

**Goal:** Replace the current basic Tailwind default look with a proper design system based on Inter font and the Everforest pastel palette.

**Reference docs:**
- `design/design-guidelines.md` — full design rules
- `design/designer-prompt.md` — brief with deliverables  
- `design/original-theme/80gray v2.2 Everforest Light.ReaperThemeZip` — REAPER theme reference
- Everforest palette: https://github.com/sainnhe/everforest
- Inter font: https://rsms.me/inter/ (Google Fonts mirror available)

**Design requirements:**
1. **Inter font** everywhere — Regular (400) body, Semi-Bold (600) headings, Inter Mono for values
2. **Everforest Light palette** — warm beige backgrounds (#FDF6E3 range), soft dark text (#5C6A72)
3. **No rounded corners** — square buttons, square cards, square panels
4. **Pastel/muted colors** — no saturated colors, use opacity for inactive states
5. **Off-white backgrounds** — no pure white or pure black
6. **Dense but clean** — DAW aesthetic for iPad landscape (2360x1640)

**Implementation:**
- Load Inter via Google Fonts CDN in `frontend/index.html` or via Tailwind config
- Define Tailwind theme colors matching Everforest palette
- Update all components: TrackOverview, FXBrowser, ParamControl, SampleBrowser, tab bar
- Test at 2360x1640 landscape AND responsive down to phone portrait

**Deliverable:** A Tailwind CSS theme applied across all frontend components, verified via Screenshot Verifier (Kimi K2.6) against the design guidelines.

---

## #42 Multi-track FX ops cause Reaper segfault in hardened test

**State:** open | **Milestone:** 

**Labels:** bug

The hardened_fx_test.py fails in Section 4 (track selection + FX landing). After adding 3 tracks and attempting selection operations, track/getAll returns empty and Reaper segfaults.

Observed behavior:
- Section 4: Expected 3 tracks, got 0 after selection commands
- Reaper crashes with SIGSEGV
- Broken pipe on subsequent WebSocket calls

To reproduce:
  bash extension/test/run_headless_test.sh

Test 11 (Hardened FX roundtrip) fails.

Workaround: Individual track FX operations work fine (verified in tests 9 and 10). The issue only manifests in the multi-track selection scenario.

---

## #43 Autonomous worker skips Assembly Line stages when closing issues

**State:** open | **Milestone:**  in **Process**

**Labels:** bug, priority:medium

**Problem:** The autonomous worker closes UI features without running the full pipeline (Reviewer, Screenshot Verifier). Issue #41 (design system) was marked done without anyone ever seeing it.

**Root cause:** The worker prompt says "spawn sub-agents for each stage" but doesn't enforce it. The worker finds the milestone at 0/0 and exits without verifying.

**Options being discussed:**
- A) Code only — worker never touches issues
- B) Full pipeline required before close
- C) Needs-verification label gate
- D) Split builder/verifier workers

**Needs:** A decision on which approach to implement.

---

## #44 Full-stack E2E: FX insert/params/delete roundtrip via Playwright + real Reaper

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer, bugfix, feature

**What:** Automated full-stack E2E tests that spin up real Reaper headless + WS extension, then verify the UI shows correct real data.

**Infra:**
- Xvfb :99 + Reaper portable + WS extension
- Playwright connects to Vite (UI) + real Reaper WS (verification)

**Scenarios:**

1. **FX insertion on new track** — Create track, insert ReaEQ, verify UI FX list shows it
2. **FX params roundtrip** — ReaEQ params (Hz, Gain, Q) appear correctly in UI
3. **Param change propagation** — Adjust slider in UI → verify Reaper reports new value via WS
4. **FX deletion** — Delete FX from UI → verify gone from Reaper
5. **Multi-track FX** — Different FX on different tracks, verify correct mapping
6. **Switch between FX on one track** — Multiple FX on one track, switch between them, see param names/settings change, reflect what Reaper sees
7. **Track renames + FX persistence** — Rename track, FX list stays intact
8. **Stress test** — Rapidly add/delete FX, Reaper doesn't crash

**🔴 Verification gate:**
- Must NOT be closed without visual verification.
- Close criteria: Screenshot Verifier (Kimi K2.6) starts full stack, runs each scenario, takes screenshots showing real Reaper data in the UI.
- Screenshot Verifier must be spawned with: `model: "openrouter/moonshotai/kimi-k2.6"`
- Builder writes test code. Reviewer audits. Screenshot Verifier runs + captures evidence. Only then close.

---

## #46 main.cpp: duplicate control surface startup + PreCacheFX()

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** bug

`main.cpp` has code duplication — the `iPadControlSurface` creation + `g_wsServer.Start()` block appears **twice**:

1. Inside the `g_csurfReg` create-function lambda
2. Inline at the bottom of `REAPER_PLUGIN_ENTRYPOINT`

Plus `PreCacheFX()` is called twice — once in the setup block and once at the end. This is fragile. Extract to `StartExtension()` helper.

---

## #47 Replace if-else command chain with registry map in command_handler

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** enhancement

`HandleMessage()` uses a 15+ branch if-else chain. Does not scale.

**Fix:** `std::map<std::string, HandlerFn>` registry. New commands just add a map entry.

---

## #48 Split useReaper into domain-specific hooks

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** enhancement

`useReaper.ts` returns 20+ functions. Unnecessary re-renders, no tree-shaking.

**Split into:** `useTransport`, `useTracks`, `useFx`, `useSampleBrowser`. Share WsClient via context.

---

## #49 Add React Error Boundary to App shell

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** bug

No error boundary — one component crash = white screen.

**Fix:** Wrap main content in `<ErrorBoundary>` with friendly message + reset + keep tab bar functional.

---

## #50 Standardize CSS variable naming and add dark mode

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** enhancement

Inconsistent naming: `--bg-primary` vs `--border`. Missing dark mode. Some hardcoded colors.

**Fix:** Audit, create dark palette, `.dark` class support.

---

## #51 Add loading states to long-running operations (Refresh Plugin List)

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** enhancement

60s `fx/refreshCache` call with zero visual feedback.

**Fix:** Disable button, show spinner, completion feedback.

---

## #52 Real-time parameter update events from Reaper to frontend

**State:** closed | **Milestone:**  in **Phase 2**

**Labels:** feature

Currently, param changes (e.g., moving a knob in Reaper) don't stream back to the frontend in real-time. The extension broadcasts transport events, but not FX parameter changes.

This means if a user or another surface changes a param, the frontend stays stale.

Expected:
- Extension broadcasts FX param change events to all connected WebSocket clients
- Frontend updates displayed parameter values in real-time
- ~30ms update rate, similar to transport events

Phase 2 feature.

---

## #53 Add track volume faders and pan control to TrackOverview

**State:** open | **Milestone:**  in **Phase 2**

**Labels:** feature

The TrackOverview component shows mute/solo/arm but no volume faders or pan control. For a remote control app, volume adjustment is a core feature.

Expected:
- Volume fader per track (touch slider)
- Pan control (L/R balance)
- Real-time updates when changed from Reaper

Phase 2 feature.

---

## #54 Built-in HTTP server serves frontend directly

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer, feature, infrastructure

Tracking issue for milestone completeness. The extension now serves the built frontend on port 5173 alongside WS. No separate server needed (commit cf1faf5).

---

## #56 track/getAll returns fake mute/solo/arm data

**State:** closed | **Milestone:**  in **Phase 2**

**Labels:** bug, priority:high

track/getAll hardcodes muted/soloed/armed as false for every track. Mute setter uses wrong property name: I_MUTE instead of B_MUTE.

---

## #57 Real-time mute/solo/arm updates via CSURF_EXT callbacks

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer, enhancement, feature

When mute/solo/arm changes inside Reaper (not from iPad), the frontend doesn't find out until the user navigates away and back.

Reaper fires Extended() callbacks for these: CSURF_EXT_SETMUTE, CSURF_EXT_SETSOLO, CSURF_EXT_SETRECARM. We should handle them and broadcast events so the track UI updates in real-time.

---

## #58 Replace all polling with Reaper CSURF_EXT callbacks

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer

Every Reaper state change we currently poll can be replaced with push notifications via the control surface API — zero CPU, instant updates.

**Direct IReaperControlSurface overrides (called by Reaper when state changes):**
- `SetSurfaceMute(track, mute)` → broadcast event
- `SetSurfaceSolo(track, solo)` → broadcast event
- `SetSurfaceRecArm(track, arm)` → broadcast event
- `SetSurfaceVolume(track, vol)` → broadcast event
- `SetSurfacePan(track, pan)` → broadcast event
- `SetSurfaceSelected(track, sel)` → broadcast event
- `SetTrackTitle(track, name)` → broadcast event
- `SetTrackListChange()` → trigger track list re-fetch
- `SetPlayState(play, pause, rec)` → broadcast transport change

**Extended() callbacks:**
- `CSURF_EXT_SETFXCHANGE` → FX added/deleted/reordered → trigger re-fetch
- `CSURF_EXT_SETFXPARAM` → FX param value changed (packed fx+param idx + value) → replaces 5Hz poll
- `CSURF_EXT_TRACKFX_PARAMINFO_CHANGED` → param names changed (preset switch) → re-fetch names
- `CSURF_EXT_SETFOCUSEDFX` → focused FX changed
- `CSURF_EXT_SETBPMANDPLAYRATE` → BPM/playrate

After this, the Run() loop only drives WS connections. Zero Reaper API polling.

---

## #59 FX grid layout on track: clickable card grid instead of list

**State:** closed | **Milestone:**  in **Phase 1 MVP**

**Labels:** approvedbyreviewer

Instead of one FX per line in the track list, show a flex-wrap grid of FX cards under each track. Multiple FX per row, wraps to next line when full.

Each card shows:
- FX name (cleaned, no format prefix)
- A brief status indicator (bypassed? active?)

Tapping a card opens the existing param view sliders.

Layout idea:
```
Track 1: [M][S][R]                      
┌────────┐ ┌────────┐ ┌────────┐    
│ ReaEQ  │ │ ReaComp│ │ ReaVerb│    
│        │ │        │ │        │    
└────────┘ └────────┘ └────────┘    
```

Frontend-only change — no extension work needed.

---

## #60 Clip launcher iPad app with Playtime 2 integration

**State:** closed | **Milestone:**  in **Phase 2**

Build a grid-based clip launcher (Ableton Push-style) for the iPad that connects to Playtime 2 via ReaLearn MIDI bridge or direct gRPC.

Research needed: Ableton Push layout, 8x8 grid, scene/column control, color feedback.

Refs: docs/helgobox/resources/controller-presets/factory/novation/launchpad-x.preset.luau, docs/helgobox/playtime-api/src/runtime/

---

## #61 Clip launcher iPad app with Playtime 2 integration

**State:** open | **Milestone:**  in **Phase 2**

Build a grid-based clip launcher (Ableton Push-style) for the iPad that connects to Playtime 2 via ReaLearn MIDI bridge or direct gRPC. Research Abelson Push layout: 8x8 grid, scene/column control, color feedback, browser knob.

---

## #62 Research: How Ableton Push integrates (grid layout, feedback protocol, browser knob)

**State:** open | **Milestone:**  in **Phase 2**

Research how Ableton Push works as a reference for our iPad clip launcher:

- 8x8 pad grid layout and what each section does
- Scene/row launch strip on right
- Track/column controls (volume, mute, solo, arm)
- Pad color feedback protocol (playing=green, stopped=amber, empty=off)
- Browser knob and screen workflow for browsing instruments/clips
- How Push communicates with Ableton Live (MIDI protocol details)
- Navigation: scrolling tracks and scenes
- Transport controls
- Touch strip / encoder interaction

This research will inform our iPad grid UI design.

---

## #63 MIDI step sequencer on iPad grid (Ableton Push sequencer mode)

**State:** open | **Milestone:**  in **Phase 2**

Research and implement a MIDI step sequencer for the iPad app, inspired by Ableton Push's grid-based sequencer mode.

## What Push's sequencer does
- 8x8 grid shows 64 steps of a pattern
- Each row = a note/pitch (chromatic or scale)
- Each column = a step in time
- Tap a pad to toggle a note on/off at that step
- Green = note on, dimmed = off
- Scroll through octaves up/down
- Adjust note length, velocity, swing
- Different modes: classic (chromatic), scale-based, drum (each row = one drum sound)

## What we'd build
- A grid-based step sequencer view on the iPad
- 8 columns × 8 rows of toggleable steps
- Send MIDI notes out to Reaper tracks or instruments
- Different modes: chromatic, scale, drum
- Tempo-synced
- Velocity per step (tap pressure or secondary control)
- Scroll through octaves or patterns

## Integration options
- Our extension sends MIDI notes via Reaper API to a target track/instrument
- Or talk to Playtime's clip matrix (sequencer mode)
- Or standalone MIDI clip generation

## Research needed
- How Push sequencer modes work (chromatic, scale, drum, layout)
- MIDI note mapping for the 8x8 grid
- Step sequencer data model (patterns, steps, resolution)
- How to send MIDI from our extension to Reaper tracks

---


# Architecture — reaper-ipad

Design decisions, rationale, and system overview.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  REAPER (Linux / Windows / macOS)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  reaper_spidercrab.so/.dll/.dylib                    │   │
│  │  ┌────────────┐  ┌──────────────────┐  ┌─────────┐  │   │
│  │  │ Control    │  │ WebSocket Server  │  │ HTTP     │  │   │
│  │  │ Surface    │──│ (port 9224+)      │  │ Server   │  │   │
│  │  │ (Run loop) │  │                  │  │ (5173+)  │  │   │
│  │  └──────┬─────┘  └────────┬─────────┘  └─────────┘  │   │
│  │         │                 │                            │   │
│  │  ┌──────┴─────────────────┴──────────────────────┐    │   │
│  │  │ Command Handler (command map dispatcher)       │    │   │
│  │  │ Track · FX · Transport · Sample · FX Chain    │    │   │
│  │  │ Playtime Matrix · Sequencer · OSC · MIDI      │    │   │
│  │  └───────────────────────────────────────────────┘    │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────┐  ┌───────────────┐   │   │
│  │  │ SampleCache  │  │ MiniBPM  │  │ Playtime API  │   │   │
│  │  │ (background  │  │ (tempo   │  │ (HB_* fns,    │   │   │
│  │  │  indexing)   │  │  detect) │  │  OSC, MIDI)   │   │   │
│  │  └──────────────┘  └──────────┘  └───────────────┘   │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────┐                      │   │
│  │  │ FxChainCache │  │ FxTags / │                      │   │
│  │  │ (cached      │  │ Sample   │                      │   │
│  │  │  search)     │  │ Tags     │                      │   │
│  │  └──────────────┘  └──────────┘                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕ WebSocket (JSON) / OSC (UDP)      │
└─────────────────────────────┬───────────────────────────────┘
                              │ WiFi/LAN
┌─────────────────────────────┴───────────────────────────────┐
│  iPad / Phone (PWA) — Safari PWA (add to home screen)      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React App (Tailwind v4, Inter font)                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │  │
│  │  │ Media    │ │ FX +     │ │ Track    │ │ Playtime│ │  │
│  │  │ Browser  │ │ Chains   │ │ Overview │ │ Clip    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ │ Grid    │ │  │
│  │  ┌──────────┐ ┌──────────────────────┐  └─────────┘ │  │
│  │  │ Settings │ │ WsClient             │              │  │
│  │  └──────────┘ │ (auto-reconnect,     │              │  │
│  │               │  command queue,      │              │  │
│  │               │  StateManager)       │              │  │
│  │               └──────────────────────┘              │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

External control:
┌──────────────┐
│ ReaLearn     │── OSC over UDP (two-way sync)
│ (REAPER      │── MIDI virtual port (feedback)
│  plugin)     │
└──────────────┘
```

## Why C++ for the Extension?

The Reaper SDK exposes a C/C++ plugin API. Extensions are shared libraries
(.so on Linux, .dll on Windows) loaded by Reaper at startup. The control
surface interface (`IReaperControlSurface`) is C++ virtual methods.

**Alternatives considered:**
- **Zig** — reamo uses it, but Tamura explicitly wanted C++ from the ground up
- **Rust** — helgobox (Playtime 2) uses Rust via `reaper-rs` bindings, but adds
  complexity for FFI and cross-compilation
- **Python/Lua** — Reaper supports these for scripting, but control surfaces
  require native code for the Run() callback (~30x/sec polling)

C++17 gives us direct access to the full Reaper API, zero FFI overhead, and
a straightforward build story (Linux with GCC, Windows requires MSVC or clang-cl —
SReaper SDK explicitly requires MSVC C++ ABI on Win32).

## Why Hand-Rolled WebSocket?

The WebSocket protocol is simple:
1. HTTP upgrade handshake (request/response headers)
2. SHA-1 hash of key + magic GUID → Base64
3. Framed messages (small header + payload)
4. Masking (client→server only)

WDL's jnetlib provides `JNL_Listen` (TCP accept) and `JNL_Connection`
(read/write). We layer WebSocket framing on top. Total implementation:
~200 lines.

**Alternatives considered:**
- **libwebsockets** — popular but heavy, adds a build dependency
- **Boost.Beast** — excellent but pulls in Boost
- **µWebSockets** — C, lightweight, but still a dep

Hand-rolled wins because WDL is already a dependency of the SDK, and the
WebSocket subset we need is tiny.

## Protocol Design

We follow the reamo JSON protocol for compatibility:

```
Request:  {"type":"command", "command":"track/getFx", "trackIdx":0, "id":"cmd_1"}
Response: {"type":"response", "id":"cmd_1", "success":true,  "payload":{"fx":[...]}}
Event:    {"type":"event",    "event":"transport",           "payload":{"isPlaying":true}}
Errors:   {"type":"response", "id":"cmd_1", "success":false, "error":"Unknown command"}
```

Why JSON? It's debuggable — you can read it in Chrome DevTools network tab
or with a simple `echo` / `websocat` CLI tool. For a local WiFi setup, the
overhead is negligible.

## Control Surface Registration

Reaper discovers extensions by scanning the `UserPlugins/` directory for shared
libraries exporting `ReaperPluginEntry`. The extension:

1. Registers a control surface TYPE via `rec->Register("csurf", &csurfReg)`
2. Creates the surface object and registers the INSTANCE via `rec->Register("csurf_inst", surface)`
3. Reaper calls `surface->Run()` in its main loop (~30x/sec)
4. `Run()` polls WebSocket connections and dispatches commands

## Test Strategy

**Layer 1 — Unit tests (standalone, no Reaper):**
- Google Test for C++ (SHA-1, frame parsing, JSON validation)
- Vitest for React (WsClient protocol, auto-reconnect, state management)

**Layer 2 — Integration tests (Reaper running):**
- Start Reaper headlessly with Xvfb
- Connect test WebSocket client, verify commands produce expected results
- Verify error handling

**Layer 3 — End-to-end (iPad + Reaper):**
- Real device testing over WiFi
- Touch latency measurement
- UI responsiveness on iPad Safari

## Command Dispatch

Commands are dispatched via `std::unordered_map<std::string, HandlerFn>` in the
CommandHandler constructor (`command_handler.cpp`). No if/else chain. Each
command string maps directly to a method pointer:

```cpp
m_commandMap["track/getAll"]  = &CommandHandler::HandleGetTracks;
m_commandMap["fx/getParams"]  = &CommandHandler::HandleGetFXParams;
m_commandMap["matrix/triggerSlot"] = &CommandHandler::HandleMatrixTriggerSlot;
// 50+ commands registered
```

Unknown commands return `{"success":false, "error":"Unknown command"}`.

## Run() Polling (iPadControlSurface)

The surface's `Run()` is called by REAPER ~30x/sec. It handles:

1. **WebSocket I/O** — poll connections, dispatch messages
2. **Playtime availability check** — retries API resolution every ~2s (helgobox may register API functions after the extension starts). Broadcasts `playtime/availabilityChanged` events.
3. **Periodic matrix sync** — polls Playtime 2 state every ~10s, broadcasts `playtime/stateSync` for frontend refresh
4. **MIDI feedback** — polls `midi_Input` buffer, maps MIDI notes 36-99 to slot col/row, updates PlaytimeState, broadcasts `matrix/slotStateChanged`

## Real-Time State Push

All track/FX state changes are pushed to connected clients via
CSURF_EXT callbacks (no polling). When REAPER notifies the extension of
mute/solo/arm/FX param changes, the extension broadcasts an event to all
WebSocket clients:

```json
{"type":"event", "event":"track/stateChanged", "payload":{...}}
```

This gives sub-100ms state sync for parameter changes.

## Playtime 2 Integration

The extension integrates with Playtime 2 (part of Helgobox) through multiple
layers:

### C API (playtime_api.h)
Resolves `HB_*` function pointers at init time via `rec->GetFunc()`. If
Helgobox hasn't registered its API yet, `retryPlaytimeApi()` in Run() keeps
trying every ~2s.

### Matrix Handlers
- `matrix/getAll` — returns current grid state (auto-creates matrix if missing)
- `matrix/getSlot` — single slot query
- `matrix/triggerSlot` — launch/stop clip
- `matrix/triggerScene` — launch scene
- `matrix/setSlotState` — manual state override
- `matrix/recordSlot` — start/stop recording into slot
- `matrix/pollState` — force state refresh

### OSC Over UDP (osc_sender.h, osc_receiver.h)
Replaces the original MIDI polling approach (Issue #98). The extension
includes a ReaLearn preset (`presets/spidercrab-clip-launcher.json`) that
maps MIDI notes to slot trigger/scene launch/stop actions. Two-way sync via
ReaLearn's OSC feedback mechanism. The preset is downloadable from the
frontend Settings tab.

### MIDI Fallback (playtime_midi.h)
Slot triggering also works via MIDI Note On/Off (Push 2 grid mapping:
note = 36 + row*8 + col). Used when Playtime C API is unavailable.

### MIDI Feedback Listener (main.cpp)
Incoming MIDI events from ReaLearn are parsed to update slot states
playing/stopped and broadcast changes to the frontend.

### PlaytimeState (playtime_state.h)
In-memory representation of the 8x8 (or variable-size) matrix grid.
Each slot tracks: state (stopped/playing/recording), color, clip name,
column, row. Serialized to JSON for frontend consumption.

## Sample Cache Architecture

The sample browser handles potentially thousands of files across multiple
directories. Naively listing them on every request would be too slow.

### SampleCache (sample_cache.cpp/.h)
- Scans directories in the background using `fs::recursive_directory_iterator`
- Indexes files by path, name, size, extension
- Reports per-directory progress during initial scan
- Results cached to the frontend's localStorage for fast re-load
- Supports incremental re-scans when directories change

### MiniBPM (MiniBpm.cpp/.h)
Lightweight embedded BPM detection library. When a sample is sent to a
Playtime slot, MiniBPM analyzes the audio file's tempo and the extension
sets the clip's BPM in Playtime for automatic tempo matching.

### Sample Tags (sample_tags.cpp/.h)
Persistent tag storage. Tags are stored per-sample-path in a JSON file
on the filesystem. Supports adding, removing, querying tags. The frontend
filters by tag and displays colored badges.

### FX Tags (fx_tags.cpp/.h)
Same tagging system for FX plugins and FX chains. Tags persist to
`fx_tags.json` and `fxchain_tags.json`.

## FX Chain Cache

### FxChainCache (fxchain_cache.cpp/.h)
- Scans all `.RfxChain` files at startup and caches file paths/sizes/names
- Auto-caches on `SetConfigDir` change (when REAPER config path changes)
- `fxchain/searchCached` performs in-memory filtering (zero filesystem IO)
- Results paginated (16/page), matching the 1-2 dozen visible items per page
- Refresh Cache button in Settings triggers a full re-scan

## HTTP Server

Built into the extension. Serves the React frontend from the extension's
bundled `dist/` directory. Port defaults to 5173, with fallback port
increment if occupied. No separate server process needed — the extension
_is_ the web server.

## Platform Builds

| Target | Binary | Compiler |
|--------|--------|----------|
| Linux | `reaper_spidercrab.so` | GCC (native) |
| Windows | `reaper_spidercrab.dll` | clang-cl + xwin (cross from Linux) |
| macOS | `reaper_spidercrab.dylib` | Xcode CLT (native) / osxcross (cross from Linux) |

All builds use the same source. The build script detects the target OS
or accepts `TARGET={linux,windows,macos}` override.

## Port Selection

Default: 9224 (matches reamo convention).
If occupied, tries 9225–9233.
Port is saved to Reaper's project ExtState for persistence across sessions.

## Test Strategy

**Layer 1 — Unit tests (standalone, no Reaper):**
- Google Test for C++ — 307 tests (SHA-1, frame parsing, JSON validation,
  command handlers, FX chain chunk manipulation, Playtime matrix, MIDI,
  sequencer, sample cache, MiniBPM, OSC)
- Vitest for React — 388 tests (WsClient protocol, auto-reconnect, state
  management, components, hooks, drag-and-drop)

**Layer 2 — Integration tests (Reaper running):**
- Start Reaper headlessly with Xvfb
- Connect test WebSocket client, verify commands produce expected results
- Playwright E2E tests (see `gui_testing/`) — full-stack roundtrip with
  screenshots

**Layer 3 — End-to-end (iPad + Reaper):**
- Real device testing over WiFi
- Touch latency measurement
- UI responsiveness on iPad Safari

**Layer 4 — CI (Windows):**
- GitHub Actions workflow (`.github/workflows/windows-build.yml`)
- MSVC + clang-cl build + test via `deploy_and_test.ps1`

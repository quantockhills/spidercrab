# Architecture — reaper-ipad

Design decisions, rationale, and system overview.

## System Architecture

```
┌─────────────────────────────────────────────────┐
│  REAPER (Windows 11 / Linux)                     │
│  ┌──────────────────────────────────────────┐    │
│  │  reaper-ipad-ext.so/.dll                 │    │
│  │  ┌────────────┐  ┌──────────────────┐    │    │
│  │  │ Control    │  │ WebSocket Server  │    │    │
│  │  │ Surface    │──│ (port 9224+)      │    │    │
│  │  │ (Run loop) │  │                  │    │    │
│  │  └──────┬─────┘  └────────┬─────────┘    │    │
│  │         │                 │                │    │
│  │  ┌──────┴─────────────────┴──────────┐     │    │
│  │  │ Command Handler                   │     │    │
│  │  │ Track/FX/Transport → Reaper API   │     │    │
│  │  └───────────────────────────────────┘     │    │
│  └──────────────────────────────────────────┘    │
│                         ↕ WebSocket (JSON)       │
└─────────────────────────┬────────────────────────┘
                          │ WiFi/LAN
┌─────────────────────────┴────────────────────────┐
│  iPad / Phone (PWA)                               │
│  ┌──────────────────────────────────────────┐    │
│  │  React App                               │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ Sample   │ │ FX       │ │ Param    │  │    │
│  │  │ Browser  │ │ Manager  │ │ Sliders  │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘  │    │
│  │  ┌──────────────────────────────────┐    │    │
│  │  │ WsClient (auto-reconnect, queue) │    │    │
│  │  └──────────────────────────────────┘    │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
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
the simplest cross-compilation story (just retarget the toolchain).

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

## Port Selection

Default: 9224 (matches reamo convention).
If occupied, tries 9225–9233.
Port is saved to Reaper's project ExtState for persistence across sessions.

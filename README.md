# 🎛️ reaper-ipad

A **sample + FX browser/manager** for REAPER, controllable from an iPad during live sets.

Push samples, FX chains, and presets to tracks — tweak parameters in real-time from a touch-friendly React PWA, all over WiFi.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Windows 11 / Linux (REAPER)                     │
│  ┌──────────────────────────────────────────┐    │
│  │  C++ Extension (WebSocket Server)        │    │
│  │  - Track & FX management via Reaper API  │    │
│  │  - Real-time parameter control           │    │
│  │  - Playtime 2 clip integration (future)  │    │
│  └──────────────┬───────────────────────────┘    │
│                 ↕ WebSocket (JSON)                │
└─────────────────┬────────────────────────────────┘
                  │ WiFi
┌─────────────────┴────────────────────────────────┐
│  iPad (React PWA)                                 │
│  ┌──────────────────────────────────────────┐    │
│  │  - Sample / FX browser                   │    │
│  │  - Touch sliders for real-time control   │    │
│  │  - Clip launcher (future)                │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Build the C++ extension
make build

# Lint
make lint

# Run C++ tests
make test

# Deploy to Reaper's UserPlugins/
make deploy

# Frontend
make frontend-install
make frontend-dev    # dev server at localhost:5173
make frontend-test   # Vitest
```

## Project Structure

```
reaper-ipad/
├── extension/            # C++ REAPER extension
│   ├── src/              # Source code
│   │   ├── main.cpp              # Entry point + control surface
│   │   ├── websocket_server.cpp  # WebSocket protocol
│   │   └── command_handler.cpp   # Reaper API commands
│   ├── test/             # Google Test unit tests
│   ├── build/            # Build output
│   ├── build.sh          # Build script
│   ├── lint.sh           # clang-tidy linter
│   ├── deploy.sh         # Deploy to Reaper
│   └── CMakeLists.txt    # CMake (for tests)
├── frontend/             # React PWA
│   ├── src/
│   │   ├── lib/wsClient.ts       # WebSocket client library
│   │   ├── hooks/useReaper.ts    # React hook
│   │   └── test/                 # Vitest tests
│   └── package.json
├── WDL/                  # Cockos Foundation Library (jnetlib)
├── reaper-sdk/           # REAPER C/C++ extension SDK
├── IDEAS.md              # Brain dump — nothing gets lost
├── DEBUGGING.md          # Debugging pipeline docs
└── Makefile              # All tasks in one place
```

## Development

**Linux first, cross-compile to Windows later.**

```bash
# Full check (lint + build + test)
make check

# Debug build with ASan + UBSan
BUILD_TYPE=debug make build
```

The debug build includes AddressSanitizer and UndefinedBehaviorSanitizer — they catch memory bugs at runtime automatically.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | C++17, REAPER SDK, WDL jnetlib |
| Frontend | React + TypeScript + Tailwind CSS v4 |
| C++ Tests | Google Test |
| Frontend Tests | Vitest |
| Linting | clang-tidy (C++), ESLint (React) |
| Protocol | JSON over WebSocket |

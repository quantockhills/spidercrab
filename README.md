# 🦀 spidercrab

> ⚠️ **Work in progress.** This is an early-stage project under active development. It may crash, eat your project file, or set your cat on fire. Not yet recommended for live use or critical sessions. Proceed with caution (and backups).

Touch-friendly REAPER remote control for iPad — FX browser, real-time param control, track management, all over WiFi.

```
┌───────────────────────────────────────────────┐
│  REAPER (Windows / Linux)                      │
│  ┌────────────────────────────────────────┐    │
│  │  spidercrab (.dll / .so)               │    │
│  │  WebSocket server (9224) + HTTP (5173)  │    │
│  │  → FX browser + real-time param control │    │
│  │  → Track management (mute/solo/arm)     │    │
│  │  → Real-time events (no polling)        │    │
│  └───────────┬────────────────────────────┘    │
│              ↕ WiFi                             │
└──────────────┼─────────────────────────────────┘
               ↕
┌──────────────┴─────────────────────────────────┐
│  iPad / Phone (React PWA)                       │
│  ┌────────────────────────────────────────┐    │
│  │  → Track overview + FX grid            │    │
│  │  → FX browser with search & filter     │    │
│  │  → Touch param sliders (real-time)     │    │
│  │  → Audio sample browser (WIP)          │    │
│  └────────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

## 🚀 Quick Install

### Windows
1. Download `spidercrab.dll` from the [latest release](https://github.com/quantockhills/spidercrab/releases/tag/v0.1.1-alpha)
2. Drop into `C:\Users\you\AppData\Roaming\REAPER\UserPlugins\`
3. Download `frontend/` folder alongside it
4. Launch REAPER
5. Open `http://reaper-pc:5173` on your iPad

### Linux
Same flow — `spidercrab.so` into `UserPlugins/`, `frontend/` alongside.

> The extension serves both WebSocket (API) and HTTP (frontend). No Node.js, no separate server.

## ✨ Current State (v0.1.0-alpha)

### ✅ Phase 1 MVP — Complete
| Feature | Detail |
|---|---|
| **WebSocket server** | Auto-registers as REAPER control surface on port 9224 |
| **HTTP server** | Serves frontend built-in on port 5173 |
| **Track management** | List tracks, Mute/Solo/Arm with real-time push |
| **Track state reads** | Reads actual Reaper state (mute/solo/arm/selected via B_MUTE, I_SOLO, I_RECARM) |
| **FX browser** | Browse 250+ plugins, search, filter by format (VST3, VST2, JSFX, CLAP) |
| **FX grid** | Cards under each track — tap to open param view |
| **Param control** | Touch sliders for all FX params with real-time streaming |
| **Real-time events** | FX param changes stream via CSURF_EXT_SETFXPARAM (no polling) |
| **Mute/solo/arm push** | SetSurfaceMute/Solo/RecArm callbacks → instant UI update |
| **Transport** | Play/Stop from iPad, live state read |
| **Design system** | Everforest pastel palette, Inter font, square corners, touch targets ≥44px |
| **Windows build** | `TARGET=windows bash build.sh` → 416KB .dll, exports ReaperPluginEntry |
| **Tests** | 134 C++ tests (Google Test) + 65 frontend tests (Vitest) |
| **Release** | [v0.1.0-alpha](https://github.com/quantockhills/spidercrab/releases) |

### 🚧 Phase 2 — Clip Launcher (in progress)
| Goal | Detail |
|---|---|
| **Clip launcher app** | Ableton Push-style 8×8 pad grid for Playtime 2 |
| **MIDI sequencer** | Grid-based step sequencer (chromatic, scale, drum modes) |
| **Playtime 2 integration** | Trigger clips via ReaLearn MIDI bridge or direct gRPC |
| **Push research** | Researching Push grid layout, color feedback, browser workflow |
| **Volume faders + pan** | Track volume and pan controls for Push-style mixing |
| **FX chain browser** | Browse instrument presets and FX chains |

### 📋 Remaining Phase 2 Issues
- Track volume faders and pan control
- Loading states for long operations
- Dark mode CSS
- React Error Boundary
- Domain-specific hooks for useReaper
- Command handler registry (replace if-else chain)
- Real track names from Reaper
- FX chain save/load
- Remove FX from tracks

## 🛠️ Development

```bash
# Build the Linux extension (.so)
cd extension && bash build.sh

# Or for Windows (.dll)
TARGET=windows bash build.sh

# Deploy to REAPER
cp extension/build/spidercrab* ~/reaper-portable/Plugins/

# Frontend dev server
cd frontend && npm run dev

# Build frontend for production
npm run build
cp -r dist/* ~/reaper-portable/Plugins/frontend/
```

### Full Develoment Check

```bash
make build           # Build C++ extension
make test            # Google Test (C++)
make lint            # clang-tidy
make deploy          # Copy to REAPER UserPlugins/
make frontend-install
make frontend-test   # Vitest (React)
make frontend-lint   # ESLint
```

### Debug Build
```bash
BUILD_TYPE=debug bash extension/build.sh
```
Includes AddressSanitizer + UBSan — catches memory bugs at runtime.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | C++17, REAPER SDK, WDL jnetlib (Justin Frankel) |
| Frontend | React + TypeScript + Tailwind CSS v4 |
| C++ Tests | Google Test |
| Frontend Tests | Vitest |
| Linting | clang-tidy (C++), ESLint (React) |
| Protocol | JSON over WebSocket, CSURF_EXT callbacks |
| Cross-compile | MinGW-w64 (Linux → Windows .dll) |
| Repository | [github.com/quantockhills/spidercrab](https://github.com/quantockhills/spidercrab) |

## Project Structure

```
spidercrab/
├── extension/              # C++ REAPER extension
│   ├── src/
│   │   ├── main.cpp               # Entry point + control surface
│   │   ├── websocket_server.cpp   # WebSocket protocol
│   │   ├── command_handler.cpp    # REAPER API commands
│   │   └── frontend_server.h      # Built-in HTTP server
│   ├── build.sh                   # Build (Linux + Windows)
│   └── deploy.sh                  # Deploy to REAPER
├── frontend/               # React PWA
│   ├── src/
│   │   ├── lib/wsClient.ts       # WebSocket client
│   │   ├── hooks/useReaper.ts    # React hook
│   │   └── components/           # UI components
│   └── package.json
├── docs/                   # SDK + design docs
├── gui_testing/            # E2E screenshots
├── migrate_issues.py       # Gitea → GitHub issue migrator
└── README.md
```

## License

MIT — see [LICENSE](LICENSE) file.

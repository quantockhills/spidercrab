# 🎛️ reaper-ipad

Touch-friendly REAPER remote control for iPad — browse FX, tweak parameters in real-time, all over WiFi.

```
┌───────────────────────────────────────────────┐
│  REAPER (Windows 11 / Linux)                   │
│  ┌────────────────────────────────────────┐    │
│  │  reaper_ipad_ext (.dll / .so)          │    │
│  │  WebSocket server (9224) + HTTP (5173)  │    │
│  │  → Track & FX management               │    │
│  │  → Real-time param streaming            │    │
│  └───────────┬────────────────────────────┘    │
│              ↕ WiFi                             │
└──────────────┼─────────────────────────────────┘
               ↕
┌──────────────┴─────────────────────────────────┐
│  iPad / Phone (React PWA)                       │
│  ┌────────────────────────────────────────┐    │
│  │  → FX browser + param sliders          │    │
│  │  → Track overview (mute/solo/arm)      │    │
│  │  → Real-time parameter control         │    │
│  └────────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

## 🚀 Install (End User)

### Windows

1. **Download** the [latest release](http://localhost:3000/madhav/reaper-ipad/releases)
2. **Extract** `reaper_ipad_ext.dll` → `C:\Users\you\AppData\Roaming\REAPER\UserPlugins\`
3. **Extract** `frontend/` folder → `C:\Users\you\AppData\Roaming\REAPER\UserPlugins\frontend\`
4. **Launch REAPER** — check console for:
   ```
   [reaper-ipad] WebSocket server started on port 9224
   [reaper-ipad] Frontend server on http://<your-ip>:5173
   ```
5. **Open** `http://REAPER-PC-IP:5173` on your iPad — done

### Linux

Same flow — copy `reaper_ipad_ext.so` to `UserPlugins/` and `frontend/` alongside it.

> No Node.js, npm, or separate server needed. The extension serves both WebSocket and HTTP.

## ✨ What's Working Now (v0.1.0-alpha)

### Core
- ✅ WebSocket server on port 9224 (auto-registers as control surface)
- ✅ JSON command protocol (reamo-compatible)
- ✅ Built-in HTTP server serves the frontend on port 5173
- ✅ Auto-start — just launch REAPER, no config needed

### Track Management
- ✅ List all tracks with mute/solo/arm/volume
- ✅ Toggle mute, solo, arm from iPad
- ✅ Refresh track list live

### FX Browser
- ✅ Browse all installed plugins (VST3, VST2, JSFX)
- ✅ Search + filter by format (VST3, VST2, JSFX…)
- ✅ Add FX to tracks with one tap
- ✅ View + adjust all parameters with touch sliders

### Real-Time Controls
- ✅ Set parameters from iPad → reflected in REAPER instantly
- ✅ External param changes stream back to the UI in real-time

### Transport
- ✅ Play / Stop from iPad

### Design
- ✅ Everforest pastel palette (warm, cozy, readable on stage)
- ✅ Inter font, square corners, touch targets ≥44px
- ✅ Responsive — works on iPad, phone, desktop browser

## 🗺️ Next Steps

### Phase 2 (in progress)
- 🔄 Track volume faders + pan control
- 🔄 Sample browser with audio preview
- 🔄 Real-time param update events (done — streaming)
- 🔄 Windows cross-compilation (done — `.dll` builds)
- 🔄 FX chain save/load
- 🔄 Remove FX from tracks
- 🔄 Multi-track FX operations

### Future
- 📅 Playtime 2 clip launching
- 📅 MIDI synth parameter control
- 📅 Drag-and-drop support
- 📅 MIDI clip grid from iPad

## 🛠️ Development

### Quick Start

```bash
# Build the Linux extension (.so)
cd extension && bash build.sh

# Or for Windows (.dll)
TARGET=windows bash build.sh

# Deploy to REAPER
cp extension/build/reaper-ipad-ext.so ~/reaper-portable/Plugins/

# Frontend dev server
cd frontend && npm run dev

# Build frontend for production
npm run build
cp -r dist/* ~/reaper-portable/Plugins/frontend/
```

### Full Check

```bash
make build     # Build C++ extension
make test      # Run C++ tests (Google Test)
make lint      # clang-tidy
make deploy    # Copy .so to REAPER UserPlugins/
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
| Extension | C++17, REAPER SDK, WDL jnetlib |
| Frontend | React + TypeScript + Tailwind CSS v4 |
| C++ Tests | Google Test |
| Frontend Tests | Vitest |
| Linting | clang-tidy (C++), ESLint (React) |
| Protocol | JSON over WebSocket |
| Cross-compile | MinGW-w64 (Linux → Windows .dll) |

## Project Structure

```
reaper-ipad/
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
└── README.md
```

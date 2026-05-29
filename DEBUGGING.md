# Debugging Pipeline

## C++ Extension (Reaper SDK)

### Build Types
The `build.sh` script supports two build modes via `BUILD_TYPE` env var:

```bash
# Debug build (no optimization, debug symbols, ASan)
BUILD_TYPE=debug bash extension/build.sh

# Release build (optimized, stripped)
bash extension/build.sh    # default
```

### Debug Build Features
- **`-O0 -g3`** — No optimization, full debug symbols
- **`-fsanitize=address`** — Address Sanitizer (use-after-free, buffer overflows)
- **`-DDEBUG=1`** — Enables verbose logging in extension
- **`-fno-omit-frame-pointer`** — Better stack traces

### Logging
The extension logs to stderr with a `[reaper-ipad]` prefix:
```
[reaper-ipad] WebSocket server started on port 9224
[reaper-ipad] Client connected (id=1)
[reaper-ipad] Command: track/getAll
```

To view logs when running Reaper:
```bash
# From terminal
~/reaper-portable/reaper 2>&1 | grep reaper-ipad

# Or tail the output
~/reaper-portable/reaper 2>&1 | tee reaper.log
```

### GDB (Debugger)
GDB is available at `/usr/bin/gdb`.

**Note:** `ptrace_scope` may prevent attaching to running processes.
To debug, run Reaper directly under GDB:
```bash
# Quick batch mode — runs Reaper, prints backtrace on crash
gdb -batch -x /tmp/gdb_script.gdb --args env DISPLAY=:99 \
  LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib \
  ~/reaper-portable/reaper -cfgfile ...
```

GDB script (`/tmp/gdb_script.gdb`):
```
set pagination off
set print pretty on
handle SIGSEGV stop print
run
bt full
quit
```

### Core Dumps
```bash
# Enable core dumps
ulimit -c unlimited
echo "/tmp/core.%p" | sudo tee /proc/sys/kernel/core_pattern

# Analyze with GDB
gdb ~/reaper-portable/reaper /tmp/core.*
```

### Crashes + ASan
Address Sanitizer is baked into the debug build
(`BUILD_TYPE=debug`). It catches buffer overflows and use-after-free
in our extension code. For crashes inside Reaper itself (libc), use GDB.

### Known Crash: GetSetMediaTrackInfo API Misuse
A segfault in `__memcmp_avx2_movbe` triggered from within Reaper when
`GetSetMediaTrackInfo(track, "P_NAME", buffer)` is called with a non-null
buffer pointer. This is **API misuse**, not a Reaper bug.

**The bug:** `GetSetMediaTrackInfo` takes `void* setNewValue` — when non-null,
Reaper interprets it as the **new value to SET**, not a buffer to fill.
Passing a stack buffer like `nameBuf[256]` tells Reaper: "set the track name
to whatever garbage is in nameBuf." This empties all track names and
corrupts Reaper's internal string table, causing the memcmp crash later.

**Correct API for reading strings:** `GetSetMediaTrackInfo_String`:
```cpp
char nameBuf[256] = {0};
m_api.GetSetMediaTrackInfo_String(track, "P_NAME", nameBuf, false);  // read
m_api.GetSetMediaTrackInfo_String(track, "P_NAME", "New Name", true); // write
```

**Also crashes (same internal code path):**
- `GetSetMediaTrackInfo` with any property name + non-null buffer
- `GetSetMediaTrackInfo_String` with any property name (Chromium WS context)
- `CSurf_TrackToID(track, false)` — may call GetSetMediaTrackInfo internally

**Safe APIs (no property lookup):**
- `CountTracks(nullptr)` — returns integer
- `GetTrack(nullptr, idx)` — returns pointer by index

**Workaround for FX enumeration crash:**
The first `fx/enumerate` call via Chromium WS crashes Reaper. Pre-cache
via Python WS (which works) and the frontend's second call returns
instantly from cache. See Issue #31.

**Lesson:** Check SDK docs (`docs/reaper-sdk/sdk/reaper_plugin_functions.h`)
before changing debug tools. The `void*` cast hides the direction of data flow.

----

## React Frontend

### Vite Dev Server (Hot Reload)
```bash
cd frontend
npm run dev
```
Opens at `http://localhost:5173` — changes reflect instantly.

### Testing
```bash
npm test              # Single run
npm test -- --watch   # Watch mode
npm run test:ui       # Vitest UI (interactive)
npm run test:coverage # With coverage report
```

### DevTools
- **React DevTools**: Install browser extension (Chrome/Firefox/Safari)
- **Chrome DevTools**: `F12` or right-click → Inspect
- **Safari on iPad**: Settings → Safari → Advanced → Web Inspector.
  Then connect to your Mac via USB and open Safari → Develop → iPad.

### Source Maps
TypeScript source maps are enabled by default in `vite.config.ts`.
Stack traces point directly to `.tsx` source lines.

### Error Boundaries
`App.tsx` wraps components with error boundaries for graceful failure.

### WebSocket Debugging
- **Chrome DevTools → Network tab**: Filter by "ws" to see WebSocket frames
- **Console logging**: The WsClient logs errors via `console.error('[reaper-ipad]', err)`
- **State inspector**: The `useReaper` hook exposes `connected`, `tracks`, etc.

### Local Development with Mock Backend
When the extension isn't running, the React app shows "Disconnected" state.
Use the test suite (which mocks WebSocket) to iterate on UI without Reaper.

---

## CI / Reproducible Builds

A `Dockerfile` is provided for CI builds:
```bash
docker build -t reaper-ipad .
```
This produces a build environment with all toolchain dependencies.

## Integration Testing

The `test/` directory contains:
- `wsClient.test.ts` — Unit tests for the WebSocket protocol layer
- Integration tests (future): Start test WebSocket server, connect, verify protocol
- E2E tests (future): Run with actual Reaper + frontend

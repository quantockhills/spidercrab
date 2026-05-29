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

### Known Crash: Reaper API Race Condition
A segfault in `__memcmp_avx2_movbe` called from `GetSetMediaTrackInfo`
indicates Reaper's internal string comparison failed (likely concurrent API
calls from multiple WS commands).

**Fix:** A mutex in `CommandHandler::HandleMessage` serializes all
Reaper API calls. If crashes persist, check for other race conditions
in the WS message processing pipeline.

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

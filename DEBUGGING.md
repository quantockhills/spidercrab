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

### GDB Attach
For debugging the running Reaper process:
```bash
# Find the Reaper PID
pgrep reaper

# Attach GDB
gdb -p $(pgrep reaper)

# In GDB, set breakpoints on extension functions
b WebSocketServer::Run
b CommandHandler::HandleMessage
c   # continue

# Or launch Reaper from GDB directly
gdb --args ~/reaper-portable/reaper
```

### GDB with Extension Symbols
Since the extension is a .so loaded dynamically:
```bash
# Set auto-load for shared libs
gdb -p $(pgrep reaper) \
    -ex "set breakpoint pending on" \
    -ex "b WebSocketServer::Run" \
    -ex "c"
```

### Core Dumps
```bash
# Enable core dumps
ulimit -c unlimited
echo "/tmp/core.%p" | sudo tee /proc/sys/kernel/core_pattern

# Run Reaper, crash it, then analyze
gdb ~/reaper-portable/reaper /tmp/core.*
```

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

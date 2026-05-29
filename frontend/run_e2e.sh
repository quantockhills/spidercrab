#!/usr/bin/env bash
# =============================================================================
# End-to-End Playwright Test Runner
#
# Starts Xvfb, launches Reaper headless with our extension, starts the
# frontend dev server, runs Playwright tests, and cleans up.
#
# Usage:
#   bash frontend/run_e2e.sh
#
# Environment variables (all optional):
#   DISPLAY_NUM    - Xvfb display number (default: 99)
#   REAPER_PORT    - WebSocket port (default: 9224)
#   FRONTEND_PORT  - Vite dev server port (default: 5173)
#   REAPER_HOME    - Path to portable Reaper (default: ~/reaper-portable)
#   KEEP_RUNNING   - If set, don't clean up after (for debugging)
#   VERBOSE        - Set to 1 for more output (default: 0)
#
# Exit codes:
#   0 - All tests passed
#   1 - Setup/teardown failure
#   2 - One or more tests failed
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ---- Config ----
DISPLAY_NUM="${DISPLAY_NUM:-99}"
REAPER_PORT="${REAPER_PORT:-9224}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
REAPER_HOME="${REAPER_HOME:-$HOME/reaper-portable}"
VERBOSE="${VERBOSE:-0}"
KEEP_RUNNING="${KEEP_RUNNING:-}"

DISPLAY=":${DISPLAY_NUM}"
REAPER_BIN="${REAPER_HOME}/reaper"
XVFB_BIN="$(command -v Xvfb 2>/dev/null || true)"

XVFB_PID=""
REAPER_PID=""
VITE_PID=""

log()     { echo "[e2e] $*"; }
verbose() { [ "$VERBOSE" = "1" ] && echo "  [debug] $*"; }

# ---- Cleanup ----
cleanup() {
    echo ""
    log "Cleaning up..."
    [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null && verbose "Vite ($VITE_PID) killed" || true
    [ -n "$REAPER_PID" ] && kill "$REAPER_PID" 2>/dev/null && verbose "Reaper ($REAPER_PID) killed" || true
    [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null && verbose "Xvfb ($XVFB_PID) killed" || true
    if [ -n "$REAPER_CFG_DIR" ] && [ -d "$REAPER_CFG_DIR" ] && [ -z "$KEEP_RUNNING" ]; then
        rm -rf "$REAPER_CFG_DIR" 2>/dev/null
    fi
    log "Cleanup done."
}
trap cleanup EXIT INT TERM

# =============================================================================
# 1. Start Xvfb
# =============================================================================
echo "═══════════════════════════════════════════════════════════════════════"
echo "  E2E Test Runner"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

log "Starting Xvfb on ${DISPLAY}..."
if [ -z "$XVFB_BIN" ]; then
    log "Xvfb not found. Install with: brew install xorg-server"
    exit 1
fi
Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac -nolisten tcp 2>/dev/null &
XVFB_PID=$!
for i in $(seq 1 5); do
    if kill -0 "$XVFB_PID" 2>/dev/null; then
        log "Xvfb started (PID $XVFB_PID)"
        break
    fi
    sleep 0.5
done
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    log "Failed to start Xvfb"
    exit 1
fi

# =============================================================================
# 2. Start Reaper headless
# =============================================================================
log "Preparing Reaper config..."
REAPER_CFG_DIR="$(mktemp -d /tmp/reaper-e2e-XXXXXX)"
mkdir -p "${REAPER_CFG_DIR}/UserPlugins"

EXT_SRC=""
if [ -f "${REAPER_HOME}/Plugins/reaper_ipad_ext.so" ]; then
    EXT_SRC="${REAPER_HOME}/Plugins/reaper_ipad_ext.so"
elif [ -f "${PROJECT_DIR}/extension/build/reaper-ipad-ext.so" ]; then
    EXT_SRC="${PROJECT_DIR}/extension/build/reaper-ipad-ext.so"
else
    log "Extension .so not found. Run 'make build' first."
    exit 1
fi
cp "$EXT_SRC" "${REAPER_CFG_DIR}/UserPlugins/reaper_ipad_ext.so"
verbose "Extension: $EXT_SRC"

log "Starting Reaper headless..."
export DISPLAY="${DISPLAY}"
export LD_LIBRARY_PATH="/home/linuxbrew/.linuxbrew/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

"${REAPER_BIN}" -cfgfile "$REAPER_CFG_DIR/reaper.ini" -newinst -nosplash -new 2>/dev/null &
REAPER_PID=$!
log "Reaper PID: $REAPER_PID"

# Wait for WebSocket
WAITED=0
while [ $WAITED -lt 10 ]; do
    if ! kill -0 "$REAPER_PID" 2>/dev/null; then
        log "Reaper died during startup"
        exit 1
    fi
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/${REAPER_PORT}" 2>/dev/null; then
        log "WebSocket ready on port ${REAPER_PORT} after ${WAITED}s"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -ge 10 ]; then
    log "WebSocket did not become ready"
    exit 1
fi

# =============================================================================
# 3. Start frontend dev server
# =============================================================================
log "Starting frontend dev server on port ${FRONTEND_PORT}..."
cd "$SCRIPT_DIR"
npm run dev -- --port "$FRONTEND_PORT" &>/tmp/vite-e2e.log &
VITE_PID=$!
log "Vite PID: $VITE_PID"

# Wait for vite to bind to the port
WAITED=0
while [ $WAITED -lt 15 ]; do
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
        log "Vite died during startup. Log:"
        cat /tmp/vite-e2e.log 2>/dev/null || true
        exit 1
    fi
    # Check if vite is listening on the expected port
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/${FRONTEND_PORT}" 2>/dev/null; then
        log "Frontend ready on port ${FRONTEND_PORT} after ${WAITED}s"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -ge 15 ]; then
    log "Frontend failed to start within timeout. Log:"
    cat /tmp/vite-e2e.log 2>/dev/null || true
    exit 1
fi

# =============================================================================
# 4. Run Playwright tests
# =============================================================================
echo ""
log "Running Playwright tests..."
echo ""

npx playwright test --config=playwright.config.ts 2>&1
PLAYWRIGHT_EXIT=$?

# =============================================================================
# 5. Results
# =============================================================================
echo ""
if [ "$PLAYWRIGHT_EXIT" -eq 0 ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  ✅ All Playwright tests passed!"
    echo "═══════════════════════════════════════════════════════════════════════"
else
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  ❌ Playwright tests failed (exit=$PLAYWRIGHT_EXIT)"
    echo "═══════════════════════════════════════════════════════════════════════"
fi

exit $PLAYWRIGHT_EXIT

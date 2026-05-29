#!/bin/bash
# headless_test.sh — Launch Reaper headless, run tests, clean up
#
# This script is the core of the headless testing infrastructure.
# It starts Xvfb if needed, builds & deploys the extension, launches
# Reaper in headless mode, and runs WebSocket connectivity tests.
#
# Usage:
#   bash test/headless_test.sh           # Build, launch, test, cleanup
#   bash test/headless_test.sh --no-build  # Skip build/deploy step
#
# Required: Xvfb, Reaper portable at ~/reaper-portable/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REAPER_DIR="$HOME/reaper-portable"
REAPER_BIN="$REAPER_DIR/reaper"

# Config
DISPLAY_NUM="${DISPLAY_NUM:-99}"
WS_PORT="${WS_PORT:-9224}"
TIMEOUT="${TIMEOUT:-30}"  # Max seconds to wait for WebSocket
BUILD="${BUILD:-1}"       # Build by default

# Parse args
for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        --no-cleanup) CLEANUP=0 ;;
        *) echo "Unknown arg: $arg"; exit 1 ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════"
echo "  reaper-ipad — Headless Test Runner"
echo "═══════════════════════════════════════════"
echo ""

# ---- 1. Check prerequisites ----
info "Checking prerequisites..."

if [ ! -f "$REAPER_BIN" ]; then
    fail "Reaper not found at $REAPER_BIN"
fi
pass "Reaper binary found"

# Check brew ALSA lib
if [ ! -f "/home/linuxbrew/.linuxbrew/lib/libasound.so.2" ]; then
    fail "ALSA library not found (needed by Reaper)"
fi
export LD_LIBRARY_PATH="/home/linuxbrew/.linuxbrew/lib:${LD_LIBRARY_PATH:-}"

# ---- 2. Start Xvfb if needed ----
if ! pgrep -x Xvfb > /dev/null 2>&1; then
    info "Starting Xvfb on :$DISPLAY_NUM..."
    Xvfb ":$DISPLAY_NUM" -screen 0 1024x768x24 &
    XVFB_PID=$!
    sleep 1
    if kill -0 $XVFB_PID 2>/dev/null; then
        pass "Xvfb started (PID: $XVFB_PID)"
    else
        fail "Failed to start Xvfb"
    fi
else
    pass "Xvfb already running"
fi
export DISPLAY=":$DISPLAY_NUM"

# ---- 3. Build and deploy extension ----
if [ "$BUILD" = "1" ]; then
    info "Building extension..."
    cd "$PROJECT_DIR"
    make build 2>&1 | tail -1
    info "Deploying extension..."
    make deploy 2>&1 | tail -1
    pass "Extension built and deployed"
fi

# ---- 4. Kill existing Reaper ----
pkill -x reaper 2>/dev/null || true
sleep 1

# ---- 5. Launch Reaper headless ----
info "Launching Reaper headless..."
"$REAPER_BIN" &
REAPER_PID=$!
info "Reaper PID: $REAPER_PID"

# ---- 6. Wait for WebSocket server ----
info "Waiting for WebSocket on port $WS_PORT..."
for i in $(seq 1 $TIMEOUT); do
    if ss -tlnp 2>/dev/null | grep -q ":$WS_PORT"; then
        pass "WebSocket server ready (port $WS_PORT)"
        break
    fi
    if ! kill -0 $REAPER_PID 2>/dev/null; then
        fail "Reaper died during startup"
    fi
    sleep 1
done

if ! ss -tlnp 2>/dev/null | grep -q ":$WS_PORT"; then
    fail "WebSocket server did not start within ${TIMEOUT}s"
fi

# ---- 7. Run connectivity tests ----
echo ""
info "Running WebSocket connectivity tests..."

# Run the connectivity test script
if [ -f "$SCRIPT_DIR/ws_connect_test.sh" ]; then
    bash "$SCRIPT_DIR/ws_connect_test.sh" "$WS_PORT" || fail "Connectivity test failed"
else
    info "No ws_connect_test.sh found — skipping connectivity tests"
fi

echo ""
pass "All headless tests passed!"
echo ""

# ---- 8. Cleanup ----
cleanup() {
    info "Cleaning up..."
    pkill -x reaper 2>/dev/null || true
    info "Done."
}
cleanup

exit 0

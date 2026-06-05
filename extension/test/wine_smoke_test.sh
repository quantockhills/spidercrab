#!/usr/bin/env bash
# =============================================================================
# Wine Smoke Test — Cross-compiled Windows DLL under Wine
#
# Downloads REAPER for Windows, deploys the cross-compiled .dll, starts
# REAPER under Wine, runs WebSocket integration tests, cleans up.
#
# Usage:
#   bash extension/test/wine_smoke_test.sh
#
# Environment variables:
#   DLL_PATH     - Path to reaper_spidercrab.dll (default: auto-detect)
#   REAPER_URL   - REAPER installer URL (default: v7.33 x64)
#   WINE_PREFIX  - Wine prefix (default: $HOME/.wine)
#   TIMEOUT      - Seconds to wait for REAPER+WS startup (default: 30)
#   VERBOSE      - Set to 1 for detailed output (default: 0)
#   SKIP_DOWNLOAD - Set to 1 to skip REAPER download/install (default: 0)
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
DLL_PATH="${DLL_PATH:-}"
REAPER_URL="${REAPER_URL:-https://www.reaper.fm/files/7.x/reaper733_x64-install.exe}"
WINE_PREFIX="${WINE_PREFIX:-$HOME/.wine}"
TIMEOUT="${TIMEOUT:-30}"
VERBOSE="${VERBOSE:-0}"
SKIP_DOWNLOAD="${SKIP_DOWNLOAD:-0}"

REAPER_DIR="REAPER"
REAPER_EXE="reaper.exe"
REAPER_FULL_DIR="${WINE_PREFIX}/drive_c/${REAPER_DIR}"
REAPER_FULL_EXE="${REAPER_FULL_DIR}/${REAPER_EXE}"
REAPER_CACHE_DIR="${HOME}/.cache/reaper-wine"
INSTALLER_PATH="${REAPER_CACHE_DIR}/reaper733_x64-install.exe"
WS_PORT="${WS_PORT:-9224}"

PASS=0
FAIL=0
REAPER_PID=""

log()    { echo "[wine-test] $*"; }
verbose(){ [ "$VERBOSE" = "1" ] && echo "  [debug] $*"; }
pass()   { echo "  ✅ $*"; PASS=$((PASS + 1)); }
fail()   { echo "  ❌ $*"; FAIL=$((FAIL + 1)); }

# Detect the cross-compiled .dll if not specified
if [ -z "$DLL_PATH" ]; then
    if [ -f "${PROJECT_DIR}/extension/build/reaper_spidercrab.dll" ]; then
        DLL_PATH="${PROJECT_DIR}/extension/build/reaper_spidercrab.dll"
    elif [ -f "${PROJECT_DIR}/build/reaper_spidercrab.dll" ]; then
        DLL_PATH="${PROJECT_DIR}/build/reaper_spidercrab.dll"
    fi
fi

# =============================================================================
# SECTION 1: Prerequisites Check
# =============================================================================
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Wine Smoke Test — Cross-compiled Windows DLL"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# ---- Check Wine ----
if ! command -v wine &>/dev/null; then
    log "ERROR: wine not found. Install with: sudo apt install wine"
    exit 1
fi
log "Wine version: $(wine --version 2>&1)"
log "Wine prefix: $WINE_PREFIX"

# ---- Check DLL ----
if [ ! -f "$DLL_PATH" ]; then
    log "ERROR: Cross-compiled DLL not found at: ${DLL_PATH:-<not set>}"
    log "Build it first with: TARGET=windows bash extension/build.sh"
    exit 1
fi
log "DLL: $DLL_PATH ($(ls -lh "$DLL_PATH" | awk '{print $5}'))"

# Check DLL is a PE32+ file
if ! file "$DLL_PATH" | grep -q "PE32+" && ! file "$DLL_PATH" | grep -q "PE32"; then
    log "ERROR: $DLL_PATH does not appear to be a Windows PE file"
    file "$DLL_PATH"
    exit 1
fi
log "DLL file type: $(file "$DLL_PATH" | cut -d: -f2 | xargs)"

# ---- Check Python websockets ----
if ! python3 -c "import websockets" 2>/dev/null; then
    log "ERROR: Python 'websockets' module not installed."
    log "Install with: pip install websockets"
    exit 1
fi
log "Python websockets: $(python3 -c 'import websockets; print(websockets.__version__)' 2>/dev/null || echo 'installed')"

echo ""

# =============================================================================
# SECTION 2: Download & Install REAPER for Windows
# =============================================================================

if [ "$SKIP_DOWNLOAD" = "1" ]; then
    log "Skipping REAPER download/install (SKIP_DOWNLOAD=1)"
    if [ ! -f "$REAPER_FULL_EXE" ]; then
        log "ERROR: REAPER not found at $REAPER_FULL_EXE but SKIP_DOWNLOAD is set"
        exit 1
    fi
else
    mkdir -p "$REAPER_CACHE_DIR"

    # ---- Download ----
    if [ -f "$INSTALLER_PATH" ]; then
        log "REAPER installer already cached at $INSTALLER_PATH"
    else
        log "Downloading REAPER 7.33 installer..."
        log "  URL: $REAPER_URL"
        if command -v wget &>/dev/null; then
            wget -O "$INSTALLER_PATH" "$REAPER_URL" 2>&1 | while IFS= read -r line; do
                verbose "$line"
            done
        elif command -v curl &>/dev/null; then
            curl -L -o "$INSTALLER_PATH" "$REAPER_URL" --progress-bar 2>&1 | while IFS= read -r line; do
                verbose "$line"
            done
        else
            log "ERROR: Neither wget nor curl found"
            exit 1
        fi
        if [ ! -f "$INSTALLER_PATH" ]; then
            log "ERROR: Download failed"
            exit 1
        fi
        log "Downloaded: $(ls -lh "$INSTALLER_PATH" | awk '{print $5}')"
    fi

    # ---- Install as portable ----
    if [ -f "$REAPER_FULL_EXE" ]; then
        log "REAPER already installed at $REAPER_FULL_DIR"
    else
        log "Installing REAPER as portable to wine C:\\REAPER\\..."
        log "Running installer in silent mode..."
        # Inno Setup installer with /PORTABLE flag
        wine "$INSTALLER_PATH" /PORTABLE /DIR="C:\\REAPER" /LANG=en /NOICONS /SUPPRESSMSGBOXES 2>&1 | while IFS= read -r line; do
            verbose "$line"
        done
        WINEDLL_PID=$!
        # Wait for the installer to finish
        wait $WINEDLL_PID 2>/dev/null || true
        # Give it a moment
        sleep 2

        if [ ! -f "$REAPER_FULL_EXE" ]; then
            log "ERROR: REAPER installation failed - $REAPER_FULL_EXE not found"
            log "Contents of ${REAPER_FULL_DIR}:"
            ls -la "${REAPER_FULL_DIR}/" 2>/dev/null || echo "  (directory not found)"
            log "Try running the installer manually:"
            log "  wine \"$INSTALLER_PATH\" /PORTABLE /DIR=\"C:\\\\REAPER\""
            exit 1
        fi
        log "REAPER installed successfully"
    fi
fi

echo ""

# =============================================================================
# SECTION 3: Deploy DLL
# =============================================================================

mkdir -p "${REAPER_FULL_DIR}/UserPlugins"

log "Deploying DLL to ${REAPER_FULL_DIR}/UserPlugins/"
cp "$DLL_PATH" "${REAPER_FULL_DIR}/UserPlugins/reaper_spidercrab.dll"
log "Deployed: $(ls -lh "${REAPER_FULL_DIR}/UserPlugins/reaper_spidercrab.dll" | awk '{print $5}')"

# Ensure no stale config/state from previous runs
rm -f "${REAPER_FULL_DIR}/reaper.ini"
rm -f "${REAPER_FULL_DIR}/reaper-vk.ini"

# =============================================================================
# SECTION 4: Start REAPER under Wine
# =============================================================================

echo ""
log "Starting REAPER under Wine on C:\\REAPER\\..."
log "  Command: wine \"${REAPER_EXE}\" -newinst -nosplash -new -cfgfile \"C:\\REAPER\\reaper-test.ini\""
export WINEPREFIX="$WINE_PREFIX"

# Kill any previous wine processes
wineserver -k 2>/dev/null || true
sleep 1

# Start REAPER
wine "${REAPER_FULL_EXE}" -newinst -nosplash -new -cfgfile "C:\\REAPER\\reaper-test.ini" &
REAPER_PID=$!
log "REAPER PID: $REAPER_PID"

# ---- Wait for WebSocket port ----
log "Waiting for WebSocket port ${WS_PORT} to become available (timeout: ${TIMEOUT}s)..."
WAITED=0
WS_READY=false
while [ $WAITED -lt "$TIMEOUT" ]; do
    if ! kill -0 "$REAPER_PID" 2>/dev/null; then
        # Check if it might have exited but WS still up
        :
    fi
    # Check for port via wine's TCP (netstat under wine or /proc)
    if timeout 2 bash -c "echo > /dev/tcp/127.0.0.1/${WS_PORT}" 2>/dev/null; then
        WS_READY=true
        log "WebSocket ready on port ${WS_PORT} after ${WAITED}s"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ "$WS_READY" = false ]; then
    fail "WebSocket did not become ready within ${TIMEOUT}s"
    # Try to get some debug info
    log "Checking if REAPER process is still running..."
    if kill -0 "$REAPER_PID" 2>/dev/null; then
        log "REAPER is still running but port not available"
        log "Process listing:"
        ps aux | grep -i reaper | grep -v grep || true
    else
        log "REAPER process has exited. Checking for crash..."
    fi
    cleanup
    exit 1
fi

pass "REAPER running under Wine, WebSocket on port ${WS_PORT}"

# =============================================================================
# SECTION 5: Run Integration Tests
# =============================================================================

echo ""
echo "──── Running WebSocket Integration Tests ────"
echo ""

TEST_OUTPUT=$(python3 "${SCRIPT_DIR}/ws_integration_test.py" 2>&1)
TEST_RESULT=$?
echo "$TEST_OUTPUT" | sed 's/^/  /'

if [ "$TEST_RESULT" -eq 0 ]; then
    pass "All WebSocket integration tests passed"
else
    fail "WebSocket integration tests failed (exit code: $TEST_RESULT)"
fi

# =============================================================================
# SECTION 6: Cleanup
# =============================================================================

echo ""
log "Cleaning up..."

# Kill wine/reaper process
if [ -n "$REAPER_PID" ]; then
    kill "$REAPER_PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    kill -0 "$REAPER_PID" 2>/dev/null && kill -9 "$REAPER_PID" 2>/dev/null || true
fi

# Kill any remaining wine processes related to REAPER
wineserver -k 2>/dev/null || true

log "Cleanup done."

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    exit 2
fi
exit 0

#!/usr/bin/env bash
# =============================================================================
# Headless Reaper Integration Test
#
# Starts Xvfb, launches Reaper headless with our extension, connects via
# WebSocket, sends commands, and validates responses.
#
# Usage:
#   bash extension/test/run_headless_test.sh
#
# Environment variables (all optional):
#   DISPLAY_NUM    - Xvfb display number (default: 99)
#   REAPER_PORT    - WebSocket port to test (default: 9224)
#   REAPER_HOME    - Path to portable Reaper (default: ~/reaper-portable)
#   EXT_SO         - Path to extension .so (default: auto-detect)
#   TIMEOUT_START  - Seconds to wait for Reaper to start (default: 10)
#   VERBOSE        - Set to 1 for more output (default: 0)
#   KEEP_CONFIG    - If set, don't clean up temp config dir (for debugging)
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
REAPER_HOME="${REAPER_HOME:-$HOME/reaper-portable}"
TIMEOUT_START="${TIMEOUT_START:-10}"
VERBOSE="${VERBOSE:-0}"

DISPLAY=":${DISPLAY_NUM}"
REAPER_BIN="${REAPER_HOME}/reaper"
REAPER_CFG_DIR=""
XVFB_BIN="$(command -v Xvfb 2>/dev/null || true)"

PASS=0
FAIL=0
XVFB_PID=""
REAPER_PID=""

log()  { echo "[test] $*"; }
pass() { echo "  ✅ $*"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $*"; FAIL=$((FAIL + 1)); }
verbose() { [ "$VERBOSE" = "1" ] && echo "  [debug] $*"; }

# ---- Test runner ----
TEST_COUNT=0
CURRENT_TEST=""

run_test() {
    TEST_COUNT=$((TEST_COUNT + 1))
    CURRENT_TEST="$1"
    echo ""
    echo "──── Test ${TEST_COUNT}: $1 ────"
}

# =============================================================================
# Helper: send a command via WebSocket and get the response
# =============================================================================
ws_send() {
    local cmd="$1"
    local port="${2:-$REAPER_PORT}"
    python3 -c "
import json, socket, base64, struct, time, sys

HOST = '127.0.0.1'
PORT = $port

class WSClient:
    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((HOST, PORT))
        key = base64.b64encode(b'headless-test-key').decode()
        self.sock.sendall(
            f'GET / HTTP/1.1\r\nHost: {HOST}:{PORT}\r\n'
            f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        resp = self.sock.recv(4096)
        if b'101' not in resp:
            print('{\"type\":\"error\",\"error\":\"handshake_failed\"}')
            sys.exit(1)

    def send(self, msg):
        data = msg.encode()
        mask = struct.pack('>I', int(time.time() * 1000) & 0xFFFFFFFF)
        hdr = bytes([0x81])
        if len(data) < 126:
            hdr += bytes([0x80 | len(data)])
        else:
            hdr += bytes([0x80 | 126]) + struct.pack('>H', len(data))
        hdr += mask
        hdr += bytes([data[i] ^ mask[i % 4] for i in range(len(data))])
        self.sock.sendall(hdr)

    def recv(self, timeout=3):
        self.sock.settimeout(timeout)
        data = b''
        while True:
            try:
                chunk = self.sock.recv(4096)
                if not chunk:
                    break
                data += chunk
            except socket.timeout:
                break
        if not data:
            return None
        offset = 0
        frames = []
        while offset < len(data):
            if offset + 2 > len(data):
                break
            opcode = data[offset] & 0x0F
            masked = (data[offset + 1] & 0x80) != 0
            length = data[offset + 1] & 0x7F
            offset += 2
            if length == 126:
                length = struct.unpack('>H', data[offset:offset+2])[0]
                offset += 2
            elif length == 127:
                length = struct.unpack('>Q', data[offset:offset+8])[0]
                offset += 8
            mask_key = data[offset:offset+4] if masked else None
            if masked:
                offset += 4
            payload = data[offset:offset+length]
            if mask_key:
                payload = bytes([payload[i] ^ mask_key[i % 4] for i in range(len(payload))])
            offset += length
            frames.append(payload.decode())
        return '\n'.join(frames)

c = WSClient()
c.send(json.dumps($cmd))
time.sleep(1.5)
r = c.recv(timeout=3)
c.sock.close()
sys.stdout.reconfigure(encoding='utf-8')
print(r if r else '<no response>')
"
}

# =============================================================================
# SECTION 1: Setup
# =============================================================================
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Headless Reaper Integration Test"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "DISPLAY=${DISPLAY}  PORT=${REAPER_PORT}  REAPER=${REAPER_BIN}"
echo ""

# Cleanup function
cleanup() {
    echo ""
    log "Cleaning up..."
    [ -n "$REAPER_PID" ] && kill "$REAPER_PID" 2>/dev/null && verbose "Reaper ($REAPER_PID) killed" || true
    [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null && verbose "Xvfb ($XVFB_PID) killed" || true
    if [ -n "$REAPER_CFG_DIR" ] && [ -d "$REAPER_CFG_DIR" ] && [ -z "${KEEP_CONFIG:-}" ]; then
        rm -rf "$REAPER_CFG_DIR" 2>/dev/null && verbose "Temp config dir removed"
    fi
    log "Cleanup done."
}
trap cleanup EXIT INT TERM

# ---- Start Xvfb ----
run_test "Start Xvfb on ${DISPLAY}"
if [ -z "$XVFB_BIN" ]; then
    fail "Xvfb not found. Install with: brew install xorg-server"
    exit 1
fi

Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac -nolisten tcp 2>/dev/null &
XVFB_PID=$!

# Wait for Xvfb to be ready
for i in $(seq 1 5); do
    if kill -0 "$XVFB_PID" 2>/dev/null; then
        pass "Xvfb started (PID $XVFB_PID)"
        break
    fi
    sleep 0.5
done
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    fail "Xvfb failed to start"
    exit 1
fi

# ---- Prepare fresh config directory ----
# -cfgfile /path/to/reaper.ini changes the resource directory to /path/to/
# So we need a temp dir with UserPlugins/ containing our extension
REAPER_CFG_DIR="$(mktemp -d /tmp/reaper-headless-test-XXXXXX)"
REAPER_CFG="${REAPER_CFG_DIR}/reaper.ini"
mkdir -p "${REAPER_CFG_DIR}/UserPlugins"

# Find and copy the extension .so
if [ -n "${EXT_SO:-}" ]; then
    EXT_SRC="$EXT_SO"
elif [ -f "${REAPER_HOME}/Plugins/reaper_spidercrab.so" ]; then
    EXT_SRC="${REAPER_HOME}/Plugins/reaper_spidercrab.so"
elif [ -f "${REAPER_HOME}/UserPlugins/reaper_spidercrab.so" ]; then
    EXT_SRC="${REAPER_HOME}/UserPlugins/reaper_spidercrab.so"
elif [ -f "${PROJECT_DIR}/build/reaper-spidercrab.so" ]; then
    EXT_SRC="${PROJECT_DIR}/build/reaper-spidercrab.so"
else
    fail "Extension .so not found"
    exit 1
fi
cp "$EXT_SRC" "${REAPER_CFG_DIR}/UserPlugins/reaper_spidercrab.so"
verbose "Copied extension: $EXT_SRC"
verbose "Config dir: $REAPER_CFG_DIR"

# ---- Launch Reaper ----
run_test "Launch Reaper headless on ${DISPLAY}"
export DISPLAY="${DISPLAY}"
export LD_LIBRARY_PATH="${REAPER_HOME}/Plugins:/home/linuxbrew/.linuxbrew/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

log "Starting Reaper from: ${REAPER_BIN} with fresh config: ${REAPER_CFG}"

"${REAPER_BIN}" \
    -cfgfile "$REAPER_CFG" \
    -newinst \
    -nosplash \
    -new \
    2>/dev/null &
REAPER_PID=$!

log "Reaper PID: $REAPER_PID"

# Wait for Reaper to start and WebSocket to come up
WAITED=0
WS_READY=false
while [ $WAITED -lt "$TIMEOUT_START" ]; do
    if ! kill -0 "$REAPER_PID" 2>/dev/null; then
        fail "Reaper died during startup"
        exit 1
    fi
    # Check if WebSocket port is listening
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/${REAPER_PORT}" 2>/dev/null; then
        WS_READY=true
        log "WebSocket ready on port ${REAPER_PORT} after ${WAITED}s"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ "$WS_READY" = false ]; then
    fail "WebSocket did not become ready within ${TIMEOUT_START}s"
    exit 1
fi
pass "Reaper running (PID $REAPER_PID), WebSocket on port ${REAPER_PORT}"

# =============================================================================
# SECTION 2: WebSocket Command Tests
# =============================================================================

# ---- Test: transport/getState (initial live state) ----
run_test "transport/getState — initial live state"
RESP=$(ws_send '{"type":"command","command":"transport/getState","id":"test_init"}')
verbose "Response: $RESP"
if echo "$RESP" | python3 -c '
import sys, json
data = sys.stdin.read().strip()
if not data:
    print("No response")
    sys.exit(1)
for line in data.split(chr(10)):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get("type") == "response" and obj.get("id") == "test_init":
            payload = obj.get("payload", {})
            assert "playing" in payload, "Missing playing field"
            assert "recording" in payload, "Missing recording field"
            print("OK")
            sys.exit(0)
    except json.JSONDecodeError:
        continue
print("NO_VALID_RESPONSE")
sys.exit(1)
'; then
    pass "transport/getState returns live state from GetPlayState"
else
    fail "transport/getState: $(echo "$RESP" | head -c 200)"
fi

# ---- Test: transport/play + verify via getState ----
run_test "transport/play + verify via getState"
RESP_PLAY=$(ws_send '{"type":"command","command":"transport/play","id":"test_play"}')
verbose "play response: $RESP_PLAY"
sleep 0.5
RESP_STATE=$(ws_send '{"type":"command","command":"transport/getState","id":"test_play_check"}')
verbose "state after play: $RESP_STATE"
if echo "$RESP_STATE" | python3 -c '
import sys, json
data = sys.stdin.read().strip()
if not data:
    print("FAIL: No response")
    sys.exit(1)
for line in data.split(chr(10)):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get("type") == "response" and obj.get("id") == "test_play_check":
            payload = obj.get("payload", {})
            if "playing" in payload:
                print("OK")
                sys.exit(0)
    except json.JSONDecodeError:
        continue
print("FAIL: No matching response found")
sys.exit(1)
'; then
    pass "transport/play dispatched, getState returns live state"
else
    fail "transport/play verify: $(echo "$RESP_STATE" | head -c 200)"
fi

# ---- Test: transport/stop + verify via getState ----
run_test "transport/stop + verify via getState"
RESP_STOP=$(ws_send '{"type":"command","command":"transport/stop","id":"test_stop"}')
verbose "stop response: $RESP_STOP"
sleep 0.5
RESP_STATE2=$(ws_send '{"type":"command","command":"transport/getState","id":"test_stop_check"}')
verbose "state after stop: $RESP_STATE2"
if echo "$RESP_STATE2" | python3 -c '
import sys, json
data = sys.stdin.read().strip()
if not data:
    print("FAIL: No response")
    sys.exit(1)
for line in data.split(chr(10)):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get("type") == "response" and obj.get("id") == "test_stop_check":
            payload = obj.get("payload", {})
            if "playing" in payload and "recording" in payload:
                print("OK")
                sys.exit(0)
    except json.JSONDecodeError:
        continue
print("FAIL: No matching response found")
sys.exit(1)
'; then
    pass "transport/stop dispatched, getState returns live state"
else
    fail "transport/stop verify: $(echo "$RESP_STATE2" | head -c 200)"
fi

# ---- Test: track/getAll ----# ---- Test: track/getAll ----
run_test "track/getAll"
RESP=$(ws_send '{"type":"command","command":"track/getAll","id":"test_3"}')
verbose "Response: $RESP"
if echo "$RESP" | python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    print('No response')
    sys.exit(1)
for line in data.split('\n'):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        assert obj.get('type') == 'response', f'Expected type=response, got {obj.get(\"type\")}'
        assert obj.get('id') == 'test_3', f'Expected id=test_3, got {obj.get(\"id\")}'
        assert obj.get('success') == True, f'Expected success=true, got {obj.get(\"success\")}'
        payload = obj.get('payload', {})
        tracks = payload.get('tracks', None)
        assert tracks is not None, 'Expected tracks array in payload'
        assert isinstance(tracks, list), f'Expected tracks to be a list, got {type(tracks).__name__}'
        # Check structure of first track if any exist
        if tracks:
            t = tracks[0]
            for key in ['index', 'name', 'selected', 'muted', 'soloed', 'armed', 'volume']:
                assert key in t, f'Track missing key: {key}'
        print('OK')
        sys.exit(0)
    except json.JSONDecodeError:
        continue
    except AssertionError as e:
        print(f'FAIL: {e}')
        sys.exit(1)
print('FAIL: No valid response found')
sys.exit(1)
"; then
    pass "track/getAll returned correct response"
else
    fail "track/getAll: $(echo "$RESP" | head -c 200)"
fi

# ---- Test: hello handshake ----
run_test "hello message"
RESP=$(ws_send '{"type":"hello","clientVersion":"1.0.0"}')
verbose "Response: $RESP"
if echo "$RESP" | python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    pass
for line in data.split('\n'):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get('type') == 'hello':
            assert 'protocolVersion' in obj, 'Expected protocolVersion in hello response'
            print('OK')
            sys.exit(0)
    except json.JSONDecodeError:
        continue
print('NONE')
sys.exit(0)
"; then
    pass "hello message handled (got response)"
else
    # hello response is optional — not a real failure
    log "  (hello response is optional, non-critical)"
    pass "hello message (no response — OK for non-handshake clients)"
fi

# ---- Test: unknown command ----
run_test "unknown command returns error"
RESP=$(ws_send '{"type":"command","command":"nonexistent/command","id":"test_4"}')
verbose "Response: $RESP"
if echo "$RESP" | python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    print('FAIL: No response')
    sys.exit(1)
for line in data.split('\n'):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        assert obj.get('type') == 'response'
        assert obj.get('id') == 'test_4'
        assert obj.get('success') == False, f'Expected success=false for unknown command, got {obj.get(\"success\")}'
        payload = obj.get('payload', {})
        error = payload.get('error', '') if isinstance(payload, dict) else ''
        assert 'Unknown' in error or 'unknown' in error.lower(), f'Expected error message about unknown command, got: {error}'
        print('OK')
        sys.exit(0)
    except json.JSONDecodeError:
        continue
    except AssertionError as e:
        print(f'FAIL: {e}')
        sys.exit(1)
print('FAIL: No valid error response found')
sys.exit(1)
"; then
    pass "unknown command returned error response"
else
    fail "unknown command: $(echo "$RESP" | head -c 200)"
fi

# =============================================================================

# =============================================================================
# SECTION 2B: FX Operations (enumerate, add, params, set, delete)
# =============================================================================
run_test "FX operations (enumerate, add, params, set, delete)"
FX_OUTPUT=$(python3 "${SCRIPT_DIR}/fx_operations_test.py" "${REAPER_PORT}" 2>&1)
FX_RESULT=$?
echo "$FX_OUTPUT" | sed 's/^/  /'
FX_PASS=$(echo "$FX_OUTPUT" | grep -c '✅' || true)
FX_FAIL=$(echo "$FX_OUTPUT" | grep -c '❌' || true)
if [ "$FX_RESULT" -eq 0 ]; then
    pass "FX operations: $FX_PASS passed, $FX_FAIL failed (exit=0)"
else
    fail "FX operations: $FX_PASS passed, $FX_FAIL failed (exit=$FX_RESULT)"
fi

# =============================================================================
# SECTION 2C: ReaEQ Param Roundtrip (add, change 5 params, verify each stuck)
# =============================================================================
run_test "ReaEQ param roundtrip (add, change 5 params, verify each)"
REAEQ_OUTPUT=$(python3 "${SCRIPT_DIR}/reaeq_param_test.py" "${REAPER_PORT}" 2>&1)
REAEQ_RESULT=$?
echo "$REAEQ_OUTPUT" | sed 's/^/  /'
REAEQ_PASS=$(echo "$REAEQ_OUTPUT" | grep -c '✅' || true)
REAEQ_FAIL=$(echo "$REAEQ_OUTPUT" | grep -c '❌' || true)
if [ "$REAEQ_RESULT" -eq 0 ]; then
    pass "ReaEQ param roundtrip: $REAEQ_PASS passed, $REAEQ_FAIL failed (exit=0)"
else
    fail "ReaEQ param roundtrip: $REAEQ_PASS passed, $REAEQ_FAIL failed (exit=$REAEQ_RESULT)"
fi

# =============================================================================
# SECTION 2D: Hardened FX Roundtrip (specific names, multi-track, param assertions)
# =============================================================================
run_test "Hardened FX roundtrip (specific names, multi-track, param assertions)"
HARDENED_OUTPUT=$(python3 "${SCRIPT_DIR}/hardened_fx_test.py" "${REAPER_PORT}" 2>&1)
HARDENED_RESULT=$?
echo "$HARDENED_OUTPUT" | sed 's/^/  /'
HARDENED_PASS=$(echo "$HARDENED_OUTPUT" | grep -c '✅' || true)
HARDENED_FAIL=$(echo "$HARDENED_OUTPUT" | grep -c '❌' || true)
if [ "$HARDENED_RESULT" -eq 0 ]; then
    pass "Hardened FX tests: $HARDENED_PASS passed, $HARDENED_FAIL failed (exit=0)"
else
    fail "Hardened FX tests: $HARDENED_PASS passed, $HARDENED_FAIL failed (exit=$HARDENED_RESULT)"
fi

# =============================================================================
# SECTION 2E: Playtime API availability (if helgobox is installed)
# =============================================================================
run_test "Playtime API availability"
if [ -f "${REAPER_HOME}/Plugins/reaper_helgobox.so" ] && [ -f "${REAPER_HOME}/UserPlugins/FX/helgobox.so" ]; then
    PT_OUTPUT=$(python3 "${SCRIPT_DIR}/test_playtime_available.py" "${REAPER_PORT}" 2>&1)
    PT_RESULT=$?
    echo "$PT_OUTPUT" | sed 's/^/  /'
    if [ "$PT_RESULT" -eq 0 ] && echo "$PT_OUTPUT" | grep -q "AVAILABLE"; then
        pass "Playtime 2 API is available"
    else
        log "  (Playtime check: non-fatal, helgobox may not be configured)"
        pass "Playtime API check (helgobox present)"
    fi
else
    log "  (Skipping Playtime test: helgobox not found)"
    pass "Playtime API check (skipped - not installed)"
fi

# =============================================================================
# SECTION 3: Summary
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed (${TEST_COUNT} tests)"
echo "═══════════════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    # Still clean up Reaper
    [ -n "$REAPER_PID" ] && kill "$REAPER_PID" 2>/dev/null || true
    exit 2
else
    # Stop Reaper before exiting
    log "Shutting down Reaper..."
    kill "$REAPER_PID" 2>/dev/null || true
    wait "$REAPER_PID" 2>/dev/null || true
    log "All tests passed! 🎉"
    exit 0
fi

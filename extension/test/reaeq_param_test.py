#!/usr/bin/env python3
"""
ReaEQ Param Roundtrip Integration Test

Connects to a running Reaper instance via WebSocket and:
1. Adds ReaEQ to track 0
2. Gets all parameters
3. Changes 5 different parameters (gain on each band + master gain)
4. After each change, re-reads params to confirm the value stuck

Usage: python3 reaeq_param_test.py [port=9224]

Exit codes:
  0 - All tests passed
  1 - Connection/network error
  2 - One or more tests failed
"""

import json, socket, base64, struct, time, sys

HOST = '127.0.0.1'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9224

PASS = 0
FAIL = 0

def log(msg):    print(f"  [reaEQ] {msg}")
def passed(msg): global PASS; PASS += 1; print(f"    ✅ {msg}")
def failed(msg): global FAIL; FAIL += 1; print(f"    ❌ {msg}")

# ── WebSocket helpers ────────────────────────────────────────────────

class WSClient:
    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((HOST, PORT))
        key = base64.b64encode(b'reaeq-test-key').decode()
        self.sock.sendall(
            f'GET / HTTP/1.1\r\nHost: {HOST}:{PORT}\r\n'
            f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        resp = self.sock.recv(4096)
        if b'101' not in resp:
            raise RuntimeError('WebSocket handshake failed')

    def send(self, msg):
        data = json.dumps(msg).encode()
        mask = struct.pack('>I', int(time.time() * 1000) & 0xFFFFFFFF)
        hdr = bytes([0x81])
        if len(data) < 126:
            hdr += bytes([0x80 | len(data)])
        else:
            hdr += bytes([0x80 | 126]) + struct.pack('>H', len(data))
        hdr += mask
        hdr += bytes([data[i] ^ mask[i % 4] for i in range(len(data))])
        self.sock.sendall(hdr)

    def recv_raw(self, timeout=3):
        self.sock.settimeout(timeout)
        data = b''
        try:
            while True:
                chunk = self.sock.recv(65536)
                if not chunk:
                    break
                data += chunk
        except socket.timeout:
            pass
        return data

    def recv(self, timeout=3):
        data = self.recv_raw(timeout)
        frames = []
        offset = 0
        while offset < len(data):
            if offset + 2 > len(data):
                break
            _masked_flag = (data[offset + 1] & 0x80) != 0
            length = data[offset + 1] & 0x7F
            offset += 2
            if length == 126:
                length = struct.unpack('>H', data[offset:offset+2])[0]
                offset += 2
            elif length == 127:
                length = struct.unpack('>Q', data[offset:offset+8])[0]
                offset += 8
            masked = _masked_flag
            mk = data[offset:offset+4] if masked else None
            if masked:
                offset += 4
            payload = data[offset:offset+length]
            if mk:
                payload = bytes([payload[i] ^ mk[i % 4] for i in range(len(payload))])
            offset += length
            try:
                frames.append(json.loads(payload.decode()))
            except json.JSONDecodeError:
                pass
        return frames

    def close(self):
        self.sock.close()


def send_and_recv(client, cmd, timeout=1.5):
    """Send a command and return matching response frames."""
    client.send(cmd)
    time.sleep(timeout)
    return client.recv()


# ── Setup: Create track 0 ────────────────────────────────────────────
print("\n──── ReaEQ Setup: Create track 0 ────")
try:
    c = WSClient()
    frames = send_and_recv(c, {"type": "command", "command": "track/add", "id": "req_setup"})
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "req_setup":
            added = f.get("payload", {}).get("added", False)
            if added:
                passed("Track 0 created for FX testing")
            else:
                failed("track/add did not return added=true")
            break
    else:
        failed("track/add returned no response")
    c.close()
except Exception as e:
    failed(f"track/add error: {e}")
    sys.exit(1)


# ── Test 1: Add ReaEQ to track 0 ─────────────────────────────────────
print("\n──── ReaEQ Test 1: Add ReaEQ to track 0 ────")
try:
    c = WSClient()

    frames = send_and_recv(c, {
        "type": "command", "command": "fx/add", "id": "req_a1",
        "payload": {"trackIdx": 0, "fxName": "ReaEQ"}
    })

    fx_idx = -1
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "req_a1":
            fx_idx = f.get("payload", {}).get("fxIdx", -1)
            break

    if fx_idx >= 0:
        passed(f"ReaEQ added to track 0 (fxIdx={fx_idx})")
    else:
        # Try "VST: ReaEQ (Cockos)" as alternative name
        c.close()
        c = WSClient()
        frames = send_and_recv(c, {
            "type": "command", "command": "fx/add", "id": "req_a1b",
            "payload": {"trackIdx": 0, "fxName": "VST: ReaEQ (Cockos)"}
        })
        for f in frames:
            if f.get("type") == "response" and f.get("id") == "req_a1b":
                fx_idx = f.get("payload", {}).get("fxIdx", -1)
                break
        if fx_idx >= 0:
            passed(f"ReaEQ added via full name (fxIdx={fx_idx})")
        else:
            failed("Could not add ReaEQ to track 0")
            log("ReaEQ may not be installed — trying any available plugin for testing")
            # Fall back to first available plugin
            frames = send_and_recv(c, {
                "type": "command", "command": "fx/enumerate", "id": "req_en"
            })
            fx_list = []
            for f in frames:
                if f.get("type") == "response" and f.get("id") == "req_en":
                    fx_list = f.get("payload", {}).get("fx", [])
                    break
            if fx_list:
                fallback_name = fx_list[0]['name']
                log(f"Falling back to first available plugin: '{fallback_name}'")
                c.close()
                c = WSClient()
                frames = send_and_recv(c, {
                    "type": "command", "command": "fx/add", "id": "req_a2",
                    "payload": {"trackIdx": 0, "fxName": fallback_name}
                })
                for f in frames:
                    if f.get("type") == "response" and f.get("id") == "req_a2":
                        fx_idx = f.get("payload", {}).get("fxIdx", -1)
                        break
                if fx_idx >= 0:
                    passed(f"Fallback plugin added (fxIdx={fx_idx})")
                else:
                    failed(f"Could not add fallback plugin '{fallback_name}'")
                    c.close()
                    sys.exit(2)
            else:
                failed("No plugins available at all")
                c.close()
                sys.exit(2)

except Exception as e:
    failed(f"Add ReaEQ error: {e}")
    c.close()
    sys.exit(1)

# ── Test 2: Get ReaEQ parameters ─────────────────────────────────────
print("\n──── ReaEQ Test 2: Get parameters ────")
try:
    frames = send_and_recv(c, {
        "type": "command", "command": "fx/getParams", "id": "req_p1",
        "payload": {"trackIdx": 0, "fxIdx": fx_idx}
    })

    params = []
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "req_p1":
            params = f.get("payload", {}).get("params", [])
            break

    if not params:
        failed("fx/getParams returned empty params array")
        c.close()
        sys.exit(2)

    passed(f"fx/getParams returned {len(params)} parameter(s)")

    # Log the first 8 params for debugging
    for p in params[:8]:
        log(f"  param[{p['index']}]: {p['name']} = {p['value']:.4f} (range {p['min']}..{p['max']})")

    # Check schema
    p0 = params[0]
    for key in ['index', 'name', 'value', 'min', 'max', 'mid']:
        if key not in p0:
            failed(f"Param schema missing key: {key}")
    else:
        passed("Parameter schema valid")

except Exception as e:
    failed(f"Get params error: {e}")
    c.close()
    sys.exit(2)


# ── Test 3: Change 5 different parameters ────────────────────────────
print("\n──── ReaEQ Test 3: Change 5 params + verify each ────")

# Pick 5 distinct parameters (indices 0-4, or up to available count)
num_to_test = min(5, len(params))
chosen_params = params[:num_to_test]

# For each param, compute a distinct new value that's clearly different
# Use a value in the middle of the range to avoid extremes
param_changes = []
for p in chosen_params:
    pmin = p['min']
    pmax = p['max']
    mid = p['mid']
    cur = p['value']
    # Set to ~midpoint of range (or if currently at mid, offset slightly)
    target = mid
    if abs(target - cur) < 0.05:
        # Current value is already near midpoint, move to 75% of range
        target = pmin + (pmax - pmin) * 0.75
    param_changes.append((p['index'], target))

all_stuck = True
for idx, (param_idx, new_val) in enumerate(param_changes):
    try:
        # Send the set command
        frames = send_and_recv(c, {
            "type": "command", "command": "fx/setParam", "id": f"req_s{idx}",
            "payload": {"trackIdx": 0, "fxIdx": fx_idx,
                        "paramIdx": param_idx, "value": new_val}
        })

        set_ok = False
        for f in frames:
            if f.get("type") == "response" and f.get("id") == f"req_s{idx}":
                set_ok = f.get("payload", {}).get("set", False)
                break

        if not set_ok:
            failed(f"fx/setParam param[{param_idx}] returned set=false")
            all_stuck = False
            continue

        # Re-read params to verify the change stuck
        c2 = WSClient()  # fresh connection to avoid stale receive buffer
        frames2 = send_and_recv(c2, {
            "type": "command", "command": "fx/getParams", "id": f"req_v{idx}",
            "payload": {"trackIdx": 0, "fxIdx": fx_idx}
        })
        c2.close()

        actual_val = None
        for f in frames2:
            if f.get("type") == "response" and f.get("id") == f"req_v{idx}":
                reread_params = f.get("payload", {}).get("params", [])
                for rp in reread_params:
                    if rp.get("index") == param_idx:
                        actual_val = rp.get("value")
                        break

        if actual_val is not None and abs(actual_val - new_val) < 0.02:
            passed(
                f"param[{param_idx}] set to {new_val:.4f}, re-read confirms {actual_val:.4f}")
        elif actual_val is not None:
            failed(
                f"param[{param_idx}] set to {new_val:.4f} but re-read shows {actual_val:.4f}")
            all_stuck = False
        else:
            failed(f"param[{param_idx}] — could not re-read value to verify")
            all_stuck = False

    except Exception as e:
        failed(f"param[{param_idx}] error: {e}")
        all_stuck = False


# ── Cleanup: Remove ReaEQ from track ─────────────────────────────────
print("\n──── ReaEQ Cleanup: Delete FX ────")
try:
    # Use a fresh connection for deletion
    c.close()
    c = WSClient()

    frames = send_and_recv(c, {
        "type": "command", "command": "fx/delete", "id": "req_d1",
        "payload": {"trackIdx": 0, "fxIdx": fx_idx}
    })

    deleted = False
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "req_d1":
            deleted = f.get("payload", {}).get("deleted", False)
            break

    if deleted:
        passed("ReaEQ removed from track 0")
    else:
        log("Warning: ReaEQ may not have been removed (non-critical)")

except Exception as e:
    log(f"Cleanup deletion error: {e} (non-critical)")
finally:
    c.close()


# ── Summary ──────────────────────────────────────────────────────────
print(f"\n  ReaEQ param roundtrip: {PASS} passed, {FAIL} failed")
sys.exit(0 if FAIL == 0 else 2)

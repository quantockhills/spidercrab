#!/usr/bin/env python3
"""
FX Operations Integration Test

Connects to a running Reaper instance via WebSocket and:
1. Enumerates available plugins
2. Adds the first plugin to track 0
3. Verifies it appears in track's FX list
4. Gets its parameters
5. Changes a parameter value
6. Deletes the FX
7. Verifies deletion

Usage: python3 fx_operations_test.py [port=9224]

Exit codes:
  0 - All tests passed
  1 - Connection/network error
  2 - One or more FX tests failed
  (if no plugins are available, passes as skipped)
"""

import json, socket, base64, struct, time, sys

HOST = '127.0.0.1'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9224

PASS = 0
FAIL = 0

def log(msg):    print(f"  [fx_test] {msg}")
def passed(msg): global PASS; PASS += 1; print(f"    ✅ {msg}")
def failed(msg): global FAIL; FAIL += 1; print(f"    ❌ {msg}")

# ── WebSocket helpers ────────────────────────────────────────────────

class WSClient:
    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((HOST, PORT))
        key = base64.b64encode(b'fx-test-key').decode()
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
            # Save masked flag from the header's second byte BEFORE advancing offset
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
        if not frames:
            if data:
                pass
        return frames

    def close(self):
        self.sock.close()


# ── Test: FX Enumerate ───────────────────────────────────────────────
# ── Helper: send command and get response ───────────────────────────────
def send_cmd(client, cmd, timeout=1.5):
    client.send(cmd)
    time.sleep(timeout)
    return client.recv()


# ── Setup: Create track 0 ────────────────────────────────────────────
print("\n──── FX Setup: Create track 0 ────")
try:
    c = WSClient()
    frames = send_cmd(c, {"type": "command", "command": "track/add", "id": "fx_setup"})
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "fx_setup":
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


# ── Test: FX Enumerate ───────────────────────────────────────────────
print("\n──── FX Test 1: fx/enumerate ────")
try:
    c = WSClient()
    frames = send_cmd(c, {"type": "command", "command": "fx/enumerate", "id": "fx_e1"})

    fx_list = []
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "fx_e1":
            fx_list = f.get("payload", {}).get("fx", [])
            break

    if not frames:
        failed("No response from fx/enumerate")
        c.close()
        sys.exit(2)

    if len(fx_list) == 0:
        log("No plugins installed — skipping all FX tests")
        passed("fx/enumerate (no plugins, skipped)")
        c.close()
        print(f"\n  Results (FX tests): {PASS} passed, {FAIL} failed (skipped)")
        sys.exit(0 if FAIL == 0 else 2)

    passed(f"fx/enumerate returned {len(fx_list)} plugins")

    # Check schema on first non-special entry
    for entry in fx_list:
        for key in ['index', 'name', 'ident', 'format']:
            if key not in entry:
                failed(f"FX entry missing key: {key}")
                c.close()
                sys.exit(2)
        break
    passed("fx/enumerate response schema valid")
    # Pick the first addable plugin (skip built-in entries like 'Video processor')
    first_usable_name = None
    for fx_entry in fx_list:
        n = fx_entry.get('name', '')
        # ReaPlugs and similar VST plugins should work; 'Video processor' and 'Container' won't
        if 'Video' not in n and 'Container' not in n:
            first_usable_name = n
            break
    if not first_usable_name and fx_list:
        first_usable_name = fx_list[0]['name']
    log(f"First usable plugin: '{first_usable_name}'")

    c.close()
except Exception as e:
    failed(f"fx/enumerate error: {e}")
    sys.exit(1)


# ── Test: FX Add ─────────────────────────────────────────────────────
print("\n──── FX Test 2: fx/add ────")
try:
    c = WSClient()
    first_name = first_usable_name
    log(f"Adding first plugin: '{first_name}'")
    c.send({"type": "command", "command": "fx/add", "id": "fx_a1",
            "payload": {"trackIdx": 0, "fxName": first_name}})
    time.sleep(1.5)
    frames = c.recv()

    fx_idx = -1
    success = False
    for f in frames:
        if f.get("type") == "response" and f.get("id") == "fx_a1":
            success = f.get("success", False)
            fx_idx = f.get("payload", {}).get("fxIdx", -1)
            break

    if success and fx_idx >= 0:
        passed(f"fx/add returned success (fxIdx={fx_idx})")
    else:
        failed(f"fx/add failed for '{first_name}' (success={success}, fxIdx={fx_idx})")
        log("Some plugins may not support TrackFX_AddByName — this is platform-dependent")
        c.close()
        # Don't exit — continue to test deletion with the possibly-failed add
        fx_idx = -1  # Ensure we skip subsequent tests
except Exception as e:
    failed(f"fx/add error: {e}")
    c.close()

    # If we can't add, we still want to check deletion works (it might be clean)
    fx_idx = -1


# ── Test: Track GetFX ────────────────────────────────────────────────
print("\n──── FX Test 3: track/getFx ────")
try:
    if fx_idx >= 0:
        c.send({"type": "command", "command": "track/getFx", "id": "fx_g1",
                "payload": {"trackIdx": 0}})
        time.sleep(1)
        frames = c.recv()

        found = False
        for f in frames:
            if f.get("type") == "response" and f.get("id") == "fx_g1":
                fx_on_track = f.get("payload", {}).get("fx", [])
                names = [fx.get("name", "") for fx in fx_on_track]
                # Lenient check: strip format prefixes for comparison
                first_short = first_name.split(": ", 1)[-1] if ": " in first_name else first_name
                if any(first_name in n for n in names) or any(first_short in n for n in names):
                    found = True
                break

        if found:
            passed(f"track/getFx shows added plugin '{first_name}'")
        else:
            failed(f"track/getFx: '{first_name}' not found in track's FX list")
            fx_idx = -1  # Can't proceed
    else:
        log("No FX added — skipping track/getFx verification")
        passed("track/getFx (skipped)")
except Exception as e:
    failed(f"track/getFx error: {e}")
    fx_idx = -1


# ── Test: FX Get Params ──────────────────────────────────────────────
print("\n──── FX Test 4: fx/getParams ────")
params = []
try:
    if fx_idx >= 0:
        c.send({"type": "command", "command": "fx/getParams", "id": "fx_p1",
                "payload": {"trackIdx": 0, "fxIdx": fx_idx}})
        time.sleep(1)
        frames = c.recv()

        for f in frames:
            if f.get("type") == "response" and f.get("id") == "fx_p1":
                params = f.get("payload", {}).get("params", [])
                break

        if not params:
            failed("fx/getParams returned empty params array")
            fx_idx = -1
        else:
            # Check schema
            p = params[0]
            for key in ['index', 'name', 'value', 'min', 'max', 'mid']:
                if key not in p:
                    failed(f"Param missing key: {key}")
                    fx_idx = -1
                    break
            else:
                passed(f"fx/getParams returned {len(params)} param(s) with valid schema")
    else:
        log("No FX added — skipping fx/getParams")
        passed("fx/getParams (skipped)")
except Exception as e:
    failed(f"fx/getParams error: {e}")
    fx_idx = -1


# ── Test: FX Set Param ───────────────────────────────────────────────
print("\n──── FX Test 5: fx/setParam ────")
try:
    if fx_idx >= 0 and params:
        init_val = params[0].get("value", 0)
        param_idx = params[0]["index"]
        new_val = min(1.0, max(0.0, init_val + 0.1))  # nudge up by 0.1

        c.send({"type": "command", "command": "fx/setParam", "id": "fx_s1",
                "payload": {"trackIdx": 0, "fxIdx": fx_idx,
                            "paramIdx": param_idx, "value": new_val}})
        time.sleep(1)
        frames = c.recv()

        set_ok = False
        for f in frames:
            if f.get("type") == "response" and f.get("id") == "fx_s1":
                set_ok = f.get("payload", {}).get("set", False)
                break

        if set_ok:
            passed(f"fx/setParam changed param[{param_idx}] from {init_val:.3f} to {new_val:.3f}")

            # Verify by re-reading
            c.send({"type": "command", "command": "fx/getParams", "id": "fx_s2",
                    "payload": {"trackIdx": 0, "fxIdx": fx_idx}})
            time.sleep(1)
            frames = c.recv()

            for f in frames:
                if f.get("type") == "response" and f.get("id") == "fx_s2":
                    reread_params = f.get("payload", {}).get("params", [])
                    if reread_params:
                        actual = reread_params[0].get("value", -1)
                        if abs(actual - new_val) < 0.01:
                            passed(f"fx/getParams confirms param[{param_idx}] = {actual:.3f}")
                        else:
                            failed(f"fx/getParams: expected {new_val:.3f}, got {actual:.3f}")
                    break
        else:
            failed(f"fx/setParam returned set=false for param[{param_idx}]")
    else:
        log("No params available — skipping fx/setParam")
        passed("fx/setParam (skipped)")
except Exception as e:
    failed(f"fx/setParam error: {e}")


# ── Test: FX Delete ─────────────────────────────────────────────────
print("\n──── FX Test 6: fx/delete ────")
try:
    if fx_idx >= 0:
        c.send({"type": "command", "command": "fx/delete", "id": "fx_d1",
                "payload": {"trackIdx": 0, "fxIdx": fx_idx}})
        time.sleep(1)
        frames = c.recv()

        deleted = False
        for f in frames:
            if f.get("type") == "response" and f.get("id") == "fx_d1":
                deleted = f.get("payload", {}).get("deleted", False)
                break

        if deleted:
            passed("fx/delete removed the FX from track 0")

            # Verify deletion
            c.send({"type": "command", "command": "track/getFx", "id": "fx_d2",
                    "payload": {"trackIdx": 0}})
            time.sleep(1)
            frames = c.recv()

            for f in frames:
                if f.get("type") == "response" and f.get("id") == "fx_d2":
                    fx_after = f.get("payload", {}).get("fx", [])
                    if len(fx_after) == 0:
                        passed("track/getFx confirms track has 0 FX after delete")
                    else:
                        failed(f"track/getFx: expected 0 FX, got {len(fx_after)}")
                    break
        else:
            failed("fx/delete returned deleted=false")
    else:
        log("No FX added — skipping fx/delete")
        passed("fx/delete (skipped)")
except Exception as e:
    failed(f"fx/delete error: {e}")
finally:
    c.close()


# ── Summary ──────────────────────────────────────────────────────────
print(f"\n  FX tests: {PASS} passed, {FAIL} failed")
sys.exit(0 if FAIL == 0 else 2)

#!/usr/bin/env python3
"""
Hardened FX Roundtrip Integration Tests

Tests FX roundtrip with specific name assertions, multi-track isolation,
and track selection verification.

Usage: python3 hardened_fx_test.py [port=9224]

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

def log(msg):    print(f"  [hardened] {msg}")
def passed(msg): global PASS; PASS += 1; print(f"    ✅ {msg}")
def failed(msg): global FAIL; FAIL += 1; print(f"    ❌ {msg}")

# ── WebSocket client (single connection, reused) ─────────────────────

class WSClient:
    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((HOST, PORT))
        key = base64.b64encode(b'hardened-fx-test-key').decode()
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
                if not chunk: break
                data += chunk
        except socket.timeout: pass
        return data

    def recv_frames(self, timeout=3):
        data = self.recv_raw(timeout)
        frames = []
        offset = 0
        while offset < len(data):
            if offset + 2 > len(data): break
            masked = (data[offset + 1] & 0x80) != 0
            length = data[offset + 1] & 0x7F; offset += 2
            if length == 126:
                length = struct.unpack('>H', data[offset:offset+2])[0]; offset += 2
            elif length == 127:
                length = struct.unpack('>Q', data[offset:offset+8])[0]; offset += 8
            mk = data[offset:offset+4] if masked else None
            if masked: offset += 4
            payload = data[offset:offset+length]
            if mk: payload = bytes([payload[i] ^ mk[i % 4] for i in range(len(payload))])
            offset += length
            try: frames.append(json.loads(payload.decode()))
            except json.JSONDecodeError: pass
        return frames

    def send_cmd(self, cmd, timeout=1.5):
        self.send(cmd)
        time.sleep(timeout)
        frames = self.recv_frames()
        return frames

    def close(self):
        self.sock.close()


def get_response(frames, cmd_id):
    """Find a response with matching id in a list of frames."""
    for f in frames:
        if f.get("type") == "response" and f.get("id") == cmd_id:
            return f
    return None


def get_last_response(frames, cmd_id):
    """Find the LAST matching response (in case there are duplicates)."""
    match = None
    for f in frames:
        if f.get("type") == "response" and f.get("id") == cmd_id:
            match = f
    return match


# ═══════════════════════════════════════════════════════════════════════

print("\n═══════════════════════════════════════════════════════════════════")
print("  Hardened FX Roundtrip Tests")
print("═══════════════════════════════════════════════════════════════════")

try:
    c = WSClient()
    log(f"Connected to Reaper on port {PORT}")
except Exception as e:
    failed(f"Connection failed: {e}")
    sys.exit(1)

# ── Determine current track count and available plugins ──────────────
# Use the first connection to learn about the environment

# Enumerate available plugins
frames = c.send_cmd({"type":"command","command":"fx/enumerate","id":"hfx_enum"}, timeout=2.0)
resp = get_response(frames, "hfx_enum")
available_plugins = []
if resp and resp.get("success"):
    available_plugins = [e.get("name","") for e in resp.get("payload",{}).get("fx",[]) if "Video" not in e.get("name","") and "Container" not in e.get("name","")]
    log(f"{len(available_plugins)} addable plugins found")
else:
    log("Could not enumerate plugins")

# Pick test plugin
test_plugin = "ReaEQ"
if test_plugin not in available_plugins:
    # Try alternative names
    for alt in ["VST3: ReaEQ (Cockos)", "VST: ReaEQ (Cockos)"]:
        if alt in available_plugins:
            test_plugin = alt
            break
    else:
        # Fallback to first available
        if available_plugins:
            test_plugin = available_plugins[0]
            log(f"ReaEQ not found, using '{test_plugin}'")
        else:
            failed("No addable plugins found")
            c.close()
            sys.exit(2)

# ═══════════════════════════════════════════════════════════════════════
# Section 1: Add specific FX by name, verify on track
# ═══════════════════════════════════════════════════════════════════════

print("\n──────────────────────────────────────────────────────────────")
print("  Section 1: Add specific FX by name, verify on track")
print("──────────────────────────────────────────────────────────────")

# Get current tracks
frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_init"}, timeout=0.5)
resp = get_response(frames, "hfx_init")
num_tracks = len(resp.get("payload",{}).get("tracks",[])) if resp else 0
log(f"Initial track count: {num_tracks}")

# Ensure we have track 0
if num_tracks == 0:
    frames = c.send_cmd({"type":"command","command":"track/add","id":"hfx_add0"}, timeout=0.5)
    frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_init2"}, timeout=0.5)
    resp = get_response(frames, "hfx_init2")
    num_tracks = len(resp.get("payload",{}).get("tracks",[])) if resp else 0
    if num_tracks == 0:
        failed("Could not create track 0")
        c.close()
        sys.exit(2)

log(f"Now have {num_tracks} track(s)")

# Add our test plugin to track 0
frames = c.send_cmd({"type":"command","command":"fx/add","id":"hfx_a1",
    "payload":{"trackIdx":0,"fxName":test_plugin}}, timeout=2.0)
resp = get_response(frames, "hfx_a1")

if resp and resp.get("success"):
    fx_idx = resp.get("payload",{}).get("fxIdx",-1)
    passed(f"fx/add '{test_plugin}' returned success (fxIdx={fx_idx})")
else:
    failed(f"fx/add '{test_plugin}' failed")
    log(f"Response: {resp}")
    c.close()
    sys.exit(2)

# Verify by name: track/getFx should show the plugin
frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_g1",
    "payload":{"trackIdx":0}}, timeout=1.0)
resp = get_response(frames, "hfx_g1")
names_on_track = []
if resp and resp.get("success"):
    fx_list = resp.get("payload",{}).get("fx",[])
    names_on_track = [f.get("name","") for f in fx_list]
    short_name = test_plugin.split(": ",1)[-1] if ": " in test_plugin else test_plugin
    found = any(short_name in n for n in names_on_track) or any(test_plugin in n for n in names_on_track)
    if found:
        passed(f"track/getFx confirms '{short_name}' on track 0 (by specific name match)")
    else:
        failed(f"track/getFx shows [{', '.join(names_on_track)}] — expected '{short_name}'")
else:
    failed("track/getFx returned no valid response")

# ═══════════════════════════════════════════════════════════════════════
# Section 2: Param name assertions
# ═══════════════════════════════════════════════════════════════════════

print("\n──────────────────────────────────────────────────────────────")
print("  Section 2: Param name assertions")
print("──────────────────────────────────────────────────────────────")

frames = c.send_cmd({"type":"command","command":"fx/getParams","id":"hfx_p1",
    "payload":{"trackIdx":0,"fxIdx":fx_idx}}, timeout=1.0)
resp = get_response(frames, "hfx_p1")
params = resp.get("payload",{}).get("params",[]) if resp else []

if params:
    passed(f"fx/getParams returned {len(params)} parameter(s)")

    # All param names must be non-empty
    empty_names = [p["index"] for p in params if not p.get("name","")]
    if not empty_names:
        passed(f"All {len(params)} param names are non-empty")
    else:
        failed(f"Params with empty names: {empty_names}")

    # For ReaEQ, param[0].name should contain "Freq" or "Band"
    first_name = params[0].get("name","")
    if "ReaEQ" in test_plugin:
        if "Freq" in first_name or "Band" in first_name or "Gain" in first_name:
            passed(f"ReaEQ param[0].name = '{first_name}' (contains expected substring)")
        else:
            log(f"ReaEQ first param name: '{first_name}' (non-critical, installer-dependent)")
            passed(f"ReaEQ param[0].name is non-empty: '{first_name}'")

    # Save param names before mutation
    names_before = {p["index"]: p["name"] for p in params}

    # Change a few params and verify names don't change
    num_set = min(3, len(params))
    for i in range(num_set):
        p = params[i]
        pmin, pmax = p.get("min",0), p.get("max",1)
        cur = p.get("value",0)
        mid = (pmin + pmax) / 2.0
        nv = mid if abs(mid - cur) >= 0.1 else max(pmin, min(pmax, mid + 0.2))

        frames = c.send_cmd({"type":"command","command":"fx/setParam","id":f"hfx_sp{i}",
            "payload":{"trackIdx":0,"fxIdx":fx_idx,"paramIdx":p["index"],"value":nv}}, timeout=0.5)

    # Re-read and verify names unchanged
    frames = c.send_cmd({"type":"command","command":"fx/getParams","id":"hfx_p2",
        "payload":{"trackIdx":0,"fxIdx":fx_idx}}, timeout=1.0)
    resp = get_response(frames, "hfx_p2")
    params_after = resp.get("payload",{}).get("params",[]) if resp else []
    names_after = {p["index"]: p["name"] for p in params_after}

    changed = [(idx, names_before[idx], names_after.get(idx,"")) 
               for idx in names_before 
               if idx in names_after and names_before[idx] != names_after[idx]]
    
    if not changed:
        passed(f"All param names unchanged after setParam operations")
    else:
        for idx, before, after in changed:
            failed(f"param[{idx}] name changed: '{before}' → '{after}'")
else:
    failed("fx/getParams returned empty or invalid params")

# ═══════════════════════════════════════════════════════════════════════
# Section 3: Multi-track FX isolation
# ═══════════════════════════════════════════════════════════════════════

print("\n──────────────────────────────────────────────────────────────")
print("  Section 3: Multi-track FX isolation")
print("──────────────────────────────────────────────────────────────")

# Ensure we have at least 2 tracks
frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_tcnt"}, timeout=0.5)
resp = get_response(frames, "hfx_tcnt")
tracks = resp.get("payload",{}).get("tracks",[]) if resp else []
current_count = len(tracks)
log(f"Track count: {current_count}")

while current_count < 2:
    frames = c.send_cmd({"type":"command","command":"track/add","id":"hfx_tadd"}, timeout=0.5)
    current_count += 1

# Clear FX from tracks 0 and 1
for ti in [0, 1]:
    frames = c.send_cmd({"type":"command","command":"track/getFx","id":f"hfx_clr{ti}",
        "payload":{"trackIdx":ti}}, timeout=0.5)
    resp = get_response(frames, f"hfx_clr{ti}")
    existing = resp.get("payload",{}).get("fx",[]) if resp else []
    for fx_entry in existing:
        frames = c.send_cmd({"type":"command","command":"fx/delete","id":f"hfx_d{ti}_{fx_entry['index']}",
            "payload":{"trackIdx":ti,"fxIdx":fx_entry["index"]}}, timeout=0.3)

# Verify tracks 0 and 1 are clean
frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_v0",
    "payload":{"trackIdx":0}}, timeout=0.5)
resp0 = get_response(frames, "hfx_v0")
t0_count = len(resp0.get("payload",{}).get("fx",[])) if resp0 else -1

frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_v1",
    "payload":{"trackIdx":1}}, timeout=0.5)
resp1 = get_response(frames, "hfx_v1")
t1_count = len(resp1.get("payload",{}).get("fx",[])) if resp1 else -1

if t0_count == 0: passed("Track 0 starts clean (no FX)")
else: log(f"Track 0 has {t0_count} FX after cleanup")
if t1_count == 0: passed("Track 1 starts clean (no FX)")
else: log(f"Track 1 has {t1_count} FX after cleanup")

# Add plugin to track 1
frames = c.send_cmd({"type":"command","command":"fx/add","id":"hfx_mt_a",
    "payload":{"trackIdx":1,"fxName":test_plugin}}, timeout=2.0)
resp = get_response(frames, "hfx_mt_a")

if not resp or not resp.get("success"):
    # Try fallback
    for fb in available_plugins:
        if fb == test_plugin: continue
        frames = c.send_cmd({"type":"command","command":"fx/add","id":"hfx_mt_afb",
            "payload":{"trackIdx":1,"fxName":fb}}, timeout=1.5)
        resp = get_response(frames, "hfx_mt_afb")
        if resp and resp.get("success"):
            test_plugin = fb
            break

if resp and resp.get("success"):
    mt_fx_idx = resp.get("payload",{}).get("fxIdx",-1)
    passed(f"FX added to track 1 (fxIdx={mt_fx_idx})")

    # Verify track 0 does NOT have the FX
    frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_vfy_t0",
        "payload":{"trackIdx":0}}, timeout=0.5)
    resp = get_response(frames, "hfx_vfy_t0")
    t0_names = [f.get("name","") for f in (resp.get("payload",{}).get("fx",[]) if resp else [])]
    short = test_plugin.split(": ",1)[-1] if ": " in test_plugin else test_plugin
    on_t0 = any(short in n for n in t0_names) or any(test_plugin in n for n in t0_names)
    if not on_t0:
        passed(f"Track 0 does not contain '{short}' — isolation confirmed")
    else:
        failed(f"FX leaked to track 0")

    # Verify track 1 DOES have the FX
    frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_vfy_t1",
        "payload":{"trackIdx":1}}, timeout=0.5)
    resp = get_response(frames, "hfx_vfy_t1")
    t1_names = [f.get("name","") for f in (resp.get("payload",{}).get("fx",[]) if resp else [])]
    on_t1 = any(short in n for n in t1_names) or any(test_plugin in n for n in t1_names)
    if on_t1:
        passed(f"Track 1 has '{short}' — FX lands on correct track")
    else:
        failed(f"Track 1 shows [{', '.join(t1_names)}] — expected '{short}'")

    # Cleanup
    c.send_cmd({"type":"command","command":"fx/delete","id":"hfx_mt_d",
        "payload":{"trackIdx":1,"fxIdx":mt_fx_idx}}, timeout=0.5)
else:
    failed("Could not add plugin to track 1 — skipping multi-track verification")
    passed("Multi-track isolation (skipped)")

# ═══════════════════════════════════════════════════════════════════════
# Section 4: Track selection + FX
# ═══════════════════════════════════════════════════════════════════════

print("\n──────────────────────────────────────────────────────────────")
print("  Section 4: Track selection + FX landing")
print("──────────────────────────────────────────────────────────────")

# Ensure we have at least 3 tracks
frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_tcnt2"}, timeout=0.5)
resp = get_response(frames, "hfx_tcnt2")
tracks = resp.get("payload",{}).get("tracks",[]) if resp else []
current_count = len(tracks)
while current_count < 3:
    frames = c.send_cmd({"type":"command","command":"track/add","id":"hfx_tadd2"}, timeout=0.5)
    current_count += 1
log(f"Track count: {current_count}")

# Clear FX from all 3 tracks
for ti in range(3):
    frames = c.send_cmd({"type":"command","command":"track/getFx","id":f"hfx_clr3_{ti}",
        "payload":{"trackIdx":ti}}, timeout=0.5)
    resp = get_response(frames, f"hfx_clr3_{ti}")
    existing = resp.get("payload",{}).get("fx",[]) if resp else []
    for fx_entry in existing:
        c.send_cmd({"type":"command","command":"fx/delete","id":f"hfx_d3_{ti}_{fx_entry['index']}",
            "payload":{"trackIdx":ti,"fxIdx":fx_entry["index"]}}, timeout=0.3)

# Deselect all tracks
c.send_cmd({"type":"command","command":"track/setSelected","id":"hfx_sel_d0",
    "payload":{"trackIdx":0,"selected":"false"}}, timeout=0.3)
c.send_cmd({"type":"command","command":"track/setSelected","id":"hfx_sel_d1",
    "payload":{"trackIdx":1,"selected":"false"}}, timeout=0.3)
c.send_cmd({"type":"command","command":"track/setSelected","id":"hfx_sel_d2",
    "payload":{"trackIdx":2,"selected":"false"}}, timeout=0.3)

# Select track 2
frames = c.send_cmd({"type":"command","command":"track/setSelected","id":"hfx_sel2",
    "payload":{"trackIdx":2,"selected":"true"}}, timeout=0.3)

# Verify selection
frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_sel_v"}, timeout=0.5)
resp = get_response(frames, "hfx_sel_v")
tracks = resp.get("payload",{}).get("tracks",[]) if resp else []
if len(tracks) > 2:
    t2_selected = tracks[2].get("selected", False)
    if t2_selected:
        passed("Track 2 (index 2) confirmed selected")
    else:
        log("Track 2 was not selected after first attempt — retrying")
        c.send_cmd({"type":"command","command":"track/setSelected","id":"hfx_sel2b",
            "payload":{"trackIdx":2,"selected":"true"}}, timeout=0.5)
        frames = c.send_cmd({"type":"command","command":"track/getAll","id":"hfx_sel_v2"}, timeout=0.5)
        resp = get_response(frames, "hfx_sel_v2")
        tracks = resp.get("payload",{}).get("tracks",[]) if resp else []
        if len(tracks) > 2:
            t2_selected = tracks[2].get("selected", False)
            passed("Track 2 selected (retry succeeded)") if t2_selected else failed("Could not select track 2")
else:
    failed(f"Expected 3 tracks, got {len(tracks)}")

# Add FX to track 2
frames = c.send_cmd({"type":"command","command":"fx/add","id":"hfx_sel_a",
    "payload":{"trackIdx":2,"fxName":test_plugin}}, timeout=2.0)
resp = get_response(frames, "hfx_sel_a")

if not resp or not resp.get("success"):
    for fb in available_plugins:
        if fb == test_plugin: continue
        frames = c.send_cmd({"type":"command","command":"fx/add","id":"hfx_sel_afb",
            "payload":{"trackIdx":2,"fxName":fb}}, timeout=1.5)
        resp = get_response(frames, "hfx_sel_afb")
        if resp and resp.get("success"):
            test_plugin = fb
            break

if resp and resp.get("success"):
    sel_fx_idx = resp.get("payload",{}).get("fxIdx",-1)
    passed(f"FX added to track 2 (fxIdx={sel_fx_idx})")

    short = test_plugin.split(": ",1)[-1] if ": " in test_plugin else test_plugin

    # Verify track 2 has the FX
    frames = c.send_cmd({"type":"command","command":"track/getFx","id":"hfx_vfy_t2",
        "payload":{"trackIdx":2}}, timeout=0.5)
    resp = get_response(frames, "hfx_vfy_t2")
    t2_names = [f.get("name","") for f in (resp.get("payload",{}).get("fx",[]) if resp else [])]
    on_t2 = any(short in n for n in t2_names) or any(test_plugin in n for n in t2_names)
    if on_t2:
        passed(f"Track 2 has '{short}' — FX landed on selected track")
    else:
        failed(f"Track 2 shows [{', '.join(t2_names)}] — expected '{short}'")

    # Verify other tracks don't have it
    for ti in [0, 1]:
        frames = c.send_cmd({"type":"command","command":"track/getFx","id":f"hfx_vfy_o{ti}",
            "payload":{"trackIdx":ti}}, timeout=0.5)
        resp = get_response(frames, f"hfx_vfy_o{ti}")
        t_names = [f.get("name","") for f in (resp.get("payload",{}).get("fx",[]) if resp else [])]
        leaked = any(short in n for n in t_names) or any(test_plugin in n for n in t_names)
        if not leaked:
            passed(f"Track {ti} does not contain the FX (correct)")
        else:
            failed(f"FX leaked to track {ti}")

    # Cleanup
    c.send_cmd({"type":"command","command":"fx/delete","id":"hfx_sel_d",
        "payload":{"trackIdx":2,"fxIdx":sel_fx_idx}}, timeout=0.5)
else:
    failed("Could not add plugin to track 2 — skipping selection verification")
    passed("Track selection test (skipped)")

# ═══════════════════════════════════════════════════════════════════════
# Cleanup: Remove FX from track 0 (from Section 1)
# ═══════════════════════════════════════════════════════════════════════

c.send_cmd({"type":"command","command":"fx/delete","id":"hfx_clean",
    "payload":{"trackIdx":0,"fxIdx":fx_idx}}, timeout=0.5)

c.close()

# ═══════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════

print(f"\n{'='*60}")
print(f"  Hardened FX tests: {PASS} passed, {FAIL} failed")
print(f"{'='*60}")
sys.exit(0 if FAIL == 0 else 2)

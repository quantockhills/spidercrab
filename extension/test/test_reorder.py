#!/usr/bin/env python3
"""Test: FX reorder. Creates a track, adds 2 FX, reorders, verifies."""
import json, socket, struct, time, base64, sys

s = socket.socket(); s.settimeout(15)
s.connect(("127.0.0.1", 9224))
k = base64.b64encode(b"rt90").decode()
s.sendall(f"GET / HTTP/1.1\r\nHost: 127.0.0.1:9224\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {k}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
r = b""
while b"\r\n\r\n" not in r: r += s.recv(4096)
assert b"101" in r

def send(m):
    d = m.encode(); mk = bytes([1,2,3,4])
    h = bytes([0x81, 0x80 | len(d)]) + mk
    s.sendall(h + bytes([d[i] ^ mk[i%4] for i in range(len(d))]))

def recv_until(predicate, timeout=5):
    s.settimeout(timeout)
    data = b""
    while True:
        try:
            c = s.recv(65536)
            if not c: break
            data += c
        except: break
    frames = []; o = 0
    while o + 2 <= len(data):
        l = data[o+1] & 0x7F; m = (data[o+1] & 0x80) != 0; o += 2
        if l == 126: l = struct.unpack(">H", data[o:o+2])[0]; o += 2
        mk = data[o:o+4] if m else None
        if m: o += 4
        p = data[o:o+l]
        if mk: p = bytes([p[i] ^ mk[i%4] for i in range(len(p))])
        o += l
        try: frames.append(json.loads(p.decode()))
        except: frames.append({"raw": p.decode()})
    # Return first matching frame
    for f in frames:
        if predicate(f): return f
    return None

def wait_cmd(cmd_name, params=None, id="t"):
    m = {"type":"command","command":cmd_name,"id":id}
    if params: m.update(params)
    send(json.dumps(m))
    time.sleep(1.5)
    # Look through ALL frames for our response
    r = recv_until(lambda f: f.get("type")=="response" and f.get("id")==id, timeout=3)
    return r or {"success":False,"payload":{"error":"no response"}}

PASS=0; FAIL=0
def ok(t): global PASS; PASS+=1; print(f"  ✅ {t}")
def no(t,e): global FAIL; FAIL+=1; print(f"  ❌ {t}: {e}")

# 1. Create a track
print("--- 1. Create track ---")
r = wait_cmd("track/add", id="1")
ok("created") if r.get("success") else no("create failed", str(r)[:100])
time.sleep(0.5)

# Figure out which track index we got
r = wait_cmd("track/getAll", id="1b")
tracks = r.get("payload",{}).get("tracks",[])
ti = len(tracks) - 1  # last track
print(f"  Using track index {ti}")

# 2. Add ReaEQ then ReaSynth
print("\n--- 2. Add FX ---")
r = wait_cmd("fx/add", {"trackIdx":ti,"fxName":"ReaEQ"}, id="2a")
ok("ReaEQ added") if r.get("success") else no("ReaEQ failed", str(r)[:100])
r = wait_cmd("fx/add", {"trackIdx":ti,"fxName":"ReaSynth"}, id="2b")
ok("ReaSynth added") if r.get("success") else no("ReaSynth failed", str(r)[:100])

# 3. Verify order
print("\n--- 3. Verify [ReaEQ, ReaSynth] ---")
r = wait_cmd("track/getFx", {"trackIdx":ti}, id="3")
names = [f["name"] for f in r.get("payload",{}).get("fx",[])]
print(f"  Order: {names}")
ok("2+ FX") if len(names) >= 2 else no("need 2+ FX", str(names))
if len(names) >= 2:
    if "eq" in names[0].lower(): ok("ReaEQ first")
    else: no("expected ReaEQ first", names[0])
    if "synth" in names[1].lower(): ok("ReaSynth second")
    else: no("expected ReaSynth second", names[1])

# 4. Reorder: move ReaEQ (idx 0) after ReaSynth (to idx 1)
print("\n--- 4. fx/reorder fromIndex=0 toIndex=1 ---")
r = wait_cmd("fx/reorder", {"trackIdx":ti,"fromIndex":0,"toIndex":1}, id="4")
print(f"  Response: {json.dumps(r)}")
ok("reorder ok") if r.get("success") else no("reorder failed", str(r)[:100])

# 5. Verify new order
print("\n--- 5. Verify [ReaSynth, ReaEQ] ---")
r = wait_cmd("track/getFx", {"trackIdx":ti}, id="5")
names = [f["name"] for f in r.get("payload",{}).get("fx",[])]
print(f"  After: {names}")
ok("2+ FX") if len(names) >= 2 else no("need 2+ FX", str(names))
if len(names) >= 2:
    if "synth" in names[0].lower(): ok("ReaSynth first ✓")
    else: no("expected ReaSynth first", names[0])
    if "eq" in names[1].lower(): ok("ReaEQ second ✓")
    else: no("expected ReaEQ second", names[1])

print(f"\n═══ {PASS}/{PASS+FAIL} ═══")
s.close()
sys.exit(0 if FAIL==0 else 1)

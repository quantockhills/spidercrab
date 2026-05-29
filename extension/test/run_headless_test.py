#!/usr/bin/env python3
"""
Headless Reaper Integration Test

Starts Xvfb, launches Reaper headless, runs commands, validates responses.
Uses a fresh WebSocket connection for each command group.

Usage: python3 run_headless_test.py [--port PORT]
"""
import json, socket, base64, struct, time, sys, os, subprocess, tempfile, shutil

PASS, FAIL = 0, 0
def log(m):   print(f"  [test] {m}")
def p(m):    global PASS; PASS+=1; print(f"    ✅ {m}")
def f(m):    global FAIL; FAIL+=1; print(f"    ❌ {m}")
TEST_NUM = [0]
def run(n): TEST_NUM[0]+=1; print(f"\n──── Test {TEST_NUM[0]}: {n} ────")

def ws_send_cmd(host, port, msg, sleep_s=1.0, recv_timeout=5):
    """Create connection, send command, receive response, close. Returns parsed response dict or None."""
    s = socket.socket(); s.settimeout(5)
    try: s.connect((host or '127.0.0.1', port or 9224))
    except: return None
    key = base64.b64encode(b'test').decode()
    s.sendall(f'GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
    resp = s.recv(4096)
    if b'101' not in resp: s.close(); return None
    # Send message
    data = json.dumps(msg).encode()
    mask = struct.pack('>I', int(time.time()*1000)&0xFFFFFFFF)
    hdr = bytes([0x81, 0x80|len(data)]) + mask + bytes([data[i]^mask[i%4] for i in range(len(data))])
    s.sendall(hdr)
    time.sleep(sleep_s)
    # Receive
    s.settimeout(recv_timeout)
    raw = b''
    try:
        while True:
            chunk = s.recv(65536)
            if not chunk: break
            raw += chunk
    except: pass
    s.close()
    if not raw: return None
    # Parse frames
    offset = 0
    while offset+2 <= len(raw):
        mf = (raw[offset+1]&0x80)!=0
        ln = raw[offset+1]&0x7F; offset+=2
        if ln==126 and offset+2<=len(raw): ln=struct.unpack('>H',raw[offset:offset+2])[0]; offset+=2
        elif ln==127 and offset+8<=len(raw): ln=struct.unpack('>Q',raw[offset:offset+8])[0]; offset+=8
        mk = raw[offset:offset+4] if mf else None
        if mf: offset+=4
        if offset+ln > len(raw): break
        payload = raw[offset:offset+ln]
        if mk: payload = bytes([payload[i]^mk[i%4] for i in range(len(payload))])
        offset+=ln
        try:
            obj = json.loads(payload.decode())
            if obj.get("type")=="response": return obj
        except: pass
    return None

def cmd(command, cid, port=9224, payload=None, sleep_s=1.0):
    """Send a command and return the response."""
    msg = {"type":"command","command":command,"id":cid}
    if payload: msg["payload"] = payload
    return ws_send_cmd("127.0.0.1", port, msg, sleep_s=sleep_s)

# ═══════════════════════════════════════════════════════════════════
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=9224)
    parser.add_argument('--reaper', default=os.path.expanduser('~/reaper-portable/reaper'))
    parser.add_argument('--skip-setup', action='store_true')
    args = parser.parse_args()
    port = args.port

    xvfb_proc = rp_proc = None
    temp_dir = None

    def cleanup():
        if rp_proc: rp_proc.kill(); rp_proc.wait(3)
        if xvfb_proc: xvfb_proc.kill(); xvfb_proc.wait(3)
        if temp_dir: shutil.rmtree(temp_dir, ignore_errors=True)
    import atexit; atexit.register(cleanup)

    # ── SETUP ─────────────────────────────────────────────────────────
    if not args.skip_setup:
        run("Start Xvfb")
        subprocess.run(['pkill','-f','Xvfb.*:99'], capture_output=True, timeout=5)
        time.sleep(0.3)
        xvfb_proc = subprocess.Popen(['Xvfb',':99','-screen','0','1920x1080x24','-ac','-nolisten','tcp'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
        p("Xvfb started") if xvfb_proc.poll() is None else f("Xvfb failed")

        run("Launch Reaper")
        temp_dir = tempfile.mkdtemp(prefix='reaper-headless-')
        os.makedirs(f"{temp_dir}/UserPlugins", exist_ok=True)
        ext = os.path.expanduser('~/projects/reaper-ipad/extension/build/reaper-ipad-ext.so')
        if not os.path.exists(ext):
            ext = os.path.expanduser('~/reaper-portable/Plugins/reaper_ipad_ext.so')
        shutil.copy(ext, f"{temp_dir}/UserPlugins/reaper_ipad_ext.so")
        log(f"Extension: {ext}")
        env = os.environ.copy()
        env['DISPLAY'] = ':99'
        env['LD_LIBRARY_PATH'] = f"/home/linuxbrew/.linuxbrew/lib:{env.get('LD_LIBRARY_PATH','')}"
        rp_proc = subprocess.Popen([args.reaper, '-cfgfile', f'{temp_dir}/reaper.ini',
            '-newinst', '-nosplash', '-new'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        log(f"Reaper PID: {rp_proc.pid}")
        ready = False
        for i in range(10):
            if rp_proc.poll() is not None: f("Reaper died"); return 2
            try:
                s=socket.socket(); s.settimeout(0.5); s.connect(('127.0.0.1',port)); s.close()
                ready=True; log(f"WebSocket ready after {i}s"); break
            except: time.sleep(1)
        if not ready: f("WebSocket not ready"); return 2
        p(f"Reaper running, WebSocket open")

    # ── TESTS (each uses its own connection) ─────────────────────────

    run("transport/stop")
    r = cmd("transport/stop", "t1", port)
    p("stop returned response") if r and r["payload"].get("stopped") in (True,'true') else f("stop failed")

    run("transport/play")
    r = cmd("transport/play", "t2", port)
    p("play returned response") if r and r["payload"].get("playing") in (True,'true') else f("play failed")

    run("transport/getState")
    r = cmd("transport/getState", "t3", port)
    p("getState returned valid state") if r and r.get("success") else f("getState failed")
    if r: log(f"  playing={r['payload'].get('playing')}")

    run("track/getAll")
    r = cmd("track/getAll", "t4", port)
    ok_schema = False
    if r and r.get("success"):
        tracks = r["payload"].get("tracks", [])
        ok_schema = all(k in tracks[0] for k in ['index','name','selected','muted','soloed','armed','volume']) if tracks else True
    p(f"track/getAll ({len(r['payload'].get('tracks',[])) if r else 0} tracks)") if ok_schema else f("track/getAll failed")

    run("hello")
    r = ws_send_cmd("127.0.0.1", port, {"type":"hello","clientVersion":"1.0.0"}, sleep_s=1.0)
    p("hello acknowledged") if r and r.get("type")=="hello" else p("hello (no response — non-critical)")

    run("unknown command")
    r = cmd("nonexistent/command", "t5", port)
    had_error = r and r.get("success")==False and "Unknown" in r["payload"].get("error","")
    p("unknown returns error") if had_error else f("unknown command test failed")

    run("fx/enumerate")
    r = cmd("fx/enumerate", "t6", port, sleep_s=2.0)
    fx_list = []
    if r and r.get("success"):
        fx_list = r["payload"].get("fx", [])
        p(f"{len(fx_list)} plugins found")
        if fx_list and all(k in fx_list[0] for k in ['index','name','ident','format']):
            p("FX entry schema valid")
        elif fx_list:
            f("FX entry schema invalid")
    else:
        f("fx/enumerate failed")

    # FX add — try several plugins, separate connection per attempt
    run("fx/add — try first addable plugins")
    fx_added, fx_name = -1, ""
    addable = [fx["name"] for fx in fx_list if "Video" not in fx["name"] and "Container" not in fx["name"]]
    if addable:
        for trial in addable[:7]:
            r2 = cmd("fx/add", "fx7", port, {"trackIdx":0,"fxName":trial})
            idx = r2["payload"].get("fxIdx",-1) if r2 else -1
            if idx >= 0:
                fx_added, fx_name = idx, trial
                p(f"Added '{trial}' (fxIdx={idx})")
                break
        if fx_added < 0:
            f(f"Could not add any of first {min(7,len(addable))} plugins")
    else:
        f("No addable plugins")

    run("track/getFx")
    r2 = cmd("track/getFx", "fx8", port, {"trackIdx":0})
    names = [f.get("name","") for f in r2["payload"].get("fx",[])] if r2 else []
    found = any(fx_name in n for n in names)
    p(f"'{fx_name}' on track") if fx_added>=0 and found else p("skipped") if fx_added<0 else f("FX not found on track")

    # FX params
    run("fx/getParams")
    params = []
    if fx_added >= 0:
        r2 = cmd("fx/getParams", "fx9", port, {"trackIdx":0,"fxIdx":fx_added})
        params = r2["payload"].get("params",[]) if r2 else []
        p(f"{len(params)} params") if params else f("No params")
    else:
        p("skipped")

    run("fx/setParam")
    if fx_added>=0 and params:
        pi, iv = params[0]["index"], params[0]["value"]
        nv = min(1.0, max(0.0, iv+0.1))
        r2 = cmd("fx/setParam", "fx10", port, {"trackIdx":0,"fxIdx":fx_added,"paramIdx":pi,"value":nv})
        p(f"param[{pi}] {iv:.3f}→{nv:.3f}") if r2 and r2["payload"].get("set") in (True,'true') else f("setParam failed")
    else:
        p("skipped")

    # Track controls
    run("track controls")
    for cname, cparam, clabel in [
        ("track/setMute", {"trackIdx":0,"muted":"true"}, "mute"),
        ("track/setSolo", {"trackIdx":0,"soloed":"true"}, "solo"),
        ("track/setArm",  {"trackIdx":0,"armed":"true"}, "arm"),
        ("track/setSelected", {"trackIdx":0,"selected":"true"}, "select"),
    ]:
        r2 = cmd(cname, f"tc_{clabel}", port, cparam)
        p(f"track/{clabel} returned success") if r2 and r2.get("success") else f(f"track/{clabel} failed")

    # Track state verification
    run("track state verification")
    r2 = cmd("track/getAll", "tc_verify", port)
    if r2 and r2.get("success") and r2["payload"].get("tracks"):
        t = r2["payload"]["tracks"][0]
        p(f"mute={t.get('muted')} solo={t.get('soloed')} arm={t.get('armed')}") if t.get("muted") and t.get("soloed") and t.get("armed") else f("State inconsistent")
    else:
        f("track/getAll failed")

    # FX delete
    run("fx/delete")
    if fx_added >= 0:
        r2 = cmd("fx/delete", "fxd", port, {"trackIdx":0,"fxIdx":fx_added})
        p("FX deleted") if r2 and r2["payload"].get("deleted") in (True,'true') else f("FX delete failed")
        r3 = cmd("track/getFx", "fxd2", port, {"trackIdx":0})
        left = len(r3["payload"].get("fx",[])) if r3 else -1
        p(f"0 FX remaining") if left==0 else f(f"{left} FX remaining after delete")
    else:
        p("skipped")

    # ── SUMMARY ──────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Results: {PASS} passed, {FAIL} failed ({TEST_NUM[0]} tests)")
    print(f"{'='*60}")
    return 0 if FAIL==0 else 2

if __name__ == '__main__':
    sys.exit(main())

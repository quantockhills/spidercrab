"""
ws_integration_test.py
WebSocket integration tests against a running REAPER instance with spidercrab loaded.
Expects REAPER to already be running with the extension loaded on port 9224.
Exit code 0 = all passed, 1 = failures.
"""
import asyncio
import json
import sys
import time
import websockets

WS_URL = "ws://127.0.0.1:9224"
TIMEOUT = 5.0  # seconds per command
PASSED = []
FAILED = []


def ok(name):
    PASSED.append(name)
    print(f"  [PASS] {name}")


def fail(name, reason):
    FAILED.append(name)
    print(f"  [FAIL] {name}: {reason}")


async def send_recv(ws, payload, cmd_id):
    """Send a command and wait for its matching response."""
    await ws.send(json.dumps(payload))
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            msg = json.loads(raw)
            # Accept either a matching response or any event
            if msg.get("type") == "response" and msg.get("id") == cmd_id:
                return msg
            # Keep draining events until we get the response we want
        except asyncio.TimeoutError:
            continue
    return None


async def run_tests():
    print(f"  Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL, open_timeout=5) as ws:
            print("  Connected\n")

            # ---- Test 1: track/getAll ----
            name = "track/getAll returns response"
            resp = await send_recv(ws, {
                "type": "command", "command": "track/getAll", "id": "t1"
            }, "t1")
            if resp is None:
                fail(name, "no response received")
            elif resp.get("success") != True:
                fail(name, f"success=false: {resp.get('payload','')}")
            elif "tracks" not in resp.get("payload", ""):
                fail(name, f"no 'tracks' in payload: {resp.get('payload','')[:100]}")
            else:
                ok(name)

            # ---- Test 2: transport/play ----
            name = "transport/play returns success"
            resp = await send_recv(ws, {
                "type": "command", "command": "transport/play", "id": "t2"
            }, "t2")
            if resp is None:
                fail(name, "no response received")
            elif resp.get("success") != True:
                fail(name, f"success=false: {resp.get('payload','')}")
            else:
                ok(name)

            # ---- Test 3: transport/stop ----
            name = "transport/stop returns success"
            resp = await send_recv(ws, {
                "type": "command", "command": "transport/stop", "id": "t3"
            }, "t3")
            if resp is None:
                fail(name, "no response received")
            elif resp.get("success") != True:
                fail(name, f"success=false: {resp.get('payload','')}")
            else:
                ok(name)

            # ---- Test 4: unknown command returns error ----
            name = "unknown command returns error response"
            resp = await send_recv(ws, {
                "type": "command", "command": "notacommand", "id": "t4"
            }, "t4")
            if resp is None:
                fail(name, "no response received")
            elif resp.get("success") != False:
                fail(name, f"expected success=false, got: {resp}")
            else:
                ok(name)

            # ---- Test 5: malformed JSON is handled gracefully ----
            name = "malformed JSON doesn't crash server"
            await ws.send("this is not json{{{")
            # Give it a moment, then verify server still responds
            await asyncio.sleep(0.5)
            resp = await send_recv(ws, {
                "type": "command", "command": "transport/stop", "id": "t5"
            }, "t5")
            if resp is None:
                fail(name, "server stopped responding after malformed input — possible crash")
            else:
                ok(name)

            # ---- Test 6: rapid commands don't crash ----
            name = "10 rapid commands all responded"
            ids = [f"rapid_{i}" for i in range(10)]
            for cid in ids:
                await ws.send(json.dumps({
                    "type": "command", "command": "track/getAll", "id": cid
                }))
            received = set()
            deadline = time.monotonic() + TIMEOUT
            while len(received) < len(ids) and time.monotonic() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    msg = json.loads(raw)
                    if msg.get("type") == "response" and msg.get("id") in ids:
                        received.add(msg["id"])
                except asyncio.TimeoutError:
                    continue
            if len(received) == len(ids):
                ok(name)
            else:
                fail(name, f"only {len(received)}/{len(ids)} responses received")

    except Exception as e:
        print(f"\n  ERROR: Could not connect or lost connection: {e}")
        sys.exit(1)


async def main():
    await run_tests()
    print(f"\n  Results: {len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print(f"  Failed: {', '.join(FAILED)}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())

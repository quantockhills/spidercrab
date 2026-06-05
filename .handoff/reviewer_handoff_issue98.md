# Handoff: Issue #98 — Code Review Required

## Issue
**#98: Replace MIDI polling with OSC over UDP for ReaLearn two-way sync**

## Status
- **Stage**: `stage:reviewer` (advanced from Builder)
- **Commit**: `11b43f8` — "feat: Replace MIDI polling with OSC over UDP for ReaLearn two-way sync"
- **Parent**: `4750939` (previous advance commit)

## What Was Built (Phase 1 Complete)

### New Files (3)
1. **`extension/src/osc_sender.h`** (295 lines) — OSC message builder + UDP sender
   - Hand-rolled OSC packet construction (big-endian ints, NUL-padded strings)
   - Methods: `sendTriggerSlot(col, row)`, `sendRecordSlot(col, row)`, `sendTriggerScene(row)`
   - Cross-platform Berkeley sockets (no #ifdef spaghetti for socket API)
   - Non-blocking socket, graceful error handling

2. **`extension/src/osc_receiver.h`** (413 lines) — UDP receiver + minimal OSC parser
   - Non-blocking `recvfrom()` — event-driven, zero CPU when idle
   - Parses OSC address + type tags + integer/string arguments
   - Callback-based dispatch for `/playtime/slot/state` messages
   - Port fallback (10 attempts) if port in use
   - Malformed packet protection (logs and skips)

3. **`extension/test/test_osc.cpp`** (480 lines) — 20 unit tests
   - Message building, padding verification, format correctness
   - Packet parsing, error handling (truncated, empty, malformed)
   - Integration: send + receive local round-trip (non-crash test)

### Modified Files (4)
4. **`extension/CMakeLists.txt`** — Added test_osc.cpp to test sources
5. **`extension/src/command_handler.h`** — Added `OscSender`/`OscReceiver` members + `PollOscReceiver()`
6. **`extension/src/command_handler.cpp`** — Matrix handlers send OSC alongside MIDI
7. **`extension/src/main.cpp`** — OSC init in `InitializeCoreServices()`, receiver polled in `Run()`

### Test Results (from Builder)
- 20 new OSC tests: all pass
- 258 total tests pass (18 pre-existing failures in FxReorderTest, FxPresetTest, SequencerConvertTest — unchanged)
- `make lint` and `make build` clean

## What's NOT Done (Phase 2-3 deferred)
- ReaLearn OSC preset file (`docs/realearn-presets/spidercrab-osc-playtime.json`)
- README documentation updates (Playtime 2 setup instructions)
- Deferred to follow-up issues per Planner plan

## Review Focus Areas

### 1. OSC Protocol Correctness
- **OSC string alignment**: Strings must be NUL-padded to 4-byte boundary. Verify `paddedStringLength()` logic is correct.
- **Big-endian integers**: Verify byte ordering for int args in both sender and receiver.
- **Address convention**: Verify `/playtime/slot/trigger`, `/playtime/slot/record`, `/playtime/scene/trigger`, `/playtime/slot/state` match ReaLearn OSC scheme.

### 2. Cross-Platform Correctness
- Berkeley sockets on Linux (`sys/socket.h`, `unistd.h`)
- Winsock on Windows (`winsock2.h`, `ws2tcpip.h`)
- Note: `OscReceiver` uses `int` for socket FD — on Windows sockets are `SOCKET` (unsigned). Verify this doesn't cause issues (Windows `SOCKET` cast to `int`).
- `closesocket()` vs `::close()` — verify #ifdef branches are correct.

### 3. Concurrency/Safety
- Both sender and receiver are called from the REAPER main thread only (Run()).
- No thread safety issues expected, but verify no deferred callbacks, timers, or thread spawning.

### 4. Error Handling
- Port conflict: 10-port fallback, logs warning.
- Malformed packets: logged and skipped (no crash).
- No remote configured: sender logs one-time warning.

### 5. API/SDK Usage
- No REAPER API calls in OSC code (pure sockets).
- Verify `netinc.h` is not needed (the code uses raw socket headers directly).

### 6. Test Quality
- 20 tests covering building, parsing, error cases, integration.
- Are there any edge cases missing?
- Do the integration tests actually prove sender→receiver works, or just that they don't crash?

## How to Verify

```bash
cd ~/projects/reaper-ipad
make build-debug    # or cmake --build build
cmake --build build --target test  # or make test
# Check lint is clean
make lint
```

## Next Stage
- **Reviewer → Tester** after clean review
- Update label: PUT `{"labels": [23]}` (stage:tester) via:
  `curl -X PUT -u 'madhav:ef561d4c39461c83ee861d1f48010ceec71ac7b2' -H 'Content-Type: application/json' -d '{"labels": [23]}' http://localhost:3000/api/v1/repos/madhav/spidercrab/issues/98/labels`

## Planner Direction — Issue #91

### Approach: Re-implement (not cherry-pick)

**Decision: Re-implement on the current branch. Cherry-pick from c395805 is not viable.**

**Why not cherry-pick:**
- Both extension/src/main.cpp and extension/test/test_command_handler.cpp have content conflicts. The current branch has been significantly restructured:
  - Initialization is now split into InitializeCoreServices() + StartNetworkServers() — c395805 added MIDI input setup in the raw entry point, which won't fit.
  - Run() already has two polling blocks (playtime availability check at ~2s interval, periodic state sync at ~10s interval) — c395805's MIDI feedback polling would be a third block needing to coexist.
  - Test file has 153 tests vs the ~250 in c395805's branch — the files have diverged completely.
- Cherry-pick would also leave 3 known bugs (review issue #942) that need immediate fix commits.

### What needs to change

**1. New file: presets/spidercrab-clip-launcher.json**

ReaLearn compartment preset with 8x8 clip grid mapping (total 72 mappings):
- 64 slot trigger mappings (MIDI notes 36-99), each targeting PlaytimeSlotTransportAction with RecordPlayStop
- 8 scene trigger mappings (MIDI notes 100-107), targeting PlaytimeRowAction with PlayScene
- 2 global mappings: note 108 = Stop (PlaytimeMatrixAction), note 109 = StartOrStopPlayback (PlaytimeMatrixAction)
- All slot mappings have sendFeedbackAfterControl: true so ReaLearn sends feedback notes

**2. extension/src/main.cpp — MIDI feedback listener**

- Add `#define REAPERAPI_WANT_CreateMIDIInput` to the API import list (insert after CreateMIDIOutput)
- Add `g_midiInput` global variable (`static midi_Input* g_midiInput = nullptr;`)
- In InitializeCoreServices(): After the existing MIDI output setup, add MIDI input creation:
  - `if (CreateMIDIInput)` create `g_midiInput = CreateMIDIInput(0)`, call `g_midiInput->start()`
- In iPadControlSurface::Run(): Add MIDI feedback polling as a third block (after the periodic state sync block):
  - `if (g_midiInput)` SwapBufsPrecise, GetReadBuf, iterate events, map notes 36-99 to col/row, update PlaytimeState, broadcast slotStateChanged
- In plugin unload: Add MIDI input cleanup (`g_midiInput->stop(); g_midiInput->Destroy();`) — fixes review issue #1

**3. extension/test/test_command_handler.cpp — 9 tests**

Add 9 MIDI feedback tests (dropping the weak ternary test from c395805 — review issue #3):
- Note36MapsToColumn0Row0
- Note43MapsToColumn7Row0
- Note44MapsToColumn0Row1
- Note99MapsToColumn7Row7
- Note100MapsToSceneRow0
- Note108IsStopAll
- SetSlotStateFromNoteFeedback — simulates Run()'s MIDI feedback logic
- BroadcastEventFromFeedback — verifies broadcast path
- FeedbackPathDoesNotAffectBroadcastCallback — verifies isolation

### APIs/Docs consulted

- docs/reaper-sdk/sdk/reaper_plugin_functions.h: CreateMIDIInput signature
- docs/reaper-sdk/sdk/reaper_plugin.h: midi_Input class (start/stop/SwapBufsPrecise/GetReadBuf/Destroy)
- docs/helgobox/doc/: ReaLearn OSC preset format (compartment JSON schema)
- Commit c395805 on feat/convert-sequencer-to-clip branch

### Edge cases

1. No MIDI devices available: CreateMIDIInput(0) returns null — handled with null check + log
2. Mid-stream device disconnect: events stop arriving; PlaytimeState won't update until next matrix operation
3. Notes outside 36-99 range: filtered by `if (status == 0x90 && note >= 36 && note <= 99)` — scene/global notes dropped (handled by ReaLearn directly)
4. Duplicate comment in Run() (review issue #2): ensure the MIDI polling block has a single unique comment
5. Plugin unload mid-flight: MIDI input must be stopped and destroyed

### Screenshot plan

1. **ReaLearn preset loaded**: Screenshot of ReaLearn compartment panel showing the spidercrab-clip-launcher preset loaded with 72 mappings listed
2. **Expected result — slot state propagated**: After clicking a pad in the REAPER Playtime 2 grid, the slot turns green/playing, and the spidercrab frontend SessionView updates to reflect the state

### Dependencies

- ReaLearn must be installed in REAPER (required for the preset to load)
- Playtime 2 must be installed (required for the slot/scene targets to resolve)
- Existing MIDI output setup (from Issue #43) must be working
- No changes to the frontend (React/TypeScript) are required

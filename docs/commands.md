# WebSocket Command Reference

!!! note "For developers"
    This page is a technical reference for anyone building on or debugging Spidercrab. If you're using the app to make music, you don't need anything here — head to [Touch Gestures](gestures.md) or [The App at a Glance](features/README.md) instead.

The extension's complete capability surface — every command registered in `command_handler.cpp` on `master`. The frontend sends these as flat JSON over `ws://<host>:9224`:

```json
{ "type": "command", "command": "<name>", "id": "<n>", ...params }
```

Responses come back keyed by `id`. Grouped by namespace below.

## transport/
| Command | Purpose |
|---------|---------|
| `transport/play` | Start playback |
| `transport/stop` | Stop |
| `transport/record` | Arm/start recording |
| `transport/getState` | Current transport state |

## track/
| Command | Purpose |
|---------|---------|
| `track/getAll` | List all tracks + state |
| `track/add` | Add a track |
| `track/getFx` | List a track's FX |
| `track/setArm` | Record-arm toggle |
| `track/setMute` | Mute toggle |
| `track/setSolo` | Solo toggle |
| `track/setSelected` | Select a track |
| `track/setRecordMode` | Set record mode |
| `track/setVolume` | Set track volume (fader) |
| `track/setPan` | Set track pan |

## fx/
| Command | Purpose |
|---------|---------|
| `fx/enumerate` | List installed plugins |
| `fx/add` | Add FX to a track |
| `fx/delete` | Remove FX |
| `fx/reorder` | Move FX within a track |
| `fx/setBypass` | Bypass/enable FX |
| `fx/getParams` | Read FX parameters |
| `fx/setParam` | Set a parameter value |
| `fx/getPreset` / `fx/setPreset` | Read / apply a preset |
| `fx/getNamedConfigParm` | Read a per-FX config value (fx_type, pdc, vst_chunk, clap_chunk) |
| `fx/getAllPresetNames` | List a plugin's presets |
| `fx/refreshCache` | Rebuild the plugin index |
| `fx/tags/getAll` / `fx/tags/set` | Read / write FX tags |

## fxchain/
| Command | Purpose |
|---------|---------|
| `fxchain/searchCached` | Search the in-memory chain index |
| `fxchain/searchRecursive` | Recursive search across subfolders |
| `fxchain/load` | Load a `.RfxChain` onto a track |
| `fxchain/save` | Save a track's FX as a chain |
| `fxchain/cycle` | Cycle chain in place |
| `fxchain/reorder` | Reorder chain blocks |
| `fxchain/getDirectory` / `fxchain/getInfo` | Browse chain folders / metadata |
| `fxchain/refreshCache` | Rebuild the `.RfxChain` index |

## sample/
| Command | Purpose |
|---------|---------|
| `sample/getDirectory` | List a directory |
| `sample/getAllCached` / `sample/getCachedPaths` | Read the cached sample index |
| `sample/getCacheStatus` | Cache/scan progress |
| `sample/refreshCache` / `sample/purgeStaleCache` | Rebuild / clean the index |
| `sample/getAudioInfo` | Sample metadata (length, rate, …) |
| `sample/preview` / `sample/stopPreview` | Audition a sample |
| `sample/sendToTrack` | Insert onto a track |
| `sample/sendToSlot` | Insert into a Playtime slot |
| `sample/tags/getAll` / `sample/tags/set` | Read / write sample tags |
| `sample/reaper/libraries` / `sample/reaper/library/files` | Browse REAPER's media libraries |

## sampler/  (RS5K)
| Command | Purpose |
|---------|---------|
| `sampler/create` | Create an RS5K sampler instance |
| `sampler/setReverse` | Reverse the sample (renders a reversed copy, swaps `FILE0`) |

## matrix/  (Playtime clip grid)
| Command | Purpose |
|---------|---------|
| `matrix/getAll` / `matrix/getSlot` | Read the whole grid / one slot |
| `matrix/pollState` | Poll for live slot changes |
| `matrix/setSlotState` | Set a slot's state |
| `matrix/triggerSlot` | Launch a clip |
| `matrix/triggerScene` | Launch a scene (row) |
| `matrix/recordSlot` | Record into a slot |
| `matrix/recordSlotCountdown` | Record into a slot after an N-bar count-in (`bars`: 0-8). The trigger fires at the next bar boundary + N bars (4/4 at the project tempo); the UI follows `matrix/countdown` events. `bars: 0` behaves exactly like `matrix/recordSlot` |
| `matrix/clearSlot` | Clear a slot (OSC → Playtime ClearSlot) |
| `matrix/play` | Playtime's own playback, not REAPER's transport |
| `matrix/stopAll` | Stop every clip in the matrix |
| `matrix/click` | REAPER's metronome on or off; called with no argument it reads the state |
| `matrix/panic` | Abruptly stop all clips |
| `transport/getTempo` | Project tempo, which Playtime follows |
| `transport/setTempo` | Set the project tempo |
| `matrix/setSlotReverse` | Reverse a clip in a slot |

## seq/  (step sequencer)
Patterns live in MIDI items, not in the extension. See
[issue #141](https://github.com/quantockhills/spidercrab/issues/141).

| Command | Purpose |
|---------|---------|
| `seq/listItems` | MIDI items on a track, with take names |
| `seq/readPattern` | Notes and per-step ext data for one item |
| `seq/writePattern` | Replace an item's notes and ext data, in one undo block |
| `seq/createTrack` | Make a track with an empty MIDI item to sequence |
| `seq/addPad` | Add a sample to a drum rack as a new pad, creating the rack if needed |
| `seq/listRacks` | Drum racks built by MPL's RS5k manager, with their pads |
| `seq/sendToSlot` | Hand the pattern to a Playtime slot, via ReaLearn |

## extstate/  (REAPER's shared key/value store)
The only channel into a Lua script that draws its own window — such a script
owns no track and no FX slot, so nothing else reaches it.

| Command | Purpose |
|---------|---------|
| `extstate/get` | One key, with `exists` alongside the value |
| `extstate/getMany` | A batch of keys, returned as an object |
| `extstate/set` | Write a key (not persisted unless asked) |

## playtime/
| Command | Purpose |
|---------|---------|
| `playtime/isAvailable` | Is Playtime 2 installed/loaded |
| `playtime/launch` | Launch Playtime |

## midi/
| Command | Purpose |
|---------|---------|
| `midi/event` | Send a raw MIDI event (e.g. note on) |
| `midi/noteOn` | Play a note into the selected track (`note`, `velocity`?, `channel`?) |
| `midi/noteOff` | Release a note (`note`, `channel`?) |
| `midi/setFastPath` | Toggle the low-latency note path (`enabled`): when on, note frames are dispatched by the dedicated fast socket without waiting for REAPER's ~30 Hz Run() tick |

!!! note "The low-latency note socket"
    The Keys tab sends notes over a second WebSocket on **port + 1** (9225 by default). It runs its own ~1 ms thread in the extension, so note latency is roughly 5 ms instead of ~22 ms through the main socket. Notes land in the selected track's Virtual MIDI Keyboard input, which is auto-routed/armed/monitored while the Keys tab is in use.

## applemidi/  (RTP-MIDI / Apple Network MIDI)
The extension speaks Apple's Network MIDI session protocol (RFC 4695/6295) over UDP. iOS devices are session *listeners* only, so the extension initiates; the iPad's CoreMIDI Network Session connects to it over Wi-Fi.

| Command | Purpose |
|---------|---------|
| `applemidi/connect` | Initiate a session with the caller's own IP (`host` and `port` optional; control port defaults to 5004) |
| `applemidi/disconnect` | End the session (also panics held notes) |
| `applemidi/status` | Session state, peer host/port, routing flag |
| `applemidi/setRouting` | Toggle "direct to selected track" (`enabled`). Disabling restores the tracks' previous input/monitor settings |

## Events
Beyond request/response, the extension broadcasts `{"type":"event","event":"<name>","payload":{...}}`:

| Event | When |
|-------|------|
| `matrix/slotStateChanged` | A clip slot changed (launch, record, stop…) |
| `matrix/countdown` | Record count-in progress (`column`, `row`, `active`, `bars`, `targetBars`) |
| `applemidi/stateChanged` | AppleMIDI session state (`state`: idle/connecting/syncing/open/failed) |
| `track_state_changed` / `track_list_changed` | Track state / list changed |
| `fx_param_changed` | A watched FX parameter moved (e.g. from the plugin's own window) |

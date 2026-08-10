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
| `matrix/clearSlot` | Clear a slot (OSC → Playtime ClearSlot) |
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

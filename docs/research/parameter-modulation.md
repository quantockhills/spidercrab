# Parameter Modulation from iPad (Research)

**Issue:** #76
**Status:** Research Complete
**Feasibility:** ✅ FULLY FEASIBLE
**Milestone:** Future

## Summary

REAPER's built-in parameter modulation system (LFO, audio control signal / envelope follower,
parameter linking, MIDI learn) is **fully accessible** from C++ extensions via
`TrackFX_GetNamedConfigParm` and `TrackFX_SetNamedConfigParm`. Both functions exist in the
REAPER SDK but are **not yet loaded** into the spidercrab extension.

## Two Distinct Systems

REAPER has two separate systems for varying FX parameters:

1. **Automation envelopes** — time-based curves recorded in the arrange view via
   `GetFXEnvelope` + envelope point APIs. These are what you see in the arrange lane.
2. **Parameter modulation** — real-time modulation sources (LFO, audio signal, MIDI link)
   applied per-parameter via the parameter modulation dialog. This is what this research covers.

**Important:** These are additive. Automation sets the baseline; modulation varies the value
around it in real time. `GetFXEnvelope` returns the *automation* envelope, NOT the modulation
state. Modulation is read/written via `GetNamedConfigParm` only.

## API Reference

### TrackFX_GetNamedConfigParm

```cpp
bool TrackFX_GetNamedConfigParm(
    MediaTrack* track,
    int fx,
    const char* parmname,
    char* bufOutNeedBig,
    int bufOutNeedBig_sz
);
```

Returns true on success. Buffer should be ≥4096 bytes.

### TrackFX_SetNamedConfigParm

```cpp
bool TrackFX_SetNamedConfigParm(
    MediaTrack* track,
    int fx,
    const char* parmname,
    const char* value
);
```

Returns true on success. All values are strings.

### SDK locations

| Function | WANT macro | Declaration | Import entry |
|----------|-----------|-------------|--------------|
| `TrackFX_GetNamedConfigParm` | `REAPERAPI_WANT_TrackFX_GetNamedConfigParm` | Line 7402 | Line 10324 |
| `TrackFX_SetNamedConfigParm` | `REAPERAPI_WANT_TrackFX_SetNamedConfigParm` | Line 7623 | Line 10390 |

## Modulation Properties

The `parmname` follows the pattern: `param.{index}.{modtype}.{field}`

### LFO Modulation (`param.X.lfo.*`)

| Field | Type | Description |
|-------|------|-------------|
| `active` | `"0"` or `"1"` | LFO enabled |
| `dir` | `"0"`=positive, `"1"`=negative, `"2"`=bipolar | Modulation direction |
| `phase` | `"0.0"` to `"360.0"` | Phase offset (degrees) |
| `speed` | float string e.g. `"0.5000"` | LFO speed in Hz (or beats when temposync=1) |
| `strength` | `"0.0"` to `"100.0"` | Modulation amount (%) |
| `temposync` | `"0"` or `"1"` | Tempo sync on/off |
| `free` | `"0"` or `"1"` | Free run (0=retrigger on note, 1=free) |
| `shape` | `"0"`=sine, `"1"`=tri, `"2"`=saw, `"3"`=inv saw, `"4"`=square, `"5"`=random/S&H, `"6"`=var1, `"7"`=var2 | Waveform shape |

### Audio Control Signal / Envelope Follower (`param.X.acs.*`)

| Field | Type | Description |
|-------|------|-------------|
| `active` | `"0"` or `"1"` | ACS enabled |
| `dir` | `"0"`=positive, `"1"`=negative, `"2"`=bipolar | Direction |
| `strength` | `"0.0"` to `"100.0"` | Modulation amount (%) |
| `attack` | float string | Attack time (ms) |
| `release` | float string | Release time (ms) |
| `dblo` | float string | dB low threshold |
| `dbhi` | float string | dB high threshold |
| `chan` | index string | Audio channel source |
| `stereo` | `"0"` or `"1"` | Stereo mode |
| `x2` | `"0"` or `"1"` | Dual envelope X2 |
| `y2` | `"0"` or `"1"` | Dual envelope Y2 |

### Parameter Link / MIDI Link (`param.X.plink.*`)

| Field | Type | Description |
|-------|------|-------------|
| `active` | `"0"` or `"1"` | Link enabled |
| `scale` | float string | Scale factor |
| `offset` | float string | Offset value |
| `effect` | index or `"-100"` | Source FX index (-100 = MIDI mode) |
| `param` | index string | Source parameter index |
| `midi_bus` | index string | MIDI bus |
| `midi_chan` | index string | MIDI channel |
| `midi_msg` | int string | MIDI message type |
| `midi_msg2` | int string | MIDI message secondary |

When `effect = "-100"`, the MIDI link properties become active.

### Modulation Module Global (`param.X.mod.*`)

| Field | Type | Description |
|-------|------|-------------|
| `active` | `"0"` or `"1"` | Modulation enabled for this param |
| `baseline` | float string | Baseline (center) value |
| `visible` | `"0"` or `"1"` | Is UI shown |

### MIDI/OSC Learn (`param.X.learn.*`)

| Field | Type | Description |
|-------|------|-------------|
| `midi1` | hex string | MIDI learn primary |
| `midi2` | hex string | MIDI learn secondary |
| `osc` | string | OSC learn pattern |
| `mode` | int string | Learn mode |
| `flags` | hex string | Learn flags |

### Automatable Check

```cpp
// Returns "1.000000" if the parameter supports automation/modulation
TrackFX_GetNamedConfigParm(track, fx, "param.0.automatable", buf, 4096);
```

This should be checked **before** any modulation operations. Non-automatable params will
silently ignore modulation writes.

## Current Codebase State

### What's missing

- `#define REAPERAPI_WANT_TrackFX_GetNamedConfigParm` — not in `main.cpp`
- `#define REAPERAPI_WANT_TrackFX_SetNamedConfigParm` — not in `main.cpp`
- `TrackFX_GetNamedConfigParm` — not in `ReaperAPI` struct in `command_handler.h`
- `TrackFX_SetNamedConfigParm` — not in `ReaperAPI` struct in `command_handler.h`
- Import table entries — not registered (but SDK already has them at lines 10324/10390)
- No modulation command handlers exist anywhere
- No modulation frontend code exists

### What's already done

- `TrackFX_GetParamEx` IS loaded and used (provides min/max/mid values)
- `TrackFX_GetParam`, `TrackFX_SetParam` IS loaded and used
- `TrackFX_GetPresetIndex`, `TrackFX_SetPreset` IS loaded and used
- The extension architecture for loading new APIs is well-established
- CSURF_EXT_SETFXPARAM callback fires for all param changes (but carries no modulation metadata)

## Implementation Plan

### Phase 1: Backend API Loading

**Files:** `extension/src/main.cpp`, `extension/src/command_handler.h`

1. Add `#define REAPERAPI_WANT_TrackFX_GetNamedConfigParm` and
   `#define REAPERAPI_WANT_TrackFX_SetNamedConfigParm` to `main.cpp`
2. Add function pointer declarations to `ReaperAPI` struct in `command_handler.h`
3. Import table entries already exist in SDK — no additional wiring needed
4. Verify API loading succeeds (similar to how `TrackFX_GetParamEx` is verified)

### Phase 2: Read Modulation Command

**Files:** `extension/src/command_handler.h`, `extension/src/command_handler.cpp`

New command: `fx/getModulation`

```json
// Request
{
  "command": "fx/getModulation",
  "trackIdx": 0,
  "fxIdx": 0,
  "paramIdx": 0
}

// Response
{
  "command": "fx/getModulation",
  "status": "ok",
  "data": {
    "lfo": {
      "active": 1,
      "dir": 0,
      "phase": 0.0,
      "speed": 0.5,
      "strength": 80.0,
      "temposync": 0,
      "free": 1,
      "shape": 0
    },
    "acs": {
      "active": 0,
      "dir": 0,
      "strength": 100.0,
      "attack": 2.0,
      "release": 100.0,
      "dblo": -60.0,
      "dbhi": -6.0,
      "chan": 0,
      "stereo": 0,
      "x2": 0,
      "y2": 0
    },
    "mod": {
      "active": 0,
      "baseline": 0.5,
      "visible": 0
    },
    "automatable": true
  }
}
```

Read all `param.X.*` sub-keys and return parsed values as JSON numbers.

### Phase 3: Write Modulation Command

New command: `fx/setModulation`

```json
{
  "command": "fx/setModulation",
  "trackIdx": 0,
  "fxIdx": 0,
  "paramIdx": 0,
  "modType": "lfo",
  "field": "active",
  "value": "1"
}
```

Validates `automatable` first, then calls `TrackFX_SetNamedConfigParm`.

Alternative: batch set all fields for a modulation type at once:

```json
{
  "command": "fx/setModulation",
  "trackIdx": 0,
  "fxIdx": 0,
  "paramIdx": 0,
  "modType": "lfo",
  "fields": {
    "active": "1",
    "speed": "1.0",
    "shape": "0",
    "strength": "75.0"
  }
}
```

### Phase 4: Frontend UI

**Files:** `frontend/src/components/ModulationPanel.tsx`, `frontend/src/hooks/useModulation.ts`

#### New hook: `useModulation`

```typescript
interface ModulationState {
  lfo: LfoState;
  acs: AcsState;
  mod: ModState;
  automatable: boolean;
}

function useModulation(trackIdx: number, fxIdx: number, paramIdx: number) {
  const [modState, setModState] = useState<ModulationState | null>(null);
  // Calls fx/getModulation on mount
  // Returns setModField(modType, field, value) function
}
```

#### New component: `ModulationPanel`

A slide-over drawer that opens when tapping a modulation indicator on a param slider.

**LFO tab:**
- Waveform selector (sine/tri/saw/sqr/random) — tappable icons
- Speed slider with Hz label + tempo sync toggle
- Strength slider (0-100%) with percentage label
- Phase slider (0-360°)
- Polarity toggle (positive/negative/bipolar)
- Active toggle
- Free run / retrigger toggle

**ACS tab:**
- Active toggle
- Attack/release sliders (ms)
- Strength slider
- dB low/high threshold sliders
- Channel selector

#### Integration into `ParamControl.tsx`

Each param slider gets:
- A small modulation indicator dot (shown when modulation is active)
- Tapping the dot opens `ModulationPanel`
- If LFO is active, show small waveform icon
- If envelope follower is active, show "Env" badge

## Limitations

| Feature | Status | Reason |
|---------|--------|--------|
| Read/write LFO state | ✅ Fully feasible | Via GetNamedConfigParm |
| Read/write ACS state | ✅ Fully feasible | Via GetNamedConfigParm |
| Read/write parameter link | ✅ Fully feasible | Via GetNamedConfigParm |
| Read/write MIDI learn | ✅ Fully feasible | Via GetNamedConfigParm |
| Visualize LFO waveform | ⚠️ Partial | Can derive shape from params, but no sample-level access |
| Real-time modulation value display | ❌ Not feasible | Would require audio-rate polling over WebSocket |
| Modulation curve editing | ❌ Not feasible | REAPER's modulation is parameter-based, not curve-based |
| Modulation state change events | ❌ Not available | No callback fires on modulation changes |
| Create new modulation from scratch | ⚠️ Tricky | Sub-keys must be set in correct order; mod.active must be set first |

## Edge Cases

1. **Buffer size for GetNamedConfigParm**: Use ≥4096 bytes for `bufOutNeedBig`
2. **Non-automatable params**: Check `param.X.automatable` before any modulation writes
3. **Container FX**: Use `0x20000000` index offset for container sub-items
4. **Zero-range params**: Skip modulation if param min == max
5. **Tempo sync speed**: When enabled, speed value is in beats, not Hz
6. **ACS requires routing**: Envelope follower needs sidechain routing setup
7. **String parsing**: All values are read as strings — use `atof()`/`snprintf()` for conversion
8. **Set order**: `mod.active=1` may need to be set before `lfo.active=1`

## Recommended Future Issues

1. **Backend: Load modulation APIs + read command** (~50 lines C++)
2. **Backend: Write modulation command** (~100 lines C++)
3. **Frontend: ModulationPanel LFO tab** (~150 lines TypeScript)
4. **Frontend: ModulationPanel ACS tab** (~100 lines TypeScript)
5. **Frontend: Param slider modulation indicator** (~50 lines TypeScript)
6. **E2E test: Modulation roundtrip** (~100 lines Playwright)

## References

- `docs/reaper-sdk/sdk/reaper_plugin_functions.h` — API declarations at lines 7402 and 7623
- `docs/reaper-sdk/sdk/reaper_plugin.h` — CSURF_EXT types
- `extension/src/main.cpp` — Where new API WANT macros are added
- `extension/src/command_handler.h` — ReaperAPI struct with function pointers
- `extension/src/command_handler.cpp` — Where command handlers are implemented
- `frontend/src/components/ParamControl.tsx` — Existing param slider UI
- `frontend/src/hooks/useFx.ts` — Existing FX hooks for reference
- Issue #76 comments — Full Planner research with API validation

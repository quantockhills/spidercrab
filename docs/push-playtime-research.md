# Ableton Push Integration & Playtime 2 API Research

> Issue #62 — Research for Phase 2 clip launcher
> Date: 2026-05-31
> Branch: feat/clip-launcher-playtime

---

## 1. Ableton Push Hardware Layout

### 1.1 Physical Layout (Push 2)

```
┌────────────────────────────────────────────────────────────────────┐
│ [Display] 160x960 RGB graphical LCD                               │
│                                                                    │
│ ┌───┐ ┌──────────────────────────┐ ┌───┐ ┌──────────────────────┐ │
│ │ ↑ │ │  Encoders A1-A8          │ │ ← │ │  Encoders B1-B8      │ │
│ │ K │ │  (push + rotate)         │ │ → │ │  (display-parametric)│ │
│ │ n │ └──────────────────────────┘ └───┘ └──────────────────────┘ │
│ │ o │ ┌──────────────────────────────────────────────────────────┐│
│ │ b │ │ 8×8 RGB Pad Grid (64 velocity-sensitive pads)           ││
│ │ s │ │ Layout: columns A-H, rows 1-8                            ││
│ │   │ │                                                          ││
│ │ S │ │ Session: Clip slots (tracks×scenes)                     ││
│ │ t │ │ Drum Rack: 4×4 pad banks (16×4 pads)                   ││
│ │ r │ │ Sequencer: 8 steps × 8 notes                            ││
│ │ i │ │ User: Free MIDI mapping                                 ││
│ │ p │ └──────────────────────────────────────────────────────────┘│
│ │   │ ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬──────┐ │
│ └───┘ │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ ↑  │ Tap  │ │
│       │ S1 │ S2 │ S3 │ S4 │ S5 │ S6 │ S7 │ S8 │ M  │ A  │ Tempo│ │
│       └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴──────┘ │
│       Scene Launch Strip                  M=Master, A=Add Track    │
│                                                                    │
│ ┌─────┬─────┬─────┬────┬──────┬───┬───┬───┬───┐                    │
│ │Play │Rec  │Quant │Del │Double│←  │→  │Up │Dn │                    │
│ │     │     │      │    │      │Session & Transport│              │
│ └─────┴─────┴─────┴────┴──────┴───┴───┴───┴───┘                    │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │           Touch Strip (pitch bend / modulation)               │  │
│ └────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Physical Sections (for iPad emulation)

| Section | Position | Function | iPad Equivalent |
|---------|----------|----------|----------------|
| **8×8 Pad Grid** | Center | Clip slots / drum pads / sequencer | 8×8 touch grid |
| **Scene Launch Strip** | Right edge (8 rows) | Launch/stop entire scenes | Right-side scene column |
| **Track Encoders (A)** | Top row, above pads | Volume, pan, sends, device params | Touch sliders |
| **Display Encoders (B)** | Top row, display-area | Browser navigation, device control | Touch screen controls |
| **Display** | Top center | 160×960 grayscale LCD | iPad screen (full-color) |
| **Transport** | Bottom | Play, Record, Quantize, Delete, Double | Bottom transport bar |
| **Navigation** | Lower right | Left/Right/Up/Down arrows + Session/User button | Swipe gestures |
| **Touch Strip** | Bottom edge | Pitch bend / modulation | Touch strip at bottom |
| **Knobs (8)** | Top left | Parameter control (push + rotate) | Touch sliders + tap |

### 1.3 Pad Color Feedback Protocol

Push uses RGB LEDs behind each pad. Colors indicate clip/slot state:

| Color | Meaning | Playtime 2 Equivalent |
|-------|---------|----------------------|
| Green (playing) | Clip is actively playing | Slot with active clip |
| Amber (stopped) | Clip loaded, not playing | Slot with clip at rest |
| Red | Recording | Slot recording |
| Yellow/Orange | Clip queued to play (on next quantize) | Slot waiting for quantization |
| Off | Empty slot | Empty slot |
| Blue/White | Currently selected/highlighted | Active slot indicator |
| Dim/Muted | Scene or track is muted/soloed | Track-based dimming |

Push sends note-on/off for pad presses, and receives note-on with velocity-as-color
for LED feedback. Color is encoded as the note velocity value, mapped through
a color table (sysex-configurable).

---

## 2. Ableton Push MIDI Protocol

### 2.1 Architecture

Push 2 provides two USB MIDI ports:
- **Live Port** — Used by Ableton Live's Push 2 control surface script
- **User Port** — Available for custom applications (MIDI mapping, external control)

The display interface is a separate USB endpoint (not MIDI).

### 2.2 Key MIDI Details

**Pad Grid:**
- Each pad = MIDI note on/off
- Note numbers 36–99 (can be remapped)
- Velocity = pad press velocity (input)
- Velocity = color palette index (output for LED feedback)

**Buttons:**
- Scene launch buttons = MIDI note on/off (momentary)
- Transport buttons = MIDI CC (momentary)
- Navigation arrows = MIDI CC (momentary)

**Encoders:**
- Incremental rotary encoders (MIDI CC with relative values)
- Push action = separate MIDI note

**LED Color:**
- Sysex command to set palette entries (RGB 8-bit per channel)
- Pad color via note-on velocity (index into active palette)
- Global brightness via sysex

### 2.3 Protocol Summary

| Control | MIDI Message | Notes |
|---------|-------------|-------|
| Pad press | Note On/Off | Velocity 1–127 |
| Pad LED | Note On (feedback) | Velocity = color index |
| Scene buttons | Note On/Off | Momentary |
| Encoders | CC (relative) | +1/-1 values |
| Encoder push | Note On/Off | Momentary |
| Transport | CC momentary | Various CC numbers |
| Touch strip | Pitch Bend / CC | Configurable |
| LED setup | Sysex | RGB palette, brightness |

### 2.4 What Push Does That We Must Emulate on iPad

| Push Feature | iPad Implementation |
|-------------|-------------------|
| Velocity-sensitive pads | Touch pressure (not great) OR tap + velocity slider |
| RGB LED feedback | Color-coded UI cells (full RGB, better than Push) |
| Haptic feedback | iOS haptic engine (UIImpactFeedbackGenerator) |
| Physical button feel | Touch targets minimum 44pt |
| Dedicated scene strip | Right-side scene column in grid |
| Dedicated transport | Bottom tab or toolbar |
| Encoder push+rotate | Tap + drag / vertical slider |
| Display screen | iPad screen (huge improvement) |
| Touch strip | Touch strip widget at bottom |

---

## 3. Playtime 2 API Architecture

### 3.1 Overall Architecture

Playtime 2 is a clip launcher that runs inside REAPER as part of the Helgobox
(ReaLearn + Playtime) REAPER extension. It is written primarily in Rust.

```
┌──────────────────────────────────────────────────────────────┐
│  REAPER                                                       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Helgobox (realearn.so)                                  │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │  Playtime 2                                         │  │ │
│  │  │  ┌─────────────────────┐  ┌──────────────────────┐ │  │ │
│  │  │  │  Playtime API       │  │  Playtime App (GUI)  │ │  │ │
│  │  │  │  (Rust: playtime-   │  │  (Flutter/Dart)      │ │  │ │
│  │  │  │   api crate)        │  │                      │ │  │ │
│  │  │  │  - Clip matrix      │  │  Full screen grid     │ │  │ │
│  │  │  │  - Slot lifecycle   │  │   UI for iPad/desktop │ │  │ │
│  │  │  │  - Sequence engine  │  │                      │ │  │ │
│  │  │  └─────────┬───────────┘  └──────────────────────┘ │  │ │
│  │  │            │                                          │  │ │
│  │  │  ┌─────────┴────────────────────────────────────────┐ │  │ │
│  │  │  │  ReaLearn                                        │ │  │ │
│  │  │  │  - Controller integration                        │ │  │ │
│  │  │  │  - MIDI/OSC mapping                             │ │  │ │
│  │  │  │  - Control units (scrollable grid position)      │ │  │ │
│  │  │  │  - Compartment presets (Luau/JSON)              │ │  │ │
│  │  │  └─────────────────────────────────────────────────┘ │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Playtime 2 Rust API (playtime-api crate)

Located at: `docs/helgobox/playtime-api/src/`

**Core modules:**

| Module | Contents |
|--------|----------|
| `lib.rs` | Exports `persistence` and `runtime` |
| `persistence/mod.rs` | Data model: `Matrix`, `Column`, `Slot`, `Clip`, `Row`, `Source`, settings |
| `runtime/app.rs` | Runtime info events (`InfoEvent`), `SimpleMapping`, `CellAddress` |
| `runtime/reaper.rs` | C API for REAPER (`HB_FindFirstPlaytimeHelgoboxInstanceInProject`, `HB_CreateClipMatrix`, `HB_ShowOrHidePlaytime`) |
| `runtime/control_unit.rs` | Control unit model (scrollable grid position) |

### 3.3 Clip Matrix Data Model

```
Matrix
├── columns: Vec<Column>           [optional, ordered left to right]
│   ├── id: ColumnId               [nanoid]
│   ├── name: Option<String>
│   ├── clip_play_settings          [inherits → column → matrix]
│   ├── clip_record_settings
│   └── slots: Vec<Slot>           [only filled slots stored]
│       ├── id: SlotId             [nanoid]
│       ├── row: usize             [row index within column, 0-indexed]
│       ├── clips: Vec<Clip>       [currently: clip_old is single Clip]
│       └── ignited: bool          [auto-lit on trigger]
│           └── Clip
│               ├── id: ClipId
│               ├── name: Option<String>
│               ├── source: Source { File | MidiChunk }
│               ├── time_base: ClipTimeBase { Time | Beat }
│               ├── start_timing: ClipPlayStartTiming { Immediately | Quantized }
│               ├── stop_timing: ClipPlayStopTiming
│               ├── looped: bool
│               ├── volume: Db
│               ├── color: ClipColor { PlayTrackColor | CustomColor | PaletteColor }
│               ├── section: Section { start_pos, length }
│               └── pitch_shift: Semitones
│
├── rows: Vec<Row>                 [optional, ordered top to bottom]
│   ├── id: RowId
│   ├── name: Option<String>       [scene names]
│   ├── tempo: Option<Bpm>
│   └── time_signature: Option<TimeSignature>
│
├── clip_play_settings (global defaults)
├── clip_record_settings (global defaults)
├── transport_sync_mode: { Partial, Full }
└── activat_slot_on_trigger: bool
```

### 3.4 Slot/Clip State Lifecycle

```
EMPTY ──→ RECORDING ──→ STOPPED ──→ PLAYING ──→ STOPPED ──→ ...
  ↑         (rec      (clip       (clip loop    (user stops)
  │          creates   saved)       or end)
  │          clip)                         │
  └────────────────────────────────────────┘
         (user clears slot)

Clip states (from persistence model, not runtime):
- Empty: slot has no clips
- Stopped: slot has a clip, clip is loaded but not playing
- Playing: clip is actively playing
- Recording: recording in progress (creates a Clip on stop)
- Queued: user triggered, waiting for quantization boundary
```

### 3.5 C API for REAPER Extension Control

From `runtime/reaper.rs` (auto-generated via `reaper_api!` macro):

```c
// Find the first Helgobox instance with a Playtime matrix in a project
// Returns instance ID or -1 if none exists
int HB_FindFirstPlaytimeHelgoboxInstanceInProject(ReaProject* project);

// Create a new Playtime clip matrix in the given Helgobox instance
void HB_CreateClipMatrix(int instance_id);

// Show or hide the Playtime app for the given instance
// Will start the app + create matrix if needed
void HB_ShowOrHidePlaytime(int instance_id);
```

This is the **only** public C API. There is no WS/OSC/gRPC interface exposed
by Playtime 2 itself.

### 3.6 Control Unit Model

Control units are how controllers (like our iPad app) interface with Playtime.

```rust
pub struct ControlUnit {
    pub id: ControlUnitId,        // = ReaLearn unit ID
    pub name: String,             // Display name for the device
    pub palette_color: Option<u32>,
    pub top_left_corner: SlotAddress,    // Scroll position in matrix
    pub column_count: u32,              // Grid width for this controller
    pub row_count: u32,                 // Grid height for this controller
}
```

Key insight: The **ControlUnit** defines a viewport into the matrix.
`top_left_corner` + `column_count` + `row_count` = the visible portion
of the matrix that this controller sees. Scrolling changes `top_left_corner`.

### 3.7 Simple Mapping (MIDI → Matrix Action)

Playtime maps MIDI notes directly to matrix operations via `SimpleMapping`:

```rust
pub struct SimpleMapping {
    pub source: SimpleSource,          // MIDI Note(channel, number)
    pub target: SimpleMappingTarget,   // Action to perform
}

pub enum SimpleMappingTarget {
    TriggerMatrix,                     // Toggle play/stop entire matrix
    TriggerColumn(ColumnAddress),      // Toggle column
    TriggerRow(RowAddress),            // Toggle scene/row
    TriggerSlot(SlotAddress),          // Toggle individual slot
    SmartRecord,                       // Smart record action
    EnterSilenceModeOrPlayIgnited,     // Silence mode / play ignited
    SequencerRecordOnOffState,         // Toggle sequencer recording
    SequencerPlayOnOffState,           // Toggle sequencer playback
    TapTempo,                          // Tap tempo
}
```

### 3.8 Matrix Sequencing (Automation)

Playtime 2 includes a matrix sequencer for automated playback/recording
sequences. From `persistence/mod.rs`:

```rust
pub struct MatrixSequence {
    pub id: MatrixSequenceId,
    pub info: MatrixSequenceInfo,
    pub data: MatrixSequenceData,
    // events: Vec<MatrixSequenceEvent> with timing + message
    // messages include: PanicMatrix, StopMatrix, StartScene, StartSlot, StopSlot, etc.
}
```

---

## 4. Integration Interfaces Available to Us

### 4.1 What Playtime 2 Exposes Externally

| Interface | Details | Usable From |
|-----------|---------|-------------|
| **ReaLearn MIDI Mapping** | Map MIDI notes/CC to matrix actions via Luau presets | Any MIDI controller |
| **C API** (3 functions) | `HB_FindFirstPlaytimeHelgoboxInstanceInProject` `HB_CreateClipMatrix` `HB_ShowOrHidePlaytime` | Our C++ extension |
| **ReaLearn Luau API** | Compartment presets in Luau with type helpers | Script development |
| **Info Events** | Toast messages for the Playtime app UI | Via Playtime app |
| **SimpleMapping** | Note → matrix action mapping (configured in ReaLearn) | Via controller presets |
| **ControlUnitConfig** | Define controller viewport + scroll position | Via ReaLearn config |
| **ReaLearn OSC** | ReaLearn can receive OSC, but Playtime matrix actions are MIDI-only | Via ReaLearn's MIDI bridge |

### 4.2 What's NOT Exposed (Must Build Ourselves)

| Missing | Impact | Our Solution |
|---------|--------|-------------|
| **No WebSocket API for Playtime** | Can't control Playtime from iPad | Build WebSocket → C API bridge in our extension |
| **No clip state query** | Can't get current play/stop state per slot | Poll Reaper API or hook into Playtime events |
| **No color feedback over network** | Can't see what's playing/stopped on iPad | Track state locally + sync via WebSocket |
| **No programmatic scroll** | Can't navigate matrix from iPad | Set `top_left_corner` via ReaLearn targets |
| **No OSC for matrix actions** | Only MIDI for slot triggers | Either inject MIDI from our extension, or use C API |
| **No bundled iPad UI** | No client exists for iPad | Build React PWA with our own session view |

### 4.3 How to Bridge: Our Extension + Playtime 2

The integration strategy:

```
iPad React PWA
    ↕ WebSocket (our protocol)
Our C++ Extension (WebSocket → Reaper API)
    ↕ Reaper API + Playtime C API
Playtime 2 (inside Helgobox)
    ↕ ReaLearn + MIDI
```

**Option A (Recommended):** Extend our existing WebSocket command handler
to support Playtime 2 operations:

1. Register our extension as a ReaLearn / Playtime-aware control surface
2. Use `HB_FindFirstPlaytimeHelgoboxInstanceInProject` to find the instance
3. Use `HB_CreateClipMatrix` / `HB_ShowOrHidePlaytime` to manage the matrix
4. For slot operations (play/stop), use Reaper's MIDI output to send
   notes matching the SimpleMapping configuration
5. For state feedback, poll Reaper tracks / Playtime state and push
   events over WebSocket

**Option B (All-through-ReaLearn):** Configure ReaLearn presets that
expose all matrix actions as MIDI notes, then send MIDI from our extension.
This is simpler but less flexible.

### 4.4 Protocol Requirements for Our iPad Grid UI

For the iPad clip launcher (Issue #61), we need to extend our WebSocket protocol:

```typescript
// New commands needed:
interface ClipCommands {
  // Query
  "matrix/getAll": {} → { columns, rows, slots, states }
  "matrix/getSlot": { column, row } → { clip, state }

  // Control
  "matrix/triggerSlot": { column, row, velocity? } → {}
  "matrix/triggerColumn": { column } → {}
  "matrix/triggerScene": { row } → {}
  "matrix/stopAll": {} → {}
  "matrix/recordSlot": { column, row } → {}
  "matrix/clearSlot": { column, row } → {}
  "matrix/setScroll": { column, row, width?, height? } → {}

  // Events (server → client)
  "matrix/slotStateChanged": { column, row, state: "empty"|"stopped"|"playing"|"recording"|"queued" }
  "matrix/transportChanged": { isPlaying, bpm, quantization }
}
```

---

## 5. Comparison: Ableton Push vs Playtime 2

| Feature | Ableton Push | Playtime 2 | iPad App (Our) |
|---------|-------------|------------|----------------|
| Grid size | 8×8 (fixed) | Unlimited (scrollable) | Configurable viewport |
| Clip launch | Note ON → Instant | Note → SimpleMapping | WebSocket → extension |
| Color feedback | RGB palette (sysex) | Clip color field | Full CSS color |
| Scene launch | Right strip (8 buttons) | SimpleMapping TriggerRow | Scene column |
| Track control | 8 encoders + display | Via ReaLearn targets | Touch sliders + WS |
| Browser | Display + 4 knobs | Playtime app browser | Sample browser tab |
| Transport | Dedicated buttons | Via ReaLearn mapping | Transport bar |
| State sync | Hardware + Live | MIDI feedback + polling | WebSocket events |
| Recording | Arm + record button | SmartRecord / MIDI | Start/stop via WS |
| Quantization | Global grid setting | Per-clip + matrix settings | WS-synced config |
| MIDI sequencing | Step sequencer mode | Matrix sequences (automated) | Build later |
| Drum pads | Pad mode (4×4 banks) | N/A | Add as feature |
| Display | 160×960 grayscale LCD | Full Flutter GUI | iPad screen |

---

## 6. Recommendations & Next Steps

### Priority Order for Phase 2

1. **#62 (this issue DONE)** → Research document committed
2. **#61 Clip Launcher** → Build iPad grid UI + extend our WebSocket protocol
   - Add `matrix/*` commands to `command_handler.cpp`
   - Create a React SessionView component with 8×8 grid
   - Add Playtime C API calls for basic slot trigger
   - Wire up color feedback via WebSocket events
3. **#63 MIDI Step Sequencer** → Grid-based step sequencing
   - Uses same grid component from #61
   - Add note-on/off per step, velocity per step
   - Sync to Playtime matrix position (if desired)

### Key Architecture Decisions for Phase 2

1. **Bridge via C API + MIDI** — Use `HB_*` functions for matrix management,
   and our extension's existing MIDI output for slot triggers. This is the
   most direct path that avoids depending on ReaLearn preset configuration.

2. **State tracking in extension** — The extension should maintain a local
   model of the matrix state (slots, colors, play/stop), synced via polling
   and events. This avoids round-trip latency for display updates.

3. **iPad grid as a ControlUnit** — Model the iPad as a ReaLearn ControlUnit
   with configurable column_count/row_count. This gives us scrolling for free.

4. **Full RGB, not palette** — Unlike Push's indexed palette, our iPad grid
   can use full RGB colors. Map Playtime's ClipColor to CSS colors.

5. **WebSocket remains the transport** — No need to switch to OSC or MIDI
   over network. Our existing JSON WebSocket protocol handles everything.

### Playtime 2 API Files Referenced

- `docs/helgobox/playtime-api/src/lib.rs`
- `docs/helgobox/playtime-api/src/runtime/control_unit.rs`
- `docs/helgobox/playtime-api/src/runtime/reaper.rs`
- `docs/helgobox/playtime-api/src/runtime/app.rs`
- `docs/helgobox/playtime-api/src/persistence/mod.rs`
- `docs/helgobox/doc/playtime/README.adoc`
- `docs/helgobox/doc/playtime-clip-engine.adoc` (historical reference)
- `docs/helgobox/doc/architecture/design-decisions.adoc`
- `docs/helgobox/resources/api/luau/README.md`
- Official Push 2 MIDI & Display Interface Manual (Ableton/push-interface on GitHub)

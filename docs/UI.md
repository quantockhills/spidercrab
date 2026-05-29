# UI/UX Design — reaper-ipad

> Design vision, screen layouts, interactions, and functionality breakdown.
> 
> **Status:** Early concept — details will evolve as we build.

---

## 🖥️ App Shell

The app is a full-screen PWA on iPad (add to home screen for native feel).
Dark theme. Touch-first. Landscape orientation.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo · Connection status · Settings ⚙️         │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  Sidebar │           Main Content Area                  │
│          │                                              │
│  📂      │  (changes based on selected mode)            │
│  Samples │                                              │
│  🎛️      │                                              │
│  FX      │                                              │
│  🔗      │                                              │
│  Chains  │                                              │
│  🎵      │                                              │
│  Session │                                              │
│          │                                              │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  Footer: Now playing / Selected track info               │
└─────────────────────────────────────────────────────────┘
```

### Sidebar Modes

| Icon | Mode | Description |
|------|------|-------------|
| 📂 | Samples | Browse, preview, and load samples |
| 🎛️ | FX | Browse and add FX to tracks |
| 🔗 | FX Chains | Browse and load preset FX chains |
| 🎵 | Session View | Playtime 2 clip matrix (launch clips, scenes) |

---

## 📂 Media Browser (Samples)

The sample browser lets you navigate local folders, preview audio, select regions, and push to tracks.

### Screen

```
┌──────────────────────────────────────────────────────┐
│ ← Back                          🔍 Search            │
├──────────────────────────────────────────────────────┤
│ 📁 /Users/tamura/Samples/Drums/                      │
├──────────────────────────────────────────────────────┤
│ [..]                         (up one level)          │
│ [Kick_01.wav]                ▶ 0:00 / 2:34  ⬇️      │
│ [Kick_02.wav]                ▶                      │
│ [Snare_01.wav]               ▶                      │
│ [Hat_loop.wav]               ▶                      │
│ [Clap.wav]                   ▶                      │
├──────────────────────────────────────────────────────┤
│  Preview: ███████████░░░░░░░░░░░░│ ⏪ ⏸ ⏩ 🔄        │
│  Region: [⟟──────⟡───────────⟧] ↕ = drag handles    │
│                                                     │
│  [Reverse ↕]  [Trim ✂️]  [Send to Track 🡕]         │
└──────────────────────────────────────────────────────┘
```

### Functionality

- **Browse folders** — point the app to a root sample directory. Navigate into subfolders.
- **Search** — filter files by name as you type.
- **Preview** — tap a file to play. Shows waveform and progress bar.
  - Play/stop button (▶ / ⏹)
  - Seek by tapping on the waveform
- **Select region** — drag handles on the waveform to select a portion of the sample. Only the selected region gets loaded.
- **Reverse** — toggle to reverse the sample (or selected region). Visual indicator when reversed.
- **Send to track** — push to selected track in Reaper, or drag-and-drop onto the Session View grid.
- **Drag to Session View** — long-press a sample and drag it onto a clip slot in the Session View.

---

## 🎛️ FX Browser

```
┌──────────────────────────────────────────────────────┐
│ ← Back                          🔍 Search            │
├──────────────────────────────────────────────────────┤
│ Category: [All │ EQ │ Comp │ Reverb │ Delay ...]    │
├──────────────────────────────────────────────────────┤
│                                                      │
│ ReaEQ           ★★★★☆  [Add to Track]               │
│ ReaComp         ★★★★☆  [Add to Track]               │
│ ReaVerbate      ★★★☆☆  [Add to Track]               │
│ ValhallaRoom    ★★★★★  [Add to Track]               │
│ ...                                                   │
└──────────────────────────────────────────────────────┘
```

- Browse by category (EQ, dynamics, reverb, delay, modulation, etc.)
- Search by name
- Tap "Add to Track" to insert into the selected Reaper track
- Tap FX name to see parameters and tweak them

### FX Chain Browser

Same as FX browser but shows `.RfxChain` files from a configurable folder.
These are your single-FX chains acting as presets.

---

## 🎚️ Real-time Parameter Control

When an FX is selected, show its parameters as touch sliders:

```
┌──────────────────────────────────────────────────────┐
│ ← Back                          ReaEQ  Track: Kick   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Freq 1       ████████░░░░░░░  500 Hz               │
│  Gain 1       ██████████░░░░░  +2.5 dB              │
│  Q 1          ████░░░░░░░░░░░  0.8                   │
│                                                      │
│  Freq 2       ██████░░░░░░░░░  1200 Hz              │
│  Gain 2       ██████████████  +6.0 dB               │
│  Q 2          ██████░░░░░░░░░  1.2                   │
│                                                      │
│  ...                                                  │
│                                                      │
│  [Remove FX]  [Bypass]                               │
└──────────────────────────────────────────────────────┘
```

- Each parameter is a touch slider with name, value, and visual indicator
- Changes reflect **instantly** in Reaper (WebSocket real-time)
- Scrollable if the FX has many parameters
- Bypass toggle for the FX
- Remove FX button

---

## 🎵 Session View (Playtime 2)

A grid of clip slots, like Ableton Live's session view or Playtime 2's matrix:

```
┌──────────────────────────────────────────────────────┐
│ Session View                        Scene: Intro     │
├────────┬────────┬────────┬────────┬──────────────────┤
│        │        │        │        │                  │
│ Kick   │ Snare  │ Hat    │ Bass   │   Scene 1 ▶     │
│ ■■■■   │ ■■■■   │ ■■■■  │ ■■■■   │                  │
│        │        │        │        │                  │
├────────┼────────┼────────┼────────┤──────────────────┤
│        │        │        │        │                  │
│ Kick   │ Snare  │ Hat    │ Synth  │   Scene 2 ▶     │
│ ■■■■   │ ■■■■   │ ■■■■  │ ■■■■   │                  │
│        │        │        │        │                  │
├────────┼────────┼────────┼────────┤──────────────────┤
│        │        │        │        │                  │
│ Fill   │        │ Ride   │ Pad    │   Scene 3 ▶     │
│ ■■■■   │        │ ■■■■  │ ■■■■   │                  │
│        │        │        │        │                  │
└────────┴────────┴────────┴────────┴──────────────────┘
```

- Each column = Playtime 2 track/column
- Each row = a scene
- Tap a slot to launch/stop that clip
- Tap scene ▶ to launch all clips in that scene
- **Drag samples from the Sample Browser** onto clip slots to load them
- Shows clip activity (playing, stopped, queued)
- Scrollable if the matrix is larger than the screen

---

## 📱 Interaction Patterns

| Gesture | Action |
|---------|--------|
| Tap | Select, play, launch |
| Swipe left/right | Switch between modes |
| Long-press | Context menu (edit, delete, info) |
| Drag from browser | Load into session view slot |
| Pinch | Zoom in/out on waveform |
| Two-finger scroll | Scroll through long parameter lists |

---

## 🎨 Visual Style

- **Dark theme** — true black background (#000), minimal borders
- **Accent color** — warm amber/orange (#FF8C00) for active elements
- **Font** — system font (San Francisco on iOS)
- **Touch targets** — minimum 44x44pt for all tappable elements
- **Animations** — subtle, 200ms, no gratuitous motion
- **Status indicator** — persistent connection status (green/yellow/red dot in header)

---

## Future Considerations

- **Multi-window** (iPad split view) — sessions view in one pane, browser in another
- **Audio streaming** — preview audio through iPad speakers (stream from Reaper over WebSocket audio)
- **MIDI keyboard** — on-screen piano keys for triggering MIDI instruments
- **Custom layouts** — user picks which panels to show

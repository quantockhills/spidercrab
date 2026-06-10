# UI/UX Design — reaper-ipad

> Screen layouts, interactions, and functionality as implemented.
> Design vision (colors, typography, vibe) lives in `design/design-guidelines.md`.

---

## 🖥️ App Shell

Full-screen PWA on iPad (add to home screen). Touch-first. Landscape orientation.
Everforest Light theme — warm beige, pastel colors, Inter font, square corners.

### Layout — Tab Bar

Bottom tab bar with 5 tabs:

```
┌─────────────────────────────────────────────────────────┐
│  Status Bar: ● Connected · Track: Drums                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│               Main Content Area                         │
│                                                         │
│  (changes based on selected tab)                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [📂 Media]  [🎛️ FX]  [🎚️ Tracks]  [🎹 Playtime]  [⚙️] │
└─────────────────────────────────────────────────────────┘
```

Connection status indicator: green (connected), yellow (reconnecting), red (disconnected).

---

## Tab 1: Media Browser

Browse sample files, preview audio, tag, and send to tracks or Playtime slots.

### Multi-Root Directory Browser

```
┌──────────────────────────────────────────────────────────┐
│  ← Roots                          🔍 Search all roots   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📁 /home/samples/drums/         ▶ 847 files            │
│  📁 /home/samples/loops/         ▶ 1,234 files          │
│  📁 /home/samples/foley/         ▶ 56 files             │
│  📁 /home/samples/one-shots/     ▶ 312 files            │
│                                                          │
│  [➕ Add Directory]                                      │
└──────────────────────────────────────────────────────────┘
```

- **Multiple sample directories** — configure any number of root paths in Settings
- **Root selector** — tap a root to browse, `← Roots` to go back
- **Cross-root search** — type at root level to search ALL directories simultaneously, results grouped by root
- **Persistent cache** — sample index cached to localStorage for fast re-load
- **Progress bar** — shows scanning progress per directory

### Inside a Directory

```
┌─────────────────────────────────────────────────────────┐
│ ← Roots /drums/                          🔍 Filter     │
├─────────────────────────────────────────────────────────┤
│  [..]          (up one level)                           │
│  Kick_01.wav   ▶ 0:00/2:34  ⬇️ tag:kick  tag:acoustic │
│  Kick_02.wav   ▶                      tag:kick         │
│  Snare_01.wav  ▶                      tag:snare        │
│  Hat_loop.wav  ▶                      tag:hat          │
│  Clap.wav      ▶                      tag:clap         │
│                                                         │
│  🔍 Search within this directory                        │
└─────────────────────────────────────────────────────────┘
```

- **Tap** a file to preview audio (host-side playback through REAPER)
- **Long-press** for context menu: tag, send to track, send to Playtime slot
- **Tags** — assign custom labels to samples, filter by tag
- **Waveform** — displayed during playback (downsampled peaks, ~2000 points)
- **Audio preview** — plays through REAPER's audio engine (PCM_Source + PlayPreview/StopPreview)
- **MiniBPM** — automatic tempo detection on samples when sent to Playtime

---

## Tab 2: FX + Parameters

FX browser, FX chain browser, and real-time parameter control.

### FX Browser

```
┌─────────────────────────────────────────────────────────┐
│  ← Back                          🔍 [Search...]         │
├─────────────────────────────────────────────────────────┤
│  Format: [All ▼]  Tags: [kick ▼] [+ Add Filter]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ReaEQ           VST3    🔖 eq       [Add to Track]     │
│  ReaComp         VST3    🔖 comp     [Add to Track]     │
│  ReaVerbate      VST3    🔖 verb     [Add to Track]     │
│  ValhallaRoom    VST              ★  [Add to Track]     │
│  Serum           CLAP             ★  [Add to Track]     │
│  JS: Delay       JSFX            ★  [Add to Track]     │
│                                                         │
│  [Refresh Cache]                                        │
└─────────────────────────────────────────────────────────┘
```

- **Format filter:** All, VST, VST3, CLAP, JSFX, RfxChain
- **Format badge** next to each plugin name
- **Search** — filter by name as you type (300ms debounce)
- **Tags** — color-coded badges, filterable, editable inline
- **Add to Track** — inserts plugin into selected track

### FX Chain Browser

Same layout for `.RfxChain` files from a configurable folder path.
Chains appear with a 🔗 prefix. Supports same search + tag filtering.
**Cached index** — `FxChainCache` scans once at startup, searches in-memory (zero filesystem IO), paginated (16/page).

### Inline FX Search

Long-press (500ms) on a track card's FX area to trigger inline search.
Search flows through both installed plugins and FX chains simultaneously.
Tap result to add directly to the track. Backdrop/tap-outside to dismiss.

### FX Parameter Control

Tap an FX to show its parameters as touch sliders:

```
┌─────────────────────────────────────────────────────────┐
│  ← Back                          ReaEQ  Track: Kick    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Freq 1       ████████░░░░░░░  500 Hz                  │
│  Gain 1       ██████████░░░░░  +2.5 dB                 │
│  Q 1          ████░░░░░░░░░░░  0.8                      │
│                                                         │
│  Freq 2       ██████░░░░░░░░░  1200 Hz                 │
│  Gain 2       ██████████████  +6.0 dB                  │
│  Q 2          ██████░░░░░░░░░  1.2                      │
│                                                         │
│  [Bypass]  [Delete]  [Preset: Default ▼]               │
└─────────────────────────────────────────────────────────┘
```

- Touch sliders with name, value, visual indicator
- Changes reflect **instantly** in REAPER (WebSocket, pushed via CSURF_EXT callbacks)
- Scrollable for many-parameter FX
- **Bypass toggle** — tap to bypass, long-press (500ms) for delete confirmation
- **Preset browser** — load/save presets per FX
- **Drag to reorder** — FX list supports drag-and-drop to rearrange

---

## Tab 3: Track Overview

Mixer-style list of all tracks with key controls and FX cards.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                         Track: Drums             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔊 Kick           M[■] S[ ] R[A]  ████████░░  -3.2dB  │
│    [ReaEQ] [ReaComp]                                     │
│                                                          │
│  🔊 Snare          M[ ] S[ ] R[ ]  ██████░░░░  -6.0dB  │
│    [ReaEQ]                                               │
│                                                          │
│  🔊 Hat            M[ ] S[■] R[ ]  ████████░░  -2.8dB  │
│                                                          │
│  🔊 Bass           M[ ] S[ ] R[M]  ████████░░  -4.1dB  │
│    [ReaComp]                                             │
│                                                          │
│  [➕ Add Track]                                          │
└──────────────────────────────────────────────────────────┘
```

Each row:
- **Track name** — tap to select (affects where FX/samples get loaded)
- **M** — Mute toggle (grayed when muted)
- **S** — Solo toggle (highlighted when soloed)
- **R** — Record Arm toggle (red when armed)
  - Armed tracks show A (audio) / M (MIDI) mode toggle
- **Volume fader** — touch slider
- **FX cards** — compact row of FX on this track, tap for parameter control
  - **Tap to bypass FX** — toggles bypass
  - **Long-press to delete** — shows confirmation
  - **Long-press (on + Add FX button)** — inline FX search
- **Drag FX to reorder** — drag-and-drop within the FX list

---

## Tab 4: Playtime (Clip Launcher)

Full Playtime 2 matrix grid with clip names, track controls, and scene triggers.

```
┌──────────────────────────────────────────────────────────┐
│  Session View         Scene: Intro    [🎬 Launch]        │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│          │          │          │          │              │
│ Kick     │ Snare    │ Hat      │ Bass     │  Scene 1 ▶  │
│ ■■■■■■■■ │ ■■■■■■■■ │ ■■■■■■■■ │ ■■■■■■■■ │              │
│ M[ ] S[ ] │ M[ ] S[ ]│ M[ ] S[ ]│ M[ ] S[ ]│              │
│ R[A] Vol  │ R[ ]     │ R[ ]     │ R[ ]     │              │
├──────────┼──────────┼──────────┼──────────┼──────────────┤
│          │          │          │          │              │
│ Fill     │          │ Ride     │ Pad      │  Scene 2 ▶  │
│ ■■■■■■■■ │          │ ■■■■■■■■ │ ■■■■■■■■ │              │
│          │          │          │          │              │
│          │          │          │          │              │
├──────────┼──────────┼──────────┼──────────┼──────────────┤
│          │          │          │          │              │
│ Break    │          │          │          │  Scene 3 ▶  │
│ ■■■■■■■■ │          │          │          │              │
│          │          │          │          │              │
│          │          │          │          │              │
└──────────┴──────────┴──────────┴──────────┴──────────────┘
```

Each column header has **track controls**:
- Mute, Solo, Record Arm (with Audio/MIDI toggle)
- Volume fader
- **Go to Track** button → navigates to Tab 3 (Track Overview) filtered to that track

Each cell shows:
- **Clip name** — prominently displayed
- **Activity** — playing/stopped/recording state, shown as color bar
- Tap to launch/stop the clip
- Scene ▶ launches all clips in that row

**Integration:**
- Connected to Playtime 2 via REAPER C API (matrix handlers)
- Also supports OSC over UDP (ReaLearn preset) for two-way sync
- MIDI fallback for slot triggering (Note On/Off, Push 2 grid mapping)
- Periodic state polling (~10s) syncs frontend with Playtime's internal state

---

## Tab 5: Settings

```
┌──────────────────────────────────────────────────────────┐
│  Settings                              Build v0.2.5      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔌 Connection                                           │
│  Host: [192.168.1.100]  Port: [9224]  [Reconnect]       │
│  Status: ● Connected                                     │
│                                                          │
│  📂 Sample Directories                                   │
│  [/home/samples/drums]                         [✕]     │
│  [/home/samples/loops]                         [✕]     │
│  [/home/samples/one-shots]                     [✕]     │
│  [+ Add Directory]                                       │
│  [Refresh Sample Cache]                                  │
│                                                          │
│  🎛️ FX Chain Folder                                      │
│  [/home/reaper/Data/FXChains]  [Refresh Cache]           │
│                                                          │
│  🎹 Playtime 2                                           │
│  [Download ReaLearn Preset]                              │
│  Status: ● Available / ○ Not installed                   │
│                                                          │
│  ℹ️ About                                                │
│  spidercrab v0.2.5-alpha                                │
│  C++ tests: 307/307 · Frontend tests: 388/388           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 📱 Interaction Patterns

| Gesture | Action |
|---------|--------|
| Tap | Select, play, launch, toggle bypass |
| Long-press (500ms) | Inline FX search, delete FX, context menu |
| Drag FX card | Reorder FX on track |
| Drag sample → slot | Load into Playtime slot |
| Swipe tabs | Switch between browser modes |

---

## 🎨 Visual Style

Full design guidelines in `design/design-guidelines.md`. Quick summary:

- **Everforest Light** palette — warm beige `#FDF6E3` bg, soft dark `#5C6A72` text
- **Inter font** — Regular 400 body, Semi-Bold 600 headings, Inter Mono for values
- **Square corners** — no border-radius anywhere
- **Pastel everything** — muted, desaturated colors. Nothing should shout.
- **Minimal** — less chrome, more content. No redundant borders/shadows.
- **Touch targets** — min 44pt for iPad fingers
- **Landscape-first** — 2360×1640, two-panel layouts
- **No pure white or pure black** — warm off-whites and soft darks only

---

## Current Status

- Phase 1 MVP complete — all 36 issues closed
- Active features: 5 tabs, full REAPER integration, Playtime 2 matrix, sample browser + cache + tempo matching, FX browser + chains + tags, real-time parameter control
- Test suites: 307 C++ tests (Google Test) + 388 frontend tests (Vitest) + Playwright E2E, all passing

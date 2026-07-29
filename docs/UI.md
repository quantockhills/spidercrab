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

- **Format filter:** All, VST3, VST, CLAP, JSFX, AU, DX
- **🔗 Chains button** — jumps to the FX Chain Browser without leaving the header
- **Format badge** next to each plugin name
- **Search** — filter by name as you type (300ms debounce)
- **Tags** — color-coded badges, filterable, editable inline
- **Add to Track** — inserts plugin into selected track

### FX Chain Browser

Same layout for `.RfxChain` files from a configurable folder path.
Chains appear with a 🔗 prefix. Supports same search + tag filtering.
**Two tabs** — Browse & Load, and Save Chain (save the selected track's current FX as a new chain).
**Cached index** — `FxChainCache` scans once at startup, searches in-memory (zero filesystem IO). Both folder browsing and search results are paginated, 100 per page.

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
│  [Remove FX]              Preset: [Default ▼] ◀ ▶       │
└─────────────────────────────────────────────────────────┘
```

- Touch sliders with name, value, visual indicator
- Changes reflect **instantly** in REAPER (WebSocket, pushed via CSURF_EXT callbacks)
- Scrollable for many-parameter FX
- **Remove FX** — deletes the plugin immediately, no confirmation step (unlike the Tracks tab card, which requires holding then tapping again)
- **Preset browser** — load/save presets per FX, or step through with ◀ ▶
- No bypass control on this page — bypass a track's FX from its card on the Tracks tab (double-tap)

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
- **FX cards** — compact row of FX on this track
  - **Double-tap to bypass** — bypassed FX dim and grey out
  - **Hold, then tap again, to delete** — hold shows a "Delete?" confirmation on the card itself; tapping it again removes the FX, tapping elsewhere cancels
  - **Tap the ▼ corner** to open parameter control in the inline drawer
  - **Long-press (on + Add FX button)** — inline FX search
- **Drag FX to reorder** — drag a single FX, or drag a whole chain block by its header to move the group together

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
│  Settings                                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Connection            ● Connected                      │
│  Server: ws://<host>:9224                                │
│  [Refresh Tracks] [Refresh Plugin List] [Refresh Chain Cache] │
│                                                          │
│  Theme        [Light] [Dark] [System]                    │
│  Tab Bar Position   [Top] [Bottom] [Left] [Right]         │
│                                                          │
│  🎛️ FX Chains                                            │
│  [/home/reaper/Data/FXChains]        [Browse FX Chains]  │
│                                                          │
│  📂 Sample Directories                                   │
│  📁 /home/samples/drums              [⟳] [✕]           │
│  📁 /home/samples/loops              [⟳] [✕]           │
│  [+ Add Directory]  [Clear stale cache]                   │
│                                                          │
│  🎹 Playtime 2                                            │
│  [↓ Download ReaLearn Preset]                             │
│                                                          │
│                                    build <timestamp>      │
└──────────────────────────────────────────────────────────┘
```

There is no host/port editor — Spidercrab always connects to `window.location.hostname` on port 9224, so it's the address you typed into the browser to load the page, not a settings field.

---

## 📱 Interaction Patterns

| Gesture | Action |
|---------|--------|
| Tap | Select, play, launch |
| Double-tap | Bypass FX, reset a param to default |
| Long-press (500ms) | Inline FX search, arm FX for deletion, context menu |
| Long-press (2s) | Cycle a chain block |
| Drag FX card | Reorder FX on track (single FX, or a whole chain block by its header) |
| Drag sample → slot | Load into Playtime slot |
| Swipe tabs | Switch between browser modes |

Full, per-screen gesture reference: [Touch Gestures](gestures.md).

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

- Active features: 5 tabs (Media, FX, Tracks, Playtime, Settings — Sequencer exists in code but is hidden behind a flag), full REAPER integration, Playtime 2 matrix, sample browser + cache + tempo matching, FX browser + chains + tags, real-time parameter control
- Test suites: C++ (Google Test) + frontend (Vitest) + Playwright E2E

This page describes the mockups the UI was originally designed from and gets checked against the real components periodically — if something here looks off, the running app and the component source are the source of truth, not this page.

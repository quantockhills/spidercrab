# Clip Launcher 🎹

The **Playtime** tab is your session view — a grid of clips you can fire off live. It has two modes, switched at the top:

- **Session** — the clip grid (this page)
- **Sequencer** — a step grid for programming beats (see [Step Sequencer](sequencer.md))

The clip launcher works with **Playtime 2**, and needs a one-time setup (installing Helgobox and linking it up with OSC) before it'll respond. If you haven't done that yet, follow [Getting Started → Set up the Clip Launcher](../getting-started.md#4-set-up-the-clip-launcher-optional).

## Getting Playtime running

If Playtime 2 isn't up yet, the tab shows a **Launch Playtime** button — tap it to start Playtime without leaving the app (there's a "Check again" link if it doesn't catch the first time). There's also a **🎹 Playtime** button in the transport bar to show or hide the Playtime window anytime, and a **↻ refresh** button if the grid ever looks stale.

## Reading the grid

Columns are your tracks, rows are scenes. Each cell is a clip slot, colour-coded by what it's doing — a **legend** at the top spells it out:

- **Empty** · **Stopped** · **Playing** (green) · **Recording** (red, pulsing)

Cells also show the clip's **name** and a little icon for its type — **♪ MIDI** or **🔊 audio**. The colours update live as clips start and stop, and stay in sync even if you close and reopen REAPER. (Helgobox/ReaLearn/Playtime system tracks are tucked to the far right so they're out of your way.)

## Launching clips

- **Tap a slot** to launch its clip.
- **Tap the ▶ at the end of a row** to launch that whole **scene** at once.

## Recording a clip

1. Arm recording on the **transport bar** (the ● button, right there in the Session view).
2. **Tap an empty slot** — it starts recording into that slot.
3. **Tap it again** to stop.

## Working with a clip

- **Reverse** — each clip has a little **↻ / ◄ button in its top-right corner**; tap it to flip the clip backwards (a small **R** badge shows when it's reversed).
- **Hold a clip** (about half a second) to bring up its actions:
    - **🎹 Send to sampler** — bounce the clip to a new instrument track (see below). *(only for clips that came from a sample)*
    - **✕ Delete** — clear the slot.

## Turn a clip into an instrument

**Send to sampler** bounces a clip onto a new RS5K track that's **MIDI-armed and ready to play** — hit any key and it pitches the sample up and down (the original sits at C4). A **sampler panel** slides up from the bottom with quick controls:

- **Loop** the sample
- **Obey note-offs** (stop when you release the key)
- **↔ Reverse**

The sampler button stays in the transport bar so you can reopen those controls anytime.

## Track controls on the grid

Each column header carries its track's controls: **R** (arm), **M** (mute), **S** (solo), and — **when the track is armed** — an **A/M** toggle to switch between **audio** and **MIDI** recording. The **↗** button jumps you over to that track in the [Tracks](tracks.md) tab.

## Gestures

- **Tap a slot** — launch (or record, if you're armed)
- **Tap the ↻/◄ corner button** — reverse the clip
- **Tap a row's ▶** — launch the scene
- **Hold a slot** — actions (send to sampler / delete)

Full list: [Touch Gestures](../gestures.md).

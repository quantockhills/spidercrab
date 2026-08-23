# Clip Launcher 🎹

The **Playtime** tab is your session view — a grid of clips you can fire off live.

(A [step sequencer](sequencer.md) also exists, but it's **hidden in the current release** until it works reliably.)

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

### Count-in before recording

Set a **Count-in** in the transport bar — *none*, *1*, *2*, or *4 bars* — and recording starts on the beat instead of the instant you tap. The armed slot shows a big **red countdown** (3… 2… 1…), and the record trigger fires exactly on the **next bar boundary + N bars**, so your take begins musically. Changing the project tempo mid-count keeps it in time. Stop all / panic cancels an armed count-in.

## Keys — play it live 🎹

The third Playtime sub-tab is a **performance pad instrument** that plays into the selected track (Tracks tab):

- **16 scale-locked pads** in a 4×4 grid — tap to play, and you can't hit a wrong note: every pad is a degree of the chosen scale. **Slide** across pads for glissando; **press higher up the pad** for louder velocity. Multi-touch works, so chords are one hand and bass is the other.
- Pick the **scale** (Major, Minor, Dorian, pentatonics, Chromatic…) and **root key**.
- **Scroll the window** — drag the note-name pill between the −/+ buttons to pan the grid by single scale degrees, so it can start *anywhere* (D4, A4…) without changing key. The −/+ buttons jump whole octaves.
- **Chord mode** — each pad plays a chord instead of one note, with 19 voicings: Triad (follows the key), Major, Minor, Sus2, Sus4, Augmented, Diminished, 6th, m6, 7th, Maj7, m7, m7b5, dim7, 7sus4, 9th, Maj9, m9, Add9. Pads label themselves with chord symbols (C7, Cm9…).
- **Hold** — latches notes so they keep ringing after you lift off; the button shows how many are held. Hold survives octave/scale changes (only your fingers' notes release).
- **Grid on/off** — the top-right toggle swaps between *16 pads + the FX grid* (so you can tweak the synth you're playing) and *32 pads full-width* (an 8×4 launchpad-style grid, C4…F8 in C major).
- Everything (scale, key, window, chords, hold, grid) is remembered between sessions.

**Latency:** notes ride a dedicated low-latency socket (~5 ms end-to-end) instead of the main control socket, and land straight in the selected track's MIDI input — the track is auto-armed and monitored while you play, and restored when you leave. (If your chosen track's instrument is quiet, make sure *Preferences → MIDI Devices → Virtual MIDI Keyboard* is enabled.)

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

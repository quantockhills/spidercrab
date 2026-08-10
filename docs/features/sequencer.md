# Step Sequencer 🎹

!!! warning "Being rebuilt"
    The step sequencer has been **removed** and is being written again from a
    different starting point. This page describes why, and what is coming.
    Progress lives in [issue #141](https://github.com/quantockhills/spidercrab/issues/141).

## Why it was removed rather than fixed

The first version kept its pattern in the extension's memory — an 8×8 grid of
steps held in RAM — and offered one button to bake that grid into a MIDI item.

That is the wrong shape for a sequencer, and no amount of polish would have
fixed it:

- **The pattern had nowhere to live.** Closing REAPER lost it. The project file
  knew nothing about it.
- **It was a one-way trip.** Once baked, the item and the grid had no
  relationship. Editing either left the other stale, and there was no way to
  read a pattern back in.
- **The export never actually ran.** Two REAPER API functions it depended on
  were declared but never assigned, so they were null at runtime and the handler
  failed its own availability check every time. Nobody noticed, because the
  feature was already hidden behind a flag.

It was switched off in the shipped app rather than finished.

## What replaces it

**The pattern will be the MIDI item.** Not a copy of it, not something exported
to it — the item itself is the pattern.

That single change settles most of the difficulties at once. REAPER plays the
notes with no help from us. The project file saves them. They open in the MIDI
editor like any other part, render, and export as MIDI. Undo works, because
every edit is an ordinary edit.

Detail that MIDI has no way to express — per-step probability, ratchets, per-row
lengths — is stored alongside the notes in the take's own extension data. This
is the arrangement MPL's RS5k sequencer arrived at, and it degrades gracefully:
a part drawn by hand has notes and no extra data, and still reads back correctly.

## What it will be like to use

The old grid was desktop software in a dark colour scheme. Every step was an
individual tap, so laying down sixteen hi-hats meant sixteen separate taps.
Velocity was a mode you switched into, followed by a popup with a slider and a
confirm button — four interactions to change one number.

The replacement is built for fingers:

- **Drag to paint.** Whether a drag draws or erases is decided by the first step
  you touch, so a single sweep fills a run — or clears one.
- **Velocity is a vertical drag on the step itself.** No mode, no dialog. A
  step's height *is* its velocity, so a groove has a shape you can read at a
  glance.
- **Press and hold a step** for its finer detail: ratchets, probability, timing
  nudge, gate length.
- **Press and hold a row's label** for that row's own length and step size —
  which is how two rows of different lengths can drift against each other.
- **Steps sound as you place them**, because a sequencer you cannot hear while
  building is a spreadsheet.

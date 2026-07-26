# Step Sequencer 🎹

!!! warning "Not currently available"
    The step sequencer is **hidden in the current release** — it isn't working reliably yet, so the Session/Sequencer toggle doesn't appear in the app. The page below describes how it's intended to work, and it will return once it's fixed and verified.

A step grid for programming drum patterns and melodies — then turning them into a clip you can launch. When enabled, it's the second mode of the **Playtime** tab (tap **Sequencer** at the top).

## Reading the grid

Notes run down the side, steps run across the top, and **every cell shows its note name** (like `C2`). A moving **orange highlight** marks the current step, and a readout up top tells you exactly where you are — *"Playhead: step 5 / 16."* There's a step-indicator strip along the bottom too.

## Building a pattern

- **Tap a step** to switch it on or off. Active steps glow green and show a little **velocity bar**.
- **Length** — set how many steps the pattern runs, from 1 to 64 (top controls).
- **Base Note** — pick the grid's root note from a dropdown (C1 up to C7).
- **✕ Clear** — wipe the pattern and start fresh.
- **↻** — refresh the grid.

## Setting velocity

Up top there's a **Note / VEL** toggle:

- In **Note** mode, tapping a step just turns it on or off.
- In **VEL** mode, tapping a step opens a little **velocity slider** (1–127) — set how hard that hit plays, then tap **Set**.

## Turning it into a clip

Happy with your pattern? Tap **⇩ Clip** to bake it into a MIDI clip. It drops into the [Clip Launcher](playtime.md) grid and the app **switches you straight to Session view** so you can fire it off right away. (The button stays greyed out until you've placed at least one step.)

## Gestures

- **Tap a step** — toggle it on or off (or open the velocity slider, in VEL mode)

Full list: [Touch Gestures](../gestures.md).

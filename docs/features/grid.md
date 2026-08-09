# Grid 🎚️

The **FX** tab gives every plugin the same row of sliders. That is fair, and it is the only thing that works for the thousands of plugins nobody has ever looked at — but it throws away everything the plugin's own designer knew about which controls belong together.

The **Grid** tab is the other half of that trade. For a handful of plugins it draws a real layout: knobs grouped into panels, buttons where the plugin has buttons, and step grids where the plugin has a sequencer. Devices sit side by side, like a rack.

## Finding one

A plugin either has a layout or it doesn't. In the [FX browser](fx.md) the ones that do appear in a **Grid layouts** group at the top, and carry a small orange **GRID** badge in their format group as well.

Everything else still shows up on the Grid tab, with panels generated from its parameter list. That's plainer than a hand-built layout but better than the plugin being unreachable.

## What has a layout

Eight so far. Everything here is bundled with REAPER, free, or open source —
none of it needs a plugin you have to buy.

### Bundled with REAPER

Nothing to install; these are already on your machine.

- **Chorus** — REAPER shows six identical sliders, which hides the shape of the
  effect. The layout splits it the way Ableton's does: voice count as buttons,
  rate/depth/time as knobs, the two mixes as faders. "Pitch Fudge Factor" is
  relabelled Depth, which is what it does.
- **Stock delay** (ReaDelay) — time and musical length, feedback and filtering,
  and the mix, grouped rather than listed.
- **Stock pitch shifter** (ReaPitch) — shift amount and the windowing controls.

### Free downloads

- **Eos Reverb** — Audio Damage's algorithmic reverb, one of
  [33 legacy plugins they released free](https://www.audiodamage.com/pages/free-and-legacy).
  Six panels following Ableton's split of a reverb into input, early
  reflections, tail and output — plus the two crossover frequencies Eos hides
  from its own window and offers only to a host.

### Open source, via ReaPack

Joep Vanlier's JSFX, all MIT. Add this repository in ReaPack:

```
https://raw.githubusercontent.com/JoepVanlier/JSFX/master/index.xml
```

- **Yutani** (0.103) — a mono bass synth with 22 sections. Its knobs each carry
  three modulation depths, reached through a VEL/MOD/LINK switch exactly as the
  plugin does it. Needs a [patched copy](#patched-copies); 319 presets come
  with it.
- **MIDI ARP** (0.44) — a pattern arpeggiator. The whole point of it is the step
  grid, which lives in memory and so reaches no host at all until patched. Four
  tabs, a moving playhead, rows labelled with the note each is playing.
- **SEQS** (0.126) — sequenced effects. Also needs a patched copy.

### Ours

- **Distortion Workbench** — REAPER ships three separate waveshapers:
  Distortion, Distortion (Fuzz) and the Graphical Waveshaper. All three are the
  same thing with a different curve, so
  [`jsfx/spidercrab_distortion.jsfx`](https://github.com/quantockhills/spidercrab/tree/master/jsfx)
  offers all three around one drive, ceiling and mix — and gives every one of
  them the oversampling only the graphical one had. The transfer curve is drawn.

## Getting around

- **Tabs** across the top of a device split it into sections. Which sections exist comes from the plugin — the MIDI ARP's four are the four rows its own window draws its panels in.
- **The strip along the bottom** moves between devices. The panels themselves ignore sideways drags on purpose, so a gesture that wanders off-vertical can't interrupt a control you're already turning.
- **Tap a device's name** to give it live updates. Only one plugin at a time reports changes back, so a device with a moving playhead needs to be the chosen one. The first is chosen for you.

## Working the controls

**Knobs and faders** respond to a vertical drag — up and down, not around. A full sweep takes about a hand's width of travel, and that distance doesn't change with the size of the knob, so you can start on a small control and finish well away from it.

**Buttons** take a single tap. Nothing needs pressing and holding.

**Hold a control's label** for half a second and it tells you what the control is for. Labels that will answer are marked with a dotted underline. This is where the jargon gets explained — what a CC is, what "bidi" means, why a fuzz doesn't clean up when you play softer.

There's also an **Info** tab on every device, covering the same ground for the device as a whole.

## Things a Grid layout can do that a slider list can't

**Show the shape of a control.** A distortion's transfer curve is drawn, because a waveshaper is a pure function of its input and the picture can be calculated exactly. The dotted diagonal is what no distortion looks like; the gap is the effect.

**Put modulation back where it belongs.** Yutani gives most of its knobs three modulation depths — how far velocity, the mod wheel and an LFO move them. As parameters those are 70 more knobs with no clue which belongs to what. The Grid does what the plugin does: a **VEL / MOD / LINK** switch in the header, and while one is latched the knobs edit that depth instead of their value. Knobs that have a depth light up; the rest go inert, so you can't change a value when you meant to change a depth. The coloured rings inside a knob's arc are its depths, visible whether or not a mode is on.

**Draw a sequencer as a sequencer.** The MIDI ARP's pattern is a grid: tap a step to start a note, drag sideways to hold it. Rows are labelled with the note each is currently playing, the playing step is outlined, and steps past the loop length are dimmed. A **Shape** menu writes the classic arpeggio figures — Up, Down, Up/Down, Random — and leaves them editable, which a style menu in a normal arpeggiator won't.

**Reach controls the plugin hides.** Eos's reverb has two crossover frequencies its own window never shows, offered only to the host. They're on the Grid.

## Patched copies

Some plugins keep almost everything in internal variables that no host can see. Yutani hides 122 that way, including every section's on/off switch; the MIDI ARP's entire pattern lives in memory.

For those, `tools/jsfx_expose.py` writes a **patched copy** alongside the original — same plugin, new filename, with the hidden state declared as parameters. REAPER lists it separately with `[Spidercrab]` after the name, so existing projects keep loading the original untouched, and the copy has no saved state to migrate.

Modules that need a patched copy only match the copy. Point one at an original and most of its controls would resolve to nothing.

Ready-made copies live in [`jsfx/vendor/`](https://github.com/quantockhills/spidercrab/tree/master/jsfx/vendor) with their licences and attribution intact, or you can generate your own from whatever version you have installed. Either way they are **not** installed for you: putting somebody else's plugins in your Effects folder unasked is not on. See that folder's README for both routes.

Yutani's presets come with its copy. A preset library is keyed to the plugin's description line, so the patched copy would see none of the original's — `jsfx_expose.py` retargets the bank, and all 319 are there.

A layout pins parameters by position as well as by name, so a later release of the plugin with one extra parameter can shift the rest. Each module records the version it was written against — the device's **Info** tab shows it, and its header counts any controls that go missing. That turns drift into a message rather than a knob that quietly moves the wrong thing.

## Adding a layout

A layout is a TypeScript file in `frontend/src/components/grid/`, listing which parameters to show, as what kind of control, in which panel. `tools/jsfx_module_gen.py` writes a first draft by reading the plugin's own `@gfx` — which panel it draws each control in, what it calls it, which values a selector offers. The result needs a human pass, but it starts from what the plugin does rather than from a guess.

For a plugin with no source — a VST — `tools/fx_dump.js` asks the running REAPER for its parameter list, names and ranges. That is worth doing before writing anything: parameter names are often eight-character stubs, and the order is rarely what the manual implies.

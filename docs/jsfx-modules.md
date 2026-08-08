# JSFX Modules — design notes

Purpose: give a JSFX effect a real interface on the iPad — knobs, toggles,
segmented selectors, XY pads — laid out the way the plugin actually presents
itself, instead of the flat list of generic sliders the FX tab shows today.
Consistent visual language across every module, the way Ableton's device
panels look like each other rather than like their plugins.

The existing generic slider list stays. A module is an alternative view,
toggled per FX.

## What is and isn't reachable

**Widget type is our choice.** In JSFX, `sliderN:` is a *parameter
declaration*, not a visual slider — it's the only thing a host reads or
writes. What the plugin draws in `@gfx` is independent: Yutani renders
`osc1_db` (slider1) as a knob. So rendering something as a knob, toggle or XY
pad is entirely up to the module.

**Controllability is fixable, because JSFX is source.** A control writing to a
variable that isn't a declared parameter can't be set by any host *as
shipped* — but the plugin can be patched to expose it. Three facts from the
[JSFX reference](https://www.reaper.fm/sdk/js/js.php) make this practical:

- **256 slider slots.** Yutani uses 71 (indices 1–81), leaving 185 free.
- **Hidden sliders.** Prefixing a declaration with `-` hides it from the
  plugin's own UI while keeping it automatable. Internal state can be exposed
  to the host *without changing how the plugin looks in REAPER*.
- **`slider_automate(2^index)`** notifies the host when the plugin's own GUI
  writes a value, so the iPad stays in sync when someone turns a knob in
  REAPER. (`sliderchange()` refreshes the display but does *not* send
  automation — the wrong one for this.)

So promoting a control is mechanical: add a hidden slider declaration, and add
a `slider_automate` call where `@gfx` writes the variable.

### The costs of patching

- **It's a fork.** Yutani is actively maintained and ReaPack-distributed; an
  update overwrites the patch. Mitigation: generate a patched *copy* beside the
  original rather than editing in place, so divergence is explicit and ReaPack
  keeps managing the original.
- **Per-plugin effort.** Yutani has 114 plausible controls to promote.

A patched *copy under a new filename* is a different plugin as far as REAPER is
concerned, which dissolves most of the risk: existing projects go on loading
the original, untouched, and the copy has no legacy saved state to migrate. So
the `@serialize`-precedence question doesn't arise for the copy approach — it
would only matter if we patched a plugin in place, which we won't.

The one thing that doesn't carry over is **presets**: they're stored per
plugin, so Yutani's `bass_presets.rpl` wouldn't appear in the copy. Converting
them is possible (they're slider values in a text format) but is its own task.

Measured on Yutani (`Saike_Yutani.jsfx`):

| | |
|---|---|
| Host-visible parameters (`sliderN:`) | 71 |
| Variables persisted in `@serialize` | 122 |
| Persisted variables that are *not* parameters | 122 |

And by drawn widget:

| Widget in `@gfx` | Count | Reachable? |
|---|---|---|
| Knobs | 77 | mostly yes — they write to declared params |
| Selection buttons | 56 | mostly yes — they write slider values (`OSC1_SELECT = 4` → slider4) |
| Toggles | 34 | **3 of 32 backed variables are params; 29 are not** |

The unreachable ones are exactly the enable/disable switches: `c_lfo_enabled`,
`allpass_enabled`, `bonus_enabled`, `amp_before_filter`, `cutoff_reset`,
`tempo_sync_envelopes`, and the whole `*_vel` / `*_mod` modulation-depth
matrix.

**Consequence:** an *unpatched* Yutani module gets its knobs and shape
selectors faithfully, but its section on/off switches are dead. Either the
module marks them unavailable, or Yutani gets patched with hidden sliders and
they become live. That's a per-plugin decision, and it means modules need a
notion of "requires a patched build" alongside plain ones.

### Yutani is an outlier

Across the 346 JSFX in this library that declare parameters:

| | |
|---|---|
| Total host-visible parameters | 3,776 |
| Plugins using `@serialize` at all | 35 of 346 |
| Internal-only variables across those 35 | 365 |

So **311 of 346 plugins have no hidden state** — everything they draw is
reachable. Yutani is among the most complex JSFX in existence; it is the hard
case, not the typical one.

## What can be derived automatically

The parameter declarations carry more than the current UI uses:

```
slider4:osc1_shape=0<0,9,1{Saw,Square,Triangle,Fin,PWM,...}>-Oscillator 1 Shape
slider3:free_osc=0<0, 1, 1>-Reset Osc on note
slider26:drive=0<-32,48,1>-Filter Drive (dB)
slider43:env_amnt=0<-1,1,.0001>-Envelope Amount
```

Inference rules:

| Pattern | Widget |
|---|---|
| `{a,b,c}` enum list | segmented control or dropdown, with real option names |
| `<0,1,1>` | toggle |
| range centred on 0 (`<-1,1,…>`, `<-12,12,…>`) | bipolar knob, detented at centre |
| unit in the label (`dB`, `Hz`, `ms`, `%`) | knob with unit-aware formatting |
| everything else | knob or slider, module's choice |

Across the library that means **603 enums (15%) and 150 toggles (3%) currently
render as generic continuous sliders** — 18% of all parameters are the wrong
control type today. Fixing that alone is a large win and needs no per-plugin
work.

What cannot be derived: **grouping and layout**. Yutani's "Oscillator 1",
"Filter", "Amp Envelope" panels exist only as imperative drawing code in
`@gfx` — ~1,000 lines of `drawPanel` / `drawKnob` calls with computed
coordinates, spread across 13 imported `.jsfx-inc` files. Parsing that
faithfully is not realistic.

## Proposed architecture

```
  .jsfx source ──► extension parses ──► descriptor (auto)
                                            │
                   module manifest (hand-authored, optional)
                                            │
                                            ▼
                              frontend renders with the design system
```

**Descriptor (automatic).** New command `fx/getModule`. The extension already
gets the JSFX path from `EnumInstalledFX`'s ident, so it can read the source,
parse the `sliderN:` declarations, and return typed parameter descriptors:
index, name, range, step, default, enum options, inferred widget, unit. Works
for every JSFX with no authoring effort.

**Manifest (optional, per plugin).** JSON keyed by ident, giving what the
source can't: panel grouping, ordering, pages, widget overrides, XY pairings,
and marking known-unreachable controls. Ships with the app; a missing manifest
just means the auto descriptor is rendered in declaration order.

**XY pads** are a manifest construct — JSFX has no such declaration. An XY pad
is two parameters bound to two axes, e.g. Yutani's cutoff (28) and resonance
(29). That is a module-authoring decision, which is the point.

Non-JSFX plugins (VST/AU/CLAP) have no readable source, but REAPER still
reports parameter names and values — so the manifest path works for them too,
just without auto-derivation.

## Decided

**A new top-level tab: Grid.** Alongside Media, FX, Tracks, Playtime and
Settings. It shows the selected track's plugin interface in landscape, full
height, and pans horizontally when it's wider than the screen.

**The existing generic slider list is left alone.** No changes to how the FX
tab looks or behaves. Grid is an additional way in, not a replacement, and
there's no toggle inside the FX view.

This rules out the "infer widgets everywhere" option, which would have improved
the generic list by rendering enums and toggles properly. Still available later
as an independent improvement.

## Why the horizontal strip resolves the layout problem

The earlier worry was that "truthful to the original" fights "usable with
fingers": Yutani's window is 1460×600 with 35px knobs, an iPad in landscape is
roughly 1180×820, and reliable touch wants ~44px. Reproducing it 1:1 means
controls too small to hit.

Panning sideways removes the conflict. Fix the height to the screen, let the
width be whatever the controls need at a comfortable size, and swipe right for
the rest. Nothing gets scaled down. Yutani becomes a wide strip you move along
rather than a shrunken photograph, which is what Ableton's device view does and
why it works on small screens.

This also sets the layout format: **fixed height, variable width, ordered
panels.** A module describes panels left to right, each holding controls in a
fixed-height arrangement. No absolute pixel positions.

## Where this goes

The tab is called Grid because one plugin is the first case, not the only one.
The intended end state is Ableton's device chain: every FX on the selected
track laid out side by side in one continuously pannable strip, so a track's
whole signal path is one surface. That falls out of the same layout format —
panels left to right — with device boundaries between plugins.

## Phasing

1. **The Grid tab with one plugin.** Widget kit (knob, toggle, segmented, XY),
   the horizontal-pan container, and a module rendered for a single simple
   plugin. Establishes the layout format end to end.
2. **Yutani**, as the stress test: a patched copy exposing its private
   controls, plus a module definition for its panel structure. 167 drawn
   widgets across five original panel rows is the real test of whether the
   format holds up.
3. **Multiple plugins in one strip** — the actual grid, with device boundaries
   and the whole chain pannable.
4. **XY pads and richer widgets**, once the format has settled.

## Implementation notes

- `App.tsx` has a `Tab` union and a `TABS` array; adding one is small. There's
  a precedent for shipping an unfinished tab hidden behind a flag —
  `SHOW_SEQUENCER` — worth reusing here while the format is in flux.
- The data layer already exists: `track/getFx` lists a track's FX,
  `fx/getParams` returns parameters with ranges and formatted values. Grid
  needs no new backend commands until modules require parsed JSFX metadata.
- Nothing in the app pans horizontally yet, so the container is new. It should
  reuse the pointer-gating work from #138/#140 rather than inventing its own
  gesture handling — and note that a horizontal pan container sitting under
  horizontally-dragged knobs is exactly the gesture conflict `touch-action`
  was added to resolve.

## Open questions

- **Do we patch, and if so how far?** Exposing internal state means shipping or
  generating patched copies of other people's plugins. Yutani is MIT so it's
  permitted, but it's a support burden and a divergence to maintain. A middle
  path: patch nothing by default, offer a generator for plugins where a module
  exists and the user opts in.
- **`@serialize` precedence must be established empirically** before any
  patching work. Build a two-line JSFX with one variable both serialized and
  declared as a slider, save a project, reload, and see which value wins. That
  single experiment decides whether promotion is safe for existing sessions.
- **Reachability in the UI.** How should a module show a control the host
  cannot set? Omit it, or show it disabled with an explanation? Omitting is
  cleaner; showing it disabled is more honest about the plugin's real surface.
- **Manifest authoring.** Hand-written JSON per plugin does not scale past a
  handful. Worth considering a generator that takes the parsed descriptor and
  a rough grouping, and only the grouping is authored by hand.
- **Parsing cost.** Reading and parsing source per FX is cheap, but should be
  cached alongside the existing FX cache rather than done per request.
- **Where inference lives.** Extension (C++) keeps the frontend thin and gives
  filesystem access; frontend (TS) is faster to iterate on. The descriptor
  boundary means this can be moved later without changing the UI.

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
- **Preset and project compatibility is the real hazard.** Existing state lives
  in `@serialize`; adding a slider for the same variable creates two sources of
  truth, and the precedence is **not documented**. The reference only warns
  that `@init` may run *after* `@serialize`. Whether `@slider` then overwrites
  a serialize-restored value needs testing, not assumption — get it wrong and
  old projects load with settings silently reset. Yutani already has a
  `VERSION` field and migration branches, which is the hook a patch would use.
- **Per-plugin effort.** Yutani has 114 plausible controls to promote.

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

## Phasing

1. **Widget inference, no manifests.** Parse declarations, render enums as
   segmented controls and toggles as toggles. Immediate improvement to every
   JSFX, no per-plugin work. Ships independently of the rest.
2. **Descriptor command + module view.** `fx/getModule`, a module renderer,
   and the slider/module toggle.
3. **Manifests.** Start with two or three plugins to prove the format. Yutani
   is a good stress test precisely because it is the hard case.
4. **XY pads and richer widgets**, once the layout format has settled.

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

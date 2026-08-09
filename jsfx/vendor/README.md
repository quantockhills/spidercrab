# Patched copies of other people's plugins

Three of the Grid layouts need parameters their plugin doesn't normally offer.
Saike's Yutani keeps 122 controls in internal variables — including every
section's on/off switch — and the MIDI ARP keeps its entire pattern in memory.
None of that crosses into a host, so from an iPad those plugins are a settings
page with the instrument missing.

`tools/jsfx_expose.py` writes a copy with that state declared as parameters,
under a new filename and with `[Spidercrab]` appended to the description. It is
a separate plugin as far as REAPER is concerned: existing projects keep loading
the original, untouched, and the copy has no saved state to migrate.

The copies are here so a layout and the plugin it was written against ship
together and cannot disagree. Generating them locally works too — see below —
but then the version you generate from has to match the one the layout expects,
and it silently might not.

## What's here, and whose it is

| Directory | Upstream | Version | Author | Licence |
|---|---|---|---|---|
| `Yutani/` | [Yutani Mono Bass Synth](https://github.com/JoepVanlier/JSFX) | 0.103 | Joep Vanlier | MIT |
| `saike_midi_arp/` | [Saike MIDI ARP](https://github.com/JoepVanlier/JSFX) | 0.44 | Joep Vanlier | MIT |
| `SequencedFX/` | [Saike SEQS](https://github.com/JoepVanlier/JSFX) | 0.126 | Joep Vanlier | MIT |

All three are MIT, and each patched file keeps its original `author:` and
`license:` lines verbatim — `jsfx_expose.py` rewrites only the `desc:` line.
The `*_Dependencies/` and `*_dependencies/` folders are unmodified upstream
files, included because the patched copy's `import` lines resolve relative to
it and it will not compile without them.

**These are Joep Vanlier's plugins.** Install them properly from
[his repository](https://github.com/JoepVanlier/JSFX) via ReaPack — you want
the originals anyway, and you want his updates. What's here is a derived copy
for one purpose.

## Installing

Deliberately not part of the Spidercrab installer: dropping somebody else's
plugins into your Effects folder without being asked is not on.

Copy a directory's contents into REAPER's `Effects/` folder, keeping the
dependency folder beside the `.jsfx`. The copy appears alongside the original,
with `[Spidercrab]` in its name.

Presets are not included — Yutani's alone are 2.9 MB, and `jsfx_expose.py`
retargets your existing bank to the patched copy when you run it.

## Generating them instead

From a REAPER install that already has the originals:

```sh
python tools/jsfx_expose.py "<Effects>/Saike Tools/Yutani/Saike_Yutani.jsfx"
python tools/jsfx_expose.py "<Effects>/Saike Tools/saike_midi_arp/saike_midi_arp.jsfx"
python tools/jsfx_stepgrid.py "<Effects>/Saike Tools/saike_midi_arp/saike_midi_arp_spidercrab.jsfx"
```

`jsfx_stepgrid.py` runs second and only on the arp: it adds the window onto the
pattern buffer that the note grid reads. `jsfx_expose.py` regenerates from the
original and would drop it, so that order matters.

If the upstream version has moved on, the layout's slider numbers may no longer
line up. Each module records what it was written against (`builtFor`), the
device's Info tab shows it, and its header counts any controls that fail to
resolve.

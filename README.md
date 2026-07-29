# 🦀 spidercrab

<div align="center">
  <img src="docs/assets/spider-crab.jpg" alt="Spiny Spider-crab (Maia squinado)" width="300" />
  <br/>
  <em>Fig. 1. The Spiny Spider-crab (<i>Maia squinado</i>), our namesake.</em>
</div>

**Turn your iPad into a hands-on remote for REAPER.** Launch clips, play and record, shape effects, and drop in samples, all by touch, over your own Wi-Fi.

<div align="center">
  <table>
    <tr>
      <td><img src="docs/screenshots/ss-playtime.png" width="640" alt="Playtime clip grid with clip names" /></td>
      <td><img src="docs/screenshots/ss-fx.png" width="640" alt="FX browser with search" /></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/ss-waveform.png" width="640" alt="Sample browser with waveform preview" /></td>
      <td><img src="docs/screenshots/ss-tracks.png" width="640" alt="Track controls" /></td>
    </tr>
  </table>
</div>

## What it does

Spidercrab adds a touch interface to REAPER that you open on an iPad, or any tablet. No cloud, no subscription, no second computer. Once it is running you can:

- Mix by touch, with volume, pan, mute, solo and record-arm on every track.
- Play, stop and record, and fire off clips and scenes with Playtime 2.
- Add effects and effect chains, and tune their parameters on large, finger-friendly sliders.
- Browse, tag and preview your samples, then send them to a track or a clip.
- Turn a sample or clip into a playable instrument on a sampler track.

**For example:** playing live, you might set up a track for your vocals, drop a reverb on it, and loop a phrase through Playtime. If you're running a MIDI synth, add VST effects to its track and tweak them by hand while you play, the same way you'd reach for a knob on a modular synth. Drop in samples too, and use Playtime's grid to arrange them however you want, whether that's jamming loosely or triggering a set song.

It reads clearly in both light and dark.

## Getting started

Two ways to install, both from the [releases page](https://github.com/quantockhills/spidercrab/releases):

- **Installer (Windows/macOS):** run `SpidercrabSetup.exe` or `SpidercrabInstaller.pkg`. It places the plugin and the web UI into REAPER's UserPlugins folder for you. On macOS, since the installer isn't notarized, you'll need to allow it once via System Settings → Privacy & Security → Open Anyway — after that, it also clears Gatekeeper's quarantine flag on the plugin itself, so there's no Terminal step.
- **Manual (any OS, if you'd rather DIY):** copy the plugin for your system into REAPER's UserPlugins folder, and place the `frontend` folder next to it. On macOS this means one Terminal command first — `xattr -dr com.apple.quarantine reaper_spidercrab.dylib` — to clear Gatekeeper's quarantine flag yourself instead of letting the installer do it. Full steps, including exactly where UserPlugins is on each OS: [Getting Started](docs/getting-started.md).

Either way, then:

1. Restart REAPER, then start it from **Extensions → Spidercrab → Start / stop remote** (macOS/Linux: search "Spidercrab" in the Action List instead). It no longer runs on its own.
2. Get the address from **Extensions → Spidercrab → Show connection address**, open it on your tablet, and add it to the home screen.

That is enough for track, effect and sample control. The clip launcher adds Playtime 2 and a short, one-time setup.

**Full walkthrough: [Getting Started](docs/getting-started.md).** Building it yourself instead? See [For developers](#for-developers) below.

Nothing else is required. No SWS, no scripts, no other REAPER add-ons. The only extra piece is Helgobox, and only if you want the clip launcher.

## Documentation

**[quantockhills.github.io/spidercrab](https://quantockhills.github.io/spidercrab/)** is the full guide, searchable, and covers every tab, every gesture, and setup from scratch. Or browse the source in [`docs/`](docs/):

- [Getting Started](docs/getting-started.md)
- [Touch Gestures](docs/gestures.md)
- [A tour of the five tabs](docs/features/README.md)

To run the site locally instead, `mkdocs serve` (dependencies in [`docs/requirements.txt`](docs/requirements.txt)).

## Status

Spidercrab is early software under active development. Keep backups, and see the [open issues](https://github.com/quantockhills/spidercrab/issues) for current limitations before you lean on it in a live session.

## For developers

```bash
git clone --recursive https://github.com/quantockhills/spidercrab.git
cd spidercrab
make build          # build the extension plugin
make deploy         # copy the plugin into REAPER (plugin only)
cd frontend && npm run build   # build the web UI
```

WDL and the REAPER SDK are git submodules (`docs/WDL`, `docs/reaper-sdk`); the `--recursive` above fetches them. Already cloned without it? Run `git submodule update --init`.

`make deploy` installs the **plugin** only. To deploy the **web UI**, copy the built `frontend/dist` output into a folder named **`frontend`** next to the plugin in UserPlugins. The plugin serves `<plugin folder>/frontend/index.html`, so the folder must be named `frontend` (not `dist`), with `index.html` at its root. For live UI work, `npm run dev` runs a hot-reloading dev server instead.

On Windows the plugin is built with **clang-cl** (or MSVC), never MinGW. Architecture and build notes are in [`docs/`](docs/).

## License

MIT. See [LICENSE](LICENSE).

# 🦀 spidercrab

> ⚠️ **Work in progress.** This is an early-stage project under active development. It may crash, eat your project file, or set your cat on fire. Not yet recommended for live use or critical sessions. Proceed with caution (and backups).

**Control REAPER from your iPad** — browse FX, tweak parameters, manage tracks, all over WiFi. No extra servers, no subscription, no cloud.

<div align="center">
  <table>
    <tr>
      <td><img src="docs/screenshots/ss-tracks.jpg" width="240" alt="Track overview" /></td>
      <td><img src="docs/screenshots/ss-fx-browser.jpg" width="240" alt="FX browser with plugins" /></td>
    </tr>
    <tr>
      <td><img src="docs/screenshots/ss-fx.jpg" width="240" alt="FX browser with search" /></td>
      <td><img src="docs/screenshots/ss-settings.jpg" width="240" alt="Settings" /></td>
    </tr>
  </table>
</div>

## What is this?

An extension that turns REAPER into a WiFi-enabled DAW you can control from an iPad (or any phone/tablet). It runs a tiny web server inside REAPER — open the address on your iPad and you get a touch-friendly control surface with:

- **Track overview** — see all your tracks, mute/solo/arm, adjust volume
- **FX browser** — browse 250+ plugins, search, filter by format
- **Param control** — touch sliders for every FX parameter, real-time feedback
- **FX chains** — save and load `.RfxChain` files with tag filtering
- **Tags** — organize FX and chains with custom labels, filter by tag

No Node.js, no separate server process, no cloud. Works on your local network.

## 📱 How to use it

### 1. Install the extension
Download the latest release for your OS from the [releases page](https://github.com/quantockhills/spidercrab/releases/tag/v0.2.2-alpha):

- **Windows** → `spidercrab.dll` into `REAPER/UserPlugins/`
- **Linux** → `spidercrab.so` into `REAPER/UserPlugins/`

Then copy the **`frontend/`** folder into the same directory (next to the .dll/.so).

### 2. Launch REAPER
The extension starts automatically — you'll see `WebSocket server started on port 9224` in the console.

### 3. Open on your iPad
Open `http://your-computer-name:5173` in Safari (or any browser) on your iPad. Add it to your home screen for a full-screen PWA experience.

That's it. No configuration needed.

## ✨ What's included

| Area | What you can do |
|------|----------------|
| **Tracks** | See all tracks, mute/solo/arm, adjust volume and pan |
| **FX** | Browse all installed plugins, search by name, filter by VST3/VST2/JSFX/CLAP |
| **Parameters** | Touch sliders for every FX parameter with real-time updates |
| **FX Chains** | Browse, save, and load `.RfxChain` files from your iPad |
| **Tags** | Label FX and chains with custom tags, filter by tag |
| **Transport** | Play/Stop from iPad |
| **Dark mode** | Toggle between light and dark themes |
| **FX presets** | Browse and apply presets from the param view |

## 🔧 For developers

See the [docs/](docs/) folder for architecture, UI spec, and build instructions. Quick start:

```bash
git clone https://github.com/quantockhills/spidercrab.git
cd spidercrab
make build           # Build C++ extension
make deploy          # Copy to REAPER
cd frontend && npm run dev   # Frontend dev server
```

## 📸 Screenshots

See the [screenshots](screenshots/) folder for more, including:
- Unified FX + chain search ([issue #96](screenshots/issue96/))
- Tag badges and editor ([issue #97](screenshots/issue97/))

## License

MIT — see [LICENSE](LICENSE) file.

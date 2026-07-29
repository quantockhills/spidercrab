# Getting Started

Spidercrab isn't an app you download from the App Store. It's a little control surface that **REAPER itself serves to your iPad** over your home network. You install one file into REAPER, then open a web address on the iPad. Here's the whole process, start to finish.

!!! warning "Early days"
    Spidercrab is under active development. Back up your projects, and don't rely on it for a critical live show just yet.

!!! success "No extra REAPER add-ons needed"
    Spidercrab is self-contained — it does **not** require SWS, js_ReaScriptAPI, ReaPack, a MIDI loopback (like loopMIDI), or any other REAPER extension or script. Track, FX and sample control all work with a plain REAPER install (the sampler uses REAPER's stock ReaSamplOmatic5000). The **only** add-on you'll need is **Helgobox (ReaLearn + Playtime 2)** — and only if you want the [Clip Launcher](features/playtime.md) (step 4 below).

## 1. Install Spidercrab into REAPER

Download the latest release for your system from the [releases page](https://github.com/quantockhills/spidercrab/releases), then:

=== "Windows / macOS installer (easiest)"

    Run **`SpidercrabSetup.exe`** (Windows) or **`SpidercrabInstaller.pkg`** (macOS). It places the plugin and the web UI into REAPER's UserPlugins folder for you — no manual copying.

    !!! warning "macOS: allow the installer once"
        The `.pkg` isn't notarized (that needs a paid Apple Developer account), so macOS blocks it the first time you try to open it. **Right-click (or Control-click) `SpidercrabInstaller.pkg` → Open**, then confirm in the dialog that appears — on most macOS versions that's it, no Settings menu needed.

        If right-clicking doesn't offer an **Open** option, double-click it once (it'll get blocked), then go to **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to it there instead.

        Either way, that's the only manual step — the installer then places the files *and* clears Gatekeeper's quarantine flag on them itself, so there's no Terminal command to run.

    **Restart REAPER.**

=== "Manual (any OS)"

    1. Put the plugin file into REAPER's **UserPlugins** folder:
        - **Windows** — `reaper_spidercrab.dll`
        - **macOS** — `reaper_spidercrab.dylib`
        - **Linux** — `reaper_spidercrab.so`

        (Not sure where UserPlugins is? In REAPER: **Options → Show REAPER resource path**, then open the `UserPlugins` folder.)

        !!! warning "macOS: clear the quarantine flag first"
            macOS blocks downloaded plugins by default. Before REAPER can load `reaper_spidercrab.dylib`, run this in Terminal from wherever you downloaded it: `xattr -dr com.apple.quarantine reaper_spidercrab.dylib`. Otherwise REAPER (or macOS) may say it "cannot be opened" or "is damaged" — it isn't, that's just Gatekeeper.
    2. Copy the **`frontend`** folder from the release into that **same** UserPlugins folder, right next to the plugin file. It must be named exactly **`frontend`**, with **`index.html` directly inside it** — that is the folder the plugin serves to your iPad.
    3. **Restart REAPER.**

Spidercrab now lives in REAPER's **Extensions** menu, and it **doesn't start on its own** — you launch it when you want it:

> **Extensions → Spidercrab → Start / stop remote**

That starts the small web server that hosts the iPad page plus the control connection your iPad talks to. The same item stops it, and a checkmark shows when it's running.

!!! note "On macOS / Linux"
    The **Extensions → Spidercrab** submenu is currently Windows-only. On macOS and Linux, open REAPER's **Action List** and search for "Spidercrab" — you'll find **Spidercrab: Start/stop remote** and **Spidercrab: Show connection address** there instead, and you can bind either to a shortcut or a toolbar button.

## 2. Open it on your iPad

Your iPad and your computer need to be on the **same Wi-Fi network**, and Spidercrab must be started (above).

1. **Get the address the easy way:** in REAPER, go to **Extensions → Spidercrab → Show connection address**. It lists the exact `http://<your-ip>:5173` to open (and skips virtual/WSL adapters, so you don't have to guess which IP).
    - *No menu handy?* Find your computer's IP yourself (Windows: `ipconfig`; macOS: **System Settings → Network**) and use `http://<that-ip>:5173`.
2. On the tablet, open that address in a browser (**Safari** or **Chrome**).
3. The control surface loads. 🎉
4. **Recommended — go tabless:** use **Share → Add to Home Screen**, then launch it from that new icon. It opens **full-screen with no browser tabs or address bar**, exactly like a native app. (Opening the URL in a normal browser tab works too; you just get the browser chrome.)

That's enough to **control tracks, mixing, effects, and the transport**. Samples and the clip launcher each need a bit more setup, below.

## 3. Point it at your samples (optional)

To use the **Media** tab:

1. In the app, open **Settings** and add one or more **sample folders**.
2. Tap the **⟳** button next to the folder you just added. This is required the first time — a freshly-added folder has nothing cached yet, so the Media tab won't show anything in it until you do this. The first pass through a big folder takes a moment; after that, browsing is instant, and you won't need to press it again unless the folder's contents change.

## 4. Set up the Clip Launcher (optional)

The [Clip Launcher](features/playtime.md) drives **Playtime 2** through **ReaLearn**, using OSC messages. It's a one-time setup — allow yourself a few minutes.

!!! info "Set it up on the computer, then play from your tablet"
    Everything in this step happens **once, on the PC**, inside REAPER — installing Helgobox, downloading the preset, and wiring up OSC. Once that's done you never touch the computer again: your **tablet or phone** drives the whole clip launcher. Go buckwild.

1. **Install Helgobox** (it bundles both ReaLearn and Playtime 2) from [helgoboss.org](https://www.helgoboss.org/projects/helgobox/), then restart REAPER.
2. **Add ReaLearn** to a track (any track works, or add it as monitoring FX).
3. **Download + import the preset — on the computer:** open Spidercrab in a browser **on the PC** (`http://localhost:5173`) and go to **Settings → Download ReaLearn Preset**. (Download it here, not on the tablet — the file has to land on the same machine as REAPER.) Open the downloaded file, copy everything, and in ReaLearn's **Main** compartment click the menu (**⋯**) → **Import from Lua**, paste, and confirm. This builds the mappings for an 8×8 grid of clips.
4. **Connect OSC:**

    !!! success "Already done if you used the installer"
        `SpidercrabSetup.exe` / `SpidercrabInstaller.pkg` already registered a `spidercrab` device in ReaLearn's own OSC device list during install (matching the ports below) — skip straight to selecting it, below. If REAPER had never been run before you installed, or you used the manual-copy path, add it yourself first:

        !!! note "This is ReaLearn's own device list, not REAPER's"
            ReaLearn keeps its own separate list of OSC devices — it doesn't use REAPER's built-in OSC control surfaces (Preferences → Control/OSC/web), which is a different, unrelated system.

        In ReaLearn's **Input** menu, choose **Manage OSC devices → \<New\>**, and set:

        - **Name** — `spidercrab`
        - **Local port** — **9001**
        - **Device host** — `127.0.0.1`
        - **Device port** — **9011**

    Either way, back in ReaLearn's **Main** compartment, select the **`spidercrab`** device as **both** the Control input and the Feedback output — that part's a per-ReaLearn-instance setting, so it always needs picking once by hand even when the device itself was set up automatically.
5. **Try it:** make sure Playtime 2 has a matrix with some clips, open the **Playtime** tab on your iPad, and tap a slot. It should fire the clip, and the slot should light up live as it plays.

!!! tip "Nothing happens when you tap a slot?"
    That's almost always the OSC settings in step 4 — double-check the ports (**9001** in, **9011** out) and that the device is selected for both control and feedback.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| The page won't load on the iPad | Wrong address, or not on the same Wi-Fi | Double-check the computer's name or IP, and that both devices are on the same network. |
| Page loads but says "Disconnected" | The app can't reach REAPER | Make sure REAPER is open with Spidercrab installed, and that no firewall is blocking it. |
| Tapping a clip slot does nothing | The clip launcher's OSC link isn't set up | Recheck the OSC ports in [step 4](#4-set-up-the-clip-launcher-optional): **9001** in, **9011** out, device selected for both. |
| Clips won't play | Playtime 2 isn't running, or has no clips | Open Playtime 2 and make sure it has a matrix with clips. |
| The Media tab is empty | No sample folders added yet | Add a folder in Settings and scan it ([step 3](#3-point-it-at-your-samples-optional)). |

## Where to next

- [Touch Gestures](gestures.md) — learn the taps and holds.
- [The App at a Glance](features/README.md) — a tour of the five tabs.

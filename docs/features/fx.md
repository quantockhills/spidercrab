# Effects (FX) 🎛️

Add effects to your tracks, load ready-made effect chains, and tweak everything with sliders made for fingers, not a mouse.

## Adding an effect

The **FX** tab lists every plugin installed on your computer, **grouped by format** (VST3, VST, CLAP, JSFX, AU, DX) with a count for each. To find one:

- **Search** by name — start typing to filter.
- **Filter by format** with the dropdown, if you only want (say) CLAP plugins.
- **Filter by tag** — tap the coloured tag chips along the top to narrow to your favourites (tap **All** to clear).

Tap a plugin's **Add** button to drop it on the selected track (it flashes **✓ Added**), or tap its **name** to jump straight into its parameters. If you haven't picked a track yet, the browser reminds you to **select one first** (over on the Tracks tab).

You can also add effects without leaving the Tracks tab — hold the **Add FX** button on any track card for a quick search. (See [Tracks & Mixing](tracks.md).)

A **🔗 Chains** button next to the FX Browser title jumps straight to the [effect chain browser](#effect-chains) below.

**Tags:** tap the **✏️** next to any plugin to give it labels (comma-separated). Tags are colour-coded, persist between sessions, and power the filter chips.

## Effect chains

An effect chain is a saved stack of effects — a whole vocal chain or drum-bus setup in one go. Spidercrab reads them from your REAPER **FXChains** folder (set the folder in [Settings](settings.md)).

The chain browser has two tabs: **Browse & Load** (find and apply an existing chain) and **Save Chain** (save the selected track's current effects as a new one).

- **Browse** chains by folder, or **search** them. Either way, results beyond 100 are paginated with **← Prev / Next →**.
- **Peek inside** a chain (Chain Info) to see what effects it contains before you load it.
- **Load a chain two ways:** **Append** it after the track's current effects, or **Replace** everything on the track with it.
- **Save** a track's current effects as a new chain — you give it a name.
- **One search finds both** — when you search in the FX browser, matching effect **chains show up alongside plugins** (under a 🔗 Chains heading), so you don't have to go looking separately.

## Tweaking the knobs

Open an effect to see its parameters, each as a big horizontal slider:

- **Slide** to change the value — you'll hear it move in real time, with the value shown (e.g. "−6.0 dB", "50%").
- **Tap** anywhere on the slider to jump straight to that spot.
- **Double-tap** to snap it back to the default.

Plugins with lots of parameters are paged so the list stays manageable. The sliders stay in sync with REAPER, so if a value changes on the desktop it updates here too — and your in-progress adjustment won't get yanked out from under you.

A **Remove FX** button in the header deletes the plugin outright — unlike the Tracks tab's hold-to-delete, this one doesn't ask you to confirm, so use it deliberately.

**Right on the Tracks tab:** you don't even have to come to this tab — each track card has an **inline drawer** that shows an effect's parameters in place. (See [Tracks & Mixing](tracks.md).)

## Presets

Every plugin's built-in presets are available — open the **preset dropdown**, **search** by name, and tap to apply, or just step through them with the **◀ ▶** buttons.

**Pin your favourites:** in the inline drawer on the [Tracks](tracks.md) tab, tap the pin on any parameter to keep it in a "Pinned" strip at the top — handy for the two or three knobs you always reach for.

Wondering what a tap or hold does? See [Touch Gestures](../gestures.md).

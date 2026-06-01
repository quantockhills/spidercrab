# Helgobox (ReaLearn & Playtime 2) Installation

## Overview

Helgobox consists of two components:

1. **helgobox.so** (60MB) — The main shared library containing ReaLearn and Playtime 2 code (Rust)
2. **reaper_helgobox.so** (741KB) — The REAPER extension wrapper that bootstraps helgobox.so

> **IMPORTANT**: `helgobox.so` must be placed in `UserPlugins/FX/` directory (the VST plugin
> directory), NOT just in `Plugins/` or `UserPlugins/`. The `reaper_helgobox.so` bootstrap
> mechanism uses `libloading` (dlopen) to find `helgobox.so` by looking in the VST plugin
> directory (`UserPlugins/FX/`).

## Installation

### Linux (Portable Install)

1. Download the latest Helgobox pre-release from:
   https://github.com/helgoboss/helgobox/releases

2. Extract the archive:
   ```bash
   unzip helgobox-*.zip -d /tmp/helgobox-extract
   ```

3. Copy files to the correct directories:
   ```bash
   # reaper_helgobox.so goes in Plugins/ (standard REAPER extension location)
   cp /tmp/helgobox-extract/reaper_helgobox.so ~/reaper-portable/Plugins/
   cp /tmp/helgobox-extract/reaper_helgobox.so ~/.config/REAPER/UserPlugins/
   
   # helgobox.so goes in UserPlugins/FX/ (VST plugin location, required by bootstrap)
   mkdir -p ~/reaper-portable/UserPlugins/FX
   mkdir -p ~/.config/REAPER/UserPlugins/FX
   cp /tmp/helgobox-extract/helgobox.so ~/reaper-portable/UserPlugins/FX/
   cp /tmp/helgobox-extract/helgobox.so ~/.config/REAPER/UserPlugins/FX/
   ```

4. Also copy to Plugins/ as fallback:
   ```bash
   cp /tmp/helgobox-extract/helgobox.so ~/reaper-portable/Plugins/
   cp /tmp/helgobox-extract/helgobox.so ~/.config/REAPER/UserPlugins/
   ```

5. Install dependencies:
   ```bash
   # libxdo is required by helgobox.so
   sudo apt-get install -y libxdo3
   ```
   
   On systems without root access, copy libxdo.so.3 to the same directory:
   ```bash
   # Download and extract libxdo3.deb, then copy libxdo.so.3 to Plugins/
   cp libxdo.so.3 ~/reaper-portable/Plugins/
   ```

6. Start REAPER with LD_LIBRARY_PATH:
   ```bash
   export LD_LIBRARY_PATH="/home/linuxbrew/.linuxbrew/lib:$HOME/reaper-portable/Plugins"
   ~/reaper-portable/reaper
   ```

### Verifying Installation

Check that both files are present in the correct locations:
```bash
ls -la ~/reaper-portable/Plugins/reaper_helgobox.so
ls -la ~/.config/REAPER/UserPlugins/FX/helgobox.so
```

Start REAPER and check the console for:
```
[reaper-ipad] Playtime 2 API resolved successfully
[reaper-ipad] playtime: Resolved 'HB_FindFirstPlaytimeHelgoboxInstanceInProject' (bare name)
```

## Version Requirements

- Helgobox 2.16.0-pre.8 or later is required for Playtime 2 C API support
- The HB_* API functions (HB_FindFirstPlaytimeHelgoboxInstanceInProject,
  HB_CreateClipMatrix, HB_ShowOrHidePlaytime) are registered via REAPER's
  extension API mechanism at startup

## Troubleshooting

### HB_* functions not resolving

If `isPlaytimeAvailable()` returns `false`:

1. **Check file placement**: `helgobox.so` MUST be in `UserPlugins/FX/`, not just `Plugins/`.
   The `reaper_helgobox.so` bootstrapper looks for it there via `libloading`.

2. **Check dependencies**: `helgobox.so` depends on `libxdo.so.3`. Install it:
   ```bash
   sudo apt-get install -y libxdo3
   ```

3. **Check LD_LIBRARY_PATH**: The Plugins directory must be in LD_LIBRARY_PATH:
   ```bash
   export LD_LIBRARY_PATH="$HOME/reaper-portable/Plugins:$LD_LIBRARY_PATH"
   ```

4. **Check REAPER's log output for**:
   ```
   [reaper-ipad] Playtime 2 API resolved successfully
   ```
   If you see "Helgobox not registered yet?" instead, the timing issue exists but
   the retry mechanism in Run() will resolve it on the next cycle (~30ms).

5. **Check both extensions load**: In REAPER, go to Help → About → Extensions and
   confirm both "reaper_helgobox" and "reaper_spidercrab" are listed.

### Deferred initialization

Our extension resolves Playtime API functions when REAPER calls our `Run()` method
(which happens ~30 times/second). If you see:
```
[reaper-ipad] Playtime 2 API not available (Helgobox not registered yet?)
[reaper-ipad] playtime: Will retry in Run() loop
```
This is normal! The next `Run()` cycle should resolve the functions.

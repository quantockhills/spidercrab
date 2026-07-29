# Windows installer

Builds `SpidercrabSetup.exe`, which copies the extension DLL and the web UI
into REAPER's `UserPlugins` folder, and registers the `spidercrab` device
in ReaLearn's own OSC device list (for the Clip Launcher) — so end users
don't place files by hand or dig through ReaLearn's device manager.

It installs to `%APPDATA%\REAPER\UserPlugins` **without admin rights** (the
directory page lets the user pick a different folder for a portable REAPER).

## Prerequisites

- **[Inno Setup 6](https://jrsoftware.org/isdl.php)** (free). After install, `iscc.exe`
  is the command-line compiler (typically `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`).
- A built extension DLL and a built frontend (see the repo README's "For developers").

## 1. Stage the payload

From the repo root, put the built artifacts here so the `.iss` can find them:

```
installer/
  spidercrab.iss
  payload/
    reaper_spidercrab.dll      <- from extension/build-cmake/ (or build/)
    frontend/                  <- the CONTENTS of frontend/dist/ (index.html at its root)
```

PowerShell, from the repo root:

```powershell
$stage = "installer\payload"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$stage\frontend" | Out-Null
Copy-Item "extension\build-cmake\reaper_spidercrab.dll" "$stage\reaper_spidercrab.dll"
Copy-Item "frontend\dist\*" "$stage\frontend\" -Recurse
```

## 2. Compile

```powershell
# Path varies by version/install type — find ISCC.exe rather than hardcode it:
$iscc = Get-ChildItem "${env:ProgramFiles(x86)}","$env:ProgramFiles","$env:LOCALAPPDATA\Programs" -Recurse -Filter ISCC.exe -EA SilentlyContinue | Select-Object -First 1
& $iscc.FullName installer\spidercrab.iss
```

The installer lands in `installer/output/SpidercrabSetup.exe`.

> Verified: Inno Setup 6.7.3 (per-user install, no admin) compiles this script and
> produces a working installer that lays out `reaper_spidercrab.dll` + `frontend/`
> correctly under the chosen folder.

## Notes

- **OSC device registration:** `CurStepChanged`'s `RegisterSpidercrabOscDevice`
  adds a device entry to `%APPDATA%\REAPER\Helgoboss\ReaLearn\osc.json` —
  **not** `reaper.ini`. REAPER has its own separate, native OSC
  control-surface list (`reaper.ini`'s `csurf_N` entries, configured via
  REAPER's own Preferences); ReaLearn's Input/Output dropdowns don't read
  from that at all. ReaLearn maintains a completely independent device
  list of its own, normally only editable via its "Manage OSC devices"
  dialog, persisted to this JSON file. If the file doesn't exist yet, a
  fresh one is created; if it exists with other devices already in it, the
  new device is inserted into the `"devices"` array without disturbing
  them. Only if a `spidercrab` device isn't already present, so re-running
  the installer doesn't create duplicates.
  The device's `id` is a **fixed** UUID
  (`5fb52133-18ef-489b-b7a9-57152d58db98`), not randomly generated — this
  matters if we ever ship a ReaLearn "unit" export (which references its
  OSC device by this same ID) instead of the current mappings-only
  compartment export, since importing it would only auto-select this
  device correctly if the IDs match. Until then, this still doesn't select
  the device in ReaLearn's own Input/Output dropdowns — that's a
  ReaLearn-instance setting the device list alone can't reach — so it's a
  one-time manual pick per ReaLearn instance, not fully zero-click. See
  `installer-mac/` for the same logic on macOS (bash instead of Pascal
  Script).
- **Version:** bump `AppVersion` in `spidercrab.iss` to match `CHANGELOG.md`.
- **What the user does after installing:** open REAPER → **Extensions → Spidercrab → Start / stop remote**, then **Show connection address** for the URL.
- **Uninstall** removes the DLL and the `frontend/` folder; it leaves the runtime
  `spidercrab/` config folder (tags + settings) in place so nothing is lost on reinstall.
- **`payload/` is a build artifact** — it is gitignored.
- **Windows only.** See `installer-mac/` for the macOS `.pkg` equivalent. Linux
  (`.so`) still has no packaged installer, just the manual-copy instructions.

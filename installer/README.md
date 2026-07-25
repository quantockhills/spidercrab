# Windows installer

Builds `SpidercrabSetup.exe`, which copies the extension DLL and the web UI
into REAPER's `UserPlugins` folder so end users don't place files by hand.

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

- **Version:** bump `AppVersion` in `spidercrab.iss` to match `CHANGELOG.md`.
- **What the user does after installing:** open REAPER → **Extensions → Spidercrab → Start / stop remote**, then **Show connection address** for the URL.
- **Uninstall** removes the DLL and the `frontend/` folder; it leaves the runtime
  `spidercrab/` config folder (tags + settings) in place so nothing is lost on reinstall.
- **`payload/` is a build artifact** — it is gitignored.
- **Windows only.** macOS (`.dylib`) and Linux (`.so`) would need their own packaging
  (a `.pkg` / script); this installer is x64 Windows.

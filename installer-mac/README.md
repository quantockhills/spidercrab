# macOS installer

Builds `SpidercrabInstaller.pkg`, which copies the extension `.dylib` and the
web UI into REAPER's `UserPlugins` folder and clears the Gatekeeper
quarantine flag on them — so users don't place files by hand or touch
Terminal.

Installs to `~/Library/Application Support/REAPER/UserPlugins`, per-user,
no admin password.

## How it works

Unlike the Windows installer (which has a real payload), this is built as a
**payload-free** `pkgbuild` package: the `.pkg` itself carries no files
under a fixed install location. Instead, `postinstall` and the two build
artifacts (`reaper_spidercrab.dylib`, `frontend/`) travel together as the
package's "Scripts" bundle (`pkgbuild --scripts`). At install time they
land next to `postinstall` on disk, and the script — plain shell, nothing
compiled — copies them into place itself and runs
`xattr -dr com.apple.quarantine` on the copies.

This is necessary because a normal (payload) `.pkg` install-location has to
be a fixed, absolute path, and there's no `~` to expand for "whichever user
is installing this." Resolving the real user's home directory has to happen
at install time, in a script, not at build time.

## 1. Stage the payload

From the repo root:

```
installer-mac/
  scripts/postinstall        <- already in the repo (the only checked-in file)
  payload/
    reaper_spidercrab.dylib  <- from extension/build-cmake/ (ad-hoc codesigned)
    frontend/                <- the CONTENTS of frontend/dist/ (index.html at its root)
```

```bash
stage="installer-mac/payload"
rm -rf "$stage" && mkdir -p "$stage/frontend"
cp extension/build-cmake/reaper_spidercrab.dylib "$stage/reaper_spidercrab.dylib"
cp -R frontend/dist/. "$stage/frontend/"
```

## 2. Build

`pkgbuild --scripts` bundles a whole directory, so `postinstall` and the
staged payload need to sit side by side in one folder before building:

```bash
scripts_dir="installer-mac/build-scripts"
rm -rf "$scripts_dir" && mkdir -p "$scripts_dir"
cp installer-mac/scripts/postinstall "$scripts_dir/postinstall"
chmod +x "$scripts_dir/postinstall"
cp installer-mac/payload/reaper_spidercrab.dylib "$scripts_dir/reaper_spidercrab.dylib"
cp -R installer-mac/payload/frontend "$scripts_dir/frontend"

pkgbuild \
  --nopayload \
  --identifier org.quantockhills.spidercrab \
  --version "$VERSION" \
  --scripts "$scripts_dir" \
  --install-location /tmp/spidercrab-installer-unused \
  installer-mac/output/SpidercrabInstaller.pkg
```

`--install-location` is required by `pkgbuild` but functionally unused here
since there's no payload — it just needs to be somewhere that doesn't
require admin authorization to write to (a path under `/tmp` works), so the
install doesn't prompt for a password.

> Verified: this whole flow — build, `pkgbuild`, then a real
> `installer -pkg ... -target CurrentUserHomeDirectory` run — is exercised
> end-to-end in CI (`.github/workflows/build-release.yml`, `macos` job) on
> every build, including checking the installed dylib still exports
> `ReaperPluginEntry`. Not just claimed to work — actually run and checked.

## Notes

- **`payload/` and `build-scripts/` are build artifacts** — gitignored,
  staged fresh each build. Only `scripts/postinstall` itself is checked in.
- **What the user does after installing:** open REAPER → **Extensions →
  Spidercrab → Start / stop remote**, then **Show connection address** for
  the URL. Same as the manual-install / Windows-installer flow.
- **Gatekeeper on the `.pkg` itself:** since it isn't notarized (that needs
  a paid Apple Developer ID), macOS will still block *opening the
  installer* the first time — System Settings → Privacy & Security →
  scroll to Security → **Open Anyway**. That's the one unavoidable step;
  everything after it (file placement, quarantine clearing on the payload)
  is automatic. See `docs/getting-started.md` for the current manual-copy
  alternative, which needs a Terminal command instead of this one click.

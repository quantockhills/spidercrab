# Cross-compiling the Windows DLL from Linux

This project supports cross-compiling `reaper_spidercrab.dll` for Windows using
`xwin` (MSVC CRT + Windows SDK headers/libs) and `clang-cl` (LLVM's MSVC-compatible
compiler frontend) — **no Windows, MSVC, or MinGW required**.

## Prerequisites

### 1. Install xwin

[xwin](https://github.com/Jake-Shadle/xwin) downloads and manages MSVC CRT libraries
and Windows SDK headers/libs.

```bash
cargo install xwin
xwin --accept-license splat --output ~/.xwin
```

This creates `~/.xwin/` with:
- `crt/include/` — MSVC CRT headers
- `crt/lib/x86_64/` — MSVC CRT .lib files (libcmt.lib, etc.)
- `sdk/include/` — Windows SDK headers (ucrt, shared, um)
- `sdk/lib/` — Windows SDK .lib files

### 2. Install LLVM with clang-cl

On Ubuntu/Debian via Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install llvm
```

Verify clang-cl is available:

```bash
clang-cl --version
```

On macOS, use `brew install llvm` and ensure `/opt/homebrew/opt/llvm/bin/` is on PATH.

### 3. Install Wine (for smoke testing)

```bash
sudo apt-get install wine wine32 wine64
wine --version
```

### 4. Install Python websockets (for integration tests)

```bash
pip3 install websockets
```

## Building the Windows DLL

```bash
# From the project root:
TARGET=windows bash extension/build.sh
```

This produces `extension/build/reaper_spidercrab.dll` (~730KB).

### Debug build

```bash
BUILD_TYPE=debug TARGET=windows bash extension/build.sh
```

Produces `extension/build/reaper_spidercrab-debug.dll`.

### How it works

The build script (`extension/build.sh`) does the following for `TARGET=windows`:

1. Sets `VCToolsInstallDir` to the xwin directory for toolchain discovery
2. Uses `clang-cl` with `--target=x86_64-pc-windows-msvc` for MSVC ABI compatibility
3. Forces `winsock2.h` before `windows.h` via a temp forced-include header to avoid
   `SOCKET` type conflicts with WDL's jnetlib networking code
4. Compiles each `.cpp` file with `clang-cl` + `-fuse-ld=lld`
5. Links with `lld-link` against `libcmt.lib` (static MSVC CRT), `kernel32.lib`,
   `user32.lib`, and `ws2_32.lib`
6. Cleans up temp files

## Wine Smoke Test

After building the DLL, run the Wine smoke test:

```bash
bash extension/test/wine_smoke_test.sh
```

This script:

1. **Checks prerequisites** — wine, DLL exists, Python websockets
2. **Downloads REAPER for Windows** (v7.33) if not cached at `~/.cache/reaper-wine/`
3. **Installs REAPER as portable** to the Wine prefix (`~/.wine/drive_c/REAPER/`)
4. **Deploys the cross-compiled DLL** to `UserPlugins/reaper_spidercrab.dll`
5. **Starts REAPER under Wine** with fresh config
6. **Waits for WebSocket port 9224** to open
7. **Runs `ws_integration_test.py`** against the Wine-hosted REAPER
8. **Cleans up** — kills Wine/REAPER processes

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DLL_PATH` | auto-detect | Path to `reaper_spidercrab.dll` |
| `WINE_PREFIX` | `$HOME/.wine` | Wine prefix directory |
| `TIMEOUT` | `30` | Seconds to wait for REAPER+WS startup |
| `VERBOSE` | `0` | Set to `1` for detailed output |
| `SKIP_DOWNLOAD` | `0` | Set to `1` to skip REAPER download/install |

## CI Pipeline

The workflow `.github/workflows/windows-build.yml` contains two jobs:

1. **windows-native** — Builds and tests on a `windows-2022` GitHub runner (native MSVC)
2. **cross-compile-wine** — Cross-compiles on `ubuntu-22.04` via xwin+clang-cl and
   runs the Wine smoke test

Both run on `workflow_dispatch`.

## Troubleshooting

### "xwin not found"

Install xwin first:

```bash
cargo install xwin
xwin --accept-license splat --output ~/.xwin
```

### "Python 'websockets' module not installed"

```bash
pip3 install websockets
```

### DLL crashes under Wine with unimplemented function

Some Windows API functions are stubs in Wine. Common workarounds:

- Ensure the DLL is linked against static MSVC CRT (`libcmt.lib`) — not the
  dynamic CRT (`msvcrt.dll`), which Wine handles differently
- Disable any features that depend on WinRT or COM APIs not implemented by Wine
- Check Wine debug output: `export WINEDEBUG=+loaddll,+seh`

### REAPER installer hangs under Wine

Run the installer manually first:

```bash
wine ~/.cache/reaper-wine/reaper733_x64-install.exe /PORTABLE /DIR="C:\\REAPER"
```

### Port conflict

Ensure no other WebSocket server is running on port 9224:

```bash
ss -tlnp | grep 9224
```

## References

- [xwin](https://github.com/Jake-Shadle/xwin) — MSVC CRT + Windows SDK for Linux
- [LLVM clang-cl](https://clang.llvm.org/docs/UsersManual.html#clang-cl) — MSVC-compatible compiler frontend
- [Wine](https://www.winehq.org/) — Windows compatibility layer for Linux
- [REAPER for Windows](https://www.reaper.fm/download.php) — Portable install

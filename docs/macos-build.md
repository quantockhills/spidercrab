# macOS Build Guide

Build the spidercrab REAPER extension for macOS as a `.dylib` bundle.

## Quick Start (Native macOS)

### Prerequisites

1. **Xcode Command Line Tools** (required for compiler + SDK):

   ```bash
   xcode-select --install
   ```

   Or install Xcode from the Mac App Store and accept the license:
   ```bash
   sudo xcodebuild -license accept
   ```

2. **Verify installation**:

   ```bash
   xcrun --sdk macosx --show-sdk-path
   # Should print something like: /Applications/Xcode.app/.../MacOSX.sdk
   ```

### Build

```bash
# From the project root:
TARGET=macos bash extension/build.sh

# Or via Make:
make build-macos
```

### Output

```
extension/build/reaper_spidercrab.dylib
```

### Deploy to REAPER

```bash
cp extension/build/reaper_spidercrab.dylib \
  ~/Library/Application\ Support/REAPER/UserPlugins/

# Or via Make:
make deploy-macos
```

Start or restart REAPER. The extension should appear in Preferences → Control/OSC/web.

### Verify

```bash
make test-macos
```

This runs `extension/test/test_macos_build.sh`, which:
1. Confirms the `.dylib` is a valid Mach-O bundle
2. Checks for the `ReaperPluginEntry` symbol export

## Debug Build

```bash
BUILD_TYPE=debug TARGET=macos bash extension/build.sh
```

Output: `extension/build/reaper_spidercrab-debug.dylib`

Debug builds include:
- `-O0 -g3` (no optimization, full debug info)
- `-DDEBUG=1` (debug assertions enabled)
- `-fno-omit-frame-pointer` (better stack traces)

## Codesigning

macOS may require ad-hoc signing for the dylib to load in REAPER (especially on Apple Silicon or with SIP enabled):

```bash
codesign --force --deep --sign - extension/build/reaper_spidercrab.dylib
```

This is added automatically by the build script after a successful build.

## Cross-Compilation via osxcross (Linux)

You can also cross-compile from Linux using [osxcross](https://github.com/tpoechtrager/osxcross).

### Setup

```bash
# Clone and build osxcross
git clone https://github.com/tpoechtrager/osxcross.git
cd osxcross

# Download a macOS SDK (requires an Apple machine or SDK download)
# Place the SDK tarball in the tools/ directory
./tools/gen_sdk_package_pbzx.sh MacOSX.sdk

# Build the toolchain
NO_COMPILER_SYMLINKS=1 ./build.sh

# Set the SDK path
export OSXCROSS_SDK=/path/to/osxcross/SDK/MacOSX.sdk
```

### Build

```bash
TARGET=macos bash extension/build.sh
```

osxcross is auto-detected if `x86_64-apple-darwin*-clang++` is in PATH.

### Test

```bash
bash extension/test/test_macos_build.sh
```

## Architecture Notes

### WDL jnetlib on macOS
- Uses BSD sockets (same API as Linux)
- `netinc.h` has `__APPLE__` guards:
  - `SET_SOCK_DEFAULTS(s)` sets `SO_NOSIGPIPE` to prevent SIGPIPE
  - `closesocket()` → `close()`
  - `JNL_ERRNO` → `errno`
- No changes needed — macOS networking support is built-in

### SWELL on macOS
- The extension includes `swell/swell.h` via WDL includes
- On macOS, `SWELL_TARGET_OSX` is defined automatically
- Compiles one Objective-C++ file, `swell/swell-modstub.mm` — the standard
  glue a REAPER extension needs to resolve SWELL's Windows-shaped GUI API
  (`CreatePopupMenu`, `InsertMenuItem`, etc.) from the host process. It works
  via a static initializer that queries REAPER's own app delegate
  (`swellGetAPPAPIFunc`) automatically when the dylib loads, before
  `ReaperPluginEntry` is even called — see `CMakeLists.txt`
  (`SWELL_PROVIDED_BY_APP` + this file, `APPLE` branch)
- Cocoa and Carbon frameworks are linked for SWELL compatibility
- The "Spidercrab" submenu under REAPER's Extensions menu is enabled on
  macOS via the above — confirmed working on real hardware. The Linux
  equivalent (`swell/swell-modstub-generic.cpp`, same `SWELL_dllMain`
  mechanism) is wired the same way but not CI-verified (no Linux build job
  exists yet). Either way, the **Start/stop remote** and **Show connection
  address** actions are also reachable from REAPER's Action List (prefixed
  "Spidercrab:") on every platform, if you'd rather bind them to a shortcut
  or toolbar button instead.

### REAPER SDK on macOS
- `REAPER_PLUGIN_DLL_EXPORT` → `__attribute__((visibility("default")))`
- `REAPER_PLUGIN_HINSTANCE` → `void*`
- Standard Clang ABI (no MSVC compat concerns)

### Key Differences from Linux
| Aspect | Linux | macOS |
|--------|-------|-------|
| Output suffix | `.so` | `.dylib` |
| Build flag | `-shared` | `-dynamiclib` |
| Frameworks | N/A | `-framework Cocoa -framework Carbon` |
| dl library | `-ldl` | In libSystem (no flag needed) |
| pthreads | `-lpthread` | In libSystem (accepted as no-op) |
| SIP codesigning | Not needed | May need `codesign -s -` |

## Troubleshooting

### "framework not found Cocoa"
Ensure Xcode CLT is installed and the SDK path is valid:
```bash
xcrun --sdk macosx --show-sdk-path
```

### dylib won't load in REAPER (SIP)
```bash
codesign --force --deep --sign - path/to/reaper_spidercrab.dylib
```

### Downloaded the dylib (e.g. from a GitHub release) and REAPER won't load it, or macOS says "cannot be opened" / "is damaged"
This is Gatekeeper, not a bad download. Files downloaded from the internet get a `com.apple.quarantine` flag, and macOS enforces code-signing/notarization checks on plugins loaded by another app (like REAPER loading this dylib), not just on apps you double-click. Release builds here are only ad-hoc signed, not notarized (notarization needs a paid Apple Developer account), so a downloaded dylib will likely hit this. Clear the flag before REAPER loads it:
```bash
xattr -dr com.apple.quarantine reaper_spidercrab.dylib
```
Building it yourself locally doesn't trigger this — only a file that's been downloaded does.

### Symbol not found errors
The extension uses `dladdr()` for path resolution (POSIX). This works on macOS — `dladdr()` is part of libSystem.

### osxcross: "xcrun: error"
You're on Linux trying to use `xcrun`. The build script detects the platform and falls back to osxcross. Ensure `OSXCROSS_SDK` is set correctly.

### Universal binary (arm64 + x86_64)
To build a universal binary on macOS:
```bash
TARGET=macos ARCHS="arm64 x86_64" bash extension/build.sh
```
This requires adding `-arch arm64 -arch x86_64` to CXXFLAGS and is currently not supported by the default build script — contribute a PR if you need this.

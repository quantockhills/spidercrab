# Windows Debugging - REAPER Extension Cross-Compilation

**Goal:** Get `reaper_spidercrab.dll` (cross-compiled via MinGW) working under REAPER Windows (under Wine), specifically the built-in HTTP server (`WebServerBaseClass` from WDL/jnetlib).

## Resources Saved Here

### 1. SWS Extension Build Guide
**Source:** https://github.com/reaper-oss/sws/wiki/Building-the-SWS-Extension
**File:** `sws-build-guide.md`

- Uses CMake with Visual Studio or Ninja
- **Uses MSVC on Windows** (not MinGW)
- Cross-platform: Linux, macOS, Windows (x64/x86)
- Installs to `%APPDATA%\REAPER\UserPlugins`

### 2. ak5k/reaper-sdk-vscode
**Source:** https://github.com/ak5k/reaper-sdk-vscode
**File:** `reaper-sdk-vscode.md`

- The canonical modern REAPER extension template
- Uses CMake with FetchContent for WDL + reaper-sdk
- **Uses MSVC or ClangCL on Windows** (not MinGW)
- Auto-installs to UserPlugins after build
- Full CI workflows, tests, packaging

### 3. cfillion's Bare-Bone Extension Gist
**Source:** https://gist.github.com/cfillion/f32b04e75e84e03cc463abb1eda41400
**File:** `cfillion-barebone-extension.md`

- Minimal example, ~5 lines of actual code
- Windows build command: `cl /nologo /O2 /Z7 /Zo /DUNICODE reaper_barebone.cpp /link /DEBUG /OPT:REF /PDBALTPATH:%_PDB% /DLL /OUT:reaper_barebone.dll`
- **Uses MSVC compiler**, NOT MinGW
- Includes Zig alternative

### 4. helgoboss/reaper-minimal-plugin
**Source:** https://github.com/helgoboss/reaper-minimal-plugin
**File:** `helgoboss-minimal-plugin.md`

- Minimal plugin using Win32 API (MessageBox)
- Key CMake pattern:
  ```cmake
  if (NOT WIN32)
    # SWELL only needed on non-Windows
    list(APPEND SOURCES lib/WDL/WDL/swell/swell-modstub-generic.cpp)
    target_compile_definitions(reaper_minimal_plugin PRIVATE SWELL_PROVIDED_BY_APP)
  endif()
  ```
- On Windows, WDL calls Win32 directly — **no SWELL involvement**
- Uses cxx_std_11 (`-std=c++11`)

## Key Finding: Compiler Difference

**Every reference project uses MSVC on Windows, not MinGW.**

Our build chain uses `x86_64-w64-mingw32-g++` (GCC 15.2.0) via Linuxbrew. This is a significant difference because:

| Feature | MSVC | MinGW GCC |
|---------|------|-----------|
| Winsock headers | `<winsock2.h>` via Windows SDK | `<winsock2.h>` via MinGW-w64 |
| CRT startup | MSVC CRT | mingw-w64 CRT |
| Static linking | `/MT` | `-static-libgcc -static-libstdc++` |
| DLL exports | `__declspec(dllexport)` | Same, but `-Wl,--out-implib` may differ |
| Socket behavior | Winsock2 via SDK | Winsock2 via MinGW wrappers |
| `accept()` | Normal | Works, but `SOCKET` is `int` not `UINT_PTR` |

The HTTP server (`WebServerBaseClass`) uses WDL jnetlib (`JNL_Listen`), which creates a raw TCP socket and calls `bind()` + `listen()`. Both WS and HTTP servers use the same `JNL_Listen` class. The difference is in `run()` — the WS server manually calls `get_connect(65536, 65536)`, while HTTP uses `get_connect()` with default 8192 buffers.

**Symptom:** `addListenPort` returns 0 (bind+listen success), `run()` is called ~30x/sec, but nothing actually accepts connections ("Connection refused" from curl).

# cfillion's Bare-Bone REAPER Extension

**Source:** https://gist.github.com/cfillion/f32b04e75e84e03cc463abb1eda41400
**Access date:** 2026-05-31

Minimal example showing the minimum code needed for a REAPER extension.

## Windows Build Command (MSVC)

```cmd
cl /nologo /O2 /Z7 /Zo /DUNICODE reaper_barebone.cpp /link /DEBUG /OPT:REF /PDBALTPATH:%_PDB% /DLL /OUT:reaper_barebone.dll
```

Flags:
- `/O2` — optimize for speed
- `/Z7` — debug info in .obj (not .pdb only)
- `/Zo` — enhanced debug info for optimized code
- `/DUNICODE` — define UNICODE
- `/link /DEBUG` — generate debug info in DLL
- `/OPT:REF` — eliminate unused COMDATs
- `/PDBALTPATH:%_PDB%` — PDB path alias
- `/DLL` — build as DLL

## Linux Build

```bash
c++ -fPIC -O2 -std=c++14 -IWDL/WDL -shared reaper_barebone.cpp -o reaper_barebone.so
```

## macOS Build

```bash
c++ -fPIC -O2 -std=c++14 -IWDL/WDL -dynamiclib reaper_barebone.cpp -o reaper_barebone.dylib
```

## Dependencies

1. `reaper_plugin.h` from reaper-sdk
2. `reaper_plugin_functions.h` (generate via REAPER action `[developer] Write C++ API functions header`)
3. WDL library

## Key Takeaway

The cfillion gist demonstrates the **absolute minimum** extension — no WDL networking, no SWELL, just the API headers. The Windows build uses **MSVC** with explicit flags. This reinforces that the standard toolchain for Windows REAPER extensions is MSVC, not MinGW.

# ak5k/reaper-sdk-vscode

**Source:** https://github.com/ak5k/reaper-sdk-vscode
**Access date:** 2026-05-31

A template for REAPER Plug-in Extension development using Visual Studio Code and CMake with presets.

## Platform Support

- Windows (MSVC, ClangCL, or LLVM Clang)
- macOS (AppleClang)
- Linux (GCC, Clang)

## Key Features

- **CMake presets:** configure/build presets for all platforms
- **WDL + reaper-sdk fetched via FetchContent** — no git submodules needed
- **Auto-install to UserPlugins** after build
- Debug with F5 (set `"program"` to `reaper.exe`)
- GoogleTest, Google Benchmark, CPack packaging
- GitHub Actions CI, clang-format, clang-tidy

## Windows Compilers (from CMakePresets.json)

- **MSVC** (default, `windows-msvc` preset)
- **ClangCL** (MSVC with LLVM frontend, `windows-clangcl`)
- **LLVM Clang** (native Windows Clang, `windows-clang-ninja`)
- **No MinGW preset** — not supported

## Windows Build Install Target

`CMAKE_INSTALL_PREFIX` defaults to `%APPDATA%\REAPER` on Windows.

## Key Takeaway

The modern REAPER extension template also uses **MSVC on Windows, not MinGW**. The cross-compilation approach (MinGW GCC from Linux) is non-standard for REAPER extension development.

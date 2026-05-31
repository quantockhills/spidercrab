# Building the SWS Extension (reference)

**Source:** https://github.com/reaper-oss/sws/wiki/Building-the-SWS-Extension
**Access date:** 2026-05-31

## Software Requirements

- CMake-supported build system (GNU make, Ninja, Visual Studio)
- C++11 compiler (**MSVC on Windows**)
- CMake 3.13.3+
- git, Perl (optional), PHP

## Supported Platforms

- Linux (x86_64, i686, armv7l, aarch64)
- macOS (x86_64, i386, arm64)
- **Windows (x64, x86) — MSVC only**

## Build Steps

```bash
git clone --recursive https://github.com/reaper-oss/sws
cd sws

# Configure
cmake -B build -DCMAKE_BUILD_TYPE=Debug

# Build
cmake --build build

# Build + install to REAPER resource path
cmake --build build --target install
```

## Windows-Specific

- Uses MSVC (Visual Studio Build Tools or IDE)
- Generator: Visual Studio or Ninja
- `cmake -B build -G Ninja` (use x64 or x86 Native Tools Command Prompt for VS)
- `cmake -B build -G "Visual Studio 16 2019" -A x64`
- `cmake -B build -G "Visual Studio 15 2017 Win64"`

## Install Paths

- Linux: `~/.config/REAPER`
- macOS: `~/Library/Application Support/REAPER`
- **Windows: `%APPDATA%\REAPER`**

## Key Takeaway

SWS uses **MSVC on Windows, never MinGW**. The `reaper_plugin.h` SDK headers are designed for MSVC's `__declspec(dllexport)` patterns, though MinGW supports these too.

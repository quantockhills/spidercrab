# helgoboss/reaper-minimal-plugin

**Source:** https://github.com/helgoboss/reaper-minimal-plugin
**Access date:** 2026-05-31

Minimal REAPER plugin that uses Win32 API directly (MessageBox). On non-Windows, uses REAPER's provided SWELL.

## Build Instructions

### Linux Debug
```bash
mkdir -p build/linux
cd build/linux
cmake -DCMAKE_BUILD_TYPE=Debug ../..
cmake --build .
# → build/linux/reaper_minimal_plugin.so
```

### Windows Debug
```bash
mkdir build\win
cd build\win
cmake ..\..
cmake --build .
# → build/win/reaper_minimal_plugin.dll
```

## CMakeLists.txt — Key Pattern

```cmake
cmake_minimum_required(VERSION 3.10)
project(reaper_minimal_plugin VERSION 0.1.0 LANGUAGES CXX)

set(SOURCES src/main.cpp)

# SWELL only needed on non-Windows!
if (NOT WIN32)
  list(APPEND SOURCES
      lib/WDL/WDL/swell/swell-modstub-generic.cpp
  )
endif()

add_library(reaper_minimal_plugin SHARED ${SOURCES})
target_include_directories(reaper_minimal_plugin PRIVATE
    lib/reaper
    lib/WDL
)

# Use REAPER's built-in SWELL on non-Windows
if (NOT WIN32)
  target_compile_definitions(reaper_minimal_plugin PRIVATE SWELL_PROVIDED_BY_APP)
endif()

# Strip "lib" prefix — REAPER requires reaper_*.dll, not libreaper_*.dll
SET_TARGET_PROPERTIES(reaper_minimal_plugin PROPERTIES PREFIX "")

# C++11 strict
target_compile_features(reaper_minimal_plugin PRIVATE cxx_std_11)
set_target_properties(reaper_minimal_plugin PROPERTIES CXX_EXTENSIONS OFF)
```

## Key Takeaway

This confirms: **SWELL is NOT needed on Windows.** On Windows, WDL calls Win32 directly. The `if (NOT WIN32)` guard around SWELL is explicit.

Our cross-compiled DLL does NOT include SWELL, which is correct — WDL/jnetlib should use Winsock2 directly on Windows/MinGW. The bug is either in MinGW's Winsock2 behavior or in how `JNL_Listen` interacts with Wine's networking stack.

# CSI (Control Surface Integrator) — Reference REAPER Extension

**Source:** https://github.com/FunkybotsEvilTwin/CSICode
**Access date:** 2026-05-31

CSI is a full production REAPER control surface extension — same architecture as spidercrab (control surface + csurf registration). This is the most relevant reference project found.

## What CSI Is

- Full control surface integration system for REAPER
- Supports MIDI and OSC devices
- Advanced mapping, feedback, workflow customization
- Open source, actively maintained
- Uses the same WDL + reaper-sdk stack as spidercrab

## Build System (CMake)

**File:** `CMakeLists.txt`

### Key Patterns

1. **FetchContent for dependencies** (no git submodules):
   ```cmake
   FetchContent_Declare(reaper-sdk
     GIT_REPOSITORY https://github.com/justinfrankel/reaper-sdk
     GIT_TAG        origin/main
   )
   FetchContent_Declare(WDL
     GIT_REPOSITORY https://github.com/justinfrankel/WDL
     GIT_TAG        origin/main
   )
   FetchContent_MakeAvailable(reaper-sdk GSL WDL)
   ```

2. **Symlink WDL into reaper-sdk**:
   ```cmake
   execute_process(
     COMMAND ${CMAKE_COMMAND} -E create_symlink
             "${PROJECT_LIB_DIR}/WDL/WDL"
             "${PROJECT_LIB_DIR}/reaper-sdk/WDL"
   )
   ```

3. **WDL + SWELL pattern**:
   ```cmake
   find_package(WDL REQUIRED)
   if(NOT WIN32)
     find_package(SWELL REQUIRED)
   endif()
   ```

4. **MSVC flags on Windows**:
   ```cmake
   add_compile_options(
     /EHsc           # Exception handling model
     $<$<NOT:$<CONFIG:Debug>>:/Zo>   # Enhanced optimized debugging
     $<$<NOT:$<CONFIG:Debug>>:/GF>   # Eliminate duplicate strings
     $<$<NOT:$<CONFIG:Debug>>:/Gy>   # Function-level linking
     $<$<NOT:$<CONFIG:Debug>>:/Zc:inline>  # Remove unreferenced COMDAT
   )
   add_link_options(
     $<$<NOT:$<CONFIG:Debug>>:/OPT:REF>    # Remove unreferenced code
     $<$<NOT:$<CONFIG:Debug>>:/OPT:ICF>    # Remove duplicate sections
     /PDBALTPATH:%_PDB%                    # Relative PDB path
   )
   ```

5. **Static MSVC runtime**:
   ```cmake
   set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
   ```

6. **C++17 standard**:
   ```cmake
   set_property(TARGET ${PROJECT_NAME} PROPERTY CXX_STANDARD 17)
   ```

7. **No "lib" prefix** (REAPER requires `reaper_*.dll`):
   ```cmake
   set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "")
   ```

## Entry Point Pattern

**File:** `reaper_csurf_integrator/main.cpp`

```cpp
#define REAPERAPI_IMPLEMENT
#define REAPERAPI_DECL
#include "reaper_plugin_functions.h"

extern reaper_csurf_reg_t csurf_integrator_reg;

REAPER_PLUGIN_DLL_EXPORT int REAPER_PLUGIN_ENTRYPOINT(
    REAPER_PLUGIN_HINSTANCE hInstance, 
    reaper_plugin_info_t *reaper_plugin_info)
{
    if (!reaper_plugin_info)
        return 0;
    
    if (reaper_plugin_info->caller_version != REAPER_PLUGIN_VERSION 
        || !reaper_plugin_info->GetFunc)
        return 0;

    // Load API functions
    if (REAPERAPI_LoadAPI(reaper_plugin_info->GetFunc) > 0)
        return 0;

    // Register control surface TYPE
    reaper_plugin_info->Register("csurf", &csurf_integrator_reg);

    return 1;
}
```

**Critical difference from spidercrab:** CSI does NOT create the control surface instance in the entry point. It only registers the type. The surface is created later when the user manually adds it via Preferences -> Control/OSC/Web.

Our spidercrab code creates the surface directly in the entry point to auto-start without user interaction. This is valid but may cause timing issues.

## FindWDL.cmake

**File:** `cmake/FindWDL.cmake`

```cmake
add_library(wdl INTERFACE)
target_compile_definitions(wdl INTERFACE WDL_NO_DEFINE_MINMAX)
target_include_directories(wdl INTERFACE ${WDL_INCLUDE_DIR})

if(NOT WIN32)
  find_package(SWELL REQUIRED)
  target_link_libraries(wdl INTERFACE SWELL::swell)
endif()

add_library(WDL::WDL ALIAS wdl)
```

Key: `WDL_NO_DEFINE_MINMAX` — prevents WDL from defining min/max macros that conflict with C++ stdlib.

## Key Takeaways for spidercrab

1. **Use CMake, not raw shell scripts** — FetchContent for deps, proper target setup
2. **MSVC on Windows** — `/EHsc`, `/Z7`, `/Zo`, `/GF`, `/Gy`, `/OPT:REF`, `/OPT:ICF`
3. **Static MSVC runtime** — `MultiThreaded` (not DLL runtime)
4. **C++17** — not C++11 or C++14
5. **WDL_NO_DEFINE_MINMAX** — critical to avoid macro conflicts
6. **Entry point only registers csurf type** — surface creation is deferred to user prefs
7. **No networking in CSI** — it's a MIDI/OSC control surface, not a web server. So the HTTP server issue is unique to spidercrab.

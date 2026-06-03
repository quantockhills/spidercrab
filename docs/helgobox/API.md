# Playtime 2 C API Reference

## Overview

Playtime 2 exposes a small C API through the Helgobox REAPER extension. The functions
are registered as REAPER extension API functions and can be resolved at runtime using
`reaper_plugin_info_t::GetFunc()`.

## Function Registration

The API functions are defined in the `playtime-api` Rust crate using the `reaper_api!` macro:

```rust
reaper_api![
    PlaytimeApi, PlaytimeApiPointers, PlaytimeApiSession, register_playtime_api
    {
        HB_FindFirstPlaytimeHelgoboxInstanceInProject(project: *mut reaper_low::raw::ReaProject) -> std::ffi::c_int;
        HB_CreateClipMatrix(instance_id: std::ffi::c_int);
        HB_ShowOrHidePlaytime(instance_id: std::ffi::c_int);
    }
];
```

These are registered with REAPER via:
```rust
RegistrationObject::Api(name, ptr)
```

Which ultimately calls `rec->Register("API_<name>", ptr)`. Other extensions can then
resolve them via `rec->GetFunc("<name>")` (without the "API_" prefix).

## Functions

### HB_FindFirstPlaytimeHelgoboxInstanceInProject

```c
int HB_FindFirstPlaytimeHelgoboxInstanceInProject(ReaProject* project);
```

**Parameters:**
- `project`: Pointer to a REAPER project, or `nullptr` for the current project

**Returns:**
- Instance ID of the first Helgobox instance containing a Playtime matrix
- `-1` if no such instance exists

**Notes:**
- Only returns the first instance; to find all instances, iterate through
  Helgobox instances using the REAPER project state

### HB_CreateClipMatrix

```c
void HB_CreateClipMatrix(int instance_id);
```

**Parameters:**
- `instance_id`: The Helgobox instance ID (obtained from
  `HB_FindFirstPlaytimeHelgoboxInstanceInProject`)

**Returns:** Nothing

**Notes:**
- Creates a new Playtime clip matrix in the specified Helgobox instance
- This is necessary to set up the Playtime session view

### HB_ShowOrHidePlaytime

```c
void HB_ShowOrHidePlaytime(int instance_id);
```

**Parameters:**
- `instance_id`: The Helgobox instance ID

**Returns:** Nothing

**Notes:**
- Toggles the Playtime 2 GUI visibility for the given instance
- If the app is not yet started, this will start it and create a Playtime matrix

## Usage in Spidercrab Extension

```cpp
#include "playtime_api.h"

// Check if Playtime is available
if (isPlaytimeAvailable()) {
    // Find first Playtime instance
    int instanceId = g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject(nullptr);
    if (instanceId >= 0) {
        // Show Playtime GUI
        g_playtimeApi.HB_ShowOrHidePlaytime(instanceId);
        
        // Create clip matrix
        g_playtimeApi.HB_CreateClipMatrix(instanceId);
    }
}
```

## Additional Helgobox API

There's also a helgobox-specific (non-Playtime) API function:

### HB_FindFirstHelgoboxInstanceInProject

```c
int HB_FindFirstHelgoboxInstanceInProject(ReaProject* project);
```

Returns the first Helgobox instance ID (any instance, not just Playtime ones)
or `-1` if none exists.

## Source Files

The canonical source for this API is the helgobox repository:
- `playtime-api/src/runtime/reaper.rs` — API definition
- `main/src/infrastructure/plugin/api_impl.rs` — Implementation and registration

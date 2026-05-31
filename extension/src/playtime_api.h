#pragma once
#include <cstdio>

// ============================================================
// Playtime 2 C API Integration
//
// Resolves Playtime 2 function pointers at runtime via REAPER's
// GetFunc mechanism. All functions are optional — check
// isPlaytimeAvailable() before calling them.
//
// Functions come from Helgobox (realearn.so) which registers
// them as REAPER extension API functions:
//
//   HB_FindFirstPlaytimeHelgoboxInstanceInProject(project)
//     → Returns instance ID of first Playtime matrix, or -1
//
//   HB_CreateClipMatrix(instance_id)
//     → Creates a new clip matrix in the given instance
//
//   HB_ShowOrHidePlaytime(instance_id)
//     → Toggles the Playtime 2 GUI window visibility
// ============================================================

struct PlaytimeApi {
    // Find first Playtime instance in a project
    // Returns instance ID or -1 if none found
    int (*HB_FindFirstPlaytimeHelgoboxInstanceInProject)(void* project) = nullptr;

    // Create a new clip matrix in the given Helgobox instance
    void (*HB_CreateClipMatrix)(int instance_id) = nullptr;

    // Show or hide the Playtime 2 app for the given instance
    void (*HB_ShowOrHidePlaytime)(int instance_id) = nullptr;
};

// Global Playtime API state — shared across the extension
extern PlaytimeApi g_playtimeApi;

// Initialize Playtime 2 API by resolving function pointers using
// REAPER's GetFunc mechanism. Call once at extension startup.
//
// Returns true if HB_FindFirstPlaytimeHelgoboxInstanceInProject
// was resolved successfully (the other two are optional).
inline bool initPlaytimeApi(void* (*getFunc)(const char*))
{
    if (!getFunc) {
        fprintf(stderr, "[reaper-ipad] playtime: GetFunc is null, cannot init\n");
        return false;
    }

    g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject
        = reinterpret_cast<int (*)(void*)>(
            getFunc("HB_FindFirstPlaytimeHelgoboxInstanceInProject"));
    g_playtimeApi.HB_CreateClipMatrix
        = reinterpret_cast<void (*)(int)>(
            getFunc("HB_CreateClipMatrix"));
    g_playtimeApi.HB_ShowOrHidePlaytime
        = reinterpret_cast<void (*)(int)>(
            getFunc("HB_ShowOrHidePlaytime"));

    bool available = (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject != nullptr);
    if (available) {
        fprintf(stderr, "[reaper-ipad] Playtime 2 API resolved successfully\n");
    } else {
        fprintf(stderr, "[reaper-ipad] Playtime 2 API not available (Helgobox not loaded?)\n");
    }
    return available;
}

// Returns true if Playtime 2 function pointers were resolved
// (meaning Helgobox is loaded and Playtime is available).
inline bool isPlaytimeAvailable()
{
    return g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject != nullptr;
}

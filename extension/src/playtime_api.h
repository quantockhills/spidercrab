#pragma once
#include <cstdio>
#include <cstring>

// ============================================================
// Playtime 2 C API Integration
//
// Resolves Playtime 2 function pointers at runtime via REAPER's
// GetFunc mechanism. All functions are optional — check
// isPlaytimeAvailable() before calling them.
//
// Functions come from Helgobox (reaper_helgobox.so) which registers
// them as REAPER extension API functions via plugin_register_add
// with RegistrationObject::Api. The function names are registered
// as-is (without "API_" prefix), so GetFunc(name) should find them.
//
// Known registered functions:
//   HB_FindFirstPlaytimeHelgoboxInstanceInProject(project)
//     → Returns instance ID of first Playtime matrix, or -1
//
//   HB_CreateClipMatrix(instance_id)
//     → Creates a new clip matrix in the given instance
//
//   HB_ShowOrHidePlaytime(instance_id)
//     → Toggles the Playtime 2 GUI window visibility
//
// Also available but not Playtime-specific:
//   HB_FindFirstHelgoboxInstanceInProject(project)
//     → Returns instance ID of first Helgobox instance, or -1
// ============================================================

struct PlaytimeApi {
    // Find first Playtime instance in a project
    // Returns instance ID or -1 if none found
    int (*HB_FindFirstPlaytimeHelgoboxInstanceInProject)(void* project) = nullptr;

    // Create a new clip matrix in the given Helgobox instance
    void (*HB_CreateClipMatrix)(int instance_id) = nullptr;

    // Show or hide the Playtime 2 app for the given instance
    void (*HB_ShowOrHidePlaytime)(int instance_id) = nullptr;

    // Non-Playtime Helgobox API
    int (*HB_FindFirstHelgoboxInstanceInProject)(void* project) = nullptr;
};

// Global Playtime API state — shared across the extension
extern PlaytimeApi g_playtimeApi;

// Stored GetFunc pointer for lazy retry
extern void* (*g_playtimeGetFunc)(const char*);

// Try to resolve a single function using one name format.
// Returns the function pointer or nullptr.
template <typename T>
inline T tryResolveFunc(void* (*getFunc)(const char*), const char* name, const char* variant)
{
    if (!getFunc) return nullptr;
    char fullName[256];
    snprintf(fullName, sizeof(fullName), "%s", name);
    // Try bare name first (standard REAPER convention)
    T ptr = reinterpret_cast<T>(getFunc(fullName));
    if (ptr) {
        fprintf(stderr, "[reaper-ipad] playtime: Resolved '%s' (bare name)\n", fullName);
        return ptr;
    }
    // Try with "API_" prefix (some registrations use it)
    snprintf(fullName, sizeof(fullName), "API_%s", name);
    ptr = reinterpret_cast<T>(getFunc(fullName));
    if (ptr) {
        fprintf(stderr, "[reaper-ipad] playtime: Resolved '%s' (API_ prefix)\n", name);
        return ptr;
    }
    fprintf(stderr, "[reaper-ipad] playtime: '%s' not resolved (%s)\n", name, variant ? variant : "");
    return nullptr;
}

// Initialize Playtime 2 API by resolving function pointers using
// REAPER's GetFunc mechanism. Can be called multiple times —
// will retry resolution if previously failed.
//
// Returns true if HB_FindFirstPlaytimeHelgoboxInstanceInProject
// was resolved successfully (the other two are optional).
inline bool initPlaytimeApi(void* (*getFunc)(const char*))
{
    if (!getFunc) {
        fprintf(stderr, "[reaper-ipad] playtime: GetFunc is null, cannot init\n");
        return false;
    }

    // Store for lazy retry
    g_playtimeGetFunc = getFunc;

    // If already resolved successfully, skip
    if (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject) {
        return true;
    }

    fprintf(stderr, "[reaper-ipad] playtime: Resolving Playtime 2 API functions...\n");

    // Try all known function names — try bare name and API_ prefix
    g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject
        = tryResolveFunc<int (*)(void*)>(
            getFunc, "HB_FindFirstPlaytimeHelgoboxInstanceInProject", nullptr);

    g_playtimeApi.HB_CreateClipMatrix
        = tryResolveFunc<void (*)(int)>(
            getFunc, "HB_CreateClipMatrix", nullptr);

    g_playtimeApi.HB_ShowOrHidePlaytime
        = tryResolveFunc<void (*)(int)>(
            getFunc, "HB_ShowOrHidePlaytime", nullptr);

    // Also try the non-Playtime specific Helgobox API
    g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject
        = tryResolveFunc<int (*)(void*)>(
            getFunc, "HB_FindFirstHelgoboxInstanceInProject", nullptr);

    bool available = (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject != nullptr);
    if (available) {
        fprintf(stderr, "[reaper-ipad] Playtime 2 API resolved successfully\n");
    } else {
        // Check if at least Helgobox API is available
        if (g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject) {
            fprintf(stderr, "[reaper-ipad] Helgobox API available but Playtime API not found\n");
        } else {
            fprintf(stderr, "[reaper-ipad] Playtime 2 API not available (Helgobox not registered yet?)\n");
        }
        fprintf(stderr, "[reaper-ipad] playtime: Will retry in Run() loop\n");
    }
    return available;
}

// Retry Playtime API initialization — call periodically (e.g., from Run())
// until it succeeds. This handles the case where helgobox registers
// its API functions after our extension has already started.
inline void retryPlaytimeApi()
{
    if (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject) {
        return; // already available
    }
    if (!g_playtimeGetFunc) {
        return; // no GetFunc available
    }
    initPlaytimeApi(g_playtimeGetFunc);
}

// Returns true if Playtime 2 function pointers were resolved
// (meaning Helgobox is loaded and Playtime is available).
inline bool isPlaytimeAvailable()
{
    return g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject != nullptr;
}

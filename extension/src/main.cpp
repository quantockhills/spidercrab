// IMPORTANT: reaper_plugin_functions.h must be included BEFORE SWELL headers
// to avoid min/max macro conflicts from SWELL-types.h

// Define API function pointer variables (REAPERAPI_IMPLEMENT) before any includes
// that pull in reaper plugin functions, ensuring symbols are defined in this .so
#define REAPERAPI_IMPLEMENT

// Select which API functions to load
#define REAPERAPI_MINIMAL
#define REAPERAPI_WANT_CountTracks
#define REAPERAPI_WANT_GetTrack
#define REAPERAPI_WANT_GetSelectedTrack
#define REAPERAPI_WANT_CountSelectedTracks
#define REAPERAPI_WANT_CSurf_NumTracks
#define REAPERAPI_WANT_CSurf_TrackToID
#define REAPERAPI_WANT_GetSetMediaTrackInfo
#define REAPERAPI_WANT_GetSetMediaTrackInfo_String
#define REAPERAPI_WANT_TrackFX_GetCount
#define REAPERAPI_WANT_TrackFX_AddByName
#define REAPERAPI_WANT_TrackFX_GetFXName
#define REAPERAPI_WANT_TrackFX_GetNumParams
#define REAPERAPI_WANT_TrackFX_GetParam
#define REAPERAPI_WANT_TrackFX_GetParamEx
#define REAPERAPI_WANT_TrackFX_GetParamName
#define REAPERAPI_WANT_TrackFX_GetFormattedParamValue
#define REAPERAPI_WANT_TrackFX_SetParam
#define REAPERAPI_WANT_TrackFX_Delete
#define REAPERAPI_WANT_TrackFX_CopyToTrack
#define REAPERAPI_WANT_TrackFX_GetPresetIndex
#define REAPERAPI_WANT_TrackFX_GetPreset
#define REAPERAPI_WANT_TrackFX_SetPreset
#define REAPERAPI_WANT_TrackFX_SetPresetByIndex
#define REAPERAPI_WANT_EnumInstalledFX
#define REAPERAPI_WANT_Main_OnCommand
#define REAPERAPI_WANT_CSurf_OnPlay
#define REAPERAPI_WANT_CSurf_OnStop
#define REAPERAPI_WANT_GetPlayState
#define REAPERAPI_WANT_GetProjExtState
#define REAPERAPI_WANT_SetProjExtState
#define REAPERAPI_WANT_EnumProjects
#define REAPERAPI_WANT_InsertMedia
#define REAPERAPI_WANT_EnumerateFiles
#define REAPERAPI_WANT_GetTrackStateChunk
#define REAPERAPI_WANT_SetTrackStateChunk
#define REAPERAPI_WANT_CreateMIDIOutput
#define REAPERAPI_WANT_CreateMIDIInput
#define REAPERAPI_WANT_GetMaxMidiOutputs
#define REAPERAPI_WANT_CountMediaItems
#define REAPERAPI_WANT_GetMediaItem
#define REAPERAPI_WANT_GetActiveTake
#define REAPERAPI_WANT_GetMediaItemTake_Source
#define REAPERAPI_WANT_MIDI_eventlist_Create
#define REAPERAPI_WANT_MIDI_eventlist_Destroy
#define REAPERAPI_WANT_GetPlayPosition
#define REAPERAPI_WANT_CreateNewMIDIItemInProj
#define REAPERAPI_WANT_MIDI_InsertNote
#define REAPERAPI_WANT_SetMediaItemInfo_Value
#define REAPERAPI_WANT_GetMediaItemInfo_Value
#define REAPERAPI_WANT_AddMediaItemToTrack
#define REAPERAPI_WANT_AddTakeToMediaItem
#define REAPERAPI_WANT_CountTrackMediaItems

// CRITICAL: Include winsock2.h BEFORE reaper_plugin.h (which includes windows.h).
// Without this, SOCKET type is undefined and winsock1 vs winsock2 conflicts occur.
// _WINSOCKAPI_ prevents windows.h from pulling in the old winsock.h.
#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
#endif

#include "reaper_plugin.h"
#include "reaper_plugin_functions.h"

// Undefine min/max from SWELL before C++ stdlib headers
#ifdef max
#undef max
#endif
#ifdef min
#undef min
#endif

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include <string>

// === Debug logging ===
static void DebugLog(const char* msg)
{
    fprintf(stderr, "[spidercrab] %s\n", msg);
    fflush(stderr);
}

#include "command_handler.h"
#include "websocket_server.h"
#include "frontend_server.h"
#include "playtime_api.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// ============================================================
// REAPER Extension: reaper-spidercrab
//
// A control surface extension that runs a WebSocket server
// for iPad/phone remote control of Reaper.
//
// Architecture:
//   - Registers as a REAPER control surface
//   - Runs a WebSocket server on configurable port
//   - Exposes Reaper track/FX/transport API over WebSocket
//   - React frontend connects via WebSocket for remote control
// ============================================================

// --- Global state ---
static WebSocketServer       g_wsServer;
static FrontendWebServer     g_httpServer;
static CommandHandler*       g_cmdHandler = nullptr;
static reaper_plugin_info_t* g_pluginInfo = nullptr;
static int                   g_port       = 9224; // default port (matching reamo convention)
static int                   g_httpPort   = 5173;
static bool                  g_playtimeWasAvailable = false; // Track Playtime availability across Run() polls

// MIDI feedback listener for Playtime 2 clip launcher (Issue #91)
// DEPRECATED: Replaced by OSC receiver (Issue #98)
// Kept for backward compatibility during migration.
static midi_Input*           g_midiInput  = nullptr;

// OSC feedback receiver on default port (Issue #98)
static const int             g_oscPort    = 9000;

// Helper: find the frontend dist directory relative to this extension's location
static bool FindFrontendDist(std::string& outPath)
{
#ifdef _WIN32
    HMODULE hm = nullptr;
    if (GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            (LPCSTR)&FindFrontendDist, &hm)) {
        char path[MAX_PATH] = {0};
        GetModuleFileNameA(hm, path, MAX_PATH);
        std::string spath(path);
        size_t sep = spath.find_last_of("\\");
        if (sep != std::string::npos) {
            outPath = spath.substr(0, sep) + "\\frontend";
            return true;
        }
    }
#else
    Dl_info info;
    if (dladdr((void*)&FindFrontendDist, &info)) {
        std::string spath(info.dli_fname);
        size_t sep = spath.find_last_of("/");
        if (sep != std::string::npos) {
            // Extension is in UserPlugins/, frontend is in UserPlugins/frontend/
            outPath = spath.substr(0, sep) + "/frontend";
            return true;
        }
    }
#endif
    // Fallback: try cwd/frontend/
    outPath = "frontend";
    return false;
}

// --- Our control surface implementation ---
class iPadControlSurface : public IReaperControlSurface {
public:
    iPadControlSurface() { }
    virtual ~iPadControlSurface() { }

    const char* GetTypeString() override { return "REAPER_IPAD"; }

    const char* GetDescString() override { return "Reaper iPad Remote Control"; }

    const char* GetConfigString() override
    {
        static char buf[64];
        snprintf(buf, sizeof(buf), "port=%d", g_port);
        return buf;
    }

    void Run() override
    {
        // Called ~30x/sec — drive the WebSocket + HTTP servers
        g_wsServer.Run();
        g_httpServer.run();

        // Retry Playtime API resolution if it wasn't available at init time.
        // helgobox may register its API functions after our extension starts.
        retryPlaytimeApi();

        // Periodic Playtime 2 state polling for real-time sync (Issue #43).
        // Check instance status approximately every 2 seconds (~60 Run() cycles).
        // When Playtime becomes available or unavailable, broadcast state
        // changes so the frontend can update its UI in real-time.
        {
            static int pollCounter = 0;
            pollCounter++;
            if (pollCounter >= 60) {  // ~2 seconds at 30 Hz
                pollCounter = 0;

                if (g_cmdHandler && g_wsServer.HasClients()) {
                    bool wasAvailable = g_playtimeWasAvailable;
                    bool nowAvailable = isPlaytimeAvailable();

                    if (wasAvailable != nowAvailable) {
                        g_playtimeWasAvailable = nowAvailable;
                        // Broadcast availability change event
                        std::string event = "{";
                        event += "\"type\":\"event\",";
                        event += "\"event\":\"playtime/availabilityChanged\",";
                        event += "\"payload\":{";
                        event += "\"available\":" + std::string(nowAvailable ? "true" : "false");
                        event += "}}";
                        g_wsServer.Broadcast(event);

                        fprintf(stderr,
                            "[reaper-ipad] Playtime availability changed: %s\n",
                            nowAvailable ? "available" : "unavailable");
                    }
                }
            }
        }

        // Periodic MIDI-based state sync for Playtime 2 slots (Issue #43).
        // Every ~10 seconds, query Playtime instance and broadcast
        // current matrix state to keep frontend in sync. This handles
        // the case where clips were triggered from Playtime 2 itself
        // or from another controller.
        {
            static int syncCounter = 0;
            syncCounter++;
            if (syncCounter >= 300) {  // ~10 seconds at 30 Hz
                syncCounter = 0;

                if (g_cmdHandler && g_wsServer.HasClients()) {
                    // Re-check Playtime instance to detect new matrices
                    if (isPlaytimeAvailable()) {
                        int instance = g_cmdHandler->GetPlaytimeState().findPlaytimeInstance();
                        if (instance >= 0) {
                            // Broadcast a state sync event so frontend can refresh
                            std::string event = "{";
                            event += "\"type\":\"event\",";
                            event += "\"event\":\"playtime/stateSync\",";
                            event += "\"payload\":{";
                            event += "\"instanceId\":" + std::to_string(instance) + ",";
                            event += "\"available\":true";
                            event += "}}";
                            g_wsServer.Broadcast(event);
                        }
                    }
                }
            }
        }

        // Poll MIDI feedback from Playtime 2 via ReaLearn (Issue #91 / DEPRECATED)
        // Kept for backward compatibility during migration to OSC.
        if (g_midiInput) {
            // Swap buffers to get latest MIDI events
            g_midiInput->SwapBufsPrecise(0, 0.0);
            MIDI_eventlist* evtList = g_midiInput->GetReadBuf();
            if (evtList) {
                int bpos = 0;
                MIDI_event_t* evt = evtList->EnumItems(&bpos);
                while (evt) {
                    int status = evt->midi_message[0] & 0xF0;
                    int note   = evt->midi_message[1];
                    int vel    = evt->midi_message[2];
                    if (status == 0x90 && note >= 36 && note <= 99) {
                        // This is a slot state feedback note
                        int index = note - 36;
                        int col = index % 8;
                        int row = index / 8;
                        // Map velocity to slot state
                        // ReaLearn sends: vel=0=stopped, vel=127=playing
                        if (g_cmdHandler) {
                            std::string newState = (vel >= 64) ? "playing" : "stopped";
                            g_cmdHandler->GetPlaytimeState().setSlotState(col, row, newState);
                            SlotState s = g_cmdHandler->GetPlaytimeState().getSlot(col, row);
                            g_cmdHandler->BroadcastMatrixEvent("matrix/slotStateChanged", s.toJson());
                        }
                    }
                    evt = evtList->EnumItems(&bpos);
                }
            }
        }

        // Poll OSC feedback from ReaLearn (Issue #98)
        // Non-blocking: returns immediately when no data.
        // Event-driven: zero CPU when no state changes.
        if (g_cmdHandler) {
            g_cmdHandler->PollOscReceiver();
        }

    }

    void CloseNoReset() override { g_wsServer.Stop(); g_httpServer.removeListenPort(g_httpPort); }

    // Optional: handle FX param changes from Reaper so we can push
    // updates to connected clients
    // Called by REAPER when mute/solo/arm/transport/track-list state changes.
    // Broadcast to connected clients so the frontend updates in real-time.
    void SetSurfaceMute(MediaTrack* trackid, bool mute) override
    {
        int trackIdx = CSurf_TrackToID(trackid, false) - 1;
        if (trackIdx >= 0) {
            std::string msg = "{\"type\":\"event\",";
            msg += "\"event\":\"track_state_changed\",";
            msg += "\"payload\":{";
            msg += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
            msg += "\"muted\":" + std::string(mute ? "true" : "false");
            msg += "}}";
            g_wsServer.Broadcast(msg);
        }
    }

    void SetSurfaceSolo(MediaTrack* trackid, bool solo) override
    {
        int trackIdx = CSurf_TrackToID(trackid, false) - 1;
        if (trackIdx >= 0) {
            std::string msg = "{\"type\":\"event\",";
            msg += "\"event\":\"track_state_changed\",";
            msg += "\"payload\":{";
            msg += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
            msg += "\"soloed\":" + std::string(solo ? "true" : "false");
            msg += "}}";
            g_wsServer.Broadcast(msg);
        }
    }

    void SetSurfaceRecArm(MediaTrack* trackid, bool recarm) override
    {
        int trackIdx = CSurf_TrackToID(trackid, false) - 1;
        if (trackIdx >= 0) {
            std::string msg = "{\"type\":\"event\",";
            msg += "\"event\":\"track_state_changed\",";
            msg += "\"payload\":{";
            msg += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
            msg += "\"armed\":" + std::string(recarm ? "true" : "false");
            msg += "}}";
            g_wsServer.Broadcast(msg);
        }
    }

    void SetPlayState(bool play, bool pause, bool rec) override
    {
        std::string msg = "{\"type\":\"event\",";
        msg += "\"event\":\"transport_changed\",";
        msg += "\"payload\":{";
        msg += "\"playing\":" + std::string(play ? "true" : "false") + ",";
        msg += "\"paused\":" + std::string(pause ? "true" : "false") + ",";
        msg += "\"recording\":" + std::string(rec ? "true" : "false");
        msg += "}}";
        g_wsServer.Broadcast(msg);
    }

    void SetTrackListChange() override
    {
        std::string msg = "{\"type\":\"event\",";
        msg += "\"event\":\"track_list_changed\",";
        msg += "\"payload\":{}";
        msg += "}";
        g_wsServer.Broadcast(msg);
    }

    int Extended(int call, void* parm1, void* parm2, void* parm3) override
    {
        if (call == CSURF_EXT_SETFXCHANGE) {
            // FX were added/deleted/reordered on a track
            MediaTrack* track = (MediaTrack*)parm1;
            if (track) {
                int trackIdx = CSurf_TrackToID(track, false) - 1;
                if (trackIdx >= 0) {
                    std::string msg = "{\"type\":\"event\",";
                    msg += "\"event\":\"fx_list_changed\",";
                    msg += "\"payload\":{";
                    msg += "\"trackIdx\":" + std::to_string(trackIdx);
                    msg += "}}";
                    g_wsServer.Broadcast(msg);
                }
            }
            return 1;
        }

        if (call == CSURF_EXT_SETFXPARAM) {
            // FX parameter changed (user, automation, playback)
            MediaTrack* track = (MediaTrack*)parm1;
            int packed     = parm2 ? *(int*)parm2 : 0;
            int fxIdx      = packed >> 16;
            int paramIdx   = packed & 0xFFFF;
            double value   = parm3 ? *(double*)parm3 : 0.0;
            if (track && g_cmdHandler) {
                g_cmdHandler->OnFxParamChanged(track, fxIdx, paramIdx, value);
            }
            return 1;
        }

        if (call == CSURF_EXT_SETFXENABLED) {
            // FX bypass state changed
            MediaTrack* track = (MediaTrack*)parm1;
            int fxIdx  = parm2 ? *(int*)parm2 : 0;
            int en     = parm3 ? *(int*)parm3 : 1;
            bool enabled = (en != 0);
            if (track) {
                int trackIdx = CSurf_TrackToID(track, false) - 1;
                if (trackIdx >= 0) {
                    std::string msg = "{\"type\":\"event\",";
                    msg += "\"event\":\"fx_enabled_changed\",";
                    msg += "\"payload\":{";
                    msg += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
                    msg += "\"fxIdx\":" + std::to_string(fxIdx) + ",";
                    msg += "\"enabled\":" + std::string(enabled ? "true" : "false");
                    msg += "}}";
                    g_wsServer.Broadcast(msg);
                }
            }
            return 1;
        }

        if (call == CSURF_EXT_TRACKFX_PRESET_CHANGED) {
            // FX preset changed
            MediaTrack* track = (MediaTrack*)parm1;
            int fxIdx = parm2 ? *(int*)parm2 : 0;
            if (track) {
                int trackIdx = CSurf_TrackToID(track, false) - 1;
                if (trackIdx >= 0) {
                    std::string msg = "{\"type\":\"event\",";
                    msg += "\"event\":\"fx_preset_changed\",";
                    msg += "\"payload\":{";
                    msg += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
                    msg += "\"fxIdx\":" + std::to_string(fxIdx);
                    msg += "}}";
                    g_wsServer.Broadcast(msg);
                }
            }
            return 1;
        }

        return 0;
    }
};

static iPadControlSurface* g_surface = nullptr;

// --- Idempotent core service initialization ---
static bool InitializeCoreServices()
{
    if (g_cmdHandler)
        return true; // already initialized

    g_cmdHandler = new CommandHandler(&g_wsServer);

    ReaperAPI api;
    api.CountTracks                 = CountTracks;
    api.GetTrack                    = GetTrack;
    api.GetSelectedTrack            = GetSelectedTrack;
    api.CountSelectedTracks         = CountSelectedTracks;
    api.CSurf_NumTracks             = CSurf_NumTracks;
    api.CSurf_TrackToID             = CSurf_TrackToID;
    api.GetSetMediaTrackInfo        = GetSetMediaTrackInfo;
    api.GetSetMediaTrackInfo_String = GetSetMediaTrackInfo_String;
    api.InsertMedia                 = InsertMedia;
    api.EnumerateFiles              = EnumerateFiles;
    api.TrackFX_GetCount            = TrackFX_GetCount;
    api.TrackFX_AddByName           = TrackFX_AddByName;
    api.TrackFX_GetFXName           = TrackFX_GetFXName;
    api.TrackFX_GetNumParams        = TrackFX_GetNumParams;
    api.TrackFX_GetParam            = TrackFX_GetParam;
    api.TrackFX_GetParamEx          = TrackFX_GetParamEx;
    api.TrackFX_GetParamName        = TrackFX_GetParamName;
    api.TrackFX_GetFormattedParamValue = TrackFX_GetFormattedParamValue;
    api.TrackFX_SetParam            = TrackFX_SetParam;
    api.TrackFX_Delete              = TrackFX_Delete;
    api.TrackFX_CopyToTrack         = TrackFX_CopyToTrack;
    api.TrackFX_GetPresetIndex      = TrackFX_GetPresetIndex;
    api.TrackFX_GetPreset          = TrackFX_GetPreset;
    api.TrackFX_SetPreset           = TrackFX_SetPreset;
    api.TrackFX_SetPresetByIndex   = TrackFX_SetPresetByIndex;
    api.EnumInstalledFX             = EnumInstalledFX;
    api.GetTrackStateChunk          = GetTrackStateChunk;
    api.SetTrackStateChunk          = SetTrackStateChunk;
    api.Main_OnCommand              = Main_OnCommand;
    api.CSurf_OnPlay                = CSurf_OnPlay;
    api.CSurf_OnStop                = CSurf_OnStop;
    api.GetPlayState                = GetPlayState;
    g_cmdHandler->SetApi(api);

    // Pre-cache FX list at startup, before any WebSocket client
    // connects. This avoids a crash when EnumInstalledFX is called
    // from a Chromium WebSocket context (X11/SWELL display conflict).
    g_cmdHandler->PreCacheFX();

    // Initialize Playtime 2 API (resolves HB_* function pointers)
    if (g_pluginInfo) {
        initPlaytimeApi(g_pluginInfo->GetFunc);
    }

    // Set up MIDI output for Playtime clip launcher
    // The midi_Output pointer is created once and captured by the lambda.
    // Playtime 2 C API has no clip-triggering functions — matrix commands
    // must work via MIDI notes sent to the Playtime 2 virtual MIDI input.
    // CreateMIDIOutput(dev=0, outbus=1, midiMapConfig=nullptr) creates a
    // virtual MIDI output that Playtime 2 can listen to on the first output bus.
    if (CreateMIDIOutput) {
        midi_Output* midiOut = CreateMIDIOutput(0, 1, nullptr);
        if (midiOut) {
            fprintf(stderr, "[reaper-ipad] MIDI output initialized for Playtime clip launcher\n");
            g_cmdHandler->GetMidi().setSendFunc([midiOut](int status, int d1, int d2) {
                midiOut->Send(status, d1, d2, -1);
            });
        } else {
            fprintf(stderr, "[reaper-ipad] MIDI output creation failed (no devices?)\n");
        }
    } else {
        fprintf(stderr, "[reaper-ipad] MIDI output not available (CreateMIDIOutput not resolved)\n");
    }

    // Initialize OSC sender for ReaLearn integration (Issue #98)
    g_cmdHandler->GetOscSender().setRemotePort(g_oscPort);
    g_cmdHandler->GetOscSender().setRemoteAddress("127.0.0.1");

    // Initialize OSC receiver for ReaLearn feedback (Issue #98)
    // Registers callback to update Playtime slot state when OSC feedback arrives.
    g_cmdHandler->GetOscReceiver().setSlotStateCallback(
        [](int col, int row, const std::string& state) {
            if (g_cmdHandler) {
                g_cmdHandler->GetPlaytimeState().setSlotState(col, row, state);
                SlotState s = g_cmdHandler->GetPlaytimeState().getSlot(col, row);
                g_cmdHandler->BroadcastMatrixEvent("matrix/slotStateChanged", s.toJson());
            }
        });

    // Try to bind OSC receiver. If port 9000 is taken, falls back to next available.
    if (!g_cmdHandler->GetOscReceiver().bind(g_oscPort)) {
        fprintf(stderr, "[reaper-ipad] WARNING: OSC receiver bind failed on port %d\n"
                        "           ReaLearn feedback will not work.\n"
                        "           Check if another service is using this port.\n",
            g_oscPort);
    } else {
        fprintf(stderr, "[reaper-ipad] OSC receiver listening on port %d\n",
            g_cmdHandler->GetOscReceiver().port());
    }

    // Set up WebSocket message handler
    g_wsServer.SetMessageCallback([](int clientId, const std::string& msg) {
        if (g_cmdHandler) {
            g_cmdHandler->HandleMessage(clientId, msg);
        }
    });

    return true;
}

// --- Idempotent network server startup ---
static bool StartNetworkServers()
{
    if (g_surface)
        return true; // already started

    g_surface = new iPadControlSurface();

    // Start WebSocket server
    bool ok = g_wsServer.Start(g_port);
    if (!ok) {
        for (int p = g_port + 1; p < g_port + 10; p++) {
            if (g_wsServer.Start(p)) {
                g_port = p;
                ok     = true;
                break;
            }
        }
    }

    if (ok) {
        fprintf(stderr, "[reaper-ipad] WebSocket server started on port %d\n", g_port);
    } else {
        fprintf(stderr, "[reaper-ipad] Failed to start WebSocket server\n");
    }

    // Start HTTP server for frontend
    std::string frontendPath;
    FindFrontendDist(frontendPath);
    g_httpServer.SetWebRoot(frontendPath);

    int httpResult = g_httpServer.addListenPort(g_httpPort);
    if (httpResult == 0) {
        fprintf(stderr, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
    } else {
        fprintf(stderr, "[spidercrab] HTTP server port %d bind failed: %d\n", g_httpPort, httpResult);
        g_httpPort = g_httpPort + 1;
        int httpResult2 = g_httpServer.addListenPort(g_httpPort);
        if (httpResult2 == 0) {
            fprintf(stderr, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
        } else {
            fprintf(stderr, "[spidercrab] HTTP server port %d also failed: %d\n", g_httpPort, httpResult2);
        }
    }

    return ok;
}

// --- Control surface registration ---
static reaper_csurf_reg_t g_csurfReg = { "REAPER_IPAD", "Reaper iPad Remote Control (WebSocket)",
    // create function
    [](const char* type_string, const char* configString, int* errStats) -> IReaperControlSurface* {
        if (strcmp(type_string, "REAPER_IPAD"))
            return nullptr;

        InitializeCoreServices();
        StartNetworkServers();
        return g_surface;
    },
    // ShowConfig (optional - we don't need a config dialog yet)
    [](const char* type_string, HWND parent, const char* initConfigString) -> HWND {
        return nullptr;
    } };

// ============================================================
// REAPER Plugin Entry Point
// ============================================================
extern "C" {

REAPER_PLUGIN_DLL_EXPORT int REAPER_PLUGIN_ENTRYPOINT(
    REAPER_PLUGIN_HINSTANCE hInstance, reaper_plugin_info_t* rec)
{
    DebugLog("Entry point called");
    
    if (!rec) {
        DebugLog("Plugin unload");
        g_wsServer.Stop();
        g_httpServer.removeListenPort(g_httpPort);
        JNL::close_socketlib();
        delete g_cmdHandler;
        g_cmdHandler = nullptr;
        delete g_surface;
        g_surface = nullptr;
        return 0;
    }

    DebugLog("API version check");
    if (rec->caller_version != REAPER_PLUGIN_VERSION) {
        return 0;
    }

    JNL::open_socketlib();

    g_pluginInfo = rec;

    int loadResult = REAPERAPI_LoadAPI(rec->GetFunc);
    if (loadResult != 0) {
        char buf[256];
        snprintf(buf, sizeof(buf), "Failed to load API: %d", loadResult);
        DebugLog(buf);
        return 0;
    }

    DebugLog("API loaded successfully");

    // Read port from ExtState (persistent config)
    char portStr[32] = { 0 };
    int  gotPort     = GetProjExtState
        ? GetProjExtState(nullptr, "REAPER_IPAD", "port", portStr, (int)sizeof(portStr))
        : 0;
    if (gotPort > 0) {
        int p = atoi(portStr);
        if (p > 0 && p < 65536)
            g_port = p;
    }

    // 1. Initialize core services (cmd handler, PreCacheFX, Playtime, MIDI, WS callback)
    InitializeCoreServices();

    // 2. Register the control surface type (appears in Reaper prefs)

    rec->Register("csurf", &g_csurfReg);

    // 3. Create surface + start servers + register instance
    StartNetworkServers();
    rec->Register("csurf_inst", g_surface);

    // 4. Save extstate for next launch
    if (SetProjExtState) {
        char portBuf[16];
        snprintf(portBuf, sizeof(portBuf), "%d", g_port);
        SetProjExtState(nullptr, "REAPER_IPAD", "port", portBuf);
    }

    fprintf(stderr, "[reaper-ipad] Extension loaded successfully\n");

    return 1; // Success
}

} // extern "C"

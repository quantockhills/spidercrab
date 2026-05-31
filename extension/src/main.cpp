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
#define REAPERAPI_WANT_TrackFX_SetParam
#define REAPERAPI_WANT_TrackFX_Delete
#define REAPERAPI_WANT_TrackFX_CopyToTrack
#define REAPERAPI_WANT_TrackFX_GetPresetIndex
#define REAPERAPI_WANT_TrackFX_SetPreset
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

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// ============================================================
// REAPER Extension: reaper-ipad-ext
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
        static int rcnt; if ((++rcnt % 30) == 1) DebugLog("Run() tick");
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

// --- Control surface registration ---
static reaper_csurf_reg_t g_csurfReg = { "REAPER_IPAD", "Reaper iPad Remote Control (WebSocket)",
    // create function
    [](const char* type_string, const char* configString, int* errStats) -> IReaperControlSurface* {
        if (strcmp(type_string, "REAPER_IPAD"))
            return nullptr;

        if (!g_surface) {
            g_surface = new iPadControlSurface();

            // Start WebSocket server
            bool ok = g_wsServer.Start(g_port);
            if (!ok) {
                // Try next ports
                for (int p = g_port + 1; p < g_port + 10; p++) {
                    if (g_wsServer.Start(p)) {
                        g_port = p;
                        ok     = true;
                        break;
                    }
                }
            }

            if (ok) {
                char msg[256];
                snprintf(msg, sizeof(msg),
                    "[reaper-ipad] WebSocket server started on port %d\n"
                    "[reaper-ipad] Connect at ws://<your-ip>:%d\n",
                    g_port, g_port);
                fprintf(stderr, msg);
            } else {
                fprintf(stderr, "[reaper-ipad] Failed to start WebSocket server\n");
            }

            // Start HTTP server for frontend
            std::string frontendPath;
            FindFrontendDist(frontendPath);
            fprintf(stderr, "[reaper-ipad] Frontend path: %s\n", frontendPath.c_str());
            g_httpServer.SetWebRoot(frontendPath);
            fprintf(stderr, "[spidercrab] Frontend path set: %s\n", frontendPath.c_str());
            fflush(stderr);
            int httpResult = g_httpServer.addListenPort(g_httpPort);
            fprintf(stderr, "[spidercrab] addListenPort returned: %d\n", httpResult);
            if (httpResult == 0) {
                fprintf(stderr, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
            } else {
                fprintf(stderr, "[spidercrab] HTTP server port %d bind failed: %d\n", g_httpPort, httpResult);
            }
            fflush(stderr);
            if (httpResult != 0) {
                g_httpPort = g_httpPort + 1;
                int httpResult2 = g_httpServer.addListenPort(g_httpPort);
                fprintf(stderr, "[spidercrab] addListenPort(port+1) returned: %d\n", httpResult2);
                if (httpResult2 == 0) {
                    fprintf(stderr, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
                } else {
                    fprintf(stderr, "[spidercrab] HTTP server port %d also failed: %d\n", g_httpPort, httpResult2);
                }
                fflush(stderr);
            }
        }

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

    // Set up command handler
    if (!g_cmdHandler) {
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
        api.TrackFX_SetParam            = TrackFX_SetParam;
        api.TrackFX_Delete              = TrackFX_Delete;
        api.TrackFX_CopyToTrack         = TrackFX_CopyToTrack;
        api.TrackFX_GetPresetIndex      = TrackFX_GetPresetIndex;
        api.TrackFX_SetPreset           = TrackFX_SetPreset;
        api.EnumInstalledFX             = EnumInstalledFX;
        api.Main_OnCommand              = Main_OnCommand;
        api.CSurf_OnPlay                = CSurf_OnPlay;
        api.CSurf_OnStop                = CSurf_OnStop;
        api.GetPlayState                = GetPlayState;
        g_cmdHandler->SetApi(api);

        // Pre-cache FX list at startup, before any WebSocket client
        // connects. This avoids a crash when EnumInstalledFX is called
        // from a Chromium WebSocket context (X11/SWELL display conflict).
        g_cmdHandler->PreCacheFX();
    }

    // Set up WebSocket message handler
    g_wsServer.SetMessageCallback([&](int clientId, const std::string& msg) {
        if (g_cmdHandler) {
            g_cmdHandler->HandleMessage(clientId, msg);
        }
    });

    // Register the control surface TYPE (appears in Reaper prefs)
    rec->Register("csurf", &g_csurfReg);

    // Create the surface instance directly and register it immediately.
    // Without this, Reaper only creates the surface when the user manually
    // adds it in Preferences -> Control/OSC/Web.
    if (!g_surface) {
        g_surface = new iPadControlSurface();

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
        fprintf(stderr, "[reaper-ipad] Frontend path: %s\n", frontendPath.c_str());
        g_httpServer.SetWebRoot(frontendPath);
        {
            const char* tmp = getenv("TEMP");
            if (!tmp) tmp = getenv("TMP");
            if (!tmp) tmp = "C:\\";
            char logpath[512];
            snprintf(logpath, sizeof(logpath), "%s\\http_debug.txt", tmp);
            FILE* logf = fopen(logpath, "w");
            if (logf) {
                fprintf(logf, "[spidercrab] Frontend path set: %s\n", frontendPath.c_str());
                fflush(logf);
                int httpResult = g_httpServer.addListenPort(g_httpPort);
                fprintf(logf, "[spidercrab] addListenPort returned: %d\n", httpResult);
                if (httpResult == 0) {
                    fprintf(logf, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
                } else {
                    fprintf(logf, "[spidercrab] HTTP server port %d bind failed: %d\n", g_httpPort, httpResult);
                    g_httpPort = g_httpPort + 1;
                    int httpResult2 = g_httpServer.addListenPort(g_httpPort);
                    fprintf(logf, "[spidercrab] addListenPort(port+1) returned: %d\n", httpResult2);
                    if (httpResult2 == 0) {
                        fprintf(logf, "[spidercrab] HTTP server started on port %d\n", g_httpPort);
                    } else {
                        fprintf(logf, "[spidercrab] HTTP server port %d also failed: %d\n", g_httpPort, httpResult2);
                    }
                }
                fflush(logf);
                fclose(logf);
            } else {
                fprintf(stderr, "[spidercrab] FAILED fopen(%s): errno=%d\n", logpath, errno);
                fflush(stderr);
            }
        }
    }

    rec->Register("csurf_inst", g_surface);

    // Pre-cache FX list at startup (runs only once, before any WS client)
    if (g_cmdHandler) {
        g_cmdHandler->PreCacheFX();
    }

    // Save extstate for next launch
    if (SetProjExtState) {
        char portStr[16];
        snprintf(portStr, sizeof(portStr), "%d", g_port);
        SetProjExtState(nullptr, "REAPER_IPAD", "port", portStr);
    }

    fprintf(stderr, "[reaper-ipad] Extension loaded successfully\n");

    return 1; // Success
}

} // extern "C"

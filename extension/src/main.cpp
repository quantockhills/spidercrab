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
#define REAPERAPI_WANT_GetProjExtState
#define REAPERAPI_WANT_SetProjExtState
#define REAPERAPI_WANT_EnumProjects

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

#include "command_handler.h"
#include "websocket_server.h"

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
static CommandHandler*       g_cmdHandler = nullptr;
static reaper_plugin_info_t* g_pluginInfo = nullptr;
static int                   g_port       = 9224; // default port (matching reamo convention)

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
        // Called ~30x/sec — drive the WebSocket server
        g_wsServer.Run();
    }

    void CloseNoReset() override { g_wsServer.Stop(); }

    // Optional: handle FX param changes from Reaper so we can push
    // updates to connected clients
    int Extended(int call, void* parm1, void* parm2, void* parm3) override
    {
        if (call == CSURF_EXT_SETFXCHANGE) {
            // FX were added/deleted/reordered
            // Could broadcast to clients
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
    if (!rec) {
        // Plugin unload
        g_wsServer.Stop();
        delete g_cmdHandler;
        g_cmdHandler = nullptr;
        delete g_surface;
        g_surface = nullptr;
        return 0;
    }

    // Check version compatibility
    if (rec->caller_version != REAPER_PLUGIN_VERSION) {
        return 0;
    }

    g_pluginInfo = rec;

    int loadResult = REAPERAPI_LoadAPI(rec->GetFunc);
    if (loadResult != 0) {
        char buf[256];
        snprintf(buf, sizeof(buf), "[reaper-ipad] Failed to load API: %d\n", loadResult);
        fprintf(stderr, buf);
        return 0;
    }

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
        g_cmdHandler->SetApi(api);
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
    }

    rec->Register("csurf_inst", g_surface);


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

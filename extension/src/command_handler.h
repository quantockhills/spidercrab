#pragma once
#include "websocket_server.h"
#include <functional>
#include <map>
#include <string>

// Forward declare REAPER types (included from reaper_plugin.h)
struct MediaTrack;
struct ReaProject;

// Reaper API function pointers (loaded via REAPERAPI_LoadAPI)
struct ReaperAPI {
    // Track functions
    int (*CountTracks)(ReaProject* proj)                       = nullptr;
    MediaTrack* (*GetTrack)(ReaProject* proj, int idx)         = nullptr;
    MediaTrack* (*GetSelectedTrack)(ReaProject* proj, int idx) = nullptr;
    int (*CountSelectedTracks)(ReaProject* proj)               = nullptr;
    int (*CSurf_NumTracks)(bool mcpView)                       = nullptr;
    int (*CSurf_TrackToID)(MediaTrack* track, bool mcpView)    = nullptr;
    void* (*GetSetMediaTrackInfo)(MediaTrack* tr, const char* parmname, void* setNewValue)
        = nullptr;
    bool (*GetSetMediaTrackInfo_String)(MediaTrack* tr, const char* parmname, char* setNewValue,
        bool setNewValue_isAllowed) = nullptr;

    // FX functions
    bool (*EnumInstalledFX)(int index, const char** nameOut, const char** identOut) = nullptr;
    int (*TrackFX_GetCount)(MediaTrack* track) = nullptr;
    int (*TrackFX_AddByName)(MediaTrack* track, const char* fxname, bool recFX, int instantiate)
        = nullptr;
    bool (*TrackFX_GetFXName)(MediaTrack* track, int fx, char* bufOut, int bufOut_sz) = nullptr;
    int (*TrackFX_GetNumParams)(MediaTrack* track, int fx)                            = nullptr;
    double (*TrackFX_GetParam)(
        MediaTrack* track, int fx, int param, double* minvalOut, double* maxvalOut) = nullptr;
    double (*TrackFX_GetParamEx)(MediaTrack* track, int fx, int param, double* minvalOut,
        double* maxvalOut, double* midvalOut)                                       = nullptr;
    bool (*TrackFX_GetParamName)(MediaTrack* track, int fx, int param, char* bufOut, int bufOut_sz)
        = nullptr;
    bool (*TrackFX_SetParam)(MediaTrack* track, int fx, int param, double val)        = nullptr;
    bool (*TrackFX_Delete)(MediaTrack* track, int fx)                                 = nullptr;
    void (*TrackFX_CopyToTrack)(MediaTrack* src_track, int src_fx, MediaTrack* dest_track,
        int dest_fx, bool is_move)                                                    = nullptr;
    int (*TrackFX_GetPresetIndex)(MediaTrack* track, int fx, int* numberOfPresetsOut) = nullptr;
    bool (*TrackFX_SetPreset)(MediaTrack* track, int fx, const char* presetname)      = nullptr;

    // Transport
    void (*Main_OnCommand)(int command, int flag) = nullptr;
    void (*CSurf_OnPlay)() = nullptr;
    void (*CSurf_OnStop)() = nullptr;
    int (*GetPlayState)() = nullptr;

    // Media/sample
    int (*InsertMedia)(const char* file, int mode) = nullptr;
    const char* (*EnumerateFiles)(const char* path, int fileindex) = nullptr;
};

class CommandHandler {
public:
    using ResponseCallback = std::function<void(int clientId, const std::string& response)>;

    CommandHandler(WebSocketServer* ws);
    ~CommandHandler();

    void SetApi(const ReaperAPI& api) { m_api = api; }
    void SetResponseCallback(ResponseCallback cb) { m_responseCb = cb; }

    // Handle an incoming JSON command
    void HandleMessage(int clientId, const std::string& message);

    // Format a JSON response string (public for testing)
    static std::string FormatResponse(const std::string& id, bool success, const std::string& payload);

private:
    WebSocketServer* m_ws;
    ReaperAPI        m_api;
    ResponseCallback m_responseCb;

    // Send a JSON response to a client
    void SendResponse(
        int clientId, const std::string& id, bool success, const std::string& payload);

    // Command handlers — transport
    void HandleGetTransport(int clientId, const std::string& id, const std::string& params);
    void HandlePlay(int clientId, const std::string& id, const std::string& params);
    void HandleStop(int clientId, const std::string& id, const std::string& params);

    // Command handlers — tracks
    void HandleAddTrack(int clientId, const std::string& id, const std::string& params);
    void HandleGetTracks(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackMute(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackSolo(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackArm(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackSelected(int clientId, const std::string& id, const std::string& params);

    // Command handlers — sample/media
    void HandleSampleGetDirectory(int clientId, const std::string& id, const std::string& params);
    void HandleSampleSendToTrack(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX
    void HandleEnumerateFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetTrackFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetFXParams(int clientId, const std::string& id, const std::string& params);
    void HandleSetFXParam(int clientId, const std::string& id, const std::string& params);
    void HandleAddFX(int clientId, const std::string& id, const std::string& params);
    void HandleDeleteFX(int clientId, const std::string& id, const std::string& params);
};

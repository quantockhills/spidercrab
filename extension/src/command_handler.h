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

private:
    WebSocketServer* m_ws;
    ReaperAPI        m_api;
    ResponseCallback m_responseCb;

    // Send a JSON response to a client
    void SendResponse(
        int clientId, const std::string& id, bool success, const std::string& payload);

    // Command handlers
    void HandleGetTracks(int clientId, const std::string& id, const std::string& params);
    void HandleGetTrackFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetFXParams(int clientId, const std::string& id, const std::string& params);
    void HandleSetFXParam(int clientId, const std::string& id, const std::string& params);
    void HandleAddFX(int clientId, const std::string& id, const std::string& params);
    void HandleDeleteFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetTransport(int clientId, const std::string& id, const std::string& params);
    void HandlePlay(int clientId, const std::string& id, const std::string& params);
    void HandleStop(int clientId, const std::string& id, const std::string& params);
};

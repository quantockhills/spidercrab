#pragma once
#include "websocket_server.h"
#include "playtime_api.h"
#include "playtime_state.h"
#include "playtime_midi.h"
#include "sequencer_state.h"
#include <functional>
#include <map>
#include <mutex>
#include <string>

// Forward declare REAPER types — must match reaper_plugin.h which uses 'class',
// not 'struct'. MSVC ABI mangles them differently causing linker errors.
class MediaTrack;
class ReaProject;

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
    bool (*TrackFX_GetFormattedParamValue)(MediaTrack* track, int fx, int param, char* bufOut, int bufOut_sz) = nullptr;
    bool (*TrackFX_Delete)(MediaTrack* track, int fx)                                 = nullptr;
    void (*TrackFX_CopyToTrack)(MediaTrack* src_track, int src_fx, MediaTrack* dest_track,
        int dest_fx, bool is_move)                                                    = nullptr;
    int (*TrackFX_GetPresetIndex)(MediaTrack* track, int fx, int* numberOfPresetsOut) = nullptr;
    bool (*TrackFX_GetPreset)(MediaTrack* track, int fx, char* presetnameOut, int presetnameOut_sz) = nullptr;
    bool (*TrackFX_SetPreset)(MediaTrack* track, int fx, const char* presetname)      = nullptr;
    bool (*TrackFX_SetPresetByIndex)(MediaTrack* track, int fx, int idx)              = nullptr;

    // Transport
    void (*Main_OnCommand)(int command, int flag) = nullptr;
    void (*CSurf_OnPlay)() = nullptr;
    void (*CSurf_OnStop)() = nullptr;
    void (*CSurf_OnRecord)() = nullptr;
    int (*GetPlayState)() = nullptr;

    // Media/sample
    int (*InsertMedia)(const char* file, int mode) = nullptr;
    const char* (*EnumerateFiles)(const char* path, int fileindex) = nullptr;

    // Track state chunk (for FX chain save/load)
    bool (*GetTrackStateChunk)(MediaTrack* track, char* strNeedBig, int strNeedBig_sz, bool isundoOptional)
        = nullptr;
    bool (*SetTrackStateChunk)(MediaTrack* track, const char* str, bool isundoOptional) = nullptr;
};

class CommandHandler {
public:
    using ResponseCallback = std::function<void(int clientId, const std::string& response)>;
    using BroadcastCallback = std::function<void(const std::string& message)>;

    CommandHandler(WebSocketServer* ws);
    ~CommandHandler();

    void SetApi(const ReaperAPI& api) { m_api = api; }
    void SetResponseCallback(ResponseCallback cb) { m_responseCb = cb; }
    void SetBroadcastCallback(BroadcastCallback cb) { m_broadcastCb = cb; }

    // Handle an incoming JSON command
    void HandleMessage(int clientId, const std::string& message);

    // Format a JSON response string (public for testing)
    static std::string FormatResponse(const std::string& id, bool success, const std::string& payload);

    // Access the MIDI output helper (for setting up send function at startup)
    PlaytimeMidi& GetMidi() { return m_playtimeMidi; }

    // Access the playtime state (for tests)
    PlaytimeState& GetPlaytimeState() { return m_playtimeState; }

    // Pre-populate FX cache at extension startup (avoids crash when
    // EnumInstalledFX is called from Chromium WS context due to X11/SWELL
    // display conflict). Safe to call before any WebSocket client connects.
    void PreCacheFX();

    // Real-time event broadcasting (Issue #57)
    // Broadcast a track state change event (mute/solo/arm/volume) to all WS clients
    void BroadcastTrackEvent(const std::string& eventType, int trackIdx, bool value);
    void BroadcastTrackEvent(const std::string& eventType, int trackIdx, double value);

    // Broadcast a matrix slot state change event to all WS clients
    void BroadcastMatrixEvent(const std::string& eventType, const std::string& slotJson);

    // Build a WebSocket event JSON string for a slot state change
    std::string BuildSlotEvent(const std::string& slotJson);

    // Real-time FX param change via CSURF_EXT callback (Issue #58)
    void OnFxParamChanged(MediaTrack* track, int fxIdx, int paramIdx, double value);
    void SetWatchedFX(int trackIdx, int fxIdx);
    void ClearWatchedFX();

private:
    WebSocketServer*  m_ws;
    ReaperAPI         m_api;
    ResponseCallback  m_responseCb;
    BroadcastCallback m_broadcastCb;
    std::mutex        m_apiMutex;  // Serialize Reaper API calls to prevent race conditions

    // FX enumeration cache (EnumInstalledFX takes ~35s)
    std::string m_fxCache;
    bool        m_fxCacheValid = false;

    // Watched FX for callback-based param change filtering (Issue #58)
    int         m_watchedTrackIdx = -1;
    int         m_watchedFxIdx    = -1;

    // Playtime 2 clip launcher state (Issues #61)
    PlaytimeState m_playtimeState;
    PlaytimeMidi  m_playtimeMidi;

    // Step sequencer state (Issue #63)
    SequencerState m_sequencerState;

    // Track the last param we set ourselves, so we can suppress
    // REAPER's OnFxParamChanged talkback (Issue #73)
    struct { int trackIdx; int fxIdx; int paramIdx; } m_lastSetParam = {-1, -1, -1};

    // Run the actual EnumInstalledFX loop (no response, just populate cache)
    // Returns the JSON string of the FX list
    std::string RunFXEnumeration();

    // Send a JSON response to a client
    void SendResponse(
        int clientId, const std::string& id, bool success, const std::string& payload);

    // Command handlers — transport
    void HandleGetTransport(int clientId, const std::string& id, const std::string& params);
    void HandlePlay(int clientId, const std::string& id, const std::string& params);
    void HandleStop(int clientId, const std::string& id, const std::string& params);
    void HandleRecord(int clientId, const std::string& id, const std::string& params);

    // Command handlers — tracks
    void HandleAddTrack(int clientId, const std::string& id, const std::string& params);
    void HandleGetTracks(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackMute(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackSolo(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackArm(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackSelected(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackVolume(int clientId, const std::string& id, const std::string& params);
    void HandleSetTrackPan(int clientId, const std::string& id, const std::string& params);

    // Command handlers — sample/media
    void HandleSampleGetDirectory(int clientId, const std::string& id, const std::string& params);
    void HandleSampleSendToTrack(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX chain save/load (Issue #7)
    void HandleFxChainGetDirectory(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainSave(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainLoad(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainGetInfo(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX
    void HandleEnumerateFX(int clientId, const std::string& id, const std::string& params);
    void HandleRefreshFxCache(int clientId, const std::string& id, const std::string& params);
    void HandleGetTrackFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetFXParams(int clientId, const std::string& id, const std::string& params);
    void HandleSetFXParam(int clientId, const std::string& id, const std::string& params);
    void HandleAddFX(int clientId, const std::string& id, const std::string& params);
    void HandleDeleteFX(int clientId, const std::string& id, const std::string& params);
    void HandleReorderFX(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX presets
    void HandleGetFxPreset(int clientId, const std::string& id, const std::string& params);
    void HandleSetFxPreset(int clientId, const std::string& id, const std::string& params);
    void HandleGetAllFxPresetNames(int clientId, const std::string& id, const std::string& params);

    // Command handlers — Playtime 2 / clip matrix
    void HandleMatrixGetAll(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixGetSlot(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixTriggerSlot(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixTriggerScene(int clientId, const std::string& id, const std::string& params);

    // Command handlers — step sequencer (Issue #63)
    void HandleSequencerGetAll(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerToggleStep(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetStep(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerClearAll(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetLength(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetBaseNote(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerGetPlayhead(int clientId, const std::string& id, const std::string& params);
};

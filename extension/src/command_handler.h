#pragma once
#include "websocket_server.h"
#include "fxchain_cache.h"
#include "sample_cache.h"
#include "playtime_api.h"
#include "playtime_state.h"
#include "playtime_midi.h"
#include "osc_sender.h"
#include "osc_receiver.h"
#include "sequencer_state.h"
#include "fx_tags.h"
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

// Forward declare REAPER types — must match reaper_plugin.h which uses 'class',
// not 'struct'. MSVC ABI mangles them differently causing linker errors.
class MediaTrack;
class ReaProject;
class MediaItem;
class MediaItem_Take;
class PCM_source;
class MIDI_eventlist;

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
    bool (*fxGetEnabled)(MediaTrack* track, int fx)                                 = nullptr;
    void (*fxSetEnabled)(MediaTrack* track, int fx, bool enabled)                   = nullptr;
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
    PCM_source* (*PCM_Source_CreateFromFile)(const char* filename) = nullptr;
    int (*PlayPreview)(void* preview) = nullptr;
    int (*StopPreview)(void* preview) = nullptr;
    double (*GetMediaSourceLength)(PCM_source* source, bool* lengthIsQNOut) = nullptr;
    int (*GetMediaSourceSampleRate)(PCM_source* source) = nullptr;
    int (*GetMediaSourceNumChannels)(PCM_source* source) = nullptr;

    // Track state chunk (for FX chain save/load)
    bool (*GetTrackStateChunk)(MediaTrack* track, char* strNeedBig, int strNeedBig_sz, bool isundoOptional)
        = nullptr;
    bool (*SetTrackStateChunk)(MediaTrack* track, const char* str, bool isundoOptional) = nullptr;

    // MIDI recording functions (Issue #90)
    int (*CountMediaItems)(ReaProject* proj) = nullptr;
    MediaItem* (*GetMediaItem)(ReaProject* proj, int itemidx) = nullptr;
    MediaItem_Take* (*GetActiveTake)(MediaItem* item) = nullptr;
    PCM_source* (*GetMediaItemTake_Source)(MediaItem_Take* take) = nullptr;
    MIDI_eventlist* (*MIDI_eventlist_Create)() = nullptr;
    void (*MIDI_eventlist_Destroy)(MIDI_eventlist* evtlist) = nullptr;
    double (*GetPlayPosition)() = nullptr;

    // MIDI item creation functions (Issue #92 — convert sequencer to clip)
    MediaItem* (*CreateNewMIDIItemInProj)(MediaTrack* track, double starttime, double endtime, const bool* qnInOptional) = nullptr;
    bool (*MIDI_InsertNote)(MediaItem_Take* take, bool selected, bool muted, double startppqpos, double endppqpos, int chan, int pitch, int vel, const bool* noSortInOptional) = nullptr;
    bool (*SetMediaItemInfo_Value)(MediaItem* item, const char* parmname, double newvalue) = nullptr;
    double (*GetMediaItemInfo_Value)(MediaItem* item, const char* parmname) = nullptr;
    MediaItem* (*AddMediaItemToTrack)(MediaTrack* tr) = nullptr;
    MediaItem_Take* (*AddTakeToMediaItem)(MediaItem* item) = nullptr;
    int (*CountTrackMediaItems)(MediaTrack* track) = nullptr;
};

class CommandHandler {
public:
    using HandlerFn = void (CommandHandler::*)(int clientId, const std::string& id, const std::string& rawMessage);
    using ResponseCallback = std::function<void(int clientId, const std::string& response)>;
    using BroadcastCallback = std::function<void(const std::string& message)>;

    CommandHandler(WebSocketServer* ws);
    ~CommandHandler();

    void SetApi(const ReaperAPI& api) { m_api = api; }
    void SetConfigDir(const std::string& dir);
    void SetResponseCallback(ResponseCallback cb) { m_responseCb = cb; }
    void SetBroadcastCallback(BroadcastCallback cb) { m_broadcastCb = cb; }

    // Handle an incoming JSON command
    void HandleMessage(int clientId, const std::string& message);

    // Format a JSON response string (public for testing)
    static std::string FormatResponse(const std::string& id, bool success, const std::string& payload);

    // Access the MIDI output helper (for setting up send function at startup)
    PlaytimeMidi& GetMidi() { return m_playtimeMidi; }

    // Access the OSC sender and receiver
    OscSender& GetOscSender() { return m_oscSender; }
    OscReceiver& GetOscReceiver() { return m_oscReceiver; }

    // Poll the OSC receiver for incoming feedback
    void PollOscReceiver() { m_oscReceiver.poll(); }

    // Access the FX tag storage (for testing)
    FxTagStorage& GetFxTagStorage() { return m_fxTagStorage; }

    // Access the playtime state (for tests)
    PlaytimeState& GetPlaytimeState() { return m_playtimeState; }

    // Current preview state (host-side playback via PlayPreview/StopPreview)
    // Uses void* to avoid depending on preview_register_t in the header.
    // In .cpp, cast to preview_register_t* when using.
    void* m_previewReg = nullptr;

    // Main-thread deferred operations queue.
    // WebSocket handlers enqueue lambdas here; DrainPendingOps() runs them
    // on REAPER's main thread via Run(). Required for APIs like PlayPreview
    // and SetTrackStateChunk that are not safe to call from background threads.
    void QueueMainThread(std::function<void()> op);
    void DrainPendingOps();

    // Pre-populate FX cache at extension startup (avoids crash when
    // EnumInstalledFX is called from Chromium WS context due to X11/SWELL
    // display conflict). Safe to call before any WebSocket client connects.
    void PreCacheFX();

    // Pre-build FX chain index at startup. Safe to call before WebSocket client connects.
    void PreCacheFxChains(const std::string& rootPath);

    // Called from Run() each cycle: drains one batch of the sample cache scan (if active).
    void TickSampleCache();

    // Access the FX chain cache (for testing)
    FxChainCache& GetFxChainCache() { return m_fxChainCache; }

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
    std::mutex        m_apiMutex;       // Serialize Reaper API calls to prevent race conditions
    std::mutex        m_pendingMutex;   // Guards m_pendingOps
    std::vector<std::function<void()>> m_pendingOps;

    // FX enumeration cache (EnumInstalledFX takes ~35s)
    std::string m_fxCache;
    bool        m_fxCacheValid = false;

    // Watched FX for callback-based param change filtering (Issue #58)
    int         m_watchedTrackIdx = -1;
    int         m_watchedFxIdx    = -1;

    // Command dispatch map: command string → handler method
    std::unordered_map<std::string, HandlerFn> m_commandMap;

    // Playtime 2 clip launcher state (Issues #61)
    PlaytimeState m_playtimeState;
    PlaytimeMidi  m_playtimeMidi;
    OscSender     m_oscSender;
    OscReceiver   m_oscReceiver;

    // Step sequencer state (Issue #63)
    SequencerState m_sequencerState;

    // Track the last param we set ourselves, so we can suppress
    // REAPER's OnFxParamChanged talkback (Issue #73)
    struct { int trackIdx; int fxIdx; int paramIdx; } m_lastSetParam = {-1, -1, -1};

    // FX/chain tag storage (Issue #97)
    FxTagStorage m_fxTagStorage;

    // FX chain cache (Issue #103)
    FxChainCache m_fxChainCache;

    // Sample directory cache (built on-demand via sample/refreshCache)
    SampleCache m_sampleCache;

    // Chain-source tracking: maps trackIdx -> list of chain groups
    // Each chain group records the .RfxChain file path and the FX index range
    struct ChainSource {
        std::string filePath;
        int fxStartIdx;
        int fxEndIdx; // exclusive
    };
    std::map<int, std::vector<ChainSource>> m_trackChainSources;

    // Helper to shift chain-source indices when FX are added/removed/reordered
    static void ShiftChainSourceIndices(
        std::vector<ChainSource>& sources, int beforeIndex, int delta);

    // Run the actual EnumInstalledFX loop (no response, just populate cache)
    // Returns the JSON string of the FX list
    std::string RunFXEnumeration();

    // Send a JSON response to a client
    void SendResponse(
        int clientId, const std::string& id, bool success, const std::string& payload);

    // Command handlers — record mode (Issue #99)
    void HandleSetRecordMode(int clientId, const std::string& id, const std::string& params);

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
    void HandleSampleSendToSlot(int clientId, const std::string& id, const std::string& params);
    void HandleSampleGetAudioInfo(int clientId, const std::string& id, const std::string& params);
    void HandleSamplePreview(int clientId, const std::string& id, const std::string& params);
    void HandleSampleStopPreview(int clientId, const std::string& id, const std::string& params);
    void HandleSampleRefreshCache(int clientId, const std::string& id, const std::string& params);
    void HandleSampleGetCacheStatus(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX chain save/load (Issue #7)
    void HandleFxChainGetDirectory(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainSave(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainLoad(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainGetInfo(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainSearchRecursive(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainCycle(int clientId, const std::string& id, const std::string& params);

    // Internal: load a chain file onto a track, replacing only chain-group FX
    // Returns true on success, false on failure.
    // If mode is "direction" (next/prev), computes target direction from current chain path.
    bool doLoadChain(int trackIdx, const std::string& filePath, const std::string& direction);

    // Command handlers — FX
    void HandleEnumerateFX(int clientId, const std::string& id, const std::string& params);
    void HandleRefreshFxCache(int clientId, const std::string& id, const std::string& params);
    void HandleGetTrackFX(int clientId, const std::string& id, const std::string& params);
    void HandleGetFXParams(int clientId, const std::string& id, const std::string& params);
    void HandleSetFXParam(int clientId, const std::string& id, const std::string& params);
    void HandleAddFX(int clientId, const std::string& id, const std::string& params);
    void HandleDeleteFX(int clientId, const std::string& id, const std::string& params);
    void HandleReorderFX(int clientId, const std::string& id, const std::string& params);
    void HandleSetFXBypass(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX presets
    void HandleGetFxPreset(int clientId, const std::string& id, const std::string& params);
    void HandleSetFxPreset(int clientId, const std::string& id, const std::string& params);
    void HandleGetAllFxPresetNames(int clientId, const std::string& id, const std::string& params);

    // Command handlers — FX/chain tags (Issue #97)
    void HandleFxTagsGetAll(int clientId, const std::string& id, const std::string& params);
    void HandleFxTagsSet(int clientId, const std::string& id, const std::string& params);

    // Command handlers — MIDI recording (Issue #90)
    void HandleMidiEvent(int clientId, const std::string& id, const std::string& params);

    // Command handlers — Playtime 2 / clip matrix
    void HandleMatrixGetAll(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixGetSlot(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixTriggerSlot(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixTriggerScene(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixSetSlotState(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixRecordSlot(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixPollState(int clientId, const std::string& id, const std::string& params);
    void HandleMatrixSetSlotReverse(int clientId, const std::string& id, const std::string& params);

    // Command handlers — step sequencer (Issue #63)
    void HandleSequencerGetAll(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerToggleStep(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetStep(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerClearAll(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetLength(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerSetBaseNote(int clientId, const std::string& id, const std::string& params);
    void HandleSequencerGetPlayhead(int clientId, const std::string& id, const std::string& params);

    // Command handlers — Playtime 2 (Issue #81)
    void HandlePlaytimeIsAvailable(int clientId, const std::string& id, const std::string& params);

    // Command handler — Playtime 2 launch (Issue #88)
    void HandlePlaytimeLaunch(int clientId, const std::string& id, const std::string& params);

    // Command handlers — sequencer convert to clip (Issue #92)
    void HandleSequencerConvertToClip(int clientId, const std::string& id, const std::string& params);

    // Command handlers — chain search (Issue #103)
    void HandleFxChainSearchCached(int clientId, const std::string& id, const std::string& params);
    void HandleFxChainRefreshCache(int clientId, const std::string& id, const std::string& params);
};

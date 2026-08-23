#include "command_handler.h"
#include "command_handler_helpers.h"
#include "MiniBpm.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

// REAPER SDK for MIDI types (MIDI_event_t, midi_realtime_write_struct_t, PCM_SOURCE_EXT_ADDMIDIEVENTS).
// Must come after standard headers because swell-types.h defines min/max macros.
#include "reaper_plugin.h"
#undef min
#undef max

namespace fs = std::filesystem;

// Global Playtime 2 API state (declared extern in command_handler_helpers.h and playtime_api.h)
PlaytimeApi g_playtimeApi;
void* (*g_playtimeGetFunc)(const char*) = nullptr;

// ============================================================
// Constructor — build the command dispatch map
// ============================================================

CommandHandler::CommandHandler(WebSocketServer* ws)
    : m_ws(ws)
{
    m_commandMap["track/getAll"]           = &CommandHandler::HandleGetTracks;
    m_commandMap["track/add"]              = &CommandHandler::HandleAddTrack;
    m_commandMap["track/setRecordMode"]    = &CommandHandler::HandleSetRecordMode;
    m_commandMap["track/getFx"]            = &CommandHandler::HandleGetTrackFX;
    m_commandMap["track/setMute"]          = &CommandHandler::HandleSetTrackMute;
    m_commandMap["track/setSolo"]          = &CommandHandler::HandleSetTrackSolo;
    m_commandMap["track/setArm"]           = &CommandHandler::HandleSetTrackArm;
    m_commandMap["track/setSelected"]      = &CommandHandler::HandleSetTrackSelected;
    m_commandMap["track/setVolume"]        = &CommandHandler::HandleSetTrackVolume;
    m_commandMap["track/setPan"]           = &CommandHandler::HandleSetTrackPan;
    m_commandMap["fx/getParams"]           = &CommandHandler::HandleGetFXParams;
    m_commandMap["fx/setParam"]            = &CommandHandler::HandleSetFXParam;
    m_commandMap["fx/add"]                 = &CommandHandler::HandleAddFX;
    m_commandMap["fx/delete"]              = &CommandHandler::HandleDeleteFX;
    m_commandMap["fx/setBypass"]           = &CommandHandler::HandleSetFXBypass;
    m_commandMap["fx/enumerate"]           = &CommandHandler::HandleEnumerateFX;
    m_commandMap["fx/refreshCache"]        = &CommandHandler::HandleRefreshFxCache;
    m_commandMap["transport/getState"]     = &CommandHandler::HandleGetTransport;
    m_commandMap["transport/play"]         = &CommandHandler::HandlePlay;
    m_commandMap["transport/stop"]         = &CommandHandler::HandleStop;
    m_commandMap["transport/record"]       = &CommandHandler::HandleRecord;
    m_commandMap["sample/getDirectory"]    = &CommandHandler::HandleSampleGetDirectory;
    m_commandMap["sample/sendToTrack"]     = &CommandHandler::HandleSampleSendToTrack;
    m_commandMap["sample/sendToSlot"]      = &CommandHandler::HandleSampleSendToSlot;
    m_commandMap["sample/getAudioInfo"]    = &CommandHandler::HandleSampleGetAudioInfo;
    m_commandMap["sample/preview"]         = &CommandHandler::HandleSamplePreview;
    m_commandMap["sample/stopPreview"]     = &CommandHandler::HandleSampleStopPreview;
    m_commandMap["sample/refreshCache"]    = &CommandHandler::HandleSampleRefreshCache;
    m_commandMap["sample/getCacheStatus"]  = &CommandHandler::HandleSampleGetCacheStatus;
    m_commandMap["sample/getAllCached"]    = &CommandHandler::HandleSampleGetAllCached;
    m_commandMap["sample/getCachedPaths"] = &CommandHandler::HandleSampleGetCachedPaths;
    m_commandMap["fx/getNamedConfigParm"]          = &CommandHandler::HandleFxGetNamedConfigParm;
    m_commandMap["seq/listItems"]                 = &CommandHandler::HandleSeqListItems;
    m_commandMap["seq/readPattern"]               = &CommandHandler::HandleSeqReadPattern;
    m_commandMap["seq/writePattern"]               = &CommandHandler::HandleSeqWritePattern;
    m_commandMap["seq/createTrack"]                = &CommandHandler::HandleSeqCreateTrack;
    m_commandMap["seq/addPad"]                     = &CommandHandler::HandleSeqAddPad;
    m_commandMap["seq/listRacks"]                  = &CommandHandler::HandleSeqListRacks;
    m_commandMap["seq/sendToSlot"]                 = &CommandHandler::HandleSeqSendToSlot;
    m_commandMap["extstate/get"]                  = &CommandHandler::HandleExtStateGet;
    m_commandMap["extstate/getMany"]              = &CommandHandler::HandleExtStateGetMany;
    m_commandMap["extstate/set"]                  = &CommandHandler::HandleExtStateSet;
    m_commandMap["settings/get"]                  = &CommandHandler::HandleSettingsGet;
    m_commandMap["settings/setFxChainPath"]       = &CommandHandler::HandleSettingsSetFxChainPath;
    m_commandMap["settings/setSampleFolders"]     = &CommandHandler::HandleSettingsSetSampleFolders;
    m_commandMap["matrix/getAll"]           = &CommandHandler::HandleMatrixGetAll;
    m_commandMap["matrix/getSlot"]          = &CommandHandler::HandleMatrixGetSlot;
    m_commandMap["matrix/triggerSlot"]      = &CommandHandler::HandleMatrixTriggerSlot;
    m_commandMap["matrix/triggerScene"]     = &CommandHandler::HandleMatrixTriggerScene;
    m_commandMap["matrix/setSlotState"]     = &CommandHandler::HandleMatrixSetSlotState;
    m_commandMap["matrix/recordSlot"]       = &CommandHandler::HandleMatrixRecordSlot;
    m_commandMap["matrix/recordSlotCountdown"] = &CommandHandler::HandleMatrixRecordSlotCountdown;
    m_commandMap["matrix/clearSlot"]        = &CommandHandler::HandleMatrixClearSlot;
    m_commandMap["matrix/pollState"]        = &CommandHandler::HandleMatrixPollState;
    m_commandMap["matrix/setSlotReverse"]    = &CommandHandler::HandleMatrixSetSlotReverse;
    m_commandMap["fxchain/getDirectory"]    = &CommandHandler::HandleFxChainGetDirectory;
    m_commandMap["fxchain/save"]            = &CommandHandler::HandleFxChainSave;
    m_commandMap["fxchain/load"]            = &CommandHandler::HandleFxChainLoad;
    m_commandMap["fxchain/getInfo"]         = &CommandHandler::HandleFxChainGetInfo;
    m_commandMap["fxchain/searchRecursive"] = &CommandHandler::HandleFxChainSearchRecursive;
    m_commandMap["fxchain/cycle"]           = &CommandHandler::HandleFxChainCycle;
    m_commandMap["fxchain/searchCached"]    = &CommandHandler::HandleFxChainSearchCached;
    m_commandMap["fxchain/refreshCache"]    = &CommandHandler::HandleFxChainRefreshCache;
    m_commandMap["fx/reorder"]              = &CommandHandler::HandleReorderFX;
    m_commandMap["fxchain/reorder"]         = &CommandHandler::HandleFxChainReorder;
    m_commandMap["fx/getPreset"]            = &CommandHandler::HandleGetFxPreset;
    m_commandMap["fx/setPreset"]            = &CommandHandler::HandleSetFxPreset;
    m_commandMap["fx/getAllPresetNames"]    = &CommandHandler::HandleGetAllFxPresetNames;
    m_commandMap["midi/event"]              = &CommandHandler::HandleMidiEvent;
    m_commandMap["matrix/play"]             = &CommandHandler::HandleMatrixPlay;
    m_commandMap["matrix/stopAll"]          = &CommandHandler::HandleMatrixStopAll;
    m_commandMap["matrix/click"]            = &CommandHandler::HandleMatrixClick;
    m_commandMap["matrix/panic"]            = &CommandHandler::HandleMatrixPanic;
    m_commandMap["transport/setTempo"]      = &CommandHandler::HandleTransportSetTempo;
    m_commandMap["transport/getTempo"]      = &CommandHandler::HandleTransportGetTempo;
    m_commandMap["playtime/isAvailable"]    = &CommandHandler::HandlePlaytimeIsAvailable;
    m_commandMap["playtime/launch"]         = &CommandHandler::HandlePlaytimeLaunch;
    m_commandMap["fx/tags/getAll"]           = &CommandHandler::HandleFxTagsGetAll;
    m_commandMap["fx/tags/set"]              = &CommandHandler::HandleFxTagsSet;
    m_commandMap["sample/tags/getAll"]           = &CommandHandler::HandleSampleTagsGetAll;
    m_commandMap["sample/tags/set"]              = &CommandHandler::HandleSampleTagsSet;
    m_commandMap["sample/reaper/libraries"]      = &CommandHandler::HandleSampleReaperLibraries;
    m_commandMap["sample/reaper/searchAll"]       = &CommandHandler::HandleSampleReaperSearchAll;
    m_commandMap["sample/reaper/library/files"]  = &CommandHandler::HandleSampleReaperLibraryFiles;
    m_commandMap["sample/purgeStaleCache"]       = &CommandHandler::HandleSamplePurgeStaleCache;
    m_commandMap["sampler/create"]               = &CommandHandler::HandleSamplerCreate;
    m_commandMap["sampler/setReverse"]           = &CommandHandler::HandleSamplerSetReverse;
    m_commandMap["applemidi/connect"]            = &CommandHandler::HandleApplemidiConnect;
    m_commandMap["applemidi/disconnect"]         = &CommandHandler::HandleApplemidiDisconnect;
    m_commandMap["applemidi/status"]             = &CommandHandler::HandleApplemidiStatus;
    m_commandMap["applemidi/setRouting"]         = &CommandHandler::HandleApplemidiSetRouting;
    m_commandMap["midi/noteOn"]                  = &CommandHandler::HandleMidiNoteOn;
    m_commandMap["midi/noteOff"]                 = &CommandHandler::HandleMidiNoteOff;
    m_commandMap["midi/setFastPath"]             = &CommandHandler::HandleMidiSetFastPath;
}

CommandHandler::~CommandHandler() { }

// ============================================================
// Queue main-thread operations
// ============================================================

void CommandHandler::QueueMainThread(std::function<void()> op) {
    std::lock_guard<std::mutex> lock(m_pendingMutex);
    m_pendingOps.push_back(std::move(op));
}

void CommandHandler::DrainPendingOps() {
    std::vector<std::function<void()>> ops;
    {
        std::lock_guard<std::mutex> lock(m_pendingMutex);
        ops.swap(m_pendingOps);
    }
    for (auto& op : ops) op();
}

// ============================================================
// Set config directory (called from main.cpp)
// ============================================================

void CommandHandler::SetConfigDir(const std::string& dir)
{
    m_fxTagStorage = FxTagStorage(dir);
    m_fxTagStorage.Load();
    m_sampleTagStorage = SampleTagStorage(dir);
    m_sampleTagStorage.Load();
    m_settings.SetConfigDir(dir);
    m_settings.Load();
    PreCacheFxChains(dir);
}

// ============================================================
// Handle incoming WebSocket message
// ============================================================

void CommandHandler::HandleMessage(int clientId, const std::string& message)
{
    std::lock_guard<std::mutex> lock(m_apiMutex);

    JsonParser  parser(message);
    std::string type    = parser.getString("type");
    std::string command = parser.getString("command");
    std::string id      = parser.getString("id");

    if (type.empty() || type == "command") {
        auto it = m_commandMap.find(command);
        if (it != m_commandMap.end()) {
            (this->*(it->second))(clientId, id, message);
        } else {
            SendResponse(clientId, id, false, "{\"error\":\"Unknown command\"}");
        }
    } else if (type == "hello") {
        std::string resp = "{";
        resp += json_string("type") + ":" + json_string("hello") + ",";
        resp += json_string("protocolVersion") + ":1";
        resp += "}";
        m_ws->Send(clientId, resp);
    }
}

// ============================================================
// Format and send JSON response
// ============================================================

std::string CommandHandler::FormatResponse(
    const std::string& id, bool success, const std::string& payload)
{
    std::string resp = "{";
    resp += json_string("type") + ":" + json_string("response") + ",";
    if (!id.empty())
        resp += json_string("id") + ":" + json_string(id) + ",";
    resp += json_string("success") + ":" + (success ? "true" : "false") + ",";
    resp += json_string("payload") + ":" + payload;
    resp += "}";
    return resp;
}

void CommandHandler::SendResponse(
    int clientId, const std::string& id, bool success, const std::string& payload)
{
    std::string resp = FormatResponse(id, success, payload);
    if (m_responseCb) {
        m_responseCb(clientId, resp);
    } else if (m_ws) {
        m_ws->Send(clientId, resp);
    }
}

// ============================================================
// FX enumeration — shared logic
// ============================================================

std::string CommandHandler::RunFXEnumeration()
{
    std::string fxList = "[";
    int         idx    = 0;
    while (true) {
        const char* name  = nullptr;
        const char* ident = nullptr;
        if (!m_api.EnumInstalledFX(idx, &name, &ident))
            break;
        if (idx > 0)
            fxList += ",";

        std::string format = "VST3";
        std::string nameStr(name ? name : "");
        std::string idStr(ident ? ident : "");

        if (nameStr.find("VST2:") == 0 || nameStr.find("VST:") == 0
            || idStr.find("VST2:") == 0 || idStr.find("VST:") == 0)
            format = "VST2";
        else if (nameStr.find("VST3:") == 0 || idStr.find("VST3:") == 0)
            format = "VST3";
        else if (nameStr.find("CLAP:") == 0 || idStr.find("CLAP:") == 0)
            format = "CLAP";
        else if (nameStr.find("JS:") == 0 || idStr.find("JS:") == 0)
            format = "JSFX";
        else if (nameStr.find("AU:") == 0 || idStr.find("AU:") == 0)
            format = "AU";
        else if (nameStr.find("DX:") == 0 || idStr.find("DX:") == 0)
            format = "DX";

        fxList += "{";
        fxList += json_string("index") + ":" + std::to_string(idx) + ",";
        fxList += json_string("name") + ":" + json_string(name ? name : "") + ",";
        fxList += json_string("ident") + ":" + json_string(ident ? ident : "") + ",";
        fxList += json_string("format") + ":" + json_string(format);
        fxList += "}";

        idx++;
    }
    fxList += "]";

    m_fxCache      = fxList;
    m_fxCacheValid = true;
    return fxList;
}

void CommandHandler::PreCacheFX()
{
    if (m_fxCacheValid) return;
    if (!m_api.EnumInstalledFX) return;

    fprintf(stderr, "[reaper-ipad] Pre-caching FX list...\n");
    RunFXEnumeration();
    fprintf(stderr,
        "[reaper-ipad] FX cache populated (%zu entries)\n", m_fxCache.size());
}

void CommandHandler::PreCacheFxChains(const std::string& rootPath)
{
    if (rootPath.empty()) {
        fprintf(stderr, "[reaper-ipad] No FX chain root path set, skipping cache\n");
        return;
    }

    fprintf(stderr, "[reaper-ipad] Pre-caching FX chains from %s...\n", rootPath.c_str());
    int count = m_fxChainCache.BuildIndex(rootPath);
    fprintf(stderr, "[reaper-ipad] FX chain cache built with %d entries\n", count);
}

// ============================================================
// Real-time event broadcasting
// ============================================================

void CommandHandler::BroadcastTrackEvent(
    const std::string& eventType, int trackIdx, bool value)
{
    std::string event = "{";
    event += "\"type\":\"event\",";
    event += "\"event\":\"" + json_escape(eventType) + "\",";
    event += "\"payload\":{";
    event += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
    event += "\"value\":" + std::string(value ? "true" : "false");
    event += "}}";

    if (m_broadcastCb) {
        m_broadcastCb(event);
    } else if (m_ws) {
        m_ws->Broadcast(event);
    }
}

void CommandHandler::BroadcastTrackEvent(
    const std::string& eventType, int trackIdx, double value)
{
    std::string event = "{";
    event += "\"type\":\"event\",";
    event += "\"event\":\"" + json_escape(eventType) + "\",";
    event += "\"payload\":{";
    event += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
    event += "\"value\":" + std::to_string(value);
    event += "}}";

    if (m_broadcastCb) {
        m_broadcastCb(event);
    } else if (m_ws) {
        m_ws->Broadcast(event);
    }
}

// ============================================================
// Watched FX — real-time param change tracking
// ============================================================

void CommandHandler::SetWatchedFX(int trackIdx, int fxIdx)
{
    m_watchedTrackIdx = trackIdx;
    m_watchedFxIdx    = fxIdx;
}

void CommandHandler::ClearWatchedFX()
{
    m_watchedTrackIdx = -1;
    m_watchedFxIdx    = -1;
}

// ============================================================
// OnFxParamChanged — Real-time FX param change via CSURF_EXT callback (Issue #58)
// ============================================================

void CommandHandler::OnFxParamChanged(MediaTrack* track, int fxIdx, int paramIdx, double value)
{
    if (m_watchedTrackIdx < 0 || m_watchedFxIdx < 0)
        return;

    int trackIdx = -1;
    if (m_api.CSurf_TrackToID) {
        trackIdx = m_api.CSurf_TrackToID(track, false) - 1;
    }
    if (trackIdx != m_watchedTrackIdx || fxIdx != m_watchedFxIdx)
        return;

    if (m_lastSetParam.trackIdx == trackIdx &&
        m_lastSetParam.fxIdx == fxIdx &&
        m_lastSetParam.paramIdx == paramIdx) {
        m_lastSetParam = {-1, -1, -1};
        return;
    }

    char name[256] = { 0 };
    if (m_api.TrackFX_GetParamName) {
        m_api.TrackFX_GetParamName(track, fxIdx, paramIdx, name, sizeof(name));
    }

    // GetParamEx already reports display units — see HandleGetFXParams. This
    // used to rescale by the range as though the value were normalized.
    double minVal = 0, maxVal = 0, midVal = 0;
    double actualVal = value;
    if (m_api.TrackFX_GetParamEx) {
        actualVal = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &minVal, &maxVal, &midVal);
    }

    char formattedBuf[256] = { 0 };
    bool formattedOk = false;
    if (m_api.TrackFX_GetFormattedParamValue) {
        formattedOk = m_api.TrackFX_GetFormattedParamValue(
            track, fxIdx, paramIdx, formattedBuf, sizeof(formattedBuf));
    }

    std::string event = "{";
    event += "\"type\":\"event\",";
    event += "\"event\":\"fx_param_changed\",";
    event += "\"payload\":{";
    event += "\"trackIdx\":" + std::to_string(trackIdx) + ",";
    event += "\"fxIdx\":" + std::to_string(fxIdx) + ",";
    event += "\"params\":[{";
    event += "\"index\":" + std::to_string(paramIdx) + ",";
    event += "\"name\":\"" + json_escape(name) + "\",";
    event += "\"value\":" + std::to_string(actualVal) + ",";
    event += "\"min\":" + std::to_string(minVal) + ",";
    event += "\"max\":" + std::to_string(maxVal) + ",";
    event += "\"mid\":" + std::to_string(midVal) + ",";
    event += "\"formatted\":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string(""));
    event += "}]}}";

    if (m_broadcastCb)
        m_broadcastCb(event);
    else if (m_ws)
        m_ws->Broadcast(event);
}

// ============================================================
// TickSampleCache
// ============================================================

void CommandHandler::TickSampleCache()
{
    if (!m_sampleCache.IsScanning()) return;
    bool done = m_sampleCache.ScanNextBatch();
    if (done && m_broadcastCb) {
        m_broadcastCb("{\"type\":\"event\",\"event\":\"sampleIndexComplete\",\"payload\":{}}");
    }
}

// ============================================================
// HandleMidiEvent — MIDI event recording (Issue #90)
// ============================================================

void CommandHandler::HandleMidiEvent(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string eventType = parser.getString("type");
    std::string channelStr = parser.getString("channel");
    std::string data1Str = parser.getString("data1");
    std::string data2Str = parser.getString("data2");

    if (data2Str.empty()) {
        data2Str = parser.getString("value");
    }
    if (data1Str.empty()) {
        data1Str = parser.getString("controller");
    }

    if (eventType.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'type' field in midi/event payload\"}");
        return;
    }

    int channel = channelStr.empty() ? 0 : atoi(channelStr.c_str());
    int data1 = data1Str.empty() ? 0 : atoi(data1Str.c_str());
    int data2 = data2Str.empty() ? 0 : atoi(data2Str.c_str());

    if (channel < 0 || channel > 15) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Channel must be 0-15\"}");
        return;
    }

    bool isRecording = false;
    if (m_api.GetPlayState) {
        int state = m_api.GetPlayState();
        isRecording = (state & 4) != 0;
    }

    bool injectedToRecordingTake = false;

    if (isRecording &&
        m_api.CountMediaItems && m_api.GetMediaItem &&
        m_api.GetActiveTake && m_api.GetMediaItemTake_Source &&
        m_api.MIDI_eventlist_Create && m_api.MIDI_eventlist_Destroy &&
        m_api.GetPlayPosition && m_api.CountTracks && m_api.GetTrack &&
        m_api.GetSetMediaTrackInfo) {

        int numTracks = m_api.CountTracks(nullptr);
        double playPos = m_api.GetPlayPosition();
        double sampleRate = 44100.0;

        for (int t = 0; t < numTracks && !injectedToRecordingTake; t++) {
            MediaTrack* track = m_api.GetTrack(nullptr, t);
            if (!track) continue;

            int* armState = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECARM", nullptr);
            if (!armState || *armState == 0) continue;

            int numItems = m_api.CountMediaItems(nullptr);
            for (int i = 0; i < numItems && !injectedToRecordingTake; i++) {
                MediaItem* item = m_api.GetMediaItem(nullptr, i);
                if (!item) continue;

                MediaItem_Take* take = m_api.GetActiveTake(item);
                if (!take) continue;

                PCM_source* source = m_api.GetMediaItemTake_Source(take);
                if (!source) continue;

                MIDI_event_t evt = BuildMidiEvent(
                    eventType, channel, data1, data2, playPos, sampleRate);

                MIDI_eventlist* eventList = m_api.MIDI_eventlist_Create();
                if (!eventList) continue;

                eventList->AddItem(&evt);

                midi_realtime_write_struct_t writeStruct;
                memset(&writeStruct, 0, sizeof(writeStruct));
                writeStruct.global_time = playPos;
                writeStruct.global_item_time = playPos;
                writeStruct.srate = sampleRate;
                writeStruct.length = 0;
                writeStruct.overwritemode = -1;
                writeStruct.events = eventList;
                writeStruct.item_playrate = 1.0;
                writeStruct.latency = 0.0;
                writeStruct.overwrite_actives = nullptr;
                writeStruct.do_not_quantize_past_sec = 0.0;

                int result = source->Extended(
                    PCM_SOURCE_EXT_ADDMIDIEVENTS, &writeStruct, 0, nullptr);

                m_api.MIDI_eventlist_Destroy(eventList);

                if (result != 0) {
                    injectedToRecordingTake = true;
                    break;
                }
            }
        }
    }

    std::string payload = "{";
    payload += "\"sent\":true,";
    payload += "\"injected\":" + std::string(injectedToRecordingTake ? "true" : "false") + ",";
    payload += "\"recording\":" + std::string(isRecording ? "true" : "false");
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

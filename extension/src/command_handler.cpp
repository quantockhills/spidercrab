#include "command_handler.h"
#include <algorithm>
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

// Global Playtime 2 API state (defined here, declared extern in playtime_api.h)
PlaytimeApi g_playtimeApi;
void* (*g_playtimeGetFunc)(const char*) = nullptr;

// Minimal JSON builder (no dependencies)
static std::string json_escape(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 2);
    for (char c : s) {
        switch (c) {
        case '"':
            out += "\\\"";
            break;
        case '\\':
            out += "\\\\";
            break;
        case '\b':
            out += "\\b";
            break;
        case '\f':
            out += "\\f";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
        default:
            if ((unsigned char)c < 0x20) {
                char buf[8];
                snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
                out += buf;
            } else {
                out += c;
            }
        }
    }
    return out;
}

static std::string json_string(const char* s)
{
    return "\"" + json_escape(s ? s : "") + "\"";
}

// Forward declare REAPER types — must match reaper_plugin.h ('class', not 'struct')
class MediaTrack;
class ReaProject;
class MediaItem;
class MediaItem_Take;
class PCM_source;
class MIDI_eventlist;

static std::string json_string(const std::string& s)
{
    return json_string(s.c_str());
}

// Very simple JSON parser for extracting values
// Only handles the subset we need: objects, strings, numbers, arrays
struct JsonParser {
    const std::string& s;
    size_t             pos = 0;

    JsonParser(const std::string& str)
        : s(str)
    {
    }

    void skipWhitespace()
    {
        while (
            pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\n' || s[pos] == '\r'))
            pos++;
    }

    char peek()
    {
        skipWhitespace();
        return pos < s.size() ? s[pos] : 0;
    }
    char next()
    {
        skipWhitespace();
        return pos < s.size() ? s[pos++] : 0;
    }

    std::string parseString()
    {
        if (next() != '"')
            return "";
        std::string result;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\') {
                pos++;
                if (pos >= s.size())
                    break;
                switch (s[pos]) {
                case '"':
                    result += '"';
                    break;
                case '\\':
                    result += '\\';
                    break;
                case 'n':
                    result += '\n';
                    break;
                case 'r':
                    result += '\r';
                    break;
                case 't':
                    result += '\t';
                    break;
                default:
                    result += s[pos];
                    break;
                }
                pos++;
            } else {
                result += s[pos++];
            }
        }
        if (pos < s.size())
            pos++; // skip closing quote
        return result;
    }

    std::string parseNumber()
    {
        std::string num;
        if (peek() == '-') {
            num += next();
        }
        while (pos < s.size() && isdigit(s[pos]))
            num += s[pos++];
        if (pos < s.size() && s[pos] == '.') {
            num += s[pos++];
            while (pos < s.size() && isdigit(s[pos]))
                num += s[pos++];
        }
        if (pos < s.size() && (s[pos] == 'e' || s[pos] == 'E')) {
            num += s[pos++];
            if (pos < s.size() && (s[pos] == '+' || s[pos] == '-'))
                num += s[pos++];
            while (pos < s.size() && isdigit(s[pos]))
                num += s[pos++];
        }
        return num;
    }

    // Get a string value for a key in an object
    std::string getString(const std::string& key)
    {
        // If we're at the start of an object, skip the opening {
        // This allows calling getString multiple times on the same object
        if (peek() == '{')
            next();
        // Skip comma between key-value pairs
        if (peek() == ',')
            next();
        while (peek() != '}' && pos < s.size()) {
            std::string k = parseString();
            if (next() != ':')
                return "";
            if (k == key) {
                char c = peek();
                if (c == '"')
                    return parseString();
                return parseNumber();
            } else {
                // Skip value
                char c = peek();
                if (c == '"')
                    parseString();
                else if (c == '{') {
                    pos++; // skip opening {
                    int depth = 1;
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '{')
                            depth++;
                        if (s[pos] == '}')
                            depth--;
                        pos++;
                    }
                } else if (c == '[') {
                    pos++; // skip opening [
                    int depth = 1;
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '[')
                            depth++;
                        if (s[pos] == ']')
                            depth--;
                        pos++;
                    }
                } else
                    parseNumber();
            }
            if (peek() == ',')
                next();
        }
        next(); // skip }
        return "";
    }
};


// Extract the JSON object inside "payload" from a command message.
static std::string extractPayload(const std::string& message)
{
    size_t pos = message.find("\"payload\"");
    if (pos == std::string::npos)
        return message;
    pos = message.find(':', pos);
    if (pos == std::string::npos)
        return message;
    pos++;
    while (pos < message.size() && (message[pos] == ' ' || message[pos] == '\t'))
        pos++;
    if (pos >= message.size() || message[pos] != '{')
        return message;
    int depth = 1;
    size_t start = pos;
    pos++;
    while (pos < message.size() && depth > 0) {
        if (message[pos] == '{') depth++;
        if (message[pos] == '}') depth--;
        pos++;
    }
    if (depth != 0)
        return message;
    return message.substr(start, pos - start);
}

CommandHandler::CommandHandler(WebSocketServer* ws)
    : m_ws(ws)
{
    // Populate command dispatch map
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
    m_commandMap["fx/enumerate"]           = &CommandHandler::HandleEnumerateFX;
    m_commandMap["fx/refreshCache"]        = &CommandHandler::HandleRefreshFxCache;
    m_commandMap["transport/getState"]     = &CommandHandler::HandleGetTransport;
    m_commandMap["transport/play"]         = &CommandHandler::HandlePlay;
    m_commandMap["transport/stop"]         = &CommandHandler::HandleStop;
    m_commandMap["transport/record"]       = &CommandHandler::HandleRecord;
    m_commandMap["sample/getDirectory"]    = &CommandHandler::HandleSampleGetDirectory;
    m_commandMap["sample/sendToTrack"]     = &CommandHandler::HandleSampleSendToTrack;
    m_commandMap["matrix/getAll"]           = &CommandHandler::HandleMatrixGetAll;
    m_commandMap["matrix/getSlot"]          = &CommandHandler::HandleMatrixGetSlot;
    m_commandMap["matrix/triggerSlot"]      = &CommandHandler::HandleMatrixTriggerSlot;
    m_commandMap["matrix/triggerScene"]     = &CommandHandler::HandleMatrixTriggerScene;
    m_commandMap["matrix/setSlotState"]     = &CommandHandler::HandleMatrixSetSlotState;
    m_commandMap["matrix/recordSlot"]       = &CommandHandler::HandleMatrixRecordSlot;
    m_commandMap["matrix/pollState"]        = &CommandHandler::HandleMatrixPollState;
    m_commandMap["sequencer/getAll"]        = &CommandHandler::HandleSequencerGetAll;
    m_commandMap["sequencer/toggleStep"]    = &CommandHandler::HandleSequencerToggleStep;
    m_commandMap["sequencer/setStep"]       = &CommandHandler::HandleSequencerSetStep;
    m_commandMap["sequencer/clearAll"]      = &CommandHandler::HandleSequencerClearAll;
    m_commandMap["sequencer/setLength"]     = &CommandHandler::HandleSequencerSetLength;
    m_commandMap["sequencer/setBaseNote"]   = &CommandHandler::HandleSequencerSetBaseNote;
    m_commandMap["sequencer/getPlayhead"]   = &CommandHandler::HandleSequencerGetPlayhead;
    m_commandMap["fxchain/getDirectory"]    = &CommandHandler::HandleFxChainGetDirectory;
    m_commandMap["fxchain/save"]            = &CommandHandler::HandleFxChainSave;
    m_commandMap["fxchain/load"]            = &CommandHandler::HandleFxChainLoad;
    m_commandMap["fxchain/getInfo"]         = &CommandHandler::HandleFxChainGetInfo;
    m_commandMap["fxchain/searchRecursive"] = &CommandHandler::HandleFxChainSearchRecursive;
    m_commandMap["fxchain/cycle"]           = &CommandHandler::HandleFxChainCycle;
    m_commandMap["fxchain/searchCached"]    = &CommandHandler::HandleFxChainSearchCached;
    m_commandMap["fxchain/refreshCache"]    = &CommandHandler::HandleFxChainRefreshCache;
    m_commandMap["fx/reorder"]              = &CommandHandler::HandleReorderFX;
    m_commandMap["fx/getPreset"]            = &CommandHandler::HandleGetFxPreset;
    m_commandMap["fx/setPreset"]            = &CommandHandler::HandleSetFxPreset;
    m_commandMap["fx/getAllPresetNames"]    = &CommandHandler::HandleGetAllFxPresetNames;
    m_commandMap["sequencer/convertToClip"] = &CommandHandler::HandleSequencerConvertToClip;
    m_commandMap["midi/event"]              = &CommandHandler::HandleMidiEvent;
    m_commandMap["playtime/isAvailable"]    = &CommandHandler::HandlePlaytimeIsAvailable;
    m_commandMap["playtime/launch"]         = &CommandHandler::HandlePlaytimeLaunch;
    m_commandMap["fx/tags/getAll"]           = &CommandHandler::HandleFxTagsGetAll;
    m_commandMap["fx/tags/set"]              = &CommandHandler::HandleFxTagsSet;
}
CommandHandler::~CommandHandler() { }

void CommandHandler::SetConfigDir(const std::string& dir)
{
    m_fxTagStorage = FxTagStorage(dir);
    m_fxTagStorage.Load();
    PreCacheFxChains(dir);
}

void CommandHandler::HandleMessage(int clientId, const std::string& message)
{
    // Serialize all Reaper API calls to prevent race conditions
    std::lock_guard<std::mutex> lock(m_apiMutex);

    // Parse JSON command
    JsonParser  parser(message);
    std::string type    = parser.getString("type");
    std::string command = parser.getString("command");
    std::string id      = parser.getString("id");

    // Simple dispatch
    if (type.empty() || type == "command") {
        auto it = m_commandMap.find(command);
        if (it != m_commandMap.end()) {
            (this->*(it->second))(clientId, id, message);
        } else {
            SendResponse(clientId, id, false, "{\"error\":\"Unknown command\"}");
        }
    } else if (type == "hello") {
        // Just acknowledge
        std::string resp = "{";
        resp += json_string("type") + ":" + json_string("hello") + ",";
        resp += json_string("protocolVersion") + ":1";
        resp += "}";
        m_ws->Send(clientId, resp);
    }
}

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

void CommandHandler::HandleAddTrack(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (m_api.Main_OnCommand) {
        m_api.Main_OnCommand(40001, 0);
        SendResponse(clientId, id, true, "{\"added\":true}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
    }
}

void CommandHandler::HandleGetTracks(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.CountTracks) {
        SendResponse(clientId, id, true, "{\"tracks\":[]}");
        return;
    }
    int numTracks = m_api.CountTracks(nullptr);
    
    std::string tracksJson = "[";
    for (int i = 0; i < numTracks; i++) {
        MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, i) : nullptr;
        if (!track) continue;
        if (i > 0) tracksJson += ",";

        // Read actual state from Reaper (setNewValue=nullptr = read mode)
        bool muted = false, soloed = false, armed = false;
        double volume = 0.75; // sane default if API unavailable
        double pan = 0.0;  // sane default if API unavailable
        int recMode = 0; // I_RECMODE: 0=input (audio), 7=MIDI overdub, 8=MIDI replace
        int recInput = 0; // I_RECINPUT: record input routing
        if (m_api.GetSetMediaTrackInfo) {
            bool* mp = (bool*)m_api.GetSetMediaTrackInfo(track, "B_MUTE", nullptr);
            if (mp) muted = *mp;
            int* sp = (int*)m_api.GetSetMediaTrackInfo(track, "I_SOLO", nullptr);
            if (sp) soloed = (*sp != 0);
            int* ap = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECARM", nullptr);
            if (ap) armed = (*ap != 0);
            double* vp = (double*)m_api.GetSetMediaTrackInfo(track, "D_VOL", nullptr);
            if (vp) volume = *vp;
            double* pp = (double*)m_api.GetSetMediaTrackInfo(track, "D_PAN", nullptr);
            if (pp) pan = *pp;
            int* rmp = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECMODE", nullptr);
            if (rmp) recMode = *rmp;
            int* rip = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECINPUT", nullptr);
            if (rip) recInput = *rip;
        }

        // Read real track name via GetSetMediaTrackInfo_String (Issue #40)
        // Fallback to "Track N" if API unavailable or name is empty
        char trackName[256] = {0};
        bool gotName = false;
        if (m_api.GetSetMediaTrackInfo_String) {
            gotName = m_api.GetSetMediaTrackInfo_String(track, "P_NAME", trackName, false);
        }
        std::string displayName;
        if (gotName && trackName[0] != '\0') {
            displayName = trackName;
        } else {
            // Master track returns NULL/P_NAME empty per docs; fallback for all empty names
            displayName = "Track " + std::to_string(i + 1);
        }

        tracksJson += "{";
        tracksJson += json_string("index") + ":" + std::to_string(i) + ",";
        tracksJson += json_string("name") + ":" + json_string(displayName) + ",";
        tracksJson += json_string("trackNumber") + ":" + std::to_string(i + 1) + ",";
        tracksJson += json_string("selected") + ":false,";
        tracksJson += json_string("muted") + ":" + std::string(muted ? "true" : "false") + ",";
        tracksJson += json_string("soloed") + ":" + std::string(soloed ? "true" : "false") + ",";
        tracksJson += json_string("armed") + ":" + std::string(armed ? "true" : "false") + ",";
        tracksJson += json_string("recMode") + ":" + std::to_string(recMode) + ",";
        tracksJson += json_string("recInput") + ":" + std::to_string(recInput) + ",";
        tracksJson += json_string("volume") + ":" + std::to_string(volume) + ",";
        tracksJson += json_string("pan") + ":" + std::to_string(pan);
        tracksJson += "}";
    }
    tracksJson += "]";
    SendResponse(clientId, id, true, "{\"tracks\":" + tracksJson + "}");
}
void CommandHandler::HandleGetTrackFX(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetCount || !m_api.TrackFX_GetFXName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    // Extract track index from params
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int         fxCount = m_api.TrackFX_GetCount(track);
    std::string fxList  = "[";

    // Build a chainPath lookup: fxIdx -> chainPath (or empty if not in a chain group)
    std::map<int, std::string> fxChainPath;
    auto it = m_trackChainSources.find(trackIdx);
    if (it != m_trackChainSources.end()) {
        for (const auto& cs : it->second) {
            for (int i = cs.fxStartIdx; i < cs.fxEndIdx && i < fxCount; i++) {
                fxChainPath[i] = cs.filePath;
            }
        }
    }

    for (int i = 0; i < fxCount; i++) {
        if (i > 0)
            fxList += ",";
        char name[512] = { 0 };
        m_api.TrackFX_GetFXName(track, i, name, sizeof(name));
        fxList += "{";
        fxList += json_string("index") + ":" + std::to_string(i) + ",";
        fxList += json_string("name") + ":" + json_string(name) + ",";
        auto cpIt = fxChainPath.find(i);
        if (cpIt != fxChainPath.end() && !cpIt->second.empty()) {
            fxList += json_string("chainPath") + ":" + json_string(cpIt->second);
        } else {
            fxList += json_string("chainPath") + ":null";
        }
        fxList += "}";
    }
    fxList += "]";

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(trackIdx) + ",\"fx\":" + fxList + "}");
}

void CommandHandler::HandleGetFXParams(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetNumParams || !m_api.TrackFX_GetParamEx || !m_api.TrackFX_GetParamName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string offsetStr   = parser.getString("offset");
    std::string limitStr    = parser.getString("limit");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    int         offset      = offsetStr.empty() ? 0 : atoi(offsetStr.c_str());
    int         limit       = limitStr.empty() ? 32 : atoi(limitStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int         numParams  = m_api.TrackFX_GetNumParams(track, fxIdx);
    int         endIdx     = std::min(numParams, offset + limit);
    std::string paramsList = "[";
    for (int i = offset; i < endIdx; i++) {
        if (i > offset)
            paramsList += ",";
        double minVal = 0, maxVal = 0, midVal = 0;
        double val       = m_api.TrackFX_GetParamEx(track, fxIdx, i, &minVal, &maxVal, &midVal);
        // TrackFX_GetParamEx returns the normalized value (0.0-1.0) but fills
        // minVal/maxVal with the actual display range (e.g. -150 to 0 for volume).
        // Convert to the actual display value so the frontend doesn't need to.
        double actualVal = minVal + val * (maxVal - minVal);
        char   name[256] = { 0 };
        m_api.TrackFX_GetParamName(track, fxIdx, i, name, sizeof(name));

        // Get the human-readable formatted value (e.g. "50.0%", "-6.0 dB")
        // Falls back to empty/null if TrackFX_GetFormattedParamValue is
        // unavailable or fails (Issue #73)
        char formattedBuf[256] = { 0 };
        bool formattedOk = false;
        if (m_api.TrackFX_GetFormattedParamValue) {
            formattedOk = m_api.TrackFX_GetFormattedParamValue(
                track, fxIdx, i, formattedBuf, sizeof(formattedBuf));
        }

        paramsList += "{";
        paramsList += json_string("index") + ":" + std::to_string(i) + ",";
        paramsList += json_string("name") + ":" + json_string(name) + ",";
        paramsList += json_string("value") + ":" + std::to_string(actualVal) + ",";
        paramsList += json_string("min") + ":" + std::to_string(minVal) + ",";
        paramsList += json_string("max") + ":" + std::to_string(maxVal) + ",";
        paramsList += json_string("mid") + ":" + std::to_string(midVal) + ",";
        paramsList += json_string("formatted") + ":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string(""));
        paramsList += "}";
    }
    paramsList += "]";
    
    // Auto-watch this FX for real-time param change events (Issue #52)
    SetWatchedFX(trackIdx, fxIdx);

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(trackIdx) + ",\"fxIdx\":" + std::to_string(fxIdx)
            + ",\"params\":" + paramsList
            + ",\"total\":" + std::to_string(numParams)
            + ",\"offset\":" + std::to_string(offset)
            + ",\"limit\":" + std::to_string(limit) + "}");
}

void CommandHandler::HandleSetFXParam(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_SetParam) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string paramIdxStr = parser.getString("paramIdx");
    std::string valueStr    = parser.getString("value");

    int    trackIdx = atoi(trackIdxStr.c_str());
    int    fxIdx    = atoi(fxIdxStr.c_str());
    int    paramIdx = atoi(paramIdxStr.c_str());
    double value    = atof(valueStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // Get param range info for zero-range guard and readback
    double minVal = 0, maxVal = 0, midVal = 0;
    if (m_api.TrackFX_GetParamEx) {
        m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &minVal, &maxVal, &midVal);
    }

    // Guard against zero-range params (read-only sliders, Issue #73):
    // Some JSFX params report minVal == maxVal. Skip the set entirely.
    double range = maxVal - minVal;
    if (range >= 0.0 && range < 1e-15) {
        // Range is effectively zero — return current value.
        double currentNorm = 0;
        double readMin = 0, readMax = 0, readMid = 0;
        if (m_api.TrackFX_GetParamEx) {
            currentNorm = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &readMin, &readMax, &readMid);
        }
        double currentVal = readMin + currentNorm * (readMax - readMin);
        SendResponse(clientId, id, true,
            "{\"set\":true,"
            "\"value\":" + std::to_string(currentVal) + "}");
        return;
    }

    // TrackFX_SetParam takes actual display values, NOT normalized 0-1 (Issue #73).
    // The frontend sends actual display values (e.g. 5000 Hz, -12 dB), so
    // we pass them directly to the API.
    m_lastSetParam = {trackIdx, fxIdx, paramIdx};

    bool success = m_api.TrackFX_SetParam(track, fxIdx, paramIdx, value);

    // Read back the actual value REAPER committed (fixes slider jumping due to
    // normalization precision loss or stepped params)
    double committedVal = value;
    double actualMin = 0, actualMax = 0, actualMid = 0;
    if (success && m_api.TrackFX_GetParamEx) {
        double normVal = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &actualMin, &actualMax, &actualMid);
        committedVal = actualMin + normVal * (actualMax - actualMin);
    }

    // Get the formatted value for the committed param (Issue #73)
    char formattedBuf[256] = { 0 };
    bool formattedOk = false;
    if (success && m_api.TrackFX_GetFormattedParamValue) {
        formattedOk = m_api.TrackFX_GetFormattedParamValue(
            track, fxIdx, paramIdx, formattedBuf, sizeof(formattedBuf));
    }

    SendResponse(
        clientId, id, success,
        "{\"set\":" + std::string(success ? "true" : "false") + ","
        "\"value\":" + std::to_string(committedVal) + ","
        "\"formatted\":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string("")) + "}");
}

void CommandHandler::HandleAddFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_AddByName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxName      = parser.getString("fxName");

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // instantiate=1 means: don't prompt, just add the FX
    int fxIdx = m_api.TrackFX_AddByName(track, fxName.c_str(), false, 1);

    // Update chain-source indices: new FX inserted at fxIdx
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end() && fxIdx >= 0) {
        ShiftChainSourceIndices(sit->second, fxIdx, 1);
    }

    SendResponse(clientId, id, fxIdx >= 0, "{\"fxIdx\":" + std::to_string(fxIdx) + "}");
}

// ============================================================
// FX preset command handlers (Issue #87)
// ============================================================

void CommandHandler::HandleGetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int numPresets = 0;
    int presetIdx  = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    std::string presetName;
    if (presetIdx >= 0) {
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            presetName = nameBuf;
        }
    }

    std::string payload = "{";
    payload += json_string("presetIndex") + ":" + std::to_string(presetIdx) + ",";
    payload += json_string("presetName") + ":" + (presetName.empty() ? "null" : json_string(presetName)) + ",";
    payload += json_string("numPresets") + ":" + std::to_string(numPresets);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_SetPresetByIndex || !m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fxIdxStr     = parser.getString("fxIdx");
    std::string presetIdxStr = parser.getString("presetIdx");
    int trackIdx  = atoi(trackIdxStr.c_str());
    int fxIdx     = atoi(fxIdxStr.c_str());
    int presetIdx = atoi(presetIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    bool success = m_api.TrackFX_SetPresetByIndex(track, fxIdx, presetIdx);
    if (!success) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to set preset\"}");
        return;
    }

    // Read back the committed state
    int numPresets = 0;
    int committedIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    std::string presetName;
    if (committedIdx >= 0) {
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            presetName = nameBuf;
        }
    }

    std::string payload = "{";
    payload += json_string("presetIndex") + ":" + std::to_string(committedIdx) + ",";
    payload += json_string("presetName") + ":" + (presetName.empty() ? "null" : json_string(presetName)) + ",";
    payload += json_string("numPresets") + ":" + std::to_string(numPresets);
    payload += "}";

    SendResponse(clientId, id, success, payload);
}

void CommandHandler::HandleGetAllFxPresetNames(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset || !m_api.TrackFX_SetPresetByIndex) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int numPresets = 0;
    int originalIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    if (numPresets <= 0) {
        std::string payload = "{";
        payload += json_string("presetNames") + ":[],";
        payload += json_string("currentIndex") + ":" + std::to_string(originalIdx);
        payload += "}";
        SendResponse(clientId, id, true, payload);
        return;
    }

    // Enumerate all presets by index
    std::string nameList = "[";
    for (int i = 0; i < numPresets; i++) {
        if (i > 0) nameList += ",";
        m_api.TrackFX_SetPresetByIndex(track, fxIdx, i);
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            nameList += json_string(nameBuf);
        } else {
            nameList += json_string("");
        }
    }
    nameList += "]";

    // Restore original preset (important for correctness)
    m_api.TrackFX_SetPresetByIndex(track, fxIdx, originalIdx);

    std::string payload = "{";
    payload += json_string("presetNames") + ":" + nameList + ",";
    payload += json_string("currentIndex") + ":" + std::to_string(originalIdx);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleDeleteFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_Delete) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");

    int trackIdx = atoi(trackIdxStr.c_str());
    int fxIdx    = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    bool success = m_api.TrackFX_Delete(track, fxIdx);

    // Update chain-source indices: FX at fxIdx removed, shift down
    if (success) {
        auto sit = m_trackChainSources.find(trackIdx);
        if (sit != m_trackChainSources.end()) {
            ShiftChainSourceIndices(sit->second, fxIdx, -1);
            // Clean up empty chain groups
            sit->second.erase(
                std::remove_if(sit->second.begin(), sit->second.end(),
                    [](const ChainSource& cs) { return cs.fxStartIdx >= cs.fxEndIdx; }),
                sit->second.end());
            if (sit->second.empty()) {
                m_trackChainSources.erase(sit);
            }
        }
    }

    SendResponse(
        clientId, id, success, "{\"deleted\":" + std::string(success ? "true" : "false") + "}");
}

void CommandHandler::HandleReorderFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_CopyToTrack || !m_api.TrackFX_Delete || !m_api.TrackFX_GetCount) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fromIdxStr   = parser.getString("fromIndex");
    std::string toIdxStr     = parser.getString("toIndex");

    if (trackIdxStr.empty() || fromIdxStr.empty() || toIdxStr.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing required parameters\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());
    int fromIdx  = atoi(fromIdxStr.c_str());
    int toIdx    = atoi(toIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int fxCount = m_api.TrackFX_GetCount(track);

    // Validate indices
    if (fromIdx < 0 || fromIdx >= fxCount) {
        SendResponse(clientId, id, false,
            "{\"error\":\"fromIndex out of range: " + std::to_string(fromIdx) + " (0-" + std::to_string(fxCount - 1) + ")\"}");
        return;
    }
    if (toIdx < 0 || toIdx >= fxCount) {
        SendResponse(clientId, id, false,
            "{\"error\":\"toIndex out of range: " + std::to_string(toIdx) + " (0-" + std::to_string(fxCount - 1) + ")\"}");
        return;
    }

    // No-op if moving to same position
    if (fromIdx == toIdx) {
        SendResponse(clientId, id, true,
            "{\"reordered\":true,\"trackIdx\":" + std::to_string(trackIdx)
            + ",\"fromIndex\":" + std::to_string(fromIdx)
            + ",\"toIndex\":" + std::to_string(toIdx) + "}");
        return;
    }

    // Index shift logic:
    // If toIdx < fromIdx: copy to toIdx first (shift right), then delete at fromIdx + 1
    // If toIdx > fromIdx: copy to toIdx+1 first (shift right past original), then delete at fromIdx
    int destCopyIdx = (toIdx > fromIdx) ? toIdx + 1 : toIdx;
    m_api.TrackFX_CopyToTrack(track, fromIdx, track, destCopyIdx, false);

    int deleteIdx;
    if (toIdx < fromIdx) {
        deleteIdx = fromIdx + 1;
    } else {
        deleteIdx = fromIdx;
    }

    m_api.TrackFX_Delete(track, deleteIdx);

    // Update chain-source indices for the reorder
    // Copy at destCopyIdx shifts subsequent indices by 1
    // Delete at deleteIdx shifts subsequent indices by -1
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end()) {
        // First: the copy inserts at destCopyIdx, shift everything after up
        ShiftChainSourceIndices(sit->second, destCopyIdx, 1);
        // Second: the delete at deleteIdx removes an element, shift after down
        int adjustedDeleteIdx = (toIdx > fromIdx) ? fromIdx : (fromIdx + 1);
        ShiftChainSourceIndices(sit->second, adjustedDeleteIdx, -1);
        // Clean up empty chain groups
        sit->second.erase(
            std::remove_if(sit->second.begin(), sit->second.end(),
                [](const ChainSource& cs) { return cs.fxStartIdx >= cs.fxEndIdx; }),
            sit->second.end());
        if (sit->second.empty()) {
            m_trackChainSources.erase(sit);
        }
    }

    SendResponse(clientId, id, true,
        "{\"reordered\":true,\"trackIdx\":" + std::to_string(trackIdx)
        + ",\"fromIndex\":" + std::to_string(fromIdx)
        + ",\"toIndex\":" + std::to_string(toIdx) + "}");
}

void CommandHandler::HandleGetTransport(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    bool playing   = false;
    bool recording = false;
    if (m_api.GetPlayState) {
        int state = m_api.GetPlayState();
        playing   = (state & 1) != 0;
        recording = (state & 4) != 0;
    }
    SendResponse(clientId, id, true,
        "{\"playing\":" + std::string(playing ? "true" : "false")
        + ",\"paused\":false,\"recording\":" + std::string(recording ? "true" : "false") + "}");
}

// ============================================================
// FX enumeration
// ============================================================

// Shared FX enumeration logic (extracted so both HandleEnumerateFX and
// PreCacheFX can reuse it without duplicating the loop).
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

        // Determine format from name or ident prefix
        std::string format = "VST3";
        std::string nameStr(name ? name : "");
        std::string idStr(ident ? ident : "");
        
        // Check name first — includes format prefix like "VST: ", "JS: ", etc.
        // Fall back to ident for plugins without name prefix
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

// Pre-populate FX cache at extension startup, before any WebSocket
// client connects. This avoids the crash when EnumInstalledFX is called
// from a Chromium WebSocket context (X11/SWELL display conflict).
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

void CommandHandler::HandleFxChainSearchCached(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string query    = parser.getString("query");
    std::string rootPath = parser.getString("rootPath");
    std::string offsetStr = parser.getString("offset");
    std::string limitStr  = parser.getString("limit");

    int offset = offsetStr.empty() ? 0 : atoi(offsetStr.c_str());
    int limit  = limitStr.empty()  ? 16 : atoi(limitStr.c_str());

    // If rootPath changed from cached path, re-index silently
    if (!rootPath.empty() && rootPath != m_fxChainCache.RootPath()) {
        m_fxChainCache.BuildIndex(rootPath);
    }

    // If cache isn't indexed yet, build it now
    if (!m_fxChainCache.IsIndexed() && !rootPath.empty()) {
        m_fxChainCache.BuildIndex(rootPath);
    }

    auto result = m_fxChainCache.Search(query, offset, limit);

    std::string resultsJson = "[";
    for (size_t i = 0; i < result.results.size(); i++) {
        if (i > 0) resultsJson += ",";
        resultsJson += "{";
        resultsJson += json_string("filePath") + ":" + json_string(result.results[i].filePath) + ",";
        resultsJson += json_string("name") + ":" + json_string(result.results[i].name) + ",";
        resultsJson += json_string("size") + ":" + std::to_string(result.results[i].size);
        resultsJson += "}";
    }
    resultsJson += "]";

    std::string payload = "{";
    payload += json_string("results") + ":" + resultsJson + ",";
    payload += json_string("total") + ":" + std::to_string(result.total) + ",";
    payload += json_string("offset") + ":" + std::to_string(offset) + ",";
    payload += json_string("limit") + ":" + std::to_string(limit);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainRefreshCache(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    if (rootPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'rootPath' parameter\"}");
        return;
    }

    int count = m_fxChainCache.BuildIndex(rootPath);

    std::string payload = "{";
    payload += json_string("refreshed") + ":true,";
    payload += json_string("count") + ":" + std::to_string(count);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleEnumerateFX(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    // Return cached FX list if available (pre-cached or previously enumerated)
    if (m_fxCacheValid) {
        SendResponse(clientId, id, true, "{\"fx\":" + m_fxCache + "}");
        return;
    }

    // Shouldn't normally reach this if PreCacheFX() was called at startup,
    // but handle gracefully — enumerate and cache now
    std::string fxList = RunFXEnumeration();
    SendResponse(clientId, id, true, "{\"fx\":" + fxList + "}");
}

void CommandHandler::HandleRefreshFxCache(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    m_fxCacheValid = false;
    std::string fxList = RunFXEnumeration();
    SendResponse(clientId, id, true, "{\"fx\":" + fxList + "}");
}

// ============================================================
// Track control handlers
// ============================================================

void CommandHandler::HandleSetTrackMute(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string mutedStr    = parser.getString("muted");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    bool muted = (mutedStr == "true" || mutedStr == "1");
    m_api.GetSetMediaTrackInfo(track, "B_MUTE", &muted);
    SendResponse(clientId, id, true,
        "{\"muted\":" + std::string(muted ? "true" : "false") + "}");
}

void CommandHandler::HandleSetTrackSolo(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string soloedStr   = parser.getString("soloed");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int soloed = (soloedStr == "true" || soloedStr == "1") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_SOLO", &soloed);
    SendResponse(clientId, id, true,
        "{\"soloed\":" + std::string(soloed ? "true" : "false") + "}");
}

void CommandHandler::HandleSetTrackArm(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string armedStr    = parser.getString("armed");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int armed = (armedStr == "true" || armedStr == "1") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_RECARM", &armed);
    SendResponse(clientId, id, true,
        "{\"armed\":" + std::string(armed ? "true" : "false") + "}");
}

void CommandHandler::HandleSetTrackSelected(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string selectedStr = parser.getString("selected");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    // Only SetTrackSelected — safe because it's a standalone user action
    // (I_SELECTED crash trigger is only during concurrent FX/media operations).
    // REAPER's own web interface uses the same approach via SET/TRACK/SEL.
    int selected = (selectedStr == "true" || selectedStr == "1") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_SELECTED", &selected);
    SendResponse(clientId, id, true,
        "{\"selected\":" + std::string(selected ? "true" : "false") + "}");
}

void CommandHandler::HandleSetRecordMode(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string recModeStr  = parser.getString("recMode");

    if (trackIdxStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' parameter\"}");
        return;
    }
    if (recModeStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'recMode' parameter\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());
    int recMode  = atoi(recModeStr.c_str());

    // Validate recMode: REAPER I_RECMODE range is 0-8
    // 0=input (audio), 1=stereo out, 2=none, 3=stereo out w/latency,
    // 4=MIDI output, 5=mono out, 6=mono out w/latency,
    // 7=MIDI overdub, 8=MIDI replace
    if (recMode < 0 || recMode > 8) {
        SendResponse(clientId, id, false,
            "{\"error\":\"recMode must be 0-8\"}");
        return;
    }

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Invalid track index\"}");
        return;
    }

    m_api.GetSetMediaTrackInfo(track, "I_RECMODE", &recMode);

    // Also set I_RECINPUT (record input routing) based on the mode
    // Audio mode (recMode 0-1-3-5-6): set default mono audio input (I_RECINPUT=0)
    // MIDI mode (recMode 7-8): set all MIDI inputs, all channels (I_RECINPUT=6112)
    int recInput = 0;
    if (recMode >= 7) {
        // MIDI mode: 4096(MIDI flag) | (63<<5)(all inputs) | 0(all channels) = 6112
        recInput = 6112;
    }
    m_api.GetSetMediaTrackInfo(track, "I_RECINPUT", &recInput);

    SendResponse(clientId, id, true,
        "{\"recMode\":" + std::to_string(recMode) + ",\"recInput\":" + std::to_string(recInput) + "}");
}

void CommandHandler::HandlePlay(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (m_api.CSurf_OnPlay) {
        m_api.CSurf_OnPlay();
        SendResponse(clientId, id, true, "{\"playing\":true}");
    } else if (m_api.Main_OnCommand) {
        m_api.Main_OnCommand(1007, 0); // 1007 = Transport: Play (fallback)
        SendResponse(clientId, id, true, "{\"playing\":true}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Transport API not loaded\"}");
    }
}

void CommandHandler::HandleStop(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (m_api.CSurf_OnStop) {
        m_api.CSurf_OnStop();
        SendResponse(clientId, id, true, "{\"stopped\":true}");
    } else if (m_api.Main_OnCommand) {
        m_api.Main_OnCommand(1016, 0); // 1016 = Transport: Stop (fallback)
        SendResponse(clientId, id, true, "{\"stopped\":true}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Transport API not loaded\"}");
    }
}

void CommandHandler::HandleRecord(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (m_api.CSurf_OnRecord) {
        m_api.CSurf_OnRecord();
        // Read actual state after toggling; assume true if GetPlayState unavailable
        bool recording = true;
        if (m_api.GetPlayState) {
            int state = m_api.GetPlayState();
            recording = (state & 4) != 0;
        }
        SendResponse(clientId, id, true,
            "{\"recording\":" + std::string(recording ? "true" : "false") + "}");
    } else if (m_api.Main_OnCommand) {
        m_api.Main_OnCommand(1013, 0); // 1013 = Transport: Record (fallback)
        bool recording = true;
        if (m_api.GetPlayState) {
            int state = m_api.GetPlayState();
            recording = (state & 4) != 0;
        }
        SendResponse(clientId, id, true,
            "{\"recording\":" + std::string(recording ? "true" : "false") + "}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Transport API not loaded\"}");
    }
}

// ============================================================
// Sample / media browser commands
// ============================================================

void CommandHandler::HandleSampleGetDirectory(
    int clientId, const std::string& id, const std::string& params)
{
    // Extract "path" from payload
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string path = parser.getString("path");
    if (path.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    std::string entries = "[";
    bool first = true;

    try {
        // Add parent directory entry (..) for navigation
        entries += "{\"name\":\"..\",\"type\":\"dir\",\"size\":0}";
        first = false;

        for (const auto& entry : fs::directory_iterator(path)) {
            if (!first) entries += ",";
            first = false;

            std::string entryName = entry.path().filename().string();
            std::string entryType = entry.is_directory() ? "dir" : "file";
            uintmax_t   entrySize = entry.is_regular_file()
                                         ? fs::file_size(entry.path())
                                         : 0;

            entries += "{";
            entries += json_string("name") + ":" + json_string(entryName) + ",";
            entries += json_string("type") + ":" + json_string(entryType) + ",";
            entries += json_string("size") + ":" + std::to_string(entrySize);
            entries += "}";
        }
    } catch (const fs::filesystem_error& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    entries += "]";

    std::string payload = "{";
    payload += json_string("path") + ":" + json_string(path) + ",";
    payload += json_string("entries") + ":" + entries;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// Playtime 2 / clip matrix command handlers (Issue #61)
//
// Real implementation: tracks state in PlaytimeState, sends
// MIDI via PlaytimeMidi, and pushes slotStateChanged events
// over WebSocket to all connected clients.
//
// All handlers work without REAPER — when Playtime is not
// available, they return sensible default data (8×8 empty grid)
// and MIDI operations are no-ops.
// ============================================================

void CommandHandler::HandleMatrixGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    int      columns = m_playtimeState.columns();
    int      rows    = m_playtimeState.rows();

    // When Playtime is available, attempt to find the instance
    // and auto-create one if none exists. Playtime 2 C API has no
    // clip-triggering functions — matrix commands must work via MIDI notes.
    if (isPlaytimeAvailable()) {
        int instance = m_playtimeState.findPlaytimeInstance();
        if (instance >= 0) {
            fprintf(stderr,
                "[reaper-ipad] matrix/getAll: Playtime instance %d found\n", instance);
        } else {
            // Auto-create a Playtime matrix if none exists in the project.
            // HB_CreateClipMatrix creates a new clip matrix in the given
            // Helgobox instance. We first find any Helgobox instance.
            fprintf(stderr,
                "[reaper-ipad] matrix/getAll: No Playtime instance found, attempting auto-create...\n");
            int hgInstance = -1;
            if (g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject) {
                hgInstance = g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject(nullptr);
            }
            if (hgInstance >= 0 && g_playtimeApi.HB_CreateClipMatrix) {
                g_playtimeApi.HB_CreateClipMatrix(hgInstance);
                fprintf(stderr,
                    "[reaper-ipad] matrix/getAll: Auto-created Playtime matrix on Helgobox instance %d\n", hgInstance);
            } else {
                fprintf(stderr,
                    "[reaper-ipad] matrix/getAll: Could not auto-create — no Helgobox instance or HB_CreateClipMatrix unavailable\n");
            }
        }
    }

    std::string payload = "{";
    payload += json_string("columns") + ":" + std::to_string(columns) + ",";
    payload += json_string("rows") + ":" + std::to_string(rows) + ",";
    payload += json_string("slots") + ":" + m_playtimeState.getAllSlots();
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleMatrixGetSlot(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");

    if (colStr.empty() || rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column' or 'row' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    SlotState slot = m_playtimeState.getSlot(col, row);

    SendResponse(clientId, id, true, slot.toJson());
}

// Toggle a slot between playing/stopped/empty.
// Returns the new slot state as the response payload.
void CommandHandler::HandleMatrixTriggerSlot(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");

    if (colStr.empty() || rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column' or 'row' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    if (col < 0 || col >= m_playtimeState.columns() ||
        row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Column or row out of range\"}");
        return;
    }

    // Toggle: playing → stopped, otherwise → playing
    SlotState current = m_playtimeState.getSlot(col, row);
    std::string newState;
    if (current.state == "playing") {
        newState = "stopped";
    } else {
        newState = "playing";
    }

    m_playtimeState.setSlotState(col, row, newState);

    // Send MIDI note if MIDI output is available
    if (m_playtimeMidi.isAvailable()) {
        m_playtimeMidi.triggerSlotViaMidi(col, row);
    }

    // Send OSC message for ReaLearn integration (Issue #98)
    m_oscSender.sendTriggerSlot(col, row);

    // Get updated slot and broadcast event to all clients
    SlotState updated = m_playtimeState.getSlot(col, row);
    std::string event = BuildSlotEvent(updated.toJson());
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

// Trigger (or stop) all slots in a given scene row.
void CommandHandler::HandleMatrixTriggerScene(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rowStr = parser.getString("row");

    if (rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'row' parameter\"}");
        return;
    }

    int row = atoi(rowStr.c_str());

    if (row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Row out of range\"}");
        return;
    }

    int cols = m_playtimeState.columns();

    // Toggle all slots in the row: set to "playing"
    // (or "stopped" if already playing)
    for (int c = 0; c < cols; c++) {
        SlotState current = m_playtimeState.getSlot(c, row);
        std::string newState;
        if (current.state == "playing") {
            newState = "stopped";
        } else {
            newState = "playing";
        }
        m_playtimeState.setSlotState(c, row, newState);

        // Send MIDI note for each slot
        if (m_playtimeMidi.isAvailable()) {
            m_playtimeMidi.triggerSlotViaMidi(c, row);
        }

        // Send OSC message for each slot (Issue #98)
        m_oscSender.sendTriggerSlot(c, row);

        // Broadcast event for each changed slot
        SlotState updated = m_playtimeState.getSlot(c, row);
        BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());
    }

    // Build response: return all slots in the scene row
    std::string sceneSlots = "[";
    for (int c = 0; c < cols; c++) {
        if (c > 0) sceneSlots += ",";
        sceneSlots += m_playtimeState.getSlot(c, row).toJson();
    }
    sceneSlots += "]";

    std::string payload = "{";
    payload += json_string("triggered") + ":true,";
    payload += json_string("row") + ":" + std::to_string(row) + ",";
    payload += json_string("slots") + ":" + sceneSlots;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// Set a specific slot state (used for visual state simulation in tests, Issue #83)
void CommandHandler::HandleMatrixSetSlotState(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");
    std::string state  = parser.getString("state");

    if (colStr.empty() || rowStr.empty() || state.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column', 'row', or 'state' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    if (col < 0 || col >= m_playtimeState.columns() ||
        row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Column or row out of range\"}");
        return;
    }

    // Validate state string
    if (state != "playing" && state != "recording" && state != "stopped" && state != "empty") {
        SendResponse(clientId, id, false,
            "{\"error\":\"Invalid state. Must be one of: playing, recording, stopped, empty\"}");
        return;
    }

    m_playtimeState.setSlotState(col, row, state);

    // Broadcast slot state change event to all clients
    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

// Start recording in a slot. Records state transitions:
// empty → recording, recording → stopped, stopped → recording (re-record)
// playing → error (can't record while playing)
void CommandHandler::HandleMatrixRecordSlot(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");

    if (colStr.empty() || rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column' or 'row' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    if (col < 0 || col >= m_playtimeState.columns() ||
        row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Column or row out of range\"}");
        return;
    }

    SlotState current = m_playtimeState.getSlot(col, row);
    std::string newState;

    if (current.state == "playing") {
        // Can't record on a playing slot
        SendResponse(clientId, id, false,
            "{\"error\":\"Cannot record on a playing clip. Stop the clip first.\"}");
        return;
    } else if (current.state == "recording") {
        // Stop recording → stopped (clip saved)
        newState = "stopped";
    } else {
        // empty or stopped → start recording
        newState = "recording";
    }

    m_playtimeState.setSlotState(col, row, newState);

    // Send MIDI note for recording if MIDI output is available
    // Use channel 1 (distinct from trigger channel 0) so Playtime 2
    // can distinguish between clip trigger and record actions via
    // its MIDI input mapping.
    if (m_playtimeMidi.isAvailable()) {
        int note = m_playtimeMidi.baseNote() + (row * 8) + col;
        if (note <= 127) {
            m_playtimeMidi.sendMidiNote(1, note, 100);
        }
    }

    // Send OSC message for ReaLearn integration (Issue #98)
    m_oscSender.sendRecordSlot(col, row);

    // Broadcast event to all clients
    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

// Poll Playtime 2 instance state for real-time sync.
// Returns current instance info without modifying state.
// This is called periodically from Run() and on-demand by the frontend.
void CommandHandler::HandleMatrixPollState(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    bool playtimeAvail = isPlaytimeAvailable();
    int  instanceId    = -1;
    bool hasMatrix      = false;

    if (playtimeAvail) {
        instanceId = m_playtimeState.findPlaytimeInstance();
        if (instanceId >= 0) {
            hasMatrix = true;
        }
    }

    // If Playtime is available but no instance found, try to auto-create
    if (playtimeAvail && instanceId < 0) {
        int hgInstance = -1;
        if (g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject) {
            hgInstance = g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject(nullptr);
        }
        if (hgInstance >= 0 && g_playtimeApi.HB_CreateClipMatrix) {
            g_playtimeApi.HB_CreateClipMatrix(hgInstance);
            fprintf(stderr,
                "[reaper-ipad] matrix/pollState: Auto-created Playtime matrix on Helgobox instance %d\n", hgInstance);
            instanceId = m_playtimeState.findPlaytimeInstance();
            hasMatrix = (instanceId >= 0);
        }
    }

    std::string payload = "{";
    payload += json_string("playtimeAvailable") + ":" + (playtimeAvail ? "true" : "false") + ",";
    payload += json_string("instanceId") + ":" + std::to_string(instanceId) + ",";
    payload += json_string("hasMatrix") + ":" + (hasMatrix ? "true" : "false");
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// Matrix event broadcasting helpers (Issue #61)
// ============================================================

std::string CommandHandler::BuildSlotEvent(const std::string& slotJson)
{
    std::string event = "{";
    event += json_string("type") + ":" + json_string("event") + ",";
    event += json_string("event") + ":" + json_string("matrix/slotStateChanged") + ",";
    event += json_string("payload") + ":" + slotJson;
    event += "}";
    return event;
}

void CommandHandler::BroadcastMatrixEvent(
    const std::string& eventType, const std::string& slotJson)
{
    std::string event = "{";
    event += json_string("type") + ":" + json_string("event") + ",";
    event += json_string("event") + ":" + json_string(eventType) + ",";
    event += json_string("payload") + ":" + slotJson;
    event += "}";

    if (m_broadcastCb) {
        m_broadcastCb(event);
    } else if (m_ws) {
        m_ws->Broadcast(event);
    }
}

void CommandHandler::HandleSampleSendToTrack(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("path");
    std::string trackIdxStr = parser.getString("trackIdx");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Verify file exists
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found: " + json_escape(filePath) + "\"}");
        return;
    }

    if (!m_api.InsertMedia) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia API not loaded\"}");
        return;
    }

    // Track-specific insert (avoid I_SELECTED — known crash trigger)
    int insertResult = 0;
    bool trackSpecific = false;

    if (!trackIdxStr.empty() && m_api.CountTracks) {
        int trackIdx = atoi(trackIdxStr.c_str());
        if (trackIdx >= 0 && trackIdx < m_api.CountTracks(nullptr)) {
            // Use InsertMedia with mode=512 to target absolute track index
            int insertFlags = 512 | (trackIdx << 16);
            insertResult = m_api.InsertMedia(filePath.c_str(), insertFlags);
            trackSpecific = true;
        }
    }

    if (!trackSpecific) {
        // No track specified — insert at current track
        insertResult = m_api.InsertMedia(filePath.c_str(), 0);
    }

    if (insertResult > 0) {
        SendResponse(clientId, id, true,
            "{\"inserted\":true,\"result\":" + std::to_string(insertResult) + "}");
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia returned " + std::to_string(insertResult) + "\"}");
    }
}

// ============================================================
// Sample send to Playtime clip slot (Issue #74)
// ============================================================

void CommandHandler::HandleSampleSendToSlot(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath   = parser.getString("path");
    std::string colStr     = parser.getString("column");
    std::string rowStr     = parser.getString("row");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }
    if (colStr.empty() || rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column' or 'row' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    // Validate column/row against Playtime grid
    if (col < 0 || col >= m_playtimeState.columns() ||
        row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Column or row out of range\"}");
        return;
    }

    // Verify file exists
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found: " + json_escape(filePath) + "\"}");
        return;
    }

    if (!m_api.InsertMedia || !m_api.CountTracks) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Required API functions not loaded\"}");
        return;
    }

    // Map Playtime column to track index
    int currentTrackCount = m_api.CountTracks(nullptr);
    int targetTrackIdx = col;

    // Auto-create tracks if column exceeds track count
    int tracksToCreate = (targetTrackIdx + 1) - currentTrackCount;
    for (int t = 0; t < tracksToCreate; t++) {
        if (m_api.Main_OnCommand) {
            m_api.Main_OnCommand(40001, 0); // Insert track at end
        }
    }

    // Insert media on the target track (mode=512 for absolute track index)
    int insertFlags = 512 | (targetTrackIdx << 16);
    int insertResult = m_api.InsertMedia(filePath.c_str(), insertFlags);

    if (insertResult <= 0) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia returned " + std::to_string(insertResult) + "\"}");
        return;
    }

    // Extract filename from path for the slot name
    std::string fileName = filePath;
    size_t slashPos = fileName.find_last_of("/\\");
    if (slashPos != std::string::npos) {
        fileName = fileName.substr(slashPos + 1);
    }

    // Update PlaytimeState slot metadata
    SlotState updated;
    updated.column   = col;
    updated.row      = row;
    updated.state    = "stopped";
    updated.clipType = "audio";
    updated.name     = fileName;
    updated.color    = "";
    m_playtimeState.setSlot(col, row, updated);

    // Broadcast slot state change event
    updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

// ============================================================
// Sample audio data command (Issue #27)
// ============================================================

// Base64 encode binary data
static std::string base64_encode(const uint8_t* data, size_t len)
{
    static const char* chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    for (size_t i = 0; i < len; i += 3) {
        uint32_t triple = 0;
        int remain = (int)(len - i);
        if (remain > 0) triple |= ((uint32_t)data[i]) << 16;
        if (remain > 1) triple |= ((uint32_t)data[i+1]) << 8;
        if (remain > 2) triple |= ((uint32_t)data[i+2]);
        out += chars[(triple >> 18) & 0x3F];
        out += chars[(triple >> 12) & 0x3F];
        out += (remain > 1) ? chars[(triple >> 6) & 0x3F] : '=';
        out += (remain > 2) ? chars[triple & 0x3F] : '=';
    }
    return out;
}

void CommandHandler::HandleSampleGetAudioData(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("path");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Check file existence
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found\"}");
        return;
    }

    // Check file size limit (5 MB default)
    uintmax_t fileSize = fs::file_size(filePath);
    const uintmax_t kMaxFileSize = 5 * 1024 * 1024;
    if (fileSize > kMaxFileSize) {
        std::string err = "{\"error\":\"File too large (" +
            std::to_string(fileSize / (1024 * 1024)) + " MB), max 5 MB\"}";
        SendResponse(clientId, id, false, err);
        return;
    }

    // Open file
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Cannot open file\"}");
        return;
    }

    // Read RIFF/WAV header
    struct {
        char     riff[4];
        uint32_t fileSize;
        char     wave[4];
        char     fmt[4];
        uint32_t fmtSize;
        uint16_t audioFormat;
        uint16_t numChannels;
        uint32_t sampleRate;
        uint32_t byteRate;
        uint16_t blockAlign;
        uint16_t bitsPerSample;
    } header;

    file.read(reinterpret_cast<char*>(&header), sizeof(header));
    if (!file.good() ||
        memcmp(header.riff, "RIFF", 4) != 0 ||
        memcmp(header.wave, "WAVE", 4) != 0 ||
        header.audioFormat != 1) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Not a valid PCM WAV file\"}");
        return;
    }

    // Skip to "data" chunk
    struct { char id[4]; uint32_t size; } chunk;
    uint32_t dataSize = 0;
    while (file.read(reinterpret_cast<char*>(&chunk), sizeof(chunk))) {
        if (memcmp(chunk.id, "data", 4) == 0) {
            dataSize = chunk.size;
            break;
        }
        file.seekg(chunk.size, std::ios::cur);
        if (chunk.size % 2 != 0)
            file.seekg(1, std::ios::cur);
    }

    if (dataSize == 0 || !file.good()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No audio data found in WAV file\"}");
        return;
    }

    // Read PCM data
    std::vector<uint8_t> pcmData(dataSize);
    file.read(reinterpret_cast<char*>(pcmData.data()), dataSize);
    if (!file.good() && file.gcount() < (int)dataSize) {
        pcmData.resize(file.gcount());
    }

    // Base64 encode PCM data
    std::string b64 = base64_encode(pcmData.data(), pcmData.size());

    // Build response
    std::string payload = "{";
    payload += json_string("sampleRate") + ":" + std::to_string(header.sampleRate) + ",";
    payload += json_string("channels") + ":" + std::to_string(header.numChannels) + ",";
    payload += json_string("bitDepth") + ":" + std::to_string(header.bitsPerSample) + ",";
    payload += json_string("format") + ":" + json_string("wav") + ",";
    payload += json_string("fileSize") + ":" + std::to_string(fileSize) + ",";
    payload += json_string("dataSize") + ":" + std::to_string(pcmData.size()) + ",";
    payload += json_string("data") + ":" + json_string(b64);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// Real-time track state event broadcasting (Issue #57)
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
// Step sequencer command handlers (Issue #63)
// ============================================================

void CommandHandler::HandleSequencerGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    std::string payload = "{";
    payload += json_string("columns") + ":" + std::to_string(m_sequencerState.columns()) + ",";
    payload += json_string("rows") + ":" + std::to_string(m_sequencerState.rows()) + ",";
    payload += json_string("length") + ":" + std::to_string(m_sequencerState.length()) + ",";
    payload += json_string("baseNote") + ":" + std::to_string(m_sequencerState.baseNote()) + ",";
    payload += json_string("playhead") + ":" + std::to_string(m_sequencerState.playheadPosition()) + ",";
    payload += json_string("steps") + ":" + m_sequencerState.getAllSteps();
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSequencerToggleStep(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");
    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    if (col < 0 || col >= m_sequencerState.columns() ||
        row < 0 || row >= m_sequencerState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Step out of range\"}");
        return;
    }

    bool newState = m_sequencerState.toggleStep(col, row);
    StepData step = m_sequencerState.getStep(col, row);

    std::string payload = "{";
    payload += json_string("column") + ":" + std::to_string(col) + ",";
    payload += json_string("row") + ":" + std::to_string(row) + ",";
    payload += json_string("active") + ":" + (newState ? "true" : "false") + ",";
    payload += json_string("velocity") + ":" + std::to_string(step.velocity) + ",";
    payload += json_string("note") + ":" + std::to_string(step.note);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSequencerSetStep(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr    = parser.getString("column");
    std::string rowStr    = parser.getString("row");
    std::string activeStr = parser.getString("active");
    std::string velStr    = parser.getString("velocity");
    int col    = atoi(colStr.c_str());
    int row    = atoi(rowStr.c_str());
    bool active = (activeStr == "true");
    int velocity = velStr.empty() ? 100 : atoi(velStr.c_str());

    if (col < 0 || col >= m_sequencerState.columns() ||
        row < 0 || row >= m_sequencerState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Step out of range\"}");
        return;
    }

    m_sequencerState.setStep(col, row, active, velocity);
    StepData step = m_sequencerState.getStep(col, row);

    std::string payload = "{";
    payload += json_string("column") + ":" + std::to_string(col) + ",";
    payload += json_string("row") + ":" + std::to_string(row) + ",";
    payload += json_string("active") + ":" + (step.active ? "true" : "false") + ",";
    payload += json_string("velocity") + ":" + std::to_string(step.velocity);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSequencerClearAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    m_sequencerState.clearAll();
    SendResponse(clientId, id, true, "{\"cleared\":true}");
}

void CommandHandler::HandleSequencerSetLength(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string lenStr = parser.getString("length");
    int len = atoi(lenStr.c_str());
    if (len < 1 || len > 64) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Length must be 1-64\"}");
        return;
    }
    m_sequencerState.setLength(len);
    SendResponse(clientId, id, true,
        "{\"length\":" + std::to_string(len) + "}");
}

void CommandHandler::HandleSequencerSetBaseNote(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string noteStr = parser.getString("note");
    int note = atoi(noteStr.c_str());
    if (note < 0 || note > 127) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Note must be 0-127\"}");
        return;
    }
    m_sequencerState.setBaseNote(note);
    SendResponse(clientId, id, true,
        "{\"baseNote\":" + std::to_string(note) + "}");
}

void CommandHandler::HandleSequencerGetPlayhead(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    int pos = m_sequencerState.playheadPosition();
    int len = m_sequencerState.length();
    std::string payload = "{";
    payload += json_string("playhead") + ":" + std::to_string(pos) + ",";
    payload += json_string("length") + ":" + std::to_string(len);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ============================================================
// HandleSequencerConvertToClip — Convert step sequencer pattern
// to a MIDI clip on the target track (Issue #92)
// ============================================================

void CommandHandler::HandleSequencerConvertToClip(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    // Check that required MIDI item APIs are available
    if (!m_api.CreateNewMIDIItemInProj || !m_api.MIDI_InsertNote ||
        !m_api.SetMediaItemInfo_Value || !m_api.GetMediaItemInfo_Value ||
        !m_api.GetTrack || !m_api.CountTracks) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Required MIDI API functions not loaded\"}");
        return;
    }

    // Collect all active steps from the sequencer state
    int seqLength = m_sequencerState.length();
    int cols = m_sequencerState.columns();

    // First pass: check if there are any active steps at all
    bool hasActiveSteps = false;
    for (int c = 0; c < std::min(seqLength, cols) && !hasActiveSteps; c++) {
        std::vector<StepData> colSteps = m_sequencerState.getActiveStepsAtColumn(c);
        if (!colSteps.empty()) hasActiveSteps = true;
    }

    // Edge case: empty pattern
    if (!hasActiveSteps) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No active steps to convert\",\"emptyPattern\":true}");
        return;
    }

    // Determine target track: use first track as default
    int numTracks = m_api.CountTracks(nullptr);
    if (numTracks < 1) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No tracks in project\"}");
        return;
    }
    int trackIdx = 0;
    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);

    // Calculate item length in seconds (1/8th note per step at 120 BPM defaults)
    const double stepDuration = 0.25; // 1/8th note at 120 BPM in seconds
    double itemStart = 0.0;           // Start at beginning of project
    double itemEnd = itemStart + (seqLength * stepDuration);

    // Create the MIDI item
    bool qnMode = false; // time in seconds (not quarter notes)
    MediaItem* item = m_api.CreateNewMIDIItemInProj(track, itemStart, itemEnd, &qnMode);
    if (!item) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to create MIDI item\"}");
        return;
    }

    // Get the active take from the newly created item
    MediaItem_Take* take = m_api.GetActiveTake(item);
    if (!take) {
        // If CreateNewMIDIItemInProj didn't create a take, try AddTakeToMediaItem
        if (m_api.AddTakeToMediaItem) {
            take = m_api.AddTakeToMediaItem(item);
        }
        if (!take) {
            SendResponse(clientId, id, false,
                "{\"error\":\"Failed to get MIDI take\"}");
            return;
        }
    }

    // REAPER default PPQ is 960 ticks per quarter note
    // 1/8th note = 480 PPQ ticks
    const double ppqPerStep = 480.0;

    // Insert MIDI notes for each active step
    int noteCount = 0;
    bool noSort = true; // batch insert, sort at end

    for (int c = 0; c < std::min(seqLength, cols); c++) {
        std::vector<StepData> colSteps = m_sequencerState.getActiveStepsAtColumn(c);
        for (const auto& step : colSteps) {
            double startPpq = c * ppqPerStep;
            double endPpq = startPpq + ppqPerStep;
            bool ok = m_api.MIDI_InsertNote(take, false, false,
                startPpq, endPpq, 0, step.note, step.velocity, &noSort);
            if (ok) noteCount++;
        }
    }

    // Set the item length to cover the full pattern
    double currentLen = m_api.GetMediaItemInfo_Value(item, "D_LENGTH");
    double desiredLen = seqLength * stepDuration;
    if (desiredLen > currentLen) {
        m_api.SetMediaItemInfo_Value(item, "D_LENGTH", desiredLen);
    }

    // Count items on the target track for identification
    int trackItemCount = 0;
    if (m_api.CountTrackMediaItems) {
        trackItemCount = m_api.CountTrackMediaItems(track);
    }

    // Build success response
    std::string payload = "{";
    payload += json_string("success") + ":true,";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("itemCount") + ":" + std::to_string(trackItemCount) + ",";
    payload += json_string("noteCount") + ":" + std::to_string(noteCount) + ",";
    payload += json_string("length") + ":" + std::to_string(seqLength);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// HandleSetTrackVolume (Issue #66)
// ============================================================

void CommandHandler::HandleSetTrackVolume(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string volumeStr   = parser.getString("volume");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    double volume = atof(volumeStr.c_str());
    // Clamp volume to valid range 0.0-1.0
    if (volume < 0.0) volume = 0.0;
    if (volume > 1.0) volume = 1.0;
    m_api.GetSetMediaTrackInfo(track, "D_VOL", &volume);
    // Broadcast volume change event for real-time updates
    BroadcastTrackEvent("track_volume_changed", trackIdx, volume);
    SendResponse(clientId, id, true,
        "{\"volume\":" + std::to_string(volume) + "}");
}

// ============================================================
// HandleSetTrackPan (Issue #53)
// ============================================================

void CommandHandler::HandleSetTrackPan(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string panStr      = parser.getString("pan");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    double pan = atof(panStr.c_str());
    // Clamp pan to valid range -1.0 to 1.0
    if (pan < -1.0) pan = -1.0;
    if (pan > 1.0) pan = 1.0;
    m_api.GetSetMediaTrackInfo(track, "D_PAN", &pan);
    // Broadcast pan change event for real-time updates
    BroadcastTrackEvent("track_pan_changed", trackIdx, pan);
    SendResponse(clientId, id, true,
        "{\"pan\":" + std::to_string(pan) + "}");
}

// ============================================================
// FX chain save/load commands (Issue #7)
//
// REAPER stores FX chains as .RfxChain files. These are
// extracted from the track state chunk (GetTrackStateChunk)
// which returns the full RPPXML track state containing a
// <FXCHAIN>...</FXCHAIN> section.
//
// Save: extract <FXCHAIN>...</FXCHAIN> from track chunk, write to file
// Load: read .RfxChain file, replace <FXCHAIN> in current track chunk
// ============================================================

// Helper: Find the <FXCHAIN> section in a track chunk and extract it
// Returns empty string if not found
// Helper: find next REAPER section marker (&lt; or &gt;) that appears at the
// start of a line (after optional whitespace). REAPER RPP/RfxChain format
// always places section markers at line start, so characters like < and >
// within data fields (e.g. VST quuid data like 0&lt;guid&gt;) are ignored.
// Returns npos if no more markers found.
// Sets *isOpen=true if marker is '<' (opening), false if '>' or '</...>' (closing).
// Sets *isCloseTag=true if marker is '</...>' XML-style close tag.
static size_t findNextSectionMarker(const std::string& chunk, size_t pos,
                                     bool* isOpen, bool* isCloseTag)
{
    while (pos < chunk.size()) {
        size_t lt = chunk.find('<', pos);
        size_t gt = chunk.find('>', pos);

        if (lt == std::string::npos && gt == std::string::npos)
            return std::string::npos;

        // Determine which comes first, but only if at line start
        // A character at line start means: position 0, or the previous
        // non-whitespace character before it is '\n'.
        bool ltAtLineStart = false;
        bool gtAtLineStart = false;

        if (lt != std::string::npos) {
            if (lt == 0) ltAtLineStart = true;
            else {
                // Scan backwards: all content from last \n to lt must be whitespace
                size_t scan = lt;
                while (scan > 0) {
                    --scan;
                    char c = chunk[scan];
                    if (c == '\n') { ltAtLineStart = true; break; }
                    if (c != ' ' && c != '\t') break;
                }
                if (scan == 0) ltAtLineStart = true; // start of string
            }
        }

        if (gt != std::string::npos) {
            if (gt == 0) gtAtLineStart = true;
            else {
                size_t scan = gt;
                while (scan > 0) {
                    --scan;
                    char c = chunk[scan];
                    if (c == '\n') { gtAtLineStart = true; break; }
                    if (c != ' ' && c != '\t') break;
                }
                if (scan == 0) gtAtLineStart = true;
            }
        }

        // If neither is at line start, advance past both and continue
        if (!ltAtLineStart && !gtAtLineStart) {
            size_t next = std::string::npos;
            if (lt != std::string::npos && gt != std::string::npos)
                next = std::min(lt, gt) + 1;
            else if (lt != std::string::npos)
                next = lt + 1;
            else
                next = gt + 1;

            if (next <= pos) next = pos + 1;
            pos = next;
            continue;
        }

        // At least one is at line start — pick the earliest one that qualifies
        if (gtAtLineStart && (!ltAtLineStart || gt < lt)) {
            // '>' at line start is a section close
            *isOpen = false;
            *isCloseTag = false;
            return gt;
        }

        if (ltAtLineStart) {
            if (lt + 1 < chunk.size() && chunk[lt + 1] == '/') {
                // XML-style close tag </...>
                *isOpen = false;
                *isCloseTag = true;
                return lt;
            }
            // Opening tag '<'
            *isOpen = true;
            *isCloseTag = false;
            return lt;
        }

        // Should not reach here, but just in case, advance and retry
        pos = (lt != std::string::npos ? lt : gt) + 1;
    }
    return std::string::npos;
}

static std::string extractFxChainFromChunk(const std::string& chunk)
{
    size_t start = chunk.find("<FXCHAIN");
    if (start == std::string::npos)
        return "";

    // REAPER RPPXML format: sections open with <TAG... (no > on opening line)
    // and close with > on its own line. Count depth to find matching close.
    // Only section markers at LINE START are considered (ignoring < and > in
    // data fields like VST quuid data).
    int depth = 0;
    size_t pos = start;
    while (pos < chunk.size()) {
        bool isOpen = false;
        bool isCloseTag = false;
        size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
        if (marker == std::string::npos)
            break;

        if (!isOpen) {
            // '>' at line start or XML close tag </...>
            depth--;
            if (depth == 0) {
                if (isCloseTag) {
                    // XML close tag: return up to and including the '>'
                    size_t closeGt = chunk.find('>', marker);
                    if (closeGt != std::string::npos)
                        return chunk.substr(start, closeGt - start + 1);
                }
                // Plain '>' at line start
                return chunk.substr(start, marker - start + 1);
            }
            if (isCloseTag) {
                // Move past the entire </...> tag
                size_t closeGt = chunk.find('>', marker);
                if (closeGt != std::string::npos) {
                    pos = closeGt + 1;
                } else {
                    pos = marker + 1;
                }
            } else {
                pos = marker + 1;
            }
        } else {
            // '<' at line start — opening tag
            size_t endTag = chunk.find('>', marker);
            if (endTag != std::string::npos) {
                size_t newline = chunk.find('\n', marker);
                if (newline != std::string::npos && newline < endTag) {
                    // REAPER section opener: <TAG without > on same line
                    // e.g. <FXCHAIN or <TRACK — the > is on a subsequent line
                    depth++;
                    pos = marker + 1;
                } else {
                    // Inline tag <...> — all on one line
                    std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                    // Trim trailing whitespace
                    while (!tagContent.empty() &&
                           (tagContent.back() == ' ' || tagContent.back() == '\t'))
                        tagContent.pop_back();
                    if (!tagContent.empty() && tagContent.back() == '/') {
                        // Self-closing tag <... /> — no depth change
                        pos = endTag + 1;
                    } else {
                        // Regular opening tag (inline)
                        depth++;
                        pos = endTag + 1;
                    }
                }
            } else {
                // <TAG without any > — section opener
                depth++;
                pos = marker + 1;
            }
        }
    }
    return "";
}

// Helper: Replace the <FXCHAIN> section in a track chunk
// REAPER RPPXML format: <FXCHAIN...>...> (opening tag has no >, closing is standalone >)
static std::string replaceFxChainInChunk(const std::string& chunk, const std::string& newFxChain)
{
    size_t start = chunk.find("<FXCHAIN");
    if (start == std::string::npos) {
        // No existing FXCHAIN — find the matching close > of the track section
        // and insert before it, or append at end
        size_t trackOpen = chunk.find("<TRACK");
        size_t trackClose = std::string::npos;
        if (trackOpen != std::string::npos) {
            // Find the closing > of the TRACK section using section markers
            int depth = 0;
            size_t pos = trackOpen;
            while (pos < chunk.size()) {
                bool isOpen = false;
                bool isCloseTag = false;
                size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
                if (marker == std::string::npos) break;

                if (!isOpen) {
                    depth--;
                    if (depth == 0) {
                        size_t closeGt = chunk.find('>', marker);
                        if (closeGt != std::string::npos)
                            trackClose = closeGt;
                        else
                            trackClose = marker;
                        break;
                    }
                    pos = marker + 1;
                    if (isCloseTag) {
                        size_t closeGt = chunk.find('>', marker);
                        if (closeGt != std::string::npos) pos = closeGt + 1;
                    }
                } else {
                    size_t endTag = chunk.find('>', marker);
                    if (endTag != std::string::npos) {
                        size_t newline = chunk.find('\n', marker);
                        if (newline != std::string::npos && newline < endTag) {
                            // REAPER section opener
                            depth++;
                            pos = marker + 1;
                        } else {
                            // Inline tag
                            std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                            while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                                tagContent.pop_back();
                            if (tagContent.empty() || tagContent.back() != '/') {
                                depth++;
                            }
                            pos = endTag + 1;
                        }
                    } else {
                        depth++;
                        pos = marker + 1;
                    }
                }
            }
        }
        if (trackClose != std::string::npos) {
            std::string result = chunk.substr(0, trackClose);
            result += newFxChain;
            result += "\n";
            result += chunk.substr(trackClose);
            return result;
        }
        // Fallback: append at end
        return chunk + "\n" + newFxChain;
    }

    // Find the matching closing > for this FXCHAIN section
    // Only process section markers at line start (ignoring quuid data)
    int depth = 0;
    size_t pos = start;
    size_t fxChainEnd = std::string::npos;
    while (pos < chunk.size()) {
        bool isOpen = false;
        bool isCloseTag = false;
        size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
        if (marker == std::string::npos) break;

        if (!isOpen) {
            // '>' encountered, or close tag </...>
            depth--;
            if (depth == 0) {
                // Need to find the actual '>' position for the close marker
                size_t closePos = chunk.find('>', marker);
                if (closePos != std::string::npos)
                    fxChainEnd = closePos;
                else
                    fxChainEnd = marker;
                break;
            }
            pos = marker + 1;
            // For close tags </...>, move past the > too
            if (isCloseTag) {
                size_t endGt = chunk.find('>', marker);
                if (endGt != std::string::npos) pos = endGt + 1;
            }
        } else {
            // '<' encountered (opening tag)
            // Check if > is on same line (inline) or different line (section opener)
            size_t endTag = chunk.find('>', marker);
            if (endTag != std::string::npos) {
                size_t newline = chunk.find('\n', marker);
                if (newline != std::string::npos && newline < endTag) {
                    // REAPER section opener: <TAG without > on same line
                    depth++;
                    pos = marker + 1;
                } else {
                    // Inline tag <...> — check for self-closing
                    std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                    while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                        tagContent.pop_back();
                    if (!tagContent.empty() && tagContent.back() != '/') {
                        depth++;
                    }
                    pos = endTag + 1;
                }
            } else {
                depth++;
                pos = marker + 1;
            }
        }
    }

    if (fxChainEnd != std::string::npos) {
        std::string result = chunk.substr(0, start);
        result += newFxChain;
        result += "\n";
        result += chunk.substr(fxChainEnd + 1);
        return result;
    }

    // Fallback: replace from start to end
    return chunk + "\n" + newFxChain;
}

void CommandHandler::HandleFxChainGetDirectory(
    int clientId, const std::string& id, const std::string& params)
{
    // Extract "path" from payload
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string path = parser.getString("path");
    if (path.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    std::string chains = "[";
    std::string dirs   = "[";
    bool firstChain = true;
    bool firstDir   = true;

    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            if (entry.is_directory()) {
                std::string dname = entry.path().filename().string();
                if (!firstDir) dirs += ",";
                firstDir = false;
                dirs += json_string(dname);
            } else if (entry.is_regular_file()) {
                std::string name = entry.path().filename().string();
                std::string ext;
                size_t dotPos = name.rfind('.');
                if (dotPos == std::string::npos) continue;
                ext = name.substr(dotPos);
                std::string lowerExt;
                for (char c : ext) lowerExt += tolower((unsigned char)c);
                if (lowerExt != ".rfxchain") continue;

                if (!firstChain) chains += ",";
                firstChain = false;
                uintmax_t fileSize = fs::file_size(entry.path());
                chains += "{";
                chains += json_string("name") + ":" + json_string(name) + ",";
                chains += json_string("size") + ":" + std::to_string(fileSize);
                chains += "}";
            }
        }
    } catch (const fs::filesystem_error& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    chains += "]";
    dirs   += "]";

    std::string payload = "{";
    payload += json_string("path")   + ":" + json_string(path) + ",";
    payload += json_string("chains") + ":" + chains + ",";
    payload += json_string("dirs")   + ":" + dirs;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainSave(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrackStateChunk || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string filePath    = parser.getString("filePath");

    if (trackIdxStr.empty() || filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' or 'filePath' parameter\"}");
        return;
    }

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    std::vector<char> chunkBuf(4 * 1024 * 1024, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), (int)chunkBuf.size(), false);
    if (!gotChunk || chunkBuf[0] == 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to get track state chunk\"}");
        return;
    }

    std::string chunk(chunkBuf.data());
    std::string fxChain = extractFxChainFromChunk(chunk);
    if (fxChain.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"No FX chain found on track\"}");
        return;
    }

    // Write the FX chain to file
    // Ensure parent directory exists
    try {
        fs::path parentDir = fs::path(filePath).parent_path();
        if (!parentDir.empty() && !fs::exists(parentDir)) {
            fs::create_directories(parentDir);
        }

        FILE* f = fopen(filePath.c_str(), "w");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("Failed to open file for writing: " + filePath) + "}");
            return;
        }
        fwrite(fxChain.c_str(), 1, fxChain.size(), f);
        fclose(f);

        SendResponse(clientId, id, true,
            "{\"saved\":true,\"filePath\":" + json_string(filePath) + "}");
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
    }
}

void CommandHandler::HandleFxChainLoad(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string filePath    = parser.getString("filePath");
    std::string modeStr     = parser.getString("mode"); // "replace" (default) or "append"

    if (trackIdxStr.empty() || filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' or 'filePath' parameter\"}");
        return;
    }

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // Capture old FX count for chain-source tracking
    int oldFxCount = 0;
    if (m_api.TrackFX_GetCount) {
        oldFxCount = m_api.TrackFX_GetCount(track);
    }

    // Read the .RfxChain file
    std::string fxChain;
    try {
        FILE* f = fopen(filePath.c_str(), "r");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("File not found: " + filePath) + "}");
            return;
        }
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            fxChain.append(buf, nread);
        }
        fclose(f);
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    if (fxChain.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Empty FX chain file\"}");
        return;
    }

    // Get current track chunk — use heap buffer; 64KB is too small for tracks with plugins
    const int CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
    std::vector<char> chunkBuf(CHUNK_SIZE, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), CHUNK_SIZE, false);
    if (!gotChunk || chunkBuf[0] == 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to get track state chunk\"}");
        return;
    }

    std::string currentChunk(chunkBuf.data());
    std::string newChunk;

    bool append = (modeStr == "append");

    // REAPER's native .RfxChain files contain just the raw body (no outer tag).
    // The track chunk expects a full <FXCHAIN\n...\n> block.
    // If the file already has a <FXCHAIN wrapper (e.g. saved by this app), extract it.
    // Otherwise wrap the raw body.
    std::string loadedFxChain;
    std::string extracted = extractFxChainFromChunk(fxChain);
    if (!extracted.empty()) {
        loadedFxChain = extracted;
    } else {
        // Raw body — wrap it so replaceFxChainInChunk can splice it correctly
        loadedFxChain = "<FXCHAIN\n" + fxChain;
        if (loadedFxChain.back() != '\n') loadedFxChain += '\n';
        loadedFxChain += '>';
    }

    if (append) {
        // Append: load current FX chain, append new FX to it
        std::string currentFxChain = extractFxChainFromChunk(currentChunk);
        if (!currentFxChain.empty()) {
            // Merge: take the opening <FXCHAIN...> from current, add the
            // <ITEM> entries from loaded, find the closing > of FXCHAIN
            // REAPER format: <FXCHAIN\n  ...\n  <ITEM ...>\n>
            // The closing > is on its own line after all ITEMs
            size_t currentClose = currentFxChain.rfind('\n');
            if (currentClose != std::string::npos && currentClose > 0) {
                // Trim trailing whitespace from the line before last
                size_t trim = currentClose;
                while (trim > 0 && (currentFxChain[trim-1] == ' ' || currentFxChain[trim-1] == '\t' || currentFxChain[trim-1] == '\n' || currentFxChain[trim-1] == '\r'))
                    trim--;
                // The closing > is on the last line - everything before it is the FX list
                // Check if the last non-empty line is just ">"
                size_t lastLineStart = currentFxChain.rfind('\n', currentClose - 1);
                if (lastLineStart == std::string::npos) lastLineStart = 0;
                std::string lastLine = currentFxChain.substr(lastLineStart, currentClose - lastLineStart);
                // Trim whitespace from last line
                size_t first = lastLine.find_first_not_of(" \t\n\r");
                if (first != std::string::npos && lastLine[first] == '>') {
                    // The closing > is on its own line - use everything before it
                    currentClose = lastLineStart;
                }
            }
            
            // Find ITEM entries in the loaded chain
            size_t loadedStart = loadedFxChain.find("<ITEM");
            if (loadedStart != std::string::npos && currentClose != std::string::npos) {
                std::string merged = currentFxChain.substr(0, currentClose);
                // Add the new ITEM entries (without the opening <FXCHAIN and closing >)
                merged += loadedFxChain.substr(loadedStart);
                newChunk = replaceFxChainInChunk(currentChunk, merged);
            } else {
                newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
            }
        } else {
            newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
        }
    } else {
        // Replace: just swap the FXCHAIN section
        newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
    }

    // Write the new track state chunk
    bool ok = m_api.SetTrackStateChunk(track, newChunk.c_str(), false);
    if (ok) {
        // Record chain-source tracking
        if (m_api.TrackFX_GetCount) {
            int newFxCount = m_api.TrackFX_GetCount(track);
            ChainSource cs;
            cs.filePath = filePath;
            if (append) {
                cs.fxStartIdx = oldFxCount;
                cs.fxEndIdx = newFxCount;
            } else {
                cs.fxStartIdx = 0;
                cs.fxEndIdx = newFxCount;
            }
            // Replace any existing chain source for this track (if replacing)
            // or append a new one
            if (!append || m_trackChainSources.find(trackIdx) == m_trackChainSources.end()) {
                m_trackChainSources[trackIdx] = {cs};
            } else {
                m_trackChainSources[trackIdx].push_back(cs);
            }
        }

        SendResponse(clientId, id, true,
            "{\"loaded\":true,\"filePath\":" + json_string(filePath) + ",\"append\":"
                + (append ? "true" : "false") + "}");
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to set track state chunk\"}");
    }
}

void CommandHandler::HandleFxChainGetInfo(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("filePath");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' parameter\"}");
        return;
    }

    // Read the .RfxChain file
    std::string content;
    try {
        FILE* f = fopen(filePath.c_str(), "r");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("File not found: " + filePath) + "}");
            return;
        }
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            content.append(buf, nread);
        }
        fclose(f);
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    // Parse the FXCHAIN: count FX entries and extract names
    // .RfxChain files use plugin-type tags like <VST, <VST3, <JS, <AU
    int fxCount = 0;
    std::string fxNames = "[";
    size_t pos = 0;
    bool first = true;

    // Helper to find the next plugin tag, handling <VST vs <VST3 overlap
    auto findNextPluginTag = [&](size_t from) -> size_t {
        size_t vstPos  = content.find("<VST ", from);
        size_t vst3Pos = content.find("<VST3", from);
        size_t jsPos   = content.find("<JS ", from);
        size_t auPos   = content.find("<AU ", from);
        size_t best = std::string::npos;
        if (vstPos != std::string::npos)  best = vstPos;
        if (vst3Pos != std::string::npos && (best == std::string::npos || vst3Pos < best)) best = vst3Pos;
        if (jsPos != std::string::npos && (best == std::string::npos || jsPos < best)) best = jsPos;
        if (auPos != std::string::npos && (best == std::string::npos || auPos < best)) best = auPos;
        return best;
    };

    pos = findNextPluginTag(0);
    while (pos != std::string::npos) {
        fxCount++;

        // Extract plugin name from quoted string after tag: e.g. <VST "VST: ReaEQ (Cockos)"
        size_t quote1 = content.find('"', pos);
        if (quote1 != std::string::npos) {
            size_t quote2 = content.find('"', quote1 + 1);
            if (quote2 != std::string::npos) {
                std::string fxName = content.substr(quote1 + 1, quote2 - quote1 - 1);
                if (!first) fxNames += ",";
                first = false;
                fxNames += json_string(fxName);
            }
        }

        // Move past the closing > of this plugin's opening tag
        size_t tagClose = content.find(">", pos);
        if (tagClose == std::string::npos) break;

        // Find the next plugin tag
        pos = findNextPluginTag(tagClose + 1);
    }
    fxNames += "]";

    // Get file info
    uintmax_t fileSize = 0;
    try {
        fileSize = fs::file_size(filePath);
    } catch (...) {
        fileSize = 0;
    }

    std::string payload = "{";
    payload += json_string("filePath") + ":" + json_string(filePath) + ",";
    payload += json_string("fxCount") + ":" + std::to_string(fxCount) + ",";
    payload += json_string("fxNames") + ":" + fxNames + ",";
    payload += json_string("fileSize") + ":" + std::to_string(fileSize);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainSearchRecursive(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string query    = parser.getString("query");
    std::string rootPath = parser.getString("rootPath");

    if (rootPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"rootPath\\\" parameter\"}");
        return;
    }

    // --- Use cached search when available (zero IO) ---
    // If the cache is indexed for this rootPath, query it instead of walking the
    // filesystem. This is the preferred path — fxchain/searchCached should be
    // used by new clients, but we keep searchRecursive working via cache for
    // backward compatibility.
    if (m_fxChainCache.IsIndexed() && m_fxChainCache.RootPath() == rootPath) {
        auto result = m_fxChainCache.Search(query, 0, 0);
        std::string results = "[";
        for (size_t i = 0; i < result.results.size(); i++) {
            if (i > 0) results += ",";
            results += "{";
            results += json_string("filePath") + ":" + json_string(result.results[i].filePath) + ",";
            results += json_string("name") + ":" + json_string(result.results[i].name) + ",";
            results += json_string("size") + ":" + std::to_string(result.results[i].size);
            results += "}";
        }
        results += "]";

        std::string payload = "{";
        payload += json_string("results") + ":" + results;
        payload += "}";
        SendResponse(clientId, id, true, payload);
        return;
    }

    // --- Fallback: legacy recursive directory scan ---
    // Only reached when cache is unavailable (e.g., first call before startup
    // cache is built, or rootPath changed).
    // @deprecated in favor of fxchain/searchCached.
    std::string lowerQuery;
    for (char c : query) lowerQuery += tolower((unsigned char)c);

    std::string results = "[";
    bool first = true;

    try {
        for (const auto& entry : fs::recursive_directory_iterator(rootPath)) {
            if (!entry.is_regular_file()) continue;

            std::string name = entry.path().filename().string();
            std::string ext;
            size_t dotPos = name.rfind('.');
            if (dotPos == std::string::npos) continue;
            ext = name.substr(dotPos);
            std::string lowerExt;
            for (char c : ext) lowerExt += tolower((unsigned char)c);
            if (lowerExt != ".rfxchain") continue;

            if (!lowerQuery.empty()) {
                std::string lowerName;
                for (char c : name) lowerName += tolower((unsigned char)c);
                std::string relPath = entry.path().lexically_relative(rootPath).string();
                std::string lowerRelPath;
                for (char c : relPath) lowerRelPath += tolower((unsigned char)c);
                if (lowerName.find(lowerQuery) == std::string::npos &&
                    lowerRelPath.find(lowerQuery) == std::string::npos) continue;
            }

            if (!first) results += ",";
            first = false;

            uintmax_t fileSize = 0;
            std::error_code ec;
            fileSize = fs::file_size(entry.path(), ec);
            results += "{";
            results += json_string("filePath") + ":" + json_string(entry.path().string()) + ",";
            results += json_string("name") + ":" + json_string(name) + ",";
            results += json_string("size") + ":" + std::to_string(fileSize);
            results += "}";
        }
    } catch (const fs::filesystem_error&) {
        results = "[";
        first = true;
    }

    results += "]";

    std::string payload = "{";
    payload += json_string("results") + ":" + results;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// Recursive FX chain search across all subdirectories (Issue #93)
// ============================================================

// ============================================================
// Real-time FX param change via CSURF_EXT callback (Issue #58)
// ============================================================

void CommandHandler::SetWatchedFX(int trackIdx, int fxIdx)
{
    // Just store which FX the frontend is viewing.
    // REAPER will push param changes via CSURF_EXT_SETFXPARAM callback.
    m_watchedTrackIdx = trackIdx;
    m_watchedFxIdx    = fxIdx;
}

void CommandHandler::ClearWatchedFX()
{
    m_watchedTrackIdx = -1;
    m_watchedFxIdx    = -1;
}

// ============================================================
// MIDI event recording (Issue #90)
// ============================================================

// Construct a MIDI_event_t from midi/event command parameters.
// Returns the event with frame_offset filled in based on current
// playback position and sample rate.
static MIDI_event_t BuildMidiEvent(const std::string& eventType, int channel,
    int data1, int data2, double playPos, double sampleRate)
{
    MIDI_event_t evt;
    memset(&evt, 0, sizeof(evt));

    // frame_offset: samples since the recording started.
    // If recording hasn't started yet (playPos <= 0), use 0.
    if (playPos > 0.0 && sampleRate > 0.0) {
        evt.frame_offset = (int)(playPos * sampleRate);
    } else {
        evt.frame_offset = 0;
    }

    if (eventType == "cc") {
        // Control Change: 0xB0 | channel
        evt.midi_message[0] = 0xB0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // controller number
        evt.midi_message[2] = data2 & 0x7F;     // value
        evt.size = 3;
    } else if (eventType == "noteon") {
        evt.midi_message[0] = 0x90 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // note
        evt.midi_message[2] = data2 & 0x7F;     // velocity
        evt.size = 3;
    } else if (eventType == "noteoff") {
        evt.midi_message[0] = 0x80 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // note
        evt.midi_message[2] = data2 & 0x7F;     // velocity
        evt.size = 3;
    } else if (eventType == "pitchbend") {
        // Pitch Bend: 0xE0 | channel, 14-bit value (0-16383)
        evt.midi_message[0] = 0xE0 | (channel & 0x0F);
        int pb14 = data1 & 0x3FFF;   // 14-bit value
        evt.midi_message[1] = pb14 & 0x7F;        // LSB
        evt.midi_message[2] = (pb14 >> 7) & 0x7F; // MSB
        evt.size = 3;
    } else if (eventType == "aftertouch") {
        // Polyphonic Aftertouch: 0xA0 | channel
        evt.midi_message[0] = 0xA0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // note
        evt.midi_message[2] = data2 & 0x7F;     // pressure
        evt.size = 3;
    } else if (eventType == "programchange") {
        // Program Change: 0xC0 | channel
        evt.midi_message[0] = 0xC0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // program number
        evt.size = 2;
    } else if (eventType == "channelpressure") {
        // Channel Pressure: 0xD0 | channel
        evt.midi_message[0] = 0xD0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;     // pressure
        evt.size = 2;
    } else if (eventType == "raw") {
        // Raw MIDI bytes: data1=status, data2=first data byte (or 0 if 1-byte msg)
        evt.midi_message[0] = data1 & 0xFF;
        evt.midi_message[1] = data2 & 0xFF;
        evt.midi_message[2] = 0;
        // Determine size from status byte
        int statusHigh = (data1 >> 4) & 0x0F;
        if (statusHigh == 0xC || statusHigh == 0xD) {
            evt.size = 2; // program change, channel pressure
        } else if (statusHigh >= 0x8 && statusHigh <= 0xE) {
            evt.size = 3; // note on/off, CC, pitch bend, aftertouch
        } else if (statusHigh == 0xF) {
            evt.size = 1; // system messages (simplified)
        } else {
            evt.size = 3;
        }
    }

    return evt;
}

void CommandHandler::HandleMidiEvent(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    // Parse the event payload from the message
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string eventType = parser.getString("type");
    std::string channelStr = parser.getString("channel");
    std::string data1Str = parser.getString("data1");
    std::string data2Str = parser.getString("data2");

    // Also support 'value' as an alias for data2 (for CC events)
    if (data2Str.empty()) {
        data2Str = parser.getString("value");
    }
    // Also support 'controller' as an alias for data1 (for CC events)
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

    // Validate channel
    if (channel < 0 || channel > 15) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Channel must be 0-15\"}");
        return;
    }

    // Check if we're recording and can inject into MIDI takes
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
        double sampleRate = 44100.0; // fallback

        for (int t = 0; t < numTracks && !injectedToRecordingTake; t++) {
            MediaTrack* track = m_api.GetTrack(nullptr, t);
            if (!track) continue;

            // Check if track is record-armed
            int* armState = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECARM", nullptr);
            if (!armState || *armState == 0) continue;

            // Iterate all items and try to inject MIDI events into any take
            // whose source supports PCM_SOURCE_EXT_ADDMIDIEVENTS.
            // We cannot reliably match items to tracks without
            // GetMediaItemInfo_Value (which is avoided due to known
            // Reaper crash issues with I_SELECTED). Instead, we try all
            // items for each armed track — the operation is idempotent.
            int numItems = m_api.CountMediaItems(nullptr);
            for (int i = 0; i < numItems && !injectedToRecordingTake; i++) {
                MediaItem* item = m_api.GetMediaItem(nullptr, i);
                if (!item) continue;

                MediaItem_Take* take = m_api.GetActiveTake(item);
                if (!take) continue;

                PCM_source* source = m_api.GetMediaItemTake_Source(take);
                if (!source) continue;

                // Build the MIDI event
                MIDI_event_t evt = BuildMidiEvent(
                    eventType, channel, data1, data2, playPos, sampleRate);

                // Create a MIDI_eventlist with our event
                MIDI_eventlist* eventList = m_api.MIDI_eventlist_Create();
                if (!eventList) continue;

                eventList->AddItem(&evt);

                // Build the realtime write struct
                midi_realtime_write_struct_t writeStruct;
                memset(&writeStruct, 0, sizeof(writeStruct));
                writeStruct.global_time = playPos;
                writeStruct.global_item_time = playPos;
                writeStruct.srate = sampleRate;
                writeStruct.length = 0; // length in samples (0 = minimal)
                writeStruct.overwritemode = -1; // literal (just add, no curves)
                writeStruct.events = eventList;
                writeStruct.item_playrate = 1.0;
                writeStruct.latency = 0.0;
                writeStruct.overwrite_actives = nullptr;
                writeStruct.do_not_quantize_past_sec = 0.0;

                // Try to inject the events
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

    // If recording but couldn't inject, still send the event to MIDI output
    // for live monitoring purposes
    std::string payload = "{";
    payload += "\"sent\":true,";
    payload += "\"injected\":" + std::string(injectedToRecordingTake ? "true" : "false") + ",";
    payload += "\"recording\":" + std::string(isRecording ? "true" : "false");
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

// ============================================================
// Chain-source index maintenance helpers (Issue #95)
// ============================================================

// Adjust chain-source indices when FX are added/removed/reordered
// beforeIndex: the index of the added/removed/moved FX
// delta: +1 for add, -1 for delete/reorder-away
void CommandHandler::ShiftChainSourceIndices(
    std::vector<ChainSource>& sources, int beforeIndex, int delta)
{
    for (auto& cs : sources) {
        if (cs.fxStartIdx >= beforeIndex) {
            cs.fxStartIdx += delta;
            cs.fxEndIdx += delta;
        } else if (cs.fxEndIdx > beforeIndex) {
            // The modification is inside this chain group
            cs.fxEndIdx += delta;
        }
    }
}

// ============================================================
// doLoadChain — Internal chain-load helper (Issue #95)
// ============================================================

bool CommandHandler::doLoadChain(int trackIdx, const std::string& filePath, const std::string& direction)
{
    if (!m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk || !m_api.GetTrack) {
        return false;
    }

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) return false;

    std::string targetPath = filePath;

    if (!direction.empty() && direction != "none") {
        // Direction-based cycling: compute next/prev chain path
        fs::path currentDir = fs::path(filePath).parent_path();
        if (!fs::exists(currentDir)) return false;

        std::vector<std::string> chainFiles;
        try {
            for (const auto& entry : fs::directory_iterator(currentDir)) {
                if (!entry.is_regular_file()) continue;
                std::string name = entry.path().filename().string();
                std::string ext;
                size_t dotPos = name.rfind('.');
                if (dotPos == std::string::npos) continue;
                ext = name.substr(dotPos);
                std::string lowerExt;
                for (char c : ext) lowerExt += tolower((unsigned char)c);
                if (lowerExt != ".rfxchain") continue;
                chainFiles.push_back(entry.path().string());
            }
        } catch (...) {
            return false;
        }

        if (chainFiles.empty()) return false;

        std::sort(chainFiles.begin(), chainFiles.end());

        // Find current index
        int currentIdx = -1;
        for (size_t i = 0; i < chainFiles.size(); i++) {
            if (chainFiles[i] == filePath) {
                currentIdx = (int)i;
                break;
            }
        }
        if (currentIdx < 0) return false;

        if (direction == "next") {
            int nextIdx = (currentIdx + 1) % (int)chainFiles.size();
            targetPath = chainFiles[nextIdx];
        } else if (direction == "prev") {
            int prevIdx = (currentIdx - 1 + (int)chainFiles.size()) % (int)chainFiles.size();
            targetPath = chainFiles[prevIdx];
        } else {
            return false;
        }
    }

    // Read the target chain file
    std::string fxChain;
    try {
        FILE* f = fopen(targetPath.c_str(), "r");
        if (!f) return false;
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            fxChain.append(buf, nread);
        }
        fclose(f);
    } catch (...) {
        return false;
    }

    if (fxChain.empty()) return false;

    // Get current track chunk
    const int CHUNK_SIZE = 4 * 1024 * 1024;
    std::vector<char> chunkBuf(CHUNK_SIZE, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), CHUNK_SIZE, false);
    if (!gotChunk || chunkBuf[0] == 0) return false;

    std::string currentChunk(chunkBuf.data());

    // Wrap the loaded chain if needed
    std::string loadedFxChain;
    std::string extracted = extractFxChainFromChunk(fxChain);
    if (!extracted.empty()) {
        loadedFxChain = extracted;
    } else {
        loadedFxChain = "<FXCHAIN\n" + fxChain;
        if (loadedFxChain.back() != '\n') loadedFxChain += '\n';
        loadedFxChain += '>';
    }

    std::string newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
    bool ok = m_api.SetTrackStateChunk(track, newChunk.c_str(), false);

    if (ok && m_api.TrackFX_GetCount) {
        // Record chain-source tracking
        int newFxCount = m_api.TrackFX_GetCount(track);
        ChainSource cs;
        cs.filePath = targetPath;
        cs.fxStartIdx = 0;
        cs.fxEndIdx = newFxCount;
        m_trackChainSources[trackIdx] = {cs};
    }

    return ok;
}

// ============================================================
// HandleFxChainCycle — Cycle through chains (Issue #95)
// ============================================================

void CommandHandler::HandleFxChainCycle(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string direction   = parser.getString("direction"); // "next" or "prev"
    std::string chainPath   = parser.getString("chainPath"); // optional: explicit path

    if (trackIdxStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' parameter\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());

    // Determine the current chain path from chain-source tracking
    std::string currentPath;
    auto it = m_trackChainSources.find(trackIdx);
    if (it != m_trackChainSources.end() && !it->second.empty()) {
        currentPath = it->second[0].filePath;
    }
    if (currentPath.empty() && !chainPath.empty()) {
        currentPath = chainPath;
    }

    if (currentPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No chain loaded on this track\"}");
        return;
    }

    std::string directionArg = direction;
    if (chainPath.empty() && !direction.empty() && currentPath.empty()) {
        directionArg.clear();
    }

    bool ok = doLoadChain(trackIdx, currentPath, directionArg);
    if (ok) {
        // Get updated FX list
        std::string fxList = "[]";
        MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
        if (track && m_api.TrackFX_GetCount && m_api.TrackFX_GetFXName) {
            int fxCount = m_api.TrackFX_GetCount(track);
            fxList = "[";
            for (int i = 0; i < fxCount; i++) {
                if (i > 0) fxList += ",";
                char name[512] = {0};
                m_api.TrackFX_GetFXName(track, i, name, sizeof(name));
                fxList += "{";
                fxList += json_string("index") + ":" + std::to_string(i) + ",";
                fxList += json_string("name") + ":" + json_string(name);
                // Determine chain path for this FX
                std::string cp;
                auto cit = m_trackChainSources.find(trackIdx);
                if (cit != m_trackChainSources.end()) {
                    for (const auto& cs : cit->second) {
                        if (i >= cs.fxStartIdx && i < cs.fxEndIdx) {
                            cp = cs.filePath;
                            break;
                        }
                    }
                }
                if (!cp.empty()) {
                    fxList += "," + json_string("chainPath") + ":" + json_string(cp);
                } else {
                    fxList += "," + json_string("chainPath") + ":null";
                }
                fxList += "}";
            }
            fxList += "]";
        }

        std::string payload = "{";
        payload += json_string("cycled") + ":true,";
        payload += json_string("fx") + ":" + fxList;
        payload += "}";
        SendResponse(clientId, id, true, payload);
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to cycle chain\"}");
    }
}

void CommandHandler::OnFxParamChanged(MediaTrack* track, int fxIdx, int paramIdx, double value)
{
    if (m_watchedTrackIdx < 0 || m_watchedFxIdx < 0)
        return;

    // Convert track pointer to index for comparison
    int trackIdx = -1;
    if (m_api.CSurf_TrackToID) {
        trackIdx = m_api.CSurf_TrackToID(track, false) - 1;
    }
    if (trackIdx != m_watchedTrackIdx || fxIdx != m_watchedFxIdx)
        return;

    // Suppress broadcasting param changes that WE just made ourselves
    // (Issue #73). When TrackFX_SetParam succeeds, REAPER fires this
    // callback with its internal stored value (which may differ from what
    // we sent due to quantization/stepping). The frontend already received
    // the committed value via the setFxParam response, so broadcasting this
    // event would overwrite the correct value with REAPER's version.
    if (m_lastSetParam.trackIdx == trackIdx &&
        m_lastSetParam.fxIdx == fxIdx &&
        m_lastSetParam.paramIdx == paramIdx) {
        // Clear the tracking for this param
        m_lastSetParam = {-1, -1, -1};
        return;
    }

    // Get param name for the event
    char name[256] = { 0 };
    if (m_api.TrackFX_GetParamName) {
        m_api.TrackFX_GetParamName(track, fxIdx, paramIdx, name, sizeof(name));
    }

    // Get min/max/mid for the event
    double minVal = 0, maxVal = 0, midVal = 0;
    if (m_api.TrackFX_GetParamEx) {
        m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &minVal, &maxVal, &midVal);
    }
    // Convert normalized to actual display value (consistent with HandleGetFXParams)
    double actualVal = minVal + value * (maxVal - minVal);

    // Get the formatted value for this param (Issue #73)
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
// Playtime 2 API - isAvailable command
// ============================================================
void CommandHandler::HandlePlaytimeIsAvailable(
    int clientId, const std::string& id, const std::string& /* params */)
{
    bool available = isPlaytimeAvailable();

    // Build version info
    std::string versionInfo = "unknown";
    if (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject) {
        versionInfo = "HB_FindFirstPlaytimeHelgoboxInstanceInProject: yes";
        if (g_playtimeApi.HB_CreateClipMatrix) versionInfo += ", HB_CreateClipMatrix: yes";
        if (g_playtimeApi.HB_ShowOrHidePlaytime) versionInfo += ", HB_ShowOrHidePlaytime: yes";
    }

    std::string payload = "{\"available\":";
    payload += (available ? "true" : "false");
    payload += ",\"version\":\"";
    payload += json_escape(versionInfo);
    payload += "\"";
    if (!available) {
        payload += ",\"reason\":\"";
        if (g_playtimeApi.HB_FindFirstHelgoboxInstanceInProject) {
            payload += "Playtime API not registered (Helgobox installed but Playtime API missing)";
        } else {
            payload += "Helgobox API not registered";
        }
        payload += "\"";
    }
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ============================================================
// FX/chain tag command handlers (Issue #97)
// ============================================================

void CommandHandler::HandleFxTagsGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    std::string tagsJson = m_fxTagStorage.GetAllTagsJson();
    SendResponse(clientId, id, true, tagsJson);
}

void CommandHandler::HandleFxTagsSet(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string target = parser.getString("target"); // "fx" or "chain"
    std::string ident  = parser.getString("ident");  // FX ident or chain file path

    if (target.empty() || ident.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'target' or 'ident' parameter\"}");
        return;
    }

    if (target != "fx" && target != "chain") {
        SendResponse(clientId, id, false,
            "{\"error\":\"target must be 'fx' or 'chain'\"}");
        return;
    }

    // Parse tags array from payload
    // The payload looks like: {"target":"fx","ident":"ident","tags":["a","b"]}
    // Extract the tags array using a secondary parse
    // Simplest: re-extract the full payload and look for "tags" array
    std::vector<std::string> tags;
    {
        // Find the tags key in the raw payload
        size_t tagsPos = payloadStr.find("\"tags\"");
        if (tagsPos != std::string::npos) {
            // Find the '[' character after "tags":
            size_t colonPos = payloadStr.find(':', tagsPos);
            if (colonPos != std::string::npos) {
                size_t arrStart = payloadStr.find('[', colonPos);
                if (arrStart != std::string::npos) {
                    size_t arrEnd = payloadStr.find(']', arrStart);
                    if (arrEnd != std::string::npos) {
                        std::string arrContent = payloadStr.substr(arrStart + 1, arrEnd - arrStart - 1);
                        // Parse comma-separated quoted strings
                        size_t p = 0;
                        while (p < arrContent.size()) {
                            // Skip whitespace
                            while (p < arrContent.size() && (arrContent[p] == ' ' || arrContent[p] == '\t')) p++;
                            if (p >= arrContent.size()) break;
                            if (arrContent[p] == ',') { p++; continue; }
                            // Expect quoted string
                            if (arrContent[p] == '"') {
                                p++; // skip opening quote
                                std::string tag;
                                while (p < arrContent.size() && arrContent[p] != '"') {
                                    if (arrContent[p] == '\\' && p + 1 < arrContent.size()) {
                                        p++;
                                        tag += arrContent[p++];
                                    } else {
                                        tag += arrContent[p++];
                                    }
                                }
                                if (p < arrContent.size()) p++; // skip closing quote
                                tags.push_back(tag);
                            } else {
                                p++; // skip unexpected char
                            }
                        }
                    }
                }
            }
        }
    }

    if (target == "fx") {
        m_fxTagStorage.SetFxTags(ident, tags);
    } else {
        m_fxTagStorage.SetChainTags(ident, tags);
    }

    // Persist to disk
    try {
        m_fxTagStorage.Save();
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to save tags: " + json_escape(e.what()) + "\"}");
        return;
    }

    SendResponse(clientId, id, true, "{\"saved\":true}");
}

// ============================================================
// Playtime 2 launch command (Issue #88)
// ============================================================
void CommandHandler::HandlePlaytimeLaunch(
    int clientId, const std::string& id, const std::string& /* params */)
{
    // Attempt to launch/show Playtime 2 by calling HB_ShowOrHidePlaytime
    // on the first available Helgobox/Playtime instance.
    bool launched = false;
    std::string message;

    if (isPlaytimeAvailable()) {
        // Find the first Playtime/Helgobox instance in the current project
        int instance = g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject(nullptr);
        if (instance >= 0 && g_playtimeApi.HB_ShowOrHidePlaytime) {
            g_playtimeApi.HB_ShowOrHidePlaytime(instance);
            launched = true;
            message = "Playtime 2 launched";
            fprintf(stderr, "[reaper-ipad] Playtime 2 launched (instance %d)\n", instance);
        } else {
            message = "Playtime instance not found or HB_ShowOrHidePlaytime unavailable";
            fprintf(stderr, "[reaper-ipad] Playtime launch failed: instance=%d, HB_ShowOrHidePlaytime=%p\n",
                instance, (void*)g_playtimeApi.HB_ShowOrHidePlaytime);
        }
    } else {
        // Retry resolution in case Helgobox registered after our startup
        retryPlaytimeApi();
        if (isPlaytimeAvailable()) {
            // Retry succeeded — try to launch
            int instance = g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject(nullptr);
            if (instance >= 0 && g_playtimeApi.HB_ShowOrHidePlaytime) {
                g_playtimeApi.HB_ShowOrHidePlaytime(instance);
                launched = true;
                message = "Playtime 2 launched (after retry)";
                fprintf(stderr, "[reaper-ipad] Playtime 2 launched after retry (instance %d)\n", instance);
            } else {
                message = "Playtime API available but instance or ShowOrHide function not ready";
            }
        } else {
            message = "Playtime 2 API not available \u2014 Helgobox may not be loaded";
            fprintf(stderr, "[reaper-ipad] Playtime 2 not available: cannot launch\n");
        }
    }

    std::string payload = "{";
    payload += json_string("launched") + ":" + (launched ? "true" : "false") + ",";
    payload += json_string("message") + ":" + json_string(message);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

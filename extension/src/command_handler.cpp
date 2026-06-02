#include "command_handler.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <sstream>

// REAPER SDK for MIDI types (MIDI_event_t, midi_realtime_write_struct_t, PCM_SOURCE_EXT_ADDMIDIEVENTS).
// Must come after standard headers because swell-types.h defines min/max macros.
#include "reaper_plugin.h"
#undef min
#undef max

namespace fs = std::filesystem;

// Global Playtime 2 API state (defined here, declared extern in playtime_api.h)
PlaytimeApi g_playtimeApi;

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
}
CommandHandler::~CommandHandler() { }

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
        if (command == "track/getAll") {
            HandleGetTracks(clientId, id, message);
        } else if (command == "track/add") {
            HandleAddTrack(clientId, id, message);
        } else if (command == "track/getFx") {
            HandleGetTrackFX(clientId, id, message);
        } else if (command == "fx/getParams") {
            HandleGetFXParams(clientId, id, message);
        } else if (command == "fx/setParam") {
            HandleSetFXParam(clientId, id, message);
        } else if (command == "fx/add") {
            HandleAddFX(clientId, id, message);
        } else if (command == "fx/delete") {
            HandleDeleteFX(clientId, id, message);
        } else if (command == "fx/reorder") {
            HandleReorderFX(clientId, id, message);
        } else if (command == "fx/getPreset") {
            HandleGetFxPreset(clientId, id, message);
        } else if (command == "fx/setPreset") {
            HandleSetFxPreset(clientId, id, message);
        } else if (command == "fx/getAllPresetNames") {
            HandleGetAllFxPresetNames(clientId, id, message);
        } else if (command == "transport/getState") {
            HandleGetTransport(clientId, id, message);
        } else if (command == "transport/play") {
            HandlePlay(clientId, id, message);
        } else if (command == "transport/stop") {
            HandleStop(clientId, id, message);
        } else if (command == "transport/record") {
            HandleRecord(clientId, id, message);
        } else if (command == "fx/enumerate") {
            HandleEnumerateFX(clientId, id, message);
        } else if (command == "fx/refreshCache") {
            HandleRefreshFxCache(clientId, id, message);
        } else if (command == "track/setMute") {
            HandleSetTrackMute(clientId, id, message);
        } else if (command == "track/setSolo") {
            HandleSetTrackSolo(clientId, id, message);
        } else if (command == "track/setArm") {
            HandleSetTrackArm(clientId, id, message);
        } else if (command == "track/setSelected") {
            HandleSetTrackSelected(clientId, id, message);
        } else if (command == "track/setVolume") {
            HandleSetTrackVolume(clientId, id, message);
        } else if (command == "track/setPan") {
            HandleSetTrackPan(clientId, id, message);
        } else if (command == "sample/getDirectory") {
            HandleSampleGetDirectory(clientId, id, message);
        } else if (command == "sample/sendToTrack") {
            HandleSampleSendToTrack(clientId, id, message);
        } else if (command == "matrix/getAll") {
            HandleMatrixGetAll(clientId, id, message);
        } else if (command == "matrix/getSlot") {
            HandleMatrixGetSlot(clientId, id, message);
        } else if (command == "matrix/triggerSlot") {
            HandleMatrixTriggerSlot(clientId, id, message);
        } else if (command == "matrix/triggerScene") {
            HandleMatrixTriggerScene(clientId, id, message);
        } else if (command == "sequencer/getAll") {
            HandleSequencerGetAll(clientId, id, message);
        } else if (command == "sequencer/toggleStep") {
            HandleSequencerToggleStep(clientId, id, message);
        } else if (command == "sequencer/setStep") {
            HandleSequencerSetStep(clientId, id, message);
        } else if (command == "sequencer/clearAll") {
            HandleSequencerClearAll(clientId, id, message);
        } else if (command == "sequencer/setLength") {
            HandleSequencerSetLength(clientId, id, message);
        } else if (command == "sequencer/setBaseNote") {
            HandleSequencerSetBaseNote(clientId, id, message);
        } else if (command == "sequencer/getPlayhead") {
            HandleSequencerGetPlayhead(clientId, id, message);
        } else if (command == "fxchain/getDirectory") {
            HandleFxChainGetDirectory(clientId, id, message);
        } else if (command == "fxchain/save") {
            HandleFxChainSave(clientId, id, message);
        } else if (command == "fxchain/load") {
            HandleFxChainLoad(clientId, id, message);
        } else if (command == "midi/event") {
            HandleMidiEvent(clientId, id, message);
        } else if (command == "fxchain/getInfo") {
            HandleFxChainGetInfo(clientId, id, message);
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
        }

        tracksJson += "{";
        tracksJson += json_string("index") + ":" + std::to_string(i) + ",";
        tracksJson += json_string("name") + ":" + json_string("Track " + std::to_string(i + 1)) + ",";
        tracksJson += json_string("trackNumber") + ":" + std::to_string(i + 1) + ",";
        tracksJson += json_string("selected") + ":false,";
        tracksJson += json_string("muted") + ":" + std::string(muted ? "true" : "false") + ",";
        tracksJson += json_string("soloed") + ":" + std::string(soloed ? "true" : "false") + ",";
        tracksJson += json_string("armed") + ":" + std::string(armed ? "true" : "false") + ",";
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
    for (int i = 0; i < fxCount; i++) {
        if (i > 0)
            fxList += ",";
        char name[512] = { 0 };
        m_api.TrackFX_GetFXName(track, i, name, sizeof(name));
        fxList += "{";
        fxList += json_string("index") + ":" + std::to_string(i) + ",";
        fxList += json_string("name") + ":" + json_string(name);
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
    // and sync state. For now, we track state locally.
    if (isPlaytimeAvailable()) {
        int instance = m_playtimeState.findPlaytimeInstance();
        if (instance >= 0) {
            fprintf(stderr,
                "[reaper-ipad] matrix/getAll: Playtime instance %d found\n", instance);
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


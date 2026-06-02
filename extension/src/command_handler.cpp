#include "command_handler.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <sstream>
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
    m_commandMap["playtime/isAvailable"]    = &CommandHandler::HandlePlaytimeIsAvailable;
    m_commandMap["playtime/launch"]         = &CommandHandler::HandlePlaytimeLaunch;
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
static std::string extractFxChainFromChunk(const std::string& chunk)
{
    size_t start = chunk.find("<FXCHAIN");
    if (start == std::string::npos)
        return "";

    // REAPER RPPXML format: sections open with <TAG... (no > on opening line)
    // and close with > on its own line. Count depth to find matching close.
    int depth = 0;
    size_t pos = start;
    while (pos < chunk.size()) {
        size_t openAngle = chunk.find('<', pos);
        size_t closeAngle = chunk.find('>', pos);
        if (openAngle == std::string::npos && closeAngle == std::string::npos)
            break;

        if (closeAngle != std::string::npos && (openAngle == std::string::npos || closeAngle < openAngle)) {
            // '>' encountered — close one level
            depth--;
            if (depth == 0) {
                // Found the closing > for FXCHAIN
                return chunk.substr(start, closeAngle - start + 1);
            }
            pos = closeAngle + 1;
        } else if (openAngle != std::string::npos) {
            // '<' encountered — check if it's a section opener or closer
            // REAPER sections: <TAG ... (no > on same line) or > (close) or /> (self-close)
            if (openAngle + 1 < chunk.size() && chunk[openAngle + 1] == '/') {
                // Closing tag like </FOO>
                size_t endTag = chunk.find('>', openAngle);
                if (endTag != std::string::npos) {
                    // This is NOT REAPER's format, but handle gracefully
                    pos = endTag + 1;
                } else {
                    pos = openAngle + 1;
                }
            } else {
                // Opening tag like <FOO or self-closing like <FOO ... />
                size_t endTag = chunk.find('>', openAngle);
                if (endTag != std::string::npos) {
                    // It's <TAG...> or <TAG ... />
                    std::string tagContent = chunk.substr(openAngle + 1, endTag - openAngle - 1);
                    // Trim trailing whitespace
                    while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                        tagContent.pop_back();
                    if (!tagContent.empty() && tagContent.back() == '/') {
                        // Self-closing tag <... /> — no depth change
                        pos = endTag + 1;
                    } else {
                        // Regular opening tag
                        depth++;
                        pos = endTag + 1;
                    }
                } else {
                    // <TAG without > on same line — REAPER section opener
                    depth++;
                    pos = openAngle + 1;
                }
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
            // Find the closing > of the TRACK section
            int depth = 0;
            size_t pos = trackOpen;
            while (pos < chunk.size()) {
                size_t openAngle = chunk.find('<', pos);
                size_t closeAngle = chunk.find('>', pos);
                if (closeAngle == std::string::npos) break;
                if (openAngle == std::string::npos || closeAngle < openAngle) {
                    depth--;
                    if (depth == 0) { trackClose = closeAngle; break; }
                    pos = closeAngle + 1;
                } else {
                    // Check if self-closing
                    size_t endTag = chunk.find('>', openAngle);
                    if (endTag != std::string::npos) {
                        std::string tagContent = chunk.substr(openAngle + 1, endTag - openAngle - 1);
                        while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                            tagContent.pop_back();
                        if (tagContent.empty() || tagContent.back() != '/') {
                            depth++;
                        }
                        pos = endTag + 1;
                    } else {
                        depth++;
                        pos = openAngle + 1;
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
    int depth = 0;
    size_t pos = start;
    size_t fxChainEnd = std::string::npos;
    while (pos < chunk.size()) {
        size_t openAngle = chunk.find('<', pos);
        size_t closeAngle = chunk.find('>', pos);
        if (closeAngle == std::string::npos) break;

        if (openAngle == std::string::npos || closeAngle < openAngle) {
            depth--;
            if (depth == 0) { fxChainEnd = closeAngle; break; }
            pos = closeAngle + 1;
        } else {
            // Opening tag
            size_t endTag = chunk.find('>', openAngle);
            if (endTag != std::string::npos) {
                std::string tagContent = chunk.substr(openAngle + 1, endTag - openAngle - 1);
                while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                    tagContent.pop_back();
                if (!tagContent.empty() && tagContent.back() != '/') {
                    depth++;
                }
                pos = endTag + 1;
            } else {
                depth++;
                pos = openAngle + 1;
            }
        }
    }

    if (fxChainEnd != std::string::npos) {
        std::string result = chunk.substr(0, start);
        result += newFxChain;
        result += "\n";
        result += chunk.substr(fxChainEnd);
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

    // Parse the FXCHAIN: count ITEM entries and extract names
    int fxCount = 0;
    std::string fxNames = "[";
    size_t pos = 0;
    bool first = true;

    while ((pos = content.find("<ITEM", pos)) != std::string::npos) {
        fxCount++;
        size_t nameStart = content.find("NAME", pos);
        if (nameStart != std::string::npos && nameStart < content.find(">", pos)) {
            // NAME="..."
            size_t quote1 = content.find('"', nameStart);
            if (quote1 != std::string::npos) {
                size_t quote2 = content.find('"', quote1 + 1);
                if (quote2 != std::string::npos) {
                    std::string fxName = content.substr(quote1 + 1, quote2 - quote1 - 1);
                    if (!first) fxNames += ",";
                    first = false;
                    fxNames += json_string(fxName);
                }
            }
        }
        // Move past this ITEM
        size_t itemClose = content.find(">", pos);
        if (itemClose != std::string::npos) {
            // Move past the rest of this ITEM block — find VST / JS or the next ITEM
            size_t nextItem = content.find("<ITEM", pos + 5);
            if (nextItem != std::string::npos) {
                pos = nextItem;
            } else {
                // Last item - find the end of the FXCHAIN section
                size_t fxChainClose = content.find("</FXCHAIN>", pos);
                if (fxChainClose != std::string::npos) {
                    pos = fxChainClose;
                } else {
                    pos = content.size();
                }
            }
        } else {
            pos++;
        }
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

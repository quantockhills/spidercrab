#include "command_handler.h"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <sstream>
namespace fs = std::filesystem;

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

// Forward declare REAPER types
struct MediaTrack;
struct ReaProject;

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
        } else if (command == "transport/getState") {
            HandleGetTransport(clientId, id, message);
        } else if (command == "transport/play") {
            HandlePlay(clientId, id, message);
        } else if (command == "transport/stop") {
            HandleStop(clientId, id, message);
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
        } else if (command == "sample/getDirectory") {
            HandleSampleGetDirectory(clientId, id, message);
        } else if (command == "sample/sendToTrack") {
            HandleSampleSendToTrack(clientId, id, message);
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
        if (m_api.GetSetMediaTrackInfo) {
            bool* mp = (bool*)m_api.GetSetMediaTrackInfo(track, "B_MUTE", nullptr);
            if (mp) muted = *mp;
            int* sp = (int*)m_api.GetSetMediaTrackInfo(track, "I_SOLO", nullptr);
            if (sp) soloed = (*sp != 0);
            int* ap = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECARM", nullptr);
            if (ap) armed = (*ap != 0);
        }
        
        tracksJson += "{";
        tracksJson += json_string("index") + ":" + std::to_string(i) + ",";
        tracksJson += json_string("name") + ":" + json_string("Track " + std::to_string(i + 1)) + ",";
        tracksJson += json_string("trackNumber") + ":" + std::to_string(i + 1) + ",";
        tracksJson += json_string("selected") + ":false,";
        tracksJson += json_string("muted") + ":" + std::string(muted ? "true" : "false") + ",";
        tracksJson += json_string("soloed") + ":" + std::string(soloed ? "true" : "false") + ",";
        tracksJson += json_string("armed") + ":" + std::string(armed ? "true" : "false") + ",";
        tracksJson += json_string("volume") + ":0.75";
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
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int         numParams  = m_api.TrackFX_GetNumParams(track, fxIdx);
    std::string paramsList = "[";
    for (int i = 0; i < numParams; i++) {
        if (i > 0)
            paramsList += ",";
        double minVal = 0, maxVal = 0, midVal = 0;
        double val       = m_api.TrackFX_GetParamEx(track, fxIdx, i, &minVal, &maxVal, &midVal);
        char   name[256] = { 0 };
        m_api.TrackFX_GetParamName(track, fxIdx, i, name, sizeof(name));

        paramsList += "{";
        paramsList += json_string("index") + ":" + std::to_string(i) + ",";
        paramsList += json_string("name") + ":" + json_string(name) + ",";
        paramsList += json_string("value") + ":" + std::to_string(val) + ",";
        paramsList += json_string("min") + ":" + std::to_string(minVal) + ",";
        paramsList += json_string("max") + ":" + std::to_string(maxVal) + ",";
        paramsList += json_string("mid") + ":" + std::to_string(midVal);
        paramsList += "}";
    }
    paramsList += "]";
    
    // Auto-watch this FX for real-time param change events (Issue #52)
    SetWatchedFX(trackIdx, fxIdx);

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(trackIdx) + ",\"fxIdx\":" + std::to_string(fxIdx)
            + ",\"params\":" + paramsList + "}");
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

    bool success = m_api.TrackFX_SetParam(track, fxIdx, paramIdx, value);
    SendResponse(
        clientId, id, success, "{\"set\":" + std::string(success ? "true" : "false") + "}");
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

    // Select the target track if specified
    if (!trackIdxStr.empty() && m_api.GetSetMediaTrackInfo) {
        int trackIdx = atoi(trackIdxStr.c_str());
        if (m_api.CountTracks && trackIdx >= 0 && trackIdx < m_api.CountTracks(nullptr)) {
            MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
            if (track) {
                // Deselect all tracks first
                for (int i = 0; i < m_api.CountTracks(nullptr); i++) {
                    MediaTrack* t = m_api.GetTrack(nullptr, i);
                    if (t && t != track) {
                        int zero = 0;
                        m_api.GetSetMediaTrackInfo(t, "I_SELECTED", &zero);
                    }
                }
                // Select target track
                int one = 1;
                m_api.GetSetMediaTrackInfo(track, "I_SELECTED", &one);
            }
        }
    }

    // InsertMedia mode: 512|0 = add media to absolute track index (trackIdx goes in high word)
    int result = m_api.InsertMedia(filePath.c_str(), 0);

    if (result > 0) {
        SendResponse(clientId, id, true,
            "{\"inserted\":true,\"result\":" + std::to_string(result) + "}");
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia returned " + std::to_string(result) + "\"}");
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

// ============================================================
// Real-time FX param change polling (Issue #52)
// ============================================================

void CommandHandler::SetWatchedFX(int trackIdx, int fxIdx)
{
    if (trackIdx == m_watchedTrackIdx && fxIdx == m_watchedFxIdx)
        return;  // Already watching this FX

    // Clear old cache
    ClearWatchedFX();

    if (!m_api.GetTrack || !m_api.TrackFX_GetNumParams || !m_api.TrackFX_GetParamEx)
        return;

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) return;

    int numParams = m_api.TrackFX_GetNumParams(track, fxIdx);
    if (numParams <= 0) return;

    m_watchedTrackIdx   = trackIdx;
    m_watchedFxIdx      = fxIdx;
    m_watchedNumParams  = numParams;
    m_watchedParamValues = new double[numParams];
    m_pollSkipCounter   = 0;

    // Snapshot current param values
    for (int i = 0; i < numParams; i++) {
        double minVal = 0, maxVal = 0, midVal = 0;
        m_watchedParamValues[i] = m_api.TrackFX_GetParamEx(track, fxIdx, i, &minVal, &maxVal, &midVal);
    }
}

void CommandHandler::ClearWatchedFX()
{
    delete[] m_watchedParamValues;
    m_watchedParamValues = nullptr;
    m_watchedTrackIdx    = -1;
    m_watchedFxIdx       = -1;
    m_watchedNumParams   = 0;
    m_pollSkipCounter    = 0;
}

void CommandHandler::PollParams()
{
    if (m_watchedTrackIdx < 0 || m_watchedFxIdx < 0 || !m_watchedParamValues)
        return;

    // Skip most polls to reduce CPU — poll every ~6 calls (5 Hz at 30 Hz loop)
    m_pollSkipCounter++;
    if (m_pollSkipCounter < 6) return;
    m_pollSkipCounter = 0;

    if (!m_api.GetTrack || !m_api.TrackFX_GetParamEx || !m_api.TrackFX_GetParamName)
        return;

    MediaTrack* track = m_api.GetTrack(nullptr, m_watchedTrackIdx);
    if (!track) { ClearWatchedFX(); return; }

    // Check if FX still exists on track
    int numFx = m_api.TrackFX_GetCount ? m_api.TrackFX_GetCount(track) : 0;
    if (m_watchedFxIdx >= numFx) { ClearWatchedFX(); return; }

    std::string changes = "[";
    bool first = true;

    for (int i = 0; i < m_watchedNumParams; i++) {
        double minVal = 0, maxVal = 0, midVal = 0;
        double val = m_api.TrackFX_GetParamEx(track, m_watchedFxIdx, i, &minVal, &maxVal, &midVal);

        // Detect change with small epsilon
        double diff = val - m_watchedParamValues[i];
        if (diff < -0.001 || diff > 0.001) {
            if (!first) changes += ",";
            first = false;

            // Get param name for the event payload
            char name[256] = { 0 };
            m_api.TrackFX_GetParamName(track, m_watchedFxIdx, i, name, sizeof(name));

            changes += "{";
            changes += "\"index\":" + std::to_string(i) + ",";
            changes += "\"name\":\"" + json_escape(name) + "\",";
            changes += "\"value\":" + std::to_string(val) + ",";
            changes += "\"min\":" + std::to_string(minVal) + ",";
            changes += "\"max\":" + std::to_string(maxVal) + ",";
            changes += "\"mid\":" + std::to_string(midVal);
            changes += "}";

            // Update cache
            m_watchedParamValues[i] = val;
        }
    }

    changes += "]";

    // Only broadcast if something changed
    if (!first) {
        std::string event = "{\"type\":\"event\",\"event\":\"fx_param_changed\",";
        event += "\"payload\":{\"trackIdx\":" + std::to_string(m_watchedTrackIdx) + ",";
        event += "\"fxIdx\":" + std::to_string(m_watchedFxIdx) + ",";
        event += "\"params\":" + changes + "}}";

        if (m_ws) {
            m_ws->Broadcast(event);
        }
    }
}


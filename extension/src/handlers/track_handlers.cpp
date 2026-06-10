#include "command_handler.h"
#include "command_handler_helpers.h"

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

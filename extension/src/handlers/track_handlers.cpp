#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandleAddTrack(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.InsertTrackAtIndex || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    m_api.InsertTrackAtIndex(-1, true);
    // Get the track count to verify addition
    int numTracks = m_api.CountTracks(nullptr);
    SendResponse(clientId, id, true,
        "{\"trackCount\":" + std::to_string(numTracks) + "}");
}

void CommandHandler::HandleGetTracks(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.CountTracks || !m_api.GetTrack || !m_api.GetSetMediaTrackInfo) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    int numTracks = m_api.CountTracks(nullptr);
    std::string payload = "{\"tracks\":[";
    for (int i = 0; i < numTracks; i++) {
        MediaTrack* track = m_api.GetTrack(nullptr, i);
        if (!track) continue;
        if (i > 0) payload += ",";
        int* muteState = (int*)m_api.GetSetMediaTrackInfo(track, "B_MUTE", nullptr);
        int* soloState = (int*)m_api.GetSetMediaTrackInfo(track, "I_SOLO", nullptr);
        int* armState  = (int*)m_api.GetSetMediaTrackInfo(track, "I_RECARM", nullptr);
        double* vol    = (double*)m_api.GetSetMediaTrackInfo(track, "D_VOL", nullptr);
        double* pan    = (double*)m_api.GetSetMediaTrackInfo(track, "D_PAN", nullptr);
        char* namePtr  = (char*)m_api.GetSetMediaTrackInfo(track, "P_NAME", nullptr);
        std::string name = namePtr ? std::string(namePtr) : "";
        // Get track group info if available
        int groupId = 0;
        void* groupPtr = m_api.GetSetMediaTrackInfo(track, "I_GROUPID", nullptr);
        if (groupPtr) groupId = *(int*)groupPtr;

        int* selectedState = (int*)m_api.GetSetMediaTrackInfo(track, "I_SELECTED", nullptr);

        // Count FX on this track
        int fxCount = 0;
        if (m_api.TrackFX_GetCount) {
            fxCount = m_api.TrackFX_GetCount(track);
        }

        payload += "{";
        payload += "\"index\":" + std::to_string(i) + ",";
        payload += "\"name\":" + json_string(name) + ",";
        payload += std::string("\"mute\":") + (muteState && *muteState ? "true" : "false") + ",";
        payload += std::string("\"solo\":") + (soloState && *soloState ? "true" : "false") + ",";
        payload += std::string("\"arm\":") + (armState && *armState ? "true" : "false") + ",";
        payload += std::string("\"selected\":") + (selectedState && *selectedState ? "true" : "false") + ",";
        payload += "\"volume\":" + (vol ? std::to_string(*vol) : "0") + ",";
        payload += "\"pan\":" + (pan ? std::to_string(*pan) : "0") + ",";
        payload += "\"fxCount\":" + std::to_string(fxCount) + ",";
        payload += "\"groupId\":" + std::to_string(groupId);
        payload += "}";
    }
    payload += "],\"count\":" + std::to_string(numTracks) + "}";
    SendResponse(clientId, id, true, payload);
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
    std::string muteStr     = parser.getString("mute");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int mute = (muteStr == "true") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "B_MUTE", &mute);
    BroadcastTrackEvent("track_mute_changed", trackIdx, mute != 0);
    SendResponse(clientId, id, true,
        "{\"mute\":" + std::string(mute ? "true" : "false") + "}");
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
    std::string soloStr     = parser.getString("solo");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int solo = (soloStr == "true") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_SOLO", &solo);
    BroadcastTrackEvent("track_solo_changed", trackIdx, solo != 0);
    SendResponse(clientId, id, true,
        "{\"solo\":" + std::string(solo ? "true" : "false") + "}");
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
    std::string armStr      = parser.getString("arm");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int arm = (armStr == "true") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_RECARM", &arm);
    BroadcastTrackEvent("track_arm_changed", trackIdx, arm != 0);
    SendResponse(clientId, id, true,
        "{\"arm\":" + std::string(arm ? "true" : "false") + "}");
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
    int selected = (selectedStr == "true") ? 1 : 0;
    m_api.GetSetMediaTrackInfo(track, "I_SELECTED", &selected);
    SendResponse(clientId, id, true,
        "{\"selected\":" + std::string(selected ? "true" : "false") + "}");
}

void CommandHandler::HandleSetRecordMode(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetSetMediaTrackInfo || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string modeStr     = parser.getString("mode");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    // Mode: 0=normal, 1=force, 2=record disable, 4=late, 5=overdub, 6=midi
    int mode = atoi(modeStr.c_str());
    m_api.GetSetMediaTrackInfo(track, "I_RECMODE", &mode);
    SendResponse(clientId, id, true,
        "{\"recordMode\":" + std::to_string(mode) + "}");
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
    if (volume < 0.0) volume = 0.0;
    if (volume > 1.0) volume = 1.0;
    m_api.GetSetMediaTrackInfo(track, "D_VOL", &volume);
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
    if (pan < -1.0) pan = -1.0;
    if (pan > 1.0) pan = 1.0;
    m_api.GetSetMediaTrackInfo(track, "D_PAN", &pan);
    BroadcastTrackEvent("track_pan_changed", trackIdx, pan);
    SendResponse(clientId, id, true,
        "{\"pan\":" + std::to_string(pan) + "}");
}

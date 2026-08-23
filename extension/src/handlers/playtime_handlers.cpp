#include "command_handler.h"
#include "command_handler_helpers.h"

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

void CommandHandler::HandlePlaytimeLaunch(
    int clientId, const std::string& id, const std::string& /* params */)
{
    bool launched = false;
    std::string message;

    // Try the named REAPER action first — simplest and most reliable
    if (m_api.NamedCommandLookup && m_api.Main_OnCommand) {
        int cmdId = m_api.NamedCommandLookup("_HB_SHOW_HIDE_PLAYTIME");
        if (cmdId > 0) {
            m_api.Main_OnCommand(cmdId, 0);
            launched = true;
            message = "Playtime toggled via _HB_SHOW_HIDE_PLAYTIME";
            fprintf(stderr, "[reaper-ipad] Playtime toggled via action %d\n", cmdId);
        }
    }

    if (!launched) {
    // Attempt to launch/show Playtime 2 by calling HB_ShowOrHidePlaytime
    // on the first available Helgobox/Playtime instance.

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
    } // end if (!launched)

    std::string payload = "{";
    payload += json_string("launched") + ":" + (launched ? "true" : "false") + ",";
    payload += json_string("message") + ":" + json_string(message);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ------------------------------------------------------------
// Playtime's own transport, metronome and tempo.
//
// The play/stop/record buttons on the session view drive REAPER's transport
// (CSurf_OnPlay and friends), which is a different thing from Playtime's: the
// matrix has its own playback, its own metronome, its own panic. Those reach
// the "Playtime: Matrix action" target through the shipped ReaLearn preset.
//
// Tempo is the exception. Playtime has no numeric tempo of its own — it
// follows the project — so setting tempo means setting REAPER's, and the only
// Playtime-side control is tap tempo.
// ------------------------------------------------------------

void CommandHandler::HandleMatrixPlay(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const std::string on = p1.getString("on");
    const bool play = !(on == "false" || on == "0");
    const bool sent = m_oscSender.sendMatrixPlay(play);
    SendResponse(clientId, id, true,
        "{\"playing\":" + std::string(play ? "true" : "false")
        + ",\"sent\":" + std::string(sent ? "true" : "false") + "}");
}

void CommandHandler::HandleMatrixStopAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    const bool sent = m_oscSender.sendMatrixStop();
    SendResponse(clientId, id, true,
        "{\"sent\":" + std::string(sent ? "true" : "false") + "}");
}

void CommandHandler::HandleMatrixClick(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const std::string on = p1.getString("on");
    const bool enable = !(on == "false" || on == "0");
    const bool sent = m_oscSender.sendMatrixClick(enable);
    SendResponse(clientId, id, true,
        "{\"click\":" + std::string(enable ? "true" : "false")
        + ",\"sent\":" + std::string(sent ? "true" : "false") + "}");
}

void CommandHandler::HandleMatrixPanic(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    const bool sent = m_oscSender.sendMatrixPanic();
    SendResponse(clientId, id, true,
        "{\"sent\":" + std::string(sent ? "true" : "false") + "}");
}

void CommandHandler::HandleMatrixTapTempo(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    const bool sent = m_oscSender.sendMatrixTapTempo();
    SendResponse(clientId, id, true,
        "{\"sent\":" + std::string(sent ? "true" : "false") + "}");
}

void CommandHandler::HandleTransportSetTempo(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.CSurf_OnTempoChange) {
        SendResponse(clientId, id, false, "{\"error\":\"CSurf_OnTempoChange not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const double bpm = atof(p1.getString("bpm").c_str());

    // REAPER accepts a wider range than this, but a tempo outside it is far
    // more likely to be a bad parse than an intention, and it would be
    // tiresome to undo by hand.
    if (bpm < 20.0 || bpm > 400.0) {
        SendResponse(clientId, id, false, "{\"error\":\"Tempo must be between 20 and 400\"}");
        return;
    }

    m_api.CSurf_OnTempoChange(bpm);
    SendResponse(clientId, id, true, "{\"bpm\":" + std::to_string(bpm) + "}");
}

void CommandHandler::HandleTransportGetTempo(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    const double bpm = m_api.Master_GetTempo ? m_api.Master_GetTempo() : 0.0;
    SendResponse(clientId, id, true, "{\"bpm\":" + std::to_string(bpm) + "}");
}

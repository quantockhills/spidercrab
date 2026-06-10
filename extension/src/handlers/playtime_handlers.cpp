#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandlePlaytimeIsAvailable(
    int clientId, const std::string& id, const std::string& /* params */)
{
    bool available = isPlaytimeAvailable();

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
        if (isPlaytimeAvailable()) {
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
            retryPlaytimeApi();
            if (isPlaytimeAvailable()) {
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
                message = "Playtime 2 API not available — Helgobox may not be loaded";
                fprintf(stderr, "[reaper-ipad] Playtime 2 not available: cannot launch\n");
            }
        }
    }

    std::string payload = "{";
    payload += json_string("launched") + ":" + (launched ? "true" : "false") + ",";
    payload += json_string("message") + ":" + json_string(message);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandleGetTransport(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.GetPlayState) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    int state = m_api.GetPlayState();
    bool playing  = (state & 1) != 0;
    bool paused   = (state & 2) != 0;
    bool recording = (state & 4) != 0;
    std::string payload = "{";
    payload += json_string("playing") + ":" + (playing ? "true" : "false") + ",";
    payload += json_string("paused") + ":" + (paused ? "true" : "false") + ",";
    payload += json_string("recording") + ":" + (recording ? "true" : "false");
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandlePlay(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.CSurf_OnPlay) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    m_api.CSurf_OnPlay();
    SendResponse(clientId, id, true, "{\"playing\":true}");
}

void CommandHandler::HandleStop(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.CSurf_OnStop) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    m_api.CSurf_OnStop();
    SendResponse(clientId, id, true, "{\"stopped\":true}");
}

void CommandHandler::HandleRecord(int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.CSurf_OnRecord) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    m_api.CSurf_OnRecord();
    SendResponse(clientId, id, true, "{\"recording\":true}");
}

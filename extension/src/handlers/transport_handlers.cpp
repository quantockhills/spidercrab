#include "command_handler.h"
#include "command_handler_helpers.h"

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

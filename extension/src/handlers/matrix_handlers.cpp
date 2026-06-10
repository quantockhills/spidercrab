#include "command_handler.h"
#include "command_handler_helpers.h"
#include <cmath>

void CommandHandler::HandleMatrixGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    int columns = m_playtimeState.columns();
    int rows    = m_playtimeState.rows();

    if (isPlaytimeAvailable()) {
        int instance = m_playtimeState.findPlaytimeInstance();
        if (instance >= 0) {
            fprintf(stderr,
                "[reaper-ipad] matrix/getAll: Playtime instance %d found\n", instance);
        } else {
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

    m_oscSender.sendTriggerSlot(col, row);

    SlotState current = m_playtimeState.getSlot(col, row);
    SendResponse(clientId, id, true, current.toJson());
}

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

    for (int c = 0; c < cols; c++) {
        SlotState current = m_playtimeState.getSlot(c, row);
        std::string newState;
        if (current.state == "playing") {
            newState = "stopped";
        } else {
            newState = "playing";
        }
        m_playtimeState.setSlotState(c, row, newState);

        if (m_playtimeMidi.isAvailable()) {
            m_playtimeMidi.triggerSlotViaMidi(c, row);
        }

        m_oscSender.sendTriggerSlot(c, row);

        SlotState updated = m_playtimeState.getSlot(c, row);
        BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());
    }

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

    if (state != "playing" && state != "recording" && state != "stopped" && state != "empty") {
        SendResponse(clientId, id, false,
            "{\"error\":\"Invalid state. Must be one of: playing, recording, stopped, empty\"}");
        return;
    }

    m_playtimeState.setSlotState(col, row, state);

    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

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
        SendResponse(clientId, id, false,
            "{\"error\":\"Cannot record on a playing clip. Stop the clip first.\"}");
        return;
    } else if (current.state == "recording") {
        newState = "stopped";
    } else {
        newState = "recording";
    }

    m_playtimeState.setSlotState(col, row, newState);

    if (m_playtimeMidi.isAvailable()) {
        int note = m_playtimeMidi.baseNote() + (row * 8) + col;
        if (note <= 127) {
            m_playtimeMidi.sendMidiNote(1, note, 100);
        }
    }

    m_oscSender.sendRecordSlot(col, row);

    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

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

void CommandHandler::HandleMatrixSetSlotReverse(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");
    std::string revStr = parser.getString("reversed");

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

    bool reversed = (revStr == "true");
    if (revStr.empty()) {
        reversed = (payloadStr.find("\"reversed\":true") != std::string::npos);
    }

    SlotState current = m_playtimeState.getSlot(col, row);
    current.reversed = reversed;
    m_playtimeState.setSlot(col, row, current);

    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());

    SendResponse(clientId, id, true, updated.toJson());
}

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

void CommandHandler::HandleSequencerConvertToClip(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    if (!m_api.CreateNewMIDIItemInProj || !m_api.MIDI_InsertNote ||
        !m_api.SetMediaItemInfo_Value || !m_api.GetMediaItemInfo_Value ||
        !m_api.GetTrack || !m_api.CountTracks) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Required MIDI API functions not loaded\"}");
        return;
    }

    int seqLength = m_sequencerState.length();
    int cols = m_sequencerState.columns();

    bool hasActiveSteps = false;
    for (int c = 0; c < std::min(seqLength, cols) && !hasActiveSteps; c++) {
        std::vector<StepData> colSteps = m_sequencerState.getActiveStepsAtColumn(c);
        if (!colSteps.empty()) hasActiveSteps = true;
    }

    if (!hasActiveSteps) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No active steps to convert\",\"emptyPattern\":true}");
        return;
    }

    int numTracks = m_api.CountTracks(nullptr);
    if (numTracks < 1) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No tracks in project\"}");
        return;
    }
    int trackIdx = 0;
    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);

    const double stepDuration = 0.25;
    double itemStart = 0.0;
    double itemEnd = itemStart + (seqLength * stepDuration);

    bool qnMode = false;
    MediaItem* item = m_api.CreateNewMIDIItemInProj(track, itemStart, itemEnd, &qnMode);
    if (!item) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to create MIDI item\"}");
        return;
    }

    MediaItem_Take* take = m_api.GetActiveTake(item);
    if (!take) {
        if (m_api.AddTakeToMediaItem) {
            take = m_api.AddTakeToMediaItem(item);
        }
        if (!take) {
            SendResponse(clientId, id, false,
                "{\"error\":\"Failed to get MIDI take\"}");
            return;
        }
    }

    const double ppqPerStep = 480.0;

    int noteCount = 0;
    bool noSort = true;

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

    double currentLen = m_api.GetMediaItemInfo_Value(item, "D_LENGTH");
    double desiredLen = seqLength * stepDuration;
    if (desiredLen > currentLen) {
        m_api.SetMediaItemInfo_Value(item, "D_LENGTH", desiredLen);
    }

    int trackItemCount = 0;
    if (m_api.CountTrackMediaItems) {
        trackItemCount = m_api.CountTrackMediaItems(track);
    }

    std::string payload = "{";
    payload += json_string("success") + ":true,";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("itemCount") + ":" + std::to_string(trackItemCount) + ",";
    payload += json_string("noteCount") + ":" + std::to_string(noteCount) + ",";
    payload += json_string("length") + ":" + std::to_string(seqLength);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

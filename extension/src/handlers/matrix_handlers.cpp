#include "command_handler.h"
#include "command_handler_helpers.h"

#include "sha1_utils.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstring>
#include <cmath>

void CommandHandler::HandleMatrixGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    // Restore persisted slot source paths (survives REAPER restarts and
    // follows the project). Saved on every sendToSlot/clearSlot.
    if (m_api.GetProjExtState) {
        std::vector<char> srcBuf(65536, 0);
        if (m_api.GetProjExtState(nullptr, "SPIDERCRAB", "slotSources", srcBuf.data(), (int)srcBuf.size()) > 0)
            m_playtimeState.loadSources(srcBuf.data());
    }

    // Which tracks are Playtime's columns.
    //
    // Playtime keeps its clip matrix inside the Helgobox plugin's own state,
    // and hands it to REAPER as base64 through the "vst_chunk" config value.
    // Inside is plain JSON:
    //
    //   "clipMatrix":{"columns":[
    //     {"id":"...","clip_play_settings":{...,"track":"E39C43C0-....",...}},
    //     ...]}
    //
    // The array order IS the matrix order, and each column names the GUID of
    // the REAPER track that plays it. That is authoritative and survives the
    // user renaming a track — unlike matching on the name "Column 1", and
    // unlike the frontend's previous guess, which excluded anything looking
    // like Helgobox and treated whatever remained as the columns, so an
    // unrelated track became column 0 and every column action went astray.
    //
    // Scanned rather than parsed: only one field is needed, from a known
    // shape, and a JSON parser for the whole of Helgobox's state would be a
    // much larger thing to keep working.
    //
    // Cached, because this reads and decodes the whole Helgobox chunk and
    // matrix/getAll is polled once a second. The mapping only moves when a
    // column or a track appears or disappears, so the track count is enough
    // to know when to look again.
    const int liveTrackCount = m_api.CountTracks ? m_api.CountTracks(nullptr) : 0;
    const bool needRebuild = !m_columnTracksValid
                          || liveTrackCount != m_columnTracksTrackCount;

    std::vector<std::pair<int, std::string>> columnGuids;  // (column, track GUID)
    if (needRebuild && m_api.CountTracks && m_api.GetTrack && m_api.TrackFX_GetCount
        && m_api.TrackFX_GetFXName && m_api.TrackFX_GetNamedConfigParm) {
        const int trackCount = liveTrackCount;
        std::string chunk;

        for (int t = 0; t < trackCount && chunk.empty(); ++t) {
            MediaTrack* tr = m_api.GetTrack(nullptr, t);
            if (!tr) continue;
            const int fxCount = m_api.TrackFX_GetCount(tr);
            for (int f = 0; f < fxCount && chunk.empty(); ++f) {
                char nameBuf[512] = {0};
                if (!m_api.TrackFX_GetFXName(tr, f, nameBuf, sizeof(nameBuf))) continue;
                std::string fxName(nameBuf);
                std::string lower;
                for (char c : fxName) lower += (char)tolower((unsigned char)c);
                if (lower.find("helgobox") == std::string::npos
                    && lower.find("playtime") == std::string::npos
                    && lower.find("realearn") == std::string::npos)
                    continue;

                // Helgobox ships as a VSTi here, but ask for both so a CLAP
                // build is not silently unsupported.
                for (const char* parm : {"vst_chunk", "clap_chunk"}) {
                    // Start small and grow. REAPER does not report how much
                    // room it needed, it just truncates — so a result that
                    // exactly fills the buffer is treated as "probably cut
                    // short" and retried. A matrix of a few columns is around
                    // 7 KB, and asking for megabytes up front would mean
                    // zeroing them on every poll.
                    for (size_t cap = 64 * 1024; cap <= 8 * 1024 * 1024; cap *= 4) {
                        std::vector<char> buf(cap, 0);
                        if (!m_api.TrackFX_GetNamedConfigParm(
                                tr, f, parm, buf.data(), (int)buf.size()))
                            break;
                        if (!buf[0]) break;
                        const size_t got = strlen(buf.data());
                        if (got >= cap - 1) continue;  // very likely truncated
                        chunk = base64_decode(std::string(buf.data(), got));
                        break;
                    }
                    if (!chunk.empty()) break;
                }
            }
        }

        size_t cols = chunk.find("\"columns\"");
        if (cols != std::string::npos) {
            size_t arr = chunk.find('[', cols);
            if (arr != std::string::npos) {
                // Walk the array one column object at a time, taking the first
                // "track" inside each. Depth tracking keeps a nested object
                // from being mistaken for the next column.
                int    depth = 0;
                size_t i     = arr;
                size_t objStart = std::string::npos;
                int    colIdx = 0;
                for (; i < chunk.size(); ++i) {
                    const char c = chunk[i];
                    if (c == '[' && depth == 0) { depth = 0; continue; }
                    if (c == '{') { if (depth == 0) objStart = i; ++depth; }
                    else if (c == '}') {
                        --depth;
                        if (depth == 0 && objStart != std::string::npos) {
                            const std::string obj = chunk.substr(objStart, i - objStart + 1);
                            const std::string key = "\"track\":\"";
                            size_t k = obj.find(key);
                            if (k != std::string::npos) {
                                size_t vs = k + key.size();
                                size_t ve = obj.find('"', vs);
                                if (ve != std::string::npos)
                                    columnGuids.emplace_back(colIdx, obj.substr(vs, ve - vs));
                            }
                            ++colIdx;
                            objStart = std::string::npos;
                        }
                    }
                    else if (c == ']' && depth == 0) break;
                }
            }
        }
    }

    // Resolve each GUID to a track index. REAPER returns GUIDs wrapped in
    // braces; Playtime stores them bare, so both sides are normalised.
    auto bare = [](std::string g) {
        std::string out;
        for (char c : g)
            if (c != '{' && c != '}') out += (char)toupper((unsigned char)c);
        return out;
    };

    if (needRebuild) {
        std::vector<std::pair<int, int>> built;
        if (!columnGuids.empty() && m_api.GetTrack && m_api.GetSetMediaTrackInfo_String) {
            std::vector<std::pair<std::string, int>> trackGuids;
            for (int t = 0; t < liveTrackCount; ++t) {
                MediaTrack* tr = m_api.GetTrack(nullptr, t);
                if (!tr) continue;
                char g[128] = {0};
                if (m_api.GetSetMediaTrackInfo_String(tr, "GUID", g, false))
                    trackGuids.emplace_back(bare(g), t);
            }
            for (const auto& cg : columnGuids) {
                const std::string want = bare(cg.second);
                for (const auto& tg : trackGuids) {
                    if (tg.first == want) { built.emplace_back(cg.first, tg.second); break; }
                }
            }
        }

        // Only replace a good mapping with another good one. A transient
        // failure to read the chunk should not throw away a mapping that
        // was working a second ago.
        if (!built.empty() || !m_columnTracksValid) {
            m_columnTracks            = built;
            m_columnTracksValid       = true;
            m_columnTracksTrackCount  = liveTrackCount;
        }

        // Draw as many columns as the matrix actually has. The size used to be
        // fixed at 8x8, so a larger matrix was truncated and a smaller one
        // drew columns that do not exist.
        if (!columnGuids.empty())
            m_playtimeState.resize((int)columnGuids.size(), m_playtimeState.rows());
    }

    const std::vector<std::pair<int, int>>& columnTracks = m_columnTracks;

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
    payload += json_string("slots") + ":" + m_playtimeState.getAllSlots() + ",";

    // The track behind each column, so the frontend addresses column actions
    // by fact rather than by inference.
    payload += json_string("columnTracks") + ":[";
    for (size_t i = 0; i < columnTracks.size(); ++i) {
        if (i > 0) payload += ",";
        payload += "{";
        payload += json_string("column") + ":" + std::to_string(columnTracks[i].first) + ",";
        payload += json_string("number") + ":" + std::to_string(columnTracks[i].first + 1) + ",";
        payload += json_string("trackIdx") + ":" + std::to_string(columnTracks[i].second);
        payload += "}";
    }
    payload += "]";
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

    // Send OSC to ReaLearn — real state will come back via OSC feedback on port 9011
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

        // Send OSC message for each slot (Issue #98)
        m_oscSender.sendTriggerSlot(c, row);

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

    // An immediate record request supersedes any pending count-in
    CancelRecordCountIn();

    DoRecordSlot(col, row);

    SlotState updated = m_playtimeState.getSlot(col, row);
    SendResponse(clientId, id, true, updated.toJson());
}

// Shared record-toggle work: stop↔record the slot, send the MIDI note and
// OSC, broadcast the state change. Used by both the immediate command and
// the count-in fire.
void CommandHandler::DoRecordSlot(int col, int row)
{
    SlotState current = m_playtimeState.getSlot(col, row);
    std::string newState;

    if (current.state == "playing") {
        // Can't record on a playing slot — nothing to do
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

    // Send OSC message for ReaLearn integration (Issue #98)
    m_oscSender.sendRecordSlot(col, row);

    // Broadcast event to all clients
    SlotState updated = m_playtimeState.getSlot(col, row);
    BroadcastMatrixEvent("matrix/slotStateChanged", updated.toJson());
}

// Record with a musical count-in. Playtime's own count-in is not exposed
// to ReaLearn, so the record trigger (DoRecordSlot) is fired here after
// N bars, starting at the next bar boundary. The frontend shows the
// remaining bars from matrix/countdown broadcasts.
void CommandHandler::HandleMatrixRecordSlotCountdown(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");
    int bars = atoi(parser.getString("bars").c_str());

    if (colStr.empty() || rowStr.empty() || bars < 0 || bars > 8) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Expected 'column', 'row' and 'bars' (0-8)\"}");
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

    CancelRecordCountIn();

    const SlotState current = m_playtimeState.getSlot(col, row);
    if (current.state == "playing") {
        SendResponse(clientId, id, false,
            "{\"error\":\"Cannot record on a playing clip. Stop the clip first.\"}");
        return;
    }

    if (bars == 0 || current.state == "recording") {
        // Immediate count-in, or a count-in requested on a slot already
        // recording (toggle stop) — both behave like a plain recordSlot.
        DoRecordSlot(col, row);
        SlotState updated = m_playtimeState.getSlot(col, row);
        SendResponse(clientId, id, true, updated.toJson());
        return;
    }

    // Arm: fire at the next bar boundary + N bars. Playtime follows the
    // project, so bar alignment comes from REAPER's tempo and position.
    const double pos = m_api.GetPlayPosition ? m_api.GetPlayPosition() : 0.0;
    const double barLen = CurrentBarLen();
    const double intoBar = fmod(pos, barLen);
    const double nextBarDelay = barLen - intoBar; // (0, barLen]

    RecordCountIn& rc = m_recordCountIn;
    rc.active       = true;
    rc.col          = col;
    rc.row          = row;
    rc.targetBars   = bars;
    rc.barLen       = barLen;
    rc.lastShownBars = -1;
    rc.targetWallMs = nowWallMs() + static_cast<uint64_t>(
        (nextBarDelay + bars * barLen) * 1000.0);

    // Show the full count immediately: aligned bars + the partial bar we
    // are waiting out to land on the boundary.
    BroadcastCountdown(col, row, bars + (intoBar > 0.001 ? 1 : 0), bars, true);

    SendResponse(clientId, id, true,
        "{\"column\":" + std::to_string(col) + ",\"row\":" + std::to_string(row)
        + ",\"bars\":" + std::to_string(bars) + ",\"armed\":true}");
}

void CommandHandler::TickRecordCountIn(uint32_t nowMs)
{
    if (!m_recordCountIn.active) return;

    m_recordCountIn.barLen = CurrentBarLen();

    if (nowMs < m_recordCountIn.targetWallMs) {
        // Broadcast when the displayed remaining bars change
        const double remainSec = static_cast<double>(m_recordCountIn.targetWallMs - nowMs) / 1000.0;
        int remaining = static_cast<int>(std::ceil(remainSec / m_recordCountIn.barLen));
        if (remaining != m_recordCountIn.lastShownBars) {
            m_recordCountIn.lastShownBars = remaining;
            BroadcastCountdown(m_recordCountIn.col, m_recordCountIn.row,
                remaining, m_recordCountIn.targetBars, true);
        }
        return;
    }

    // Time's up — fire the record trigger
    const int col = m_recordCountIn.col;
    const int row = m_recordCountIn.row;
    CancelRecordCountIn();
    DoRecordSlot(col, row);
}

void CommandHandler::CancelRecordCountIn()
{
    if (!m_recordCountIn.active) return;
    const int col = m_recordCountIn.col;
    const int row = m_recordCountIn.row;
    const int targetBars = m_recordCountIn.targetBars;
    m_recordCountIn = RecordCountIn();
    BroadcastCountdown(col, row, 0, targetBars, false);
}

void CommandHandler::BroadcastCountdown(
    int col, int row, int bars, int targetBars, bool active)
{
    std::string event = "{\"type\":\"event\",\"event\":\"matrix/countdown\",\"payload\":{";
    event += "\"column\":" + std::to_string(col) + ",";
    event += "\"row\":" + std::to_string(row) + ",";
    event += "\"active\":" + std::string(active ? "true" : "false") + ",";
    event += "\"bars\":" + std::to_string(bars) + ",";
    event += "\"targetBars\":" + std::to_string(targetBars);
    event += "}}";

    if (m_broadcastCb) {
        m_broadcastCb(event);
    } else if (m_ws) {
        m_ws->Broadcast(event);
    }
}

// 4/4 bar length in seconds at the project tempo. Playtime follows the
// project tempo; if the tempo read fails, 120 BPM keeps the count running.
double CommandHandler::CurrentBarLen() const
{
    double bpm = m_api.Master_GetTempo ? m_api.Master_GetTempo() : 120.0;
    if (bpm < 20.0 || bpm > 400.0) bpm = 120.0;
    return 4.0 * 60.0 / bpm;
}

uint32_t CommandHandler::nowWallMs() const
{
    const auto ns = std::chrono::steady_clock::now().time_since_epoch();
    return static_cast<uint32_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(ns).count());
}

void CommandHandler::HandleMatrixClearSlot(
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
    if (current.state == "recording") {
        SendResponse(clientId, id, false,
            "{\"error\":\"Cannot delete a recording clip. Stop recording first.\"}");
        return;
    }

    // Send OSC clear message -> ReaLearn triggers Playtime's ClearSlot action
    m_oscSender.sendClearSlot(col, row);

    // Optimistically mark the slot empty (also clears name/clipType/reversed)
    m_playtimeState.setSlotState(col, row, "empty");
    if (m_api.SetProjExtState)
        m_api.SetProjExtState(nullptr, "SPIDERCRAB", "slotSources",
            m_playtimeState.serializeSources().c_str());

    // Broadcast event to all clients
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

void CommandHandler::HandleMatrixSetSlotReverse(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string colStr = parser.getString("column");
    std::string rowStr = parser.getString("row");
    // The reversed value can be a JSON boolean (true/false) or a string.
    // Our simple parser returns empty for JSON booleans, so check the raw params.
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

    // Determine reversed value from param (handles both string "true"/"false"
    // and raw JSON boolean by checking the raw payload string)
    bool reversed = (revStr == "true");
    if (revStr.empty()) {
        reversed = (payloadStr.find("\"reversed\":true") != std::string::npos);
    }

    // Update the slot's reversed flag
    SlotState current = m_playtimeState.getSlot(col, row);
    current.reversed = reversed;
    m_playtimeState.setSlot(col, row, current);

    // Broadcast slot state change event
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

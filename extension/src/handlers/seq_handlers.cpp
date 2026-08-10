#include "command_handler.h"
#include "command_handler_helpers.h"

#include <string>
#include <vector>

// Reading a pattern back out of a MIDI item.
//
// The existing sequencer keeps an 8x8 grid in extension memory and bakes it
// into a new item once, with no way back — so the moment you converted, the
// iPad's grid and the project diverged and the pattern died with the session.
//
// The model here follows MPL's RS5k sequencer, which solves that by keeping
// the pattern in two places on the same take:
//
//   * real MIDI notes, which is what REAPER actually plays, and what opens in
//     the MIDI editor like any other item;
//   * a blob in take ext data, holding the per-step detail MIDI has no way to
//     express — probability, ratchets, per-row lengths.
//
// Neither is authoritative on its own, and that is the point: the notes work
// with no help from us, and the blob adds what they cannot carry. If the blob
// is missing (someone drew the part by hand) the notes still read back fine.
//
// Our ext key is our own, so a take can carry MPL's data and ours without
// either disturbing the other.

namespace {

/// Our slot in the take's ext data.
constexpr const char* EXT_KEY = "P_EXT:SPIDERCRAB_SEQ";

/// Take ext data has no length limit worth relying on, and REAPER truncates
/// silently into whatever buffer it is given. A pattern of any sane size fits
/// well inside this.
constexpr int EXT_BUF = 256 * 1024;

}  // namespace

void CommandHandler::HandleSeqListItems(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.CountTrackMediaItems || !m_api.GetTrackMediaItem
        || !m_api.GetActiveTake || !m_api.TakeIsMIDI || !m_api.GetMediaItemInfo_Value) {
        SendResponse(clientId, id, false, "{\"error\":\"Required item APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    const int   trackIdx = atoi(parser.getString("trackIdx").c_str());

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"No such track\"}");
        return;
    }

    const int count = m_api.CountTrackMediaItems(track);

    std::string items = "[";
    bool        first = true;
    for (int i = 0; i < count; ++i) {
        MediaItem* item = m_api.GetTrackMediaItem(track, i);
        if (!item)
            continue;
        MediaItem_Take* take = m_api.GetActiveTake(item);
        // Audio items live on the same track and are not patterns.
        if (!take || !m_api.TakeIsMIDI(take))
            continue;

        std::string name;
        if (m_api.GetSetMediaItemTakeInfo_String) {
            std::vector<char> buf(1024, 0);
            if (m_api.GetSetMediaItemTakeInfo_String(take, "P_NAME", buf.data(), false))
                name = buf.data();
        }

        if (!first)
            items += ",";
        first = false;

        items += "{";
        items += json_string("itemIdx") + ":" + std::to_string(i) + ",";
        items += json_string("name") + ":" + json_string(name) + ",";
        items += json_string("position") + ":"
               + std::to_string(m_api.GetMediaItemInfo_Value(item, "D_POSITION")) + ",";
        items += json_string("length") + ":"
               + std::to_string(m_api.GetMediaItemInfo_Value(item, "D_LENGTH"));
        items += "}";
    }
    items += "]";

    std::string payload = "{";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("items") + ":" + items;
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSeqReadPattern(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.GetTrackMediaItem || !m_api.GetActiveTake
        || !m_api.TakeIsMIDI || !m_api.MIDI_CountEvts || !m_api.MIDI_GetNote
        || !m_api.GetMediaItemInfo_Value || !m_api.MIDI_GetPPQPosFromProjTime) {
        SendResponse(clientId, id, false, "{\"error\":\"Required MIDI APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const int   trackIdx = atoi(p1.getString("trackIdx").c_str());
    JsonParser  p2(payloadStr);
    const int   itemIdx = atoi(p2.getString("itemIdx").c_str());

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"No such track\"}");
        return;
    }
    MediaItem* item = m_api.GetTrackMediaItem(track, itemIdx);
    if (!item) {
        SendResponse(clientId, id, false, "{\"error\":\"No such item\"}");
        return;
    }
    MediaItem_Take* take = m_api.GetActiveTake(item);
    if (!take || !m_api.TakeIsMIDI(take)) {
        SendResponse(clientId, id, false, "{\"error\":\"Item is not MIDI\"}");
        return;
    }

    const double pos = m_api.GetMediaItemInfo_Value(item, "D_POSITION");
    const double len = m_api.GetMediaItemInfo_Value(item, "D_LENGTH");

    // Notes carry PPQ positions, which mean nothing to a caller without the
    // item's own bounds in the same units to measure them against.
    const double ppqStart = m_api.MIDI_GetPPQPosFromProjTime(take, pos);
    const double ppqEnd   = m_api.MIDI_GetPPQPosFromProjTime(take, pos + len);

    int noteCount = 0;
    m_api.MIDI_CountEvts(take, &noteCount, nullptr, nullptr);

    std::string notes = "[";
    for (int i = 0; i < noteCount; ++i) {
        bool   sel = false, muted = false;
        double s = 0.0, e = 0.0;
        int    chan = 0, pitch = 0, vel = 0;
        if (!m_api.MIDI_GetNote(take, i, &sel, &muted, &s, &e, &chan, &pitch, &vel))
            continue;

        if (i > 0)
            notes += ",";
        notes += "{";
        notes += json_string("pitch") + ":" + std::to_string(pitch) + ",";
        notes += json_string("start") + ":" + std::to_string(s) + ",";
        notes += json_string("end") + ":" + std::to_string(e) + ",";
        notes += json_string("vel") + ":" + std::to_string(vel) + ",";
        notes += json_string("chan") + ":" + std::to_string(chan) + ",";
        notes += json_string("muted") + ":" + std::string(muted ? "true" : "false");
        notes += "}";
    }
    notes += "]";

    // The per-step detail, if anything has written it. Absent is normal — a
    // part drawn by hand in the MIDI editor has notes and nothing else, and
    // must still read back.
    std::string ext;
    if (m_api.GetSetMediaItemTakeInfo_String) {
        std::vector<char> buf(EXT_BUF, 0);
        if (m_api.GetSetMediaItemTakeInfo_String(take, EXT_KEY, buf.data(), false))
            ext = buf.data();
    }

    std::string payload = "{";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("itemIdx") + ":" + std::to_string(itemIdx) + ",";
    payload += json_string("position") + ":" + std::to_string(pos) + ",";
    payload += json_string("length") + ":" + std::to_string(len) + ",";
    payload += json_string("ppqStart") + ":" + std::to_string(ppqStart) + ",";
    payload += json_string("ppqEnd") + ":" + std::to_string(ppqEnd) + ",";
    payload += json_string("noteCount") + ":" + std::to_string(noteCount) + ",";
    payload += json_string("notes") + ":" + notes + ",";
    payload += json_string("ext") + ":" + json_string(ext);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

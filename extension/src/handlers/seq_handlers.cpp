#include "command_handler.h"
#include "command_handler_helpers.h"
#include "seq_notes.h"

#include <algorithm>

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

// ------------------------------------------------------------
// Writing a pattern back.
//
// A write replaces every note in the take rather than patching individual
// ones. That sounds heavy and is the right call: note indices are positional
// and shift under you the moment anything is deleted, so incremental edits
// would need index bookkeeping that survives concurrent changes from the MIDI
// editor. Replacing wholesale has no such state, and a pattern is a few dozen
// notes.
//
// Notes arrive as a compact string rather than JSON. The parser in this
// codebase reads flat objects only, and hand-rolling one for an array of
// objects is more failure surface than the format is worth — the same reason
// slot sources are stored as "col|row|path" lines.
//
//   pitch:startPpq:endPpq:velocity:channel , ...
//
// Every record must have all five fields. A malformed one rejects the whole
// write, so a pattern is never left half-applied.
// ------------------------------------------------------------


void CommandHandler::HandleSeqWritePattern(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.GetTrackMediaItem || !m_api.GetActiveTake
        || !m_api.TakeIsMIDI || !m_api.MIDI_CountEvts || !m_api.MIDI_DeleteNote
        || !m_api.MIDI_InsertNote || !m_api.MIDI_Sort) {
        SendResponse(clientId, id, false, "{\"error\":\"Required MIDI APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const int   trackIdx = atoi(p1.getString("trackIdx").c_str());
    JsonParser  p2(payloadStr);
    const int   itemIdx = atoi(p2.getString("itemIdx").c_str());
    JsonParser  p3(payloadStr);
    const std::string notesStr = p3.getString("notes");
    JsonParser  p4(payloadStr);
    const std::string ext = p4.getString("ext");

    std::vector<scrb::ParsedNote> notes;
    if (!scrb::parseNotes(notesStr, notes)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Malformed notes — expected pitch:start:end:vel:chan records\"}");
        return;
    }

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

    if (m_api.Undo_BeginBlock2)
        m_api.Undo_BeginBlock2(nullptr);

    int existing = 0;
    m_api.MIDI_CountEvts(take, &existing, nullptr, nullptr);

    // Backwards. Deleting renumbers every note after the one removed, so a
    // forward loop would skip every second note.
    for (int i = existing - 1; i >= 0; --i)
        m_api.MIDI_DeleteNote(take, i);

    const bool noSort = true;
    int        written = 0;
    for (const scrb::ParsedNote& n : notes) {
        if (m_api.MIDI_InsertNote(take, false, false, n.start, n.end,
                                  n.chan, n.pitch, n.vel, &noSort))
            ++written;
    }
    m_api.MIDI_Sort(take);

    // The per-step detail that the notes cannot carry. An empty string is a
    // legitimate value — it means "this pattern has no extra detail" — so it
    // is written rather than skipped, otherwise stale data would survive a
    // caller that meant to clear it.
    if (m_api.GetSetMediaItemTakeInfo_String) {
        std::vector<char> buf(ext.begin(), ext.end());
        buf.push_back('\0');
        m_api.GetSetMediaItemTakeInfo_String(take, EXT_KEY, buf.data(), true);
    }

    if (m_api.Undo_EndBlock2)
        m_api.Undo_EndBlock2(nullptr, "Edit step pattern", 4 /* UNDO_STATE_ITEMS */);

    if (m_api.UpdateArrange)
        m_api.UpdateArrange();

    std::string payload = "{";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("itemIdx") + ":" + std::to_string(itemIdx) + ",";
    payload += json_string("removed") + ":" + std::to_string(existing) + ",";
    payload += json_string("written") + ":" + std::to_string(written);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ------------------------------------------------------------
// Creating somewhere to sequence.
//
// The point of the Steps tab is to get a pattern going quickly, and telling
// someone "make a MIDI item first" is the app asking the user to do its job.
// This makes the track and the item so that tapping a step is the first thing
// that happens, not the fourth.
//
// It deliberately does NOT add an instrument. ReaSamplOmatic5000 with no
// sample loaded is exactly as silent as no plugin at all, so adding one would
// look like progress while changing nothing. Choosing sounds is a separate
// job.
// ------------------------------------------------------------

void CommandHandler::HandleSeqCreateTrack(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.InsertTrackAtIndex || !m_api.CountTracks || !m_api.GetTrack
        || !m_api.CreateNewMIDIItemInProj || !m_api.GetTrackMediaItem) {
        SendResponse(clientId, id, false, "{\"error\":\"Required track APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    std::string name = p1.getString("name");
    JsonParser  p2(payloadStr);
    const int   barsIn = atoi(p2.getString("bars").c_str());

    if (name.empty())
        name = "Steps";
    const int bars = (barsIn > 0 && barsIn <= 64) ? barsIn : 2;

    if (m_api.Undo_BeginBlock2)
        m_api.Undo_BeginBlock2(nullptr);

    const int trackIdx = m_api.CountTracks(nullptr);
    m_api.InsertTrackAtIndex(trackIdx, true);

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        if (m_api.Undo_EndBlock2)
            m_api.Undo_EndBlock2(nullptr, "Create sequencer track", 1 /* UNDO_STATE_TRACKCFG */);
        SendResponse(clientId, id, false, "{\"error\":\"Track was not created\"}");
        return;
    }

    if (m_api.GetSetMediaTrackInfo_String) {
        std::vector<char> buf(name.begin(), name.end());
        buf.push_back('\0');
        m_api.GetSetMediaTrackInfo_String(track, "P_NAME", buf.data(), true);
    }

    // Four beats to the bar. REAPER can hold any time signature, but reading
    // it back for one default-length item is more machinery than the guess is
    // worth — the item can be dragged, and the grid divides whatever it finds.
    const double bpm = m_api.Master_GetTempo ? m_api.Master_GetTempo() : 120.0;
    const double barSeconds = (bpm > 0.0) ? (4.0 * 60.0 / bpm) : 2.0;
    m_api.CreateNewMIDIItemInProj(track, 0.0, bars * barSeconds, nullptr);

    // Report the item's index rather than assuming zero, so the caller can go
    // straight to it.
    int itemIdx = 0;
    if (m_api.CountTrackMediaItems)
        itemIdx = m_api.CountTrackMediaItems(track) - 1;
    if (itemIdx < 0)
        itemIdx = 0;

    if (m_api.Undo_EndBlock2)
        m_api.Undo_EndBlock2(nullptr, "Create sequencer track", 4 | 1);

    if (m_api.UpdateArrange)
        m_api.UpdateArrange();

    std::string payload = "{";
    payload += json_string("trackIdx") + ":" + std::to_string(trackIdx) + ",";
    payload += json_string("itemIdx") + ":" + std::to_string(itemIdx) + ",";
    payload += json_string("name") + ":" + json_string(name) + ",";
    payload += json_string("bars") + ":" + std::to_string(bars);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ------------------------------------------------------------
// Handing a pattern to Playtime.
//
// A MIDI item only sounds when the playhead crosses it, which is no use for
// jamming — and looping it via the time selection would hijack the global
// transport. Making it a Playtime clip solves both at once: Playtime plays
// with the transport stopped, loops, launches from the matrix, and is in
// phase with every other clip. Not because two clocks were bridged, but
// because there is only one clock. It *is* a Playtime clip.
//
// Nothing new is needed to do it. ReaLearn's PlaytimeSlotManagementAction
// already answers on OSC addresses the shipped preset defines, and the sample
// browser already uses the same route for audio:
//
//   /playtime/slot/COL/ROW/clear   -> ClearSlot
//   /playtime/slot/COL/ROW/import  -> FillSlotWithSelectedItem
//
// An item is an item; the MIDI one travels the same road as the audio one.
// Clear runs first so re-sending an edited pattern replaces the old clip
// rather than being refused or stacked on top of it.
//
// This is a copy, not a live link. Edit the grid afterwards and the slot
// holds the older take until it is sent again — the same bargain as
// consolidating a clip.
// ------------------------------------------------------------

void CommandHandler::HandleSeqSendToSlot(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.GetTrackMediaItem || !m_api.SetMediaItemSelected
        || !m_api.CountTracks || !m_api.CountTrackMediaItems) {
        SendResponse(clientId, id, false, "{\"error\":\"Required item APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const int   trackIdx = atoi(p1.getString("trackIdx").c_str());
    JsonParser  p2(payloadStr);
    const int   itemIdx = atoi(p2.getString("itemIdx").c_str());
    JsonParser  p3(payloadStr);
    const int   col = atoi(p3.getString("col").c_str());
    JsonParser  p4(payloadStr);
    const int   row = atoi(p4.getString("row").c_str());

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

    // FillSlotWithSelectedItem takes whatever is selected, so anything else
    // left selected would be swept into the slot alongside ours.
    const int trackCount = m_api.CountTracks(nullptr);
    for (int t = 0; t < trackCount; ++t) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;
        const int n = m_api.CountTrackMediaItems(tr);
        for (int i = 0; i < n; ++i) {
            MediaItem* it = m_api.GetTrackMediaItem(tr, i);
            if (it) m_api.SetMediaItemSelected(it, false);
        }
    }
    m_api.SetMediaItemSelected(item, true);
    if (m_api.UpdateArrange)
        m_api.UpdateArrange();

    const bool cleared  = m_oscSender.sendClearSlot(col, row);
    const bool imported = m_oscSender.sendImportSlot(col, row);

    // OSC is fire-and-forget over UDP, so "sent" is the strongest claim
    // available here — whether ReaLearn is listening is not knowable from
    // this side.
    std::string payload = "{";
    payload += json_string("col") + ":" + std::to_string(col) + ",";
    payload += json_string("row") + ":" + std::to_string(row) + ",";
    payload += json_string("sent") + ":" + std::string(cleared && imported ? "true" : "false");
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

// ------------------------------------------------------------
// Finding a drum rack built by MPL's RS5k manager.
//
// The sequencer's rows are currently guesses: whatever pitches happen to be
// in the item, or a default General MIDI drum set when it is empty. So a row
// is labelled "C1" rather than "Kick", and nothing is bound to it.
//
// A rack fixes that, because in a rack a row IS a sound. The manager builds a
// parent track holding the pattern and a child track per pad, each with a
// ReaSamplOmatic5000 and a sample, and marks all of it in track ext data:
//
//   parent   P_EXT:MPLRS5KMAN
//   child    P_EXT:MPLRS5KMAN_CHILD_PARENTGUID   links a pad to its rack
//            P_EXT:MPLRS5KMAN_NOTE               the note the pad answers to
//
// Marked rather than named, so this needs no guessing at all — unlike the
// Playtime column mapping, which had to be dug out of a plugin chunk.
//
// Read-only. Building a rack is the manager's job and it does it well; this
// only reads what it left behind, so a rack made before Spidercrab existed
// works exactly as well as one made this morning.
// ------------------------------------------------------------

void CommandHandler::HandleSeqListRacks(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    if (!m_api.CountTracks || !m_api.GetTrack || !m_api.GetSetMediaTrackInfo_String) {
        SendResponse(clientId, id, false, "{\"error\":\"Required track APIs not loaded\"}");
        return;
    }

    // GUIDs are compared with braces stripped and case folded, because REAPER
    // hands them back braced and other things store them bare.
    auto bare = [](const char* g) {
        std::string out;
        for (const char* p = g; p && *p; ++p)
            if (*p != '{' && *p != '}') out += (char)toupper((unsigned char)*p);
        return out;
    };

    auto trackExt = [&](MediaTrack* tr, const char* key, std::string& out) {
        std::vector<char> buf(4096, 0);
        if (!m_api.GetSetMediaTrackInfo_String(tr, key, buf.data(), false)) return false;
        out = buf.data();
        return !out.empty();
    };

    const int trackCount = m_api.CountTracks(nullptr);

    struct Pad { int note; int trackIdx; std::string name; };
    struct Rack { int trackIdx; std::string name; std::vector<Pad> pads; };

    std::vector<std::pair<std::string, int>> guidToTrack;  // (bare GUID, index)
    std::vector<std::pair<std::string, Rack>> racks;       // keyed by parent GUID

    for (int t = 0; t < trackCount; ++t) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;
        std::vector<char> g(128, 0);
        if (m_api.GetSetMediaTrackInfo_String(tr, "GUID", g.data(), false))
            guidToTrack.emplace_back(bare(g.data()), t);
    }

    for (int t = 0; t < trackCount; ++t) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;

        std::string parentGuid;
        if (!trackExt(tr, "P_EXT:MPLRS5KMAN_CHILD_PARENTGUID", parentGuid))
            continue;  // not a pad

        std::string noteStr;
        if (!trackExt(tr, "P_EXT:MPLRS5KMAN_NOTE", noteStr))
            continue;  // a pad with no note cannot be a row

        std::string name;
        std::vector<char> nb(512, 0);
        if (m_api.GetSetMediaTrackInfo_String(tr, "P_NAME", nb.data(), false))
            name = nb.data();

        const std::string key = bare(parentGuid.c_str());
        auto it = std::find_if(racks.begin(), racks.end(),
                               [&](const std::pair<std::string, Rack>& r) { return r.first == key; });
        if (it == racks.end()) {
            Rack r;
            r.trackIdx = -1;
            for (const auto& gt : guidToTrack)
                if (gt.first == key) { r.trackIdx = gt.second; break; }
            if (r.trackIdx >= 0) {
                MediaTrack* pt = m_api.GetTrack(nullptr, r.trackIdx);
                std::vector<char> pn(512, 0);
                if (pt && m_api.GetSetMediaTrackInfo_String(pt, "P_NAME", pn.data(), false))
                    r.name = pn.data();
            }
            racks.emplace_back(key, r);
            it = racks.end() - 1;
        }
        it->second.pads.push_back({atoi(noteStr.c_str()), t, name});
    }

    // Highest note first, matching the order a piano roll draws rows.
    for (auto& r : racks)
        std::sort(r.second.pads.begin(), r.second.pads.end(),
                  [](const Pad& a, const Pad& b) { return a.note > b.note; });

    std::string out = "[";
    for (size_t i = 0; i < racks.size(); ++i) {
        const Rack& r = racks[i].second;
        if (i > 0) out += ",";
        out += "{";
        out += json_string("trackIdx") + ":" + std::to_string(r.trackIdx) + ",";
        out += json_string("name") + ":" + json_string(r.name) + ",";
        out += json_string("pads") + ":[";
        for (size_t p = 0; p < r.pads.size(); ++p) {
            if (p > 0) out += ",";
            out += "{";
            out += json_string("note") + ":" + std::to_string(r.pads[p].note) + ",";
            out += json_string("trackIdx") + ":" + std::to_string(r.pads[p].trackIdx) + ",";
            out += json_string("name") + ":" + json_string(r.pads[p].name);
            out += "}";
        }
        out += "]}";
    }
    out += "]";

    SendResponse(clientId, id, true, "{\"racks\":" + out + "}");
}

// ------------------------------------------------------------
// Adding a pad to a drum rack.
//
// Reading a rack the manager built (seq/listRacks) was the easy half. This is
// the other: building one from the iPad, so a sample tapped in the browser
// becomes a row in the step grid with a sound behind it.
//
// It writes the manager's own ext-data keys rather than inventing a private
// format. Those keys are what seq/listRacks already reads, and using them
// means a rack started here can be picked up and extended in the manager, and
// one built there gains pads from here. Two tools, one rack.
//
// The RS5k setup mirrors what the manager does, including note range on
// parameters 3 and 4 as note/127 — taken from its source rather than guessed,
// since getting that wrong makes a pad answer to every note at once.
//
// Not verified against the manager's own window: it reads these keys, but
// whether it considers a rack of ours complete is not something this can
// assert.
// ------------------------------------------------------------

void CommandHandler::HandleSeqAddPad(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.CountTracks || !m_api.GetTrack || !m_api.InsertTrackAtIndex
        || !m_api.GetSetMediaTrackInfo_String || !m_api.TrackFX_AddByName
        || !m_api.TrackFX_SetNamedConfigParm || !m_api.SetMediaTrackInfo_Value) {
        SendResponse(clientId, id, false, "{\"error\":\"Required track APIs not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const std::string path = p1.getString("path");
    JsonParser  p2(payloadStr);
    const std::string noteStr = p2.getString("note");

    if (path.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"path is required\"}");
        return;
    }

    auto bare = [](const char* g) {
        std::string out;
        for (const char* p = g; p && *p; ++p)
            if (*p != '{' && *p != '}') out += (char)toupper((unsigned char)*p);
        return out;
    };
    auto readExt = [&](MediaTrack* tr, const char* key, std::string& out) {
        std::vector<char> buf(4096, 0);
        if (!m_api.GetSetMediaTrackInfo_String(tr, key, buf.data(), false)) return false;
        out = buf.data();
        return !out.empty();
    };
    auto writeExt = [&](MediaTrack* tr, const char* key, const std::string& value) {
        std::vector<char> buf(value.begin(), value.end());
        buf.push_back('\0');
        m_api.GetSetMediaTrackInfo_String(tr, key, buf.data(), true);
    };

    if (m_api.Undo_BeginBlock2) m_api.Undo_BeginBlock2(nullptr);

    // Find an existing rack: a track carrying the manager's parent marker.
    int         parentIdx = -1;
    std::string parentGuid;
    int         trackCount = m_api.CountTracks(nullptr);
    for (int t = 0; t < trackCount && parentIdx < 0; ++t) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;
        std::string marker;
        if (readExt(tr, "P_EXT:MPLRS5KMAN", marker)) {
            parentIdx = t;
            std::vector<char> g(128, 0);
            if (m_api.GetSetMediaTrackInfo_String(tr, "GUID", g.data(), false))
                parentGuid = bare(g.data());
        }
    }

    if (parentIdx < 0) {
        // No rack yet, so make one. A folder, so its pads collapse into it and
        // the arrangement does not fill with one track per drum.
        parentIdx = trackCount;
        m_api.InsertTrackAtIndex(parentIdx, true);
        MediaTrack* parent = m_api.GetTrack(nullptr, parentIdx);
        if (!parent) {
            if (m_api.Undo_EndBlock2) m_api.Undo_EndBlock2(nullptr, "Add drum pad", 1);
            SendResponse(clientId, id, false, "{\"error\":\"Could not create the rack track\"}");
            return;
        }
        writeExt(parent, "P_NAME", "Drum Rack");
        writeExt(parent, "P_EXT:MPLRS5KMAN", "1");
        m_api.SetMediaTrackInfo_Value(parent, "I_FOLDERDEPTH", 1);
        std::vector<char> g(128, 0);
        if (m_api.GetSetMediaTrackInfo_String(parent, "GUID", g.data(), false))
            parentGuid = bare(g.data());
        trackCount = m_api.CountTracks(nullptr);
    }

    // Existing pads, so a new one lands after them and takes the next free
    // note rather than colliding with one already in use.
    int  lastPadIdx  = parentIdx;
    int  highestNote = 35;  // 36 is the General MIDI kick, a conventional first pad
    bool used[128]   = {false};
    for (int t = parentIdx + 1; t < trackCount; ++t) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;
        std::string pg;
        if (!readExt(tr, "P_EXT:MPLRS5KMAN_CHILD_PARENTGUID", pg)) continue;
        if (bare(pg.c_str()) != parentGuid) continue;
        lastPadIdx = t;
        std::string n;
        if (readExt(tr, "P_EXT:MPLRS5KMAN_NOTE", n)) {
            const int v = atoi(n.c_str());
            if (v >= 0 && v < 128) { used[v] = true; if (v > highestNote) highestNote = v; }
        }
    }

    int note = noteStr.empty() ? -1 : atoi(noteStr.c_str());
    if (note < 0 || note > 127) {
        note = highestNote + 1;
        while (note < 128 && used[note]) ++note;
    }
    if (note > 127) {
        if (m_api.Undo_EndBlock2) m_api.Undo_EndBlock2(nullptr, "Add drum pad", 1);
        SendResponse(clientId, id, false, "{\"error\":\"No free note left in this rack\"}");
        return;
    }

    const int padIdx = lastPadIdx + 1;
    m_api.InsertTrackAtIndex(padIdx, true);
    MediaTrack* pad = m_api.GetTrack(nullptr, padIdx);
    if (!pad) {
        if (m_api.Undo_EndBlock2) m_api.Undo_EndBlock2(nullptr, "Add drum pad", 1);
        SendResponse(clientId, id, false, "{\"error\":\"Could not create the pad track\"}");
        return;
    }

    // Name the pad after the sample. That name becomes the grid's row label,
    // which is the whole point of a rack over a bare note number.
    std::string fileName = path;
    const size_t sep = fileName.find_last_of("/\\");
    if (sep != std::string::npos) fileName = fileName.substr(sep + 1);
    const size_t dot = fileName.find_last_of('.');
    if (dot != std::string::npos && dot > 0) fileName = fileName.substr(0, dot);
    writeExt(pad, "P_NAME", fileName);

    writeExt(pad, "P_EXT:MPLRS5KMAN_CHILD_PARENTGUID", parentGuid);
    writeExt(pad, "P_EXT:MPLRS5KMAN_NOTE", std::to_string(note));
    writeExt(pad, "P_EXT:MPLRS5KMAN_TYPE_REGCHILD", "1");

    // Close the folder on the new last pad and reopen the one that used to
    // close it, so the rack stays a single collapsible group as it grows.
    if (lastPadIdx > parentIdx) {
        MediaTrack* prev = m_api.GetTrack(nullptr, lastPadIdx);
        if (prev) m_api.SetMediaTrackInfo_Value(prev, "I_FOLDERDEPTH", 0);
    }
    m_api.SetMediaTrackInfo_Value(pad, "I_FOLDERDEPTH", -1);

    const int fxIdx = m_api.TrackFX_AddByName(pad, "ReaSamplOmatic5000", false, 1);
    if (fxIdx >= 0) {
        m_api.TrackFX_SetNamedConfigParm(pad, fxIdx, "FILE0", path.c_str());
        m_api.TrackFX_SetNamedConfigParm(pad, fxIdx, "DONE", "");
        // Mode 0 plays the sample as recorded. A drum pad answers to one note
        // and must not transpose with it, unlike the chromatic sampler track
        // that sampler/create builds.
        m_api.TrackFX_SetNamedConfigParm(pad, fxIdx, "MODE", "0");
        if (m_api.TrackFX_SetParamNormalized) {
            m_api.TrackFX_SetParamNormalized(pad, fxIdx, 3, note / 127.0);  // note range start
            m_api.TrackFX_SetParamNormalized(pad, fxIdx, 4, note / 127.0);  // note range end
        }
    }

    // MIDI comes down from the rack track, not a hardware input, so the
    // pattern on the parent reaches every pad.
    m_api.SetMediaTrackInfo_Value(pad, "I_RECARM", 0);
    m_api.SetMediaTrackInfo_Value(pad, "B_MAINSEND", 1);

    if (m_api.Undo_EndBlock2) m_api.Undo_EndBlock2(nullptr, "Add drum pad", 1);
    if (m_api.UpdateArrange) m_api.UpdateArrange();

    std::string payload = "{";
    payload += json_string("rackTrackIdx") + ":" + std::to_string(parentIdx) + ",";
    payload += json_string("padTrackIdx") + ":" + std::to_string(padIdx) + ",";
    payload += json_string("note") + ":" + std::to_string(note) + ",";
    payload += json_string("name") + ":" + json_string(fileName) + ",";
    payload += json_string("fxIdx") + ":" + std::to_string(fxIdx);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

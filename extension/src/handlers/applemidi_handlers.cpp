#include "command_handler.h"
#include "command_handler_helpers.h"

#include <cstdio>
#include <cstdlib>

// ============================================================
// AppleMIDI (RTP-MIDI) commands — "direct to selected track".
//
// The frontend's keyboard talks to the iPad's CoreMIDI Network
// Session (Web MIDI API), which streams RTP-MIDI to this extension
// over UDP. applemidi/connect points the server at the caller's own
// WS peer IP (the iPad) so no IP entry is needed — the browser never
// knows its own address, but the WebSocket server does.
// ============================================================

void CommandHandler::InitAppleMidi()
{
    m_appleMidi.setSessionName("spidercrab");

    m_appleMidi.setMidiCallback([this](int status, int d1, int d2) {
        HandleAppleMidiMessage(status, d1, d2);
    });

    m_appleMidi.setStateCallback([this](const std::string& state, const std::string& host) {
        // Any session end must silence the notes we were holding, or they
        // hang until the next note-on/off pair — classic stuck-note bug.
        if (state != "open")
            PanicHeldNotes();

        if (m_ws) {
            std::string event = "{\"type\":\"event\",\"event\":\"applemidi/stateChanged\",";
            event += "\"payload\":{\"state\":\"" + state + "\",\"host\":\"" + host + "\"}}";
            m_ws->Broadcast(event);
        }
    });

    if (!m_appleMidi.start(AppleMidiServer::kDefaultPort)) {
        fprintf(stderr, "[spidercrab] applemidi: server failed to start on port %u\n",
            AppleMidiServer::kDefaultPort);
    }
}

void CommandHandler::HandleApplemidiConnect(
    int clientId, const std::string& id, const std::string& params)
{
    JsonParser parser(params);
    std::string host = parser.getString("host");
    if (host.empty() && m_ws) {
        // No host given: use the caller's own IP — the iPad talking to us
        // over the WebSocket is also the device running the Network MIDI
        // session, so its address is exactly where the invitation goes.
        m_ws->GetClientIp(clientId, host);
    }
    if (host.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"No host address available\"}");
        return;
    }
    int port = atoi(parser.getString("port").c_str());
    if (port <= 0 || port > 65534) port = AppleMidiServer::kDefaultPort;

    const bool ok = m_appleMidi.connectTo(host, static_cast<uint16_t>(port));
    SendResponse(clientId, id, ok,
        ok ? m_appleMidi.statusJson() : "{\"error\":\"Connect failed\"}");
}

void CommandHandler::HandleApplemidiDisconnect(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    m_appleMidi.disconnect();
    SendResponse(clientId, id, true, "{\"disconnected\":true}");
}

void CommandHandler::HandleApplemidiStatus(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    std::string payload = m_appleMidi.statusJson();
    // Append the routing flag onto the object body
    payload.resize(payload.size() - 1); // drop trailing '}'
    payload += ",\"routing\":";
    payload += m_appleMidiRouting ? "true" : "false";
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleApplemidiSetRouting(
    int clientId, const std::string& id, const std::string& params)
{
    JsonParser parser(params);
    const std::string on = parser.getString("enabled");
    const bool enabled = (on == "true" || on == "1");
    SetAppleMidiRouting(enabled);
    SendResponse(clientId, id, true,
        std::string("{\"routing\":") + (enabled ? "true" : "false") + "}");
}

// ============================================================
// Direct-to-selected-track routing
// ============================================================

// Low-latency note endpoint: a dedicated 1ms-thread WebSocket listener.
// The fast thread never touches REAPER project APIs — it only reads the
// atomically-published target track and stuffs the VKB queue.
void CommandHandler::StartFastMidi(int port)
{
    m_fastMidi.SetNoteCallback([this](int status, int d1, int d2) {
        HandleFastMidiMessage(status, d1, d2);
    });
    // The browser refreshing or closing mid-hold would otherwise leave
    // notes sounding forever — panic on the connection drop.
    m_fastMidi.SetDisconnectCallback([this]() {
        PanicHeldNotes();
    });
    if (!m_fastMidi.Start(port)) {
        fprintf(stderr, "[spidercrab] fast-midi: failed to start on port %d\n", port);
    }
}

// Main-thread refresh (Run()): keep the fast thread's target track in
// sync with REAPER's selection, and perform the one-time routing work
// (I_RECINPUT / arm / monitor) here where the API calls are safe.
void CommandHandler::TickMidiRouting()
{
    if (!m_appleMidiRouting.load()) {
        m_fastMidiTarget.store(nullptr);
        return;
    }
    MediaTrack* selected = m_api.GetSelectedTrack ? m_api.GetSelectedTrack(nullptr, 0) : nullptr;
    if (selected && selected != m_fastMidiTarget.load()) {
        EnsureTrackRouted(selected);
    }
    m_fastMidiTarget.store(selected);
}

void CommandHandler::HandleFastMidiMessage(int status, int d1, int d2)
{
    if (!m_fastMidiEnabled.load()) {
        // Slow path: hop to the main thread like any other command.
        QueueMainThread([this, status, d1, d2]() { HandleAppleMidiMessage(status, d1, d2); });
        return;
    }
    if (!m_appleMidiRouting.load()) return;
    if (!m_api.StuffMIDIMessage) return;

    const int kind = static_cast<int>(status) & 0xF0;
    const int chan = status & 0x0F;
    {
        std::lock_guard<std::mutex> lock(m_fastMidiMutex);
        if (kind == 0x90 && d2 > 0) {
            m_appleMidiHeldNotes.emplace_back(chan, d1);
        } else if (kind == 0x80 || (kind == 0x90 && d2 == 0)) {
            for (auto it = m_appleMidiHeldNotes.begin(); it != m_appleMidiHeldNotes.end(); ++it) {
                if (it->first == chan && it->second == d1) {
                    m_appleMidiHeldNotes.erase(it);
                    break;
                }
            }
        }
    }

    MediaTrack* target = m_fastMidiTarget.load();
    if (!target) return; // no selected track — nothing to play into

    // StuffMIDIMessage mode 0 = Virtual MIDI Keyboard queue (a queue push,
    // safe from any thread; the audio thread drains it at block rate).
    m_api.StuffMIDIMessage(0, status, d1, d2);
}

// Main-server fallback commands (slow path — 30Hz Run() dispatch).
// The frontend uses these for compatibility/testing; the fast endpoint
// is what a live keyboard should ride.
void CommandHandler::HandleMidiNoteOn(
    int clientId, const std::string& id, const std::string& params)
{
    JsonParser parser(params);
    const int note = atoi(parser.getString("note").c_str());
    const int vel  = atoi(parser.getString("velocity").c_str());
    const int chan = atoi(parser.getString("channel").c_str()) & 0x0F;
    if (note < 0 || note > 127 || vel <= 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid note or velocity\"}");
        return;
    }
    HandleAppleMidiMessage(0x90 | chan, note, vel);
    SendResponse(clientId, id, true, "{\"sent\":true}");
}

void CommandHandler::HandleMidiNoteOff(
    int clientId, const std::string& id, const std::string& params)
{
    JsonParser parser(params);
    const int note = atoi(parser.getString("note").c_str());
    const int chan = atoi(parser.getString("channel").c_str()) & 0x0F;
    if (note < 0 || note > 127) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid note\"}");
        return;
    }
    HandleAppleMidiMessage(0x80 | chan, note, 0);
    SendResponse(clientId, id, true, "{\"sent\":true}");
}

void CommandHandler::HandleMidiSetFastPath(
    int clientId, const std::string& id, const std::string& params)
{
    JsonParser parser(params);
    const std::string on = parser.getString("enabled");
    const bool enabled = (on == "true" || on == "1");
    m_fastMidiEnabled.store(enabled);
    SendResponse(clientId, id, true,
        std::string("{\"fastPath\":") + (enabled ? "true" : "false") + "}");
}

void CommandHandler::SetAppleMidiRouting(bool enabled)
{
    if (m_appleMidiRouting == enabled) return;
    m_appleMidiRouting = enabled;

    if (!enabled) {
        // Restore each track we touched to its previous input/monitor state
        for (auto& entry : m_appleMidiRouted) {
            MediaTrack* tr = static_cast<MediaTrack*>(entry.first);
            const TrackRouteSave& saved = entry.second;
            if (m_api.GetSetMediaTrackInfo && saved.input >= 0) {
                int restoreInput = saved.input;
                m_api.GetSetMediaTrackInfo(tr, "I_RECINPUT", &restoreInput);
            }
            if (m_api.SetMediaTrackInfo_Value) {
                if (saved.arm >= 0) m_api.SetMediaTrackInfo_Value(tr, "I_RECARM", saved.arm);
                if (saved.mon >= 0) m_api.SetMediaTrackInfo_Value(tr, "I_RECMON", saved.mon);
            }
        }
        m_appleMidiRouted.clear();
        PanicHeldNotes();
    }
}

void CommandHandler::EnsureTrackRouted(MediaTrack* tr)
{
    if (m_appleMidiRouted.count(tr)) return; // already handled this track
    if (!m_api.GetSetMediaTrackInfo || !m_api.SetMediaTrackInfo_Value) return;

    TrackRouteSave saved;

    // I_RECINPUT: <0 = none; 4096 set = MIDI; low 5 bits = channel (0=all);
    // next 6 bits = physical input (63=all, 62=VKB). 4096|62<<5|0 = 6080.
    int* inputPtr = static_cast<int*>(m_api.GetSetMediaTrackInfo(tr, "I_RECINPUT", nullptr));
    const int current = inputPtr ? *inputPtr : 0;
    saved.input = current;

    int vkbValue = 0x1000 | (62 << 5) | 0;
    if ((current & 0x1000) == 0 || ((current >> 5) & 0x3F) != 62) {
        m_api.GetSetMediaTrackInfo(tr, "I_RECINPUT", &vkbValue);
    }

    // SetMediaTrackInfo_Value returns only success, so the previous arm and
    // monitor states are read out first for restoration later.
    int* armPtr = static_cast<int*>(m_api.GetSetMediaTrackInfo(tr, "I_RECARM", nullptr));
    saved.arm = armPtr ? *armPtr : 0;
    m_api.SetMediaTrackInfo_Value(tr, "I_RECARM", 1.0);

    int* monPtr = static_cast<int*>(m_api.GetSetMediaTrackInfo(tr, "I_RECMON", nullptr));
    saved.mon = monPtr ? *monPtr : 0;
    m_api.SetMediaTrackInfo_Value(tr, "I_RECMON", 1.0);

    m_appleMidiRouted[tr] = saved;
}

void CommandHandler::PanicHeldNotes()
{
    std::lock_guard<std::mutex> lock(m_fastMidiMutex);
    if (!m_api.StuffMIDIMessage) {
        m_appleMidiHeldNotes.clear();
        return;
    }
    for (const auto& held : m_appleMidiHeldNotes) {
        m_api.StuffMIDIMessage(0, 0x80 | held.first, held.second, 0);
    }
    m_appleMidiHeldNotes.clear();
}

void CommandHandler::HandleAppleMidiMessage(int status, int d1, int d2)
{
    if (!m_appleMidiRouting) return;
    if (!m_api.StuffMIDIMessage) return;

    const int kind = status & 0xF0;
    const int chan = status & 0x0F;

    // Track held notes so a session drop or routing toggle can panic them
    {
        std::lock_guard<std::mutex> lock(m_fastMidiMutex);
        if (kind == 0x90 && d2 > 0) {
            m_appleMidiHeldNotes.emplace_back(chan, d1);
        } else if (kind == 0x80 || (kind == 0x90 && d2 == 0)) {
            for (auto it = m_appleMidiHeldNotes.begin(); it != m_appleMidiHeldNotes.end(); ++it) {
                if (it->first == chan && it->second == d1) {
                    m_appleMidiHeldNotes.erase(it);
                    break;
                }
            }
        }
    }

    // Direct to the selected track: nothing to do without one.
    MediaTrack* track = m_api.GetSelectedTrack ? m_api.GetSelectedTrack(nullptr, 0) : nullptr;
    if (!track) return;

    EnsureTrackRouted(track);

    // StuffMIDIMessage mode 0 = Virtual MIDI Keyboard queue
    m_api.StuffMIDIMessage(0, status, d1, d2);
}

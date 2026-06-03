#pragma once

// ============================================================
// PlaytimeMidi — MIDI injection helper for clip launcher
//
// Wraps REAPER's MIDI output API for triggering Playtime 2
// clip slots via MIDI notes. Uses a simple function pointer so
// it works in both real REAPER and standalone test contexts.
//
// Note mapping: note = baseNote + (row * 8) + column
// Default baseNote = 36 (C2), matching Push 2 grid layout.
//
// In tests (no REAPER), the send function pointer stays null
// and all operations are no-ops.
// ============================================================

#include <cstdio>
#include <functional>

// Callable type for sending a single MIDI message
// Parameters: status byte, data1, data2 (timestamp = -1 = send immediately)
using MidiSendFunc = std::function<void(int status, int d1, int d2)>;

class PlaytimeMidi {
public:
    PlaytimeMidi()
        : m_sendFunc(nullptr)
        , m_channel(0)
        , m_baseNote(36)
    {
    }

    // Set the MIDI send function pointer (typically wraps REAPER's
    // CreateMIDIOutput + midi_Output::Send). Stays null in tests.
    void setSendFunc(MidiSendFunc func) { m_sendFunc = func; }

    // Returns true if a MIDI output is configured
    bool isAvailable() const { return static_cast<bool>(m_sendFunc); }

    // Configure MIDI channel (0-15) and base note
    void setChannel(int ch) { m_channel = ch & 0x0F; }
    void setBaseNote(int note) { m_baseNote = note & 0x7F; }

    int channel() const { return m_channel; }
    int baseNote() const { return m_baseNote; }

    // Send a single MIDI note (Note On followed by Note Off)
    void sendMidiNote(int channel, int note, int velocity)
    {
        if (!m_sendFunc) {
            fprintf(stderr, "[reaper-ipad] playtime_midi: sendMidiNote skipped — no send function (nullptr)\n");
            return;
        }
        int status = 0x90 | (channel & 0x0F);
        fprintf(stderr, "[reaper-ipad] playtime_midi: sending NoteOn ch=%d note=%d vel=%d\n",
                channel, note & 0x7F, velocity & 0x7F);
        m_sendFunc(status, note & 0x7F, velocity & 0x7F);
        // Note Off immediately after (velocity 0 on same note)
        m_sendFunc(status, note & 0x7F, 0);
        fprintf(stderr, "[reaper-ipad] playtime_midi: NoteOff sent for note=%d\n", note & 0x7F);
    }

    // Trigger a slot at (column, row) by sending the corresponding MIDI note.
    // Note mapping matches the Push 2's note layout:
    //   note = baseNote + (row * 8) + column
    //
    // Playtime 2 listens on its virtual MIDI input port. When it receives a
    // note matching one of its grid slots, it triggers the corresponding clip.
    void triggerSlotViaMidi(int column, int row)
    {
        int note = m_baseNote + (row * 8) + column;
        if (note > 127) {
            fprintf(stderr, "[reaper-ipad] playtime_midi: note %d out of range (col=%d row=%d)\n",
                note, column, row);
            return;
        }
        fprintf(stderr, "[reaper-ipad] playtime_midi: triggering slot col=%d row=%d via MIDI note %d (base=%d ch=%d)\n",
                column, row, note, m_baseNote, m_channel);
        sendMidiNote(m_channel, note, 100);
    }

private:
    MidiSendFunc m_sendFunc;
    int          m_channel;
    int          m_baseNote;
};

#pragma once
#include <cstdlib>
#include <string>
#include <vector>

// ============================================================
// The wire format for a pattern's notes.
//
//   pitch:startPpq:endPpq:velocity:channel , ...
//
// Compact rather than JSON, for the same reason slot sources are stored as
// "col|row|path" lines: the JSON parser in this codebase reads flat objects
// only, and hand-rolling one for an array of objects is more failure surface
// than the format is worth.
//
// Lives in its own header purely so it can be unit-tested. It is the part of
// the write path most likely to have a bug, and the handler around it needs a
// live REAPER to exercise.
// ============================================================

namespace scrb {

struct ParsedNote {
    int    pitch = 0;
    double start = 0.0;  ///< PPQ, relative to the take
    double end   = 0.0;
    int    vel   = 0;
    int    chan  = 0;
};

/// Parse the whole string, or fail.
///
/// Every record must carry all five fields, and each is checked against the
/// range MIDI actually allows. Out-of-range values are rejected rather than
/// clamped: a pitch of 200 means the caller has a bug, and quietly writing
/// note 127 instead would hide it.
///
/// A single malformed record fails the entire parse, so a caller can treat a
/// write as all-or-nothing and never leave half a pattern behind.
///
/// Returns false on any error, in which case `out` must not be used.
inline bool parseNotes(const std::string& s, std::vector<ParsedNote>& out)
{
    out.clear();

    size_t pos = 0;
    while (pos < s.size()) {
        size_t comma = s.find(',', pos);
        if (comma == std::string::npos)
            comma = s.size();

        const std::string rec = s.substr(pos, comma - pos);
        pos = comma + 1;
        if (rec.empty())
            continue;  // tolerate a trailing or doubled comma

        double f[5] = {0, 0, 0, 0, 0};
        int    n    = 0;
        size_t fp   = 0;
        while (n < 5) {
            size_t colon = rec.find(':', fp);
            if (colon == std::string::npos)
                colon = rec.size();
            if (colon == fp)
                return false;  // empty field
            f[n++] = atof(rec.substr(fp, colon - fp).c_str());
            if (colon == rec.size()) {
                fp = colon;
                break;
            }
            fp = colon + 1;
        }
        // Five fields exactly — no more, no fewer.
        if (n != 5 || fp != rec.size())
            return false;

        ParsedNote note;
        note.pitch = static_cast<int>(f[0]);
        note.start = f[1];
        note.end   = f[2];
        note.vel   = static_cast<int>(f[3]);
        note.chan  = static_cast<int>(f[4]);

        if (note.pitch < 0 || note.pitch > 127) return false;
        if (note.vel   < 1 || note.vel   > 127) return false;  // 0 would be a note-off
        if (note.chan  < 0 || note.chan  > 15)  return false;
        if (note.start < 0.0)                   return false;
        if (note.end  <= note.start)            return false;  // zero-length is silent

        out.push_back(note);
    }
    return true;
}

}  // namespace scrb

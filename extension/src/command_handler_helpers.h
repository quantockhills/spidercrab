#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "reaper_plugin.h"
#undef min
#undef max

namespace fs = std::filesystem;

// ============================================================
// Minimal JSON builder (no dependencies)
// ============================================================

static inline std::string json_escape(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 2);
    for (char c : s) {
        switch (c) {
        case '"':
            out += "\\\"";
            break;
        case '\\':
            out += "\\\\";
            break;
        case '\b':
            out += "\\b";
            break;
        case '\f':
            out += "\\f";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
        default:
            if ((unsigned char)c < 0x20) {
                char buf[8];
                snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
                out += buf;
            } else {
                out += c;
            }
        }
    }
    return out;
}

static inline std::string json_string(const char* s)
{
    return "\"" + json_escape(s ? s : "") + "\"";
}

static inline std::string json_string(const std::string& s)
{
    return json_string(s.c_str());
}

// ============================================================
// Very simple JSON parser for extracting values
// ============================================================
struct JsonParser {
    const std::string& s;
    size_t             pos = 0;

    JsonParser(const std::string& str)
        : s(str)
    {
    }

    void skipWhitespace()
    {
        while (
            pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\n' || s[pos] == '\r'))
            pos++;
    }

    char peek()
    {
        skipWhitespace();
        return pos < s.size() ? s[pos] : 0;
    }
    char next()
    {
        skipWhitespace();
        return pos < s.size() ? s[pos++] : 0;
    }

    std::string parseString()
    {
        if (next() != '"')
            return "";
        std::string result;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\') {
                pos++;
                if (pos >= s.size())
                    break;
                switch (s[pos]) {
                case '"':
                    result += '"';
                    break;
                case '\\':
                    result += '\\';
                    break;
                case 'n':
                    result += '\n';
                    break;
                case 'r':
                    result += '\r';
                    break;
                case 't':
                    result += '\t';
                    break;
                default:
                    result += s[pos];
                    break;
                }
                pos++;
            } else {
                result += s[pos++];
            }
        }
        if (pos < s.size())
            pos++; // skip closing quote
        return result;
    }

    std::string parseNumber()
    {
        std::string num;
        if (peek() == '-') {
            num += next();
        }
        while (pos < s.size() && isdigit(s[pos]))
            num += s[pos++];
        if (pos < s.size() && s[pos] == '.') {
            num += s[pos++];
            while (pos < s.size() && isdigit(s[pos]))
                num += s[pos++];
        }
        if (pos < s.size() && (s[pos] == 'e' || s[pos] == 'E')) {
            num += s[pos++];
            if (pos < s.size() && (s[pos] == '+' || s[pos] == '-'))
                num += s[pos++];
            while (pos < s.size() && isdigit(s[pos]))
                num += s[pos++];
        }
        return num;
    }

    // Get a string value for a key in an object
    std::string getString(const std::string& key)
    {
        if (peek() == '{')
            next();
        if (peek() == ',')
            next();
        while (peek() != '}' && pos < s.size()) {
            std::string k = parseString();
            if (next() != ':')
                return "";
            if (k == key) {
                char c = peek();
                if (c == '"')
                    return parseString();
                return parseNumber();
            } else {
                char c = peek();
                if (c == '"')
                    parseString();
                else if (c == '{') {
                    pos++;
                    int depth = 1;
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '{')
                            depth++;
                        if (s[pos] == '}')
                            depth--;
                        pos++;
                    }
                } else if (c == '[') {
                    pos++;
                    int depth = 1;
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '[')
                            depth++;
                        if (s[pos] == ']')
                            depth--;
                        pos++;
                    }
                } else
                    parseNumber();
            }
            if (peek() == ',')
                next();
        }
        next(); // skip }
        return "";
    }
};

// ============================================================
// Extract the JSON object inside "payload" from a command message.
// ============================================================
static inline std::string extractPayload(const std::string& message)
{
    size_t pos = message.find("\"payload\"");
    if (pos == std::string::npos)
        return message;
    pos = message.find(':', pos);
    if (pos == std::string::npos)
        return message;
    pos++;
    while (pos < message.size() && (message[pos] == ' ' || message[pos] == '\t'))
        pos++;
    if (pos >= message.size() || message[pos] != '{')
        return message;
    int depth = 1;
    size_t start = pos;
    pos++;
    while (pos < message.size() && depth > 0) {
        if (message[pos] == '{') depth++;
        if (message[pos] == '}') depth--;
        pos++;
    }
    if (depth != 0)
        return message;
    return message.substr(start, pos - start);
}

// ============================================================
// FX chain RPPXML helpers
// ============================================================

// Helper: find next REAPER section marker (< or >) at line start.
static inline size_t findNextSectionMarker(const std::string& chunk, size_t pos,
                                     bool* isOpen, bool* isCloseTag)
{
    while (pos < chunk.size()) {
        size_t lt = chunk.find('<', pos);
        size_t gt = chunk.find('>', pos);

        if (lt == std::string::npos && gt == std::string::npos)
            return std::string::npos;

        bool ltAtLineStart = false;
        bool gtAtLineStart = false;

        if (lt != std::string::npos) {
            if (lt == 0) ltAtLineStart = true;
            else {
                size_t scan = lt;
                while (scan > 0) {
                    --scan;
                    char c = chunk[scan];
                    if (c == '\n') { ltAtLineStart = true; break; }
                    if (c != ' ' && c != '\t') break;
                }
                if (scan == 0) ltAtLineStart = true;
            }
        }

        if (gt != std::string::npos) {
            if (gt == 0) gtAtLineStart = true;
            else {
                size_t scan = gt;
                while (scan > 0) {
                    --scan;
                    char c = chunk[scan];
                    if (c == '\n') { gtAtLineStart = true; break; }
                    if (c != ' ' && c != '\t') break;
                }
                if (scan == 0) gtAtLineStart = true;
            }
        }

        if (!ltAtLineStart && !gtAtLineStart) {
            size_t next = std::string::npos;
            if (lt != std::string::npos && gt != std::string::npos)
                next = std::min(lt, gt) + 1;
            else if (lt != std::string::npos)
                next = lt + 1;
            else
                next = gt + 1;

            if (next <= pos) next = pos + 1;
            pos = next;
            continue;
        }

        if (gtAtLineStart && (!ltAtLineStart || gt < lt)) {
            *isOpen = false;
            *isCloseTag = false;
            return gt;
        }

        if (ltAtLineStart) {
            if (lt + 1 < chunk.size() && chunk[lt + 1] == '/') {
                *isOpen = false;
                *isCloseTag = true;
                return lt;
            }
            *isOpen = true;
            *isCloseTag = false;
            return lt;
        }

        pos = (lt != std::string::npos ? lt : gt) + 1;
    }
    return std::string::npos;
}

static inline std::string extractFxChainFromChunk(const std::string& chunk)
{
    size_t start = chunk.find("<FXCHAIN");
    if (start == std::string::npos)
        return "";

    int depth = 0;
    size_t pos = start;
    while (pos < chunk.size()) {
        bool isOpen = false;
        bool isCloseTag = false;
        size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
        if (marker == std::string::npos)
            break;

        if (!isOpen) {
            depth--;
            if (depth == 0) {
                if (isCloseTag) {
                    size_t closeGt = chunk.find('>', marker);
                    if (closeGt != std::string::npos)
                        return chunk.substr(start, closeGt - start + 1);
                }
                return chunk.substr(start, marker - start + 1);
            }
            if (isCloseTag) {
                size_t closeGt = chunk.find('>', marker);
                if (closeGt != std::string::npos) {
                    pos = closeGt + 1;
                } else {
                    pos = marker + 1;
                }
            } else {
                pos = marker + 1;
            }
        } else {
            size_t endTag = chunk.find('>', marker);
            if (endTag != std::string::npos) {
                size_t newline = chunk.find('\n', marker);
                if (newline != std::string::npos && newline < endTag) {
                    depth++;
                    pos = marker + 1;
                } else {
                    std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                    while (!tagContent.empty() &&
                           (tagContent.back() == ' ' || tagContent.back() == '\t'))
                        tagContent.pop_back();
                    if (!tagContent.empty() && tagContent.back() == '/') {
                        pos = endTag + 1;
                    } else {
                        depth++;
                        pos = endTag + 1;
                    }
                }
            } else {
                depth++;
                pos = marker + 1;
            }
        }
    }
    return "";
}

static inline std::string replaceFxChainInChunk(const std::string& chunk, const std::string& newFxChain)
{
    size_t start = chunk.find("<FXCHAIN");
    if (start == std::string::npos) {
        size_t trackOpen = chunk.find("<TRACK");
        size_t trackClose = std::string::npos;
        if (trackOpen != std::string::npos) {
            int depth = 0;
            size_t pos = trackOpen;
            while (pos < chunk.size()) {
                bool isOpen = false;
                bool isCloseTag = false;
                size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
                if (marker == std::string::npos) break;

                if (!isOpen) {
                    depth--;
                    if (depth == 0) {
                        size_t closeGt = chunk.find('>', marker);
                        if (closeGt != std::string::npos)
                            trackClose = closeGt;
                        else
                            trackClose = marker;
                        break;
                    }
                    pos = marker + 1;
                    if (isCloseTag) {
                        size_t closeGt = chunk.find('>', marker);
                        if (closeGt != std::string::npos) pos = closeGt + 1;
                    }
                } else {
                    size_t endTag = chunk.find('>', marker);
                    if (endTag != std::string::npos) {
                        size_t newline = chunk.find('\n', marker);
                        if (newline != std::string::npos && newline < endTag) {
                            depth++;
                            pos = marker + 1;
                        } else {
                            std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                            while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                                tagContent.pop_back();
                            if (tagContent.empty() || tagContent.back() != '/') {
                                depth++;
                            }
                            pos = endTag + 1;
                        }
                    } else {
                        depth++;
                        pos = marker + 1;
                    }
                }
            }
        }
        if (trackClose != std::string::npos) {
            std::string result = chunk.substr(0, trackClose);
            result += newFxChain;
            result += "\n";
            result += chunk.substr(trackClose);
            return result;
        }
        return chunk + "\n" + newFxChain;
    }

    int depth = 0;
    size_t pos = start;
    size_t fxChainEnd = std::string::npos;
    while (pos < chunk.size()) {
        bool isOpen = false;
        bool isCloseTag = false;
        size_t marker = findNextSectionMarker(chunk, pos, &isOpen, &isCloseTag);
        if (marker == std::string::npos) break;

        if (!isOpen) {
            depth--;
            if (depth == 0) {
                size_t closePos = chunk.find('>', marker);
                if (closePos != std::string::npos)
                    fxChainEnd = closePos;
                else
                    fxChainEnd = marker;
                break;
            }
            pos = marker + 1;
            if (isCloseTag) {
                size_t endGt = chunk.find('>', marker);
                if (endGt != std::string::npos) pos = endGt + 1;
            }
        } else {
            size_t endTag = chunk.find('>', marker);
            if (endTag != std::string::npos) {
                size_t newline = chunk.find('\n', marker);
                if (newline != std::string::npos && newline < endTag) {
                    depth++;
                    pos = marker + 1;
                } else {
                    std::string tagContent = chunk.substr(marker + 1, endTag - marker - 1);
                    while (!tagContent.empty() && (tagContent.back() == ' ' || tagContent.back() == '\t'))
                        tagContent.pop_back();
                    if (!tagContent.empty() && tagContent.back() != '/') {
                        depth++;
                    }
                    pos = endTag + 1;
                }
            } else {
                depth++;
                pos = marker + 1;
            }
        }
    }

    if (fxChainEnd != std::string::npos) {
        std::string result = chunk.substr(0, start);
        result += newFxChain;
        result += "\n";
        result += chunk.substr(fxChainEnd + 1);
        return result;
    }

    return chunk + "\n" + newFxChain;
}

// ============================================================
// MIDI event builder (Issue #90)
// ============================================================
static inline MIDI_event_t BuildMidiEvent(const std::string& eventType, int channel,
    int data1, int data2, double playPos, double sampleRate)
{
    MIDI_event_t evt;
    memset(&evt, 0, sizeof(evt));

    if (playPos > 0.0 && sampleRate > 0.0) {
        evt.frame_offset = (int)(playPos * sampleRate);
    } else {
        evt.frame_offset = 0;
    }

    if (eventType == "cc") {
        evt.midi_message[0] = 0xB0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.midi_message[2] = data2 & 0x7F;
        evt.size = 3;
    } else if (eventType == "noteon") {
        evt.midi_message[0] = 0x90 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.midi_message[2] = data2 & 0x7F;
        evt.size = 3;
    } else if (eventType == "noteoff") {
        evt.midi_message[0] = 0x80 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.midi_message[2] = data2 & 0x7F;
        evt.size = 3;
    } else if (eventType == "pitchbend") {
        evt.midi_message[0] = 0xE0 | (channel & 0x0F);
        int pb14 = data1 & 0x3FFF;
        evt.midi_message[1] = pb14 & 0x7F;
        evt.midi_message[2] = (pb14 >> 7) & 0x7F;
        evt.size = 3;
    } else if (eventType == "aftertouch") {
        evt.midi_message[0] = 0xA0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.midi_message[2] = data2 & 0x7F;
        evt.size = 3;
    } else if (eventType == "programchange") {
        evt.midi_message[0] = 0xC0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.size = 2;
    } else if (eventType == "channelpressure") {
        evt.midi_message[0] = 0xD0 | (channel & 0x0F);
        evt.midi_message[1] = data1 & 0x7F;
        evt.size = 2;
    } else if (eventType == "raw") {
        evt.midi_message[0] = data1 & 0xFF;
        evt.midi_message[1] = data2 & 0xFF;
        evt.midi_message[2] = 0;
        int statusHigh = (data1 >> 4) & 0x0F;
        if (statusHigh == 0xC || statusHigh == 0xD) {
            evt.size = 2;
        } else if (statusHigh >= 0x8 && statusHigh <= 0xE) {
            evt.size = 3;
        } else if (statusHigh == 0xF) {
            evt.size = 1;
        } else {
            evt.size = 3;
        }
    }

    return evt;
}

// ============================================================
// BPM detection helper (for sample import)
// ============================================================
static inline double detectBpmFromFile(PCM_source* src,
    int (*getMediaSourceSampleRate)(PCM_source*),
    int (*getMediaSourceNumChannels)(PCM_source*))
{
    (void)src;
    (void)getMediaSourceSampleRate;
    (void)getMediaSourceNumChannels;
    return 0.0;
}

// ============================================================
// REAPER data path helper (Windows only, for Media Explorer)
// ============================================================
static inline std::string getReaperAppDataPath() {
    char buf[MAX_PATH] = {0};
#ifdef _WIN32
    GetEnvironmentVariableA("APPDATA", buf, MAX_PATH);
    return std::string(buf) + "\\REAPER";
#else
    // Linux/macOS: REAPER resource path
    const char* home = getenv("HOME");
    if (home) {
        return std::string(home) + "/.REAPER";
    }
    return "/tmp/reaper-data";
#endif
}

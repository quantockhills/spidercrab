#pragma once
#include <cstdlib>
#include <mutex>
#include <string>
#include <vector>

// ============================================================
// PlaytimeState — Thread-safe clip matrix state tracking
//
// Maintains a local model of the 8×8 Playtime 2 clip grid,
// tracking slot states, colors, names, and clip types.
// All state mutations are mutex-protected.
//
// Works identically with or without REAPER — when Playtime is
// not available, defaults to an 8×8 empty grid.
// ============================================================

struct SlotState {
    int         column   = 0;
    int         row      = 0;
    std::string state    = "empty";   // "empty"|"stopped"|"playing"|"recording"|"queued"
    std::string color    = "";        // RGB hex string like "#ff6600" (empty = unset)
    std::string name     = "";        // Slot/clip display name
    std::string clipType   = "none";    // "audio"|"midi"|"none"
    bool        reversed   = false;     // Whether the clip is playing in reverse (Issue #75)
    std::string sourcePath = "";      // Source media file (known for clips we imported)

    // Serialize this slot to a JSON object string (no newlines)
    std::string toJson() const
    {
        std::string json = "{";
        json += "\"column\":" + std::to_string(column) + ",";
        json += "\"row\":" + std::to_string(row) + ",";
        json += "\"state\":" + toJsonString(state) + ",";
        json += "\"color\":" + toJsonString(color) + ",";
        json += "\"name\":" + toJsonString(name) + ",";
        json += "\"clipType\":" + toJsonString(clipType) + ",";
        json += std::string("\"hasSource\":") + std::string(sourcePath.empty() ? "false" : "true") + ",";
        json += std::string("\"reversed\":") + (reversed ? "true" : "false");
        json += "}";
        return json;
    }

private:
    // Minimal JSON string escaping (same pattern as command_handler.cpp)
    static std::string toJsonString(const std::string& s)
    {
        std::string out = "\"";
        for (char c : s) {
            switch (c) {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
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
                out += c;
            }
        }
        out += "\"";
        return out;
    }
};

class PlaytimeState {
public:
    PlaytimeState(int cols = 8, int rows = 8)
        : m_columns(cols)
        , m_rows(rows)
    {
        // Pre-allocate and initialize all slots to default empty state
        m_slots.reserve(m_columns * m_rows);
        for (int r = 0; r < m_rows; r++) {
            for (int c = 0; c < m_columns; c++) {
                SlotState s;
                s.column   = c;
                s.row      = r;
                s.state    = "empty";
                s.clipType = "none";
                m_slots.push_back(s);
            }
        }
    }

    // --- Accessors ---

    int columns() const { return m_columns; }
    int rows() const { return m_rows; }

    // Get a copy of a single slot (thread-safe)
    SlotState getSlot(int col, int row) const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0 || idx >= (int)m_slots.size())
            return SlotState{};
        return m_slots[idx];
    }

    // Update just the state of a slot (thread-safe)
    void setSlotState(int col, int row, const std::string& newState)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0 || idx >= (int)m_slots.size())
            return;
        m_slots[idx].state = newState;
        if (newState == "empty") {
            m_slots[idx].name       = "";
            m_slots[idx].clipType   = "none";
            m_slots[idx].reversed   = false;
            m_slots[idx].sourcePath = "";
        }
    }

    // Replace an entire slot (thread-safe)
    void setSlot(int col, int row, const SlotState& slot)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0 || idx >= (int)m_slots.size())
            return;
        m_slots[idx] = slot;
        m_slots[idx].column = col;
        m_slots[idx].row    = row;
    }

    // Get all slots as a JSON array string (thread-safe)
    std::string getAllSlots() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::string json = "[";
        for (size_t i = 0; i < m_slots.size(); i++) {
            if (i > 0)
                json += ",";
            json += m_slots[i].toJson();
        }
        json += "]";
        return json;
    }

    // Try to find a Playtime 2 instance via the C API.
    // Returns instance ID or -1 if Playtime is not available.
    int findPlaytimeInstance() const
    {
        // This calls the global g_playtimeApi function pointer.
        // If Playtime isn't loaded, the pointer is null and we return -1.
        // Declared in playtime_api.h.
        extern PlaytimeApi g_playtimeApi;
        if (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject) {
            return g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject(nullptr);
        }
        return -1;
    }

    // Check if Playtime 2 is actually available at runtime
    bool isPlaytimeConnected() const
    {
        int instance = findPlaytimeInstance();
        return instance >= 0;
    }

    // Record the source media file for a slot (set when we import a sample)
    void setSlotSource(int col, int row, const std::string& path)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0 || idx >= (int)m_slots.size())
            return;
        m_slots[idx].sourcePath = path;
    }

    // Serialize all known slot sources as "col|row|path" lines ('|' cannot
    // appear in Windows paths). Used to persist via project ext state.
    std::string serializeSources() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::string out;
        for (const auto& s : m_slots) {
            if (s.sourcePath.empty()) continue;
            out += std::to_string(s.column) + "|" + std::to_string(s.row)
                 + "|" + s.sourcePath + "\n";
        }
        return out;
    }

    // Restore slot sources from serializeSources() output.
    void loadSources(const std::string& data)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        for (auto& s : m_slots) s.sourcePath = "";
        size_t pos = 0;
        while (pos < data.size()) {
            size_t eol  = data.find('\n', pos);
            std::string line = data.substr(pos, (eol == std::string::npos ? data.size() : eol) - pos);
            pos = (eol == std::string::npos) ? data.size() : eol + 1;
            size_t p1 = line.find('|');
            size_t p2 = (p1 == std::string::npos) ? std::string::npos : line.find('|', p1 + 1);
            if (p2 == std::string::npos) continue;
            int col = atoi(line.substr(0, p1).c_str());
            int row = atoi(line.substr(p1 + 1, p2 - p1 - 1).c_str());
            int idx = indexOf(col, row);
            if (idx >= 0 && idx < (int)m_slots.size())
                m_slots[idx].sourcePath = line.substr(p2 + 1);
        }
    }

private:
    int                    m_columns;
    int                    m_rows;
    std::vector<SlotState> m_slots;
    mutable std::mutex     m_mutex;

    int indexOf(int col, int row) const
    {
        if (col < 0 || col >= m_columns || row < 0 || row >= m_rows)
            return -1;
        return row * m_columns + col;
    }
};

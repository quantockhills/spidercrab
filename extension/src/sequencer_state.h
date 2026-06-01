#pragma once
#include <mutex>
#include <string>
#include <vector>
#include <cstring>

// ============================================================
// SequencerState — Thread-safe step sequencer state
//
// Represents an 8×8 grid of steps: 8 columns (steps) × 8 rows (notes).
// Each step has: active (bool), velocity (0-127), note (MIDI note number).
//
// The step sequencer maps to the Ableton Push 2 grid in sequencer mode:
//   Columns = steps 0-7
//   Rows    = notes (configurable base note)
// ============================================================

struct StepData {
    bool   active   = false;
    int    velocity = 100;  // 0-127
    int    note     = 60;   // MIDI note number (C4 default)
};

class SequencerState {
public:
    SequencerState(int cols = 8, int rows = 8)
        : m_columns(cols)
        , m_rows(rows)
        , m_length(16)  // Default 16 steps (2 pages of 8)
    {
        m_steps.resize(m_columns * m_rows);

        // Default note mapping: row 0 = C (36), row 1 = D (38), etc.
        // chromatic scale starting at C2
        int chromaticNotes[8] = { 36, 38, 40, 41, 43, 45, 47, 48 };
        for (int r = 0; r < m_rows; r++) {
            for (int c = 0; c < m_columns; c++) {
                int idx = r * m_columns + c;
                m_steps[idx].note = (r < 8) ? chromaticNotes[r] : (36 + r);
            }
        }
    }

    // --- Configuration ---

    int columns() const { return m_columns; }
    int rows() const { return m_rows; }
    int length() const { std::lock_guard<std::mutex> lock(m_mutex); return m_length; }
    void setLength(int length) { std::lock_guard<std::mutex> lock(m_mutex); m_length = std::max(1, std::min(64, length)); }

    int baseNote() const { std::lock_guard<std::mutex> lock(m_mutex); return m_baseNote; }
    void setBaseNote(int note) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_baseNote = note & 0x7F;
        // Recalculate note mapping
        for (int r = 0; r < m_rows; r++) {
            for (int c = 0; c < m_columns; c++) {
                int idx = r * m_columns + c;
                m_steps[idx].note = m_baseNote + r;
            }
        }
    }

    // --- Step access ---

    // Toggle a step on/off. Returns the new active state.
    bool toggleStep(int col, int row)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0) return false;
        m_steps[idx].active = !m_steps[idx].active;
        return m_steps[idx].active;
    }

    // Set a step explicitly
    void setStep(int col, int row, bool active, int velocity = 100)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0) return;
        m_steps[idx].active   = active;
        m_steps[idx].velocity = std::max(0, std::min(127, velocity));
    }

    // Get a single step (thread-safe copy)
    StepData getStep(int col, int row) const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        int idx = indexOf(col, row);
        if (idx < 0) return StepData{};
        return m_steps[idx];
    }

    // Get the active steps at a given column (for MIDI output)
    std::vector<StepData> getActiveStepsAtColumn(int col) const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (col < 0 || col >= m_columns) return {};
        std::vector<StepData> result;
        for (int r = 0; r < m_rows; r++) {
            int idx = r * m_columns + col;
            if (m_steps[idx].active) {
                result.push_back(m_steps[idx]);
            }
        }
        return result;
    }

    // Get the entire step grid as a JSON array string
    std::string getAllSteps() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::string json = "[";
        for (int r = 0; r < m_rows; r++) {
            for (int c = 0; c < m_columns; c++) {
                if (r > 0 || c > 0) json += ",";
                int idx = r * m_columns + c;
                json += "{";
                json += "\"column\":" + std::to_string(c) + ",";
                json += "\"row\":" + std::to_string(r) + ",";
                json += std::string("\"active\":") + (m_steps[idx].active ? "true" : "false") + ",";
                json += "\"velocity\":" + std::to_string(m_steps[idx].velocity) + ",";
                json += "\"note\":" + std::to_string(m_steps[idx].note);
                json += "}";
            }
        }
        json += "]";
        return json;
    }

    // Clear all steps
    void clearAll()
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        for (auto& step : m_steps) {
            step.active = false;
        }
    }

    // Get playhead position (managed externally, returned from here for convenience)
    int playheadPosition() const { std::lock_guard<std::mutex> lock(m_mutex); return m_playhead; }
    void setPlayheadPosition(int pos) { std::lock_guard<std::mutex> lock(m_mutex); m_playhead = pos % std::max(1, m_length); }

private:
    int                    m_columns;
    int                    m_rows;
    int                    m_length     = 16;
    int                    m_baseNote   = 36;  // C2
    int                    m_playhead   = 0;
    std::vector<StepData>  m_steps;
    mutable std::mutex     m_mutex;

    int indexOf(int col, int row) const
    {
        if (col < 0 || col >= m_columns || row < 0 || row >= m_rows)
            return -1;
        return row * m_columns + col;
    }
};

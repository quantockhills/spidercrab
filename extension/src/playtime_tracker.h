#pragma once
#include <ctime>
#include <mutex>
#include <string>
#include <vector>
#include <cstdio>

// ============================================================
// ClipOperationTracker — Records clip operation metadata with
// timestamps for playtime tracking (Issue #146).
//
// Tracks duplicate, delete, and trim operations so the frontend
// can query recent operations and display clip usage history.
// ============================================================

struct ClipOpRecord {
    std::string opType;      // "duplicate", "delete", "trim"
    int         srcCol = -1;
    int         srcRow = -1;
    int         dstCol = -1; // target column (duplicate destination)
    int         dstRow = -1; // target row    (duplicate destination)
    std::time_t timestamp = 0;
    std::string details;

    std::string toJson() const
    {
        std::string json = "{";
        json += "\"opType\":" + jsonEscape(opType) + ",";
        json += "\"srcCol\":" + std::to_string(srcCol) + ",";
        json += "\"srcRow\":" + std::to_string(srcRow) + ",";
        json += "\"dstCol\":" + std::to_string(dstCol) + ",";
        json += "\"dstRow\":" + std::to_string(dstRow) + ",";
        json += "\"timestamp\":" + std::to_string(timestamp) + ",";
        json += "\"details\":" + jsonEscape(details);
        json += "}";
        return json;
    }

private:
    static std::string jsonEscape(const std::string& s)
    {
        std::string out = "\"";
        for (char c : s) {
            switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
            }
        }
        out += "\"";
        return out;
    }
};

class ClipOperationTracker {
public:
    ClipOperationTracker() = default;

    // Record a clip operation with metadata
    void recordOperation(
        const std::string& opType,
        int srcCol, int srcRow,
        int dstCol, int dstRow,
        const std::string& details)
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        ClipOpRecord rec;
        rec.opType    = opType;
        rec.srcCol    = srcCol;
        rec.srcRow    = srcRow;
        rec.dstCol    = dstCol;
        rec.dstRow    = dstRow;
        rec.timestamp = std::time(nullptr);
        rec.details   = details;
        m_records.push_back(rec);
        fprintf(stderr,
            "[spidercrab] clip-op: %s col=%d,row=%d -> col=%d,row=%d: %s\n",
            opType.c_str(), srcCol, srcRow, dstCol, dstRow, details.c_str());
    }

    // Get recent operations as a JSON array string (newest first)
    std::string getRecentOpsAsJson(int limit = 10) const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::string json = "[";
        int count = 0;
        for (int i = static_cast<int>(m_records.size()) - 1;
             i >= 0 && count < limit;
             i--, count++)
        {
            if (count > 0) json += ",";
            json += m_records[i].toJson();
        }
        json += "]";
        return json;
    }

    // Clear all recorded operations
    void clear()
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_records.clear();
    }

private:
    std::vector<ClipOpRecord> m_records;
    mutable std::mutex        m_mutex;
};

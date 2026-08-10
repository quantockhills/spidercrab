#include "command_handler.h"
#include "command_handler_helpers.h"

#include <vector>

// Global ext state — REAPER's key/value store, shared by every script and
// extension in the process.
//
// This is the only channel into a Lua script that draws its own window. Such
// a script owns no track and no FX slot, so none of the parameter machinery
// reaches it; what it does have is a named section it already reads and
// writes to keep its settings between runs. MK Slicer, for instance, keeps
// all of its controls under "MK_Slicer_3" with keys named after its own
// variables (`Gate_Thresh.norm_val` and so on).
//
// The batch forms are not a convenience. A control surface for such a script
// needs the whole section at once, and forty round trips over a WebSocket to
// paint one panel would be visibly slow.

namespace {

/// Pull a JSON string array out of a payload. The shared JsonParser doesn't
/// do arrays, so this follows the hand-rolled approach used by sample tags
/// and settings.
std::vector<std::string> parseStringArray(const std::string& payload, const char* key)
{
    std::vector<std::string> out;
    const std::string        needle = std::string("\"") + key + "\"";

    size_t keyPos = payload.find(needle);
    if (keyPos == std::string::npos)
        return out;

    size_t arrStart = payload.find('[', keyPos);
    size_t arrEnd   = (arrStart != std::string::npos) ? payload.find(']', arrStart)
                                                      : std::string::npos;
    if (arrStart == std::string::npos || arrEnd == std::string::npos)
        return out;

    const std::string arr = payload.substr(arrStart + 1, arrEnd - arrStart - 1);
    size_t            p   = 0;
    while (p < arr.size()) {
        if (arr[p] == '"') {
            ++p;
            std::string item;
            while (p < arr.size() && arr[p] != '"') {
                if (arr[p] == '\\' && p + 1 < arr.size())
                    ++p;  // keep the escaped character itself
                item += arr[p++];
            }
            out.push_back(item);
        }
        ++p;
    }
    return out;
}

}  // namespace

void CommandHandler::HandleExtStateGet(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetExtState) {
        SendResponse(clientId, id, false, "{\"error\":\"GetExtState not available\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string section = parser.getString("section");
    JsonParser  parser2(payloadStr);
    std::string key = parser2.getString("key");

    if (section.empty() || key.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"section and key are required\"}");
        return;
    }

    // REAPER returns an empty string for a missing key, which is
    // indistinguishable from a key that is genuinely empty — so the caller is
    // told which of the two it got.
    const bool  exists = m_api.HasExtState ? m_api.HasExtState(section.c_str(), key.c_str()) : true;
    const char* value  = m_api.GetExtState(section.c_str(), key.c_str());

    std::string payload = "{";
    payload += json_string("value") + ":" + json_string(value ? value : "") + ",";
    payload += json_string("exists") + ":" + (exists ? "true" : "false");
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleExtStateGetMany(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetExtState) {
        SendResponse(clientId, id, false, "{\"error\":\"GetExtState not available\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string section = parser.getString("section");
    if (section.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"section is required\"}");
        return;
    }

    const std::vector<std::string> keys = parseStringArray(payloadStr, "keys");

    // An object rather than an array, so the caller matches on key name and
    // is not silently broken by a reordering.
    std::string values = "{";
    for (size_t i = 0; i < keys.size(); ++i) {
        if (i > 0)
            values += ",";
        const char* v = m_api.GetExtState(section.c_str(), keys[i].c_str());
        values += json_string(keys[i]) + ":" + json_string(v ? v : "");
    }
    values += "}";

    std::string payload = "{";
    payload += json_string("section") + ":" + json_string(section) + ",";
    payload += json_string("values") + ":" + values;
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleExtStateSet(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.SetExtState) {
        SendResponse(clientId, id, false, "{\"error\":\"SetExtState not available\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    std::string section = p1.getString("section");
    JsonParser  p2(payloadStr);
    std::string key = p2.getString("key");
    JsonParser  p3(payloadStr);
    std::string value = p3.getString("value");
    JsonParser  p4(payloadStr);
    std::string persistStr = p4.getString("persist");

    if (section.empty() || key.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"section and key are required\"}");
        return;
    }

    // Default to not persisting. A command sent to a running script is a
    // message, not a setting, and writing every one of them to reaper-extstate
    // would both churn the file and resurrect stale commands on next launch.
    const bool persist = (persistStr == "true" || persistStr == "1");

    m_api.SetExtState(section.c_str(), key.c_str(), value.c_str(), persist);
    SendResponse(clientId, id, true, "{\"saved\":true}");
}

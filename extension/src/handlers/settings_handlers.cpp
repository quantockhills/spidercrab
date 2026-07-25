#include "command_handler.h"
#include "command_handler_helpers.h"

// Global, cross-project settings (persisted to spidercrab/settings.json):
//   - fxChainPath   : the REAPER FXChains folder to browse
//   - sampleFolders : the sample-browser root folders
//
// These used to live in the RPP (chain path) or only in the iPad's browser
// (sample folders); they belong on the PC so every project and every device
// sees the same thing.

void CommandHandler::HandleSettingsGet(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    SendResponse(clientId, id, true, m_settings.toJson());
}

void CommandHandler::HandleSettingsSetFxChainPath(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string path = parser.getString("path");

    m_settings.setFxChainPath(path);
    SendResponse(clientId, id, true, "{\"saved\":true}");
}

void CommandHandler::HandleSettingsSetSampleFolders(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);

    // Parse the "folders" string array from the payload (same hand-rolled
    // approach as sample tags — the shared JsonParser doesn't do arrays).
    std::vector<std::string> folders;
    size_t keyPos = payloadStr.find("\"folders\"");
    if (keyPos != std::string::npos) {
        size_t arrStart = payloadStr.find('[', keyPos);
        size_t arrEnd   = (arrStart != std::string::npos) ? payloadStr.find(']', arrStart)
                                                          : std::string::npos;
        if (arrStart != std::string::npos && arrEnd != std::string::npos) {
            std::string arr = payloadStr.substr(arrStart + 1, arrEnd - arrStart - 1);
            size_t p = 0;
            while (p < arr.size()) {
                if (arr[p] == '"') {
                    ++p;
                    std::string item;
                    while (p < arr.size() && arr[p] != '"') {
                        if (arr[p] == '\\' && p + 1 < arr.size()) { ++p; item += arr[p++]; }
                        else item += arr[p++];
                    }
                    if (p < arr.size()) ++p; // closing quote
                    if (!item.empty()) folders.push_back(item);
                } else {
                    ++p;
                }
            }
        }
    }

    m_settings.setSampleFolders(folders);
    SendResponse(clientId, id, true, "{\"saved\":true}");
}

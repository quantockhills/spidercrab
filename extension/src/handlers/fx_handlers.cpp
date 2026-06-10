#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandleGetTrackFX(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_GetCount || !m_api.TrackFX_GetFXName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int fxCount = m_api.TrackFX_GetCount(track);
    std::string fxList = "[";
    for (int i = 0; i < fxCount; i++) {
        if (i > 0) fxList += ",";
        char name[512] = {0};
        m_api.TrackFX_GetFXName(track, i, name, sizeof(name));
        fxList += "{";
        fxList += json_string("index") + ":" + std::to_string(i) + ",";
        fxList += json_string("name") + ":" + json_string(name);
        // Determine if this FX belongs to a chain group
        std::string chainPath;
        auto cit = m_trackChainSources.find(trackIdx);
        if (cit != m_trackChainSources.end()) {
            for (const auto& cs : cit->second) {
                if (i >= cs.fxStartIdx && i < cs.fxEndIdx) {
                    chainPath = cs.filePath;
                    break;
                }
            }
        }
        if (!chainPath.empty()) {
            fxList += "," + json_string("chainPath") + ":" + json_string(chainPath);
        } else {
            fxList += "," + json_string("chainPath") + ":null";
        }
        fxList += "}";
    }
    fxList += "]";
    std::string payload = "{";
    payload += json_string("fx") + ":" + fxList + ",";
    payload += json_string("count") + ":" + std::to_string(fxCount);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleGetFXParams(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_GetCount || !m_api.TrackFX_GetParamName ||
        !m_api.TrackFX_GetParamEx || !m_api.TrackFX_GetFormattedParamValue) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int paramCount = m_api.TrackFX_GetNumParams(track, fxIdx);
    // If GetCount with fxIdx doesn't work (it returns track fx count), use GetNumParams
    paramCount = m_api.TrackFX_GetNumParams(track, fxIdx);
    std::string paramList = "[";
    for (int i = 0; i < paramCount; i++) {
        if (i > 0) paramList += ",";
        char name[256] = {0};
        m_api.TrackFX_GetParamName(track, fxIdx, i, name, sizeof(name));
        double minVal = 0, maxVal = 0, midVal = 0;
        double normVal = m_api.TrackFX_GetParamEx(track, fxIdx, i, &minVal, &maxVal, &midVal);
        char formattedBuf[256] = {0};
        bool formattedOk = m_api.TrackFX_GetFormattedParamValue(track, fxIdx, i, formattedBuf, sizeof(formattedBuf));
        double actualVal = minVal + normVal * (maxVal - minVal);
        paramList += "{";
        paramList += json_string("index") + ":" + std::to_string(i) + ",";
        paramList += json_string("name") + ":" + json_string(name) + ",";
        paramList += json_string("value") + ":" + std::to_string(actualVal) + ",";
        paramList += json_string("min") + ":" + std::to_string(minVal) + ",";
        paramList += json_string("max") + ":" + std::to_string(maxVal) + ",";
        paramList += json_string("mid") + ":" + std::to_string(midVal) + ",";
        paramList += json_string("normalized") + ":" + std::to_string(normVal) + ",";
        paramList += json_string("formatted") + ":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string(""));
        paramList += "}";
    }
    paramList += "]";
    std::string payload = "{";
    payload += json_string("params") + ":" + paramList + ",";
    payload += json_string("count") + ":" + std::to_string(paramCount);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSetFXParam(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_SetParam || !m_api.TrackFX_GetParamEx) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string paramIdxStr = parser.getString("paramIdx");
    std::string valueStr    = parser.getString("value");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    int         paramIdx    = atoi(paramIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    double minVal = 0, maxVal = 0, midVal = 0;
    double normalized = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &minVal, &maxVal, &midVal);
    double targetVal = atof(valueStr.c_str());
    // Convert from actual value to normalized (0-1) if value looks like an actual value
    // Check: if value is between 0.0 and 1.0 and range is significantly larger, treat as normalized
    double newNormalized;
    double range = maxVal - minVal;
    if (range > 1.0 && targetVal >= 0.0 && targetVal <= 1.0) {
        // Probably already normalized
        newNormalized = targetVal;
        targetVal = minVal + targetVal * range;
    } else {
        // Clamp to range and normalize
        if (targetVal < minVal) targetVal = minVal;
        if (targetVal > maxVal) targetVal = maxVal;
        if (range > 0.0)
            newNormalized = (targetVal - minVal) / range;
        else
            newNormalized = 0.0;
    }
    m_lastSetParam = {trackIdx, fxIdx, paramIdx};
    bool ok = m_api.TrackFX_SetParam(track, fxIdx, paramIdx, newNormalized);
    if (ok) {
        SendResponse(clientId, id, true,
            "{\"value\":" + std::to_string(targetVal) + "}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to set parameter\"}");
    }
}

void CommandHandler::HandleAddFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_AddByName || !m_api.TrackFX_GetCount) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxName      = parser.getString("fxName");
    std::string recFxStr    = parser.getString("recFX");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    bool recFX = (recFxStr == "true" || recFxStr == "1");
    int fxIdx = m_api.TrackFX_AddByName(track, fxName.c_str(), recFX, 0);
    if (fxIdx >= 0) {
        int newFxCount = m_api.TrackFX_GetCount(track);
        // Shift chain-source indices for FX added after this point
        ShiftChainSourceIndices(m_trackChainSources[trackIdx], fxIdx, 1);
        SendResponse(clientId, id, true,
            "{\"fxIdx\":" + std::to_string(fxIdx) + ",\"fxCount\":" + std::to_string(newFxCount) + "}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"FX not found\"}");
    }
}

void CommandHandler::HandleGetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_GetPreset || !m_api.TrackFX_GetPresetIndex) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int numberOfPresets = 0;
    int currentIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numberOfPresets);
    char presetName[512] = {0};
    bool hasPreset = m_api.TrackFX_GetPreset(track, fxIdx, presetName, sizeof(presetName));
    std::string payload = "{";
    payload += json_string("currentPreset") + ":" + json_string(hasPreset ? presetName : "") + ",";
    payload += json_string("currentIdx") + ":" + std::to_string(currentIdx) + ",";
    payload += json_string("numberOfPresets") + ":" + std::to_string(numberOfPresets);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_SetPreset || !m_api.TrackFX_SetPresetByIndex) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string presetName  = parser.getString("presetName");
    std::string presetIdxStr = parser.getString("presetIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    bool ok = false;
    if (!presetName.empty()) {
        ok = m_api.TrackFX_SetPreset(track, fxIdx, presetName.c_str());
    } else if (!presetIdxStr.empty()) {
        int presetIdx = atoi(presetIdxStr.c_str());
        ok = m_api.TrackFX_SetPresetByIndex(track, fxIdx, presetIdx);
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Missing 'presetName' or 'presetIdx'\"}");
        return;
    }
    if (ok) {
        SendResponse(clientId, id, true, "{\"presetSet\":true}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to set preset\"}");
    }
}

void CommandHandler::HandleGetAllFxPresetNames(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_GetFXName || !m_api.TrackFX_GetPreset ||
        !m_api.TrackFX_GetPresetIndex) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // First, get the current preset index and total count to verify the API works
    int numberOfPresets = 0;
    int currentIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numberOfPresets);

    // Read all preset names by iterating
    std::string presetList = "[";

    // Strategy: use GetPresetIndex first to see total count, then iterate
    // REAPER's API doesn't provide a direct "get preset at index" that returns
    // name. We iterate by setting each preset index and reading back the name.
    int maxPresets = numberOfPresets > 0 ? numberOfPresets : 256;
    int foundPresets = 0;
    bool first = true;

    for (int i = 0; i < maxPresets; i++) {
        char name[512] = {0};
        // Try setting preset by index and reading back the name
        if (m_api.TrackFX_SetPresetByIndex(track, fxIdx, i)) {
            if (m_api.TrackFX_GetPreset(track, fxIdx, name, sizeof(name)) && name[0]) {
                if (!first) presetList += ",";
                first = false;
                presetList += json_string(name);
                foundPresets++;
            }
        } else {
            break; // No more presets
        }
    }

    // Restore the original preset
    if (currentIdx >= 0) {
        m_api.TrackFX_SetPresetByIndex(track, fxIdx, currentIdx);
    }

    presetList += "]";

    std::string payload = "{";
    payload += json_string("presets") + ":" + presetList + ",";
    payload += json_string("count") + ":" + std::to_string(foundPresets) + ",";
    payload += json_string("currentIdx") + ":" + std::to_string(currentIdx);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleDeleteFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_Delete) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    // Shift chain-source indices before deleting (indices shift down after delete)
    ShiftChainSourceIndices(m_trackChainSources[trackIdx], fxIdx, -1);
    bool ok = m_api.TrackFX_Delete(track, fxIdx);
    if (ok) {
        SendResponse(clientId, id, true, "{\"deleted\":true}");
    } else {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to delete FX\"}");
    }
}

void CommandHandler::HandleSetFXBypass(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.fxGetEnabled || !m_api.fxSetEnabled) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string bypassStr   = parser.getString("bypass");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    bool bypass = (bypassStr == "true");
    m_api.fxSetEnabled(track, fxIdx, !bypass);
    bool isEnabled = m_api.fxGetEnabled(track, fxIdx);
    SendResponse(clientId, id, true,
        "{\"bypassed\":" + std::string(!isEnabled ? "true" : "false") + "}");
}

void CommandHandler::HandleReorderFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.TrackFX_CopyToTrack || !m_api.TrackFX_GetCount) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fxIdxStr     = parser.getString("fxIdx");
    std::string newIdxStr    = parser.getString("newIdx");
    int         trackIdx     = atoi(trackIdxStr.c_str());
    int         fxIdx        = atoi(fxIdxStr.c_str());
    int         newIdx       = atoi(newIdxStr.c_str());
    MediaTrack* track        = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }
    int fxCount = m_api.TrackFX_GetCount(track);
    if (fxIdx < 0 || fxIdx >= fxCount || newIdx < 0 || newIdx >= fxCount) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid FX index\"}");
        return;
    }
    // Move FX within same track via copy-to-self + delete
    if (fxIdx == newIdx) {
        SendResponse(clientId, id, true, "{\"reordered\":true}");
        return;
    }
    // TrackFX_CopyToTrack supports intra-track moves
    m_api.TrackFX_CopyToTrack(track, fxIdx, track, newIdx, true);
    SendResponse(clientId, id, true, "{\"reordered\":true}");
}

void CommandHandler::HandleEnumerateFX(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    if (m_fxCacheValid && !m_fxCache.empty()) {
        SendResponse(clientId, id, true,
            "{\"cached\":true,\"fx\":" + m_fxCache + "}");
        return;
    }
    m_fxCache = RunFXEnumeration();
    m_fxCacheValid = true;
    SendResponse(clientId, id, true,
        "{\"cached\":true,\"fx\":" + m_fxCache + "}");
}

void CommandHandler::HandleRefreshFxCache(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    m_fxCache = RunFXEnumeration();
    m_fxCacheValid = true;
    SendResponse(clientId, id, true,
        "{\"refreshed\":true,\"fx\":" + m_fxCache + "}");
}

void CommandHandler::HandleFxTagsGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    std::string tagsJson = m_fxTagStorage.GetAllTagsJson();
    SendResponse(clientId, id, true, tagsJson);
}

void CommandHandler::HandleFxTagsSet(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string target = parser.getString("target");
    std::string ident  = parser.getString("ident");

    if (target.empty() || ident.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'target' or 'ident' parameter\"}");
        return;
    }

    if (target != "fx" && target != "chain") {
        SendResponse(clientId, id, false,
            "{\"error\":\"target must be 'fx' or 'chain'\"}");
        return;
    }

    std::vector<std::string> tags;
    {
        size_t tagsPos = payloadStr.find("\"tags\"");
        if (tagsPos != std::string::npos) {
            size_t colonPos = payloadStr.find(':', tagsPos);
            if (colonPos != std::string::npos) {
                size_t arrStart = payloadStr.find('[', colonPos);
                if (arrStart != std::string::npos) {
                    size_t arrEnd = payloadStr.find(']', arrStart);
                    if (arrEnd != std::string::npos) {
                        std::string arrContent = payloadStr.substr(arrStart + 1, arrEnd - arrStart - 1);
                        size_t p = 0;
                        while (p < arrContent.size()) {
                            while (p < arrContent.size() && (arrContent[p] == ' ' || arrContent[p] == '\t')) p++;
                            if (p >= arrContent.size()) break;
                            if (arrContent[p] == ',') { p++; continue; }
                            if (arrContent[p] == '"') {
                                p++;
                                std::string tag;
                                while (p < arrContent.size() && arrContent[p] != '"') {
                                    if (arrContent[p] == '\\' && p + 1 < arrContent.size()) {
                                        p++;
                                        tag += arrContent[p++];
                                    } else {
                                        tag += arrContent[p++];
                                    }
                                }
                                if (p < arrContent.size()) p++;
                                tags.push_back(tag);
                            } else {
                                p++;
                            }
                        }
                    }
                }
            }
        }
    }

    if (target == "fx") {
        m_fxTagStorage.SetFxTags(ident, tags);
    } else {
        m_fxTagStorage.SetChainTags(ident, tags);
    }

    try {
        m_fxTagStorage.Save();
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to save tags: " + json_escape(e.what()) + "\"}");
        return;
    }

    SendResponse(clientId, id, true, "{\"saved\":true}");
}

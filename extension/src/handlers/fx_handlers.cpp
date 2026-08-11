#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandleGetTrackFX(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetCount || !m_api.TrackFX_GetFXName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    // Extract track index from params
        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    MediaTrack* track       = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int         fxCount = m_api.TrackFX_GetCount(track);
    std::string fxList  = "[";

    // Build a chainPath lookup: fxIdx -> chainPath (or empty if not in a chain group)
    std::map<int, std::string> fxChainPath;
    auto it = m_trackChainSources.find(trackIdx);
    if (it != m_trackChainSources.end()) {
        for (const auto& cs : it->second) {
            for (int i = cs.fxStartIdx; i < cs.fxEndIdx && i < fxCount; i++) {
                fxChainPath[i] = cs.filePath;
            }
        }
    }

    for (int i = 0; i < fxCount; i++) {
        if (i > 0)
            fxList += ",";
        char name[512] = { 0 };
        m_api.TrackFX_GetFXName(track, i, name, sizeof(name));

        // Read bypass state
        bool bypassed = false;
        if (m_api.fxGetEnabled) {
            bypassed = !m_api.fxGetEnabled(track, i);
        }

        fxList += "{";
        fxList += json_string("index") + ":" + std::to_string(i) + ",";
        fxList += json_string("name") + ":" + json_string(name) + ",";
        fxList += json_string("bypassed") + ":" + (bypassed ? "true" : "false") + ",";
        auto cpIt = fxChainPath.find(i);
        if (cpIt != fxChainPath.end() && !cpIt->second.empty()) {
            fxList += json_string("chainPath") + ":" + json_string(cpIt->second);
        } else {
            fxList += json_string("chainPath") + ":null";
        }
        fxList += "}";
    }
    fxList += "]";

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(trackIdx) + ",\"fx\":" + fxList + "}");
}

void CommandHandler::HandleGetFXParams(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetNumParams || !m_api.TrackFX_GetParamEx || !m_api.TrackFX_GetParamName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string offsetStr   = parser.getString("offset");
    std::string limitStr    = parser.getString("limit");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());
    int         offset      = offsetStr.empty() ? 0 : atoi(offsetStr.c_str());
    int         limit       = limitStr.empty() ? 32 : atoi(limitStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int         numParams  = m_api.TrackFX_GetNumParams(track, fxIdx);
    int         endIdx     = std::min(numParams, offset + limit);
    std::string paramsList = "[";
    for (int i = offset; i < endIdx; i++) {
        if (i > offset)
            paramsList += ",";
        double minVal = 0, maxVal = 0, midVal = 0;
        // TrackFX_GetParamEx returns the value already in display units, and
        // fills min/max with the display range. (The normalized 0-1 form is
        // TrackFX_GetParamNormalized, a separate call.) This used to rescale
        // it by the range as though it were normalized, which squared the
        // value: Chorus's Wet at -6dB over a -100..12 range read back as
        // -100 + (-6 * 112) = -772, and its 250ms max as 1 + (250 * 249) =
        // 62251. HandleSetFXParam has always passed display units straight
        // through, so the two directions disagreed.
        double actualVal = m_api.TrackFX_GetParamEx(track, fxIdx, i, &minVal, &maxVal, &midVal);
        char   name[256] = { 0 };
        m_api.TrackFX_GetParamName(track, fxIdx, i, name, sizeof(name));

        // Get the human-readable formatted value (e.g. "50.0%", "-6.0 dB")
        // Falls back to empty/null if TrackFX_GetFormattedParamValue is
        // unavailable or fails (Issue #73)
        char formattedBuf[256] = { 0 };
        bool formattedOk = false;
        if (m_api.TrackFX_GetFormattedParamValue) {
            formattedOk = m_api.TrackFX_GetFormattedParamValue(
                track, fxIdx, i, formattedBuf, sizeof(formattedBuf));
        }

        paramsList += "{";
        paramsList += json_string("index") + ":" + std::to_string(i) + ",";
        paramsList += json_string("name") + ":" + json_string(name) + ",";
        paramsList += json_string("value") + ":" + std::to_string(actualVal) + ",";
        paramsList += json_string("min") + ":" + std::to_string(minVal) + ",";
        paramsList += json_string("max") + ":" + std::to_string(maxVal) + ",";
        paramsList += json_string("mid") + ":" + std::to_string(midVal) + ",";
        paramsList += json_string("formatted") + ":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string(""));
        paramsList += "}";
    }
    paramsList += "]";
    
    // Auto-watch this FX for real-time param change events (Issue #52)
    SetWatchedFX(trackIdx, fxIdx);

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(trackIdx) + ",\"fxIdx\":" + std::to_string(fxIdx)
            + ",\"params\":" + paramsList
            + ",\"total\":" + std::to_string(numParams)
            + ",\"offset\":" + std::to_string(offset)
            + ",\"limit\":" + std::to_string(limit) + "}");
}

void CommandHandler::HandleSetFXParam(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_SetParam) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string paramIdxStr = parser.getString("paramIdx");
    std::string valueStr    = parser.getString("value");

    int    trackIdx = atoi(trackIdxStr.c_str());
    int    fxIdx    = atoi(fxIdxStr.c_str());
    int    paramIdx = atoi(paramIdxStr.c_str());
    double value    = atof(valueStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // Get param range info for zero-range guard and readback
    double minVal = 0, maxVal = 0, midVal = 0;
    if (m_api.TrackFX_GetParamEx) {
        m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &minVal, &maxVal, &midVal);
    }

    // Guard against zero-range params (read-only sliders, Issue #73):
    // Some JSFX params report minVal == maxVal. Skip the set entirely.
    double range = maxVal - minVal;
    if (range >= 0.0 && range < 1e-15) {
        // Range is effectively zero — return current value.
        double currentVal = 0;
        double readMin = 0, readMax = 0, readMid = 0;
        if (m_api.TrackFX_GetParamEx) {
            currentVal = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &readMin, &readMax, &readMid);
        }
        SendResponse(clientId, id, true,
            "{\"set\":true,"
            "\"value\":" + std::to_string(currentVal) + "}");
        return;
    }

    // TrackFX_SetParam takes actual display values, NOT normalized 0-1 (Issue #73).
    // The frontend sends actual display values (e.g. 5000 Hz, -12 dB), so
    // we pass them directly to the API.
    m_lastSetParam = {trackIdx, fxIdx, paramIdx};

    bool success = m_api.TrackFX_SetParam(track, fxIdx, paramIdx, value);

    // Read back the actual value REAPER committed (fixes slider jumping due to
    // normalization precision loss or stepped params)
    double committedVal = value;
    double actualMin = 0, actualMax = 0, actualMid = 0;
    if (success && m_api.TrackFX_GetParamEx) {
        committedVal = m_api.TrackFX_GetParamEx(track, fxIdx, paramIdx, &actualMin, &actualMax, &actualMid);
    }

    // Get the formatted value for the committed param (Issue #73)
    char formattedBuf[256] = { 0 };
    bool formattedOk = false;
    if (success && m_api.TrackFX_GetFormattedParamValue) {
        formattedOk = m_api.TrackFX_GetFormattedParamValue(
            track, fxIdx, paramIdx, formattedBuf, sizeof(formattedBuf));
    }

    SendResponse(
        clientId, id, success,
        "{\"set\":" + std::string(success ? "true" : "false") + ","
        "\"value\":" + std::to_string(committedVal) + ","
        "\"formatted\":" + (formattedOk && formattedBuf[0] ? json_string(formattedBuf) : json_string("")) + "}");
}

void CommandHandler::HandleAddFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_AddByName) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxName      = parser.getString("fxName");

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // instantiate=1 means: don't prompt, just add the FX
    int fxIdx = m_api.TrackFX_AddByName(track, fxName.c_str(), false, 1);

    // Update chain-source indices: new FX inserted at fxIdx
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end() && fxIdx >= 0) {
        ShiftChainSourceIndices(sit->second, fxIdx, 1);
    }

    SendResponse(clientId, id, fxIdx >= 0, "{\"fxIdx\":" + std::to_string(fxIdx) + "}");
}

void CommandHandler::HandleGetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int numPresets = 0;
    int presetIdx  = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    std::string presetName;
    if (presetIdx >= 0) {
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            presetName = nameBuf;
        }
    }

    std::string payload = "{";
    payload += json_string("presetIndex") + ":" + std::to_string(presetIdx) + ",";
    payload += json_string("presetName") + ":" + (presetName.empty() ? "null" : json_string(presetName)) + ",";
    payload += json_string("numPresets") + ":" + std::to_string(numPresets);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSetFxPreset(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_SetPresetByIndex || !m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fxIdxStr     = parser.getString("fxIdx");
    std::string presetIdxStr = parser.getString("presetIdx");
    int trackIdx  = atoi(trackIdxStr.c_str());
    int fxIdx     = atoi(fxIdxStr.c_str());
    int presetIdx = atoi(presetIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    bool success = m_api.TrackFX_SetPresetByIndex(track, fxIdx, presetIdx);
    if (!success) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to set preset\"}");
        return;
    }

    // Read back the committed state
    int numPresets = 0;
    int committedIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    std::string presetName;
    if (committedIdx >= 0) {
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            presetName = nameBuf;
        }
    }

    std::string payload = "{";
    payload += json_string("presetIndex") + ":" + std::to_string(committedIdx) + ",";
    payload += json_string("presetName") + ":" + (presetName.empty() ? "null" : json_string(presetName)) + ",";
    payload += json_string("numPresets") + ":" + std::to_string(numPresets);
    payload += "}";

    SendResponse(clientId, id, success, payload);
}

void CommandHandler::HandleGetAllFxPresetNames(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetPresetIndex || !m_api.TrackFX_GetPreset || !m_api.TrackFX_SetPresetByIndex) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    int         trackIdx    = atoi(trackIdxStr.c_str());
    int         fxIdx       = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int numPresets = 0;
    int originalIdx = m_api.TrackFX_GetPresetIndex(track, fxIdx, &numPresets);

    if (numPresets <= 0) {
        std::string payload = "{";
        payload += json_string("presetNames") + ":[],";
        payload += json_string("currentIndex") + ":" + std::to_string(originalIdx);
        payload += "}";
        SendResponse(clientId, id, true, payload);
        return;
    }

    // Enumerate all presets by index
    std::string nameList = "[";
    for (int i = 0; i < numPresets; i++) {
        if (i > 0) nameList += ",";
        m_api.TrackFX_SetPresetByIndex(track, fxIdx, i);
        char nameBuf[512] = { 0 };
        if (m_api.TrackFX_GetPreset(track, fxIdx, nameBuf, (int)sizeof(nameBuf))) {
            nameList += json_string(nameBuf);
        } else {
            nameList += json_string("");
        }
    }
    nameList += "]";

    // Restore original preset (important for correctness)
    m_api.TrackFX_SetPresetByIndex(track, fxIdx, originalIdx);

    std::string payload = "{";
    payload += json_string("presetNames") + ":" + nameList + ",";
    payload += json_string("currentIndex") + ":" + std::to_string(originalIdx);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleDeleteFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_Delete) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

        std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");

    int trackIdx = atoi(trackIdxStr.c_str());
    int fxIdx    = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    bool success = m_api.TrackFX_Delete(track, fxIdx);

    // Update chain-source indices: FX at fxIdx removed, shift down
    if (success) {
        auto sit = m_trackChainSources.find(trackIdx);
        if (sit != m_trackChainSources.end()) {
            ShiftChainSourceIndices(sit->second, fxIdx, -1);
            // Clean up empty chain groups
            sit->second.erase(
                std::remove_if(sit->second.begin(), sit->second.end(),
                    [](const ChainSource& cs) { return cs.fxStartIdx >= cs.fxEndIdx; }),
                sit->second.end());
            if (sit->second.empty()) {
                m_trackChainSources.erase(sit);
            }
        }
    }

    SendResponse(
        clientId, id, success, "{\"deleted\":" + std::string(success ? "true" : "false") + "}");
}

void CommandHandler::HandleSetFXBypass(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.fxGetEnabled || !m_api.fxSetEnabled) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string bypassedStr = parser.getString("bypassed");

    if (trackIdxStr.empty() || fxIdxStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' or 'fxIdx' parameter\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());
    int fxIdx    = atoi(fxIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // Handle both string "true"/"false" and unquoted JSON boolean true/false
    // The JsonParser returns empty string for JSON boolean values, so we
    // also check the raw payload string for boolean patterns.
    bool bypassed = (bypassedStr == "true" || bypassedStr == "1");
    if (bypassedStr.empty()) {
        bypassed = (payloadStr.find("\"bypassed\":true") != std::string::npos);
    }
    // TrackFX_SetEnabled: true = enabled (not bypassed), false = disabled (bypassed)
    m_api.fxSetEnabled(track, fxIdx, !bypassed);

    // Read back the actual state to confirm
    bool actualBypassed = !m_api.fxGetEnabled(track, fxIdx);

    SendResponse(clientId, id, true,
        "{\"bypassed\":" + std::string(actualBypassed ? "true" : "false") + "}");
}

void CommandHandler::HandleReorderFX(int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_CopyToTrack || !m_api.TrackFX_Delete || !m_api.TrackFX_GetCount) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fromIdxStr   = parser.getString("fromIndex");
    std::string toIdxStr     = parser.getString("toIndex");

    if (trackIdxStr.empty() || fromIdxStr.empty() || toIdxStr.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing required parameters\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());
    int fromIdx  = atoi(fromIdxStr.c_str());
    int toIdx    = atoi(toIdxStr.c_str());

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int fxCount = m_api.TrackFX_GetCount(track);

    // Validate indices
    if (fromIdx < 0 || fromIdx >= fxCount) {
        SendResponse(clientId, id, false,
            "{\"error\":\"fromIndex out of range: " + std::to_string(fromIdx) + " (0-" + std::to_string(fxCount - 1) + ")\"}");
        return;
    }
    if (toIdx < 0 || toIdx >= fxCount) {
        SendResponse(clientId, id, false,
            "{\"error\":\"toIndex out of range: " + std::to_string(toIdx) + " (0-" + std::to_string(fxCount - 1) + ")\"}");
        return;
    }

    // No-op if moving to same position
    if (fromIdx == toIdx) {
        SendResponse(clientId, id, true,
            "{\"reordered\":true,\"trackIdx\":" + std::to_string(trackIdx)
            + ",\"fromIndex\":" + std::to_string(fromIdx)
            + ",\"toIndex\":" + std::to_string(toIdx) + "}");
        return;
    }

    // Index shift logic:
    // If toIdx < fromIdx: copy to toIdx first (shift right), then delete at fromIdx + 1
    // If toIdx > fromIdx: copy to toIdx+1 first (shift right past original), then delete at fromIdx
    int destCopyIdx = (toIdx > fromIdx) ? toIdx + 1 : toIdx;
    m_api.TrackFX_CopyToTrack(track, fromIdx, track, destCopyIdx, false);

    int deleteIdx;
    if (toIdx < fromIdx) {
        deleteIdx = fromIdx + 1;
    } else {
        deleteIdx = fromIdx;
    }

    m_api.TrackFX_Delete(track, deleteIdx);

    // Update chain-source indices for the reorder
    // Copy at destCopyIdx shifts subsequent indices by 1
    // Delete at deleteIdx shifts subsequent indices by -1
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end()) {
        // First: the copy inserts at destCopyIdx, shift everything after up
        ShiftChainSourceIndices(sit->second, destCopyIdx, 1);
        // Second: the delete at deleteIdx removes an element, shift after down
        int adjustedDeleteIdx = (toIdx > fromIdx) ? fromIdx : (fromIdx + 1);
        ShiftChainSourceIndices(sit->second, adjustedDeleteIdx, -1);
        // Clean up empty chain groups
        sit->second.erase(
            std::remove_if(sit->second.begin(), sit->second.end(),
                [](const ChainSource& cs) { return cs.fxStartIdx >= cs.fxEndIdx; }),
            sit->second.end());
        if (sit->second.empty()) {
            m_trackChainSources.erase(sit);
        }
    }

    SendResponse(clientId, id, true,
        "{\"reordered\":true,\"trackIdx\":" + std::to_string(trackIdx)
        + ",\"fromIndex\":" + std::to_string(fromIdx)
        + ",\"toIndex\":" + std::to_string(toIdx) + "}");
}

void CommandHandler::HandleEnumerateFX(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    // Return cached FX list if available (pre-cached or previously enumerated)
    if (m_fxCacheValid) {
        SendResponse(clientId, id, true, "{\"fx\":" + m_fxCache + "}");
        return;
    }

    // Shouldn't normally reach this if PreCacheFX() was called at startup,
    // but handle gracefully — enumerate and cache now
    std::string fxList = RunFXEnumeration();
    SendResponse(clientId, id, true, "{\"fx\":" + fxList + "}");
}

void CommandHandler::HandleRefreshFxCache(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (!m_api.EnumInstalledFX) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    m_fxCacheValid = false;
    std::string fxList = RunFXEnumeration();
    SendResponse(clientId, id, true, "{\"fx\":" + fxList + "}");
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

// ------------------------------------------------------------
// Reading a plugin's named configuration values.
//
// REAPER exposes a long list of these per FX — "fx_type", "pdc", "fx_ident",
// and notably "vst_chunk" and "clap_chunk", which hand over a plugin's entire
// saved state as base64. That last one is the only route to state a plugin
// keeps to itself: Playtime, for instance, records which REAPER track plays
// each of its columns, and that mapping exists nowhere a host can otherwise
// see.
//
// Deliberately generic rather than a purpose-built Playtime reader. The value
// is a string whatever it is, and a caller that knows what it asked for knows
// how to read the answer.
// ------------------------------------------------------------

void CommandHandler::HandleFxGetNamedConfigParm(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetNamedConfigParm || !m_api.GetTrack) {
        SendResponse(clientId, id, false,
            "{\"error\":\"TrackFX_GetNamedConfigParm not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  p1(payloadStr);
    const int   trackIdx = atoi(p1.getString("trackIdx").c_str());
    JsonParser  p2(payloadStr);
    const int   fxIdx = atoi(p2.getString("fxIdx").c_str());
    JsonParser  p3(payloadStr);
    const std::string parm = p3.getString("parm");

    if (parm.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"parm is required\"}");
        return;
    }

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"No such track\"}");
        return;
    }

    // A plugin chunk can be very large, and REAPER truncates into whatever
    // buffer it is given rather than reporting that it needed more.
    std::vector<char> buf(4 * 1024 * 1024, 0);
    const bool ok = m_api.TrackFX_GetNamedConfigParm(
        track, fxIdx, parm.c_str(), buf.data(), (int)buf.size());

    std::string value = ok ? std::string(buf.data()) : std::string();

    std::string payload = "{";
    payload += json_string("parm") + ":" + json_string(parm) + ",";
    payload += json_string("ok") + ":" + std::string(ok ? "true" : "false") + ",";
    payload += json_string("length") + ":" + std::to_string(value.size()) + ",";
    payload += json_string("value") + ":" + json_string(value);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}

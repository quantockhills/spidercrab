#include "command_handler.h"
#include "command_handler_helpers.h"
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <vector>

// ============================================================

void CommandHandler::HandleFxChainGetDirectory(
    int clientId, const std::string& id, const std::string& params)
{
    // Extract "path" from payload
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string path = parser.getString("path");
    if (path.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    std::string chains = "[";
    std::string dirs   = "[";
    bool firstChain = true;
    bool firstDir   = true;

    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            if (entry.is_directory()) {
                std::string dname = entry.path().filename().string();
                if (!firstDir) dirs += ",";
                firstDir = false;
                dirs += json_string(dname);
            } else if (entry.is_regular_file()) {
                std::string name = entry.path().filename().string();
                std::string ext;
                size_t dotPos = name.rfind('.');
                if (dotPos == std::string::npos) continue;
                ext = name.substr(dotPos);
                std::string lowerExt;
                for (char c : ext) lowerExt += tolower((unsigned char)c);
                if (lowerExt != ".rfxchain") continue;

                if (!firstChain) chains += ",";
                firstChain = false;
                uintmax_t fileSize = fs::file_size(entry.path());
                chains += "{";
                chains += json_string("name") + ":" + json_string(name) + ",";
                chains += json_string("size") + ":" + std::to_string(fileSize);
                chains += "}";
            }
        }
    } catch (const fs::filesystem_error& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    chains += "]";
    dirs   += "]";

    std::string payload = "{";
    payload += json_string("path")   + ":" + json_string(path) + ",";
    payload += json_string("chains") + ":" + chains + ",";
    payload += json_string("dirs")   + ":" + dirs;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainSave(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrackStateChunk || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string filePath    = parser.getString("filePath");

    if (trackIdxStr.empty() || filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' or 'filePath' parameter\"}");
        return;
    }

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    std::vector<char> chunkBuf(4 * 1024 * 1024, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), (int)chunkBuf.size(), false);
    if (!gotChunk || chunkBuf[0] == 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to get track state chunk\"}");
        return;
    }

    std::string chunk(chunkBuf.data());
    std::string fxChain = extractFxChainFromChunk(chunk);
    if (fxChain.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"No FX chain found on track\"}");
        return;
    }

    // Write the FX chain to file
    // Ensure parent directory exists
    try {
        fs::path parentDir = fs::path(filePath).parent_path();
        if (!parentDir.empty() && !fs::exists(parentDir)) {
            fs::create_directories(parentDir);
        }

        FILE* f = fopen(filePath.c_str(), "w");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("Failed to open file for writing: " + filePath) + "}");
            return;
        }
        fwrite(fxChain.c_str(), 1, fxChain.size(), f);
        fclose(f);

        SendResponse(clientId, id, true,
            "{\"saved\":true,\"filePath\":" + json_string(filePath) + "}");
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
    }
}

void CommandHandler::HandleFxChainLoad(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk || !m_api.GetTrack) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string filePath    = parser.getString("filePath");
    std::string modeStr     = parser.getString("mode"); // "replace" (default) or "append"

    if (trackIdxStr.empty() || filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' or 'filePath' parameter\"}");
        return;
    }

    int         trackIdx = atoi(trackIdxStr.c_str());
    MediaTrack* track    = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    // Capture old FX count for chain-source tracking
    int oldFxCount = 0;
    if (m_api.TrackFX_GetCount) {
        oldFxCount = m_api.TrackFX_GetCount(track);
    }

    // Read the .RfxChain file
    std::string fxChain;
    try {
        FILE* f = fopen(filePath.c_str(), "r");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("File not found: " + filePath) + "}");
            return;
        }
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            fxChain.append(buf, nread);
        }
        fclose(f);
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    if (fxChain.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Empty FX chain file\"}");
        return;
    }

    // Get current track chunk — use heap buffer; 64KB is too small for tracks with plugins
    const int CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
    std::vector<char> chunkBuf(CHUNK_SIZE, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), CHUNK_SIZE, false);
    if (!gotChunk || chunkBuf[0] == 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to get track state chunk\"}");
        return;
    }

    std::string currentChunk(chunkBuf.data());
    std::string newChunk;

    // Append by default: loading a chain adds its FX after whatever is on
    // the track (other chains or standalone FX). Pass mode:"replace" to
    // wipe the track's FX chain first.
    bool append = (modeStr != "replace");

    // REAPER's native .RfxChain files contain just the raw body (no outer tag).
    // The track chunk expects a full <FXCHAIN\n...\n> block.
    // If the file already has a <FXCHAIN wrapper (e.g. saved by this app), extract it.
    // Otherwise wrap the raw body.
    std::string loadedFxChain;
    std::string extracted = extractFxChainFromChunk(fxChain);
    if (!extracted.empty()) {
        loadedFxChain = extracted;
    } else {
        // Raw body — wrap it so replaceFxChainInChunk can splice it correctly
        loadedFxChain = "<FXCHAIN\n" + fxChain;
        if (loadedFxChain.back() != '\n') loadedFxChain += '\n';
        loadedFxChain += '>';
    }

    if (append) {
        // Append: merge at the FX-entry level — keep the current chain's
        // header + entries, then add the loaded file's entries after them.
        std::string currentFxChain = extractFxChainFromChunk(currentChunk);
        if (!currentFxChain.empty()) {
            std::string curFirstLine = currentFxChain.substr(0, currentFxChain.find('\n') + 1);
            std::string curHeader, newHeader;
            std::vector<std::string> curEntries, newEntries;
            splitFxChainEntries(fxChainInner(currentFxChain), &curHeader, &curEntries);
            splitFxChainEntries(fxChainInner(loadedFxChain), &newHeader, &newEntries);

            std::string merged = curFirstLine + curHeader;
            for (const auto& e : curEntries) merged += e;
            for (const auto& e : newEntries) merged += e;
            if (merged.empty() || merged.back() != '\n') merged += '\n';
            merged += '>';
            newChunk = replaceFxChainInChunk(currentChunk, merged);
        } else {
            // Track has no FX yet — appending == inserting the chain
            newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
        }
    } else {
        // Replace: just swap the FXCHAIN section
        newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
    }

    // Write the new track state chunk
    bool ok = m_api.SetTrackStateChunk(track, newChunk.c_str(), false);
    if (ok) {
        // Record chain-source tracking
        if (m_api.TrackFX_GetCount) {
            int newFxCount = m_api.TrackFX_GetCount(track);
            ChainSource cs;
            cs.filePath = filePath;
            if (append) {
                cs.fxStartIdx = oldFxCount;
                cs.fxEndIdx = newFxCount;
            } else {
                cs.fxStartIdx = 0;
                cs.fxEndIdx = newFxCount;
            }
            // Replace any existing chain source for this track (if replacing)
            // or append a new one
            if (!append || m_trackChainSources.find(trackIdx) == m_trackChainSources.end()) {
                m_trackChainSources[trackIdx] = {cs};
            } else {
                m_trackChainSources[trackIdx].push_back(cs);
            }
        }

        SendResponse(clientId, id, true,
            "{\"loaded\":true,\"filePath\":" + json_string(filePath) + ",\"append\":"
                + (append ? "true" : "false") + "}");
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to set track state chunk\"}");
    }
}

void CommandHandler::HandleFxChainGetInfo(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("filePath");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' parameter\"}");
        return;
    }

    // Read the .RfxChain file
    std::string content;
    try {
        FILE* f = fopen(filePath.c_str(), "r");
        if (!f) {
            SendResponse(clientId, id, false,
                "{\"error\":" + json_string("File not found: " + filePath) + "}");
            return;
        }
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            content.append(buf, nread);
        }
        fclose(f);
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    // Parse the FXCHAIN: count FX entries and extract names
    // .RfxChain files use plugin-type tags like <VST, <VST3, <JS, <AU
    int fxCount = 0;
    std::string fxNames = "[";
    size_t pos = 0;
    bool first = true;

    // Helper to find the next plugin tag, handling <VST vs <VST3 overlap
    auto findNextPluginTag = [&](size_t from) -> size_t {
        size_t vstPos  = content.find("<VST ", from);
        size_t vst3Pos = content.find("<VST3", from);
        size_t jsPos   = content.find("<JS ", from);
        size_t auPos   = content.find("<AU ", from);
        size_t best = std::string::npos;
        if (vstPos != std::string::npos)  best = vstPos;
        if (vst3Pos != std::string::npos && (best == std::string::npos || vst3Pos < best)) best = vst3Pos;
        if (jsPos != std::string::npos && (best == std::string::npos || jsPos < best)) best = jsPos;
        if (auPos != std::string::npos && (best == std::string::npos || auPos < best)) best = auPos;
        return best;
    };

    pos = findNextPluginTag(0);
    while (pos != std::string::npos) {
        fxCount++;

        // Extract plugin name from quoted string after tag: e.g. <VST "VST: ReaEQ (Cockos)"
        size_t quote1 = content.find('"', pos);
        if (quote1 != std::string::npos) {
            size_t quote2 = content.find('"', quote1 + 1);
            if (quote2 != std::string::npos) {
                std::string fxName = content.substr(quote1 + 1, quote2 - quote1 - 1);
                if (!first) fxNames += ",";
                first = false;
                fxNames += json_string(fxName);
            }
        }

        // Move past the closing > of this plugin's opening tag
        size_t tagClose = content.find(">", pos);
        if (tagClose == std::string::npos) break;

        // Find the next plugin tag
        pos = findNextPluginTag(tagClose + 1);
    }
    fxNames += "]";

    // Get file info
    uintmax_t fileSize = 0;
    try {
        fileSize = fs::file_size(filePath);
    } catch (...) {
        fileSize = 0;
    }

    std::string payload = "{";
    payload += json_string("filePath") + ":" + json_string(filePath) + ",";
    payload += json_string("fxCount") + ":" + std::to_string(fxCount) + ",";
    payload += json_string("fxNames") + ":" + fxNames + ",";
    payload += json_string("fileSize") + ":" + std::to_string(fileSize);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainSearchRecursive(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string query    = parser.getString("query");
    std::string rootPath = parser.getString("rootPath");

    if (rootPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"rootPath\\\" parameter\"}");
        return;
    }

    // --- Use cached search when available (zero IO) ---
    // If the cache is indexed for this rootPath, query it instead of walking the
    // filesystem. This is the preferred path — fxchain/searchCached should be
    // used by new clients, but we keep searchRecursive working via cache for
    // backward compatibility.
    if (m_fxChainCache.IsIndexed() && m_fxChainCache.RootPath() == rootPath) {
        auto result = m_fxChainCache.Search(query, 0, 0);
        std::string results = "[";
        for (size_t i = 0; i < result.results.size(); i++) {
            if (i > 0) results += ",";
            results += "{";
            results += json_string("filePath") + ":" + json_string(result.results[i].filePath) + ",";
            results += json_string("name") + ":" + json_string(result.results[i].name) + ",";
            results += json_string("size") + ":" + std::to_string(result.results[i].size);
            results += "}";
        }
        results += "]";

        std::string payload = "{";
        payload += json_string("results") + ":" + results;
        payload += "}";
        SendResponse(clientId, id, true, payload);
        return;
    }

    // --- Fallback: legacy recursive directory scan ---
    // Only reached when cache is unavailable (e.g., first call before startup
    // cache is built, or rootPath changed).
    // @deprecated in favor of fxchain/searchCached.
    std::string lowerQuery;
    for (char c : query) lowerQuery += tolower((unsigned char)c);

    std::string results = "[";
    bool first = true;

    try {
        for (const auto& entry : fs::recursive_directory_iterator(rootPath)) {
            if (!entry.is_regular_file()) continue;

            std::string name = entry.path().filename().string();
            std::string ext;
            size_t dotPos = name.rfind('.');
            if (dotPos == std::string::npos) continue;
            ext = name.substr(dotPos);
            std::string lowerExt;
            for (char c : ext) lowerExt += tolower((unsigned char)c);
            if (lowerExt != ".rfxchain") continue;

            if (!lowerQuery.empty()) {
                std::string lowerName;
                for (char c : name) lowerName += tolower((unsigned char)c);
                std::string relPath = entry.path().lexically_relative(rootPath).string();
                std::string lowerRelPath;
                for (char c : relPath) lowerRelPath += tolower((unsigned char)c);
                if (lowerName.find(lowerQuery) == std::string::npos &&
                    lowerRelPath.find(lowerQuery) == std::string::npos) continue;
            }

            if (!first) results += ",";
            first = false;

            uintmax_t fileSize = 0;
            std::error_code ec;
            fileSize = fs::file_size(entry.path(), ec);
            results += "{";
            results += json_string("filePath") + ":" + json_string(entry.path().string()) + ",";
            results += json_string("name") + ":" + json_string(name) + ",";
            results += json_string("size") + ":" + std::to_string(fileSize);
            results += "}";
        }
    } catch (const fs::filesystem_error&) {
        results = "[";
        first = true;
    }

    results += "]";

    std::string payload = "{";
    payload += json_string("results") + ":" + results;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainSearchCached(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string query    = parser.getString("query");
    std::string rootPath = parser.getString("rootPath");
    std::string offsetStr = parser.getString("offset");
    std::string limitStr  = parser.getString("limit");

    int offset = offsetStr.empty() ? 0 : atoi(offsetStr.c_str());
    int limit  = limitStr.empty()  ? 16 : atoi(limitStr.c_str());

    // If rootPath changed from cached path, re-index silently
    if (!rootPath.empty() && rootPath != m_fxChainCache.RootPath()) {
        m_fxChainCache.BuildIndex(rootPath);
    }

    // If cache isn't indexed yet, build it now
    if (!m_fxChainCache.IsIndexed() && !rootPath.empty()) {
        m_fxChainCache.BuildIndex(rootPath);
    }

    auto result = m_fxChainCache.Search(query, offset, limit);

    std::string resultsJson = "[";
    for (size_t i = 0; i < result.results.size(); i++) {
        if (i > 0) resultsJson += ",";
        resultsJson += "{";
        resultsJson += json_string("filePath") + ":" + json_string(result.results[i].filePath) + ",";
        resultsJson += json_string("name") + ":" + json_string(result.results[i].name) + ",";
        resultsJson += json_string("size") + ":" + std::to_string(result.results[i].size);
        resultsJson += "}";
    }
    resultsJson += "]";

    std::string payload = "{";
    payload += json_string("results") + ":" + resultsJson + ",";
    payload += json_string("total") + ":" + std::to_string(result.total) + ",";
    payload += json_string("offset") + ":" + std::to_string(offset) + ",";
    payload += json_string("limit") + ":" + std::to_string(limit);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleFxChainRefreshCache(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    if (rootPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'rootPath' parameter\"}");
        return;
    }

    int count = m_fxChainCache.BuildIndex(rootPath);

    std::string payload = "{";
    payload += json_string("refreshed") + ":true,";
    payload += json_string("count") + ":" + std::to_string(count);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::ShiftChainSourceIndices(
    std::vector<ChainSource>& sources, int beforeIndex, int delta)
{
    // Insertion (delta > 0): an FX lands exactly at beforeIndex, pushing anything
    // at or after it up — so a chain starting exactly at beforeIndex moves too.
    // Deletion (delta < 0): the FX AT beforeIndex is gone and everything after it
    // slides down. A chain starting exactly at beforeIndex just loses that one
    // member (its start stays put, the next FX slides into the vacated slot) —
    // it must NOT be shifted as a whole, or the FX now sitting at its old start
    // index (which was never part of the chain) gets silently absorbed into it.
    for (auto& cs : sources) {
        bool wholeChainShifts = (delta > 0) ? (cs.fxStartIdx >= beforeIndex)
                                             : (cs.fxStartIdx > beforeIndex);
        if (wholeChainShifts) {
            cs.fxStartIdx += delta;
            cs.fxEndIdx += delta;
        } else if (cs.fxEndIdx > beforeIndex) {
            cs.fxEndIdx += delta;
        }
    }
}

void CommandHandler::HandleFxChainReorder(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_CopyToTrack || !m_api.TrackFX_Delete || !m_api.TrackFX_GetCount) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr  = parser.getString("trackIdx");
    std::string fromStartStr = parser.getString("fromStart");
    std::string fromEndStr   = parser.getString("fromEnd");
    std::string toIdxStr     = parser.getString("toIndex");

    if (trackIdxStr.empty() || fromStartStr.empty() || fromEndStr.empty() || toIdxStr.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing required parameters\"}");
        return;
    }

    int trackIdx  = atoi(trackIdxStr.c_str());
    int fromStart = atoi(fromStartStr.c_str());
    int fromEnd   = atoi(fromEndStr.c_str());  // exclusive
    int toIndex   = atoi(toIdxStr.c_str());    // insertion point (pre-move indices)

    MediaTrack* track = m_api.GetTrack ? m_api.GetTrack(nullptr, trackIdx) : nullptr;
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    int fxCount  = m_api.TrackFX_GetCount(track);
    int blockLen = fromEnd - fromStart;
    if (fromStart < 0 || fromEnd > fxCount || blockLen <= 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid block range\"}");
        return;
    }
    if (toIndex < 0) toIndex = 0;
    if (toIndex > fxCount) toIndex = fxCount;

    // Snap the insertion point out of the middle of other chain groups so
    // every group stays contiguous after the move.
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end()) {
        for (const ChainSource& g : sit->second) {
            if (g.fxStartIdx == fromStart && g.fxEndIdx == fromEnd) continue;
            if (toIndex > g.fxStartIdx && toIndex < g.fxEndIdx) {
                toIndex = (toIndex - g.fxStartIdx < g.fxEndIdx - toIndex)
                    ? g.fxStartIdx : g.fxEndIdx;
                break;
            }
        }
    }

    // Dropping onto/inside the block itself is a no-op
    if (toIndex >= fromStart && toIndex <= fromEnd) {
        SendResponse(clientId, id, true, "{\"reordered\":true}");
        return;
    }

    // Move the block one FX at a time. is_move=true relocates the existing
    // plugin instance within the chain (same path as dragging in REAPER's
    // FX window). Do NOT use copy+delete here: cloning and destroying
    // instances in rapid succession crashes some plugins (e.g.
    // DecentSampler) mid-move.
    if (toIndex > fromEnd) {
        // Moving right: move the block's first FX to just before the
        // insertion point, blockLen times.
        for (int i = 0; i < blockLen; i++) {
            m_api.TrackFX_CopyToTrack(track, fromStart, track, toIndex - 1, true);
        }
    } else {
        // Moving left: place each FX of the block at toIndex + i.
        for (int i = 0; i < blockLen; i++) {
            m_api.TrackFX_CopyToTrack(track, fromStart + i, track, toIndex + i, true);
        }
    }

    // Update chain-source bookkeeping
    if (sit != m_trackChainSources.end()) {
        int newStart = (toIndex > fromEnd) ? (toIndex - blockLen) : toIndex;
        for (ChainSource& g : sit->second) {
            if (g.fxStartIdx == fromStart && g.fxEndIdx == fromEnd) {
                g.fxStartIdx = newStart;
                g.fxEndIdx   = newStart + blockLen;
            } else if (toIndex > fromEnd) {
                if (g.fxStartIdx >= fromEnd && g.fxEndIdx <= toIndex) {
                    g.fxStartIdx -= blockLen;
                    g.fxEndIdx   -= blockLen;
                }
            } else {
                if (g.fxStartIdx >= toIndex && g.fxEndIdx <= fromStart) {
                    g.fxStartIdx += blockLen;
                    g.fxEndIdx   += blockLen;
                }
            }
        }
    }

    SendResponse(clientId, id, true,
        "{\"reordered\":true,\"trackIdx\":" + std::to_string(trackIdx)
        + ",\"toIndex\":" + std::to_string(toIndex) + "}");
}

bool CommandHandler::doLoadChain(int trackIdx, const std::string& filePath, const std::string& direction)
{
    if (!m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk || !m_api.GetTrack) {
        return false;
    }

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) return false;

    std::string targetPath = filePath;

    if (!direction.empty() && direction != "none") {
        fs::path currentDir = fs::path(filePath).parent_path();
        if (!fs::exists(currentDir)) return false;

        std::vector<std::string> chainFiles;
        try {
            for (const auto& entry : fs::directory_iterator(currentDir)) {
                if (!entry.is_regular_file()) continue;
                std::string name = entry.path().filename().string();
                std::string ext;
                size_t dotPos = name.rfind('.');
                if (dotPos == std::string::npos) continue;
                ext = name.substr(dotPos);
                std::string lowerExt;
                for (char c : ext) lowerExt += tolower((unsigned char)c);
                if (lowerExt != ".rfxchain") continue;
                chainFiles.push_back(entry.path().string());
            }
        } catch (...) {
            return false;
        }

        if (chainFiles.empty()) return false;
        std::sort(chainFiles.begin(), chainFiles.end());

        int currentIdx = -1;
        for (size_t i = 0; i < chainFiles.size(); i++) {
            if (chainFiles[i] == filePath) {
                currentIdx = (int)i;
                break;
            }
        }
        if (currentIdx < 0) return false;

        if (direction == "next") {
            int nextIdx = (currentIdx + 1) % (int)chainFiles.size();
            targetPath = chainFiles[nextIdx];
        } else if (direction == "prev") {
            int prevIdx = (currentIdx - 1 + (int)chainFiles.size()) % (int)chainFiles.size();
            targetPath = chainFiles[prevIdx];
        } else {
            return false;
        }
    }

    std::string fxChain;
    try {
        FILE* f = fopen(targetPath.c_str(), "r");
        if (!f) return false;
        char buf[4096];
        size_t nread;
        while ((nread = fread(buf, 1, sizeof(buf), f)) > 0) {
            fxChain.append(buf, nread);
        }
        fclose(f);
    } catch (...) {
        return false;
    }

    if (fxChain.empty()) return false;

    const int CHUNK_SIZE = 4 * 1024 * 1024;
    std::vector<char> chunkBuf(CHUNK_SIZE, 0);
    bool gotChunk = m_api.GetTrackStateChunk(track, chunkBuf.data(), CHUNK_SIZE, false);
    if (!gotChunk || chunkBuf[0] == 0) return false;

    std::string currentChunk(chunkBuf.data());

    std::string loadedFxChain;
    std::string extracted = extractFxChainFromChunk(fxChain);
    if (!extracted.empty()) {
        loadedFxChain = extracted;
    } else {
        loadedFxChain = "<FXCHAIN\n" + fxChain;
        if (loadedFxChain.back() != '\n') loadedFxChain += '\n';
        loadedFxChain += '>';
    }

    // Find which chain group on this track is being cycled (by file path)
    // so we replace only that group's FX and leave other FX/chains intact.
    int groupIdx = -1;
    auto sit = m_trackChainSources.find(trackIdx);
    if (sit != m_trackChainSources.end()) {
        for (size_t i = 0; i < sit->second.size(); i++) {
            if (sit->second[i].filePath == filePath) { groupIdx = (int)i; break; }
        }
    }

    std::string currentFxChain = extractFxChainFromChunk(currentChunk);
    std::string newChunk;
    int replaceStart = 0, replaceEnd = 0, newEntryCount = 0;

    if (groupIdx >= 0 && !currentFxChain.empty()) {
        std::string curFirstLine = currentFxChain.substr(0, currentFxChain.find('\n') + 1);
        std::string curHeader, newHeader;
        std::vector<std::string> curEntries, newEntries;
        splitFxChainEntries(fxChainInner(currentFxChain), &curHeader, &curEntries);
        splitFxChainEntries(fxChainInner(loadedFxChain), &newHeader, &newEntries);

        const ChainSource& g = sit->second[groupIdx];
        replaceStart  = std::min((int)curEntries.size(), std::max(0, g.fxStartIdx));
        replaceEnd    = std::min((int)curEntries.size(), std::max(replaceStart, g.fxEndIdx));
        newEntryCount = (int)newEntries.size();

        std::string merged = curFirstLine + curHeader;
        for (int i = 0; i < replaceStart; i++) merged += curEntries[i];
        for (const auto& e : newEntries) merged += e;
        for (int i = replaceEnd; i < (int)curEntries.size(); i++) merged += curEntries[i];
        if (merged.empty() || merged.back() != '\n') merged += '\n';
        merged += '>';
        newChunk = replaceFxChainInChunk(currentChunk, merged);
    } else {
        // No tracked group for this path — legacy behavior: replace the
        // whole FX chain section.
        newChunk = replaceFxChainInChunk(currentChunk, loadedFxChain);
    }

    bool ok = m_api.SetTrackStateChunk(track, newChunk.c_str(), false);

    if (ok && m_api.TrackFX_GetCount) {
        int newFxCount = m_api.TrackFX_GetCount(track);
        if (groupIdx >= 0) {
            int delta = newEntryCount - (replaceEnd - replaceStart);
            std::vector<ChainSource>& groups = sit->second;
            groups[groupIdx].filePath = targetPath;
            groups[groupIdx].fxEndIdx = groups[groupIdx].fxStartIdx + newEntryCount;
            for (size_t i = 0; i < groups.size(); i++) {
                if ((int)i == groupIdx) continue;
                if (groups[i].fxStartIdx >= replaceEnd) {
                    groups[i].fxStartIdx += delta;
                    groups[i].fxEndIdx   += delta;
                }
            }
        } else {
            ChainSource cs;
            cs.filePath = targetPath;
            cs.fxStartIdx = 0;
            cs.fxEndIdx = newFxCount;
            m_trackChainSources[trackIdx] = {cs};
        }
    }

    return ok;
}

void CommandHandler::HandleFxChainCycle(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.GetTrackStateChunk || !m_api.SetTrackStateChunk) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string direction   = parser.getString("direction"); // "next" or "prev"
    std::string chainPath   = parser.getString("chainPath"); // optional: explicit path

    if (trackIdxStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'trackIdx' parameter\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());

    // Determine the current chain path. An explicit chainPath wins —
    // with multiple chains on a track it identifies which one to cycle.
    std::string currentPath = chainPath;
    if (currentPath.empty()) {
        auto it = m_trackChainSources.find(trackIdx);
        if (it != m_trackChainSources.end() && !it->second.empty()) {
            currentPath = it->second[0].filePath;
        }
    }

    if (currentPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No chain loaded on this track\"}");
        return;
    }

    std::string directionArg = direction;
    if (chainPath.empty() && !direction.empty() && currentPath.empty()) {
        directionArg.clear();
    }

    bool ok = doLoadChain(trackIdx, currentPath, directionArg);
    if (ok) {
        // Get updated FX list
        std::string fxList = "[]";
        MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
        if (track && m_api.TrackFX_GetCount && m_api.TrackFX_GetFXName) {
            int fxCount = m_api.TrackFX_GetCount(track);
            fxList = "[";
            for (int i = 0; i < fxCount; i++) {
                if (i > 0) fxList += ",";
                char name[512] = {0};
                m_api.TrackFX_GetFXName(track, i, name, sizeof(name));
                fxList += "{";
                fxList += json_string("index") + ":" + std::to_string(i) + ",";
                fxList += json_string("name") + ":" + json_string(name);
                // Determine chain path for this FX
                std::string cp;
                auto cit = m_trackChainSources.find(trackIdx);
                if (cit != m_trackChainSources.end()) {
                    for (const auto& cs : cit->second) {
                        if (i >= cs.fxStartIdx && i < cs.fxEndIdx) {
                            cp = cs.filePath;
                            break;
                        }
                    }
                }
                if (!cp.empty()) {
                    fxList += "," + json_string("chainPath") + ":" + json_string(cp);
                } else {
                    fxList += "," + json_string("chainPath") + ":null";
                }
                fxList += "}";
            }
            fxList += "]";
        }

        std::string payload = "{";
        payload += json_string("cycled") + ":true,";
        payload += json_string("fx") + ":" + fxList;
        payload += "}";
        SendResponse(clientId, id, true, payload);
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to cycle chain\"}");
    }
}

#include "command_handler.h"
#include "command_handler_helpers.h"

void CommandHandler::HandleSampleGetDirectory(
    int clientId, const std::string& id, const std::string& params)
{
    // Extract "path" from payload
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string path      = parser.getString("path");
    std::string offsetStr = parser.getString("offset");
    std::string limitStr  = parser.getString("limit");

    if (path.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Resolve actual filesystem case + native separators so cache keys match
    { std::error_code ec; auto cp = fs::weakly_canonical(fs::path(path), ec); path = ec ? fs::path(path).lexically_normal().make_preferred().string() : cp.make_preferred().string(); }

    int offset = offsetStr.empty() ? 0 : atoi(offsetStr.c_str());
    int limit  = limitStr.empty()  ? 100 : atoi(limitStr.c_str());
    if (limit <= 0) limit = 100;

    // Serve from cache if available — avoids directory_iterator on every request
    if (m_sampleCache.HasCachedData(path)) {
        auto cached = m_sampleCache.GetDirectory(path);
        // Prepend ".." for navigation; cache entries are already sorted (dirs first, then files)
        struct RawEntry { std::string name; bool isDir; };
        std::vector<RawEntry> all;
        all.push_back({ "..", true });
        for (const auto& e : cached.entries)
            all.push_back({ e.name, e.type == "dir" });

        int total = (int)all.size();
        int start = std::min(offset, total);
        int end   = std::min(start + limit, total);
        std::string entries = "[";
        for (int i = start; i < end; i++) {
            if (i > start) entries += ",";
            const auto& e = all[i];
            entries += "{";
            entries += json_string("name") + ":" + json_string(e.name) + ",";
            entries += json_string("type") + ":" + json_string(e.isDir ? "dir" : "file");
            entries += "}";
        }
        entries += "]";
        std::string payload = "{";
        payload += json_string("path")    + ":" + json_string(path) + ",";
        payload += json_string("entries") + ":" + entries + ",";
        payload += json_string("total")   + ":" + std::to_string(total) + ",";
        payload += json_string("offset")  + ":" + std::to_string(start) + ",";
        payload += json_string("cached")  + ":true";
        payload += "}";
        SendResponse(clientId, id, true, payload);
        return;
    }

    // Cache miss — live filesystem fallback
    struct RawEntry { std::string name; bool isDir; };
    std::vector<RawEntry> dirs, files;

    try {
        for (const auto& entry : fs::directory_iterator(path)) {
            bool d = entry.is_directory();
            dirs.resize(dirs.size()); // force evaluate
            (d ? dirs : files).push_back({ entry.path().filename().u8string(), d });
        }
    } catch (const fs::filesystem_error& e) {
        SendResponse(clientId, id, false,
            "{\"error\":" + json_string(e.what()) + "}");
        return;
    }

    // Sort dirs and files separately, dirs first
    std::sort(dirs.begin(),  dirs.end(),  [](const RawEntry& a, const RawEntry& b){ return a.name < b.name; });
    std::sort(files.begin(), files.end(), [](const RawEntry& a, const RawEntry& b){ return a.name < b.name; });

    // Cache the live result so subsequent requests are served instantly
    {
        std::vector<SampleCache::Entry> cacheEntries;
        cacheEntries.reserve(dirs.size() + files.size());
        for (auto& d : dirs)  { SampleCache::Entry e; e.name = d.name; e.type = "dir";  cacheEntries.push_back(std::move(e)); }
        for (auto& f : files) { SampleCache::Entry e; e.name = f.name; e.type = "file"; cacheEntries.push_back(std::move(e)); }
        m_sampleCache.SetDirectory(path, cacheEntries);
    }

    // Combine: .. + dirs + files
    std::vector<RawEntry> all;
    all.push_back({ "..", true });
    for (auto& d : dirs)  all.push_back(d);
    for (auto& f : files) all.push_back(f);

    int total = (int)all.size();
    int start = std::min(offset, total);
    int end   = std::min(start + limit, total);

    std::string entries = "[";
    for (int i = start; i < end; i++) {
        if (i > start) entries += ",";
        const auto& e = all[i];
        entries += "{";
        entries += json_string("name") + ":" + json_string(e.name) + ",";
        entries += json_string("type") + ":" + json_string(e.isDir ? "dir" : "file");
        entries += "}";
    }
    entries += "]";

    std::string payload = "{";
    payload += json_string("path")    + ":" + json_string(path) + ",";
    payload += json_string("entries") + ":" + entries + ",";
    payload += json_string("total")   + ":" + std::to_string(total) + ",";
    payload += json_string("offset")  + ":" + std::to_string(start);
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSampleSendToTrack(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.InsertMedia || !m_api.GetTrack || !m_api.CountTracks) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath       = parser.getString("filePath");
    std::string trackIdxStr    = parser.getString("trackIdx");

    if (filePath.empty() || trackIdxStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' or 'trackIdx'\"}");
        return;
    }

    int trackIdx = atoi(trackIdxStr.c_str());
    int numTracks = m_api.CountTracks(nullptr);
    if (trackIdx >= numTracks) {
        // Add tracks if needed
        while (m_api.CountTracks(nullptr) <= trackIdx) {
            m_api.InsertTrackAtIndex(-1, true);
        }
    }

    // Select the target track first, then insert
    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Failed to get target track\"}");
        return;
    }

    if (m_api.SetOnlyTrackSelected) {
        m_api.SetOnlyTrackSelected(track);
    }

    // Insert the media file onto the selected track
    // REAPER's InsertMedia with mode 0 inserts at the edit cursor on the selected track
    int result = m_api.InsertMedia(filePath.c_str(), 0);
    if (result != 0) {
        SendResponse(clientId, id, true,
            "{\"sent\":true,\"trackIdx\":" + std::to_string(trackIdx) + "}");
    } else {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to insert media\"}");
    }
}

void CommandHandler::HandleSampleSendToSlot(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.GetTrack || !m_api.CountTracks || !m_api.InsertMedia ||
        !m_api.GetSetMediaTrackInfo || !m_api.GetPlayState) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath    = parser.getString("filePath");
    std::string colStr      = parser.getString("column");
    std::string rowStr      = parser.getString("row");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' parameter\"}");
        return;
    }

    int col = colStr.empty() ? 0 : atoi(colStr.c_str());
    int row = rowStr.empty() ? 0 : atoi(rowStr.c_str());

    // Check if Playtime 2 is available and use it
    if (g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject && g_playtimeApi.HB_CreateClipMatrix) {
        int hgInstance = g_playtimeApi.HB_FindFirstPlaytimeHelgoboxInstanceInProject(nullptr);
        if (hgInstance >= 0) {
            g_playtimeApi.HB_CreateClipMatrix(hgInstance);
            // Use Playtime 2 API - slot state is managed externally by Playtime
            // Set the slot state to reflect the loaded sample
            m_playtimeState.setSlotState(col, row, "playing");
            // Sample loaded — check BPM
            double bpm = 0;
            if (m_api.Master_GetTempo) {
                bpm = m_api.Master_GetTempo();
            }
            std::string payload = "{";
            payload += json_string("loaded") + ":true,";
            payload += json_string("column") + ":" + std::to_string(col) + ",";
            payload += json_string("row") + ":" + std::to_string(row) + ",";
            payload += json_string("bpm") + ":" + std::to_string(bpm);
            payload += "}";
            SendResponse(clientId, id, true, payload);
            return;
        }
    }

    // Fallback: create a temporary track to hold the sample, then map it
    // This is used when Playtime 2 is not available or the API call fails
    int numTracks = m_api.CountTracks(nullptr);
    m_api.InsertTrackAtIndex(-1, true);
    int newTrackIdx = m_api.CountTracks(nullptr) - 1;
    MediaTrack* track = m_api.GetTrack(nullptr, newTrackIdx);
    if (!track) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to create temporary track\"}");
        return;
    }

    // Set the track as selected and insert the media
    if (m_api.SetOnlyTrackSelected) {
        m_api.SetOnlyTrackSelected(track);
    }
    int result = m_api.InsertMedia(filePath.c_str(), 0);
    if (result == 0) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to insert media\"}");
        return;
    }

    // Now move the sample to Playtime slot via MIDI
    // Use the slot column/row to position the item in the matrix
    std::string payload = "{";
    payload += json_string("loaded") + ":true,";
    payload += json_string("column") + ":" + std::to_string(col) + ",";
    payload += json_string("row") + ":" + std::to_string(row) + ",";
    payload += json_string("bpm") + ":" + std::to_string(0.0);
    payload += "}";

    // Clean up the temporary track
    if (m_api.DeleteTrack) {
        m_api.DeleteTrack(track);
    }

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSampleGetAudioInfo(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.PCM_Source_CreateFromFile || !m_api.GetMediaSourceLength ||
        !m_api.GetMediaSourceSampleRate || !m_api.GetMediaSourceNumChannels) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("filePath");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' parameter\"}");
        return;
    }

    PCM_source* source = m_api.PCM_Source_CreateFromFile(filePath.c_str());
    if (!source) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Could not open audio file\"}");
        return;
    }

    bool lengthIsQN = false;
    double length = m_api.GetMediaSourceLength(source, &lengthIsQN);
    int sampleRate = m_api.GetMediaSourceSampleRate(source);
    int channels = m_api.GetMediaSourceNumChannels(source);
    double bpm = detectBpmFromFile(source,
        m_api.GetMediaSourceSampleRate,
        m_api.GetMediaSourceNumChannels);

    delete source;

    std::string payload = "{";
    payload += json_string("length") + ":" + std::to_string(length) + ",";
    payload += json_string("lengthIsQN") + ":" + (lengthIsQN ? "true" : "false") + ",";
    payload += json_string("sampleRate") + ":" + std::to_string(sampleRate) + ",";
    payload += json_string("channels") + ":" + std::to_string(channels) + ",";
    payload += json_string("bpm") + ":" + std::to_string(bpm);
    payload += "}";
    SendResponse(clientId, id, true, payload);

    (void)clientId;
    (void)id;
}

void CommandHandler::HandleSamplePreview(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.PCM_Source_CreateFromFile || !m_api.PlayPreview) {
        SendResponse(clientId, id, false, "{\"error\":\"API not loaded\"}");
        return;
    }
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("filePath");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'filePath' parameter\"}");
        return;
    }

    // Stop any existing preview
    if (m_previewReg) {
        m_api.StopPreview(m_previewReg);
        m_previewReg = nullptr;
    }

    PCM_source* source = m_api.PCM_Source_CreateFromFile(filePath.c_str());
    if (!source) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Could not open audio file\"}");
        return;
    }

    // Queue the preview on main thread (PlayPreview may not be WS-safe)
    QueueMainThread([this, source]() {
        m_previewReg = (void*)m_api.PlayPreview(source);
    });

    SendResponse(clientId, id, true, "{\"previewing\":true}");
}

void CommandHandler::HandleSampleStopPreview(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    if (m_previewReg) {
        QueueMainThread([this]() {
            m_api.StopPreview(m_previewReg);
            m_previewReg = nullptr;
        });
    }
    SendResponse(clientId, id, true, "{\"stopped\":true}");
}

void CommandHandler::HandleSampleRefreshCache(
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

    // Normalize the path
    std::error_code ec;
    auto normPath = fs::weakly_canonical(fs::path(rootPath), ec);
    if (!ec) {
        rootPath = normPath.make_preferred().string();
    }

    auto progressCb = [this](int scanned, int total) {
        if (m_broadcastCb) {
            std::string evt = "{\"type\":\"event\",\"event\":\"sampleCacheProgress\",\"payload\":{";
            evt += "\"scanned\":" + std::to_string(scanned) + ",";
            evt += "\"total\":" + std::to_string(total);
            evt += "}}";
            m_broadcastCb(evt);
        }
    };
    m_sampleCache.BeginScan(rootPath, progressCb);
    SendResponse(clientId, id, true,
        "{\"scanning\":true,\"rootPath\":" + json_string(rootPath) + "}");
}

void CommandHandler::HandleSampleGetCacheStatus(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    if (!rootPath.empty()) { std::error_code ec; auto cp = fs::weakly_canonical(fs::path(rootPath), ec); rootPath = ec ? fs::path(rootPath).lexically_normal().make_preferred().string() : cp.make_preferred().string(); }
    bool scanning = m_sampleCache.IsScanning();
    bool indexed  = !rootPath.empty() && m_sampleCache.IsIndexed(rootPath);
    int scanned = 0, total = 0;
    m_sampleCache.GetScanProgress(scanned, total);

    std::string payload = "{";
    payload += json_string("scanning") + ":" + (scanning ? "true" : "false") + ",";
    payload += json_string("indexed")  + ":" + (indexed  ? "true" : "false") + ",";
    payload += json_string("scanned")  + ":" + std::to_string(scanned) + ",";
    payload += json_string("total")    + ":" + std::to_string(total);
    payload += "}";
    SendResponse(clientId, id, true, payload);
}
void CommandHandler::HandleSampleGetAllCached(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    auto allDirs = m_sampleCache.GetAllCachedDirectories(rootPath);

    std::string payload = "{\"dirs\":{";
    bool firstDir = true;
    for (const auto& pair : allDirs) {
        if (!firstDir) payload += ",";
        firstDir = false;
        payload += json_string(pair.first) + ":{";
        payload += json_string("entries") + ":[";
        bool firstEntry = true;
        for (const auto& e : pair.second) {
            if (!firstEntry) payload += ",";
            firstEntry = false;
            payload += "{";
            payload += json_string("name") + ":" + json_string(e.name) + ",";
            payload += json_string("type") + ":" + json_string(e.type);
            payload += "}";
        }
        payload += "],";
        payload += json_string("total") + ":" + std::to_string((int)pair.second.size()) + ",";
        payload += json_string("offset") + ":0,";
        payload += json_string("path") + ":" + json_string(pair.first);
        payload += "}";
    }
    payload += "}}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSampleGetCachedPaths(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    auto allDirs = m_sampleCache.GetAllCachedDirectories(rootPath);

    std::string payload = "{\"paths\":[";
    bool first = true;
    for (const auto& pair : allDirs) {
        if (!first) payload += ",";
        first = false;
        payload += json_string(pair.first);
    }
    payload += "]}";
    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSampleTagsGetAll(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;
    std::string tagsJson = m_sampleTagStorage.GetAllTagsJson();
    SendResponse(clientId, id, true, tagsJson);
}

void CommandHandler::HandleSampleTagsSet(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string filePath = parser.getString("filePath");

    if (filePath.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing 'filePath' parameter\"}");
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
                            while (p < arrContent.size() && (arrContent[p]==' '||arrContent[p]=='\t')) p++;
                            if (p >= arrContent.size()) break;
                            if (arrContent[p] == ',') { p++; continue; }
                            if (arrContent[p] == '"') {
                                p++;
                                std::string tag;
                                while (p < arrContent.size() && arrContent[p] != '"') {
                                    if (arrContent[p]=='\\' && p+1 < arrContent.size()) {
                                        p++; tag += arrContent[p++];
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

    m_sampleTagStorage.SetTags(filePath, tags);

    try {
        m_sampleTagStorage.Save();
    } catch (const std::exception& e) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to save tags: " + json_escape(e.what()) + "\"}");
        return;
    }

    SendResponse(clientId, id, true, "{\"saved\":true}");
}

void CommandHandler::HandleSampleReaperLibraries(
    int clientId, const std::string& id, const std::string& /* params */)
{
    std::string iniPath = getReaperAppDataPath() + "/REAPER.ini";
    std::ifstream f(iniPath);
    if (!f.is_open()) {
        SendResponse(clientId, id, false, "{\"error\":\"Could not open REAPER.ini\"}");
        return;
    }

    std::map<int, std::string> files;
    std::map<int, std::string> names;
    std::string line;
    while (std::getline(f, line)) {
        if (line.rfind("Shortcut", 0) != 0) continue;
        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = line.substr(0, eq);
        std::string val = line.substr(eq + 1);
        bool isName = (key.rfind("ShortcutT", 0) == 0);
        std::string numStr = key.substr(isName ? 9 : 8);
        if (numStr.empty()) continue;
        try {
            int n = std::stoi(numStr);
            if (isName) {
                names[n] = val;
            } else if (val.find(".ReaperFileList") != std::string::npos) {
                files[n] = val;
            }
        } catch (...) {}
    }

    std::string resp = "{\"libraries\":[";
    bool first = true;
    for (auto& [n, file] : files) {
        if (!first) resp += ",";
        first = false;
        std::string name = names.count(n) ? names[n] : file;
        resp += "{" + json_string("name") + ":" + json_string(name) + ","
                    + json_string("file") + ":" + json_string(file) + "}";
    }
    resp += "]}";
    SendResponse(clientId, id, true, resp);
}

void CommandHandler::HandleSampleReaperLibraryFiles(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser parser(payloadStr);
    std::string file = parser.getString("file");
    if (file.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing 'file' parameter\"}");
        return;
    }

    std::string dbPath = getReaperAppDataPath() + "/MediaDB/" + file;
    std::ifstream f(dbPath);
    if (!f.is_open()) {
        SendResponse(clientId, id, false, "{\"error\":\"Could not open database file\"}");
        return;
    }

    std::string resp = "{\"files\":[";
    bool first = true;
    std::string line;
    while (std::getline(f, line)) {
        if (line.rfind("FILE \"", 0) != 0) continue;
        size_t end = line.find('"', 6);
        if (end == std::string::npos) continue;
        std::string path = line.substr(6, end - 6);
        if (!first) resp += ",";
        first = false;
        resp += json_string(path);
    }
    resp += "]}";
    SendResponse(clientId, id, true, resp);
}

void CommandHandler::HandleSamplePurgeStaleCache(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);

    std::vector<std::string> keepPaths;
    size_t arrPos = payloadStr.find("\"paths\"");
    if (arrPos != std::string::npos) {
        size_t arrStart = payloadStr.find('[', arrPos);
        size_t arrEnd   = payloadStr.find(']', arrStart != std::string::npos ? arrStart : 0);
        if (arrStart != std::string::npos && arrEnd != std::string::npos) {
            std::string arr = payloadStr.substr(arrStart + 1, arrEnd - arrStart - 1);
            size_t p = 0;
            while (p < arr.size()) {
                while (p < arr.size() && (arr[p]==' '||arr[p]=='\t'||arr[p]==',')) p++;
                if (p >= arr.size() || arr[p] != '"') { p++; continue; }
                p++;
                std::string path;
                while (p < arr.size() && arr[p] != '"') {
                    if (arr[p]=='\\' && p+1 < arr.size()) { p++; path += arr[p++]; }
                    else path += arr[p++];
                }
                if (p < arr.size()) p++;
                if (!path.empty()) keepPaths.push_back(path);
            }
        }
    }

    int removed = m_sampleCache.PurgeStaleRoots(keepPaths);
    std::string resp = "{" + json_string("removed") + ":" + std::to_string(removed) + "}";
    SendResponse(clientId, id, true, resp);
}

#include "command_handler.h"
#include "command_handler_helpers.h"

// Defined below — render a reversed copy of [regionStart, regionEnd) of
// srcPath to outPath. regionEnd <= 0 means "to the end of the file".
static bool RenderReversedSlice(
    ReaperAPI& api, const std::string& srcPath,
    double regionStart, double regionEnd, const std::string& outPath);

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
    std::string payloadStr     = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath       = parser.getString("path");
    std::string trackIdxStr    = parser.getString("trackIdx");
    std::string regionStartStr = parser.getString("regionStart");
    std::string regionEndStr   = parser.getString("regionEnd");
    std::string reverseStr     = parser.getString("reverse");
    bool   reverse     = (reverseStr == "true" || reverseStr == "1");
    bool   hasRegion   = !regionStartStr.empty() || !regionEndStr.empty();
    double regionStart = regionStartStr.empty() ? 0.0  : atof(regionStartStr.c_str());
    double regionEnd   = regionEndStr.empty()   ? -1.0 : atof(regionEndStr.c_str());

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Verify file exists
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found: " + json_escape(filePath) + "\"}");
        return;
    }

    if (!m_api.InsertMedia) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia API not loaded\"}");
        return;
    }

    std::string insertPath = filePath;

    // Reversed region: render a permanent slice first (the filename encodes
    // the region bounds, so a later, differently-bounded render never
    // overwrites audio a previously-inserted item still points at) and
    // insert that instead of trimming afterward.
    if (reverse) {
        std::string stem = filePath, ext = "wav";
        size_t dot = filePath.rfind('.');
        if (dot != std::string::npos) {
            stem = filePath.substr(0, dot);
            ext  = filePath.substr(dot + 1);
        }
        char boundsBuf[64];
        snprintf(boundsBuf, sizeof(boundsBuf), "-%ld-%ld",
            (long)(regionStart * 1000), (long)(regionEnd * 1000));
        std::string target = stem + "__" + ext + "-spidercrab-rev" + boundsBuf + ".wav";
        if (!fs::exists(target) &&
            !RenderReversedSlice(m_api, filePath, regionStart, regionEnd, target)) {
            SendResponse(clientId, id, false, "{\"error\":\"Failed to render reversed region\"}");
            return;
        }
        insertPath = target;
        hasRegion  = false; // the rendered file already IS just that slice — no trim needed
    }

    // Track-specific insert (avoid I_SELECTED — known crash trigger)
    int insertResult = 0;
    bool trackSpecific = false;
    int trackIdx = -1;

    if (!trackIdxStr.empty() && m_api.CountTracks) {
        trackIdx = atoi(trackIdxStr.c_str());
        if (trackIdx >= 0 && trackIdx < m_api.CountTracks(nullptr)) {
            // Use InsertMedia with mode=512 to target absolute track index
            int insertFlags = 512 | (trackIdx << 16);
            insertResult = m_api.InsertMedia(insertPath.c_str(), insertFlags);
            trackSpecific = true;
        }
    }

    if (!trackSpecific) {
        // No track specified — insert at current track
        insertResult = m_api.InsertMedia(insertPath.c_str(), 0);
    }

    if (insertResult <= 0) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia returned " + std::to_string(insertResult) + "\"}");
        return;
    }

    // Trim the inserted item to a forward (non-reversed) region, if given.
    if (hasRegion && trackSpecific &&
        m_api.GetTrack && m_api.CountTrackMediaItems && m_api.GetTrackMediaItem &&
        m_api.GetActiveTake && m_api.GetSetMediaItemTakeInfo && m_api.SetMediaItemInfo_Value) {
        MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
        if (track) {
            int itemCount = m_api.CountTrackMediaItems(track);
            MediaItem* item = itemCount > 0 ? m_api.GetTrackMediaItem(track, itemCount - 1) : nullptr;
            MediaItem_Take* take = item ? m_api.GetActiveTake(item) : nullptr;
            if (take) {
                double endForLen = regionEnd;
                if (endForLen <= 0.0 && m_api.GetMediaItemTake_Source && m_api.GetMediaSourceLength) {
                    PCM_source* src = m_api.GetMediaItemTake_Source(take);
                    if (src) {
                        bool isQN = false;
                        endForLen = m_api.GetMediaSourceLength(src, &isQN);
                    }
                }
                double len = endForLen - regionStart;
                if (len > 0.0) {
                    m_api.GetSetMediaItemTakeInfo(take, "D_STARTOFFS", &regionStart);
                    m_api.SetMediaItemInfo_Value(item, "D_LENGTH", len);
                }
            }
        }
    }

    SendResponse(clientId, id, true,
        "{\"inserted\":true,\"result\":" + std::to_string(insertResult) + "}");
}

void CommandHandler::HandleSampleSendToSlot(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr     = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath       = parser.getString("path");
    std::string colStr         = parser.getString("column");
    std::string rowStr         = parser.getString("row");
    std::string regionStartStr = parser.getString("regionStart");
    std::string regionEndStr   = parser.getString("regionEnd");
    std::string reverseStr     = parser.getString("reverse");
    bool   reverse     = (reverseStr == "true" || reverseStr == "1");
    bool   hasRegion   = !regionStartStr.empty() || !regionEndStr.empty();
    double regionStart = regionStartStr.empty() ? 0.0  : atof(regionStartStr.c_str());
    double regionEnd   = regionEndStr.empty()   ? -1.0 : atof(regionEndStr.c_str());

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }
    if (colStr.empty() || rowStr.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'column' or 'row' parameter\"}");
        return;
    }

    int col = atoi(colStr.c_str());
    int row = atoi(rowStr.c_str());

    // Validate column/row against Playtime grid
    if (col < 0 || col >= m_playtimeState.columns() ||
        row < 0 || row >= m_playtimeState.rows()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Column or row out of range\"}");
        return;
    }

    // Verify file exists
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found: " + json_escape(filePath) + "\"}");
        return;
    }

    // Check required APIs
    if (!m_api.InsertMedia || !m_api.CountTracks ||
        !m_api.CountTrackMediaItems || !m_api.GetTrackMediaItem ||
        !m_api.SetMediaItemSelected || !m_api.DeleteTrackMediaItem) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Required API functions not loaded\"}");
        return;
    }

    int numTracks = m_api.CountTracks(nullptr);
    if (numTracks < 1) {
        SendResponse(clientId, id, false,
            "{\"error\":\"No tracks in project\"}");
        return;
    }

    // Create a temporary track at the end for staging — we'll delete the whole
    // track after Playtime has imported the clip, avoiding any track-management
    // conflicts with existing tracks.
    if (!m_api.InsertTrackAtIndex || !m_api.DeleteTrack) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertTrackAtIndex/DeleteTrack not available\"}");
        return;
    }
    m_api.InsertTrackAtIndex(numTracks, false);
    MediaTrack* scratchTrack = m_api.GetTrack(nullptr, numTracks);
    if (!scratchTrack) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Could not create temp track\"}");
        return;
    }

    // Reversed region: render a permanent slice first (the filename encodes
    // the region bounds, so a later, differently-bounded render never
    // overwrites audio a previously-inserted clip still points at) and
    // insert that instead — the rest of this handler (tempo-match etc.)
    // then naturally operates on just that slice, no further changes needed.
    std::string insertPath = filePath;
    if (reverse) {
        std::string stem = filePath, ext = "wav";
        size_t dot = filePath.rfind('.');
        if (dot != std::string::npos) {
            stem = filePath.substr(0, dot);
            ext  = filePath.substr(dot + 1);
        }
        char boundsBuf[64];
        snprintf(boundsBuf, sizeof(boundsBuf), "-%ld-%ld",
            (long)(regionStart * 1000), (long)(regionEnd * 1000));
        std::string target = stem + "__" + ext + "-spidercrab-rev" + boundsBuf + ".wav";
        if (!fs::exists(target) &&
            !RenderReversedSlice(m_api, filePath, regionStart, regionEnd, target)) {
            SendResponse(clientId, id, false, "{\"error\":\"Failed to render reversed region\"}");
            return;
        }
        insertPath = target;
        hasRegion  = false; // the rendered file already IS just that slice — no trim needed
    }

    // Step 1: Insert media on the temp track
    int insertFlags  = 512 | (numTracks << 16);
    int insertResult = m_api.InsertMedia(insertPath.c_str(), insertFlags);

    if (insertResult <= 0) {
        SendResponse(clientId, id, false,
            "{\"error\":\"InsertMedia returned " + std::to_string(insertResult) + "\"}");
        return;
    }

    // Step 2: Find and select the newly created item (last item on track)
    int itemCountAfter = m_api.CountTrackMediaItems(scratchTrack);
    MediaItem* insertedItem = nullptr;
    if (itemCountAfter > 0) {
        insertedItem = m_api.GetTrackMediaItem(scratchTrack, itemCountAfter - 1);
    }

    if (!insertedItem) {
        m_api.Main_OnCommand(40029, 0); // Edit: Undo
        SendResponse(clientId, id, false,
            "{\"error\":\"Could not find inserted item\"}");
        return;
    }

    // Tempo-match: set D_PLAYRATE so Playtime imports at project tempo.
    // Fast path: ACID/BWF embedded metadata. Slow path: MiniBPM audio analysis.
    if (m_api.Master_GetTempo && m_api.GetActiveTake &&
        m_api.GetMediaItemTake_Source && m_api.GetSetMediaItemTakeInfo) {
        double projectBpm = m_api.Master_GetTempo();
        double sampleBpm  = 0.0;
        MediaItem_Take* take = m_api.GetActiveTake(insertedItem);
        if (take) {
            PCM_source* src = m_api.GetMediaItemTake_Source(take);
            if (src) {
                // Try embedded metadata first (instant)
                if (m_api.GetMediaFileMetadata) {
                    char tempoBuf[64] = {0};
                    m_api.GetMediaFileMetadata(src, "TEMPO", tempoBuf, (int)sizeof(tempoBuf));
                    if (tempoBuf[0] != '\0') sampleBpm = atof(tempoBuf);
                }
                // Fall back to audio analysis via MiniBPM
                if (sampleBpm <= 0.0) {
                    sampleBpm = detectBpmFromFile(src,
                        m_api.GetMediaSourceSampleRate,
                        m_api.GetMediaSourceNumChannels);
                }
            }
            if (sampleBpm > 0.0 && projectBpm > 0.0) {
                // Normalise detected BPM: keep halving/doubling until the rate
                // is in [0.5, 2.0] — corrects MiniBPM half/double detections.
                double normalBpm = sampleBpm;
                while (projectBpm / normalBpm > 2.0)  normalBpm *= 2.0;
                while (projectBpm / normalBpm < 0.5)  normalBpm /= 2.0;
                double rate = projectBpm / normalBpm;
                m_api.GetSetMediaItemTakeInfo(take, "D_PLAYRATE", &rate);
                // Set item to beat-based mode and encode clip length in quarter notes.
                // This tells Playtime the correct musical loop length regardless of
                // whether it reads D_LENGTH in seconds or QN.
                if (m_api.GetMediaSourceLength && m_api.SetMediaItemInfo_Value && src) {
                    bool isQN = false;
                    double srcLen = m_api.GetMediaSourceLength(src, &isQN);
                    if (!isQN && srcLen > 0.0) {
                        double newLen = srcLen / rate;
                        // Snap to nearest whole bar at project tempo if within 10%
                        if (projectBpm > 0.0) {
                            double secsPerBar = 240.0 / projectBpm;
                            double bars       = newLen / secsPerBar;
                            double rounded    = std::round(bars);
                            if (rounded > 0.0 && std::abs(bars - rounded) / rounded < 0.10)
                                newLen = rounded * secsPerBar;
                        }
                        m_api.SetMediaItemInfo_Value(insertedItem, "D_LENGTH", newLen);
                    }
                }
            }
        }
    }

    // Forward (non-reversed) region: trim the inserted item to just that
    // slice. Runs after tempo-match so it can read back whatever D_PLAYRATE
    // was set (defaulting to 1.0 if tempo-match didn't run) — D_STARTOFFS is
    // source-time seconds and unaffected by playrate, but D_LENGTH must be
    // divided by it. Deliberately skips the bar-snap heuristic above: an
    // explicit hand-picked region shouldn't be silently stretched or shrunk.
    if (hasRegion && m_api.GetActiveTake && m_api.GetSetMediaItemTakeInfo &&
        m_api.SetMediaItemInfo_Value) {
        MediaItem_Take* take = m_api.GetActiveTake(insertedItem);
        if (take) {
            double rate = 1.0;
            void* rateP = m_api.GetSetMediaItemTakeInfo(take, "D_PLAYRATE", nullptr);
            if (rateP) rate = *(double*)rateP;

            double endForLen = regionEnd;
            if (endForLen <= 0.0 && m_api.GetMediaItemTake_Source && m_api.GetMediaSourceLength) {
                PCM_source* src = m_api.GetMediaItemTake_Source(take);
                if (src) {
                    bool isQN = false;
                    endForLen = m_api.GetMediaSourceLength(src, &isQN);
                }
            }
            double len = (endForLen - regionStart) / (rate > 0.0 ? rate : 1.0);
            if (len > 0.0) {
                m_api.GetSetMediaItemTakeInfo(take, "D_STARTOFFS", &regionStart);
                m_api.SetMediaItemInfo_Value(insertedItem, "D_LENGTH", len);
            }
        }
    }

    // Deselect all items project-wide before selecting ours.
    // FillSlotWithSelectedItem processes ALL selected items — any previously
    // moved items still selected in arrangement would cause extra clips.
    int totalTracks = m_api.CountTracks(nullptr);
    for (int t = 0; t < totalTracks; t++) {
        MediaTrack* tr = m_api.GetTrack(nullptr, t);
        if (!tr) continue;
        int tc = m_api.CountTrackMediaItems(tr);
        for (int i = 0; i < tc; i++) {
            MediaItem* it = m_api.GetTrackMediaItem(tr, i);
            if (it) m_api.SetMediaItemSelected(it, false);
        }
    }

    // Select only our new item
    m_api.SetMediaItemSelected(insertedItem, true);
    if (m_api.UpdateArrange) {
        m_api.UpdateArrange();
    }

    // Step 3: Send OSC import message -> ReaLearn triggers FillSlotWithSelectedItem
    m_oscSender.sendImportSlot(col, row);

    // Remember where this clip came from so it can be bounced to a sampler
    // later — persisted into the project so it survives REAPER restarts.
    m_playtimeState.setSlotSource(col, row, filePath);
    if (m_api.SetProjExtState)
        m_api.SetProjExtState(nullptr, "SPIDERCRAB", "slotSources",
            m_playtimeState.serializeSources().c_str());

    // Step 4: Respond immediately so the UI feels instant, then clean up the
    // temp item after ~5 Run() ticks (~165ms) — enough time for ReaLearn to
    // receive the OSC and fire FillSlotWithSelectedItem before we delete it.
    std::string fileName = filePath;
    {
        size_t slashPos = fileName.find_last_of("/\\");
        if (slashPos != std::string::npos) fileName = fileName.substr(slashPos + 1);
    }
    SlotState immediate;
    immediate.column   = col;
    immediate.row      = row;
    immediate.state    = "stopped";
    immediate.clipType = "audio";
    immediate.name     = fileName;
    m_playtimeState.setSlot(col, row, immediate);
    BroadcastMatrixEvent("matrix/slotStateChanged", m_playtimeState.getSlot(col, row).toJson());
    SendResponse(clientId, id, true, m_playtimeState.getSlot(col, row).toJson());

    // Determine the track name REAPER will assign (filename without extension)
    std::string trackName;
    {
        size_t slash = filePath.find_last_of("/\\");
        trackName = (slash != std::string::npos) ? filePath.substr(slash + 1) : filePath;
        size_t dot = trackName.find_last_of('.');
        if (dot != std::string::npos) trackName = trackName.substr(0, dot);
    }

    // Delete the temp track by name after Playtime has imported the clip.
    // ticksLeft is a shared_ptr<int> so all re-queued copies decrement the same counter.
    auto ticksLeft = std::make_shared<int>(90);
    auto doCleanup = std::make_shared<std::function<void()>>();
    *doCleanup = [this, trackName, doCleanup, ticksLeft]() {
        if (--(*ticksLeft) > 0) {
            QueueMainThread(*doCleanup);
            return;
        }
        int n = m_api.CountTracks(nullptr);
        for (int t = n - 1; t >= 0; t--) {
            MediaTrack* tr = m_api.GetTrack(nullptr, t);
            if (!tr) continue;
            char nameBuf[512] = {0};
            m_api.GetSetMediaTrackInfo_String(tr, "P_NAME", nameBuf, false);
            if (trackName == nameBuf) {
                m_api.DeleteTrack(tr);
                break;
            }
        }
        if (m_api.UpdateArrange) m_api.UpdateArrange();
    };
    QueueMainThread(*doCleanup);
}

void CommandHandler::HandleSampleGetAudioInfo(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath = parser.getString("path");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Check file existence
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found\"}");
        return;
    }

    // Try Reaper's PCM_Source first (gives duration even for non-WAV files)
    // Fall back to manual WAV header parsing
    if (!m_api.PCM_Source_CreateFromFile) {
        SendResponse(clientId, id, false, "{\"error\":\"PCM_Source_CreateFromFile not loaded\"}");
        return;
    }

    PCM_source* src = m_api.PCM_Source_CreateFromFile(filePath.c_str());
    if (!src) {
        SendResponse(clientId, id, false, "{\"error\":\"REAPER could not open file\"}");
        return;
    }

    double duration  = src->GetLength();
    double srcRate   = src->GetSampleRate();
    int    srcCh     = std::max(1, src->GetNumChannels());

    // Compute ~1000 downsampled peaks by sequential decode.
    // Works for all REAPER-supported formats (WAV, MP3, FLAC, AIFF, OGG, etc.).
    const int kNumPeaks  = 1000;
    const int kChunkFrames = 4096;
    double framesPerPeak = (srcRate > 0 && duration > 0)
        ? (duration * srcRate) / kNumPeaks : 0.0;

    std::vector<float> peaks(kNumPeaks, 0.0f);

    if (srcRate > 0 && duration > 0 && framesPerPeak > 0) {
        std::vector<ReaSample> samples(kChunkFrames * srcCh, 0.0f);
        double pos = 0.0; // in frames

        while (pos < duration * srcRate) {
            PCM_source_transfer_t block;
            memset(&block, 0, sizeof(block));
            block.time_s    = pos / srcRate;
            block.samplerate = srcRate;
            block.nch       = srcCh;
            block.length    = kChunkFrames;
            block.samples   = samples.data();

            src->GetSamples(&block);
            if (block.samples_out <= 0) break;

            for (int f = 0; f < block.samples_out; f++) {
                int pi = (int)((pos + f) / framesPerPeak);
                if (pi >= kNumPeaks) pi = kNumPeaks - 1;
                for (int c = 0; c < srcCh; c++) {
                    float a = (float)std::fabs((double)samples[f * srcCh + c]);
                    if (a > peaks[pi]) peaks[pi] = a;
                }
            }
            pos += block.samples_out;
        }
    }

    delete src;

    // Serialize peaks as compact JSON array (1000 * ~6 chars ≈ 6 KB)
    std::string peaksArr = "[";
    for (int i = 0; i < kNumPeaks; i++) {
        if (i > 0) peaksArr += ",";
        // 3 decimal places is plenty for waveform display
        char buf[16];
        snprintf(buf, sizeof(buf), "%.3f", peaks[i]);
        peaksArr += buf;
    }
    peaksArr += "]";

    std::string payload = "{";
    payload += json_string("duration")   + ":" + std::to_string(duration) + ",";
    payload += json_string("sampleRate") + ":" + std::to_string((int)srcRate) + ",";
    payload += json_string("channels")  + ":" + std::to_string(srcCh) + ",";
    payload += json_string("peaks")     + ":" + peaksArr;
    payload += "}";

    SendResponse(clientId, id, true, payload);
}

void CommandHandler::HandleSamplePreview(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr   = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string filePath     = parser.getString("path");
    std::string startPosStr  = parser.getString("startPos");
    std::string regionEndStr = parser.getString("regionEnd");
    std::string reverseStr   = parser.getString("reverse");
    bool reverse = (reverseStr == "true" || reverseStr == "1");

    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"path\\\" parameter\"}");
        return;
    }

    // Check file existence
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found\"}");
        return;
    }

    if (!m_api.PCM_Source_CreateFromFile || !m_api.PlayPreview || !m_api.StopPreview) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Preview API not loaded\"}");
        return;
    }

    double startPos = startPosStr.empty() ? 0.0 : atof(startPosStr.c_str());
    double effectiveDuration = -1.0; // -1 = not computed; frontend keeps its own duration

    // Reverse preview (whole file or a selected region): REAPER has no native
    // reverse playback, so render the requested slice reversed to a scratch
    // file (overwritten each call — this is a live/throwaway preview, not
    // something a track will reference later) and preview that instead.
    if (reverse) {
        double regionEnd = regionEndStr.empty() ? -1.0 : atof(regionEndStr.c_str());
        std::error_code ec;
        std::string scratchPath =
            (fs::temp_directory_path(ec) / "spidercrab-preview-reverse.wav").string();
        if (ec || !RenderReversedSlice(m_api, filePath, startPos, regionEnd, scratchPath)) {
            SendResponse(clientId, id, false,
                "{\"error\":\"Failed to render reversed preview\"}");
            return;
        }
        filePath = scratchPath;
        startPos = 0.0;

        // PCM_Source_CreateFromFile is safe on background thread (just opens file/decoder)
        PCM_source* probe = m_api.PCM_Source_CreateFromFile(filePath.c_str());
        if (probe) {
            effectiveDuration = probe->GetLength();
            delete probe;
        }
    }

    // PCM_Source_CreateFromFile is safe on background thread (just opens file/decoder)
    PCM_source* src = m_api.PCM_Source_CreateFromFile(filePath.c_str());
    if (!src) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Failed to create PCM source from file\"}");
        return;
    }

    // Build preview_register_t on this thread — PlayPreview must run on main thread
    preview_register_t* reg = new preview_register_t();
    memset(reg, 0, sizeof(*reg));
#ifndef _WIN32
    pthread_mutex_init(&reg->mutex, nullptr);
#else
    InitializeCriticalSection(&reg->cs);
#endif
    reg->src = src;
    reg->m_out_chan = 0;
    reg->loop = false;
    reg->volume = 1.0;
    reg->curpos = startPos;

    // PlayPreview must be called from REAPER's main thread
    QueueMainThread([this, reg]() {
        // Stop any existing preview first
        preview_register_t* old = static_cast<preview_register_t*>(m_previewReg);
        if (old) {
            if (m_api.StopPreview) m_api.StopPreview(old);
            if (old->src) { delete old->src; old->src = nullptr; }
#ifndef _WIN32
            pthread_mutex_destroy(&old->mutex);
#else
            DeleteCriticalSection(&old->cs);
#endif
            delete old;
            m_previewReg = nullptr;
        }
        if (m_api.PlayPreview && m_api.PlayPreview(reg)) {
            m_previewReg = reg;
        } else {
            if (reg->src) { delete reg->src; reg->src = nullptr; }
#ifndef _WIN32
            pthread_mutex_destroy(&reg->mutex);
#else
            DeleteCriticalSection(&reg->cs);
#endif
            delete reg;
        }
    });

    // Respond optimistically — audio starts on next Run() tick (~33ms)
    std::string resp = "{\"playing\":true,\"startPos\":" + std::to_string(startPos);
    if (effectiveDuration >= 0.0)
        resp += ",\"effectiveDuration\":" + std::to_string(effectiveDuration);
    resp += "}";
    SendResponse(clientId, id, true, resp);
}

void CommandHandler::HandleSampleStopPreview(
    int clientId, const std::string& id, const std::string& params)
{
    (void)params;

    // StopPreview must also run on main thread
    QueueMainThread([this]() {
        preview_register_t* reg = static_cast<preview_register_t*>(m_previewReg);
        if (!reg) return;
        if (m_api.StopPreview) m_api.StopPreview(reg);
        if (reg->src) { delete reg->src; reg->src = nullptr; }
#ifndef _WIN32
        pthread_mutex_destroy(&reg->mutex);
#else
        DeleteCriticalSection(&reg->cs);
#endif
        delete reg;
        m_previewReg = nullptr;
    });

    SendResponse(clientId, id, true,
        "{\"stopped\":true}");
}

void CommandHandler::HandleSampleRefreshCache(
    int clientId, const std::string& id, const std::string& params)
{
    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string rootPath = parser.getString("rootPath");

    if (rootPath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing \\\"rootPath\\\" parameter\"}");
        return;
    }

    { std::error_code ec; auto cp = fs::weakly_canonical(fs::path(rootPath), ec); rootPath = ec ? fs::path(rootPath).lexically_normal().make_preferred().string() : cp.make_preferred().string(); }
    m_sampleCache.ClearRoot(rootPath);
    m_sampleCache.BeginScan(rootPath, [this](int scanned, int total) {
        if (!m_broadcastCb) return;
        std::string evt = "{\"type\":\"event\",\"event\":\"sampleIndexProgress\","
            "\"payload\":{\"scanned\":" + std::to_string(scanned) + ","
            "\"total\":"  + std::to_string(total) + "}}";
        m_broadcastCb(evt);
    });

    int scanned = 0, total = 0;
    m_sampleCache.GetScanProgress(scanned, total);
    SendResponse(clientId, id, true,
        "{\"scanning\":true,\"total\":" + std::to_string(total) + "}");
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

    // Parse tags array from payload
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
    std::string iniPath = getReaperAppDataPath() + "\\REAPER.ini";
    std::ifstream f(iniPath);
    if (!f.is_open()) {
        SendResponse(clientId, id, false, "{\"error\":\"Could not open REAPER.ini\"}");
        return;
    }

    std::map<int, std::string> files; // index -> xx.ReaperFileList
    std::map<int, std::string> names; // index -> display name
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

    std::string dbPath = getReaperAppDataPath() + "\\MediaDB\\" + file;
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

    // Parse "paths" string array
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

// ============================================================
// Sampler: bounce a sample / Playtime clip to ReaSamplOmatic5000
// ============================================================

// Create a new track with RS5K loaded with the given sample, armed for
// MIDI input with monitoring on. RS5K's default mode pitch-tracks the
// played key chromatically (original pitch at C4), so the sample is
// immediately playable.
void CommandHandler::HandleSamplerCreate(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.InsertTrackAtIndex || !m_api.GetTrack || !m_api.CountTracks ||
        !m_api.TrackFX_AddByName || !m_api.TrackFX_SetNamedConfigParm ||
        !m_api.GetSetMediaTrackInfo) {
        SendResponse(clientId, id, false, "{\"error\":\"Required API functions not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    // JsonParser consumes as it scans — a missing key exhausts it, so use a
    // fresh parser per key ("path" is absent in slot mode and vice versa).
    std::string filePath = JsonParser(payloadStr).getString("path");
    std::string colStr   = JsonParser(payloadStr).getString("column");
    std::string rowStr   = JsonParser(payloadStr).getString("row");

    // Either an explicit path, or a Playtime slot we imported earlier
    if (filePath.empty() && !colStr.empty() && !rowStr.empty()) {
        SlotState slot = m_playtimeState.getSlot(atoi(colStr.c_str()), atoi(rowStr.c_str()));
        filePath = slot.sourcePath;
        if (filePath.empty()) {
            SendResponse(clientId, id, false,
                "{\"error\":\"No known source file for this clip (recorded clips are not supported yet)\"}");
            return;
        }
    }
    if (filePath.empty()) {
        SendResponse(clientId, id, false,
            "{\"error\":\"Missing 'path' or 'column'/'row' parameter\"}");
        return;
    }
    if (!fs::exists(filePath)) {
        SendResponse(clientId, id, false,
            "{\"error\":\"File not found: " + json_escape(filePath) + "\"}");
        return;
    }

    // Create the sampler track at the end of the project
    int numTracks = m_api.CountTracks(nullptr);
    m_api.InsertTrackAtIndex(numTracks, false);
    MediaTrack* track = m_api.GetTrack(nullptr, numTracks);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Could not create sampler track\"}");
        return;
    }

    // Name it after the sample
    std::string fileName = filePath;
    {
        size_t slashPos = fileName.find_last_of("/\\");
        if (slashPos != std::string::npos) fileName = fileName.substr(slashPos + 1);
        size_t dotPos = fileName.rfind('.');
        if (dotPos != std::string::npos) fileName = fileName.substr(0, dotPos);
    }
    std::string trackName = "S: " + fileName;
    if (m_api.GetSetMediaTrackInfo_String) {
        m_api.GetSetMediaTrackInfo_String(track, "P_NAME",
            const_cast<char*>(trackName.c_str()), true);
    }

    // Add RS5K and load the sample
    int fxIdx = m_api.TrackFX_AddByName(track, "ReaSamplOmatic5000", false, 1);
    if (fxIdx < 0) {
        SendResponse(clientId, id, false, "{\"error\":\"Could not add ReaSamplOmatic5000\"}");
        return;
    }
    m_api.TrackFX_SetNamedConfigParm(track, fxIdx, "FILE0", filePath.c_str());
    m_api.TrackFX_SetNamedConfigParm(track, fxIdx, "DONE", "");
    // Mode 2 = "Note (Semitone shifted)" so played keys pitch the sample
    // chromatically (RS5K defaults to "Sample (ignores MIDI note)")
    m_api.TrackFX_SetNamedConfigParm(track, fxIdx, "MODE", "2");

    // Arm for MIDI: record-arm, input = all MIDI devices/channels, monitoring on
    int armOn = 1;
    m_api.GetSetMediaTrackInfo(track, "I_RECARM", &armOn);
    int recMon = 1;
    m_api.GetSetMediaTrackInfo(track, "I_RECMON", &recMon);
    int midiInput = 4096 + 63 * 32; // MIDI: all devices, all channels
    m_api.GetSetMediaTrackInfo(track, "I_RECINPUT", &midiInput);

    if (m_api.UpdateArrange) m_api.UpdateArrange();

    SendResponse(clientId, id, true,
        "{\"trackIdx\":" + std::to_string(numTracks)
        + ",\"fxIdx\":" + std::to_string(fxIdx)
        + ",\"name\":" + json_string(trackName)
        + ",\"path\":" + json_string(filePath) + "}");
}

// Write a float32 WAV file. Returns false on IO failure.
static bool writeFloatWav(const std::string& path, const std::vector<float>& interleaved,
    int channels, int sampleRate)
{
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) return false;

    uint32_t dataBytes  = (uint32_t)(interleaved.size() * sizeof(float));
    uint32_t byteRate   = (uint32_t)sampleRate * channels * sizeof(float);
    uint16_t blockAlign = (uint16_t)(channels * sizeof(float));
    uint32_t riffSize   = 36 + dataBytes;
    uint16_t fmtFloat   = 3; // IEEE float
    uint16_t bits       = 32;
    uint16_t nch        = (uint16_t)channels;
    uint32_t srate      = (uint32_t)sampleRate;
    uint32_t fmtSize    = 16;

    bool ok = true;
    ok = ok && fwrite("RIFF", 1, 4, f) == 4;
    ok = ok && fwrite(&riffSize, 4, 1, f) == 1;
    ok = ok && fwrite("WAVE", 1, 4, f) == 4;
    ok = ok && fwrite("fmt ", 1, 4, f) == 4;
    ok = ok && fwrite(&fmtSize, 4, 1, f) == 1;
    ok = ok && fwrite(&fmtFloat, 2, 1, f) == 1;
    ok = ok && fwrite(&nch, 2, 1, f) == 1;
    ok = ok && fwrite(&srate, 4, 1, f) == 1;
    ok = ok && fwrite(&byteRate, 4, 1, f) == 1;
    ok = ok && fwrite(&blockAlign, 2, 1, f) == 1;
    ok = ok && fwrite(&bits, 2, 1, f) == 1;
    ok = ok && fwrite("data", 1, 4, f) == 4;
    ok = ok && fwrite(&dataBytes, 4, 1, f) == 1;
    ok = ok && fwrite(interleaved.data(), 1, dataBytes, f) == dataBytes;
    fclose(f);
    return ok;
}

// Render a reversed copy of [regionStart, regionEnd) of srcPath to outPath.
// regionEnd <= 0 means "to the end of the file". Shared by the sampler's
// reverse toggle (whole file) and the Media tab's region-aware reverse
// preview/send (an arbitrary slice). Returns false on failure.
static bool RenderReversedSlice(
    ReaperAPI& api, const std::string& srcPath,
    double regionStart, double regionEnd, const std::string& outPath)
{
    if (!api.PCM_Source_CreateFromFile || !api.GetMediaSourceSampleRate ||
        !api.GetMediaSourceNumChannels || !api.GetMediaSourceLength)
        return false;

    PCM_source* src = api.PCM_Source_CreateFromFile(srcPath.c_str());
    if (!src) return false;

    int    srate   = api.GetMediaSourceSampleRate(src);
    int    nch     = api.GetMediaSourceNumChannels(src);
    bool   isQN    = false;
    double fullLen = api.GetMediaSourceLength(src, &isQN);

    if (regionStart < 0.0) regionStart = 0.0;
    if (regionEnd <= 0.0 || regionEnd > fullLen) regionEnd = fullLen;
    double len = regionEnd - regionStart;

    // Cap render length at 10 minutes to bound memory
    if (srate <= 0 || nch <= 0 || len <= 0 || len > 600.0) {
        delete src;
        return false;
    }

    int totalFrames = (int)(len * srate + 0.5);
    std::vector<float>     out((size_t)totalFrames * nch, 0.0f);
    const int hop = 65536;
    std::vector<ReaSample> buf((size_t)nch * hop, 0.0);

    PCM_source_transfer_t block = {};
    block.samplerate = (double)srate;
    block.nch        = nch;
    block.samples    = buf.data();
    block.time_s     = regionStart;

    int readFrames = 0;
    while (readFrames < totalFrames) {
        block.length      = (totalFrames - readFrames) < hop ? (totalFrames - readFrames) : hop;
        block.samples_out = 0;
        src->GetSamples(&block);
        int got = block.samples_out;
        if (got <= 0) break;
        for (int i = 0; i < got; i++) {
            // Write each frame into its mirrored position
            int dstFrame = totalFrames - 1 - (readFrames + i);
            for (int c = 0; c < nch; c++)
                out[(size_t)dstFrame * nch + c] = (float)buf[(size_t)i * nch + c];
        }
        readFrames   += got;
        block.time_s += (double)got / (double)srate;
    }
    delete src;

    if (readFrames <= 0) return false;
    return writeFloatWav(outPath, out, nch, srate);
}

// Toggle reverse on an RS5K instance. RS5K has no native reverse, so we
// render a reversed copy of the source file next to it (cached) and swap
// FILE0 between the original and the "-spidercrab-rev.wav" copy.
void CommandHandler::HandleSamplerSetReverse(
    int clientId, const std::string& id, const std::string& params)
{
    if (!m_api.TrackFX_GetNamedConfigParm || !m_api.TrackFX_SetNamedConfigParm ||
        !m_api.GetTrack || !m_api.PCM_Source_CreateFromFile ||
        !m_api.GetMediaSourceSampleRate || !m_api.GetMediaSourceNumChannels ||
        !m_api.GetMediaSourceLength) {
        SendResponse(clientId, id, false, "{\"error\":\"Required API functions not loaded\"}");
        return;
    }

    std::string payloadStr = extractPayload(params);
    JsonParser  parser(payloadStr);
    std::string trackIdxStr = parser.getString("trackIdx");
    std::string fxIdxStr    = parser.getString("fxIdx");
    std::string reversedStr = parser.getString("reversed");

    if (trackIdxStr.empty() || fxIdxStr.empty()) {
        SendResponse(clientId, id, false, "{\"error\":\"Missing 'trackIdx' or 'fxIdx' parameter\"}");
        return;
    }
    int  trackIdx = atoi(trackIdxStr.c_str());
    int  fxIdx    = atoi(fxIdxStr.c_str());
    bool reversed = (reversedStr == "true" || reversedStr == "1");
    if (reversedStr.empty())
        reversed = (payloadStr.find("\"reversed\":true") != std::string::npos);

    MediaTrack* track = m_api.GetTrack(nullptr, trackIdx);
    if (!track) {
        SendResponse(clientId, id, false, "{\"error\":\"Invalid track index\"}");
        return;
    }

    char fileBuf[2048] = {0};
    if (!m_api.TrackFX_GetNamedConfigParm(track, fxIdx, "FILE0", fileBuf, sizeof(fileBuf))
        || !fileBuf[0]) {
        SendResponse(clientId, id, false, "{\"error\":\"Sampler has no sample loaded\"}");
        return;
    }

    const std::string revTag = "-spidercrab-rev";
    std::string current(fileBuf);

    // Derive the forward (original) path from whichever file is loaded.
    // Reversed copies are named "<stem>__<origext>-spidercrab-rev.wav".
    std::string forward = current;
    size_t tagPos = forward.find(revTag);
    if (tagPos != std::string::npos) {
        forward = forward.substr(0, tagPos);
        size_t extSep = forward.rfind("__");
        if (extSep != std::string::npos) {
            std::string origExt = forward.substr(extSep + 2);
            forward = forward.substr(0, extSep) + "." + origExt;
        }
    }

    std::string target = forward;
    if (reversed) {
        std::string stem = forward, origExt = "wav";
        size_t dot = forward.rfind('.');
        if (dot != std::string::npos) {
            stem    = forward.substr(0, dot);
            origExt = forward.substr(dot + 1);
        }
        target = stem + "__" + origExt + revTag + ".wav";

        if (!fs::exists(target) &&
            !RenderReversedSlice(m_api, forward, 0.0, -1.0, target)) {
            SendResponse(clientId, id, false, "{\"error\":\"Failed to render reversed file\"}");
            return;
        }
    }

    m_api.TrackFX_SetNamedConfigParm(track, fxIdx, "FILE0", target.c_str());
    m_api.TrackFX_SetNamedConfigParm(track, fxIdx, "DONE", "");

    SendResponse(clientId, id, true,
        "{\"reversed\":" + std::string(reversed ? "true" : "false")
        + ",\"file\":" + json_string(target) + "}");
}

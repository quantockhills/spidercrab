#include "sample_cache.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

// Lowercase helper for extension comparison
static std::string toLowerExt(const std::string& s)
{
    std::string out;
    out.reserve(s.size());
    for (char c : s)
        out += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return out;
}

bool SampleCache::IsAudioExtension(const std::string& ext)
{
    static const char* kAudioExtensions[] = {
        ".wav", ".mp3", ".flac", ".ogg", ".aiff", ".aif", ".m4a", ".wma"
    };
    std::string lower = toLowerExt(ext);
    for (const char* ae : kAudioExtensions) {
        if (lower == ae)
            return true;
    }
    return false;
}

// ── Scanning ──

void SampleCache::BeginScan(const std::string& rootPath, ProgressCallback progressCb)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    // Cancel any existing scan
    if (m_scanState) {
        m_scanState->cancelled = true;
    }

    auto state = std::make_unique<ScanState>();
    state->rootPath = rootPath;
    state->progressCb = std::move(progressCb);
    state->counting = true;
    state->totalFiles = 0;
    state->scannedFiles = 0;

    m_scanState = std::move(state);

    // Begin counting phase: walk directory and count total files immediately.
    // This first pass is fast (directory_iterator with no file_size).
    // We also collect all directory paths so we can populate the cache in phase 2.
    if (m_scanState) {
        try {
            if (fs::exists(rootPath) && fs::is_directory(rootPath)) {
                for (const auto& entry : fs::recursive_directory_iterator(rootPath)) {
                    if (m_scanState->cancelled)
                        break;

                    std::string name = entry.path().filename().string();
                    if (entry.is_regular_file()) {
                        std::string ext;
                        size_t dotPos = name.rfind('.');
                        if (dotPos != std::string::npos) {
                            ext = name.substr(dotPos);
                            if (IsAudioExtension(ext)) {
                                m_scanState->totalFiles++;
                                m_scanState->allFiles.push_back(entry.path().string());
                            }
                        }
                    } else if (entry.is_directory()) {
                        m_scanState->allDirectories.push_back(entry.path().string());
                    }
                }
            }
        } catch (const fs::filesystem_error&) {
            // Graceful degradation: 0 files, path likely doesn't exist
        }

        m_scanState->counting = false;
        m_scanState->totalFiles = static_cast<int>(m_scanState->allFiles.size());

        // Add the root directory itself as a directory entry (if it exists)
        if (fs::exists(rootPath) && fs::is_directory(rootPath)) {
            m_scanState->allDirectories.push_back(rootPath);
        }

        // Call progress callback with initial state
        if (m_scanState->progressCb) {
            m_scanState->progressCb(0, m_scanState->totalFiles);
        }
    }
}

bool SampleCache::ScanNextBatch()
{
    std::lock_guard<std::mutex> lock(m_mutex);

    if (!m_scanState || m_scanState->cancelled) {
        return true; // Done (cancelled or no scan)
    }

    const int kBatchSize = 100;
    int processedThisBatch = 0;

    // Phase 2: Index files into m_directoryCache
    while (m_scanState->currentFileIdx < m_scanState->allFiles.size() &&
           processedThisBatch < kBatchSize) {

        const std::string& filePath = m_scanState->allFiles[m_scanState->currentFileIdx];
        fs::path p(filePath);

        // Get the parent directory path
        std::string parentDir = p.parent_path().string();
        std::string fileName = p.filename().string();

        // Get file size
        uintmax_t fileSize = 0;
        std::error_code ec;
        auto fsize = fs::file_size(p, ec);
        if (!ec)
            fileSize = fsize;

        // Add entry to the parent directory's cache
        Entry entry;
        entry.name = fileName;
        entry.type = "file";
        entry.size = fileSize;
        m_directoryCache[parentDir].push_back(std::move(entry));

        m_scanState->currentFileIdx++;
        m_scanState->scannedFiles++;
        processedThisBatch++;
    }

    // Also populate subdirectory entries if we haven't yet
    // We add directory entries on first scan batch to ensure they appear
    // even if the directory has no audio files
    if (m_scanState->allDirectories.empty()) {
        // Re-scan for directories if not collected during counting
        // (shouldn't happen since we collect them above, but be safe)
        try {
            if (fs::exists(m_scanState->rootPath) && fs::is_directory(m_scanState->rootPath)) {
                for (const auto& entry : fs::recursive_directory_iterator(m_scanState->rootPath)) {
                    if (entry.is_directory()) {
                        m_scanState->allDirectories.push_back(entry.path().string());
                    }
                }
            }
        } catch (const fs::filesystem_error&) {
        }
    }

    // Process directory entries: for each subdirectory, add it as an entry
    // in its parent directory's cache. Only do this once per directory.
    while (m_scanState->currentDirIdx < m_scanState->allDirectories.size()) {
        const std::string& dirPath = m_scanState->allDirectories[m_scanState->currentDirIdx];
        fs::path p(dirPath);
        std::string parentDir = p.parent_path().string();
        std::string dirName = p.filename().string();

        // Don't add the root dir as an entry in its own parent
        if (!dirName.empty() && !parentDir.empty()) {
            // Check if this directory is already in the cache for its parent
            bool alreadyExists = false;
            auto it = m_directoryCache.find(parentDir);
            if (it != m_directoryCache.end()) {
                for (const auto& existing : it->second) {
                    if (existing.name == dirName && existing.type == "dir") {
                        alreadyExists = true;
                        break;
                    }
                }
            }
            if (!alreadyExists) {
                Entry dirEntry;
                dirEntry.name = dirName;
                dirEntry.type = "dir";
                dirEntry.size = 0;
                m_directoryCache[parentDir].push_back(std::move(dirEntry));
            }
        }

        m_scanState->currentDirIdx++;
        // Don't limit directory entry processing — it's cheap
    }

    // Call progress callback
    if (m_scanState->progressCb) {
        m_scanState->progressCb(m_scanState->scannedFiles, m_scanState->totalFiles);
    }

    // Check if scan is complete
    if (m_scanState->currentFileIdx >= m_scanState->allFiles.size()) {
        // Sort entries in each directory for deterministic ordering
        for (auto& pair : m_directoryCache) {
            std::sort(pair.second.begin(), pair.second.end(),
                [](const Entry& a, const Entry& b) {
                    // Directories first, then alphabetical by name
                    if (a.type != b.type)
                        return a.type == "dir";
                    return a.name < b.name;
                });
        }

        // Only mark as indexed and cache if the root path exists and is a directory
        bool pathExists = false;
        {
            std::error_code ec;
            pathExists = fs::exists(m_scanState->rootPath, ec) && fs::is_directory(m_scanState->rootPath, ec);
        }
        if (pathExists) {
            m_indexedRoots[m_scanState->rootPath] = true;
            // Ensure root directory is in the cache (even if empty)
            if (m_directoryCache.find(m_scanState->rootPath) == m_directoryCache.end()) {
                m_directoryCache[m_scanState->rootPath] = {};
            }
        }

        // Save final progress values
        m_lastScanned = m_scanState->scannedFiles;
        m_lastTotal = m_scanState->totalFiles;

        fprintf(stderr, "[reaper-ipad] SampleCache: indexed %s (%d files, %zu dirs)\n",
            m_scanState->rootPath.c_str(),
            m_scanState->totalFiles,
            m_scanState->allDirectories.size());

        m_scanState.reset();
        return true;
    }

    return false; // More batches remain
}

void SampleCache::CancelScan()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_scanState) {
        m_scanState->cancelled = true;
        m_scanState.reset();
    }
}

bool SampleCache::IsScanning() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_scanState != nullptr;
}

void SampleCache::GetScanProgress(int& scanned, int& total) const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_scanState) {
        scanned = m_scanState->scannedFiles;
        total = m_scanState->totalFiles;
    } else {
        // Return last known progress after scan completion
        scanned = m_lastScanned;
        total = m_lastTotal;
    }
}

// ── Query ──

SampleCache::DirectoryResult SampleCache::GetDirectory(const std::string& path) const
{
    std::lock_guard<std::mutex> lock(m_mutex);

    DirectoryResult result;
    result.path = path;

    auto it = m_directoryCache.find(path);
    if (it != m_directoryCache.end()) {
        result.entries = it->second;
    }

    return result;
}

bool SampleCache::HasCachedData(const std::string& path) const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_directoryCache.find(path) != m_directoryCache.end();
}

bool SampleCache::IsIndexed(const std::string& rootPath) const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_indexedRoots.find(rootPath);
    return it != m_indexedRoots.end() && it->second;
}

// ── Management ──

void SampleCache::ClearAll()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_directoryCache.clear();
    m_indexedRoots.clear();
    if (m_scanState) {
        m_scanState->cancelled = true;
        m_scanState.reset();
    }
}

void SampleCache::ClearRoot(const std::string& rootPath)
{
    std::lock_guard<std::mutex> lock(m_mutex);

    // Remove all cached directories under this root
    for (auto it = m_directoryCache.begin(); it != m_directoryCache.end(); ) {
        if (it->first.size() >= rootPath.size() &&
            it->first.compare(0, rootPath.size(), rootPath) == 0) {
            it = m_directoryCache.erase(it);
        } else {
            ++it;
        }
    }

    m_indexedRoots.erase(rootPath);
}

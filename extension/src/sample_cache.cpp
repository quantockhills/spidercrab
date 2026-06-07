#include "sample_cache.h"
#include <algorithm>
#include <cstring>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;

// Supported audio file extensions (Issue #107)
static const char* kAudioExtensions[] = {
    ".wav", ".mp3", ".flac", ".ogg", ".aiff", ".aif", ".m4a", ".wma"
};
static constexpr int kNumAudioExtensions = sizeof(kAudioExtensions) / sizeof(kAudioExtensions[0]);

// Batch size for progress reporting during scanning
static constexpr int kBatchSize = 100;

// ============================================================
// IsAudioExtension
// ============================================================
bool IsAudioExtension(const std::string& filename)
{
    // Find last dot
    auto dot = filename.find_last_of('.');
    if (dot == std::string::npos)
        return false;

    std::string ext;
    for (size_t i = dot; i < filename.size(); ++i)
        ext += static_cast<char>(std::tolower(static_cast<unsigned char>(filename[i])));

    for (int i = 0; i < kNumAudioExtensions; ++i) {
        if (ext == kAudioExtensions[i])
            return true;
    }
    return false;
}

// ============================================================
// SampleCache
// ============================================================

SampleCache::SampleCache()
{
}

SampleCache::~SampleCache()
{
    Clear();
}

bool SampleCache::IsAudioFile(const std::string& path)
{
    return IsAudioExtension(path);
}

void SampleCache::Clear()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_entries.clear();
    m_rootPath.clear();
    m_indexed = false;
    m_totalFiles.store(0);
}

bool SampleCache::BuildIndex(const std::string& rootPath,
    SampleCacheProgressCallback progressCallback)
{
    if (rootPath.empty())
        return false;

    // Verify root exists and is a directory
    std::error_code ec;
    if (!fs::exists(rootPath, ec) || !fs::is_directory(rootPath, ec))
        return false;

    // Clear existing data under lock
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_entries.clear();
        m_rootPath = rootPath;
        m_totalFiles.store(0);
        m_indexed = false;
    }

    // Progress variables
    std::atomic<int> scanned{0};
    int totalEstimate = 0;

    // Quick first pass to estimate total files (walk without collecting)
    // This gives us a progress denominator
    try {
        for (auto& entry : fs::recursive_directory_iterator(rootPath, ec)) {
            if (entry.is_regular_file(ec)) {
                std::string name = entry.path().filename().string();
                if (IsAudioExtension(name)) {
                    totalEstimate++;
                }
            }
            if (ec)
                ec.clear();
        }
    } catch (...) {
        // If recursive_directory_iterator fails, we still scan with estimated total
        totalEstimate = 0;
    }

    // Report initial progress
    if (progressCallback) {
        progressCallback(0, totalEstimate > 0 ? totalEstimate : 1, "scanning");
    }

    // Second pass: collect entries with batching
    scanDirectory(rootPath, progressCallback, scanned, &totalEstimate);

    // Mark indexed and store total file count
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_indexed = true;
        m_totalFiles.store(scanned.load());
    }

    // Final progress report
    if (progressCallback) {
        progressCallback(scanned.load(), totalEstimate, "complete");
    }

    return true;
}

bool SampleCache::Refresh(SampleCacheProgressCallback progressCallback)
{
    std::string root;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        root = m_rootPath;
    }

    if (root.empty())
        return false;

    return BuildIndex(root, progressCallback);
}

bool SampleCache::ReIndex(SampleCacheProgressCallback progressCallback)
{
    return Refresh(progressCallback);
}

void SampleCache::scanDirectory(const std::string& dirPath,
    SampleCacheProgressCallback& progressCallback,
    std::atomic<int>& scanned,
    int* totalEstimate)
{
    std::error_code ec;
    int batchCount = 0;

    try {
        for (auto& entry : fs::recursive_directory_iterator(dirPath, ec)) {
            if (entry.is_regular_file(ec)) {
                std::string name = entry.path().filename().string();
                if (IsAudioExtension(name)) {
                    CachedDirEntry cachedEntry;
                    cachedEntry.name = entry.path().string(); // full path
                    cachedEntry.type = "file";
                    cachedEntry.size = entry.file_size(ec);
                    if (ec) {
                        cachedEntry.size = 0;
                        ec.clear();
                    }

                    // Add under lock
                    {
                        std::lock_guard<std::mutex> lock(m_mutex);
                        m_entries.push_back(cachedEntry);
                    }

                    scanned++;
                    batchCount++;

                    // Update total estimate if we underestimated
                    if (totalEstimate && scanned > *totalEstimate) {
                        *totalEstimate = scanned.load();
                    }

                    // Report progress in batches
                    if (batchCount >= kBatchSize && progressCallback) {
                        int total = totalEstimate ? *totalEstimate : scanned.load();
                        progressCallback(scanned.load(), total, "scanning");
                        batchCount = 0;
                    }
                }
            }
            if (ec)
                ec.clear();
        }
    } catch (const fs::filesystem_error&) {
        // Partial scan — we still have whatever we collected
    }

    // Flush remaining batch
    if (batchCount > 0 && progressCallback) {
        int total = totalEstimate ? *totalEstimate : scanned.load();
        progressCallback(scanned.load(), total, "scanning");
    }
}

std::vector<CachedDirEntry> SampleCache::GetDirectory(const std::string& path,
    int offset, int limit) const
{
    std::lock_guard<std::mutex> lock(m_mutex);

    if (!m_indexed || m_entries.empty()) {
        return {};
    }

    // Normalize the requested path
    std::string normPath = path;
    if (!normPath.empty() && normPath.back() != '/' && normPath.back() != '\\') {
        normPath += '/';
    }

    // If path is empty or ".." (meaning root), return root-level entries
    std::vector<CachedDirEntry> result;

    // If requesting root, collect unique subdirectories + top-level audio files
    if (path.empty() || path == "/" || path == "..") {
        // Collect unique immediate subdirectories
        std::vector<std::string> dirs;
        std::vector<CachedDirEntry> filesHere;

        // If we have a root path, use it as a prefix to resolve relative entries
        std::string prefix = m_rootPath;
        if (!prefix.empty() && prefix.back() != '/')
            prefix += '/';

        for (const auto& entry : m_entries) {
            // Compute relative path
            std::string relPath;
            if (!prefix.empty() && entry.name.find(prefix) == 0) {
                relPath = entry.name.substr(prefix.size());
            } else {
                relPath = entry.name;
            }

            // Find the first path component
            size_t slashPos = relPath.find('/');
            if (slashPos == std::string::npos) {
                // File at root level
                filesHere.push_back(entry);
            } else {
                // Directory component at root level
                std::string dirName = relPath.substr(0, slashPos);
                if (std::find(dirs.begin(), dirs.end(), dirName) == dirs.end()) {
                    dirs.push_back(dirName);
                }
            }
        }

        // Add directories first
        for (const auto& d : dirs) {
            CachedDirEntry dirEntry;
            dirEntry.name = d;
            dirEntry.type = "dir";
            dirEntry.size = 0;
            result.push_back(dirEntry);
        }

        // Add files
        for (const auto& f : filesHere) {
            result.push_back(f);
        }
    } else {
        // Path-based lookup: filter entries by the given directory prefix
        std::string prefix = m_rootPath;
        if (!prefix.empty() && prefix.back() != '/')
            prefix += '/';

        // The lookup key based on normalized path
        std::string lookupPrefix;
        if (!prefix.empty()) {
            lookupPrefix = prefix + normPath;
        } else {
            lookupPrefix = normPath;
        }

        // Collect unique subdirectories + files for this path
        std::vector<std::string> dirs;
        std::vector<CachedDirEntry> filesHere;

        for (const auto& entry : m_entries) {
            std::string relPath;
            if (!prefix.empty() && entry.name.find(prefix) == 0) {
                relPath = entry.name.substr(prefix.size());
            } else {
                relPath = entry.name;
            }

            // Check if this entry starts with our lookup path
            if (relPath.find(normPath) != 0)
                continue;

            // Get the part after the lookup path
            std::string remainder = relPath.substr(normPath.size());

            // Skip if empty (exact match = the dir itself)
            if (remainder.empty())
                continue;

            // Find the next component separator
            size_t slashPos = remainder.find('/');
            if (slashPos == std::string::npos) {
                // It's a file directly in this directory
                filesHere.push_back(entry);
            } else {
                // It's in a subdirectory
                std::string subDir = remainder.substr(0, slashPos);
                if (std::find(dirs.begin(), dirs.end(), subDir) == dirs.end()) {
                    CachedDirEntry dirEntry;
                    dirEntry.name = subDir;
                    dirEntry.type = "dir";
                    dirEntry.size = 0;
                    dirs.push_back(subDir);
                    result.push_back(dirEntry);
                }
            }
        }

        // Add files
        for (const auto& f : filesHere) {
            result.push_back(f);
        }
    }

    // Apply pagination
    if (offset > 0 && offset < (int)result.size()) {
        result.erase(result.begin(), result.begin() + offset);
    }
    if (limit > 0 && (int)result.size() > limit) {
        result.resize(limit);
    }

    return result;
}

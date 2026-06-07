#pragma once
#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

// Forward declaration of filesystem entry for cached directory listing
struct CachedDirEntry {
    std::string name;
    std::string type; // "dir" or "file"
    uintmax_t   size  = 0;
};

// Progress callback signature: scanned count, total estimate, status message
using SampleCacheProgressCallback =
    std::function<void(int scanned, int total, const std::string& status)>;

// SampleCache — parallel to FxChainCache
//
// Walks directories recursively, caches audio file listings, and provides
// thread-safe access. Designed for background scanning at startup and on-demand
// refresh, with progress events emitted to connected WebSocket clients.
//
// Supported audio extensions: .wav, .mp3, .flac, .ogg, .aiff, .aif, .m4a, .wma
class SampleCache {
public:
    SampleCache();
    ~SampleCache();

    // NOT copyable or movable
    SampleCache(const SampleCache&) = delete;
    SampleCache& operator=(const SampleCache&) = delete;

    // Build the index for the given root path.
    // Scans the directory recursively, collecting audio files.
    // progressCallback is called periodically with current progress.
    // Returns true on success, false on error.
    bool BuildIndex(const std::string& rootPath,
        SampleCacheProgressCallback progressCallback = nullptr);

    // Refresh the entire index (re-build from last root path)
    bool Refresh(SampleCacheProgressCallback progressCallback = nullptr);

    // Clear all cached data
    void Clear();

    // Re-index same root path (same as Refresh)
    bool ReIndex(SampleCacheProgressCallback progressCallback = nullptr);

    // Get cached directory listing for a given path.
    // If path is empty, returns the root listing.
    // offset and limit enable pagination (both 0 or negative = no pagination).
    // Returns a copy for thread safety.
    std::vector<CachedDirEntry> GetDirectory(const std::string& path = "",
        int offset = 0, int limit = 0) const;

    // Check if index is populated
    bool IsIndexed() const { return m_indexed; }

    // Get total file count
    int GetTotalFiles() const { return m_totalFiles.load(); }

    // Get root path
    std::string GetRootPath() const { return std::string(m_rootPath); }

    // Check if a path is an audio file
    static bool IsAudioFile(const std::string& path);

private:
    // Recursive scan implementation (called under lock)
    void scanDirectory(const std::string& dirPath,
        SampleCacheProgressCallback& progressCallback,
        std::atomic<int>& scanned,
        int* totalEstimate);

    // Add a single file entry (called under lock)
    void addEntry(const CachedDirEntry& entry);

    // Mutable mutex for const access
    mutable std::mutex m_mutex;

    // Cached entries — flat list of all audio files found
    // (directories are not included individually; they're implicit
    // from the path prefix of file entries)
    std::vector<CachedDirEntry> m_entries;

    // Root path that was indexed
    std::string m_rootPath;

    // Whether the index has been built
    bool m_indexed = false;

    // Total file count (atomic for lock-free reads)
    std::atomic<int> m_totalFiles{0};
};

// Check if a filename has a supported audio extension
bool IsAudioExtension(const std::string& filename);

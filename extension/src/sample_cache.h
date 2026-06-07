#pragma once

#include <functional>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

/**
 * SampleCache — In-memory index of all audio sample files across
 * configured root paths. Built incrementally across multiple Run()
 * cycles (batch-based, ~100 files per cycle) to avoid blocking.
 *
 * Per-root-path caching. Thread-safe for concurrent read/write.
 * Falls back to live filesystem on cache miss.
 */
class SampleCache {
public:
    SampleCache() = default;
    ~SampleCache() = default;

    using ProgressCallback = std::function<void(int scanned, int total)>;

    /// A single indexed entry (file or directory).
    struct Entry {
        std::string name; // Filename or directory name
        std::string type; // "file" or "dir"
        uintmax_t   size = 0; // File size in bytes (0 for directories)
    };

    /// Directory listing result.
    struct DirectoryResult {
        std::vector<Entry> entries;
        std::string path;
    };

    // ── Scanning ──

    /// Start a background scan of rootPath. Immediately calls progressCb
    /// with the total file count (first phase is counting).
    /// Safe to call while a scan is in progress — cancels the current scan.
    void BeginScan(const std::string& rootPath, ProgressCallback progressCb);

    /// Process the next batch (~100 files) of the current scan.
    /// @return true if the scan is complete, false if more batches remain.
    bool ScanNextBatch();

    /// Cancel the current scan, if any.
    void CancelScan();

    /// Check if a scan is currently in progress.
    bool IsScanning() const;

    /// Get scan progress (scanned, total).
    void GetScanProgress(int& scanned, int& total) const;

    // ── Query ──

    /// Get cached directory listing for a path.
    /// If the path is cached (and its root is fully indexed), returns entries.
    /// Otherwise returns an empty result with the original path.
    DirectoryResult GetDirectory(const std::string& path) const;

    /// Check if a specific subdirectory path has been cached.
    bool HasCachedData(const std::string& path) const;

    /// Check if a root path has been fully indexed.
    bool IsIndexed(const std::string& rootPath) const;

    // ── Management ──

    /// Clear all cached data for all roots.
    void ClearAll();

    /// Clear cached data for a specific root path.
    void ClearRoot(const std::string& rootPath);

private:
    mutable std::mutex m_mutex;

    /// Per-directory cache: full directory path -> vector of entries
    std::unordered_map<std::string, std::vector<Entry>> m_directoryCache;

    /// Tracks which root paths have been fully indexed.
    std::unordered_map<std::string, bool> m_indexedRoots;

    /// Scan state for incremental scanning.
    struct ScanState {
        std::string rootPath;
        int totalFiles = 0;
        int scannedFiles = 0;
        bool counting = true; // Phase 1: counting files? or Phase 2: indexing?
        ProgressCallback progressCb;
        std::vector<std::string> allFiles; // Full paths of all audio files to index
        std::vector<std::string> allDirectories; // All subdirectory paths relative to root
        size_t currentFileIdx = 0; // Index into allFiles for batch processing
        size_t currentDirIdx = 0; // Index into allDirectories for batch processing
        bool cancelled = false;
    };

    std::unique_ptr<ScanState> m_scanState;

    /// Supported audio file extensions (lowercase, with dot).
    static bool IsAudioExtension(const std::string& ext);
};

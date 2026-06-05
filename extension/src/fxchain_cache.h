#pragma once

#include <mutex>
#include <string>
#include <vector>

/**
 * FxChainCache — In-memory index of all .RfxChain files in a directory tree.
 *
 * Built once at startup, searched without filesystem IO.
 * Supports pagination (offset/limit).
 * Thread-safe for concurrent read/write.
 */
class FxChainCache {
public:
    FxChainCache() = default;
    ~FxChainCache() = default;

    /// A single indexed chain entry.
    struct Entry {
        std::string filePath; // Full absolute path
        std::string name;     // Filename including .RfxChain extension
        uintmax_t   size = 0; // File size in bytes
    };

    /// Search result — subset of entries with total count for pagination.
    struct SearchResult {
        std::vector<Entry> results;
        int total = 0; // Total matching entries (before pagination)
    };

    /// Build/reload the cache by walking rootPath recursively.
    /// Returns the number of .RfxChain files indexed.
    /// Throws nothing on error — non-existent paths yield 0 entries.
    int BuildIndex(const std::string& rootPath);

    /// Search the cached index by case-insensitive substring match against
    /// both filename and relative path. If query is empty, returns all entries.
    /// @param query     Substring to match (case-insensitive, empty = match all)
    /// @param offset    Number of results to skip (for pagination)
    /// @param limit     Maximum results to return (0 = unlimited)
    SearchResult Search(const std::string& query, int offset, int limit) const;

    /// Get total number of cached entries.
    int Count() const;

    /// Get the currently indexed root path.
    std::string RootPath() const;

    /// Check if cache has been built (even if empty).
    bool IsIndexed() const;

    /// Clear the cache.
    void Clear();

private:
    mutable std::mutex m_mutex;
    std::vector<Entry> m_entries;
    std::string        m_rootPath;
    bool               m_isIndexed = false;
};

#pragma once

#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

/**
 * FxTagStorage manages user-defined tags for FX (by identifier) and
 * FX chains (by file path). Tags persist as two JSON files.
 *
 * Thread-safe: all public methods lock an internal mutex.
 *
 * Uses unique_ptr for mutex to allow default move assignment.
 */
class FxTagStorage {
public:
    /// Construct with a config directory where tag files will be stored.
    /// If configDir is empty, defaults to "." (current working directory).
    explicit FxTagStorage(const std::string& configDir = "");

    /// Default destructor
    ~FxTagStorage() = default;

    /// Move constructor
    FxTagStorage(FxTagStorage&& other) noexcept;

    /// Move assignment
    FxTagStorage& operator=(FxTagStorage&& other) noexcept;

    /// Load tag data from disk. Throws nothing on error — missing/corrupt
    /// files are silently reset to empty state. Call once at startup.
    void Load();

    /// Save tag data to disk. Throws std::runtime_error on I/O failure.
    void Save();

    // ── FX tags ──

    /// Get all tags for a given FX identifier. Returns empty vector if none.
    std::vector<std::string> GetFxTags(const std::string& ident) const;

    /// Set tags for a given FX identifier. Pass empty vector to clear.
    void SetFxTags(const std::string& ident, const std::vector<std::string>& tags);

    /// Get all FX tag entries. Key = FX ident, value = sorted tag list.
    std::map<std::string, std::vector<std::string>> GetAllFxTags() const;

    // ── Chain tags ──

    /// Get all tags for a given chain file path. Returns empty vector if none.
    std::vector<std::string> GetChainTags(const std::string& filePath) const;

    /// Set tags for a given chain file path. Pass empty vector to clear.
    void SetChainTags(const std::string& filePath, const std::vector<std::string>& tags);

    /// Get all chain tag entries. Key = file path, value = sorted tag list.
    std::map<std::string, std::vector<std::string>> GetAllChainTags() const;

    // ── Convenience ──

    /// Get all tags (both FX and chain) as a single JSON object string.
    /// Returns: {"fxTags":{...}, "chainTags":{...}}
    std::string GetAllTagsJson() const;

    /// Get the config directory path.
    std::string GetConfigDir() const { return m_configDir; }

private:
    std::string m_configDir;
    mutable std::unique_ptr<std::mutex> m_mutex;

    // Internal data maps (tag lists are kept sorted for deterministic output)
    std::map<std::string, std::vector<std::string>> m_fxTags;
    std::map<std::string, std::vector<std::string>> m_chainTags;

    // JSON file paths
    std::string m_fxTagsFile;
    std::string m_chainTagsFile;

    /// Serialize internal state to JSON string
    std::string Serialize() const;

    /// Deserialize JSON string into internal state. Returns true on success.
    bool Deserialize(const std::string& json);

    /// Sort a vector of strings in-place
    static void SortTags(std::vector<std::string>& tags);
};

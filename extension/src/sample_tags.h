#pragma once

#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

/**
 * SampleTagStorage manages user-defined tags for audio sample files,
 * keyed by full file path. Tags persist to sample_tags.json.
 *
 * Thread-safe: all public methods lock an internal mutex.
 */
class SampleTagStorage {
public:
    explicit SampleTagStorage(const std::string& configDir = "");
    ~SampleTagStorage() = default;
    SampleTagStorage(SampleTagStorage&&) noexcept;
    SampleTagStorage& operator=(SampleTagStorage&&) noexcept;

    void Load();
    void Save();

    std::vector<std::string> GetTags(const std::string& filePath) const;
    void SetTags(const std::string& filePath, const std::vector<std::string>& tags);
    std::map<std::string, std::vector<std::string>> GetAllTags() const;
    std::string GetAllTagsJson() const;

private:
    std::string m_configDir;
    std::string m_tagsFile;
    mutable std::unique_ptr<std::mutex> m_mutex;
    std::map<std::string, std::vector<std::string>> m_tags;
    static void SortTags(std::vector<std::string>& tags);
};

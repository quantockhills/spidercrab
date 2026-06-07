#include "fxchain_cache.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <string>

namespace fs = std::filesystem;

// Lowercase helper for case-insensitive comparison
static std::string toLower(const std::string& s)
{
    std::string out;
    out.reserve(s.size());
    for (char c : s)
        out += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return out;
}

int FxChainCache::BuildIndex(const std::string& rootPath)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_entries.clear();
    m_rootPath = rootPath;
    m_isIndexed = true;

    if (rootPath.empty())
        return 0;

    try {
        for (const auto& entry : fs::recursive_directory_iterator(rootPath)) {
            if (!entry.is_regular_file())
                continue;

            std::string name = entry.path().filename().string();
            // Check extension case-insensitively
            std::string ext;
            size_t dotPos = name.rfind('.');
            if (dotPos == std::string::npos)
                continue;
            ext = name.substr(dotPos);
            if (toLower(ext) != ".rfxchain")
                continue;

            Entry e;
            e.filePath = entry.path().string();
            e.name     = name;
            e.size     = 0;

            std::error_code ec;
            auto fsize = fs::file_size(entry.path(), ec);
            if (!ec)
                e.size = fsize;

            m_entries.push_back(std::move(e));
        }

        // Sort by filePath for deterministic ordering
        std::sort(m_entries.begin(), m_entries.end(),
            [](const Entry& a, const Entry& b) {
                return a.filePath < b.filePath;
            });
    } catch (const fs::filesystem_error&) {
        // Non-existent rootPath returns 0 entries (graceful degradation)
        return 0;
    }

    return static_cast<int>(m_entries.size());
}

FxChainCache::SearchResult FxChainCache::Search(
    const std::string& query, int offset, int limit) const
{
    std::lock_guard<std::mutex> lock(m_mutex);

    SearchResult result;

    if (!m_isIndexed || m_rootPath.empty()) {
        result.total = 0;
        return result;
    }

    std::string lowerQuery = toLower(query);

    // Collect all matching entries (filename-only, case-insensitive)
    std::vector<const Entry*> matches;
    for (const auto& e : m_entries) {
        std::string lowerName = toLower(e.name);
        bool matched = query.empty() || lowerName.find(lowerQuery) != std::string::npos;
        if (matched) {
            matches.push_back(&e);
        }
    }

    result.total = static_cast<int>(matches.size());

    // Apply offset/limit
    if (offset < 0) offset = 0;
    if (limit <= 0) limit = static_cast<int>(matches.size());

    int end = offset + limit;
    if (end > static_cast<int>(matches.size()))
        end = static_cast<int>(matches.size());

    for (int i = offset; i < end; i++) {
        const Entry* src = matches[i];
        Entry dst;
        dst.filePath = src->filePath;
        dst.name     = src->name;
        dst.size     = src->size;
        result.results.push_back(std::move(dst));
    }

    return result;
}

int FxChainCache::Count() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return static_cast<int>(m_entries.size());
}

std::string FxChainCache::RootPath() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_rootPath;
}

bool FxChainCache::IsIndexed() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_isIndexed;
}

void FxChainCache::Clear()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_entries.clear();
    m_rootPath.clear();
    m_isIndexed = false;
}

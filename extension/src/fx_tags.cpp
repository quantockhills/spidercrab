#include "fx_tags.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace fs = std::filesystem;

// ── JSON escape/helpers (minimal, no dependencies) ──

static std::string fx_json_escape(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 2);
    for (char c : s) {
        switch (c) {
        case '"':  out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b";  break;
        case '\f': out += "\\f";  break;
        case '\n': out += "\\n";  break;
        case '\r': out += "\\r";  break;
        case '\t': out += "\\t";  break;
        default:
            if ((unsigned char)c < 0x20) {
                char buf[8];
                snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
                out += buf;
            } else {
                out += c;
            }
        }
    }
    return out;
}

static std::string fx_json_string(const std::string& s)
{
    return "\"" + fx_json_escape(s) + "\"";
}

// ── Minimal JSON parser for our tag format ──
// Only handles the subset: { "key": "val", "key2": ["a","b"] }
struct TagJsonParser {
    const std::string& s;
    size_t pos = 0;

    TagJsonParser(const std::string& str) : s(str) {}

    void skipWs() {
        while (pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\n' || s[pos] == '\r'))
            pos++;
    }

    char peek() { skipWs(); return pos < s.size() ? s[pos] : 0; }
    char next() { skipWs(); return pos < s.size() ? s[pos++] : 0; }

    std::string parseString() {
        if (next() != '"') return "";
        std::string result;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\') {
                pos++;
                if (pos >= s.size()) break;
                switch (s[pos]) {
                case '"': result += '"'; break;
                case '\\': result += '\\'; break;
                case 'n': result += '\n'; break;
                case 'r': result += '\r'; break;
                case 't': result += '\t'; break;
                default: result += s[pos]; break;
                }
                pos++;
            } else {
                result += s[pos++];
            }
        }
        if (pos < s.size()) pos++;
        return result;
    }

    // Parse a JSON array of strings: ["a","b"]
    std::vector<std::string> parseStringArray() {
        std::vector<std::string> result;
        if (next() != '[') return result;
        if (peek() == ']') { next(); return result; }
        while (true) {
            std::string val = parseString();
            if (!val.empty() || (peek() == '"')) {
                // parseString handled the quotes; if val was empty quoted string, re-parse
                if (val.empty() && peek() == '"') val = parseString();
                result.push_back(val);
            }
            if (peek() == ']') { next(); return result; }
            if (peek() == ',') next();
        }
    }

    // Parse entire tag JSON structure
    bool parseInto(std::map<std::string, std::vector<std::string>>& fxTags,
                   std::map<std::string, std::vector<std::string>>& chainTags) {
        if (next() != '{') return false;

        while (peek() != '}' && pos < s.size()) {
            std::string key = parseString();
            if (key.empty()) break;
            if (next() != ':') break;

            if (key == "fxTags") {
                if (peek() != '{') { break; }
                next(); // skip {
                while (peek() != '}' && pos < s.size()) {
                    std::string ident = parseString();
                    if (ident.empty()) break;
                    if (next() != ':') break;
                    auto arr = parseStringArray();
                    if (!arr.empty() || peek() == ']') {
                        // SetFxTags with empty array means clear
                        std::sort(arr.begin(), arr.end());
                        fxTags[ident] = arr;
                    }
                    if (peek() == ',') next();
                }
                if (peek() == '}') next();
                if (peek() == ',') next();
            } else if (key == "chainTags") {
                if (peek() != '{') { break; }
                next(); // skip {
                while (peek() != '}' && pos < s.size()) {
                    std::string filePath = parseString();
                    if (filePath.empty()) break;
                    if (next() != ':') break;
                    auto arr = parseStringArray();
                    if (!arr.empty() || peek() == ']') {
                        std::sort(arr.begin(), arr.end());
                        chainTags[filePath] = arr;
                    }
                    if (peek() == ',') next();
                }
                if (peek() == '}') next();
                if (peek() == ',') next();
            } else {
                // Unknown key — skip value
                if (peek() == '{') {
                    int depth = 1;
                    next();
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '{') depth++;
                        if (s[pos] == '}') depth--;
                        pos++;
                    }
                } else if (peek() == '[') {
                    int depth = 1;
                    next();
                    while (depth > 0 && pos < s.size()) {
                        if (s[pos] == '[') depth++;
                        if (s[pos] == ']') depth--;
                        pos++;
                    }
                } else {
                    parseString();
                }
                if (peek() == ',') next();
            }
        }
        return true;
    }
};

// ── FxTagStorage implementation ──

FxTagStorage::FxTagStorage(const std::string& configDir)
    : m_configDir(configDir)
    , m_mutex(std::make_unique<std::mutex>())
{
    if (m_configDir.empty()) {
        m_configDir = ".";
    }
    // Ensure trailing slash
    if (m_configDir.back() != '/') {
        m_configDir += '/';
    }
    m_fxTagsFile = m_configDir + "fx_tags.json";
    m_chainTagsFile = m_configDir + "fxchain_tags.json";
}

FxTagStorage::FxTagStorage(FxTagStorage&& other) noexcept
    : m_configDir(std::move(other.m_configDir))
    , m_mutex(std::make_unique<std::mutex>())
    , m_fxTags(std::move(other.m_fxTags))
    , m_chainTags(std::move(other.m_chainTags))
    , m_fxTagsFile(std::move(other.m_fxTagsFile))
    , m_chainTagsFile(std::move(other.m_chainTagsFile))
{
}

FxTagStorage& FxTagStorage::operator=(FxTagStorage&& other) noexcept
{
    if (this != &other) {
        m_configDir = std::move(other.m_configDir);
        m_mutex = std::make_unique<std::mutex>();
        m_fxTags = std::move(other.m_fxTags);
        m_chainTags = std::move(other.m_chainTags);
        m_fxTagsFile = std::move(other.m_fxTagsFile);
        m_chainTagsFile = std::move(other.m_chainTagsFile);
    }
    return *this;
}

void FxTagStorage::Load()
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    m_fxTags.clear();
    m_chainTags.clear();

    // Try to load fx_tags.json
    std::string fxContent;
    {
        std::ifstream file(m_fxTagsFile);
        if (file.is_open()) {
            std::stringstream ss;
            ss << file.rdbuf();
            fxContent = ss.str();
        }
    }

    if (!fxContent.empty()) {
        TagJsonParser parser(fxContent);
        // The fx tags file could just be { "fxTags": {...} } or the full structure
        // We try parsing the full structure, then extract fxTags
        std::map<std::string, std::vector<std::string>> parsedFx, parsedChain;
        TagJsonParser fullParser(fxContent);
        if (fullParser.parseInto(parsedFx, parsedChain)) {
            m_fxTags = parsedFx;
        }
    }

    // Try to load fxchain_tags.json
    std::string chainContent;
    {
        std::ifstream file(m_chainTagsFile);
        if (file.is_open()) {
            std::stringstream ss;
            ss << file.rdbuf();
            chainContent = ss.str();
        }
    }

    if (!chainContent.empty()) {
        std::map<std::string, std::vector<std::string>> parsedFx, parsedChain;
        TagJsonParser chainParser(chainContent);
        if (chainParser.parseInto(parsedFx, parsedChain)) {
            m_chainTags = parsedChain;
        }
    }
}

void FxTagStorage::Save()
{
    std::lock_guard<std::mutex> lock(*m_mutex);

    // Ensure config directory exists
    try {
        if (!fs::exists(m_configDir)) {
            fs::create_directories(m_configDir);
        }
    } catch (const fs::filesystem_error& e) {
        throw std::runtime_error("Cannot create config directory: " + std::string(e.what()));
    }

    // Save fx_tags.json
    {
        std::string content = "{";
        content += "\"fxTags\":{";
        bool first = true;
        for (const auto& [ident, tags] : m_fxTags) {
            if (!first) content += ",";
            first = false;
            content += fx_json_string(ident) + ":[";
            for (size_t i = 0; i < tags.size(); i++) {
                if (i > 0) content += ",";
                content += fx_json_string(tags[i]);
            }
            content += "]";
        }
        content += "}}";

        std::ofstream file(m_fxTagsFile);
        if (!file.is_open()) {
            throw std::runtime_error("Cannot write: " + m_fxTagsFile);
        }
        file << content;
    }

    // Save fxchain_tags.json
    {
        std::string content = "{";
        content += "\"chainTags\":{";
        bool first = true;
        for (const auto& [filePath, tags] : m_chainTags) {
            if (!first) content += ",";
            first = false;
            content += fx_json_string(filePath) + ":[";
            for (size_t i = 0; i < tags.size(); i++) {
                if (i > 0) content += ",";
                content += fx_json_string(tags[i]);
            }
            content += "]";
        }
        content += "}}";

        std::ofstream file(m_chainTagsFile);
        if (!file.is_open()) {
            throw std::runtime_error("Cannot write: " + m_chainTagsFile);
        }
        file << content;
    }
}

std::vector<std::string> FxTagStorage::GetFxTags(const std::string& ident) const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    auto it = m_fxTags.find(ident);
    if (it != m_fxTags.end()) {
        return it->second;
    }
    return {};
}

void FxTagStorage::SetFxTags(const std::string& ident, const std::vector<std::string>& tags)
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    if (tags.empty()) {
        m_fxTags.erase(ident);
    } else {
        auto sorted = tags;
        SortTags(sorted);
        m_fxTags[ident] = std::move(sorted);
    }
}

std::map<std::string, std::vector<std::string>> FxTagStorage::GetAllFxTags() const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    return m_fxTags;
}

std::vector<std::string> FxTagStorage::GetChainTags(const std::string& filePath) const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    auto it = m_chainTags.find(filePath);
    if (it != m_chainTags.end()) {
        return it->second;
    }
    return {};
}

void FxTagStorage::SetChainTags(const std::string& filePath, const std::vector<std::string>& tags)
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    if (tags.empty()) {
        m_chainTags.erase(filePath);
    } else {
        auto sorted = tags;
        SortTags(sorted);
        m_chainTags[filePath] = std::move(sorted);
    }
}

std::map<std::string, std::vector<std::string>> FxTagStorage::GetAllChainTags() const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    return m_chainTags;
}

std::string FxTagStorage::GetAllTagsJson() const
{
    std::lock_guard<std::mutex> lock(*m_mutex);

    std::string result = "{";

    // fxTags
    result += "\"fxTags\":{";
    {
        bool first = true;
        for (const auto& [ident, tags] : m_fxTags) {
            if (!first) result += ",";
            first = false;
            result += fx_json_string(ident) + ":[";
            for (size_t i = 0; i < tags.size(); i++) {
                if (i > 0) result += ",";
                result += fx_json_string(tags[i]);
            }
            result += "]";
        }
    }
    result += "},";

    // chainTags
    result += "\"chainTags\":{";
    {
        bool first = true;
        for (const auto& [filePath, tags] : m_chainTags) {
            if (!first) result += ",";
            first = false;
            result += fx_json_string(filePath) + ":[";
            for (size_t i = 0; i < tags.size(); i++) {
                if (i > 0) result += ",";
                result += fx_json_string(tags[i]);
            }
            result += "]";
        }
    }
    result += "}";

    result += "}";
    return result;
}

void FxTagStorage::SortTags(std::vector<std::string>& tags)
{
    std::sort(tags.begin(), tags.end());
}

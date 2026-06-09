#include "sample_tags.h"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

static std::string st_json_escape(const std::string& s)
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

static std::string st_json_string(const std::string& s)
{
    return "\"" + st_json_escape(s) + "\"";
}

// Minimal parser for {"sampleTags":{"path":["tag1","tag2"],...}}
struct SampleTagParser {
    const std::string& s;
    size_t pos = 0;

    SampleTagParser(const std::string& str) : s(str) {}

    void skipWs() {
        while (pos < s.size() && (s[pos]==' '||s[pos]=='\t'||s[pos]=='\n'||s[pos]=='\r')) pos++;
    }
    char peek() { skipWs(); return pos < s.size() ? s[pos] : 0; }
    char next() { skipWs(); return pos < s.size() ? s[pos++] : 0; }

    std::string parseString() {
        if (next() != '"') return "";
        std::string r;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\') {
                pos++;
                if (pos >= s.size()) break;
                switch (s[pos]) {
                case '"':  r += '"';  break;
                case '\\': r += '\\'; break;
                case 'n':  r += '\n'; break;
                case 'r':  r += '\r'; break;
                case 't':  r += '\t'; break;
                default:   r += s[pos]; break;
                }
                pos++;
            } else {
                r += s[pos++];
            }
        }
        if (pos < s.size()) pos++;
        return r;
    }

    std::vector<std::string> parseStringArray() {
        std::vector<std::string> r;
        if (next() != '[') return r;
        if (peek() == ']') { next(); return r; }
        while (true) {
            std::string v = parseString();
            r.push_back(v);
            if (peek() == ']') { next(); return r; }
            if (peek() == ',') next();
        }
    }

    bool parseInto(std::map<std::string, std::vector<std::string>>& out) {
        if (next() != '{') return false;
        while (peek() != '}' && pos < s.size()) {
            std::string key = parseString();
            if (next() != ':') break;
            if (key == "sampleTags") {
                if (peek() != '{') break;
                next();
                while (peek() != '}' && pos < s.size()) {
                    std::string path = parseString();
                    if (next() != ':') break;
                    auto arr = parseStringArray();
                    std::sort(arr.begin(), arr.end());
                    out[path] = arr;
                    if (peek() == ',') next();
                }
                if (peek() == '}') next();
                if (peek() == ',') next();
            } else {
                // skip unknown value
                if (peek() == '{') {
                    int d = 1; next();
                    while (d > 0 && pos < s.size()) {
                        if (s[pos]=='{') d++; if (s[pos]=='}') d--; pos++;
                    }
                } else if (peek() == '[') {
                    int d = 1; next();
                    while (d > 0 && pos < s.size()) {
                        if (s[pos]=='[') d++; if (s[pos]==']') d--; pos++;
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

// ── SampleTagStorage ──

SampleTagStorage::SampleTagStorage(const std::string& configDir)
    : m_configDir(configDir)
    , m_mutex(std::make_unique<std::mutex>())
{
    if (m_configDir.empty()) m_configDir = ".";
    if (m_configDir.back() != '/' && m_configDir.back() != '\\')
        m_configDir += '/';
    m_tagsFile = m_configDir + "sample_tags.json";
}

SampleTagStorage::SampleTagStorage(SampleTagStorage&& o) noexcept
    : m_configDir(std::move(o.m_configDir))
    , m_tagsFile(std::move(o.m_tagsFile))
    , m_mutex(std::make_unique<std::mutex>())
    , m_tags(std::move(o.m_tags))
{}

SampleTagStorage& SampleTagStorage::operator=(SampleTagStorage&& o) noexcept
{
    if (this != &o) {
        m_configDir = std::move(o.m_configDir);
        m_tagsFile  = std::move(o.m_tagsFile);
        m_mutex     = std::make_unique<std::mutex>();
        m_tags      = std::move(o.m_tags);
    }
    return *this;
}

void SampleTagStorage::Load()
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    m_tags.clear();
    std::ifstream f(m_tagsFile);
    if (!f.is_open()) return;
    std::stringstream ss;
    ss << f.rdbuf();
    std::string content = ss.str();
    if (content.empty()) return;
    SampleTagParser parser(content);
    parser.parseInto(m_tags);
}

void SampleTagStorage::Save()
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    try {
        if (!fs::exists(m_configDir))
            fs::create_directories(m_configDir);
    } catch (const fs::filesystem_error& e) {
        throw std::runtime_error("Cannot create config dir: " + std::string(e.what()));
    }

    std::string content = "{\"sampleTags\":{";
    bool first = true;
    for (const auto& [path, tags] : m_tags) {
        if (!first) content += ",";
        first = false;
        content += st_json_string(path) + ":[";
        for (size_t i = 0; i < tags.size(); i++) {
            if (i > 0) content += ",";
            content += st_json_string(tags[i]);
        }
        content += "]";
    }
    content += "}}";

    std::ofstream f(m_tagsFile);
    if (!f.is_open())
        throw std::runtime_error("Cannot write: " + m_tagsFile);
    f << content;
}

std::vector<std::string> SampleTagStorage::GetTags(const std::string& filePath) const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    auto it = m_tags.find(filePath);
    return it != m_tags.end() ? it->second : std::vector<std::string>{};
}

void SampleTagStorage::SetTags(const std::string& filePath, const std::vector<std::string>& tags)
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    if (tags.empty()) {
        m_tags.erase(filePath);
    } else {
        auto sorted = tags;
        SortTags(sorted);
        m_tags[filePath] = std::move(sorted);
    }
}

std::map<std::string, std::vector<std::string>> SampleTagStorage::GetAllTags() const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    return m_tags;
}

std::string SampleTagStorage::GetAllTagsJson() const
{
    std::lock_guard<std::mutex> lock(*m_mutex);
    std::string r = "{\"sampleTags\":{";
    bool first = true;
    for (const auto& [path, tags] : m_tags) {
        if (!first) r += ",";
        first = false;
        r += st_json_string(path) + ":[";
        for (size_t i = 0; i < tags.size(); i++) {
            if (i > 0) r += ",";
            r += st_json_string(tags[i]);
        }
        r += "]";
    }
    r += "}}";
    return r;
}

void SampleTagStorage::SortTags(std::vector<std::string>& tags)
{
    std::sort(tags.begin(), tags.end());
}

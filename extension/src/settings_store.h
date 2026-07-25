#pragma once

#include <string>
#include <vector>
#include <mutex>
#include <cstdio>

// Global, cross-project settings persisted to <configDir>/settings.json.
// Currently holds the FX-chains folder path and the sample-browser root
// folders — settings that should be the same for every REAPER project and
// every connected device, so they live on the PC (not in the RPP, not only
// in the iPad's browser).
//
// Header-only + self-contained (tiny hand-rolled JSON) to avoid pulling in
// the command-handler helpers or adding a translation unit to the build.
class SettingsStore {
public:
    void SetConfigDir(const std::string& dir)
    {
        m_file = dir;
        if (!m_file.empty() && m_file.back() != '/' && m_file.back() != '\\')
            m_file += '/';
        m_file += "settings.json";
    }

    void Load()
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        std::string content;
        if (FILE* f = fopen(m_file.c_str(), "rb")) {
            char buf[8192]; size_t n;
            while ((n = fread(buf, 1, sizeof(buf), f)) > 0) content.append(buf, n);
            fclose(f);
        }
        m_fxChainPath   = parseString(content, "fxChainPath");
        m_sampleFolders = parseStringArray(content, "sampleFolders");
    }

    std::string              fxChainPath()   { std::lock_guard<std::mutex> lk(m_mtx); return m_fxChainPath; }
    std::vector<std::string> sampleFolders() { std::lock_guard<std::mutex> lk(m_mtx); return m_sampleFolders; }

    void setFxChainPath(const std::string& v)
    {
        { std::lock_guard<std::mutex> lk(m_mtx); m_fxChainPath = v; }
        Save();
    }
    void setSampleFolders(const std::vector<std::string>& v)
    {
        { std::lock_guard<std::mutex> lk(m_mtx); m_sampleFolders = v; }
        Save();
    }

    // {"fxChainPath":"...","sampleFolders":["...",...]}
    std::string toJson()
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        std::string j = "{\"fxChainPath\":\"" + esc(m_fxChainPath) + "\",\"sampleFolders\":[";
        for (size_t i = 0; i < m_sampleFolders.size(); ++i) {
            if (i) j += ",";
            j += "\"" + esc(m_sampleFolders[i]) + "\"";
        }
        j += "]}";
        return j;
    }

private:
    void Save()
    {
        std::lock_guard<std::mutex> lk(m_mtx);
        std::string j = "{\n  \"fxChainPath\": \"" + esc(m_fxChainPath) + "\",\n  \"sampleFolders\": [";
        for (size_t i = 0; i < m_sampleFolders.size(); ++i) {
            j += (i ? ", " : "");
            j += "\"" + esc(m_sampleFolders[i]) + "\"";
        }
        j += "]\n}\n";
        if (FILE* f = fopen(m_file.c_str(), "wb")) {
            fwrite(j.data(), 1, j.size(), f);
            fclose(f);
        }
    }

    static std::string esc(const std::string& s)
    {
        std::string o; o.reserve(s.size() + 8);
        for (char c : s) {
            switch (c) {
                case '"':  o += "\\\""; break;
                case '\\': o += "\\\\"; break;
                case '\n': o += "\\n";  break;
                case '\r': o += "\\r";  break;
                case '\t': o += "\\t";  break;
                default:   o += c;      break;
            }
        }
        return o;
    }
    static std::string unesc(const std::string& s)
    {
        std::string o; o.reserve(s.size());
        for (size_t i = 0; i < s.size(); ++i) {
            if (s[i] == '\\' && i + 1 < s.size()) {
                char n = s[++i];
                switch (n) { case 'n': o += '\n'; break; case 'r': o += '\r'; break;
                             case 't': o += '\t'; break; default: o += n; break; }
            } else o += s[i];
        }
        return o;
    }
    // Find  "key" : "value"
    static std::string parseString(const std::string& c, const char* key)
    {
        std::string k = std::string("\"") + key + "\"";
        size_t p = c.find(k);
        if (p == std::string::npos) return "";
        p = c.find(':', p + k.size());
        if (p == std::string::npos) return "";
        p = c.find('"', p);
        if (p == std::string::npos) return "";
        ++p;
        std::string raw;
        while (p < c.size() && c[p] != '"') {
            if (c[p] == '\\' && p + 1 < c.size()) { raw += c[p]; raw += c[p + 1]; p += 2; }
            else raw += c[p++];
        }
        return unesc(raw);
    }
    // Find  "key" : [ "a", "b", ... ]
    static std::vector<std::string> parseStringArray(const std::string& c, const char* key)
    {
        std::vector<std::string> out;
        std::string k = std::string("\"") + key + "\"";
        size_t p = c.find(k);
        if (p == std::string::npos) return out;
        p = c.find('[', p);
        if (p == std::string::npos) return out;
        size_t end = c.find(']', p);
        if (end == std::string::npos) return out;
        size_t i = p + 1;
        while (i < end) {
            if (c[i] == '"') {
                ++i; std::string raw;
                while (i < end && c[i] != '"') {
                    if (c[i] == '\\' && i + 1 < end) { raw += c[i]; raw += c[i + 1]; i += 2; }
                    else raw += c[i++];
                }
                if (i < end) ++i; // closing quote
                out.push_back(unesc(raw));
            } else ++i;
        }
        return out;
    }

    std::string              m_file;
    std::string              m_fxChainPath;
    std::vector<std::string> m_sampleFolders;
    std::mutex               m_mtx;
};

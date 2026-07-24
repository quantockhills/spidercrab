// Static file web server for serving the React frontend
// Integrates with jnetlib's WebServerBaseClass to serve built frontend files
// on port 5173 alongside the WebSocket server on 9224.

#pragma once

// Windows: include winsock2.h before WDL jnetlib for SOCKET type
#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
#endif

#include "websocket_server.h"
#include <WDL/jnetlib/webserver.h>
#include <WDL/wdlstring.h>
#include <WDL/wdlstring.h>
#include <cstdio>
#include <cstring>
#include <string>

// Simple page generator that reads a file from disk and serves it
class FilePageGenerator : public IPageGenerator
{
public:
    FilePageGenerator(const std::string& path)
    {
        m_fp = fopen(path.c_str(), "rb");
        if (!m_fp) {
            m_error = true;
        }
    }

    virtual ~FilePageGenerator()
    {
        if (m_fp) fclose(m_fp);
    }

    virtual int GetData(char* buf, int size)
    {
        if (!m_fp || m_error) return 0;
        int bytesRead = (int)fread(buf, 1, size, m_fp);
        if (bytesRead <= 0) {
            fclose(m_fp);
            m_fp = nullptr;
        }
        return bytesRead;
    }

    bool HasError() const { return m_error; }

private:
    FILE*  m_fp = nullptr;
    bool   m_error = false;
};

// Frontend web server — serves the built React app
class FrontendWebServer : public WebServerBaseClass
{
public:
    FrontendWebServer() {}

    // Set the directory where index.html lives
    void SetWebRoot(const std::string& path)
    {
        m_webRoot = path;
        if (!m_webRoot.empty() && m_webRoot.back() != '/')
            m_webRoot += '/';
    }

    virtual IPageGenerator* onConnection(JNL_HTTPServ* serv, int port) override
    {
        if (!serv) return nullptr;

        const char* file = serv->get_request_file();
        if (!file) file = "/";

        serv->set_reply_header("Server:reaper-ipad/1.0");
        serv->set_reply_header("Access-Control-Allow-Origin:*");
        serv->set_reply_header("Cache-Control:no-cache");

        // Default to index.html for root or unknown paths (SPA support)
        std::string reqPath(file);
        if (reqPath == "/" || reqPath.empty()) {
            reqPath = "index.html";
        } else if (reqPath[0] == '/') {
            reqPath = reqPath.substr(1);
        }

        // Security: prevent directory traversal
        if (reqPath.find("..") != std::string::npos) {
            serv->set_reply_string("HTTP/1.1 403 FORBIDDEN");
            serv->set_reply_header("Content-Type:text/plain");
            serv->send_reply();
            return new FilePageGenerator("");
        }

        std::string fullPath = m_webRoot + reqPath;

        // Determine MIME type from extension
        std::string ext;
        size_t dot = reqPath.rfind('.');
        if (dot != std::string::npos)
            ext = reqPath.substr(dot);

        const char* mime = "application/octet-stream";
        if (ext == ".html")       mime = "text/html";
        else if (ext == ".js")    mime = "application/javascript";
        else if (ext == ".css")   mime = "text/css";
        else if (ext == ".svg")   mime = "image/svg+xml";
        else if (ext == ".png")   mime = "image/png";
        else if (ext == ".ico")   mime = "image/x-icon";
        else if (ext == ".json")  mime = "application/json";
        else if (ext == ".webmanifest") mime = "application/manifest+json";
        else if (ext == ".woff2") mime = "font/woff2";
        else if (ext == ".woff")  mime = "font/woff";
        else if (ext == ".ttf")   mime = "font/ttf";

        // Try to open the requested file
        int size = 0;
        {
            FILE* f = fopen(fullPath.c_str(), "rb");
            if (f) {
                fseek(f, 0, SEEK_END);
                size = (int)ftell(f);
                fclose(f);
            }
        }

        if (size > 0) {
            serv->set_reply_string("HTTP/1.1 200 OK");
            serv->set_reply_size(size);
            serv->set_reply_header((std::string("Content-Type:") + mime).c_str());
            serv->send_reply();
            return new FilePageGenerator(fullPath);
        }

        // File not found — for SPA, serve index.html (let React handle routing)
        std::string indexPath = m_webRoot + "index.html";
        FILE* f = fopen(indexPath.c_str(), "rb");
        if (f) {
            fseek(f, 0, SEEK_END);
            size = (int)ftell(f);
            fclose(f);
        }

        if (size > 0) {
            serv->set_reply_string("HTTP/1.1 200 OK");
            serv->set_reply_size(size);
            serv->set_reply_header("Content-Type:text/html");
            serv->send_reply();
            return new FilePageGenerator(indexPath);
        }

        serv->set_reply_string("HTTP/1.1 404 NOT FOUND");
        serv->set_reply_header("Content-Type:text/plain");
        serv->send_reply();
        return new FilePageGenerator("");
    }

private:
    std::string m_webRoot;
};

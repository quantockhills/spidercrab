#pragma once

// WDL/SWELL headers must come before C++ stdlib to avoid min/max macro conflicts
// Windows: include winsock2.h before windows.h/WDL for SOCKET type
#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
#endif
#include <WDL/jnetlib/jnetlib.h>
#include <WDL/ptrlist.h>
#include <WDL/wdlcstring.h>
#include <WDL/wdlstring.h>

// Undefine min/max from SWELL to avoid breaking C++ stdlib
#ifdef max
#undef max
#endif
#ifdef min
#undef min
#endif

#include <functional>
#include <mutex>
#include <string>
#include <vector>

// Simple WebSocket server built on WDL jnetlib
// Handles HTTP upgrade + WebSocket framing

class WebSocketServer {
public:
    using MessageCallback    = std::function<void(int clientId, const std::string& message)>;
    using ConnectCallback    = std::function<void(int clientId)>;
    using DisconnectCallback = std::function<void(int clientId)>;

    WebSocketServer();
    ~WebSocketServer();

    bool Start(int port);
    void Stop();
    void Run(); // call from Run() in IReaperControlSurface

    // Send a text frame to a specific client
    bool Send(int clientId, const std::string& message);
    // Broadcast to all connected clients
    void Broadcast(const std::string& message);

    void SetMessageCallback(MessageCallback cb) { m_msgCallback = cb; }
    void SetConnectCallback(ConnectCallback cb) { m_connectCallback = cb; }
    void SetDisconnectCallback(DisconnectCallback cb) { m_disconnectCallback = cb; }

    bool IsRunning() const { return m_listener != nullptr; }

    // Returns true if at least one WebSocket client is connected
    bool HasClients() const;

private:
    struct Client {
        int               id;
        JNL_IConnection*  conn;
        std::vector<char> recvBuf;
        bool              handshakeDone = false;
        int               frameState    = 0; // 0=reading header, 1=reading frame
        std::string       requestHeaders; // for initial HTTP upgrade
    };

    static const int MAX_FRAME_SIZE = 1024 * 1024; // 1MB max frame

    // Bounds on how much of a client's backlog one Run() tick may absorb.
    // A slider drag can queue messages far faster than one-per-tick drains
    // them, so drain a burst — but cap it, since this runs on REAPER's UI
    // thread and a long tick would stutter the editor.
    static const int    MAX_FRAMES_PER_TICK = 16;
    static const double MAX_PARSE_MS_PER_TICK;

    int                 m_nextClientId = 1;
    JNL_IListen*        m_listener     = nullptr;
    WDL_PtrList<Client> m_clients;
    std::recursive_mutex          m_mutex;
    bool                m_inRun = false;

    MessageCallback    m_msgCallback;
    ConnectCallback    m_connectCallback;
    DisconnectCallback m_disconnectCallback;

    // Accept new connections
    void AcceptNew();

    // Read data from a client and parse frames
    void ReadClient(Client* client);

    // Handle HTTP upgrade for new WebSocket connections
    bool HandleUpgrade(Client* client);

    // Parse WebSocket frames from buffer
    void ParseFrames(Client* client);

    // Parse a single frame. Returns true if one was consumed and it is safe to
    // look for another; false if the buffer holds no complete frame, or if the
    // client was removed (in which case it must not be touched again).
    bool ParseOneFrame(Client* client);

    // Send WebSocket frame
    bool SendFrame(Client* client, int opcode, const std::string& payload);

    // Remove a client (with cleanup)
    void RemoveClient(Client* client);
};

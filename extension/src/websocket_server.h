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

    // Resolve a client's peer IP address (the device running the browser).
    // Returns false when the client id is unknown.
    bool GetClientIp(int clientId, std::string& ipOut);

private:
    struct Client {
        int               id;
        JNL_IConnection*  conn;
        std::vector<char> recvBuf;
        std::string       sendQueue;      // outbound bytes awaiting the socket
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

    // JNL's send() is all-or-nothing: hand it more than the socket's free
    // space and it writes nothing at all and returns -1. Outbound frames are
    // therefore queued here and drained across ticks, so a large response —
    // the FX list runs well past 64KB on a machine with a real plugin
    // library — isn't silently dropped. Bounded so a wedged client can't grow
    // this without limit.
    static const size_t MAX_SEND_QUEUE_BYTES = 8u * 1024u * 1024u;

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

    // Read data from a client and parse frames.
    // Returns false if the client was removed (it must not be touched again).
    bool ReadClient(Client* client);

    // Handle HTTP upgrade for new WebSocket connections
    bool HandleUpgrade(Client* client);

    // Parse WebSocket frames from buffer.
    // Returns false if the client was removed while parsing.
    bool ParseFrames(Client* client);

    // Outcome of attempting to parse a single frame.
    enum class FrameResult {
        Consumed,      // a frame was handled; safe to look for another
        Incomplete,    // no complete frame in the buffer yet
        ClientRemoved, // client was closed and freed — do not touch it
    };
    FrameResult ParseOneFrame(Client* client);

    // Hand queued outbound bytes to the socket, as much as it will accept.
    void FlushSendQueue(Client* client);

public:
    // The drain loop behind FlushSendQueue, free of sockets so it can be
    // tested directly. Hands as much of `queue` to the sink as it reports room
    // for, in order, erasing what was handed over. `freeSpace` returns the
    // sink's current capacity; `write` must accept exactly the bytes given.
    static void DrainSendQueue(std::string&                                queue,
                               const std::function<int()>&                 freeSpace,
                               const std::function<void(const char*, int)>& write);

private:

    // Send WebSocket frame
    bool SendFrame(Client* client, int opcode, const std::string& payload);

    // Remove a client (with cleanup)
    void RemoveClient(Client* client);
};

#include "websocket_server.h"
#include "sha1_utils.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>

// WDL netinc.h includes system socket headers
#include <WDL/jnetlib/netinc.h>

WebSocketServer::WebSocketServer() { }
WebSocketServer::~WebSocketServer()
{
    Stop();
}

bool WebSocketServer::Start(int port)
{
    if (m_listener)
        Stop();

    m_listener = new JNL_Listen((short)port, 0);
    if (m_listener->is_error()) {
        delete m_listener;
        m_listener = nullptr;
        return false;
    }
    return true;
}

void WebSocketServer::Stop()
{
    std::lock_guard<std::recursive_mutex> lock(m_mutex);

    // Close all client connections. Empty(true) below deletes the Client
    // objects themselves — deleting them here too double-frees every
    // connected client and corrupts the heap (crash dump on REAPER exit).
    for (int i = m_clients.GetSize() - 1; i >= 0; i--) {
        Client* c = m_clients.Get(i);
        if (c->conn) {
            c->conn->close(1);
            delete c->conn;
            c->conn = nullptr;
        }
    }
    m_clients.Empty(true);

    if (m_listener) {
        delete m_listener;
        m_listener = nullptr;
    }
}

void WebSocketServer::Run()
{
    if (m_inRun)
        return;
    m_inRun = true;

    AcceptNew();

    std::lock_guard<std::recursive_mutex> lock(m_mutex);
    for (int i = m_clients.GetSize() - 1; i >= 0; i--) {
        Client* c = m_clients.Get(i);
        if (c->conn) {
            // Only flush if the client survived the read — ReadClient may have
            // removed and freed it.
            if (ReadClient(c))
                FlushSendQueue(c);
        }
    }

    m_inRun = false;
}

void WebSocketServer::AcceptNew()
{
    if (!m_listener)
        return;

    while (true) {
        JNL_IConnection* newConn = m_listener->get_connect(65536, 65536);
        if (!newConn)
            break;

        auto* client          = new Client();
        client->id            = m_nextClientId++;
        client->conn          = newConn;
        client->handshakeDone = false;
        client->frameState    = 0;

        std::lock_guard<std::recursive_mutex> lock(m_mutex);
        m_clients.Add(client);
    }
}

bool WebSocketServer::HandleUpgrade(Client* client)
{
    // Parse the HTTP request headers
    const std::string& headers = client->requestHeaders;

    // Find Sec-WebSocket-Key
    const char* keyMarker = "Sec-WebSocket-Key: ";
    size_t      keyPos    = headers.find(keyMarker);
    if (keyPos == std::string::npos) {
        // Not a WebSocket upgrade, send 400
        client->conn->send("HTTP/1.1 400 Bad Request\r\n\r\n", 28);
        return false;
    }

    keyPos += strlen(keyMarker);
    size_t      keyEnd = headers.find("\r\n", keyPos);
    std::string key    = headers.substr(keyPos, keyEnd - keyPos);
    // Trim whitespace
    while (!key.empty() && key.back() == ' ')
        key.pop_back();
    while (!key.empty() && key.front() == ' ')
        key.erase(0, 1);

    // Compute accept key
    std::string   magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    unsigned char hash[20];
    sha1_hash((const unsigned char*)magic.data(), magic.size(), hash);
    std::string acceptKey = base64_encode(hash, 20);

    // Send upgrade response
    std::string response = "HTTP/1.1 101 Switching Protocols\r\n"
                           "Upgrade: websocket\r\n"
                           "Connection: Upgrade\r\n"
                           "Sec-WebSocket-Accept: "
        + acceptKey
        + "\r\n"
          "\r\n";

    client->conn->send(response.data(), (int)response.size());
    client->handshakeDone = true;
    client->recvBuf.clear();

    // Notify connect
    if (m_connectCallback)
        m_connectCallback(client->id);

    return true;
}

bool WebSocketServer::ReadClient(Client* client)
{
    JNL_IConnection* conn = client->conn;
    conn->run();

    int state = conn->get_state();
    if (state == JNL_Connection::STATE_ERROR || state == JNL_Connection::STATE_CLOSED) {
        if (m_disconnectCallback && client->handshakeDone)
            m_disconnectCallback(client->id);
        RemoveClient(client);
        return false;
    }

    // Read available data
    int avail = conn->recv_bytes_available();
    if (avail > 0) {
        size_t oldSize = client->recvBuf.size();
        client->recvBuf.resize(oldSize + avail);
        conn->recv_bytes(client->recvBuf.data() + oldSize, avail);
    }

    if (!client->handshakeDone) {
        // Check if we have the full HTTP headers (ends with \r\n\r\n)
        std::string buf(client->recvBuf.begin(), client->recvBuf.end());
        size_t      headerEnd = buf.find("\r\n\r\n");
        if (headerEnd != std::string::npos) {
            client->requestHeaders = buf.substr(0, headerEnd + 2);
            client->recvBuf.erase(client->recvBuf.begin(), client->recvBuf.begin() + headerEnd + 4);
            if (!HandleUpgrade(client)) {
                RemoveClient(client);
                return false;
            }
            // handshakeDone is now true — fall through to ParseFrames
            // if there's leftover data in recvBuf (same TCP packet)
        } else {
            // Wait for more data
            return true;
        }
    }

    // Process any WebSocket frames in the buffer
    // (handles both: leftover data after upgrade, and data from subsequent reads)
    if (client->handshakeDone && !client->recvBuf.empty()) {
        return ParseFrames(client);
    }

    return true;
}

const double WebSocketServer::MAX_PARSE_MS_PER_TICK = 5.0;

bool WebSocketServer::ParseFrames(Client* client)
{
    // Drain a bounded burst rather than a single frame per tick. Run() is
    // called ~30x/sec, so one-per-tick capped intake at ~30 messages/sec —
    // far below what a slider drag produces, so a backlog built up and kept
    // applying for seconds after the gesture ended.
    //
    // This does not reintroduce overlapping REAPER API calls: everything here
    // runs on the one thread and HandleMessage takes m_apiMutex, so frames are
    // still handled strictly one after another. The budget below only bounds
    // how long a single tick may spend, so a flood can't stall REAPER's UI.
    const auto start = std::chrono::steady_clock::now();

    for (int i = 0; i < MAX_FRAMES_PER_TICK; i++) {
        const FrameResult r = ParseOneFrame(client);
        if (r == FrameResult::ClientRemoved)
            return false; // client is freed — caller must not touch it
        if (r == FrameResult::Incomplete)
            break;

        const auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - start).count();
        if (elapsed >= MAX_PARSE_MS_PER_TICK)
            break;
    }

    return true;
}

WebSocketServer::FrameResult WebSocketServer::ParseOneFrame(Client* client)
{
    std::vector<char>& buf = client->recvBuf;

    if (buf.size() >= 2) {
        unsigned char opcode     = buf[0] & 0x0F;
        bool          masked     = (buf[1] & 0x80) != 0;
        uint64_t      payloadLen = buf[1] & 0x7F;

        size_t headerSize = 2;
        if (payloadLen == 126) {
            if (buf.size() < 4)
                return FrameResult::Incomplete;
            payloadLen = ((unsigned char)buf[2] << 8) | (unsigned char)buf[3];
            headerSize = 4;
        } else if (payloadLen == 127) {
            if (buf.size() < 10)
                return FrameResult::Incomplete;
            payloadLen = 0;
            for (int i = 0; i < 8; i++)
                payloadLen = (payloadLen << 8) | (unsigned char)buf[2 + i];
            headerSize = 10;
        }

        if (masked)
            headerSize += 4;

        if (buf.size() < headerSize + payloadLen)
            return FrameResult::Incomplete;

        // Extract mask key and payload
        unsigned char maskKey[4] = { 0 };
        if (masked) {
            for (int i = 0; i < 4; i++)
                maskKey[i] = (unsigned char)buf[headerSize - 4 + i];
        }

        std::string payload;
        if (payloadLen > 0 && payloadLen < MAX_FRAME_SIZE) {
            payload.resize(payloadLen);
            for (uint64_t i = 0; i < payloadLen; i++) {
                payload[i] = buf[headerSize + i] ^ maskKey[i % 4];
            }
        }

        // Handle opcode
        if (opcode == 0x1) { // Text frame
            if (m_msgCallback)
                m_msgCallback(client->id, payload);
        } else if (opcode == 0x9) { // Ping
            SendFrame(client, 0xA, payload); // Pong back
        } else if (opcode == 0x8) { // Close
            if (m_disconnectCallback)
                m_disconnectCallback(client->id);
            RemoveClient(client);
            return FrameResult::ClientRemoved;
        }

        // Remove consumed bytes
        buf.erase(buf.begin(), buf.begin() + headerSize + payloadLen);
        return FrameResult::Consumed;
    }

    return FrameResult::Incomplete;
}

bool WebSocketServer::Send(int clientId, const std::string& message)
{
    std::lock_guard<std::recursive_mutex> lock(m_mutex);
    for (int i = 0; i < m_clients.GetSize(); i++) {
        Client* c = m_clients.Get(i);
        if (c->id == clientId && c->handshakeDone) {
            return SendFrame(c, 0x1, message);
        }
    }
    return false;
}

bool WebSocketServer::HasClients() const
{
    return m_clients.GetSize() > 0;
}

bool WebSocketServer::GetClientIp(int clientId, std::string& ipOut)
{
    std::lock_guard<std::recursive_mutex> lock(m_mutex);
    for (int i = 0; i < m_clients.GetSize(); i++) {
        Client* c = m_clients.Get(i);
        if (c->id == clientId && c->conn) {
            char buf[64];
            JNL::addr_to_ipstr(c->conn->get_remote(), buf, sizeof(buf));
            ipOut = buf;
            return !ipOut.empty();
        }
    }
    return false;
}

void WebSocketServer::Broadcast(const std::string& message)
{
    std::lock_guard<std::recursive_mutex> lock(m_mutex);
    for (int i = 0; i < m_clients.GetSize(); i++) {
        Client* c = m_clients.Get(i);
        if (c->handshakeDone) {
            SendFrame(c, 0x1, message);
        }
    }
}

bool WebSocketServer::SendFrame(Client* client, int opcode, const std::string& payload)
{
    std::vector<char> frame;
    frame.push_back((char)(0x80 | opcode)); // FIN + opcode

    size_t len = payload.size();
    if (len < 126) {
        frame.push_back((char)len);
    } else if (len < 65536) {
        frame.push_back(126);
        frame.push_back((char)(len >> 8));
        frame.push_back((char)(len & 0xFF));
    } else {
        frame.push_back(127);
        for (int i = 7; i >= 0; i--)
            frame.push_back((char)(len >> (i * 8)));
    }

    // Server-to-client frames are not masked
    frame.insert(frame.end(), payload.begin(), payload.end());

    // Queue rather than send. JNL's send() writes nothing at all if the frame
    // exceeds the socket's free space, and its return value was previously
    // discarded — so any response over ~64KB vanished silently and the client
    // waited for a reply that was never put on the wire.
    if (client->sendQueue.size() + frame.size() > MAX_SEND_QUEUE_BYTES) {
        fprintf(stderr,
            "[spidercrab] client %d send queue full (%zu bytes) — dropping a %zu byte frame\n",
            client->id, client->sendQueue.size(), frame.size());
        return false;
    }

    client->sendQueue.append(frame.data(), frame.size());
    return true;
}

void WebSocketServer::DrainSendQueue(
    std::string&                                queue,
    const std::function<int()>&                 freeSpace,
    const std::function<void(const char*, int)>& write)
{
    // Push out as much as the sink will currently accept; whatever is left
    // goes next tick. Splitting here is safe: this is a TCP byte stream, which
    // has no notion of our frame boundaries and fragments the data anyway. We
    // are not splitting the WebSocket frame, only the write.
    while (!queue.empty()) {
        const int avail = freeSpace();
        if (avail <= 0)
            return; // full — resume on the next tick

        const int n = (int)std::min((size_t)avail, queue.size());
        write(queue.data(), n);
        queue.erase(0, n);
    }
}

void WebSocketServer::FlushSendQueue(Client* client)
{
    JNL_IConnection* conn = client->conn;
    DrainSendQueue(
        client->sendQueue,
        [conn]() { return conn->send_bytes_available(); },
        [conn](const char* p, int n) { conn->send(p, n); });
}

void WebSocketServer::RemoveClient(Client* client)
{
    if (client->conn) {
        client->conn->close(1);
        delete client->conn;
        client->conn = nullptr;
    }
    m_clients.Delete(m_clients.Find(client));
    delete client;
}

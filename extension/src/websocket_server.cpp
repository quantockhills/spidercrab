#include "websocket_server.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>

// WDL netinc.h includes system socket headers
#include <WDL/jnetlib/netinc.h>

// Simple SHA-1 implementation for WebSocket handshake
// WebSocket handshake requires: SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11") -> Base64
// We implement a minimal SHA-1 for this purpose

#define SHA1_ROTL(x, n) (((x) << (n)) | ((x) >> (32 - (n))))

static void sha1_hash(const unsigned char* data, size_t len, unsigned char out[20])
{
    uint32_t      h[]      = { 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0 };
    size_t        blockLen = 0;
    unsigned char block[64];
    uint64_t      bitCount = 0;

    auto processBlock = [&](const unsigned char* block) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++) {
            w[i] = ((uint32_t)block[i * 4] << 24) | ((uint32_t)block[i * 4 + 1] << 16)
                | ((uint32_t)block[i * 4 + 2] << 8) | (uint32_t)block[i * 4 + 3];
        }
        for (int i = 16; i < 80; i++) {
            w[i] = SHA1_ROTL(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5A827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            } else {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }
            uint32_t temp = SHA1_ROTL(a, 5) + f + e + k + w[i];
            e             = d;
            d             = c;
            c             = SHA1_ROTL(b, 30);
            b             = a;
            a             = temp;
        }
        h[0] += a;
        h[1] += b;
        h[2] += c;
        h[3] += d;
        h[4] += e;
    };

    for (size_t i = 0; i < len; i++) {
        block[blockLen++] = data[i];
        bitCount += 8;
        if (blockLen == 64) {
            processBlock(block);
            blockLen = 0;
        }
    }

    // Padding
    block[blockLen++] = 0x80;
    while (blockLen != 56) {
        if (blockLen == 64) {
            processBlock(block);
            blockLen = 0;
        }
        block[blockLen++] = 0;
    }

    // Append length
    for (int i = 0; i < 8; i++) {
        block[blockLen++] = (unsigned char)(bitCount >> (56 - i * 8));
    }
    processBlock(block);

    for (int i = 0; i < 5; i++) {
        out[i * 4]     = (unsigned char)(h[i] >> 24);
        out[i * 4 + 1] = (unsigned char)(h[i] >> 16);
        out[i * 4 + 2] = (unsigned char)(h[i] >> 8);
        out[i * 4 + 3] = (unsigned char)(h[i]);
    }
}

static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string base64_encode(const unsigned char* data, size_t len)
{
    std::string out;
    for (size_t i = 0; i < len; i += 3) {
        int val = ((int)data[i]) << 16;
        if (i + 1 < len)
            val |= ((int)data[i + 1]) << 8;
        if (i + 2 < len)
            val |= data[i + 2];
        out += b64_table[(val >> 18) & 0x3F];
        out += b64_table[(val >> 12) & 0x3F];
        out += (i + 1 < len) ? b64_table[(val >> 6) & 0x3F] : '=';
        out += (i + 2 < len) ? b64_table[val & 0x3F] : '=';
    }
    return out;
}

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

    // Close all clients
    for (int i = m_clients.GetSize() - 1; i >= 0; i--) {
        Client* c = m_clients.Get(i);
        if (c->conn) {
            c->conn->close(1);
            delete c->conn;
        }
        delete c;
    }
    m_clients.Empty(true);

    if (m_listener) {
        delete m_listener;
        m_listener = nullptr;
    }
}

void WebSocketServer::Run()
{
    AcceptNew();

    std::lock_guard<std::recursive_mutex> lock(m_mutex);
    for (int i = m_clients.GetSize() - 1; i >= 0; i--) {
        Client* c = m_clients.Get(i);
        if (c->conn) {
            ReadClient(c);
        }
    }
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

void WebSocketServer::ReadClient(Client* client)
{
    JNL_IConnection* conn = client->conn;
    conn->run();

    int state = conn->get_state();
    if (state == JNL_Connection::STATE_ERROR || state == JNL_Connection::STATE_CLOSED) {
        if (m_disconnectCallback && client->handshakeDone)
            m_disconnectCallback(client->id);
        RemoveClient(client);
        return;
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
                return;
            }
            // handshakeDone is now true — fall through to ParseFrames
            // if there's leftover data in recvBuf (same TCP packet)
        } else {
            // Wait for more data
            return;
        }
    }

    // Process any WebSocket frames in the buffer
    // (handles both: leftover data after upgrade, and data from subsequent reads)
    if (client->handshakeDone && !client->recvBuf.empty()) {
        ParseFrames(client);
    }
}

void WebSocketServer::ParseFrames(Client* client)
{
    std::vector<char>& buf = client->recvBuf;

    while (buf.size() >= 2) {
        unsigned char opcode     = buf[0] & 0x0F;
        bool          masked     = (buf[1] & 0x80) != 0;
        uint64_t      payloadLen = buf[1] & 0x7F;

        size_t headerSize = 2;
        if (payloadLen == 126) {
            if (buf.size() < 4)
                return;
            payloadLen = ((unsigned char)buf[2] << 8) | (unsigned char)buf[3];
            headerSize = 4;
        } else if (payloadLen == 127) {
            if (buf.size() < 10)
                return;
            payloadLen = 0;
            for (int i = 0; i < 8; i++)
                payloadLen = (payloadLen << 8) | (unsigned char)buf[2 + i];
            headerSize = 10;
        }

        if (masked)
            headerSize += 4;

        if (buf.size() < headerSize + payloadLen)
            return;

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
            return;
        }

        // Remove consumed bytes
        buf.erase(buf.begin(), buf.begin() + headerSize + payloadLen);
    }
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

    client->conn->send(frame.data(), (int)frame.size());
    return true;
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

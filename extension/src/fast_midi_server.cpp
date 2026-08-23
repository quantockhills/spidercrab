#include "fast_midi_server.h"
#include "sha1_utils.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

// Tiny JSON number extractor for the note frames we produce ourselves.
// {"type":"command","command":"midi/noteOn","note":60,"velocity":100,"channel":0,"id":"n1"}
// Returns def when the key is absent or not a number.
int jsonInt(const std::string& json, const char* key, int def)
{
    const std::string k = std::string("\"") + key + "\"";
    size_t p = json.find(k);
    if (p == std::string::npos) return def;
    p = json.find(':', p + k.size());
    if (p == std::string::npos) return def;
    p++;
    while (p < json.size() && (json[p] == ' ' || json[p] == '\t')) p++;
    if (p >= json.size() || json[p] == '"') return def;
    return atoi(json.c_str() + p);
}

} // namespace

FastMidiServer::~FastMidiServer()
{
    Stop();
}

std::string FastMidiServer::BuildUpgradeResponse(const std::string& key)
{
    const std::string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    unsigned char hash[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(magic.data()), magic.size(), hash);
    return "HTTP/1.1 101 Switching Protocols\r\n"
           "Upgrade: websocket\r\n"
           "Connection: Upgrade\r\n"
           "Sec-WebSocket-Accept: "
        + base64_encode(hash, 20)
        + "\r\n"
          "\r\n";
}

int FastMidiServer::ParseFrames(std::vector<char>& buf, const NoteCallback& onNote)
{
    int consumed = 0;

    while (true) {
        if (buf.size() < 2) return consumed;

        const unsigned char opcode     = static_cast<unsigned char>(buf[0]) & 0x0F;
        const bool          masked     = (buf[1] & 0x80) != 0;
        uint64_t            payloadLen = buf[1] & 0x7F;
        size_t              headerSize = 2;

        if (payloadLen == 126) {
            if (buf.size() < 4) return consumed;
            payloadLen = (static_cast<unsigned char>(buf[2]) << 8)
                | static_cast<unsigned char>(buf[3]);
            headerSize = 4;
        } else if (payloadLen == 127) {
            if (buf.size() < 10) return consumed;
            payloadLen = 0;
            for (int i = 0; i < 8; i++)
                payloadLen = (payloadLen << 8) | static_cast<unsigned char>(buf[2 + i]);
            headerSize = 10;
        }

        if (masked) headerSize += 4;
        if (payloadLen > kMaxFrameSize) return -1;
        if (buf.size() < headerSize + payloadLen) return consumed;

        unsigned char maskKey[4] = {0, 0, 0, 0};
        if (masked) {
            std::memcpy(maskKey, buf.data() + headerSize - 4, 4);
        }

        std::string payload;
        payload.resize(payloadLen);
        for (uint64_t i = 0; i < payloadLen; i++) {
            payload[i] = static_cast<char>(
                static_cast<unsigned char>(buf[headerSize + i]) ^ maskKey[i % 4]);
        }

        if (opcode == 0x8) {
            return -1; // close frame — drop the connection
        } else if (opcode == 0x1 && onNote) {
            // Only the two note commands interest us; everything else
            // (fx control etc.) belongs on the main server.
            if (payload.find("\"midi/noteOn\"") != std::string::npos
                || payload.find("\"midi/noteOff\"") != std::string::npos) {
                const bool on      = payload.find("\"midi/noteOn\"") != std::string::npos;
                const int  note    = jsonInt(payload, "note", -1);
                const int  vel     = on ? jsonInt(payload, "velocity", 100) : 0;
                const int  channel = jsonInt(payload, "channel", 0) & 0x0F;
                if (note >= 0 && note <= 127) {
                    const int status = (on ? 0x90 : 0x80) | channel;
                    onNote(status, note, vel);
                }
            }
        }
        // opcode 0x9 (ping) and 0x2 (binary) are ignored — our client
        // sends text frames only and never pings.

        buf.erase(buf.begin(), buf.begin() + headerSize + payloadLen);
        consumed++;
    }
}

bool FastMidiServer::Start(int port)
{
    if (m_running.load()) return true;
    if (m_thread.joinable()) return false; // stopped but not joined

    m_listener = new JNL_Listen(static_cast<short>(port), 0);
    if (m_listener->is_error()) {
        delete m_listener;
        m_listener = nullptr;
        return false;
    }

    m_stop.store(false);
    m_running.store(true);
    m_thread = std::thread(&FastMidiServer::ThreadLoop, this);
    fprintf(stderr, "[spidercrab] fast-midi server listening on port %d\n", port);
    return true;
}

void FastMidiServer::Stop()
{
    if (!m_running.exchange(false)) return;
    m_stop.store(true);

    {
        std::lock_guard<std::mutex> lock(m_connMutex);
        if (m_listener) {
            delete m_listener;
            m_listener = nullptr;
        }
        for (int i = m_conns.GetSize() - 1; i >= 0; i--) {
            Conn* c = m_conns.Get(i);
            if (c->conn) {
                c->conn->close(1);
                delete c->conn;
            }
            delete c;
        }
        m_conns.Empty(false);
    }

    if (m_thread.joinable()) m_thread.join();
}

void FastMidiServer::ThreadLoop()
{
    while (!m_stop.load()) {
        {
            std::lock_guard<std::mutex> lock(m_connMutex);

            if (m_listener) {
                while (true) {
                    JNL_IConnection* newConn = m_listener->get_connect(65536, 65536);
                    if (!newConn) break;
                    auto* c = new Conn();
                    c->conn = newConn;
                    m_conns.Add(c);
                }
            }

            for (int i = m_conns.GetSize() - 1; i >= 0; i--) {
                if (m_stop.load()) break;
                HandleReadLocked(m_conns.Get(i), i);
            }
        }

        if (m_pollCb) m_pollCb();

        if (!m_stop.load())
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

void FastMidiServer::HandleReadLocked(Conn* c, int index)
{
    JNL_IConnection* conn = c->conn;
    if (!conn) {
        RemoveConnLocked(index);
        return;
    }

    conn->run();
    const int state = conn->get_state();
    if (state == JNL_Connection::STATE_ERROR || state == JNL_Connection::STATE_CLOSED) {
        RemoveConnLocked(index);
        return;
    }

    const int avail = conn->recv_bytes_available();
    if (avail > 0) {
        const size_t oldSize = c->recvBuf.size();
        c->recvBuf.resize(oldSize + avail);
        conn->recv_bytes(c->recvBuf.data() + oldSize, avail);
    }

    if (!c->handshakeDone) {
        const std::string buf(c->recvBuf.begin(), c->recvBuf.end());
        const size_t headerEnd = buf.find("\r\n\r\n");
        if (headerEnd == std::string::npos) return; // wait for the full request

        c->recvBuf.erase(c->recvBuf.begin(), c->recvBuf.begin() + headerEnd + 4);

        const char* keyMarker = "Sec-WebSocket-Key: ";
        const size_t keyPos = buf.find(keyMarker);
        if (keyPos == std::string::npos) {
            RemoveConnLocked(index);
            return;
        }
        const size_t keyStart = keyPos + std::strlen(keyMarker);
        const size_t keyEnd   = buf.find("\r\n", keyStart);
        std::string key = buf.substr(keyStart, keyEnd - keyStart);
        while (!key.empty() && key.back() == ' ') key.pop_back();
        while (!key.empty() && key.front() == ' ') key.erase(0, 1);

        const std::string response = BuildUpgradeResponse(key);
        conn->send(response.data(), static_cast<int>(response.size()));
        c->handshakeDone = true;
        // Leftover bytes after the headers (a frame sent in the same
        // TCP segment) are kept in recvBuf and parsed below.
    }

    if (c->handshakeDone && !c->recvBuf.empty()) {
        if (ParseFrames(c->recvBuf, m_noteCb) < 0) {
            RemoveConnLocked(index);
        }
    }
}

void FastMidiServer::RemoveConnLocked(int index)
{
    if (index < 0 || index >= m_conns.GetSize()) return;
    Conn* c = m_conns.Get(index);
    const bool wasHandshaken = c->handshakeDone;
    if (c->conn) {
        c->conn->close(1);
        delete c->conn;
    }
    delete c;
    m_conns.Delete(index, false);

    // A live client vanishing (browser refresh/close) must not leave notes
    // sounding on REAPER's side — the host panics on this.
    if (wasHandshaken && m_disconnectCb)
        m_disconnectCb();
}

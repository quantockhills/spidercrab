#pragma once

// ============================================================
// OscReceiver — UDP receiver + minimal OSC parser
//
// Binds a UDP socket, polls for incoming OSC packets via
// non-blocking recvfrom(), and dispatches to registered
// callbacks. Event-driven: zero CPU when no packets arrive.
//
// Address scheme (matching ReaLearn OSC feedback):
//   /playtime/slot/state  iiiis  (col, row, stateId, flags, stateName)
//
// stateId: 0=stopped, 1=playing, 2=recording, 3=empty, 4=queued
// ============================================================

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#endif

class OscReceiver {
public:
    // Callback signature: (col, row, stateString)
    using SlotStateCallback = std::function<void(int col, int row, const std::string& state)>;

    OscReceiver()
        : m_sock(-1)
        , m_port(0)
        , m_maxPacketSize(8192)
    {
    }

    ~OscReceiver()
    {
        closeSocket();
    }

    // Non-copyable, movable
    OscReceiver(const OscReceiver&) = delete;
    OscReceiver& operator=(const OscReceiver&) = delete;

    OscReceiver(OscReceiver&& other) noexcept
        : m_sock(other.m_sock)
        , m_port(other.m_port)
        , m_maxPacketSize(other.m_maxPacketSize)
        , m_slotStateCb(std::move(other.m_slotStateCb))
    {
        other.m_sock = -1;
        other.m_port = 0;
    }

    OscReceiver& operator=(OscReceiver&& other) noexcept
    {
        if (this != &other) {
            closeSocket();
            m_sock = other.m_sock;
            m_port = other.m_port;
            m_maxPacketSize = other.m_maxPacketSize;
            m_slotStateCb = std::move(other.m_slotStateCb);
            other.m_sock = -1;
            other.m_port = 0;
        }
        return *this;
    }

    // --- Setup ---

    // Register callback for /playtime/slot/state messages
    void setSlotStateCallback(SlotStateCallback cb) { m_slotStateCb = cb; }

    // Bind to a specific UDP port.
    // Returns true on success, false on failure.
    bool bind(int port)
    {
        closeSocket();

        m_sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, 0));
        if (m_sock < 0) {
            fprintf(stderr, "[spidercrab] osc_receiver: failed to create UDP socket\n");
            return false;
        }

        // Set non-blocking (so poll() returns immediately when no data)
#ifdef _WIN32
        unsigned long mode = 1;
        ioctlsocket(m_sock, FIONBIO, &mode);
#else
        int flags = fcntl(m_sock, F_GETFL, 0);
        if (flags >= 0) {
            fcntl(m_sock, F_SETFL, flags | O_NONBLOCK);
        }
#endif

        // Allow address reuse (SO_REUSEADDR)
        int reuse = 1;
        setsockopt(m_sock, SOL_SOCKET, SO_REUSEADDR,
            reinterpret_cast<const char*>(&reuse), sizeof(reuse));

        struct sockaddr_in local;
        memset(&local, 0, sizeof(local));
        local.sin_family = AF_INET;
        local.sin_port = htons(static_cast<uint16_t>(port));
        local.sin_addr.s_addr = INADDR_ANY;

        if (::bind(m_sock,
                reinterpret_cast<struct sockaddr*>(&local),
                sizeof(local)) < 0) {
#ifdef _WIN32
            int err = WSAGetLastError();
            fprintf(stderr, "[spidercrab] osc_receiver: bind to port %d failed (err=%d)\n",
                port, err);
#else
            fprintf(stderr, "[spidercrab] osc_receiver: bind to port %d failed (errno=%d %s)\n",
                port, errno, strerror(errno));
#endif
            closeSocket();
            // Try fallback port
            if (tryFallbackBind(port)) {
                return true;
            }
            return false;
        }

        m_port = port;
        fprintf(stderr, "[spidercrab] osc_receiver: bound to UDP port %d\n", port);
        return true;
    }

    // The port we're bound to (0 = not bound)
    int port() const { return m_port; }

    // Check if socket is valid and bound
    bool isReady() const { return m_sock >= 0; }

    // --- Polling ---

    // Poll the socket for incoming OSC packets.
    // Non-blocking: returns immediately if no data.
    // Call this periodically (e.g., from Run()).
    void poll()
    {
        if (m_sock < 0)
            return;

        struct sockaddr_in from;
        socklen_t fromLen = sizeof(from);
        std::vector<uint8_t> buf(m_maxPacketSize);

        int bytes = static_cast<int>(::recvfrom(
            m_sock,
            reinterpret_cast<char*>(buf.data()),
            buf.size(),
            0,
            reinterpret_cast<struct sockaddr*>(&from),
            &fromLen));

        if (bytes < 0) {
            // No data or error — both are expected in non-blocking mode
#ifdef _WIN32
            int err = WSAGetLastError();
            if (err != WSAEWOULDBLOCK) {
                fprintf(stderr, "[spidercrab] osc_receiver: recvfrom error (err=%d)\n", err);
            }
#else
            if (errno != EWOULDBLOCK && errno != EAGAIN) {
                fprintf(stderr, "[spidercrab] osc_receiver: recvfrom error (errno=%d)\n", errno);
            }
#endif
            return;
        }

        if (bytes < 4)
            return; // too small to be a valid OSC packet

        buf.resize(static_cast<size_t>(bytes));

        // Parse and dispatch
        dispatchPacket(buf);
    }

    // --- OSC parsing (public for testing) ---

    // Parse an OSC message from raw bytes.
    // Returns true if parsing succeeded.
    // Extracts: address, intArgs, strArgs
    bool parseMessage(
        const std::vector<uint8_t>& data,
        std::string& outAddress,
        std::vector<int>& outIntArgs,
        std::vector<std::string>& outStrArgs) const
    {
        outAddress.clear();
        outIntArgs.clear();
        outStrArgs.clear();

        if (data.size() < 4)
            return false;

        size_t pos = 0;

        // 1. Parse address pattern (null-terminated string, padded to 4 bytes)
        const char* addrStart = reinterpret_cast<const char*>(data.data());
        size_t addrLen = strnlen(addrStart, data.size() - pos);
        if (addrLen == 0 || addrLen >= data.size() - pos)
            return false;

        if (addrStart[0] != '/')
            return false; // OSC addresses always start with '/'

        outAddress.assign(addrStart, addrLen);
        pos += ((addrLen + 4) / 4) * 4; // advance past padded address

        if (pos >= data.size())
            return false;

        // 2. Parse type tag string (starts with comma)
        const char* typeStart = reinterpret_cast<const char*>(data.data() + pos);
        if (typeStart[0] != ',')
            return false; // type tag must start with comma

        size_t typeLen = strnlen(typeStart, data.size() - pos);
        if (typeLen == 0 || pos + typeLen >= data.size())
            return false;

        std::string typeStr(typeStart, typeLen);
        pos += ((typeLen + 4) / 4) * 4; // advance past padded type tag

        // 3. Parse arguments according to type tags
        // Skip the leading comma in typeStr
        for (size_t i = 1; i < typeStr.size() && pos + 4 <= data.size(); i++) {
            char typeChar = typeStr[i];

            switch (typeChar) {
            case 'i': {
                // Integer (4 bytes, big-endian)
                int32_t val = (static_cast<int32_t>(data[pos]) << 24) |
                              (static_cast<int32_t>(data[pos + 1]) << 16) |
                              (static_cast<int32_t>(data[pos + 2]) << 8) |
                              static_cast<int32_t>(data[pos + 3]);
                outIntArgs.push_back(val);
                pos += 4;
                break;
            }
            case 's': {
                // String (NUL-padded to 4-byte boundary)
                const char* strStart = reinterpret_cast<const char*>(data.data() + pos);
                size_t remain = data.size() - pos;
                size_t strLen = strnlen(strStart, remain);
                if (strLen >= remain)
                    return false;
                outStrArgs.push_back(std::string(strStart, strLen));
                pos += ((strLen + 4) / 4) * 4;
                break;
            }
            case 'f': {
                // Float (4 bytes, big-endian IEEE 754) - skip for now
                pos += 4;
                break;
            }
            default:
                // Unknown type — skip 4 bytes
                pos += 4;
                break;
            }
        }

        return true;
    }

private:
    int m_sock;
    int m_port;
    size_t m_maxPacketSize;
    SlotStateCallback m_slotStateCb;

    void closeSocket()
    {
        if (m_sock >= 0) {
#ifdef _WIN32
            closesocket(m_sock);
#else
            ::close(m_sock);
#endif
            m_sock = -1;
        }
    }

    // Try to bind to a fallback port (original + 1, +2, etc.)
    bool tryFallbackBind(int originalPort)
    {
        for (int attempt = 1; attempt <= 10; attempt++) {
            int fallbackPort = originalPort + attempt;

            m_sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, 0));
            if (m_sock < 0)
                continue;

#ifdef _WIN32
            unsigned long mode = 1;
            ioctlsocket(m_sock, FIONBIO, &mode);
#else
            int flags = fcntl(m_sock, F_GETFL, 0);
            if (flags >= 0) {
                fcntl(m_sock, F_SETFL, flags | O_NONBLOCK);
            }
#endif

            int reuse = 1;
            setsockopt(m_sock, SOL_SOCKET, SO_REUSEADDR,
                reinterpret_cast<const char*>(&reuse), sizeof(reuse));

            struct sockaddr_in local;
            memset(&local, 0, sizeof(local));
            local.sin_family = AF_INET;
            local.sin_port = htons(static_cast<uint16_t>(fallbackPort));
            local.sin_addr.s_addr = INADDR_ANY;

            if (::bind(m_sock,
                    reinterpret_cast<struct sockaddr*>(&local),
                    sizeof(local)) == 0) {
                m_port = fallbackPort;
                fprintf(stderr,
                    "[spidercrab] osc_receiver: bound to fallback UDP port %d "
                    "(original %d was in use)\n",
                    fallbackPort, originalPort);
                return true;
            }

            closeSocket();
        }

        fprintf(stderr, "[spidercrab] osc_receiver: all fallback ports exhausted\n");
        return false;
    }

    // Dispatch a received OSC packet to the appropriate callback
    void dispatchPacket(const std::vector<uint8_t>& data)
    {
        std::string address;
        std::vector<int> intArgs;
        std::vector<std::string> strArgs;

        if (!parseMessage(data, address, intArgs, strArgs)) {
            fprintf(stderr, "[spidercrab] osc_receiver: failed to parse OSC packet "
                            "(%zu bytes)\n",
                data.size());
            return;
        }

        // Dispatch based on address
        if (address == "/playtime/slot/state" && m_slotStateCb) {
            if (intArgs.size() >= 2) {
                int col = intArgs[0];
                int row = intArgs[1];

                // Determine state from stateId (third int) or state name string
                std::string state;
                if (intArgs.size() >= 3) {
                    int stateId = intArgs[2];
                    switch (stateId) {
                    case 0:
                        state = "stopped";
                        break;
                    case 1:
                        state = "playing";
                        break;
                    case 2:
                        state = "recording";
                        break;
                    case 3:
                        state = "empty";
                        break;
                    case 4:
                        state = "queued";
                        break;
                    default:
                        state = "stopped";
                        break;
                    }
                } else if (!strArgs.empty()) {
                    state = strArgs[0];
                } else {
                    state = "stopped";
                }

                m_slotStateCb(col, row, state);
            }
        } else if (address == "/playtime/slot/color" && m_slotStateCb) {
            // Alternative format: color change notification
            if (intArgs.size() >= 2) {
                m_slotStateCb(intArgs[0], intArgs[1], "stopped");
            }
        }
        // Unknown addresses are silently ignored (ReaLearn may send
        // status messages we don't care about)
    }
};

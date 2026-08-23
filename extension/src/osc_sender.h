#pragma once

// ============================================================
// OscSender — Hand-rolled OSC message builder + UDP sender
//
// Builds OSC packets using raw Berkeley sockets (via netinc.h
// portability macros). Cross-platform: same code on Linux,
// Windows, macOS. No external dependencies.
//
// OSC protocol:
//   - Message = address pattern (NUL-padded to 4-byte boundary)
//              + type tag string (comma-prefixed, NUL-padded to
//                4-byte boundary) + arguments (4-byte aligned)
//   - Integers: 4 bytes big-endian
//   - Strings: NUL-padded to 4-byte boundary
//
// Address convention (matching ReaLearn OSC preset):
//   /playtime/slot/<col>/<row>/trigger   (no args — col/row in address)
//   /playtime/slot/<col>/<row>/record    (no args — col/row in address)
//   /playtime/scene/<row>/trigger        (no args — row in address)
// ============================================================

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#ifdef _WIN32
#define _WINSOCKAPI_
#include <winsock2.h>
#include <ws2tcpip.h>
// ssize_t is not defined on Windows; sendto returns int
#include <BaseTsd.h>
typedef SSIZE_T ssize_t;
#else
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#endif

class OscSender {
public:
    OscSender()
        : m_sock(-1)
        , m_remotePort(9000)
        , m_remoteAddr("127.0.0.1")
        , m_warnedNoSocket(false)
    {
        createSocket();
    }

    ~OscSender()
    {
        closeSocket();
    }

    // Non-copyable, movable
    OscSender(const OscSender&) = delete;
    OscSender& operator=(const OscSender&) = delete;

    OscSender(OscSender&& other) noexcept
        : m_sock(other.m_sock)
        , m_remotePort(other.m_remotePort)
        , m_remoteAddr(std::move(other.m_remoteAddr))
        , m_warnedNoSocket(other.m_warnedNoSocket)
    {
        other.m_sock = -1;
    }

    OscSender& operator=(OscSender&& other) noexcept
    {
        if (this != &other) {
            closeSocket();
            m_sock = other.m_sock;
            m_remotePort = other.m_remotePort;
            m_remoteAddr = std::move(other.m_remoteAddr);
            m_warnedNoSocket = other.m_warnedNoSocket;
            other.m_sock = -1;
        }
        return *this;
    }

    // Configure remote endpoint
    void setRemotePort(int port) { m_remotePort = port; }
    void setRemoteAddress(const std::string& addr) { m_remoteAddr = addr; }

    int remotePort() const { return m_remotePort; }
    const std::string& remoteAddress() const { return m_remoteAddr; }

    // Check if socket is valid
    bool isReady() const { return m_sock >= 0; }

    // --- OSC message building (public for testing) ---

    // Calculate padded length of an OSC string (NUL-padded to 4-byte boundary)
    static size_t paddedStringLength(size_t rawLen)
    {
        // Add 1 for NUL terminator, then round up to next 4-byte boundary
        size_t withNul = rawLen + 1;
        return ((withNul + 3) / 4) * 4;
    }

    // Build an OSC message with a single float argument
    std::vector<uint8_t> buildMessageWithFloat(
        const std::string& address, float val) const
    {
        std::vector<uint8_t> buf;

        // 1. Address pattern
        size_t addrLen = paddedStringLength(address.size());
        buf.reserve(addrLen + 8 + 4);
        buf.insert(buf.end(), address.begin(), address.end());
        buf.resize(buf.size() + addrLen - address.size(), 0);

        // 2. Type tag ",f" padded to 4 bytes
        buf.push_back(','); buf.push_back('f'); buf.push_back('\0'); buf.push_back('\0');

        // 3. Float (big-endian IEEE 754)
        uint32_t bits;
        memcpy(&bits, &val, 4);
        buf.push_back(static_cast<uint8_t>((bits >> 24) & 0xFF));
        buf.push_back(static_cast<uint8_t>((bits >> 16) & 0xFF));
        buf.push_back(static_cast<uint8_t>((bits >> 8)  & 0xFF));
        buf.push_back(static_cast<uint8_t>( bits        & 0xFF));

        return buf;
    }

    // Build an address-only OSC message (no arguments)
    std::vector<uint8_t> buildMessage(
        const std::string& address) const
    {
        std::vector<uint8_t> buf;

        // 1. Address pattern (NUL-padded to 4-byte boundary)
        size_t addrLen = paddedStringLength(address.size());
        buf.reserve(addrLen + 4);
        buf.insert(buf.end(), address.begin(), address.end());
        buf.resize(buf.size() + addrLen - address.size(), 0);

        // 2. Empty type tag string (just comma, NUL-padded to 4-byte boundary)
        buf.push_back(',');
        buf.push_back('\0');
        buf.push_back('\0');
        buf.push_back('\0');

        return buf;
    }

    // Build an OSC message from address, type tags, and integer arguments
    std::vector<uint8_t> buildMessage(
        const std::string& address,
        const std::string& typeTags,
        const std::vector<int>& args) const
    {
        std::vector<uint8_t> buf;

        // 1. Address pattern (NUL-padded to 4-byte boundary)
        size_t addrLen = paddedStringLength(address.size());
        buf.reserve(addrLen + 4 + args.size() * 4);
        buf.insert(buf.end(), address.begin(), address.end());
        buf.resize(buf.size() + addrLen - address.size(), 0);

        // 2. Type tag string (comma-prefixed, NUL-padded to 4-byte boundary)
        std::string typeStr = "," + typeTags;
        size_t typeLen = paddedStringLength(typeStr.size());
        buf.insert(buf.end(), typeStr.begin(), typeStr.end());
        buf.resize(buf.size() + typeLen - typeStr.size(), 0);

        // 3. Integer arguments (big-endian, 4 bytes each)
        for (int arg : args) {
            buf.push_back(static_cast<uint8_t>((arg >> 24) & 0xFF));
            buf.push_back(static_cast<uint8_t>((arg >> 16) & 0xFF));
            buf.push_back(static_cast<uint8_t>((arg >> 8) & 0xFF));
            buf.push_back(static_cast<uint8_t>(arg & 0xFF));
        }

        return buf;
    }

    // Build a full OSC message with mixed int and string arguments
    std::vector<uint8_t> buildMessage(
        const std::string& address,
        const std::string& typeTags,
        const std::vector<int>& intArgs,
        const std::vector<std::string>& strArgs) const
    {
        std::vector<uint8_t> buf;

        // 1. Address pattern
        size_t addrLen = paddedStringLength(address.size());
        buf.reserve(addrLen + 4 + intArgs.size() * 4 + strArgs.size() * 16);
        buf.insert(buf.end(), address.begin(), address.end());
        buf.resize(buf.size() + addrLen - address.size(), 0);

        // 2. Type tag string
        std::string typeStr = "," + typeTags;
        size_t typeLen = paddedStringLength(typeStr.size());
        buf.insert(buf.end(), typeStr.begin(), typeStr.end());
        buf.resize(buf.size() + typeLen - typeStr.size(), 0);

        // 3. Integer arguments (big-endian)
        for (int arg : intArgs) {
            buf.push_back(static_cast<uint8_t>((arg >> 24) & 0xFF));
            buf.push_back(static_cast<uint8_t>((arg >> 16) & 0xFF));
            buf.push_back(static_cast<uint8_t>((arg >> 8) & 0xFF));
            buf.push_back(static_cast<uint8_t>(arg & 0xFF));
        }

        // 4. String arguments (NUL-padded to 4-byte boundary)
        for (const auto& str : strArgs) {
            size_t strLen = paddedStringLength(str.size());
            buf.insert(buf.end(), str.begin(), str.end());
            buf.resize(buf.size() + strLen - str.size(), 0);
        }

        return buf;
    }

    // --- Convenience builders ---

    // Build a "trigger slot" message: /playtime/slot/<col>/<row>/trigger  float=1.0
    std::vector<uint8_t> buildTriggerSlotMessage(int col, int row) const
    {
        std::string addr = "/playtime/slot/" + std::to_string(col) + "/"
            + std::to_string(row) + "/trigger";
        return buildMessageWithFloat(addr, 1.0f);
    }

    // Build a "record slot" message: /playtime/slot/<col>/<row>/record  float=1.0
    std::vector<uint8_t> buildRecordSlotMessage(int col, int row) const
    {
        std::string addr = "/playtime/slot/" + std::to_string(col) + "/"
            + std::to_string(row) + "/record";
        return buildMessageWithFloat(addr, 1.0f);
    }

    // Build an "import slot" message: /playtime/slot/<col>/<row>/import  float=1.0
    std::vector<uint8_t> buildImportSlotMessage(int col, int row) const
    {
        std::string addr = "/playtime/slot/" + std::to_string(col) + "/"
            + std::to_string(row) + "/import";
        return buildMessageWithFloat(addr, 1.0f);
    }

    // Build a "clear slot" message: /playtime/slot/<col>/<row>/clear  float=1.0
    std::vector<uint8_t> buildClearSlotMessage(int col, int row) const
    {
        std::string addr = "/playtime/slot/" + std::to_string(col) + "/"
            + std::to_string(row) + "/clear";
        return buildMessageWithFloat(addr, 1.0f);
    }

    // Build a "trigger scene" message: /playtime/scene/<row>/trigger  float=1.0
    std::vector<uint8_t> buildTriggerSceneMessage(int row) const
    {
        std::string addr = "/playtime/scene/" + std::to_string(row) + "/trigger";
        return buildMessageWithFloat(addr, 1.0f);
    }

    // --- Send methods ---

    // Send a pre-built OSC packet
    bool sendPacket(const std::vector<uint8_t>& packet)
    {
        if (m_sock < 0) {
            if (!m_warnedNoSocket) {
                fprintf(stderr, "[spidercrab] osc_sender: no socket available (will retry)\n");
                m_warnedNoSocket = true;
            }
            return false;
        }

        struct sockaddr_in dest;
        memset(&dest, 0, sizeof(dest));
        dest.sin_family = AF_INET;
        dest.sin_port = htons(static_cast<uint16_t>(m_remotePort));
        dest.sin_addr.s_addr = inet_addr(m_remoteAddr.c_str());

        ssize_t sent = sendto(
            m_sock,
            reinterpret_cast<const char*>(packet.data()),
            packet.size(),
            0,
            reinterpret_cast<struct sockaddr*>(&dest),
            sizeof(dest));

        if (sent < 0) {
#ifdef _WIN32
            int err = WSAGetLastError();
            if (err != WSAEWOULDBLOCK) {
                fprintf(stderr, "[spidercrab] osc_sender: sendto failed (err=%d)\n", err);
            }
#else
            if (errno != EWOULDBLOCK && errno != EAGAIN) {
                fprintf(stderr, "[spidercrab] osc_sender: sendto failed (errno=%d)\n", errno);
            }
#endif
            return false;
        }

        return static_cast<size_t>(sent) == packet.size();
    }

    // Trigger a slot: sends /playtime/slot/<col>/<row>/trigger
    bool sendTriggerSlot(int col, int row)
    {
        return sendPacket(buildTriggerSlotMessage(col, row));
    }

    // Record in a slot: sends /playtime/slot/<col>/<row>/record
    bool sendRecordSlot(int col, int row)
    {
        return sendPacket(buildRecordSlotMessage(col, row));
    }

    // Trigger a scene: sends /playtime/scene/<row>/trigger
    bool sendTriggerScene(int row)
    {
        return sendPacket(buildTriggerSceneMessage(row));
    }

    // Import into a slot: sends /playtime/slot/<col>/<row>/import
    bool sendImportSlot(int col, int row)
    {
        return sendPacket(buildImportSlotMessage(col, row));
    }

    // Clear a slot (delete clip): sends /playtime/slot/<col>/<row>/clear
    // Matrix-level actions, as opposed to a single slot.
    //
    // The transport buttons on the Playtime view drive REAPER's transport,
    // which is not the same thing as Playtime's: the matrix has its own
    // playback, its own metronome and its own panic. These reach the
    // "Playtime: Matrix action" target through the shipped ReaLearn preset.
    bool sendMatrixPlay(bool on)
    {
        return sendPacket(buildMessageWithFloat("/playtime/matrix/play", on ? 1.0f : 0.0f));
    }

    bool sendMatrixStop()
    {
        return sendPacket(buildMessageWithFloat("/playtime/matrix/stop", 1.0f));
    }

    /// Playtime's own metronome, which is separate from REAPER's.
    bool sendMatrixClick(bool on)
    {
        return sendPacket(buildMessageWithFloat("/playtime/matrix/click", on ? 1.0f : 0.0f));
    }

    bool sendMatrixPanic()
    {
        return sendPacket(buildMessageWithFloat("/playtime/matrix/panic", 1.0f));
    }

    bool sendMatrixTapTempo()
    {
        return sendPacket(buildMessageWithFloat("/playtime/matrix/taptempo", 1.0f));
    }

    bool sendClearSlot(int col, int row)
    {
        return sendPacket(buildClearSlotMessage(col, row));
    }

private:
    int m_sock;
    int m_remotePort;
    std::string m_remoteAddr;
    bool m_warnedNoSocket;

    void createSocket()
    {
        m_sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, 0));
        if (m_sock < 0) {
            fprintf(stderr, "[spidercrab] osc_sender: failed to create UDP socket\n");
            return;
        }

        // Set non-blocking
#ifdef _WIN32
        unsigned long mode = 1;
        ioctlsocket(m_sock, FIONBIO, &mode);
#else
        int flags = fcntl(m_sock, F_GETFL, 0);
        if (flags >= 0) {
            fcntl(m_sock, F_SETFL, flags | O_NONBLOCK);
        }
#endif

        fprintf(stderr, "[spidercrab] osc_sender: UDP socket created\n");
    }

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
};

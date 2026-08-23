#include "apple_midi.h"

#include <chrono>
#include <cstdio>
#include <cstring>

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

// ============================================================
// Apple's session-control commands (2 ASCII bytes each)
// ============================================================
namespace {
constexpr uint16_t kCmdInvitation          = 0x494E; // 'IN'
constexpr uint16_t kCmdInvitationAccepted  = 0x4F4B; // 'OK'
constexpr uint16_t kCmdInvitationRejected  = 0x4E4F; // 'NO'
constexpr uint16_t kCmdEndSession          = 0x4259; // 'BY'
constexpr uint16_t kCmdSync                = 0x434B; // 'CK'
constexpr uint16_t kCmdReceiverFeedback    = 0x5253; // 'RS'
constexpr uint16_t kCmdBitrateLimit        = 0x524C; // 'RL'

constexpr uint32_t kInviteRetryMs     = 1000;  // Apple: resend invitation every 1s
constexpr uint32_t kMaxInviteAttempts = 12;    // Apple: up to 12 times
constexpr uint32_t kSyncIntervalMs    = 30000; // initiator must sync >= every 60s
constexpr uint32_t kFeedbackIntervalMs = 2000;
constexpr uint32_t kSessionTimeoutMs  = 90000; // no packets at all for 90s -> dead
constexpr uint32_t kMaxDatagramsPerPoll = 64;
constexpr size_t   kMaxDatagramSize = 4096;

// FF FF | command(2) | version(2) | initiatorToken(4) | SSRC(4) | payload...
void buildSessionPacket(std::vector<uint8_t>& out, uint16_t cmd,
    uint32_t token, uint32_t ssrc, const char* name)
{
    out.clear();
    out.reserve(32);
    out.push_back(0xFF);
    out.push_back(0xFF);
    out.push_back(static_cast<uint8_t>(cmd >> 8));
    out.push_back(static_cast<uint8_t>(cmd & 0xFF));
    out.push_back(0x00); // protocol version high
    out.push_back(0x02); // protocol version 2
    out.push_back(static_cast<uint8_t>(token >> 24));
    out.push_back(static_cast<uint8_t>(token >> 16));
    out.push_back(static_cast<uint8_t>(token >> 8));
    out.push_back(static_cast<uint8_t>(token));
    out.push_back(static_cast<uint8_t>(ssrc >> 24));
    out.push_back(static_cast<uint8_t>(ssrc >> 16));
    out.push_back(static_cast<uint8_t>(ssrc >> 8));
    out.push_back(static_cast<uint8_t>(ssrc));
    if (name) {
        out.insert(out.end(), name, name + std::strlen(name));
        out.push_back(0);
    }
}

void pushU32(std::vector<uint8_t>& out, uint32_t v)
{
    out.push_back(static_cast<uint8_t>(v >> 24));
    out.push_back(static_cast<uint8_t>(v >> 16));
    out.push_back(static_cast<uint8_t>(v >> 8));
    out.push_back(static_cast<uint8_t>(v));
}

void pushU64(std::vector<uint8_t>& out, uint64_t v)
{
    for (int i = 7; i >= 0; --i)
        out.push_back(static_cast<uint8_t>(v >> (i * 8)));
}

bool parseSessionPacket(const uint8_t* d, size_t n, uint16_t& cmdOut,
    uint32_t& tokenOut, uint32_t& ssrcOut, std::string& nameOut)
{
    if (!d || n < 14) return false;
    if (d[0] != 0xFF || d[1] != 0xFF) return false;
    cmdOut   = static_cast<uint16_t>((d[2] << 8) | d[3]);
    tokenOut = (static_cast<uint32_t>(d[6]) << 24) | (static_cast<uint32_t>(d[7]) << 16)
        | (static_cast<uint32_t>(d[8]) << 8) | d[9];
    ssrcOut  = (static_cast<uint32_t>(d[10]) << 24) | (static_cast<uint32_t>(d[11]) << 16)
        | (static_cast<uint32_t>(d[12]) << 8) | d[13];
    nameOut.assign(reinterpret_cast<const char*>(d) + 14, n - 14);
    const size_t nul = nameOut.find('\0');
    if (nul != std::string::npos) nameOut.resize(nul);
    return true;
}

uint32_t random32()
{
    static uint64_t s = static_cast<uint64_t>(reinterpret_cast<uintptr_t>(&random32))
        ^ static_cast<uint64_t>(std::chrono::steady_clock::now().time_since_epoch().count());
    s ^= s << 13;
    s ^= s >> 7;
    s ^= s << 17;
    return static_cast<uint32_t>(s);
}
} // namespace

// ============================================================
// ParseRtpMidi — RFC 6295 payload parsing
// ============================================================

int ParseRtpMidi(const uint8_t* data, size_t len,
    const std::function<void(int status, int d1, int d2)>& cb,
    uint16_t* seqOut)
{
    if (!data || len < 12) return -1;
    const uint8_t b0 = data[0];
    if ((b0 >> 6) != 2) return -1;      // RTP version must be 2
    if (b0 & 0x10) return -1;           // X bit: extensions unsupported
    if (seqOut) *seqOut = static_cast<uint16_t>((data[2] << 8) | data[3]);

    const uint8_t* p = data + 12;
    const size_t avail = len - 12;
    if (avail == 0) return 0;

    // MIDI command section header: B J Z P | LEN...
    const uint8_t hdr = p[0];
    const bool B = (hdr & 0x80) != 0;
    const bool Z = (hdr & 0x20) != 0;
    // J (journal present) and P (phantom status) are informational for a
    // receiver that does not validate the journal.

    uint16_t listLen;
    size_t   listStart;
    if (B) {
        if (avail < 2) return -1;
        listLen = static_cast<uint16_t>(((hdr & 0x0F) << 8) | p[1]);
        listStart = 2;
    } else {
        listLen = hdr & 0x0F;
        listStart = 1;
    }
    if (listStart + listLen > avail) return -1;

    const uint8_t* midi = p + listStart;
    const size_t   ml   = listLen;
    size_t pos = 0;
    int running = 0;
    int emitted = 0;

    // 1-4 octet delta time (MIDI-file style variable length)
    auto decodeDelta = [&]() -> bool {
        for (int i = 0; i < 4; ++i) {
            if (pos >= ml) return false;
            const uint8_t b = midi[pos++];
            if (!(b & 0x80)) return true;
        }
        return false; // 5+ octets is malformed
    };

    // Z=1: the list begins with Delta Time 0
    if (Z && !decodeDelta()) return -1;

    while (true) {
        if (pos >= ml) break; // end of list

        // One complete MIDI command
        const uint8_t b = midi[pos++];

        if (b >= 0xF8) {
            // System Real-Time: 1 octet, does not cancel running status
            if (cb) cb(b, 0, 0);
            emitted++;
        } else if (b == 0xF0) {
            // SysEx: skip to 0xF7 (or end of list)
            while (pos < ml && midi[pos] != 0xF7) pos++;
            if (pos < ml) pos++;
            running = 0;
        } else if (b >= 0xF1) {
            // System Common (0xF1..0xF7), cancels running status
            const size_t extra = (b == 0xF2 || b == 0xF3) ? 2 : 1;
            if (pos + extra > ml) return -1;
            pos += extra;
            running = 0;
        } else {
            int status;
            int d1;
            int d2;
            if (b >= 0x80) {
                status = b;
                running = b;
            } else {
                if (!running) return -1; // data byte with no running status
                status = running;
            }
            if ((status & 0xF0) == 0xC0 || (status & 0xF0) == 0xD0) {
                // 1 data byte (program change / channel pressure)
                if (b >= 0x80) {
                    if (pos + 1 > ml) return -1;
                    d1 = midi[pos++];
                } else {
                    d1 = b;
                }
                d2 = 0;
            } else {
                // 2 data bytes
                if (b >= 0x80) {
                    if (pos + 2 > ml) return -1;
                    d1 = midi[pos];
                    d2 = midi[pos + 1];
                    pos += 2;
                } else {
                    if (pos + 1 > ml) return -1;
                    d1 = b;
                    d2 = midi[pos++];
                }
            }
            if (cb) cb(status, d1, d2);
            emitted++;
        }

        if (pos >= ml) break; // no trailing delta time
        if (!decodeDelta()) return -1;
    }
    return emitted;
}

// ============================================================
// RealUdpTransport
// ============================================================

RealUdpTransport::RealUdpTransport() = default;

RealUdpTransport::~RealUdpTransport()
{
    closeAll();
}

int RealUdpTransport::createSocket(uint16_t port, uint16_t& actualPortOut)
{
    int sock = static_cast<int>(::socket(AF_INET, SOCK_DGRAM, 0));
    if (sock < 0) return -1;

#ifdef _WIN32
    unsigned long mode = 1;
    ioctlsocket(sock, FIONBIO, &mode);
#else
    const int flags = fcntl(sock, F_GETFL, 0);
    if (flags >= 0) fcntl(sock, F_SETFL, flags | O_NONBLOCK);
#endif

    int reuse = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR,
        reinterpret_cast<const char*>(&reuse), sizeof(reuse));

    sockaddr_in local;
    std::memset(&local, 0, sizeof(local));
    local.sin_family = AF_INET;
    local.sin_port   = htons(port);
    local.sin_addr.s_addr = INADDR_ANY;

    if (::bind(sock, reinterpret_cast<sockaddr*>(&local), sizeof(local)) < 0) {
        if (port != 0) {
            // Requested port busy: fall back to ephemeral
            sockaddr_in ep;
            std::memset(&ep, 0, sizeof(ep));
            ep.sin_family = AF_INET;
            ep.sin_port   = 0;
            ep.sin_addr.s_addr = INADDR_ANY;
            if (::bind(sock, reinterpret_cast<sockaddr*>(&ep), sizeof(ep)) < 0) {
#ifdef _WIN32
                closesocket(sock);
#else
                ::close(sock);
#endif
                return -1;
            }
        } else {
#ifdef _WIN32
            closesocket(sock);
#else
            ::close(sock);
#endif
            return -1;
        }
    }

    sockaddr_in bound;
    socklen_t blen = sizeof(bound);
    if (getsockname(sock, reinterpret_cast<sockaddr*>(&bound), &blen) == 0) {
        actualPortOut = ntohs(bound.sin_port);
    }
    return sock;
}

bool RealUdpTransport::bind(uint16_t controlPort)
{
    closeAll();
    m_ctl = createSocket(controlPort, m_ctlPort);
    if (m_ctl < 0) return false;
    m_dat = createSocket(controlPort != 0 ? static_cast<uint16_t>(controlPort + 1) : 0, m_datPort);
    if (m_dat < 0) {
        m_dat = createSocket(0, m_datPort);
        if (m_dat < 0) {
            closeAll();
            return false;
        }
    }
    fprintf(stderr, "[spidercrab] applemidi: bound UDP control=%u data=%u\n",
        m_ctlPort, m_datPort);
    return true;
}

void RealUdpTransport::closeAll()
{
    if (m_ctl >= 0) {
#ifdef _WIN32
        closesocket(m_ctl);
#else
        ::close(m_ctl);
#endif
        m_ctl = -1;
    }
    if (m_dat >= 0) {
#ifdef _WIN32
        closesocket(m_dat);
#else
        ::close(m_dat);
#endif
        m_dat = -1;
    }
    m_ctlPort = 0;
    m_datPort = 0;
}

bool RealUdpTransport::sendTo(int sock, const std::string& host, uint16_t port,
    const uint8_t* data, size_t len)
{
    if (sock < 0) return false;
    sockaddr_in dest;
    std::memset(&dest, 0, sizeof(dest));
    dest.sin_family = AF_INET;
    dest.sin_port   = htons(port);
    dest.sin_addr.s_addr = inet_addr(host.c_str());
    if (dest.sin_addr.s_addr == INADDR_NONE) return false;
    const int sent = ::sendto(sock, reinterpret_cast<const char*>(data),
        static_cast<int>(len), 0, reinterpret_cast<sockaddr*>(&dest), sizeof(dest));
    return sent == static_cast<int>(len);
}

bool RealUdpTransport::sendControl(const std::string& host, uint16_t port,
    const uint8_t* data, size_t len)
{
    return sendTo(m_ctl, host, port, data, len);
}

bool RealUdpTransport::sendData(const std::string& host, uint16_t port,
    const uint8_t* data, size_t len)
{
    return sendTo(m_dat, host, port, data, len);
}

int RealUdpTransport::recvDatagram(int sock, uint8_t* data, size_t capacity,
    size_t& lenOut, std::string& fromHost, uint16_t& fromPort)
{
    if (sock < 0) return -1;
    sockaddr_in from;
    socklen_t flen = sizeof(from);
    const int r = ::recvfrom(sock, reinterpret_cast<char*>(data),
        static_cast<int>(capacity), 0, reinterpret_cast<sockaddr*>(&from), &flen);
    if (r < 0) {
#ifdef _WIN32
        const int err = WSAGetLastError();
        if (err == WSAEWOULDBLOCK || err == WSAECONNRESET) return 0;
#else
        if (errno == EWOULDBLOCK || errno == EAGAIN) return 0;
#endif
        return -1;
    }
    if (r == 0) return 0;
    lenOut = static_cast<size_t>(r);
    char ip[64];
    inet_ntop(AF_INET, &from.sin_addr, ip, sizeof(ip));
    fromHost = ip;
    fromPort = ntohs(from.sin_port);
    return 1;
}

int RealUdpTransport::recvControl(uint8_t* data, size_t capacity, size_t& lenOut,
    std::string& fromHost, uint16_t& fromPort)
{
    return recvDatagram(m_ctl, data, capacity, lenOut, fromHost, fromPort);
}

int RealUdpTransport::recvData(uint8_t* data, size_t capacity, size_t& lenOut,
    std::string& fromHost, uint16_t& fromPort)
{
    return recvDatagram(m_dat, data, capacity, lenOut, fromHost, fromPort);
}

// ============================================================
// AppleMidiServer
// ============================================================

AppleMidiServer::AppleMidiServer() = default;

AppleMidiServer::~AppleMidiServer()
{
    stop();
}

void AppleMidiServer::ensureTransport()
{
    if (!m_transport)
        m_transport = std::make_unique<RealUdpTransport>();
}

void AppleMidiServer::setTransport(std::unique_ptr<UdpTransport> transport)
{
    m_transport = std::move(transport);
}

bool AppleMidiServer::start(uint16_t controlPort)
{
    ensureTransport();
    if (m_running) return true;
    if (!m_transport->bind(controlPort)) {
        fprintf(stderr, "[spidercrab] applemidi: failed to bind UDP ports\n");
        return false;
    }
    m_running = true;
    return true;
}

void AppleMidiServer::stop()
{
    if (m_running) {
        sendBye();
        closeSession();
        m_running = false;
    }
}

bool AppleMidiServer::connectTo(const std::string& host, uint16_t controlPort)
{
    if (host.empty()) return false;
    if (!m_running && !start(kDefaultPort)) return false;

    closeSession();

    Session& s = m_session;
    s.host            = host;
    s.peerControlPort = controlPort;
    s.peerDataPort    = static_cast<uint16_t>(controlPort + 1);
    s.myToken         = random32();
    s.mySsrc          = random32();
    s.inviteAttempts  = 0;
    s.state           = State::InvitingControl;
    s.lastActivityMs  = m_nowMs;
    sendInvite(true);
    setState(State::InvitingControl, host);
    return true;
}

void AppleMidiServer::disconnect()
{
    sendBye();
    closeSession();
}

void AppleMidiServer::sendBye()
{
    if (m_session.state == State::Idle || !m_transport) return;
    std::vector<uint8_t> pkt;
    buildSessionPacket(pkt, kCmdEndSession, m_session.myToken, m_session.mySsrc, nullptr);
    m_transport->sendControl(m_session.host, m_session.peerControlPort, pkt.data(), pkt.size());
}

void AppleMidiServer::sendInvite(bool toControlPort)
{
    std::vector<uint8_t> pkt;
    buildSessionPacket(pkt, kCmdInvitation, m_session.myToken, m_session.mySsrc,
        m_sessionName.c_str());
    if (toControlPort) {
        m_transport->sendControl(m_session.host, m_session.peerControlPort, pkt.data(), pkt.size());
    } else {
        m_transport->sendData(m_session.host, m_session.peerDataPort, pkt.data(), pkt.size());
    }
    m_session.lastInviteMs = m_nowMs;
    m_session.inviteAttempts++;
}

void AppleMidiServer::sendAccept(bool toControlPort, bool includeName)
{
    // As a responder we copy the initiator's token (Apple protocol); as an
    // initiator replying to nothing we'd use our own token.
    const uint32_t token = m_session.isResponder ? m_session.peerToken : m_session.myToken;
    std::vector<uint8_t> pkt;
    buildSessionPacket(pkt, kCmdInvitationAccepted, token, m_session.mySsrc,
        includeName ? m_sessionName.c_str() : nullptr);
    if (toControlPort) {
        m_transport->sendControl(m_session.host, m_session.peerControlPort, pkt.data(), pkt.size());
    } else {
        m_transport->sendData(m_session.host, m_session.peerDataPort, pkt.data(), pkt.size());
    }
}

void AppleMidiServer::sendSyncInitiate()
{
    uint64_t ts[1] = { clockTenKHz() };
    sendSync(0, ts);
    m_session.lastSyncMs = m_nowMs;
    m_session.waitingSyncReply = true;
}

void AppleMidiServer::sendSync(uint32_t count, const uint64_t* timestamps)
{
    std::vector<uint8_t> pkt;
    buildSessionPacket(pkt, kCmdSync, m_session.myToken, m_session.mySsrc, nullptr);
    pushU32(pkt, count);
    for (uint32_t i = 0; i <= count; ++i)
        pushU64(pkt, timestamps[i]);
    m_transport->sendData(m_session.host, m_session.peerDataPort, pkt.data(), pkt.size());
}

void AppleMidiServer::sendFeedback()
{
    if (m_session.lastSeq == 0) return;
    std::vector<uint8_t> pkt;
    buildSessionPacket(pkt, kCmdReceiverFeedback, m_session.myToken, m_session.mySsrc, nullptr);
    pushU32(pkt, m_session.lastSeq);
    m_transport->sendControl(m_session.host, m_session.peerControlPort, pkt.data(), pkt.size());
    m_session.lastFeedbackMs = m_nowMs;
}

const char* AppleMidiServer::stateName(State st)
{
    switch (st) {
    case State::Idle:            return "idle";
    case State::InvitingControl:
    case State::InvitingData:    return "connecting";
    case State::Syncing:         return "syncing";
    case State::Open:            return "open";
    case State::Failed:          return "failed";
    }
    return "idle";
}

void AppleMidiServer::setState(State st, const std::string& host)
{
    m_session.state = st;
    if (m_stateCb) m_stateCb(stateName(st), host);
}

void AppleMidiServer::closeSession()
{
    Session old = m_session;
    m_session = Session();
    if (old.state != State::Idle) setState(State::Idle, old.host);
}

void AppleMidiServer::handleControlDatagram(const uint8_t* d, size_t n,
    const std::string& from, uint16_t fromPort)
{
    uint16_t cmd;
    uint32_t token, ssrc;
    std::string name;
    if (!parseSessionPacket(d, n, cmd, token, ssrc, name)) return;

    switch (cmd) {
    case kCmdInvitation: {
        // A remote peer wants to connect to us (responder role).
        if (m_session.state != State::Idle) return; // busy with our own session
        m_session.host            = from;
        m_session.peerControlPort = fromPort;
        m_session.peerDataPort    = static_cast<uint16_t>(fromPort + 1);
        m_session.peerToken       = token;
        m_session.myToken         = random32();
        m_session.mySsrc          = random32();
        m_session.lastActivityMs  = m_nowMs;
        m_session.isResponder     = true;
        setState(State::InvitingControl, from);
        sendAccept(true, true);
        break;
    }
    case kCmdInvitationAccepted:
        if (m_session.isResponder || m_session.state != State::InvitingControl) return;
        m_session.peerSsrc = ssrc;
        m_session.lastActivityMs = m_nowMs;
        m_session.state = State::InvitingData;
        sendInvite(false); // invite on the MIDI port
        break;
    case kCmdInvitationRejected:
        if (m_session.state == State::InvitingControl)
            setState(State::Failed, m_session.host);
        break;
    case kCmdEndSession:
        if (!m_session.host.empty() && from == m_session.host)
            closeSession();
        break;
    default:
        break; // RS/RL/CK on the control port are not expected; ignore
    }
}

void AppleMidiServer::handleDataDatagram(const uint8_t* d, size_t n,
    const std::string& from, uint16_t fromPort)
{
    (void)fromPort;

    // Session packets share the FF FF prefix; anything else is RTP-MIDI.
    if (n >= 2 && d[0] == 0xFF && d[1] == 0xFF) {
        uint16_t cmd;
        uint32_t token, ssrc;
        std::string name;
        if (!parseSessionPacket(d, n, cmd, token, ssrc, name)) return;

        switch (cmd) {
        case kCmdInvitation:
            // Responder flow: invitation on the MIDI port -> accept
            if (m_session.isResponder && from == m_session.host) {
                m_session.state = State::Syncing;
                sendAccept(false, true);
            }
            break;
        case kCmdInvitationAccepted:
            if (!m_session.isResponder && m_session.state == State::InvitingData) {
                m_session.peerSsrc = ssrc;
                m_session.state = State::Syncing;
                sendSyncInitiate();
            }
            break;
        case kCmdInvitationRejected:
            if (m_session.state == State::InvitingData)
                setState(State::Failed, m_session.host);
            break;
        case kCmdEndSession:
            if (!m_session.host.empty() && from == m_session.host)
                closeSession();
            break;
        case kCmdSync: {
            if (n < 18) break;
            const uint32_t count = (static_cast<uint32_t>(d[14]) << 24)
                | (static_cast<uint32_t>(d[15]) << 16)
                | (static_cast<uint32_t>(d[16]) << 8) | d[17];
            if (n < 18 + 8 * (count + 1)) break;
            uint64_t ts[3] = {0, 0, 0};
            for (uint32_t i = 0; i <= count && i < 3; ++i) {
                uint64_t v = 0;
                for (int b = 0; b < 8; ++b)
                    v = (v << 8) | d[18 + i * 8 + b];
                ts[i] = v;
            }
            m_session.lastActivityMs = m_nowMs;
            if (!m_session.isResponder) {
                if (count == 1) {
                    // CK1 from peer completes our CK0 -> send CK2, open
                    uint64_t out[3] = { clockTenKHz(), ts[0], ts[1] };
                    sendSync(2, out);
                    m_session.waitingSyncReply = false;
                    setState(State::Open, m_session.host);
                } else if (count == 0) {
                    uint64_t out[2] = { clockTenKHz(), ts[0] };
                    sendSync(1, out);
                }
            } else {
                if (count == 0) {
                    uint64_t out[2] = { clockTenKHz(), ts[0] };
                    sendSync(1, out);
                    setState(State::Open, from);
                } else if (count == 1) {
                    uint64_t out[3] = { clockTenKHz(), ts[0], ts[1] };
                    sendSync(2, out);
                }
            }
            break;
        }
        default:
            break;
        }
        return;
    }

    // RTP-MIDI data — only when the session is established
    if (m_session.state != State::Open) return;
    if (!m_session.host.empty() && from != m_session.host) return;
    m_session.lastActivityMs = m_nowMs;

    uint16_t seq = 0;
    if (ParseRtpMidi(d, n, m_midiCb, &seq) >= 0) {
        m_session.lastSeq = seq;
    }
}

void AppleMidiServer::poll()
{
    if (!m_running || !m_transport) return;

    uint8_t buf[kMaxDatagramSize];
    size_t len = 0;
    std::string from;
    uint16_t fromPort = 0;

    for (int i = 0; i < kMaxDatagramsPerPoll; ++i) {
        const int r = m_transport->recvControl(buf, sizeof(buf), len, from, fromPort);
        if (r <= 0) break;
        handleControlDatagram(buf, len, from, fromPort);
    }
    for (int i = 0; i < kMaxDatagramsPerPoll; ++i) {
        const int r = m_transport->recvData(buf, sizeof(buf), len, from, fromPort);
        if (r <= 0) break;
        handleDataDatagram(buf, len, from, fromPort);
    }
}

void AppleMidiServer::tick()
{
    tick(nowMs());
}

void AppleMidiServer::tick(uint32_t nowMs)
{
    m_nowMs = nowMs;
    if (!m_running) return;
    Session& s = m_session;
    if (s.state == State::Idle) return;

    // Invitation retry: every 1s, up to 12 attempts
    if ((s.state == State::InvitingControl || s.state == State::InvitingData)
        && nowMs - s.lastInviteMs >= kInviteRetryMs) {
        if (s.inviteAttempts >= kMaxInviteAttempts) {
            setState(State::Failed, s.host);
            return;
        }
        sendInvite(s.state == State::InvitingControl);
    }

    // Open (initiator): repeat clock sync every 30s
    if (s.state == State::Open && !s.isResponder
        && nowMs - s.lastSyncMs >= kSyncIntervalMs) {
        sendSyncInitiate();
    }

    // Receiver feedback so the peer can trim its recovery journal
    if (s.state == State::Open
        && nowMs - s.lastFeedbackMs >= kFeedbackIntervalMs) {
        sendFeedback();
    }

    // Session death: no packets at all for 90s
    if (nowMs - s.lastActivityMs > kSessionTimeoutMs) {
        closeSession();
    }
}

std::string AppleMidiServer::statusJson() const
{
    std::string out = "{\"state\":\"";
    out += stateName(m_session.state);
    out += "\",\"host\":\"";
    out += m_session.host;
    out += "\",\"port\":";
    out += std::to_string(m_session.peerControlPort);
    out += ",\"running\":";
    out += m_running ? "true" : "false";
    out += "}";
    return out;
}

uint32_t AppleMidiServer::nowMs() const
{
    const auto ns = std::chrono::steady_clock::now().time_since_epoch();
    return static_cast<uint32_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(ns).count());
}

uint64_t AppleMidiServer::clockTenKHz() const
{
    const auto us = std::chrono::steady_clock::now().time_since_epoch();
    return static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::microseconds>(us).count() / 100);
}

#pragma once

// ============================================================
// AppleMIDI (RTP-MIDI / RFC 6295) transport for the extension.
//
// Implements the Apple Network MIDI session protocol (see Apple's
// "MIDI Network Driver Protocol" documentation archive) on the
// Windows/Linux side. iOS devices are session *listeners* only, so
// when the iPad's browser sends MIDI via the Web MIDI API into a
// CoreMIDI Network Session, we must be the session *initiator*:
// we send the invitation (IN/OK on both ports), run the clock-sync
// handshake (CK 0/1/2), and then receive the iPad's MIDI stream on
// our data port.
//
// Layout:
//   - control port N + data port N+1 (consecutive UDP ports)
//   - handshake: IN -> OK on control port, IN -> OK on data port,
//     then CK clock sync (count 0/1/2), then live MIDI data
//   - MIDI data is RTP-MIDI (RFC 6295): RTP header (PT 0x61) plus
//     timestamped MIDI commands. Apple always transmits a recovery
//     journal (J=1) but a receiver does not need to parse it, so
//     packets are parsed by the MIDI list LEN and the journal is
//     left as trailing bytes.
//   - sync exchange must repeat at least every 60s (we do 30s);
//     invitations are resent every 1s, up to 12 times.
//
// Everything socket-related lives behind the UdpTransport seam so
// the protocol logic is unit-testable without sockets.
// ============================================================

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

// --- UDP transport seam (fake in tests) ---
class UdpTransport {
public:
    virtual ~UdpTransport() = default;

    // Bind the control port (data port = control+1 when free).
    virtual bool bind(uint16_t controlPort) = 0;
    virtual uint16_t controlPort() const = 0;
    virtual uint16_t dataPort() const = 0;

    virtual bool sendControl(const std::string& host, uint16_t port,
        const uint8_t* data, size_t len) = 0;
    virtual bool sendData(const std::string& host, uint16_t port,
        const uint8_t* data, size_t len) = 0;

    // Receive one datagram (non-blocking). Returns 1 on datagram,
    // 0 when nothing pending, -1 on error.
    virtual int recvControl(uint8_t* data, size_t capacity, size_t& lenOut,
        std::string& fromHost, uint16_t& fromPort) = 0;
    virtual int recvData(uint8_t* data, size_t capacity, size_t& lenOut,
        std::string& fromHost, uint16_t& fromPort) = 0;
};

// Real UDP sockets (winsock on Windows, BSD sockets elsewhere).
class RealUdpTransport : public UdpTransport {
public:
    RealUdpTransport();
    ~RealUdpTransport() override;

    bool bind(uint16_t controlPort) override;
    uint16_t controlPort() const override { return m_ctlPort; }
    uint16_t dataPort() const override { return m_datPort; }

    bool sendControl(const std::string& host, uint16_t port,
        const uint8_t* data, size_t len) override;
    bool sendData(const std::string& host, uint16_t port,
        const uint8_t* data, size_t len) override;

    int recvControl(uint8_t* data, size_t capacity, size_t& lenOut,
        std::string& fromHost, uint16_t& fromPort) override;
    int recvData(uint8_t* data, size_t capacity, size_t& lenOut,
        std::string& fromHost, uint16_t& fromPort) override;

private:
    static int createSocket(uint16_t port, uint16_t& actualPortOut);
    static int recvDatagram(int sock, uint8_t* data, size_t capacity,
        size_t& lenOut, std::string& fromHost, uint16_t& fromPort);
    static bool sendTo(int sock, const std::string& host, uint16_t port,
        const uint8_t* data, size_t len);
    void closeAll();

    int      m_ctl = -1;
    int      m_dat = -1;
    uint16_t m_ctlPort = 0;
    uint16_t m_datPort = 0;
};

// Parse one RTP-MIDI packet. Calls cb(status, d1, d2) for every
// complete MIDI command (running status materialized; delta times
// ignored — Apple streams live-play events with delta time 0).
// Returns the number of commands emitted, or -1 when malformed.
// seqOut, if given, receives the RTP sequence number.
int ParseRtpMidi(const uint8_t* data, size_t len,
    const std::function<void(int status, int d1, int d2)>& cb,
    uint16_t* seqOut = nullptr);

// --- The session server (one peer at a time) ---
class AppleMidiServer {
public:
    using MidiCallback  = std::function<void(int status, int d1, int d2)>;
    using StateCallback = std::function<void(const std::string& state, const std::string& host)>;

    static const uint16_t kDefaultPort = 5004; // iOS Network Session control port

    AppleMidiServer();
    ~AppleMidiServer();

    void setMidiCallback(MidiCallback cb)  { m_midiCb = std::move(cb); }
    void setStateCallback(StateCallback cb) { m_stateCb = std::move(cb); }
    void setSessionName(const std::string& name) { m_sessionName = name; }

    // Bind UDP ports. Idempotent. Returns false when binding fails.
    bool start(uint16_t controlPort = kDefaultPort);
    void stop();
    bool isRunning() const { return m_running; }

    // Initiate a session with the peer (iOS network session).
    // controlPort = peer's control port; data port = controlPort+1.
    bool connectTo(const std::string& host, uint16_t controlPort);
    void disconnect();
    bool isOpen() const { return m_session.state == State::Open; }

    // Drain sockets + advance timers. Call from Run() (~30Hz).
    void poll();
    // Timer advance with the real clock (production; called after poll()).
    void tick();
    // Timer advance with an injected clock (test seam).
    void tick(uint32_t nowMs);

    // JSON object body: {"state":..., "host":..., "port":..., "running":...}
    std::string statusJson() const;

    // Test seam — install a fake transport before start().
    void setTransport(std::unique_ptr<UdpTransport> transport);

private:
    enum class State { Idle, InvitingControl, InvitingData, Syncing, Open, Failed };

    struct Session {
        State     state = State::Idle;
        std::string host;
        uint16_t  peerControlPort = 0;
        uint16_t  peerDataPort    = 0;
        uint32_t  myToken  = 0;   // initiator token (ours)
        uint32_t  mySsrc   = 0;   // our SSRC
        uint32_t  peerToken = 0;  // their initiator token (echoed in our OK)
        uint32_t  peerSsrc = 0;   // from their OK
        uint32_t  inviteAttempts = 0;
        uint32_t  lastInviteMs   = 0;
        uint32_t  lastSyncMs     = 0;
        uint32_t  lastActivityMs = 0;
        bool      waitingSyncReply = false;
        uint16_t  lastSeq = 0;     // last received RTP seq (for RS feedback)
        uint32_t  lastFeedbackMs = 0;
        bool      isResponder = false; // we were invited, not the initiator
    };

    void handleControlDatagram(const uint8_t* d, size_t n,
        const std::string& from, uint16_t fromPort);
    void handleDataDatagram(const uint8_t* d, size_t n,
        const std::string& from, uint16_t fromPort);

    void sendInvite(bool toControlPort);
    void sendAccept(bool toControlPort, bool includeName);
    void sendSyncInitiate();
    void sendSync(uint32_t count, const uint64_t* timestamps);
    void sendFeedback();
    void sendBye();

    void closeSession();       // reset session, fire state callback
    void setState(State st, const std::string& host);
    static const char* stateName(State st);
    void ensureTransport();

    uint32_t nowMs() const;
    uint64_t clockTenKHz() const;

    std::unique_ptr<UdpTransport> m_transport;
    bool        m_running = false;
    std::string m_sessionName = "spidercrab";
    Session     m_session;
    uint32_t    m_nowMs = 0; // clock value from the latest tick()
    MidiCallback  m_midiCb;
    StateCallback m_stateCb;
};

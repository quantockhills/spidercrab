// AppleMIDI (RTP-MIDI) protocol tests — no sockets required.
// The session state machine runs against a fake in-memory transport.

#include <gtest/gtest.h>

#include "apple_midi.h"

#include <cstring>
#include <tuple>
#include <vector>

namespace {

// ------------------------------------------------------------
// Helpers to build AppleMIDI/RTP-MIDI packets
// ------------------------------------------------------------

void pushU32(std::vector<uint8_t>& p, uint32_t v)
{
    p.push_back(static_cast<uint8_t>(v >> 24));
    p.push_back(static_cast<uint8_t>(v >> 16));
    p.push_back(static_cast<uint8_t>(v >> 8));
    p.push_back(static_cast<uint8_t>(v));
}

void pushU64(std::vector<uint8_t>& p, uint64_t v)
{
    for (int i = 7; i >= 0; --i)
        p.push_back(static_cast<uint8_t>(v >> (i * 8)));
}

// Common AppleMIDI session packet: FF FF | cmd | version 2 | token | ssrc | name
// (name omitted when empty — the CK/RS packets carry no name terminator)
std::vector<uint8_t> sessionPacket(uint16_t cmd, uint32_t token, uint32_t ssrc,
    const std::string& name = "")
{
    std::vector<uint8_t> p;
    p.push_back(0xFF);
    p.push_back(0xFF);
    p.push_back(static_cast<uint8_t>(cmd >> 8));
    p.push_back(static_cast<uint8_t>(cmd & 0xFF));
    p.push_back(0x00);
    p.push_back(0x02);
    pushU32(p, token);
    pushU32(p, ssrc);
    if (!name.empty()) {
        p.insert(p.end(), name.begin(), name.end());
        p.push_back(0);
    }
    return p;
}

std::vector<uint8_t> syncPacket(uint32_t token, uint32_t ssrc, uint32_t count,
    const std::vector<uint64_t>& timestamps)
{
    std::vector<uint8_t> p = sessionPacket(0x434B, token, ssrc);
    pushU32(p, count);
    for (uint64_t t : timestamps) pushU64(p, t);
    return p;
}

// RTP header (V=2, M=1, PT=0x61) + MIDI command section
std::vector<uint8_t> rtpPacket(uint16_t seq, const std::vector<uint8_t>& commandSection)
{
    std::vector<uint8_t> p;
    p.push_back(0x80);                  // V=2 P=0 X=0 CC=0
    p.push_back(static_cast<uint8_t>(0xE1)); // M=1, PT=0x61
    p.push_back(static_cast<uint8_t>(seq >> 8));
    p.push_back(static_cast<uint8_t>(seq & 0xFF));
    p.push_back(0x00); p.push_back(0x00); p.push_back(0x00); p.push_back(0x00); // ts
    p.push_back(0x00); p.push_back(0x00); p.push_back(0x00); p.push_back(0x01); // ssrc
    p.insert(p.end(), commandSection.begin(), commandSection.end());
    return p;
}

// MIDI command section: B J Z P | LEN, then the MIDI list
std::vector<uint8_t> cmdSection(const std::vector<uint8_t>& midiList,
    bool big = false, bool journal = false, bool zflag = true)
{
    std::vector<uint8_t> s;
    const uint8_t flags = (big ? 0x80 : 0) | (journal ? 0x40 : 0) | (zflag ? 0x20 : 0);
    if (big) {
        s.push_back(flags | static_cast<uint8_t>((midiList.size() >> 8) & 0x0F));
        s.push_back(static_cast<uint8_t>(midiList.size() & 0xFF));
    } else {
        s.push_back(flags | static_cast<uint8_t>(midiList.size() & 0x0F));
    }
    s.insert(s.end(), midiList.begin(), midiList.end());
    return s;
}

// ------------------------------------------------------------
// FakeTransport — records what we sent, feeds what we enqueue
// ------------------------------------------------------------
struct Datagram {
    std::string host;
    uint16_t    port;
    std::vector<uint8_t> data;
};

class FakeTransport : public UdpTransport {
public:
    bool bind(uint16_t) override
    {
        bindCalled = true;
        return true;
    }
    uint16_t controlPort() const override { return 5004; }
    uint16_t dataPort() const override { return 5005; }

    bool sendControl(const std::string& h, uint16_t p, const uint8_t* d, size_t n) override
    {
        sentControl.push_back({h, p, std::vector<uint8_t>(d, d + n)});
        return true;
    }
    bool sendData(const std::string& h, uint16_t p, const uint8_t* d, size_t n) override
    {
        sentData.push_back({h, p, std::vector<uint8_t>(d, d + n)});
        return true;
    }

    int recvControl(uint8_t* d, size_t cap, size_t& lenOut,
        std::string& from, uint16_t& fromPort) override
    {
        return pop(controlIn, d, cap, lenOut, from, fromPort);
    }
    int recvData(uint8_t* d, size_t cap, size_t& lenOut,
        std::string& from, uint16_t& fromPort) override
    {
        return pop(dataIn, d, cap, lenOut, from, fromPort);
    }

    static int pop(std::vector<Datagram>& q, uint8_t* d, size_t cap,
        size_t& lenOut, std::string& from, uint16_t& fromPort)
    {
        if (q.empty()) return 0;
        const Datagram& g = q.front();
        if (g.data.size() > cap) return -1;
        std::memcpy(d, g.data.data(), g.data.size());
        lenOut = g.data.size();
        from = g.host;
        fromPort = g.port;
        q.erase(q.begin());
        return 1;
    }

    bool bindCalled = false;
    std::vector<Datagram> sentControl, sentData;
    std::vector<Datagram> controlIn, dataIn;
};

// ------------------------------------------------------------
// ParseRtpMidi unit tests
// ------------------------------------------------------------
class RtpMidiParseTest : public ::testing::Test {
protected:
    std::vector<std::tuple<int, int, int>> out;
    std::function<void(int, int, int)> cb;
    int result = 0;

    void parse(const std::vector<uint8_t>& pkt)
    {
        out.clear();
        result = ParseRtpMidi(pkt.data(), pkt.size(), cb);
    }
    void parseSection(const std::vector<uint8_t>& list)
    {
        parse(rtpPacket(1, list));
    }

    void SetUp() override
    {
        cb = [this](int a, int b, int c) { out.emplace_back(a, b, c); };
    }
};

TEST_F(RtpMidiParseTest, NoteOn)
{
    parseSection(cmdSection({0x00, 0x90, 0x3C, 0x64}));
    EXPECT_EQ(result, 1);
    ASSERT_EQ(out.size(), 1u);
    EXPECT_EQ(out[0], std::make_tuple(0x90, 60, 100));
}

TEST_F(RtpMidiParseTest, RunningStatus)
{
    parseSection(cmdSection({0x00, 0x90, 0x3C, 0x64, 0x00, 0x3E, 0x64}));
    ASSERT_EQ(out.size(), 2u);
    EXPECT_EQ(out[0], std::make_tuple(0x90, 60, 100));
    EXPECT_EQ(out[1], std::make_tuple(0x90, 62, 100));
}

TEST_F(RtpMidiParseTest, TwoByteMessageRunningStatus)
{
    parseSection(cmdSection({0x00, 0xC0, 0x05, 0x00, 0x07}));
    ASSERT_EQ(out.size(), 2u);
    EXPECT_EQ(out[0], std::make_tuple(0xC0, 5, 0));
    EXPECT_EQ(out[1], std::make_tuple(0xC0, 7, 0));
}

TEST_F(RtpMidiParseTest, NoLeadingDeltaZ0)
{
    parseSection(cmdSection({0x90, 0x3C, 0x64, 0x00, 0x90, 0x3E, 0x64}, false, false, false));
    ASSERT_EQ(out.size(), 2u);
    EXPECT_EQ(out[0], std::make_tuple(0x90, 60, 100));
}

TEST_F(RtpMidiParseTest, ExtendedTwelveBitLength)
{
    // 3-byte command + 6 x 4-byte (delta+command) = 27 bytes -> B=1 header
    std::vector<uint8_t> list = {0x90, 0x3C, 0x64};
    for (int i = 0; i < 6; ++i) {
        list.push_back(0x00);
        list.push_back(0x90);
        list.push_back(0x3E + i);
        list.push_back(0x64);
    }
    parseSection(cmdSection(list, /*big=*/true, /*journal=*/false, /*zflag=*/false));
    EXPECT_EQ(result, 7);
    ASSERT_EQ(out.size(), 7u);
}

TEST_F(RtpMidiParseTest, SysExSkipped)
{
    parseSection(cmdSection({0x00, 0xF0, 0x01, 0x02, 0xF7, 0x00, 0x90, 0x3C, 0x64}));
    ASSERT_EQ(out.size(), 1u);
    EXPECT_EQ(out[0], std::make_tuple(0x90, 60, 100));
}

TEST_F(RtpMidiParseTest, RealTimeEmbedded)
{
    parseSection(cmdSection({0x00, 0xF8, 0x00, 0x90, 0x3C, 0x64}));
    ASSERT_EQ(out.size(), 2u);
    EXPECT_EQ(out[0], std::make_tuple(0xF8, 0, 0));
    EXPECT_EQ(out[1], std::make_tuple(0x90, 60, 100));
}

TEST_F(RtpMidiParseTest, GuardPacketEmptyList)
{
    parseSection(cmdSection({}, false, /*journal=*/true, false));
    EXPECT_EQ(result, 0);
    EXPECT_TRUE(out.empty());
}

TEST_F(RtpMidiParseTest, DataByteWithoutRunningStatusIsMalformed)
{
    parseSection(cmdSection({0x00, 0x3C, 0x64}));
    EXPECT_EQ(result, -1);
}

TEST_F(RtpMidiParseTest, TruncatedCommandIsMalformed)
{
    parseSection(cmdSection({0x00, 0x90, 0x3C}));
    EXPECT_EQ(result, -1);
}

TEST_F(RtpMidiParseTest, RejectsNonRtpVersion)
{
    std::vector<uint8_t> pkt = rtpPacket(1, cmdSection({0x00, 0x90, 0x3C, 0x64}));
    pkt[0] = 0x40; // V=1
    parse(pkt);
    EXPECT_EQ(result, -1);
}

// ------------------------------------------------------------
// AppleMidiServer session tests
// ------------------------------------------------------------
class AppleMidiServerTest : public ::testing::Test {
protected:
    FakeTransport* fake = nullptr;
    std::unique_ptr<AppleMidiServer> server;
    std::vector<std::string> states;
    std::vector<std::tuple<int, int, int>> midi;

    void SetUp() override
    {
        auto t = std::make_unique<FakeTransport>();
        fake = t.get();
        server = std::make_unique<AppleMidiServer>();
        server->setTransport(std::move(t));
        server->setStateCallback(
            [this](const std::string& s, const std::string&) { states.push_back(s); });
        server->setMidiCallback(
            [this](int a, int b, int c) { midi.emplace_back(a, b, c); });
        ASSERT_TRUE(server->start(5004));
    }

    uint32_t tokenFrom(const std::vector<uint8_t>& pkt) const
    {
        if (pkt.size() < 10) {
            EXPECT_GE(pkt.size(), 10u);
            return 0;
        }
        return (static_cast<uint32_t>(pkt[6]) << 24) | (static_cast<uint32_t>(pkt[7]) << 16)
            | (static_cast<uint32_t>(pkt[8]) << 8) | pkt[9];
    }

    static constexpr const char* kPeer = "192.168.1.50";
};

TEST_F(AppleMidiServerTest, ConnectSendsInvitationOnControlPort)
{
    ASSERT_TRUE(server->connectTo(kPeer, 5004));
    ASSERT_EQ(fake->sentControl.size(), 1u);
    const Datagram& d = fake->sentControl[0];
    EXPECT_EQ(d.host, kPeer);
    EXPECT_EQ(d.port, 5004);
    ASSERT_GE(d.data.size(), 14u);
    EXPECT_EQ(d.data[0], 0xFF);
    EXPECT_EQ(d.data[1], 0xFF);
    EXPECT_EQ(d.data[2], 'I');
    EXPECT_EQ(d.data[3], 'N');
    EXPECT_EQ(d.data[4], 0x00);
    EXPECT_EQ(d.data[5], 0x02);
    EXPECT_NE(tokenFrom(d.data), 0u);
    EXPECT_TRUE(fake->sentData.empty());
    ASSERT_FALSE(states.empty());
    EXPECT_EQ(states.back(), "connecting");
}

TEST_F(AppleMidiServerTest, FullHandshakeOpensSessionAndRoutesMidi)
{
    ASSERT_TRUE(server->connectTo(kPeer, 5004));
    const uint32_t myToken = tokenFrom(fake->sentControl[0].data);

    // 1. Responder accepts on the control port
    fake->controlIn.push_back({kPeer, 5004, sessionPacket(0x4F4B, myToken, 0x2222, "iPad")});
    server->poll();
    ASSERT_EQ(fake->sentData.size(), 1u);
    EXPECT_EQ(fake->sentData[0].host, kPeer);
    EXPECT_EQ(fake->sentData[0].port, 5005);
    EXPECT_EQ(fake->sentData[0].data[2], 'I');
    EXPECT_EQ(fake->sentData[0].data[3], 'N');

    // 2. Responder accepts on the data port -> we initiate clock sync
    fake->dataIn.push_back({kPeer, 5005, sessionPacket(0x4F4B, myToken, 0x2222)});
    server->poll();
    ASSERT_GE(fake->sentData.size(), 2u);
    const Datagram& ck0 = fake->sentData[1];
    EXPECT_EQ(ck0.data[2], 'C');
    EXPECT_EQ(ck0.data[3], 'K');

    // 3. Their CK1 (count=1, two timestamps) -> we send CK2 and open
    fake->dataIn.push_back({kPeer, 5005, syncPacket(myToken, 0x2222, 1, {1000, 2000})});
    server->poll();
    ASSERT_GE(fake->sentData.size(), 3u);
    EXPECT_EQ(fake->sentData[2].data[2], 'C');
    EXPECT_TRUE(server->isOpen());
    EXPECT_EQ(states.back(), "open");

    // 4. Live MIDI flows
    fake->dataIn.push_back({kPeer, 5005,
        rtpPacket(7, cmdSection({0x00, 0x90, 0x3C, 0x64, 0x00, 0x80, 0x3C, 0x40}))});
    server->poll();
    ASSERT_EQ(midi.size(), 2u);
    EXPECT_EQ(midi[0], std::make_tuple(0x90, 60, 100));
    EXPECT_EQ(midi[1], std::make_tuple(0x80, 60, 64));

    // 5. Peer ends the session
    fake->dataIn.push_back({kPeer, 5005, sessionPacket(0x4259, myToken, 0x2222)});
    server->poll();
    EXPECT_FALSE(server->isOpen());
    EXPECT_EQ(states.back(), "idle");
}

TEST_F(AppleMidiServerTest, InvitationRetriedThenFails)
{
    ASSERT_TRUE(server->connectTo(kPeer, 5004));
    for (int i = 1; i <= 11; ++i) server->tick(static_cast<uint32_t>(i * 1000));
    ASSERT_EQ(fake->sentControl.size(), 12u); // initial + 11 retries
    server->tick(12000);
    EXPECT_EQ(states.back(), "failed");
    EXPECT_FALSE(server->isOpen());
}

TEST_F(AppleMidiServerTest, MidiIgnoredBeforeSessionOpen)
{
    fake->dataIn.push_back({kPeer, 5005, rtpPacket(1, cmdSection({0x00, 0x90, 0x3C, 0x64}))});
    server->poll();
    EXPECT_TRUE(midi.empty());
    EXPECT_FALSE(server->isOpen());
}

TEST_F(AppleMidiServerTest, ResponderFlowAcceptsInvitation)
{
    // 1. They invite us on our control port -> we accept
    fake->controlIn.push_back({kPeer, 5004, sessionPacket(0x494E, 0xAABB, 0x1111, "mac")});
    server->poll();
    ASSERT_EQ(fake->sentControl.size(), 1u);
    EXPECT_EQ(fake->sentControl[0].data[2], 'O');
    EXPECT_EQ(fake->sentControl[0].data[3], 'K');
    EXPECT_EQ(tokenFrom(fake->sentControl[0].data), 0xAABB); // echo their token
    EXPECT_EQ(states.back(), "connecting");

    // 2. They invite us on the data port -> accept
    fake->dataIn.push_back({kPeer, 5005, sessionPacket(0x494E, 0xAABB, 0x1111)});
    server->poll();
    ASSERT_EQ(fake->sentData.size(), 1u);
    EXPECT_EQ(fake->sentData[0].data[2], 'O');

    // 3. They start clock sync -> we reply CK1, session opens
    fake->dataIn.push_back({kPeer, 5005, syncPacket(0xAABB, 0x1111, 0, {500})});
    server->poll();
    ASSERT_GE(fake->sentData.size(), 2u);
    EXPECT_EQ(fake->sentData[1].data[2], 'C');
    EXPECT_TRUE(server->isOpen());
    EXPECT_EQ(states.back(), "open");
}

TEST_F(AppleMidiServerTest, DisconnectSendsByeAndResets)
{
    ASSERT_TRUE(server->connectTo(kPeer, 5004));
    const uint32_t myToken = tokenFrom(fake->sentControl[0].data);
    fake->controlIn.push_back({kPeer, 5004, sessionPacket(0x4F4B, myToken, 0x2222)});
    server->poll();
    fake->dataIn.push_back({kPeer, 5005, sessionPacket(0x4F4B, myToken, 0x2222)});
    server->poll();
    fake->dataIn.push_back({kPeer, 5005, syncPacket(myToken, 0x2222, 1, {1000, 2000})});
    server->poll();
    ASSERT_TRUE(server->isOpen());

    server->disconnect();
    ASSERT_FALSE(fake->sentControl.empty());
    const Datagram& bye = fake->sentControl.back();
    EXPECT_EQ(bye.data[2], 'B');
    EXPECT_EQ(bye.data[3], 'Y');
    EXPECT_FALSE(server->isOpen());
    EXPECT_EQ(states.back(), "idle");
}

TEST_F(AppleMidiServerTest, StatusJsonReflectsSession)
{
    server->connectTo(kPeer, 5004);
    const std::string s = server->statusJson();
    EXPECT_NE(s.find("\"state\":\"connecting\""), std::string::npos);
    EXPECT_NE(s.find("\"host\":\"192.168.1.50\""), std::string::npos);
    EXPECT_NE(s.find("\"port\":5004"), std::string::npos);
}

} // namespace

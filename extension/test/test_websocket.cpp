#include <gtest/gtest.h>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

// ============================================================
// WebSocket frame parsing tests
//
// These tests validate the core WebSocket framing protocol:
//   - Frame construction (matching SendFrame logic)
//   - Frame parsing (matching ParseFrames logic)
//   - Masking/unmasking (client-to-server frames)
//   - Opcode dispatch (text, ping, pong, close)
//
// We test the logic via standalone helper functions that
// replicate the same algorithm used in websocket_server.cpp.
// ============================================================

// ---- Helpers matching WebSocketServer implementation ----

constexpr int MAX_FRAME_SIZE = 1024 * 1024;

struct ParsedFrame {
    int     opcode;
    bool    masked;
    uint8_t maskKey[4];
    std::string payload;
    bool    valid = false;
};

// Build a server-to-client frame (unmasked) — same algorithm as SendFrame
static std::vector<char> buildFrame(int opcode, const std::string& payload)
{
    std::vector<char> frame;
    frame.push_back(static_cast<char>(0x80 | opcode)); // FIN + opcode

    size_t len = payload.size();
    if (len < 126) {
        frame.push_back(static_cast<char>(len));
    } else if (len < 65536) {
        frame.push_back(126);
        frame.push_back(static_cast<char>(len >> 8));
        frame.push_back(static_cast<char>(len & 0xFF));
    } else {
        frame.push_back(127);
        for (int i = 7; i >= 0; i--)
            frame.push_back(static_cast<char>(len >> (i * 8)));
    }

    // Server-to-client: no mask
    frame.insert(frame.end(), payload.begin(), payload.end());
    return frame;
}

// Build a client-to-server frame (masked) — what a browser client would send
static std::vector<char> buildMaskedFrame(int opcode, const std::string& payload,
    const uint8_t maskKey[4])
{
    std::vector<char> frame;
    frame.push_back(static_cast<char>(0x80 | opcode)); // FIN + opcode

    size_t len = payload.size();
    if (len < 126) {
        frame.push_back(static_cast<char>(0x80 | len)); // mask bit set
    } else if (len < 65536) {
        frame.push_back(static_cast<char>(0x80 | 126));
        frame.push_back(static_cast<char>(len >> 8));
        frame.push_back(static_cast<char>(len & 0xFF));
    } else {
        frame.push_back(static_cast<char>(0x80 | 127));
        for (int i = 7; i >= 0; i--)
            frame.push_back(static_cast<char>(len >> (i * 8)));
    }

    // Mask key
    for (int i = 0; i < 4; i++)
        frame.push_back(static_cast<char>(maskKey[i]));

    // Masked payload
    for (size_t i = 0; i < len; i++)
        frame.push_back(static_cast<char>(payload[i] ^ maskKey[i % 4]));

    return frame;
}

// Parse a single WebSocket frame from data — same algorithm as ParseFrames
static ParsedFrame parseFrame(const std::vector<char>& data)
{
    ParsedFrame result  = {};
    result.valid        = false;

    if (data.size() < 2)
        return result;

    result.opcode       = data[0] & 0x0F;
    result.masked       = (data[1] & 0x80) != 0;
    uint64_t payloadLen = data[1] & 0x7F;

    size_t headerSize = 2;
    if (payloadLen == 126) {
        if (data.size() < 4)
            return result;
        payloadLen = (static_cast<unsigned char>(data[2]) << 8)
            | static_cast<unsigned char>(data[3]);
        headerSize = 4;
    } else if (payloadLen == 127) {
        if (data.size() < 10)
            return result;
        payloadLen = 0;
        for (int i = 0; i < 8; i++)
            payloadLen = (payloadLen << 8) | static_cast<unsigned char>(data[2 + i]);
        headerSize = 10;
    }

    if (result.masked)
        headerSize += 4;

    if (data.size() < headerSize + payloadLen)
        return result;

    // Extract mask key
    if (result.masked) {
        for (int i = 0; i < 4; i++)
            result.maskKey[i] = static_cast<unsigned char>(data[headerSize - 4 + i]);
    }

    // Unmask payload
    if (payloadLen > 0 && payloadLen < MAX_FRAME_SIZE) {
        result.payload.resize(payloadLen);
        for (uint64_t i = 0; i < payloadLen; i++) {
            result.payload[i] = data[headerSize + i];
            if (result.masked)
                result.payload[i] ^= result.maskKey[i % 4];
        }
    }

    result.valid = true;
    return result;
}

// ============================================================
// Frame construction tests
// ============================================================

TEST(FrameTest, BuildSmallUnmaskedFrame)
{
    // Payload < 126 bytes: 2-byte header
    auto frame = buildFrame(0x1, "Hello");
    ASSERT_GE(frame.size(), 2u);
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x81); // FIN + text opcode
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 5);    // length = 5, no mask
    EXPECT_EQ(std::string(frame.data() + 2, frame.size() - 2), "Hello");
}

TEST(FrameTest, BuildMediumUnmaskedFrame)
{
    // Payload between 126 and 65535: 4-byte header
    std::string payload(200, 'A');
    auto frame = buildFrame(0x1, payload);
    ASSERT_GE(frame.size(), 4u);
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x81);
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 126);          // extended length marker
    EXPECT_EQ(static_cast<unsigned char>(frame[2]), 0);            // high byte
    EXPECT_EQ(static_cast<unsigned char>(frame[3]), 200);          // low byte
    EXPECT_EQ(std::string(frame.data() + 4, frame.size() - 4), payload);
}

TEST(FrameTest, BuildLargeUnmaskedFrame)
{
    // Payload >= 65536: 10-byte header
    std::string payload(70000, 'B');
    auto frame = buildFrame(0x1, payload);
    ASSERT_GE(frame.size(), 10u);
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x81);
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 127); // 64-bit length marker
    // Frame length is 70000 = 0x11170
    EXPECT_EQ(static_cast<unsigned char>(frame[2]), 0);
    EXPECT_EQ(static_cast<unsigned char>(frame[9]), 0x70);
    EXPECT_EQ(std::string(frame.data() + 10, frame.size() - 10), payload);
}

TEST(FrameTest, BuildPingFrame)
{
    auto frame = buildFrame(0x9, "ping");
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x89); // FIN + ping
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 4);
}

TEST(FrameTest, BuildPongFrame)
{
    auto frame = buildFrame(0xA, "pong");
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x8A); // FIN + pong
}

TEST(FrameTest, BuildCloseFrame)
{
    auto frame = buildFrame(0x8, "");
    EXPECT_EQ(static_cast<unsigned char>(frame[0]), 0x88); // FIN + close
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 0);    // empty payload
    EXPECT_EQ(frame.size(), 2u);
}

// ============================================================
// Frame parsing tests (unmasked frames)
// ============================================================

TEST(FrameTest, ParseSmallUnmasked)
{
    auto frame    = buildFrame(0x1, "Hello, World!");
    auto parsed   = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x1);
    EXPECT_FALSE(parsed.masked);
    EXPECT_EQ(parsed.payload, "Hello, World!");
}

TEST(FrameTest, ParseMediumUnmasked)
{
    std::string payload(300, 'X');
    auto frame  = buildFrame(0x1, payload);
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload, payload);
}

TEST(FrameTest, ParseEmptyPayload)
{
    auto frame  = buildFrame(0x1, "");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x1);
    EXPECT_TRUE(parsed.payload.empty());
}

// ============================================================
// Masked frame tests (client-to-server)
// ============================================================

TEST(FrameTest, BuildAndParseMaskedFrame)
{
    const uint8_t maskKey[4] = { 0x12, 0x34, 0x56, 0x78 };
    std::string   payload    = "Hello, masked world!";
    auto          frame      = buildMaskedFrame(0x1, payload, maskKey);

    // Verify mask bit is set
    EXPECT_TRUE(frame[1] & 0x80);

    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_TRUE(parsed.masked);
    EXPECT_EQ(parsed.opcode, 0x1);
    EXPECT_EQ(parsed.payload, payload); // should be correctly unmasked

    // Verify the raw payload bytes are different (masked)
    ASSERT_GT(frame.size(), 6u); // 2 header + 4 mask key = 6
    size_t payloadStart = 6;     // 2 header + 4 mask key
    EXPECT_NE(std::string(frame.data() + payloadStart, payload.size()), payload);
}

TEST(FrameTest, MaskKeyPreservesCorrectKey)
{
    const uint8_t maskKey[4] = { 0xDE, 0xAD, 0xBE, 0xEF };
    auto          frame      = buildMaskedFrame(0x1, "test", maskKey);
    auto          parsed     = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.maskKey[0], 0xDE);
    EXPECT_EQ(parsed.maskKey[1], 0xAD);
    EXPECT_EQ(parsed.maskKey[2], 0xBE);
    EXPECT_EQ(parsed.maskKey[3], 0xEF);
}

TEST(FrameTest, MaskingRoundTrip)
{
    // Verify that masking then unmasking returns the original
    const uint8_t maskKey[4] = { 0x00, 0xFF, 0xAA, 0x55 };
    std::string   original   = "Round trip test data with bytes!";
    auto          frame      = buildMaskedFrame(0x1, original, maskKey);
    auto          parsed     = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload, original);
}

TEST(FrameTest, MaskingWithNullBytes)
{
    // Payload with null bytes
    const uint8_t maskKey[4] = { 0x01, 0x02, 0x03, 0x04 };
    std::string   original;
    original += '\x00';
    original += '\x01';
    original += '\x02';
    original += '\xFF';

    auto frame  = buildMaskedFrame(0x1, original, maskKey);
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload, original);
}

// ============================================================
// Opcode dispatch tests
// ============================================================

TEST(FrameTest, ParsePingFrame)
{
    auto frame  = buildFrame(0x9, "pingdata");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x9);
    EXPECT_EQ(parsed.payload, "pingdata");
}

TEST(FrameTest, ParsePongFrame)
{
    auto frame  = buildFrame(0xA, "pongdata");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0xA);
}

TEST(FrameTest, ParseCloseFrame)
{
    auto frame  = buildFrame(0x8, "");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x8);
    EXPECT_TRUE(parsed.payload.empty());
}

TEST(FrameTest, ParseCloseFrameWithPayload)
{
    auto frame  = buildFrame(0x8, "\x03\xE8"); // status code 1000
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x8);
    EXPECT_EQ(parsed.payload.size(), 2u);
}

// ============================================================
// Edge cases
// ============================================================

TEST(FrameTest, TooShortToParse)
{
    // Less than 2 bytes
    std::vector<char> data = { static_cast<char>(0x81) };
    auto              parsed = parseFrame(data);
    EXPECT_FALSE(parsed.valid);
}

TEST(FrameTest, MaxPayloadSizeCheck)
{
    // Just under the limit
    std::string payload(MAX_FRAME_SIZE - 1, 'X');
    auto        frame  = buildFrame(0x1, payload);
    auto        parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload.size(), MAX_FRAME_SIZE - 1u);
}

TEST(FrameTest, PayloadOfLength126)
{
    // Exactly 126 bytes — boundary between small and extended
    std::string payload(126, 'B');
    auto        frame  = buildFrame(0x1, payload);
    auto        parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload, payload);
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 126);
}

TEST(FrameTest, PayloadOfLength65536)
{
    // Exactly 65536 bytes — boundary between medium and large
    std::string payload(65536, 'C');
    auto        frame  = buildFrame(0x1, payload);
    auto        parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.payload.size(), 65536u);
    EXPECT_EQ(static_cast<unsigned char>(frame[1]), 127);
}

TEST(FrameTest, ContinuationFrame)
{
    // Opcode 0 = continuation frame
    auto frame  = buildFrame(0x0, "continuation data");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x0);
    EXPECT_EQ(parsed.payload, "continuation data");
}

TEST(FrameTest, BinaryFrame)
{
    // Opcode 2 = binary frame
    auto frame  = buildFrame(0x2, "\x00\x01\x02\x03\xFF");
    auto parsed = parseFrame(frame);
    EXPECT_TRUE(parsed.valid);
    EXPECT_EQ(parsed.opcode, 0x2);
    EXPECT_EQ(parsed.payload, "\x00\x01\x02\x03\xFF");
}

// ============================================================
// Outbound send queue (Issue #136)
//
// JNL_Connection::send() is all-or-nothing: hand it more than the
// socket buffer has free and it writes nothing at all and returns
// -1. SendFrame used to call it once per frame and discard that
// return value, so any response larger than the 64KB buffer was
// silently dropped and the client waited for a reply that never
// went out. The FX list is the one response big enough to hit it.
//
// These exercise WebSocketServer::DrainSendQueue directly, against
// a sink that models JNL's behaviour.
// ============================================================

#include "../src/websocket_server.h"

namespace {

// Models a JNL connection: a fixed-size buffer that refuses oversized
// writes outright, and that only empties when the socket is serviced
// (once per Run() tick).
class FakeSink {
public:
    explicit FakeSink(int capacity) : m_capacity(capacity) { }

    int freeSpace() const { return m_capacity - (int)m_buffered.size(); }

    void write(const char* p, int n)
    {
        // Mirrors JNL: all-or-nothing. A correct caller never trips this.
        ASSERT_LE(n, freeSpace()) << "wrote more than the sink had room for";
        m_buffered.append(p, n);
    }

    // Socket drains the buffer; everything written so far goes on the wire.
    void tick()
    {
        m_received += m_buffered;
        m_buffered.clear();
    }

    const std::string& received() const { return m_received; }

private:
    int         m_capacity;
    std::string m_buffered;
    std::string m_received;
};

// Run the drain loop the way the server does: once per tick, with the
// socket flushing between ticks. Returns the number of ticks taken.
int drainFully(std::string& queue, FakeSink& sink, int maxTicks = 1000)
{
    int ticks = 0;
    while (!queue.empty() && ticks < maxTicks) {
        WebSocketServer::DrainSendQueue(
            queue,
            [&sink]() { return sink.freeSpace(); },
            [&sink](const char* p, int n) { sink.write(p, n); });
        sink.tick();
        ticks++;
    }
    return ticks;
}

std::string makePayload(size_t bytes)
{
    std::string s;
    s.reserve(bytes);
    for (size_t i = 0; i < bytes; i++)
        s.push_back((char)('a' + (i % 26)));
    return s;
}

} // namespace

TEST(SendQueueTest, SmallPayloadGoesOutInOneTick)
{
    std::string queue = makePayload(100);
    const std::string expected = queue;

    FakeSink sink(65536);
    EXPECT_EQ(drainFully(queue, sink), 1);
    EXPECT_EQ(sink.received(), expected);
}

// The actual regression: a response larger than the socket buffer.
TEST(SendQueueTest, PayloadLargerThanSocketBufferArrivesInFull)
{
    std::string queue = makePayload(90 * 1024); // ~a Mac's FX list
    const std::string expected = queue;

    FakeSink sink(65536);
    drainFully(queue, sink);

    EXPECT_TRUE(queue.empty()) << "queue not fully drained";
    EXPECT_EQ(sink.received().size(), expected.size());
    EXPECT_EQ(sink.received(), expected) << "bytes arrived corrupted or out of order";
}

TEST(SendQueueTest, VeryLargePayloadArrivesInFull)
{
    std::string queue = makePayload(5 * 1024 * 1024);
    const std::string expected = queue;

    FakeSink sink(65536);
    drainFully(queue, sink, 200);

    EXPECT_TRUE(queue.empty());
    EXPECT_EQ(sink.received(), expected);
}

TEST(SendQueueTest, OrderIsPreservedAcrossManyQueuedFrames)
{
    std::string queue;
    std::string expected;
    for (int i = 0; i < 500; i++) {
        const std::string frame = "frame" + std::to_string(i) + ";";
        queue += frame;
        expected += frame;
    }

    FakeSink sink(1024); // deliberately tiny, forces many ticks
    drainFully(queue, sink);

    EXPECT_EQ(sink.received(), expected);
}

TEST(SendQueueTest, StopsCleanlyWhenSinkIsFull)
{
    std::string queue = makePayload(1000);

    FakeSink sink(400);
    // One drain pass with no socket flush: takes what fits, leaves the rest.
    WebSocketServer::DrainSendQueue(
        queue,
        [&sink]() { return sink.freeSpace(); },
        [&sink](const char* p, int n) { sink.write(p, n); });

    EXPECT_EQ(queue.size(), 600u) << "should retain exactly what didn't fit";
    EXPECT_EQ(sink.freeSpace(), 0);
}

TEST(SendQueueTest, EmptyQueueIsANoOp)
{
    std::string queue;
    FakeSink sink(65536);

    WebSocketServer::DrainSendQueue(
        queue,
        [&sink]() { return sink.freeSpace(); },
        [&sink](const char* p, int n) { sink.write(p, n); });

    EXPECT_TRUE(queue.empty());
    EXPECT_TRUE(sink.received().empty());
}

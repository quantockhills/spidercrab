// FastMidiServer tests — pure frame parsing + upgrade response, no sockets.

#include <gtest/gtest.h>

#include "fast_midi_server.h"

#include <vector>

namespace {

// Client-to-server frames are masked per RFC 6455
std::vector<char> maskedTextFrame(const std::string& payload)
{
    std::vector<char> f;
    f.push_back(static_cast<char>(0x81)); // FIN + text
    const size_t len = payload.size();
    if (len < 126) {
        f.push_back(static_cast<char>(0x80 | len));
    } else {
        f.push_back(static_cast<char>(0x80 | 126));
        f.push_back(static_cast<char>((len >> 8) & 0xFF));
        f.push_back(static_cast<char>(len & 0xFF));
    }
    const unsigned char key[4] = {1, 2, 3, 4};
    f.insert(f.end(), key, key + 4);
    for (size_t i = 0; i < len; i++)
        f.push_back(static_cast<char>(payload[i] ^ key[i % 4]));
    return f;
}

TEST(FastMidiUpgradeTest, Rfc6455HandshakeVector)
{
    // The RFC 6455 spec example
    const std::string response = FastMidiServer::BuildUpgradeResponse("dGhlIHNhbXBsZSBub25jZQ==");
    EXPECT_NE(response.find("101 Switching Protocols"), std::string::npos);
    EXPECT_NE(response.find("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), std::string::npos);
}

class FastMidiParseTest : public ::testing::Test {
protected:
    std::vector<std::tuple<int, int, int>> notes;
    FastMidiServer::NoteCallback cb;

    void SetUp() override
    {
        cb = [this](int a, int b, int c) { notes.emplace_back(a, b, c); };
    }

    int parse(const std::vector<char>& buf)
    {
        std::vector<char> copy = buf;
        return FastMidiServer::ParseFrames(copy, cb);
    }
};

TEST_F(FastMidiParseTest, NoteOnFrame)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":60,"velocity":100,"channel":0})");
    EXPECT_EQ(parse(frame), 1);
    ASSERT_EQ(notes.size(), 1u);
    EXPECT_EQ(notes[0], std::make_tuple(0x90, 60, 100));
}

TEST_F(FastMidiParseTest, NoteOffFrame)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOff","note":60,"channel":0})");
    EXPECT_EQ(parse(frame), 1);
    ASSERT_EQ(notes.size(), 1u);
    EXPECT_EQ(notes[0], std::make_tuple(0x80, 60, 0));
}

TEST_F(FastMidiParseTest, ChannelIsPreserved)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":36,"velocity":90,"channel":9})");
    EXPECT_EQ(parse(frame), 1);
    ASSERT_EQ(notes.size(), 1u);
    EXPECT_EQ(notes[0], std::make_tuple(0x99, 36, 90)); // drum channel
}

TEST_F(FastMidiParseTest, DefaultVelocityIs100)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":64})");
    EXPECT_EQ(parse(frame), 1);
    ASSERT_EQ(notes.size(), 1u);
    EXPECT_EQ(notes[0], std::make_tuple(0x90, 64, 100));
}

TEST_F(FastMidiParseTest, MultipleFramesInOneBuffer)
{
    std::vector<char> buf = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":60,"velocity":100})");
    const auto off = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOff","note":60})");
    buf.insert(buf.end(), off.begin(), off.end());
    EXPECT_EQ(parse(buf), 2);
    ASSERT_EQ(notes.size(), 2u);
}

TEST_F(FastMidiParseTest, PartialFrameWaits)
{
    std::vector<char> buf = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":60,"velocity":100})");
    buf.pop_back(); // truncate the last payload byte
    EXPECT_EQ(parse(buf), 0);
    EXPECT_TRUE(notes.empty());
}

TEST_F(FastMidiParseTest, CloseFrameDropsConnection)
{
    const auto frame = maskedTextFrame("");
    std::vector<char> buf = frame;
    buf[0] = static_cast<char>(0x88); // FIN + close opcode
    EXPECT_EQ(parse(buf), -1);
}

TEST_F(FastMidiParseTest, NonNoteCommandsAreIgnored)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"fx/setParam","paramIdx":0,"value":0.5})");
    EXPECT_EQ(parse(frame), 1);
    EXPECT_TRUE(notes.empty());
}

TEST_F(FastMidiParseTest, InvalidNoteIsDropped)
{
    const auto frame = maskedTextFrame(
        R"({"type":"command","command":"midi/noteOn","note":200,"velocity":100})");
    EXPECT_EQ(parse(frame), 1);
    EXPECT_TRUE(notes.empty());
}

TEST_F(FastMidiParseTest, UnmaskedFrameStillParses)
{
    // Server-side leniency: no mask bit set
    const std::string payload = R"({"type":"command","command":"midi/noteOn","note":62,"velocity":80})";
    std::vector<char> f;
    f.push_back(static_cast<char>(0x81));
    f.push_back(static_cast<char>(payload.size()));
    f.insert(f.end(), payload.begin(), payload.end());
    EXPECT_EQ(parse(f), 1);
    ASSERT_EQ(notes.size(), 1u);
    EXPECT_EQ(notes[0], std::make_tuple(0x90, 62, 80));
}

} // namespace

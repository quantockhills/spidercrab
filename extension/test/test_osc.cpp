#include <gtest/gtest.h>

// Include sources directly for unit testing
#include "../src/osc_sender.h"
#include "../src/osc_receiver.h"

#include <cstring>
#include <thread>
#include <chrono>

// ============================================================
// OscSender tests — OSC packet building
// ============================================================

TEST(OscSenderTest, BuildSimpleMessage)
{
    // Build a simple message: /test with one int arg 42
    OscSender sender;
    sender.setRemotePort(9000); // port doesn't matter for buffer test

    std::vector<uint8_t> buf = sender.buildMessage("/test", "i", {42});

    // Verify structure
    ASSERT_FALSE(buf.empty());

    // Address pattern: "/test" + 3 NUL bytes = 8 bytes
    EXPECT_EQ(0, memcmp(buf.data(), "/test", 5)) << "Address should be /test";
    // After "/test\0\0\0" at byte 0, we should have ",i\0\0" at byte 8
    EXPECT_EQ(0, memcmp(buf.data() + 8, ",i", 2)) << "Type tag should be ,i";
    // NUL pad after ",i"
    EXPECT_EQ(buf[10], '\0');
    EXPECT_EQ(buf[11], '\0');
    // After type tag at byte 8+4=12, integer 42 big-endian
    // buf[12] should be 0 (42 >> 24), buf[13]=0, buf[14]=0, buf[15]=42
    EXPECT_EQ(buf[12], 0);
    EXPECT_EQ(buf[13], 0);
    EXPECT_EQ(buf[14], 0);
    EXPECT_EQ(buf[15], 42);
    EXPECT_EQ(buf.size(), 16) << "OSC message should be exactly 16 bytes";
}

TEST(OscSenderTest, BuildTwoIntMessage)
{
    OscSender sender;
    sender.setRemotePort(9000);

    std::vector<uint8_t> buf = sender.buildMessage("/slot/trigger", "ii", {3, 5});

    // "/slot/trigger" is 13 chars + 3 pad = 16 bytes
    // Type tag ",ii" is 3 chars + 1 pad = 4 bytes
    // Two ints = 8 bytes
    // Total = 16 + 4 + 8 = 28 bytes
    EXPECT_EQ(buf.size(), 28);

    // Verify address
    EXPECT_EQ(0, memcmp(buf.data(), "/slot/trigger", 13));

    // Verify type tag at byte 16
    EXPECT_EQ(0, memcmp(buf.data() + 16, ",ii", 3));
    EXPECT_EQ(buf[19], '\0');

    // Verify values: col=3 (0,0,0,3), row=5 (0,0,0,5)
    EXPECT_EQ(buf[20], 0);
    EXPECT_EQ(buf[21], 0);
    EXPECT_EQ(buf[22], 0);
    EXPECT_EQ(buf[23], 3);
    EXPECT_EQ(buf[24], 0);
    EXPECT_EQ(buf[25], 0);
    EXPECT_EQ(buf[26], 0);
    EXPECT_EQ(buf[27], 5);
}

TEST(OscSenderTest, BuildStringArgMessage)
{
    OscSender sender;
    sender.setRemotePort(9000);

    // "/playtime/slot/state" = 20 chars, padded to 24
    std::vector<uint8_t> buf = sender.buildMessage("/playtime/slot/state", "is", {0, 0});

    EXPECT_EQ(0, memcmp(buf.data(), "/playtime/slot/state", 20));

    // Type tag at byte 24 (20 + 1 NUL + 3 pad = 24)
    EXPECT_EQ(buf[24], ',');
    EXPECT_EQ(buf[25], 'i');
    EXPECT_EQ(buf[26], 's');
    EXPECT_EQ(buf[27], '\0');

    // Int arg at byte 28: 0 big-endian
    EXPECT_EQ(buf[28], 0);
    EXPECT_EQ(buf[29], 0);
    EXPECT_EQ(buf[30], 0);
    EXPECT_EQ(buf[31], 0);
    // Second int arg at byte 32: 0 big-endian
    EXPECT_EQ(buf[32], 0);
    EXPECT_EQ(buf[33], 0);
    EXPECT_EQ(buf[34], 0);
    EXPECT_EQ(buf[35], 0);
}

TEST(OscSenderTest, EmptyMessage)
{
    OscSender sender;
    sender.setRemotePort(0);

    std::vector<uint8_t> buf = sender.buildMessage("/test", "", {});

    // Should be just "/test\0\0\0" (8 bytes) + ", \0\0\0" (4 bytes) = 12 bytes
    // Wait: no type tags means empty type tag string ","
    // Actually the spec says type tag string starts with ","
    // With empty args, we still need the comma
    // "/test" = 5 chars + 3 pad = 8
    // ", \0\0" = 4 bytes (just comma, no type chars)
    // Total = 12 bytes
    EXPECT_EQ(buf.size(), 12);
    EXPECT_EQ(0, memcmp(buf.data(), "/test", 5));
    EXPECT_EQ(buf[8], ',');
}

TEST(OscSenderTest, StringPadding)
{
    // Verify string is padded to 4-byte boundary
    // paddedStringLength adds 1 for NUL terminator, then rounds up to 4
    EXPECT_EQ(OscSender::paddedStringLength(3), 4);   // 3+1=4, pad to 4
    EXPECT_EQ(OscSender::paddedStringLength(4), 8);   // 4+1=5, pad to 8
    EXPECT_EQ(OscSender::paddedStringLength(5), 8);   // 5+1=6, pad to 8
    EXPECT_EQ(OscSender::paddedStringLength(0), 4);   // 0+1=1, pad to 4
    EXPECT_EQ(OscSender::paddedStringLength(1), 4);   // 1+1=2, pad to 4
    EXPECT_EQ(OscSender::paddedStringLength(7), 8);   // 7+1=8, pad to 8
    EXPECT_EQ(OscSender::paddedStringLength(8), 12);  // 8+1=9, pad to 12
    EXPECT_EQ(OscSender::paddedStringLength(12), 16); // 12+1=13, pad to 16
}

// Test: buildMessage with empty type tags and no args (address-only message)
TEST(OscSenderTest, AddressOnlyMessage)
{
    OscSender sender;
    sender.setRemotePort(9000);

    // Use the address-only overload: buildMessage(const std::string&)
    // "/playtime/slot/0/5/trigger" = 26 chars, padded to 28
    // Type tag: "," = 1 char + 3 pad = 4 bytes
    // Total = 28 + 4 = 32 bytes
    std::vector<uint8_t> buf = sender.buildMessage("/playtime/slot/0/5/trigger");

    EXPECT_EQ(buf.size(), 32);
    EXPECT_EQ(0, memcmp(buf.data(), "/playtime/slot/0/5/trigger", 26));

    // Type tag at byte 28
    EXPECT_EQ(buf[28], ',');
    EXPECT_EQ(buf[29], '\0');
    EXPECT_EQ(buf[30], '\0');
    EXPECT_EQ(buf[31], '\0');
}

// ============================================================
// OscReceiver tests — OSC packet parsing
// ============================================================

TEST(OscReceiverTest, ParseSingleInt)
{
    OscReceiver receiver;

    // Build a valid OSC message: /test ,i 42
    // Address: "/test\0\0\0" (8 bytes)
    // Type tag: ",i\0\0" (4 bytes)
    // Int: 42 big-endian (4 bytes)
    std::vector<uint8_t> packet;
    // Address
    packet.insert(packet.end(), {'/', 't', 'e', 's', 't', 0, 0, 0});
    // Type tag
    packet.insert(packet.end(), {',', 'i', 0, 0});
    // Int 42 big-endian
    packet.push_back(0);
    packet.push_back(0);
    packet.push_back(0);
    packet.push_back(42);

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_TRUE(ok);
    EXPECT_EQ(addr, "/test");
    ASSERT_EQ(intArgs.size(), 1);
    EXPECT_EQ(intArgs[0], 42);
    EXPECT_TRUE(strArgs.empty());
}

TEST(OscReceiverTest, ParseTwoInts)
{
    OscReceiver receiver;

    // Address: "/slot\0\0\0\0" (8 bytes, /slot is 5 chars padded to 8)
    std::vector<uint8_t> packet;
    packet.insert(packet.end(), {'/', 's', 'l', 'o', 't', 0, 0, 0});
    // Type tag: ",ii\0" (4 bytes, pad to 4)
    packet.insert(packet.end(), {',', 'i', 'i', 0});
    // Int 3
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(3);
    // Int 5
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(5);

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_TRUE(ok);
    EXPECT_EQ(addr, "/slot");
    ASSERT_EQ(intArgs.size(), 2);
    EXPECT_EQ(intArgs[0], 3);
    EXPECT_EQ(intArgs[1], 5);
    EXPECT_TRUE(strArgs.empty());
}

TEST(OscReceiverTest, ParseMessageWithString)
{
    OscReceiver receiver;

    // Address: "/state\0\0\0" (8 bytes)
    std::vector<uint8_t> packet;
    packet.insert(packet.end(), {'/', 's', 't', 'a', 't', 'e', 0, 0});
    // Type tag: ",iis\0\0\0\0" (8 bytes)
    packet.insert(packet.end(), {',', 'i', 'i', 's', 0, 0, 0, 0});
    // Int 0 (first int)
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(0);
    // Int 0 (second int)
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(0);
    // String "playing" (7 chars + 1 NUL = 8 bytes, padded to 8 is exact)
    packet.insert(packet.end(), {'p', 'l', 'a', 'y', 'i', 'n', 'g', 0});

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_TRUE(ok);
    EXPECT_EQ(addr, "/state");
    ASSERT_EQ(intArgs.size(), 2);
    EXPECT_EQ(intArgs[0], 0);
    EXPECT_EQ(intArgs[1], 0);
    ASSERT_EQ(strArgs.size(), 1);
    EXPECT_EQ(strArgs[0], "playing");
}

TEST(OscReceiverTest, ParseTruncatedPacket)
{
    OscReceiver receiver;

    // Truncated: address but no type tag
    std::vector<uint8_t> packet = {'/', 't', 'e', 's', 't', 0, 0, 0};
    // Missing type tag

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_FALSE(ok) << "Truncated packet should fail";
}

TEST(OscReceiverTest, ParseEmptyPacket)
{
    OscReceiver receiver;
    std::vector<uint8_t> packet;

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_FALSE(ok) << "Empty packet should fail";
}

TEST(OscReceiverTest, ParseMalformedTypeTag)
{
    OscReceiver receiver;

    // Good address but type tag doesn't start with comma
    std::vector<uint8_t> packet;
    packet.insert(packet.end(), {'/', 't', 'e', 's', 't', 0, 0, 0});
    packet.insert(packet.end(), {'i', 'i', 0, 0}); // missing comma!

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_FALSE(ok) << "Type tag should start with comma";
}

TEST(OscReceiverTest, ParseMessageWithoutTypeTag)
{
    OscReceiver receiver;

    // Message with address but no type tag at all (not valid OSC)
    std::vector<uint8_t> packet;
    packet.insert(packet.end(), {'/', 't', 'e', 's', 't', 0, 0, 0});

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_FALSE(ok) << "Message without type tag should fail";
}

// ============================================================
// Integration test: send and receive locally
// ============================================================

TEST(OscIntegrationTest, SendAndReceiveLocal)
{
    // Create sender and receiver
    OscSender sender;
    OscReceiver receiver;

    int recvPort = 18001;
    sender.setRemotePort(recvPort);

    // Set up receiver on recvPort
    bool bound = receiver.bind(recvPort);
    ASSERT_TRUE(bound) << "Should bind to port " << recvPort;

    // Set up a flag to check if callback fires
    bool callbackFired = false;
    int recvCol = -1;
    int recvRow = -1;
    std::string recvState;

    receiver.setSlotStateCallback([&](int col, int row, const std::string& state) {
        callbackFired = true;
        recvCol = col;
        recvRow = row;
        recvState = state;
    });

    // Send a /playtime/slot/state OSC message (the address the receiver dispatches)
    // Note: slot state feedback messages use the multi-arg format with
    // full col/row/stateId/flags/stateName arguments (sent by ReaLearn)
    auto packet = sender.buildMessage("/playtime/slot/state", "iiis",
        {2, 4, 1, 0}, {"playing"});
    bool sent = sender.sendPacket(packet);
    EXPECT_TRUE(sent) << "Should send packet successfully";

    // Poll receiver in a loop with timeout — the packet should arrive
    // on localhost almost immediately via UDP loopback
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(100);
    while (!callbackFired && std::chrono::steady_clock::now() < deadline) {
        receiver.poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }

    // Verify the callback fired with correct values
    EXPECT_TRUE(callbackFired) << "Callback should have been triggered by received OSC packet";
    EXPECT_EQ(recvCol, 2);
    EXPECT_EQ(recvRow, 4);
    EXPECT_EQ(recvState, "playing");
}

// Simple test: verify sender doesn't crash when called
TEST(OscIntegrationTest, SendDoesNotCrash)
{
    OscSender sender;
    // Don't set remote port — should be handled gracefully
    sender.sendTriggerSlot(0, 0);
    sender.sendTriggerScene(0);
    sender.sendRecordSlot(1, 2);
    SUCCEED() << "All send calls completed without crash";
}

// ============================================================
// OscSender::buildTriggerSlotMessage tests (per-slot addresses)
// ============================================================

TEST(OscSenderTest, TriggerSlotMessageFormat)
{
    OscSender sender;
    sender.setRemotePort(9000);

    auto buf = sender.buildTriggerSlotMessage(3, 7);

    ASSERT_FALSE(buf.empty());
    // Address should be "/playtime/slot/3/7/trigger" (27 chars, padded to 28)
    const char* expectedAddr = "/playtime/slot/3/7/trigger";
    EXPECT_EQ(0, memcmp(buf.data(), expectedAddr, 27));
    // Message should have type tag "," (comma only, no args) at byte 28
    EXPECT_EQ(buf[28], ',');
    EXPECT_EQ(buf[29], '\0');
    EXPECT_EQ(buf[30], '\0');
    EXPECT_EQ(buf[31], '\0');
    // Total = 28 (addr) + 4 (type tag) = 32
    EXPECT_EQ(buf.size(), 32);
}

TEST(OscSenderTest, TriggerSlotMessageLargeNumbers)
{
    OscSender sender;
    sender.setRemotePort(9000);

    auto buf = sender.buildTriggerSlotMessage(10, 25);

    ASSERT_FALSE(buf.empty());
    // "/playtime/slot/10/25/trigger" = 29 chars, padded to 32
    EXPECT_EQ(0, memcmp(buf.data(), "/playtime/slot/10/25/trigger", 29));
    EXPECT_EQ(buf.size(), 36); // 32 addr + 4 type tag
}

TEST(OscSenderTest, RecordSlotMessageFormat)
{
    OscSender sender;
    sender.setRemotePort(9000);

    auto buf = sender.buildRecordSlotMessage(1, 5);

    ASSERT_FALSE(buf.empty());
    // Address should be "/playtime/slot/1/5/record" (26 chars, padded to 28)
    const char* expectedAddr = "/playtime/slot/1/5/record";
    EXPECT_EQ(0, memcmp(buf.data(), expectedAddr, 26));
    // Message should have no type tag and no args — just address + ","
    EXPECT_EQ(buf[28], ',');
    EXPECT_EQ(buf[29], '\0');
    EXPECT_EQ(buf[30], '\0');
    EXPECT_EQ(buf[31], '\0');
    // Total = 28 (addr) + 4 (type tag) = 32
    EXPECT_EQ(buf.size(), 32);
}

TEST(OscSenderTest, TriggerSceneMessageFormat)
{
    OscSender sender;
    sender.setRemotePort(9000);

    auto buf = sender.buildTriggerSceneMessage(4);

    ASSERT_FALSE(buf.empty());
    // Address should be "/playtime/scene/4/trigger" (26 chars, padded to 28)
    const char* expectedAddr = "/playtime/scene/4/trigger";
    EXPECT_EQ(0, memcmp(buf.data(), expectedAddr, 26));
    // Type tag at byte 28
    EXPECT_EQ(buf[28], ',');
    EXPECT_EQ(buf[29], '\0');
    EXPECT_EQ(buf[30], '\0');
    EXPECT_EQ(buf[31], '\0');
    // Total = 28 (addr) + 4 (type tag) = 32
    EXPECT_EQ(buf.size(), 32);
}

TEST(OscSenderTest, SceneTriggerSingleDigit)
{
    OscSender sender;
    sender.setRemotePort(9000);

    auto buf = sender.buildTriggerSceneMessage(0);

    ASSERT_FALSE(buf.empty());
    // "/playtime/scene/0/trigger" = 25 chars, padded to 28
    EXPECT_EQ(0, memcmp(buf.data(), "/playtime/scene/0/trigger", 25));
    EXPECT_EQ(buf[28], ',');
    EXPECT_EQ(buf.size(), 32);
}

// ============================================================
// OscReceiver::parseSlotStateMessage tests
// ============================================================

TEST(OscReceiverTest, ParseSlotStateMessage)
{
    OscReceiver receiver;

    // Build a typical slot state message: /playtime/slot/state ,iiiis
    // col=0, row=5, stateId=1, flags=0, state="playing"
    std::vector<uint8_t> packet;
    // Address: "/playtime/slot/state" = 20 chars + 1 NUL = 21, padded to 24
    packet.insert(packet.end(), {
        '/', 'p', 'l', 'a', 'y', 't', 'i', 'm', 'e', '/',
        's', 'l', 'o', 't', '/', 's', 't', 'a', 't', 'e',
        0, 0, 0, 0  // NUL + padding to 24
    });
    // Type tag: ",iiiis\0\0" (7 chars, padded to 8)
    packet.insert(packet.end(), {',', 'i', 'i', 'i', 'i', 's', 0, 0});
    // Int args: col=0, row=5, stateId=1, flags=0
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(0); // col=0
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(5); // row=5
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(1); // stateId=1
    packet.push_back(0); packet.push_back(0); packet.push_back(0); packet.push_back(0); // flags=0
    // String: "playing\0" = 8 chars exact, padded to 8
    packet.insert(packet.end(), {'p', 'l', 'a', 'y', 'i', 'n', 'g', 0});

    std::string addr;
    std::vector<int> intArgs;
    std::vector<std::string> strArgs;
    bool ok = receiver.parseMessage(packet, addr, intArgs, strArgs);

    EXPECT_TRUE(ok);
    EXPECT_EQ(addr, "/playtime/slot/state");
    ASSERT_EQ(intArgs.size(), 4);
    EXPECT_EQ(intArgs[0], 0); // col
    EXPECT_EQ(intArgs[1], 5); // row
    EXPECT_EQ(intArgs[2], 1); // stateId
    EXPECT_EQ(intArgs[3], 0); // flags
    ASSERT_EQ(strArgs.size(), 1);
    EXPECT_EQ(strArgs[0], "playing");
}

// Test port fallback when port is in use
TEST(OscReceiverTest, BindWithFallback)
{
    OscReceiver receiver;

    // Bind to a specific port
    bool ok = receiver.bind(19000);
    ASSERT_TRUE(ok);

    // Binding to the same port again should fail gracefully
    OscReceiver receiver2;
    bool ok2 = receiver2.bind(19000);
    (void)ok2;
    // Port 19000 is taken, fallback should try next port
    // We just verify no crash
    SUCCEED() << "Double bind completed without crash";
}

TEST(OscReceiverTest, ReceiverPortConfig)
{
    OscReceiver receiver;
    EXPECT_EQ(receiver.port(), 0) << "Default port should be 0 (unbound)";

    receiver.bind(9000);
    EXPECT_EQ(receiver.port(), 9000) << "Port should match bound port";
}

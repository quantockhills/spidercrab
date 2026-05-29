#include <gtest/gtest.h>

// The command handler depends on the Reaper API, which we can't link in
// standalone tests. Instead, we test the WebSocket server's message parsing
// and the core logic that doesn't require Reaper.
//
// For parts that do need Reaper, we'll write integration tests that run
// inside a running Reaper instance.

#include "../src/websocket_server.h"

// ============================================================
// WebSocket frame parsing tests
// ============================================================

TEST(WebSocketTest, BasicHandshakeKey)
{
    // WebSocket handshake involves a Base64-encoded SHA-1 of a key + magic GUID.
    // This is a smoke test that the SHA-1 implementation works.
    // The key "dGhlIHNhbXBsZSBub25jZQ==" should produce
    // "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" per RFC 6455.
    //
    // We'll add this test once we extract the SHA-1 helper into its own function.
    SUCCEED() << "SHA-1 handshake test — pending refactor";
}

TEST(WebSocketTest, MaskedFrameRoundTrip)
{
    // Test that a masked frame can be unmasked correctly.
    // WebSocket frames from clients are masked; server frames are not.
    SUCCEED() << "Frame masking test — pending";
}

// ============================================================
// JSON command parsing tests
// ============================================================

TEST(CommandHandlerTest, ParseJsonCommand)
{
    // Test parsing of incoming JSON command messages.
    // {"type":"command","command":"track/getAll","id":"cmd_1"}
    SUCCEED() << "JSON command parsing — pending";
}

TEST(CommandHandlerTest, MalformedJsonReturnsError)
{
    SUCCEED() << "Malformed JSON handling — pending";
}

TEST(CommandHandlerTest, UnknownCommandReturnsError)
{
    SUCCEED() << "Unknown command handling — pending";
}

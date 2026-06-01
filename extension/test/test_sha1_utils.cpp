#include <gtest/gtest.h>
#include <cstring>
#include <string>
#include <vector>

#include "../src/sha1_utils.h"

// ============================================================
// Streaming SHA-1 API tests
// ============================================================

TEST(StreamingSha1Test, InitZeroesContext)
{
    Sha1Context ctx;
    memset(&ctx, 0xFF, sizeof(ctx));
    sha1_init(&ctx);
    EXPECT_EQ(ctx.h[0], 0x67452301u);
    EXPECT_EQ(ctx.h[4], 0xC3D2E1F0u);
    EXPECT_EQ(ctx.blockLen, 0u);
    EXPECT_EQ(ctx.bitCount, 0u);
}

TEST(StreamingSha1Test, Rfc6455KnownVector)
{
    // RFC 6455 §4.2.2 known vector via streaming API
    std::string key   = "dGhlIHNhbXBsZSBub25jZQ==";
    std::string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    Sha1Context ctx;
    sha1_init(&ctx);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(magic.data()),
                magic.size());
    unsigned char hash[20];
    sha1_final(&ctx, hash);

    std::string acceptKey = base64_encode(hash, 20);
    EXPECT_EQ(acceptKey, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
}

TEST(StreamingSha1Test, MultiUpdateSameAsSingle)
{
    // Splitting input across multiple sha1_update calls should produce
    // the same result as a single call.
    std::string input = "The quick brown fox jumps over the lazy dog";

    // Single-shot via sha1_hash
    unsigned char hashSingle[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()),
              input.size(), hashSingle);

    // Multi-update via streaming API
    Sha1Context ctx;
    sha1_init(&ctx);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data()), 10);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data() + 10), 10);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data() + 20),
                input.size() - 20);
    unsigned char hashMulti[20];
    sha1_final(&ctx, hashMulti);

    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hashSingle[i], hashMulti[i]);
}

TEST(StreamingSha1Test, ByteByByte)
{
    // Feeding one byte at a time must produce the same result
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789";

    unsigned char hashSingle[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()),
              input.size(), hashSingle);

    Sha1Context ctx;
    sha1_init(&ctx);
    for (size_t i = 0; i < input.size(); i++) {
        sha1_update(&ctx,
                    reinterpret_cast<const unsigned char*>(&input[i]), 1);
    }
    unsigned char hashByte[20];
    sha1_final(&ctx, hashByte);

    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hashSingle[i], hashByte[i]);
}

TEST(StreamingSha1Test, EmptyInput)
{
    Sha1Context ctx;
    sha1_init(&ctx);
    unsigned char hash[20];
    sha1_final(&ctx, hash);

    // Should match one-shot sha1_hash on empty input
    unsigned char hashExpected[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(""), 0, hashExpected);
    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hash[i], hashExpected[i]);
}

TEST(StreamingSha1Test, CrossBlockBoundary)
{
    // Feed 100 bytes in 3 chunks to exercise partial-block buffering
    std::string input(100, 'D');

    unsigned char hashExpected[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()),
              input.size(), hashExpected);

    Sha1Context ctx;
    sha1_init(&ctx);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data()), 30);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data() + 30), 30);
    sha1_update(&ctx,
                reinterpret_cast<const unsigned char*>(input.data() + 60), 40);
    unsigned char hashStream[20];
    sha1_final(&ctx, hashStream);

    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hashExpected[i], hashStream[i]);
}

// ============================================================
// SHA-1 hash tests (legacy one-shot API)
// ============================================================

TEST(SHA1Test, Rfc6455KnownVector)
{
    // RFC 6455 §4.2.2: given key "dGhlIHNhbXBsZSBub25jZQ==",
    // SHA-1(key + magic GUID) should produce Base64 "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    std::string key   = "dGhlIHNhbXBsZSBub25jZQ==";
    std::string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    unsigned char hash[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(magic.data()), magic.size(), hash);

    std::string acceptKey = base64_encode(hash, 20);
    EXPECT_EQ(acceptKey, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
}

TEST(SHA1Test, EmptyInput)
{
    unsigned char hash[20];
    unsigned char hash2[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(""), 0, hash);
    sha1_hash(reinterpret_cast<const unsigned char*>(""), 0, hash2);

    // Deterministic: calling twice produces the same result
    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hash[i], hash2[i]);

    // Non-empty should produce a different hash
    unsigned char other[20];
    sha1_hash(reinterpret_cast<const unsigned char*>("a"), 1, other);
    bool allSame = true;
    for (int i = 0; i < 20; i++) {
        if (hash[i] != other[i]) {
            allSame = false;
            break;
        }
    }
    EXPECT_FALSE(allSame);
}

TEST(SHA1Test, ShortInput)
{
    unsigned char hash[20];
    sha1_hash(reinterpret_cast<const unsigned char*>("abc"), 3, hash);

    // Deterministic: hash again and verify consistency
    unsigned char hash2[20];
    sha1_hash(reinterpret_cast<const unsigned char*>("abc"), 3, hash2);
    for (int i = 0; i < 20; i++)
        EXPECT_EQ(hash[i], hash2[i]);

    // Base64 representation should be consistent
    std::string encoded  = base64_encode(hash, 20);
    std::string encoded2 = base64_encode(hash2, 20);
    EXPECT_EQ(encoded, encoded2);
    EXPECT_EQ(encoded.size(), 28u);
}

TEST(SHA1Test, ExactlyOneBlock)
{
    // SHA-1 processes 64-byte blocks. Feed exactly 55 bytes (no padding overflow).
    std::string input(55, 'A');
    unsigned char hash1[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()), input.size(), hash1);

    // Specific check: result should be deterministic and consistent
    std::string encoded = base64_encode(hash1, 20);
    EXPECT_GT(encoded.size(), 0u);
    EXPECT_EQ(encoded.size(), 28u); // 20 bytes -> 28 base64 chars with padding
}

TEST(SHA1Test, CrossBlockBoundary)
{
    // 64 bytes exactly — crosses the first block boundary
    std::string input(64, 'B');
    unsigned char hash[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()), input.size(), hash);

    std::string a = base64_encode(hash, 20);

    // 80 bytes — crosses with padding in second block
    input = std::string(80, 'C');
    sha1_hash(reinterpret_cast<const unsigned char*>(input.data()), input.size(), hash);
    std::string b = base64_encode(hash, 20);

    EXPECT_FALSE(a.empty());
    EXPECT_FALSE(b.empty());
    EXPECT_NE(a, b); // Different inputs -> different hashes
}

// ============================================================
// Base64 encoding tests
// ============================================================

TEST(Base64Test, EncodeEmpty)
{
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>(""), 0), "");
}

TEST(Base64Test, EncodeSingleChar)
{
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("f"), 1), "Zg==");
}

TEST(Base64Test, EncodeTwoChars)
{
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("fo"), 2), "Zm8=");
}

TEST(Base64Test, EncodeThreeChars)
{
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("foo"), 3), "Zm9v");
}

TEST(Base64Test, EncodeHello)
{
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("Hello"), 5), "SGVsbG8=");
}

TEST(Base64Test, EncodeStandardVectors)
{
    // RFC 4648 test vectors
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>(""), 0), "");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("f"), 1), "Zg==");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("fo"), 2), "Zm8=");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("foo"), 3), "Zm9v");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("foob"), 4), "Zm9vYg==");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("fooba"), 5), "Zm9vYmE=");
    EXPECT_EQ(base64_encode(reinterpret_cast<const unsigned char*>("foobar"), 6), "Zm9vYmFy");
}

TEST(Base64Test, EncodeBinaryData)
{
    // Non-ASCII bytes
    const unsigned char data[] = { 0x00, 0xFF, 0x7F, 0x80, 0x01 };
    std::string result        = base64_encode(data, 5);
    EXPECT_EQ(result, "AP9/gAE=");
}

TEST(Base64Test, RoundTripViaTest)
{
    // Round-trip: encode arbitrary data, verify length matches expectations
    for (size_t len = 0; len <= 10; len++) {
        std::vector<unsigned char> data(len);
        for (size_t i = 0; i < len; i++)
            data[i] = (unsigned char)(i * 17 + 42);
        std::string encoded = base64_encode(data.data(), len);

        // Expected base64 length: ceil(len/3) * 4
        size_t expectedLen = ((len + 2) / 3) * 4;
        EXPECT_EQ(encoded.size(), expectedLen) << "Failed for length " << len;
    }
}

// ============================================================
// Combined handshake key generation
// ============================================================

TEST(HandshakeTest, ComputeAcceptKey)
{
    // Full handshake accept key computation
    std::string clientKey = "dGhlIHNhbXBsZSBub25jZQ==";
    std::string magic     = clientKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    unsigned char hash[20];
    sha1_hash(reinterpret_cast<const unsigned char*>(magic.data()), magic.size(), hash);
    std::string acceptKey = base64_encode(hash, 20);
    EXPECT_EQ(acceptKey, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
}

TEST(HandshakeTest, DifferentKeyDifferentAccept)
{
    // Changing the input key should produce a different accept key
    auto computeAccept = [](const std::string& key) -> std::string {
        std::string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        unsigned char hash[20];
        sha1_hash(reinterpret_cast<const unsigned char*>(magic.data()), magic.size(), hash);
        return base64_encode(hash, 20);
    };

    std::string a = computeAccept("AAAAAAAAAAAAAAAAAAAAAA==");
    std::string b = computeAccept("BBBBBBBBBBBBBBBBBBBB==");
    EXPECT_NE(a, b);
    EXPECT_EQ(a.size(), 28u);
    EXPECT_EQ(b.size(), 28u);
}

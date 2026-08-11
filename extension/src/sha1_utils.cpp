#include "sha1_utils.h"
#include <cstdio>
#include <cstring>

#define SHA1_ROTL(x, n) (((x) << (n)) | ((x) >> (32 - (n))))

// -------------------------------------------------------------------
// Internal: process a single 64-byte block (static helper)
// -------------------------------------------------------------------
static void sha1_process_block(uint32_t h[5], const unsigned char block[64])
{
    uint32_t w[80];
    for (int i = 0; i < 16; i++) {
        w[i] = ((uint32_t)block[i * 4] << 24) | ((uint32_t)block[i * 4 + 1] << 16)
            | ((uint32_t)block[i * 4 + 2] << 8) | (uint32_t)block[i * 4 + 3];
    }
    for (int i = 16; i < 80; i++) {
        w[i] = SHA1_ROTL(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (int i = 0; i < 80; i++) {
        uint32_t f, k;
        if (i < 20) {
            f = (b & c) | (~b & d);
            k = 0x5A827999;
        } else if (i < 40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1;
        } else if (i < 60) {
            f = (b & c) | (b & d) | (c & d);
            k = 0x8F1BBCDC;
        } else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6;
        }
        uint32_t temp = SHA1_ROTL(a, 5) + f + e + k + w[i];
        e             = d;
        d             = c;
        c             = SHA1_ROTL(b, 30);
        b             = a;
        a             = temp;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
}

// -------------------------------------------------------------------
// Streaming SHA-1 API
// -------------------------------------------------------------------

void sha1_init(Sha1Context* ctx)
{
    ctx->h[0]     = 0x67452301;
    ctx->h[1]     = 0xEFCDAB89;
    ctx->h[2]     = 0x98BADCFE;
    ctx->h[3]     = 0x10325476;
    ctx->h[4]     = 0xC3D2E1F0;
    ctx->blockLen = 0;
    ctx->bitCount = 0;
}

void sha1_update(Sha1Context* ctx, const unsigned char* data, size_t len)
{
    for (size_t i = 0; i < len; i++) {
        ctx->block[ctx->blockLen++] = data[i];
        ctx->bitCount += 8;
        if (ctx->blockLen == 64) {
            sha1_process_block(ctx->h, ctx->block);
            ctx->blockLen = 0;
        }
    }
}

void sha1_final(Sha1Context* ctx, unsigned char out[20])
{
    // Padding
    ctx->block[ctx->blockLen++] = 0x80;
    while (ctx->blockLen != 56) {
        if (ctx->blockLen == 64) {
            sha1_process_block(ctx->h, ctx->block);
            ctx->blockLen = 0;
        }
        ctx->block[ctx->blockLen++] = 0;
    }

    // Append length (big-endian)
    for (int i = 0; i < 8; i++) {
        ctx->block[ctx->blockLen++] =
            (unsigned char)(ctx->bitCount >> (56 - i * 8));
    }
    sha1_process_block(ctx->h, ctx->block);

    // Output big-endian hash
    for (int i = 0; i < 5; i++) {
        out[i * 4]     = (unsigned char)(ctx->h[i] >> 24);
        out[i * 4 + 1] = (unsigned char)(ctx->h[i] >> 16);
        out[i * 4 + 2] = (unsigned char)(ctx->h[i] >> 8);
        out[i * 4 + 3] = (unsigned char)(ctx->h[i]);
    }
}

// -------------------------------------------------------------------
// One-shot convenience wrapper (backward-compatible)
// -------------------------------------------------------------------
void sha1_hash(const unsigned char* data, size_t len, unsigned char out[20])
{
    Sha1Context ctx;
    sha1_init(&ctx);
    sha1_update(&ctx, data, len);
    sha1_final(&ctx, out);
}

static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string base64_encode(const unsigned char* data, size_t len)
{
    std::string out;
    for (size_t i = 0; i < len; i += 3) {
        int val = ((int)data[i]) << 16;
        if (i + 1 < len)
            val |= ((int)data[i + 1]) << 8;
        if (i + 2 < len)
            val |= data[i + 2];
        out += b64_table[(val >> 18) & 0x3F];
        out += b64_table[(val >> 12) & 0x3F];
        out += (i + 1 < len) ? b64_table[(val >> 6) & 0x3F] : '=';
        out += (i + 2 < len) ? b64_table[val & 0x3F] : '=';
    }
    return out;
}



std::string base64_decode(const std::string& in)
{
    static const char* kAlphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    int table[256];
    for (int i = 0; i < 256; ++i) table[i] = -1;
    for (int i = 0; i < 64; ++i) table[(unsigned char)kAlphabet[i]] = i;

    std::string out;
    out.reserve(in.size() * 3 / 4);

    int val  = 0;
    int bits = -8;
    for (unsigned char c : in) {
        if (c == '=') break;
        // REAPER wraps long chunks, so newlines are expected rather than an error.
        if (c == '\n' || c == '\r' || c == ' ' || c == '\t') continue;
        const int d = table[c];
        // Anything outside the alphabet ends the decode. A truncated chunk
        // then yields a short result instead of plausible-looking nonsense.
        if (d < 0) break;
        val = (val << 6) | d;
        bits += 6;
        if (bits >= 0) {
            out.push_back((char)((val >> bits) & 0xFF));
            bits -= 8;
        }
    }
    return out;
}

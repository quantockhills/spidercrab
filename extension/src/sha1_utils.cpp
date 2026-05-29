#include "sha1_utils.h"
#include <cstdio>
#include <cstring>

#define SHA1_ROTL(x, n) (((x) << (n)) | ((x) >> (32 - (n))))

void sha1_hash(const unsigned char* data, size_t len, unsigned char out[20])
{
    uint32_t      h[]      = { 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0 };
    size_t        blockLen = 0;
    unsigned char block[64];
    uint64_t      bitCount = 0;

    auto processBlock = [&](const unsigned char* block) {
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
    };

    for (size_t i = 0; i < len; i++) {
        block[blockLen++] = data[i];
        bitCount += 8;
        if (blockLen == 64) {
            processBlock(block);
            blockLen = 0;
        }
    }

    // Padding
    block[blockLen++] = 0x80;
    while (blockLen != 56) {
        if (blockLen == 64) {
            processBlock(block);
            blockLen = 0;
        }
        block[blockLen++] = 0;
    }

    // Append length (big-endian)
    for (int i = 0; i < 8; i++) {
        block[blockLen++] = (unsigned char)(bitCount >> (56 - i * 8));
    }
    processBlock(block);

    for (int i = 0; i < 5; i++) {
        out[i * 4]     = (unsigned char)(h[i] >> 24);
        out[i * 4 + 1] = (unsigned char)(h[i] >> 16);
        out[i * 4 + 2] = (unsigned char)(h[i] >> 8);
        out[i * 4 + 3] = (unsigned char)(h[i]);
    }
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

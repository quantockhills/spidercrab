#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

// Minimal SHA-1 implementation for WebSocket handshake key generation.
// WebSocket handshake requires: SHA-1(key + magic GUID) -> Base64

// Streaming SHA-1 context
struct Sha1Context {
    uint32_t      h[5];         // hash state
    unsigned char block[64];    // partial block buffer
    size_t        blockLen;     // bytes buffered in block
    uint64_t      bitCount;     // total bits processed
};

void sha1_init(Sha1Context* ctx);
void sha1_update(Sha1Context* ctx, const unsigned char* data, size_t len);
void sha1_final(Sha1Context* ctx, unsigned char out[20]);

// One-shot convenience wrapper (backward-compatible)
void sha1_hash(const unsigned char* data, size_t len, unsigned char out[20]);

// Minimal Base64 encoding (RFC 4648)
std::string base64_encode(const unsigned char* data, size_t len);

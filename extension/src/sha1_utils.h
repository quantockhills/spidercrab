#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

// Minimal SHA-1 implementation for WebSocket handshake key generation.
// WebSocket handshake requires: SHA-1(key + magic GUID) -> Base64
void sha1_hash(const unsigned char* data, size_t len, unsigned char out[20]);

// Minimal Base64 encoding (RFC 4648)
std::string base64_encode(const unsigned char* data, size_t len);

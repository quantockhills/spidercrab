#!/usr/bin/env python3
"""Test Playtime 2 API availability via WebSocket.

Sends a playtime/isAvailable command and checks the response.

Usage:
    python3 test_playtime_available.py [port]

Requires:
    - REAPER running with spidercrab extension loaded
    - Helgobox (reaper_helgobox.so + helgobox.so) installed
"""

import json
import socket
import base64
import struct
import time
import sys

HOST = '127.0.0.1'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9224

class WSClient:
    def __init__(self, host=HOST, port=PORT):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect((host, port))
        key = base64.b64encode(b'test-key').decode()
        self.sock.sendall(
            f'GET / HTTP/1.1\r\nHost: {host}:{port}\r\n'
            f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        resp = self.sock.recv(4096)
        if b'101' not in resp:
            raise RuntimeError("WebSocket handshake failed")

    def send(self, msg):
        data = msg.encode()
        mask = struct.pack('>I', int(time.time() * 1000) & 0xFFFFFFFF)
        hdr = bytes([0x81])
        if len(data) < 126:
            hdr += bytes([0x80 | len(data)])
        elif len(data) < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack('>H', len(data))
        else:
            hdr += bytes([0x80 | 127]) + struct.pack('>Q', len(data))
        hdr += mask
        hdr += bytes([data[i] ^ mask[i % 4] for i in range(len(data))])
        self.sock.sendall(hdr)

    def recv_all(self, timeout=3):
        self.sock.settimeout(timeout)
        data = b''
        while True:
            try:
                chunk = self.sock.recv(4096)
                if not chunk:
                    break
                data += chunk
            except socket.timeout:
                break
        if not data:
            return None
        offset = 0
        frames = []
        while offset < len(data):
            if offset + 2 > len(data):
                break
            length = data[offset + 1] & 0x7F
            offset += 2
            if length == 126:
                length = struct.unpack('>H', data[offset:offset+2])[0]
                offset += 2
            elif length == 127:
                length = struct.unpack('>Q', data[offset:offset+8])[0]
                offset += 8
            mask_key = data[offset:offset+4]
            offset += 4
            payload = data[offset:offset+length]
            payload = bytes([payload[i] ^ mask_key[i % 4] for i in range(len(payload))])
            offset += length
            frames.append(payload.decode())
        return '\n'.join(frames)

    def close(self):
        self.sock.close()

def main():
    c = WSClient()
    
    # Send playtime/isAvailable command
    cmd = {"type": "command", "command": "playtime/isAvailable", "id": "test_pt1"}
    c.send(json.dumps(cmd))
    time.sleep(1.0)
    
    resp = c.recv_all(timeout=3)
    c.close()
    
    if not resp:
        print("❌ No response received")
        sys.exit(1)
    
    print(f"Raw response: {resp[:500]}")
    
    # Parse response
    for line in resp.split('\n'):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if obj.get("type") == "response" and obj.get("id") == "test_pt1":
                payload = obj.get("payload", {})
                available = payload.get("available", False)
                if available:
                    print("✅ Playtime 2 API is AVAILABLE")
                    print(f"   Version info: {payload.get('version', 'unknown')}")
                else:
                    print("ℹ️  Playtime 2 API is NOT available")
                    print(f"   Reason: {payload.get('reason', 'helgobox not loaded')}")
                return 0
        except json.JSONDecodeError:
            continue
    
    print("❌ No matching response found")
    return 1

if __name__ == '__main__':
    sys.exit(main())

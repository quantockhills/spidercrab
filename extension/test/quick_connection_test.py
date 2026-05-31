#!/usr/bin/env python3
"""Quick smoke test — connect, send commands, verify responses."""
import json, socket, base64, struct, time, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9224

def ws_connect(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(('127.0.0.1', port))
    key = base64.b64encode(b'test').decode()
    s.send(f'GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
    resp = s.recv(4096)
    if b'101' not in resp:
        raise Exception('WS handshake failed')
    return s

def send_frame(sock, msg):
    import struct, time
    data = json.dumps(msg).encode()
    mask = struct.pack('>I', int(time.time()*1000) & 0xFFFFFFFF)
    hdr = bytes([0x81, 0x80 | len(data)]) + mask
    hdr += bytes([data[i] ^ mask[i%4] for i in range(len(data))])
    sock.sendall(hdr)

def recv_response(sock, timeout=3):
    sock.settimeout(timeout)
    data = b''
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk: break
            data += chunk
        except socket.timeout: break
    # Parse WS frames
    offset = 0
    results = []
    while offset + 2 <= len(data):
        length = data[offset+1] & 0x7F
        offset += 2
        if length == 126:
            length = struct.unpack('>H', data[offset:offset+2])[0]; offset += 2
        elif length == 127:
            length = struct.unpack('>Q', data[offset:offset+8])[0]; offset += 8
        mask_key = data[offset:offset+4]; offset += 4
        payload = bytes([data[offset+i] ^ mask_key[i%4] for i in range(length)])
        offset += length
        try: results.append(json.loads(payload))
        except: pass
    return results

# --- Tests ---
sock = ws_connect(PORT)

# transport/getState
send_frame(sock, {"type":"command","command":"transport/getState","id":"ci_1"})
time.sleep(0.5)
results = recv_response(sock)
resp = [r for r in results if r.get('id') == 'ci_1']
assert resp, 'No transport/getState response'
assert resp[0].get('success'), f'transport/getState failed: {resp[0]}'
print('✅ transport/getState')

# track/getAll
send_frame(sock, {"type":"command","command":"track/getAll","id":"ci_2"})
time.sleep(0.5)
results = recv_response(sock)
resp = [r for r in results if r.get('id') == 'ci_2']
assert resp, 'No track/getAll response'
assert resp[0].get('success'), f'track/getAll failed: {resp[0]}'
assert 'tracks' in resp[0].get('payload', {}), 'Missing tracks in payload'
print('✅ track/getAll')

sock.close()
print('🎉 All CI smoke tests passed')

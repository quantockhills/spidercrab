#!/usr/bin/env bash
# Quick check: what FX does Reaper enumerate?
set -euo pipefail

REAPER_HOME="${REAPER_HOME:-$HOME/reaper-portable}"
REAPER_BIN="${REAPER_HOME}/reaper"
DISPLAY=":99"
XVFB_BIN="$(command -v Xvfb)"

# Start Xvfb if not already
if ! kill -0 "$(cat /tmp/.X99-lock 2>/dev/null | cut -d' ' -f1 2>/dev/null)" 2>/dev/null; then
    Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac -nolisten tcp &
    XVFB_PID=$!
    sleep 1
fi

export DISPLAY="$DISPLAY"
export LD_LIBRARY_PATH="/home/linuxbrew/.linuxbrew/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# Fresh config
CFG_DIR=$(mktemp -d /tmp/reaper-fx-check-XXXXXX)
mkdir -p "${CFG_DIR}/UserPlugins"
cp /home/sasha/projects/reaper-ipad/extension/build/reaper-ipad-ext.so "${CFG_DIR}/UserPlugins/"

"${REAPER_BIN}" -cfgfile "${CFG_DIR}/reaper.ini" -newinst -nosplash -new 2>/dev/null &
REAPER_PID=$!

# Wait for WS
for i in $(seq 1 10); do
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/9224" 2>/dev/null; then
        break
    fi
    sleep 1
done

# Send fx/enumerate
python3 -c "
import json, socket, base64, struct, time, sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(5)
sock.connect(('127.0.0.1', 9224))
key = base64.b64encode(b'fx-check').decode()
sock.sendall(
    f'GET / HTTP/1.1\r\nHost: 127.0.0.1:9224\r\n'
    f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
    f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
resp = sock.recv(4096)
if b'101' not in resp:
    print('Handshake failed')
    sys.exit(1)

# Send fx/enumerate
cmd = json.dumps({'type':'command','command':'fx/enumerate','id':'fx_1'})
data = cmd.encode()
mask = struct.pack('>I', int(time.time()*1000) & 0xFFFFFFFF)
hdr = bytes([0x81, 0x80 | len(data)])
if len(data) >= 126:
    hdr = bytes([0x81, 0x80 | 126]) + struct.pack('>H', len(data))
hdr += mask
hdr += bytes([data[i] ^ mask[i%4] for i in range(len(data))])
sock.sendall(hdr)
time.sleep(1)

# Read response
sock.settimeout(2)
all_data = b''
try:
    while True:
        chunk = sock.recv(65536)
        if not chunk: break
        all_data += chunk
except socket.timeout:
    pass
sock.close()

# Parse WS frames
if all_data:
    offset = 0
    while offset < len(all_data):
        if offset + 2 > len(all_data): break
        opcode = all_data[offset] & 0x0F
        masked = (all_data[offset+1] & 0x80) != 0
        length = all_data[offset+1] & 0x7F
        offset += 2
        if length == 126: length = struct.unpack('>H', all_data[offset:offset+2])[0]; offset += 2
        elif length == 127: length = struct.unpack('>Q', all_data[offset:offset+8])[0]; offset += 8
        mask_key = all_data[offset:offset+4] if masked else None
        if masked: offset += 4
        payload = all_data[offset:offset+length]
        if mask_key: payload = bytes([payload[i] ^ mask_key[i%4] for i in range(len(payload))])
        offset += length
        try:
            obj = json.loads(payload)
            if obj.get('type') == 'response':
                fx_list = obj.get('payload', {}).get('fx', [])
                print(f'Found {len(fx_list)} FX:')
                for fx in fx_list[:20]:
                    print(f'  [{fx[\"format\"]}] {fx[\"name\"]}')
                if len(fx_list) > 20:
                    print(f'  ... and {len(fx_list)-20} more')
                if len(fx_list) == 0:
                    print('  (none)')
        except: pass

# Cleanup
kill "$REAPER_PID" 2>/dev/null || true
wait "$REAPER_PID" 2>/dev/null || true
rm -rf "$CFG_DIR"
" 2>&1

kill "$REAPER_PID" 2>/dev/null || true

#!/bin/bash
# Run REAPER headless with ASAN debug build and test bypass crash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ASAN settings
export ASAN_OPTIONS="detect_leaks=0:abort_on_error=1:print_stats=true:atexit=true"
export LSAN_OPTIONS="detect_leaks=0"

# Use debug build
export REAPER_DLL="$PROJECT_DIR/extension/build/reaper_spidercrab-debug.so"

# Kill any leftover REAPER
pkill -f "reaper" 2>/dev/null || true
sleep 1

# Start Xvfb
Xvfb :99 -screen 0 2360x1640x24 &
XVFB_PID=$!
sleep 1

# Start REAPER with ASAN
echo "Starting REAPER with ASAN..."
cd "$PROJECT_DIR"
DISPLAY=:99 LD_PRELOAD=/usr/lib/gcc/x86_64-linux-gnu/12/libasan.so \
    /home/sasha/reaper-portable/reaper -new &
REAPER_PID=$!
sleep 12

echo "REAPER PID: $REAPER_PID"

# Copy debug DLL (REAPER loads from the plugin dir)
cp "$REAPER_DLL" /home/sasha/reaper-portable/UserPlugins/reaper_spidercrab.so

# Run test
echo "Running bypass test..."
timeout 30 node -e "
const { spawn } = require('child_process');
const net = require('net');
const crypto = require('crypto');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: '127.0.0.1', port }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
      s.once('data', d => { if (d.includes('101')) resolve(s); else reject('handshake failed'); });
    });
    s.on('error', reject);
    setTimeout(() => reject('connect timeout'), 8000);
  });
}

function wsSend(sock, msg) {
  const data = Buffer.from(JSON.stringify(msg));
  const mask = crypto.randomBytes(4);
  let hdr;
  if (data.length < 126) hdr = Buffer.from([0x81, 0x80 | data.length]);
  else hdr = Buffer.from([0x81, 0x80 | 126, (data.length >> 8) & 0xFF, data.length & 0xFF]);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
  sock.write(Buffer.concat([hdr, mask, masked]));
}

(async () => {
  // Connect
  let ws;
  try {
    ws = await wsConnect(9224);
  } catch(e) {
    console.error('WS connect failed:', e.message);
    process.exit(1);
  }
  console.log('Connected');

  // Add track
  wsSend(ws, { type: 'command', command: 'track/add', id: 'a1' });
  await sleep(1500);

  // Add ReaEQ
  wsSend(ws, { type: 'command', command: 'fx/add', id: 'a2', payload: { trackIdx: 0, fxName: 'ReaEQ (Cockos)' } });
  await sleep(1500);

  // Now toggle bypass aggressively
  console.log('Toggling bypass...');
  for (let i = 0; i < 10; i++) {
    // Send as frontend does: current state = true (bypassed)
    wsSend(ws, { type: 'command', command: 'fx/setBypass', id: 'b' + i, trackIdx: 0, fxIdx: 0, bypassed: true });
    await sleep(300);
    // Send as frontend does: current state = false (enabled)
    wsSend(ws, { type: 'command', command: 'fx/setBypass', id: 'e' + i, trackIdx: 0, fxIdx: 0, bypassed: false });
    await sleep(300);
    console.log('  Cycle', i, 'done');
  }
  console.log('ALL CYCLES COMPLETE');

  // Check if REAPER is still alive
  try {
    process.kill(process.env.REAPER_PID, 0);
    console.log('REAPER STILL ALIVE ✓');
  } catch(e) {
    console.log('REAPER CRASHED ✗');
  }

  ws.end();
})();
"

# Wait for REAPER
sleep 2

# Check if still alive
if kill -0 $REAPER_PID 2>/dev/null; then
    echo "✅ REAPER survived all bypass cycles!"
else
    echo "❌ REAPER crashed during test!"
fi

# Cleanup
pkill -f "reaper" 2>/dev/null || true
kill $XVFB_PID 2>/dev/null || true

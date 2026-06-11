#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
export DISPLAY=:99
pkill -f reaper 2>/dev/null || true
pkill -f Xvfb 2>/dev/null || true
sleep 1
Xvfb :99 -screen 0 2360x1640x24 &
sleep 1
cp "$PROJECT_DIR/extension/build/reaper_spidercrab.so" "$HOME/reaper-portable/UserPlugins/reaper_spidercrab.so"
echo "Starting REAPER under GDB..."
cat > /tmp/gdb_cmds.txt << 'GDB'
set pagination off
set follow-fork-mode child
run -new
bt full
quit
GDB
DISPLAY=:99 gdb -batch -x /tmp/gdb_cmds.txt /home/sasha/reaper-portable/reaper &
sleep 15
echo "Sending bypass commands..."
timeout 20 node -e "
const net = require('net');
const crypto = require('crypto');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: '127.0.0.1', port }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:'+port+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
      s.once('data', d => { if (d.includes('101')) resolve(s); else reject('handshake failed'); });
    });
    s.on('error', reject);
    setTimeout(() => reject('connect timeout'), 8000);
  });
}

function wsSend(sock, msg) {
  const data = Buffer.from(JSON.stringify(msg));
  const mask = crypto.randomBytes(4);
  let hdr = data.length < 126
    ? Buffer.from([0x81, 0x80 | data.length])
    : Buffer.from([0x81, 0x80 | 126, (data.length >> 8) & 0xFF, data.length & 0xFF]);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
  sock.write(Buffer.concat([hdr, mask, masked]));
}

(async () => {
  let ws;
  try { ws = await wsConnect(9224); }
  catch(e) { console.error('WS failed:', e.message); process.exit(1); }
  console.log('Connected');
  wsSend(ws, { type:'command', command:'track/add', id:'a1' });
  await sleep(1500);
  wsSend(ws, { type:'command', command:'fx/add', id:'a2', payload:{trackIdx:0, fxName:'ReaEQ (Cockos)'} });
  await sleep(1500);
  console.log('Toggling...');
  for (let i = 0; i < 20; i++) {
    wsSend(ws, { type:'command', command:'fx/setBypass', id:'b'+i, trackIdx:0, fxIdx:0, bypassed: true });
    await sleep(200);
    wsSend(ws, { type:'command', command:'fx/setBypass', id:'e'+i, trackIdx:0, fxIdx:0, bypassed: false });
    await sleep(200);
    if (i % 5 === 0) process.stdout.write('  cycle '+i+'\n');
  }
  console.log('Done - all cycles completed');
  ws.end();
  process.exit(0);
})();
" 2>&1
echo "---"
if pgrep -f "reaper" > /dev/null 2>&1; then
  echo "REAPER STILL ALIVE"
else
  echo "REAPER CRASHED"
fi
pkill -f reaper 2>/dev/null || true
kill %1 2>/dev/null || true

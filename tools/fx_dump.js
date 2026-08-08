#!/usr/bin/env node
/**
 * Dump a plugin's parameters from a running REAPER, over Spidercrab's own
 * WebSocket API.
 *
 * A built-in VST like ReaDelay has no source to read and no parameter list
 * written down anywhere on disk — the only authority is the plugin itself.
 * Guessing produces a module whose controls silently drive the wrong things,
 * so ask.
 *
 * Speaks the protocol over a raw socket rather than using Node's WebSocket:
 * the extension matches "Sec-WebSocket-Key: " literally, and a client that
 * normalises its header casing gets a 400 rather than an upgrade.
 *
 * Usage:
 *   node tools/fx_dump.js                 # list the selected track's FX
 *   node tools/fx_dump.js <fxIndex>       # dump that FX's parameters
 */
const net = require('net');
const crypto = require('crypto');

const PORT = 9224;
const HOST = '127.0.0.1';

function open() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, HOST);
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const listeners = [];

    sock.on('error', reject);
    sock.on('connect', () => {
      sock.write(
        `GET / HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\n`
        + `Upgrade: websocket\r\nConnection: Upgrade\r\n`
        + `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        if (!/^HTTP\/1\.1 101/.test(head)) {
          reject(new Error(`handshake refused:\n${head}`));
          return;
        }
        buf = buf.subarray(end + 4);
        upgraded = true;
        resolve({ sock, on: (fn) => listeners.push(fn), send });
      }
      // Server-to-client frames are never masked, and the API's replies are
      // always text — enough of the protocol to read answers.
      for (;;) {
        if (buf.length < 2) return;
        const len0 = buf[1] & 0x7f;
        let offset = 2;
        let len = len0;
        if (len0 === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2); offset = 4;
        } else if (len0 === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2)); offset = 10;
        }
        if (buf.length < offset + len) return;
        const payload = buf.subarray(offset, offset + len).toString();
        buf = buf.subarray(offset + len);
        listeners.forEach((fn) => fn(payload));
      }
    });

    function send(text) {
      const data = Buffer.from(text);
      const mask = crypto.randomBytes(4);
      const header = data.length < 126
        ? Buffer.from([0x81, 0x80 | data.length])
        : Buffer.concat([Buffer.from([0x81, 0xfe]),
          (() => { const b = Buffer.alloc(2); b.writeUInt16BE(data.length); return b; })()]);
      const masked = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
      sock.write(Buffer.concat([header, mask, masked]));
    }
  });
}

let nextId = 1;
function call(conn, command, params = {}) {
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out on ${command}`)), 8000);
    conn.on((text) => {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer);
      msg.success === false
        ? reject(new Error(`${command}: ${JSON.stringify(msg.payload)}`))
        : resolve(msg.payload);
    });
    conn.send(JSON.stringify({ id, command, params }));
  });
}

(async () => {
  const conn = await open();
  const tracks = await call(conn, 'tracks/list');
  const list = tracks.tracks || [];
  const selected = list.find((t) => t.selected) ?? list[0];
  if (!selected) throw new Error('no tracks in the project');

  const trackIdx = selected.index;
  const fx = (await call(conn, 'fx/list', { trackIdx })).fx || [];

  if (process.argv[2] === undefined) {
    console.log(`track ${trackIdx}: ${selected.name}`);
    fx.forEach((f) => console.log(`  [${f.index}] ${f.name}`));
    conn.sock.end();
    return;
  }

  const fxIdx = Number(process.argv[2]);
  const params = [];
  for (let offset = 0; ;) {
    const page = await call(conn, 'fx/getParams', { trackIdx, fxIdx, offset, limit: 128 });
    params.push(...page.params);
    offset += page.params.length;
    if (!page.params.length || params.length >= page.total) break;
  }

  console.log(`${fx[fxIdx]?.name ?? `fx ${fxIdx}`} — ${params.length} parameters\n`);
  for (const p of params) {
    console.log(
      `${String(p.index).padStart(3)}  ${String(p.name).padEnd(30)}`
      + `${String(p.value).padStart(11)}  [${p.min} .. ${p.max}]  ${p.formatted ?? ''}`);
  }
  conn.sock.end();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });

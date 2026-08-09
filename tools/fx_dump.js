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
 *   node tools/fx_dump.js                    # every track and its FX
 *   node tools/fx_dump.js <track> <fx>       # dump that plugin's parameters
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
      if (msg.type !== 'response') return;
      // Failures come back without the id they are answering, so matching on
      // id alone waits out the timeout on a typo rather than reporting it.
      // Only one call is ever in flight here, so an unattributed response is
      // necessarily ours.
      if (msg.id !== undefined && msg.id !== id) return;
      clearTimeout(timer);
      msg.success === false
        ? reject(new Error(`${command}: ${JSON.stringify(msg.payload)}`))
        : resolve(msg.payload);
    });
    // "type" is required, despite the dispatcher reading as though it
    // tolerates a message without one.
    //
    // CRITICAL: params must be spread at the top level, not nested under
    // "params". The extension's JsonParser is a naive stateful parser that
    // reads key-value pairs sequentially and can only find keys at the root.
    // The frontend does `Object.assign({type, command, id}, params)` for the
    // same reason — see frontend/src/lib/wsClient.ts:154.
    conn.send(JSON.stringify(Object.assign({}, { id, type: 'command', command }, params)));
  });
}

(async () => {
  const conn = await open();
  // The extension caches FX chains, so a plugin added since the last refresh
  // is invisible until asked for again.
  await call(conn, 'fx/refreshCache').catch(() => {});
  const list = (await call(conn, 'track/getAll')).tracks || [];
  if (!list.length) throw new Error('no tracks in the project');

  // With no arguments, show the whole project. Hunting for one plugin across
  // a dozen tracks is the common case, and guessing at "the selected track"
  // gets it wrong whenever the selection isn't where you were last working.
  if (process.argv.length < 4) {
    for (const t of list) {
      const fx = (await call(conn, 'track/getFx', { trackIdx: t.index })).fx || [];
      console.log(`track ${t.index}: ${t.name}${t.selected ? '  (selected)' : ''}`);
      fx.forEach((f) => console.log(`    ${t.index} ${f.index}   ${f.name}`));
    }
    console.log('\nDump one with:  node tools/fx_dump.js <trackIdx> <fxIdx>');
    conn.sock.end();
    return;
  }

  const trackIdx = Number(process.argv[2]);
  const fxIdx = Number(process.argv[3]);
  const fx = (await call(conn, 'track/getFx', { trackIdx })).fx || [];
  const params = [];
  for (let offset = 0; ;) {
    const page = await call(conn, 'fx/getParams', { trackIdx, fxIdx, offset, limit: 128 });
    params.push(...page.params);
    offset += page.params.length;
    if (!page.params.length || params.length >= page.total) break;
  }

  const found = fx.find((f) => f.index === fxIdx);
  console.log(`${found?.name ?? `fx ${fxIdx}`} — ${params.length} parameters\n`);
  for (const p of params) {
    console.log(
      `${String(p.index).padStart(3)}  ${String(p.name).padEnd(30)}`
      + `${String(p.value).padStart(11)}  [${p.min} .. ${p.max}]  ${p.formatted ?? ''}`);
  }
  conn.sock.end();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });

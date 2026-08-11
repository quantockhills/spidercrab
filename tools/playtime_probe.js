#!/usr/bin/env node
/**
 * Find Playtime's columns and the REAPER track behind each.
 *
 * Playtime keeps an ordered list of columns, each holding the GUID of its play
 * track (Column.clip_play_settings.track, a TrackId). That mapping lives
 * inside the Helgobox instance's plugin state, and Helgoboss documents no way
 * to read it from outside — so this goes in through clap_chunk, one of
 * REAPER's documented per-FX config values.
 *
 * Read-only. It asks questions and prints answers.
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
      // The extension matches "Sec-WebSocket-Key: " literally, so a client
      // that normalises header casing gets a 400 rather than an upgrade.
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
      // Failures come back without the id they answer, so matching on id
      // alone waits out the timeout on a typo. Only one call is in flight.
      if (msg.id !== undefined && msg.id !== id) return;
      clearTimeout(timer);
      msg.success === false
        ? reject(new Error(`${command}: ${JSON.stringify(msg.payload)}`))
        : resolve(msg.payload);
    });
    // Params spread at the top level, NOT nested under "params" — the
    // extension's JsonParser only finds keys at the root.
    conn.send(JSON.stringify(Object.assign({}, { id, type: 'command', command }, params)));
  });
}

// ── assertions ───────────────────────────────────────────────

(async () => {
  const conn = await open();
  console.log('connected\n');

  const { tracks } = await call(conn, 'track/getAll');
  console.log('--- tracks ---');
  for (const t of tracks) console.log(String(t.index).padStart(2), JSON.stringify(t.name));

  console.log('\n--- FX per track ---');
  const hosts = [];
  for (const t of tracks) {
    const r = await call(conn, 'track/getFx', { trackIdx: t.index });
    const fx = r.fx || r.fxList || r.plugins || [];
    if (!fx.length) continue;
    console.log(`track ${t.index} (${t.name}):`,
      fx.map((f, i) => `${i}:${f.name || f.fxName || JSON.stringify(f)}`).join(' | '));
    fx.forEach((f, i) => {
      const n = String(f.name || f.fxName || '');
      if (/helgobox|playtime|realearn/i.test(n)) hosts.push({ trackIdx: t.index, fxIdx: i, name: n });
    });
  }

  if (!hosts.length) {
    console.log('\nNo Helgobox/Playtime FX found — nothing to read a matrix out of.');
    conn.sock.destroy(); process.exit(2);
  }

  console.log('\n--- chunk probe ---');
  for (const h of hosts) {
    console.log(`\n${h.name} at track ${h.trackIdx} fx ${h.fxIdx}`);
    for (const parm of ['fx_type', 'clap_chunk', 'vst_chunk']) {
      try {
        const r = await call(conn, 'fx/getNamedConfigParm',
          { trackIdx: h.trackIdx, fxIdx: h.fxIdx, parm });
        if (!r.ok) { console.log(`  ${parm}: (not supported)`); continue; }
        if (parm === 'fx_type') { console.log(`  fx_type: ${r.value}`); continue; }
        console.log(`  ${parm}: ${r.length} chars`);
        if (r.length > 0) {
          const raw = Buffer.from(r.value, 'base64');
          console.log(`    decoded ${raw.length} bytes`);
          const text = raw.toString('latin1');
          for (const needle of ['clip_play_settings', 'columns', 'matrix', 'TrackId']) {
            const at = text.indexOf(needle);
            console.log(`    "${needle}": ${at < 0 ? 'not found' : 'at ' + at}`);
          }
          const at = text.indexOf('columns');
          if (at >= 0) {
            console.log('  --- chunk around "columns" ---');
            console.log(text.slice(Math.max(0, at - 200), at + 1200));
          }
        }
      } catch (e) { console.log(`  ${parm}: ${e.message}`); }
    }
  }

  conn.sock.destroy();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });

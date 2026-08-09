#!/usr/bin/env node
/**
 * Find what a discrete VST parameter's values are called, by trying them.
 *
 * A VST reports every parameter as 0..1 and formats it itself, so there is no
 * way to read the option list for something like Eos's reverb Type — only to
 * set a value and see what it says it is. Restores the original when done.
 *
 * Usage:
 *   node tools/fx_probe.js <track> <fx> <param> [steps]
 */
const net = require('net');
const crypto = require('crypto');

function open() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(9224, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0); let up = false; const listeners = [];
    sock.on('error', reject);
    sock.on('connect', () => sock.write(
      'GET / HTTP/1.1\r\nHost: 127.0.0.1:9224\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!up) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        buf = buf.subarray(end + 4); up = true;
        resolve({ sock, on: (fn) => listeners.push(fn), send });
      }
      for (;;) {
        if (buf.length < 2) return;
        const l0 = buf[1] & 0x7f;
        let off = 2; let len = l0;
        if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const text = buf.subarray(off, off + len).toString();
        buf = buf.subarray(off + len);
        listeners.forEach((fn) => fn(text));
      }
    });
    function send(text) {
      const body = Buffer.from(text);
      const m = crypto.randomBytes(4);
      const mk = Buffer.alloc(body.length);
      for (let i = 0; i < body.length; i++) mk[i] = body[i] ^ m[i % 4];
      const hdr = body.length < 126
        ? Buffer.from([0x81, 0x80 | body.length])
        : Buffer.concat([Buffer.from([0x81, 0xfe]),
          (() => { const b = Buffer.alloc(2); b.writeUInt16BE(body.length); return b; })()]);
      sock.write(Buffer.concat([hdr, m, mk]));
    }
  });
}

let n = 1;
function call(conn, command, params = {}) {
  const id = String(n++);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${command}`)), 10000);
    conn.on((text) => {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.type !== 'response') return;
      if (m.id !== undefined && m.id !== id) return;
      clearTimeout(t);
      m.success === false ? reject(new Error(`${command}: ${JSON.stringify(m.payload)}`))
        : resolve(m.payload);
    });
    conn.send(JSON.stringify({ id, type: 'command', command, params }));
  });
}

(async () => {
  const [trackIdx, fxIdx, paramIdx, stepsArg] = process.argv.slice(2).map(Number);
  const steps = stepsArg || 21;
  const conn = await open();

  // Fetch the whole list and pick by index. Asking for a one-parameter page
  // at an offset looked equivalent and was not — it came back with parameter
  // zero, so the probe read Predelay while writing Type.
  const read = async () => {
    const page = await call(conn, 'fx/getParams',
      { trackIdx, fxIdx, offset: 0, limit: 256 });
    return page.params.find((p) => p.index === paramIdx);
  };

  const before = await read();
  if (!before) throw new Error(`no parameter ${paramIdx} on that FX`);
  console.log(`${before.name}: currently ${before.value} -> ${before.formatted}\n`);

  // --set puts a value back without probing, for undoing a bad run.
  const setArg = process.argv.indexOf('--set');
  if (setArg > 0) {
    await call(conn, 'fx/setParam',
      { trackIdx, fxIdx, paramIdx, value: Number(process.argv[setArg + 1]) });
    const now = await read();
    console.log(`set to ${now.value} -> ${now.formatted}`);
    conn.sock.end();
    return;
  }

  const seen = [];
  for (let i = 0; i < steps; i++) {
    const v = i / (steps - 1);
    await call(conn, 'fx/setParam', { trackIdx, fxIdx, paramIdx, value: v });
    const now = await read();
    const label = String(now.formatted);
    if (!seen.length || seen[seen.length - 1].label !== label) {
      seen.push({ from: v, label });
    }
    seen[seen.length - 1].to = v;
  }

  await call(conn, 'fx/setParam', { trackIdx, fxIdx, paramIdx, value: before.value });
  const after = await read();

  for (const s of seen) {
    const mid = (s.from + s.to) / 2;
    console.log(`  ${s.from.toFixed(3)} .. ${s.to.toFixed(3)}   `
      + `pick ${mid.toFixed(3)}   ${s.label}`);
  }
  console.log(`\nrestored to ${after.value} -> ${after.formatted}`);
  conn.sock.end();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });

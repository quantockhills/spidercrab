#!/usr/bin/env node
/**
 * Prove the step-sequencer round trip against a running REAPER.
 *
 * Everything in seq_handlers.cpp is correct by inspection and by unit test,
 * and none of it has ever moved a real note. This asks REAPER.
 *
 * It is deliberately non-destructive: the target item's notes and ext data are
 * captured first and written back at the end, so it can be pointed at a real
 * project. Every write also goes through an undo block, so Ctrl+Z is a second
 * safety net.
 *
 * Usage:
 *   node tools/seq_check.js                # find the first MIDI item anywhere
 *   node tools/seq_check.js <track> <item> # use that one
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

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const encode = (notes) =>
  notes.map((n) => `${n.pitch}:${n.start}:${n.end}:${n.vel}:${n.chan}`).join(',');

(async () => {
  const conn = await open();
  console.log('connected\n');

  // ---- find a target -------------------------------------------------
  let trackIdx = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
  let itemIdx  = process.argv[3] !== undefined ? Number(process.argv[3]) : null;

  if (trackIdx === null) {
    const { tracks } = await call(conn, 'track/getAll');
    for (const t of tracks) {
      const { items } = await call(conn, 'seq/listItems', { trackIdx: t.index });
      if (items.length) {
        trackIdx = t.index; itemIdx = items[0].itemIdx;
        console.log(`using track ${trackIdx} ("${t.name}"), item ${itemIdx} `
                  + `("${items[0].name}")\n`);
        break;
      }
    }
  }
  if (trackIdx === null) {
    console.log('No MIDI item found. Make one on any track and run again.');
    process.exit(2);
  }

  // ---- capture, so we can put it back --------------------------------
  const before = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
  console.log(`before: ${before.noteCount} notes, ppq ${before.ppqStart}..${before.ppqEnd}, `
            + `ext ${before.ext ? before.ext.length + ' chars' : 'empty'}\n`);

  try {
    // ---- 1. notes round-trip exactly ---------------------------------
    console.log('notes');
    const span = (before.ppqEnd - before.ppqStart) || 3840;
    const step = span / 16;
    const written = [
      { pitch: 36, start: before.ppqStart + 0 * step, end: before.ppqStart + 0.5 * step, vel: 100, chan: 0 },
      { pitch: 38, start: before.ppqStart + 4 * step, end: before.ppqStart + 4.5 * step, vel: 90,  chan: 0 },
      { pitch: 42, start: before.ppqStart + 2 * step, end: before.ppqStart + 2.5 * step, vel: 64,  chan: 9 },
    ];
    await call(conn, 'seq/writePattern',
      { trackIdx, itemIdx, notes: encode(written), ext: '' });

    const after = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
    check('note count matches', after.noteCount === 3, `got ${after.noteCount}`);

    const byPitch = Object.fromEntries(after.notes.map((n) => [n.pitch, n]));
    for (const w of written) {
      const got = byPitch[w.pitch];
      if (!got) { check(`note ${w.pitch} present`, false); continue; }
      check(`note ${w.pitch} start`, Math.abs(got.start - w.start) < 1,
            `sent ${w.start}, got ${got.start}`);
      check(`note ${w.pitch} end`, Math.abs(got.end - w.end) < 1,
            `sent ${w.end}, got ${got.end}`);
      check(`note ${w.pitch} velocity`, got.vel === w.vel, `sent ${w.vel}, got ${got.vel}`);
      check(`note ${w.pitch} channel`, got.chan === w.chan, `sent ${w.chan}, got ${got.chan}`);
    }

    // ---- 2. a shorter pattern really replaces the longer one ----------
    // This is what catches a forward delete loop, which leaves every second
    // note behind.
    console.log('\nreplacement');
    await call(conn, 'seq/writePattern',
      { trackIdx, itemIdx, notes: encode([written[0]]), ext: '' });
    const shrunk = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
    check('overwriting 3 notes with 1 leaves 1', shrunk.noteCount === 1,
          `got ${shrunk.noteCount}`);

    // ---- 3. the ext blob survives ------------------------------------
    // The least certain assumption in the whole design: if P_EXT does not
    // round-trip, the two-place storage model needs rethinking.
    console.log('\next data');
    const blob = JSON.stringify({ v: 1, rows: { 36: { len: 16, prob: [100, 50] } } });
    await call(conn, 'seq/writePattern',
      { trackIdx, itemIdx, notes: encode([written[0]]), ext: blob });
    const withExt = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
    check('ext blob round-trips', withExt.ext === blob,
          `sent ${blob.length} chars, got ${withExt.ext ? withExt.ext.length : 0}`);

    // ---- 4. bad input is rejected whole ------------------------------
    console.log('\nvalidation');
    let rejected = false;
    try {
      await call(conn, 'seq/writePattern',
        { trackIdx, itemIdx, notes: '36:0:120:100:0,200:240:360:90:0', ext: blob });
    } catch { rejected = true; }
    check('a malformed record is rejected', rejected);

    const untouched = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
    check('a rejected write changed nothing', untouched.noteCount === 1,
          `got ${untouched.noteCount}`);

  } finally {
    // ---- restore -----------------------------------------------------
    console.log('\nrestoring');
    await call(conn, 'seq/writePattern', {
      trackIdx, itemIdx,
      notes: encode(before.notes.map((n) => ({
        pitch: n.pitch, start: n.start, end: n.end, vel: n.vel, chan: n.chan,
      }))),
      ext: before.ext || '',
    });
    const restored = await call(conn, 'seq/readPattern', { trackIdx, itemIdx });
    check('item restored to its original note count',
          restored.noteCount === before.noteCount,
          `was ${before.noteCount}, now ${restored.noteCount}`);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) console.log('failed: ' + failures.join(', '));
  conn.sock.destroy();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error('\n' + e.message);
  console.error('\nIs REAPER running with the new build? Extensions only load at '
              + 'startup — a fresh DLL needs a restart.');
  process.exit(1);
});

const path = require('path');
const WebSocket = require(path.resolve(__dirname, '..', 'frontend', 'node_modules', 'ws'));
const port = 9224;
let nid = 1;

function call(ws, cmd, params = {}) {
  const id = String(nid++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${cmd}`)), 20000);
    const handler = (data) => {
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type !== 'response') return;
      if (m.id !== undefined && m.id !== id) return;
      clearTimeout(timer);
      ws.removeListener('message', handler);
      m.success === false ? reject(new Error(JSON.stringify(m.payload))) : resolve(m.payload);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(Object.assign({ type: 'command', command: cmd }, params, { id })));
  });
}

(async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
  ws.on('error', () => {});

  const TRACK = 5, FX = 0;

  // Scan different offsets to find important parameter groups
  for (const off of [0, 32, 64, 96, 128, 160, 192, 256, 320, 384, 448, 512]) {
    try {
      const page = await call(ws, 'fx/getParams', { trackIdx: TRACK, fxIdx: FX, offset: off, limit: 16 });
      for (const p of page.params) {
        const n = p.name.toLowerCase();
        if (n.indexOf('step') < 0 && n.indexOf('note') < 0 && n.indexOf('matrix') < 0) {
          console.log(`[${off}] ${String(p.index).padStart(3)} ${String(p.name).padEnd(40)} [${p.min},${p.max}] ${p.formatted||''}`);
        }
      }
    } catch (e) { console.log(`[${off}] timeout`); }
  }

  // Check what step/note params look like
  console.log('\n--- Step/note params (first 10 of offset 32) ---');
  try {
    const page = await call(ws, 'fx/getParams', { trackIdx: TRACK, fxIdx: FX, offset: 32, limit: 16 });
    for (const p of page.params) console.log(`  ${p.name}`);
  } catch (e) { console.log('timeout'); }

  // Check what step/note params look like at various offsets
  console.log('\n--- Params at major offsets ---');
  for (const off of [96, 160, 256, 320, 384, 448]) {
    try {
      const page = await call(ws, 'fx/getParams', { trackIdx: TRACK, fxIdx: FX, offset: off, limit: 4 });
      const names = page.params.map(p => `${p.index}:${p.name}`).join(', ');
      console.log(`[${off}] ${names}`);
    } catch (e) { console.log(`[${off}] timeout`); }
  }

  ws.close();
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
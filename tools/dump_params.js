// Dump ReaDelay's parameters via Spidercrab's WebSocket API.
const path = require('path');
const wsPath = path.resolve(__dirname, '..', 'frontend', 'node_modules', 'ws');
const WebSocket = require(wsPath);
const port = 9224;

let nid = 1;

function call(ws, cmd, params = {}) {
  const id = String(nid++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${cmd}`)), 8000);
    const handler = (data) => {
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type !== 'response') return;
      if (m.id !== undefined && m.id !== id) return;
      clearTimeout(timer);
      ws.removeListener('message', handler);
      m.success === false
        ? reject(new Error(`${cmd} failed: ${JSON.stringify(m.payload)}`))
        : resolve(m.payload);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'command', command: cmd, params }));
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

  // 1. List tracks
  const tracks = (await call(ws, 'track/getAll')).tracks || [];
  console.log(`Project: ${tracks.length} tracks`);

  // 2. Search for Stock delay / ReaDelay on every track + master (-1)
  let targetTrack = null, targetFx = null;

  for (const ti of [...tracks.map((t) => t.index), -1]) {
    try {
      const r = await call(ws, 'track/getFx', { trackIdx: ti });
      for (const fx of (r.fx || [])) {
        const n = fx.name.toLowerCase();
        if (n.includes('stock delay') || n.includes('readelay')) {
          targetTrack = ti;
          targetFx = fx;
          console.log(`\nFound: "${fx.name}" on track ${ti} (fx ${fx.index})`);
        }
      }
    } catch {}
  }

  // 3. If not found, try to add it
  let trackWasAdded = false;
  if (!targetFx) {
    for (const name of ['VST: Stock delay', 'VST:Stock delay', 'Stock delay', 'readelay.dll', 'ReaDelay']) {
      try {
        const r = await call(ws, 'fx/add', { trackIdx: 0, fxName: name });
        if (r.fxIdx >= 0) {
          targetTrack = 0;
          targetFx = { index: r.fxIdx, name };
          trackWasAdded = true;
          console.log(`\nAdded: "${name}" at fx ${r.fxIdx}`);
          break;
        }
      } catch {}
    }
  }

  if (!targetFx) {
    console.error('\nStock delay not found anywhere and could not be added.');
    ws.close();
    process.exit(1);
  }

  // 4. Dump all parameters
  const params = [];
  for (let offset = 0; ; ) {
    const page = await call(ws, 'fx/getParams', {
      trackIdx: targetTrack, fxIdx: targetFx.index, offset, limit: 128,
    });
    params.push(...page.params);
    offset += page.params.length;
    if (!page.params.length || params.length >= page.total) break;
  }

  console.log(`\n${params.length} parameters:\n`);
  for (const p of params) {
    console.log(
      `${String(p.index).padStart(3)}  ${String(p.name).padEnd(32)}`
      + `${String(p.value).padStart(10)}  [${p.min}, ${p.max}]  ${p.formatted ?? ''}`,
    );
  }

  // 5. If we added it, clean up
  if (trackWasAdded) {
    await call(ws, 'fx/delete', { trackIdx: 0, fxIdx: targetFx.index });
    console.log('\n(cleaned up — removed the temporary instance)');
  }

  ws.close();
})().catch(async (e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
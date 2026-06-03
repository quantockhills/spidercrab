import WebSocket from 'ws';

const wsUrl = 'ws://127.0.0.1:9224';
const ws = new WebSocket(wsUrl);

let step = 0;

function send(cmd, params, id) {
  ws.send(JSON.stringify({ type: 'command', id, command: cmd, params: params || {} }));
}

ws.on('open', () => {
  // Step 1: Add a track
  send('track/add', {}, 'addtrack');
});

ws.on('message', (data) => {
  const resp = JSON.parse(data.toString());
  
  if (resp.id === 'addtrack') {
    console.log('Track added:', resp.success);
    // Step 2: Get tracks
    send('track/getAll', {}, 'gettracks');
  }
  else if (resp.id === 'gettracks') {
    console.log('Tracks:', resp.payload?.tracks?.length);
    // Step 3: Enumerate FX to find ReaEQ
    send('fx/enumerate', {}, 'enumfx');
  }
  else if (resp.id === 'enumfx') {
    const fxList = resp.payload?.fx || [];
    const reaeq = fxList.find(f => f.name.includes('ReaEQ'));
    if (reaeq) {
      console.log('Found ReaEQ:', reaeq.name, 'index:', reaeq.index);
      // Step 4: Add ReaEQ to track 0
      send('fx/add', { trackIdx: 0, fxName: reaeq.name }, 'addfx');
    } else {
      console.log('ReaEQ not found!');
    }
  }
  else if (resp.id === 'addfx') {
    console.log('FX added:', resp.success, 'fxIdx:', resp.payload?.fxIdx);
    // Step 5: Get preset info
    send('fx/getPreset', { trackIdx: 0, fxIdx: 0 }, 'getpreset');
  }
  else if (resp.id === 'getpreset') {
    console.log('Preset info:', JSON.stringify(resp.payload));
    // Step 6: Get all preset names
    send('fx/getAllPresetNames', { trackIdx: 0, fxIdx: 0 }, 'getnames');
  }
  else if (resp.id === 'getnames') {
    console.log('All preset names:', JSON.stringify(resp.payload));
    ws.close();
    setTimeout(() => process.exit(0), 200);
  }
});

ws.on('error', (err) => console.error('Error:', err.message));
setTimeout(() => { console.log('Timeout'); ws.close(); process.exit(0); }, 15000);

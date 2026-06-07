#!/usr/bin/env node
/**
 * Mock WebSocket server for screenshot testing.
 * Mimics the spidercrab extension's WebSocket protocol on port 9224.
 *
 * Response format: {"type":"response","id":"...","success":true,"payload":{...}}
 * Incoming format: {"type":"command","command":"cmdName","id":"...",...params}
 */

const { WebSocketServer } = require('ws');

const PORT = 9224;

const server = new WebSocketServer({ port: PORT });

console.log(`Mock WS server listening on ws://127.0.0.1:${PORT}`);

function makeResponse(id, success, payload) {
  return JSON.stringify({
    type: 'response',
    id: id || '',
    success: !!success,
    payload: payload || {},
  });
}

const TRACKS = [
  { index: 0, name: 'Track 1',     trackNumber: 1, selected: false, muted: false, soloed: false, armed: false, volume: 0.75, pan: 0 },
  { index: 1, name: 'Track 2',     trackNumber: 2, selected: true,  muted: false, soloed: true,  armed: false, volume: 0.50, pan: -0.3 },
  { index: 2, name: 'Guitar',      trackNumber: 3, selected: false, muted: false, soloed: false, armed: true,  volume: 0.90, pan: 0.2 },
  { index: 3, name: 'Drums',       trackNumber: 4, selected: false, muted: true,  soloed: false, armed: false, volume: 0.60, pan: 0 },
];

const FX_LIST = [
  { index: 0, name: 'ReaEQ' },
  { index: 1, name: 'ReaComp' },
];

server.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.log('Invalid JSON:', data.toString());
      return;
    }

    const type = msg.type || '';
    const command = msg.command || '';
    const id = msg.id || '';

    console.log(`Received: type="${type}" command="${command}" id="${id}"`);

    if (type !== 'command') {
      console.log('Ignoring non-command message');
      return;
    }

    switch (command) {
      case 'track/getAll':
        ws.send(makeResponse(id, true, { tracks: TRACKS }));
        break;

      case 'track/getFx':
        ws.send(makeResponse(id, true, { fx: FX_LIST }));
        break;

      case 'fx/enumerate':
        ws.send(makeResponse(id, true, { fx: [
          { index: 0, name: 'ReaEQ', ident: 'ReaEQ', format: 'VST3' },
          { index: 1, name: 'ReaComp', ident: 'ReaComp', format: 'VST3' },
          { index: 2, name: 'ReaSynth', ident: 'ReaSynth', format: 'VST' },
        ]}));
        break;

      case 'fx/getParams':
        ws.send(makeResponse(id, true, { params: [], total: 0, offset: 0, limit: 32 }));
        break;

      case 'transport/play':
        ws.send(makeResponse(id, true, { playing: true }));
        break;

      case 'transport/stop':
        ws.send(makeResponse(id, true, { playing: false }));
        break;

      case 'track/setMute':
      case 'track/setSolo':
      case 'track/setArm':
      case 'track/setVolume':
      case 'track/setPan':
      case 'track/add':
        ws.send(makeResponse(id, true, { success: true }));
        break;

      // ── Sample Browser commands (Issue #107) ──

      case 'sample/getDirectory': {
        const samplePath = msg.path || '';
        console.log(`  sample/getDirectory path="${samplePath}"`);
        ws.send(makeResponse(id, true, {
          entries: [
            { name: 'Kick.wav', type: 'file', size: 2048576 },
            { name: 'Snare.wav', type: 'file', size: 1024576 },
            { name: 'HiHat.wav', type: 'file', size: 512576 },
            { name: 'Bass.wav', type: 'file', size: 4096576 },
            { name: 'Piano.wav', type: 'file', size: 8192576 },
            { name: 'Drums', type: 'dir', size: 0 },
            { name: 'Synth', type: 'dir', size: 0 },
          ],
        }));
        break;
      }

      case 'sample/refreshCache': {
        console.log(`  sample/refreshCache`);
        ws.send(makeResponse(id, true, { total: 5000, rootPath: '/home/sasha/samples' }));
        // Send progress events after response
        let progress = 0;
        const total = 5000;
        const progressInterval = setInterval(() => {
          progress += 500;
          if (progress > total) progress = total;
          ws.send(JSON.stringify({
            type: 'event',
            event: 'sampleIndexProgress',
            payload: { scanned: progress, total, status: 'scanning' },
          }));
          console.log(`  -> progress: ${progress}/${total}`);
          if (progress >= total) {
            clearInterval(progressInterval);
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'event',
                event: 'sampleIndexComplete',
                payload: { total, rootPath: '/home/sasha/samples' },
              }));
              console.log(`  -> complete`);
            }, 500);
          }
        }, 300);
        break;
      }

      case 'sample/sendToTrack': {
        console.log(`  sample/sendToTrack: path=${msg.path} trackIdx=${msg.trackIdx}`);
        ws.send(makeResponse(id, true, { success: true }));
        break;
      }

      // ── FX Chain commands (Issue #78) ──

      case 'fxchain/getDirectory': {
        const pathParam = msg.path || '';
        console.log(`  fxchain/getDirectory path="${pathParam}"`);
        ws.send(makeResponse(id, true, {
          chains: [
            { name: 'EQ+Comp.RfxChain', size: 2048 },
            { name: 'Vocal Chain.RfxChain', size: 4096 },
            { name: 'Master Bus.RfxChain', size: 1536 },
          ],
          dirs: ['Guitar', 'Drums', 'Vocals'],
        }));
        break;
      }

      case 'fxchain/getInfo': {
        const infoPath = msg.filePath || '';
        console.log(`  fxchain/getInfo path="${infoPath}"`);
        ws.send(makeResponse(id, true, {
          fxCount: 2,
          fxNames: ['ReaEQ', 'ReaComp'],
          chainDescription: 'EQ + Compressor',
          fileSize: 2048,
        }));
        break;
      }

      case 'fxchain/load': {
        console.log(`  fxchain/load: trackIdx=${msg.trackIdx} mode=${msg.mode}`);
        ws.send(makeResponse(id, true, { success: true }));
        break;
      }

      case 'fxchain/save': {
        console.log(`  fxchain/save: trackIdx=${msg.trackIdx} filePath=${msg.filePath}`);
        ws.send(makeResponse(id, true, { success: true }));
        break;
      }

      default:
        console.log(`Unhandled command: ${command}`);
        ws.send(makeResponse(id, true, {}));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});

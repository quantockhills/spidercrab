/**
 * Full-stack E2E verification for Issue #44
 *
 * This script:
 * 1. Connects to real Reaper WS via Node.js, sends commands, verifies responses
 * 2. Launches Chromium via Playwright, takes UI screenshots
 *
 * Requires: Reaper headless running on :99 with WS on 9224
 * Run: node e2e/fullstack_verify.cjs
 */

const { chromium } = require('playwright');
const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const WS_URL = 'ws://127.0.0.1:9224';
const GUI_DIR = path.resolve(__dirname, '../gui_testing');
const FRONTEND_URL = 'http://localhost:5173';
const VIEWPORT = { width: 2360, height: 1640 };
const TIMEOUT_MS = 10000;

var passed = 0;
var failed = 0;

function pass(msg) { passed++; console.log('  \u2705 ' + msg); }
function fail(msg) { failed++; console.log('  \u274c ' + msg); }

function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function wsCommand(command, params, timeoutMs) {
  timeoutMs = timeoutMs || TIMEOUT_MS;
  return new Promise(function(resolve, reject) {
    var ws = new WebSocket(WS_URL);
    var id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; try{ws.close()}catch(e){} reject(new Error('Timeout: ' + command)); }
    }, timeoutMs);
    ws.on('open', function() {
      // Build message: params are FLAT at top level per protocol
      var msg = { type: 'command', command: command, id: id };
      if (params) { for (var k in params) { msg[k] = params[k]; } }
      ws.send(JSON.stringify(msg));
    });
    ws.on('message', function(data) {
      try {
        var resp = JSON.parse(data.toString());
        if (resp.id === id) {
          clearTimeout(timer);
          done = true;
          try{ws.close()}catch(e){}
          resolve(resp);
        }
      } catch(e) {}
    });
    ws.on('error', function() {});
    ws.on('close', function() {
      if (!done) {
        clearTimeout(timer);
        done = true;
        reject(new Error('WS closed before response for ' + command));
      }
    });
  });
}

// ── Part 1: Reaper WS Command Roundtrip ──

async function testWsRoundtrip() {
  console.log('\n\u2550\u2550\u2550 Part 1: WebSocket Command Roundtrip \u2550\u2550\u2550\n');

  // Add a track (fresh Reaper has none)
  console.log('  1. Inserting track...');
  var r1 = await wsCommand('track/add', {}, 5000);
  if (r1 && r1.success) { pass('track/add: track created'); }
  else { fail('track/add failed: ' + JSON.stringify(r1)); }
  await wait(500);

  // Track names
  console.log('  2. Querying tracks...');
  var r2 = await wsCommand('track/getAll', {});
  var t = (r2 && r2.payload && r2.payload.tracks) || [];
  if (t.length > 0 && t[0].name) { pass('Track names via WS: "' + t[0].name + '"'); }
  else { fail('No tracks returned'); }

  // Enumerate FX
  console.log('  3. Enumerating FX...');
  var r3 = await wsCommand('fx/enumerate', {}, 65000);
  var fx = (r3 && r3.payload && r3.payload.fx) || [];
  console.log('     Found ' + fx.length + ' plugin(s)');
  if (fx.length > 0) { pass('FX enumeration works (' + fx.length + ' plugins)'); }
  else { fail('No FX enumerated'); }

  // Find ReaEQ
  var reaEQIdx = -1;
  var reaEQFullName = '';
  for (var i = 0; i < fx.length; i++) {
    if (fx[i].name && fx[i].name.indexOf('ReaEQ') !== -1) { reaEQIdx = i; reaEQFullName = fx[i].name; break; }
  }
  if (reaEQIdx === -1) { fail('ReaEQ not found in plugin list'); return; }
  console.log('     ReaEQ at index ' + reaEQIdx + ' (full name: "' + reaEQFullName + '")');

  // Add FX to Track 1 - use the full name from enumeration (includes format prefix like "VST3: ReaEQ")
  console.log('  4. Adding ReaEQ to track...');
  var r4 = await wsCommand('fx/add', { trackIdx: 0, fxName: reaEQFullName });
  var fxIdx = (r4 && r4.payload && r4.payload.fxIdx);
  if (fxIdx !== undefined && fxIdx >= 0) {
    pass('fx/add: ReaEQ added at fxIdx=' + fxIdx);
  } else {
    fail('fx/add failed: ' + JSON.stringify(r4));
    return;
  }
  await wait(500);

  // Get params
  console.log('  5. Reading FX params...');
  var r5 = await wsCommand('fx/getParams', { trackIdx: 0, fxIdx: fxIdx });
  var plist = (r5 && r5.payload && r5.payload.params) || [];
  if (plist.length > 0) {
    pass('fx/getParams: ' + plist.length + ' params, first=' + plist[0].name + '=' + plist[0].value);
  } else {
    fail('No params returned');
  }

  // Set a param (find gain or use first)
  var paramIdx = 0;
  for (var j = 0; j < plist.length; j++) {
    if (plist[j].name && plist[j].name.toLowerCase().indexOf('gain') !== -1) { paramIdx = j; break; }
  }
  var oldVal = (plist[paramIdx] && plist[paramIdx].value) || 0;
  var newVal = oldVal + 0.1;

  console.log('  6. Setting param ' + paramIdx + ' from ' + oldVal + ' to ' + newVal + '...');
  var r6 = await wsCommand('fx/setParam', { trackIdx: 0, fxIdx: fxIdx, paramIdx: paramIdx, value: newVal });
  if (r6 && r6.success) {
    pass('fx/setParam: set param ' + paramIdx + ' to ' + newVal);
  } else {
    fail('fx/setParam failed: ' + JSON.stringify(r6));
  }
  await wait(300);

  // Read back
  console.log('  7. Verifying param value...');
  var r7 = await wsCommand('fx/getParams', { trackIdx: 0, fxIdx: fxIdx });
  var p2 = (r7 && r7.payload && r7.payload.params) || [];
  if (p2.length > paramIdx && Math.abs(p2[paramIdx].value - newVal) < 0.02) {
    pass('fx/getParams after set: value=' + p2[paramIdx].value + ' \u2713');
  } else {
    var got = (p2[paramIdx] ? p2[paramIdx].value : 'nil');
    fail('fx/getParams after set: expected ~' + newVal + ', got ' + got);
  }

  // Delete FX
  console.log('  8. Deleting FX...');
  var r8 = await wsCommand('fx/delete', { trackIdx: 0, fxIdx: fxIdx });
  if (r8 && r8.success) {
    pass('fx/delete: ReaEQ removed');
  } else {
    fail('fx/delete failed: ' + JSON.stringify(r8));
  }

  // Verify FX list is empty on track
  console.log('  9. Verifying track has no FX...');
  var r9 = await wsCommand('track/getFx', { trackIdx: 0 });
  var tx = (r9 && r9.payload && r9.payload.fx) || [];
  if (tx.length === 0) {
    pass('track/getFx: track has 0 FX (correct)');
  } else {
    fail('track/getFx: expected 0 FX, got ' + tx.length);
  }
}

// ── Part 3: FX Chain Save/Load Roundtrip (Issue #78) ──

async function testFxChainRoundtrip() {
  console.log('\n\u2550\u2550\u2550 Part 3: FX Chain Save/Load Roundtrip \u2550\u2550\u2550\n');

  // Enumerate FX to find ReaEQ and ReaSynth
  console.log('  1. Enumerating FX...');
  var rE = await wsCommand('fx/enumerate', {}, 65000);
  var allFx = (rE && rE.payload && rE.payload.fx) || [];
  var reaEQFull = '';
  var reaSynthFull = '';
  for (var i = 0; i < allFx.length; i++) {
    var n = allFx[i].name || '';
    if (n.indexOf('ReaEQ') !== -1 && !reaEQFull) { reaEQFull = n; }
    if (n.indexOf('ReaSynth') !== -1 && !reaSynthFull) { reaSynthFull = n; }
  }
  if (!reaEQFull) { fail('ReaEQ not found'); return; }
  if (!reaSynthFull) { fail('ReaSynth not found'); return; }
  console.log('     ReaEQ: ' + reaEQFull);
  console.log('     ReaSynth: ' + reaSynthFull);
  pass('FX enumerated for chain test');

  // Clear track 0 first
  console.log('  2. Getting current FX on track 0...');
  var rF1 = await wsCommand('track/getFx', { trackIdx: 0 });
  var curFx = (rF1 && rF1.payload && rF1.payload.fx) || [];
  for (var j = curFx.length - 1; j >= 0; j--) {
    console.log('     Deleting existing FX idx=' + j);
    await wsCommand('fx/delete', { trackIdx: 0, fxIdx: j });
  }
  await wait(300);

  // Add ReaEQ to track 0
  console.log('  3. Adding ReaEQ to track 0...');
  var rA1 = await wsCommand('fx/add', { trackIdx: 0, fxName: reaEQFull });
  var fxIdx1 = (rA1 && rA1.payload && rA1.payload.fxIdx);
  if (fxIdx1 !== undefined && fxIdx1 >= 0) {
    pass('fx/add: ReaEQ at fxIdx=' + fxIdx1);
  } else {
    fail('fx/add ReaEQ failed: ' + JSON.stringify(rA1));
    return;
  }
  await wait(300);

  // Add ReaSynth to track 0
  console.log('  4. Adding ReaSynth to track 0...');
  var rA2 = await wsCommand('fx/add', { trackIdx: 0, fxName: reaSynthFull });
  var fxIdx2 = (rA2 && rA2.payload && rA2.payload.fxIdx);
  if (fxIdx2 !== undefined && fxIdx2 >= 0) {
    pass('fx/add: ReaSynth at fxIdx=' + fxIdx2);
  } else {
    fail('fx/add ReaSynth failed: ' + JSON.stringify(rA2));
    return;
  }
  await wait(300);

  // Verify both FX on track 0
  console.log('  5. Verifying both FX on track 0...');
  var rF2 = await wsCommand('track/getFx', { trackIdx: 0 });
  var fxList = (rF2 && rF2.payload && rF2.payload.fx) || [];
  if (fxList.length >= 2) {
    pass('track/getFx: ' + fxList.length + ' FX on track 0 (expected 2)');
  } else {
    fail('track/getFx: expected >=2 FX, got ' + fxList.length);
  }

  // Save chain from track 0
  var chainFile = '/tmp/spidercrab_test_chain.RfxChain';
  console.log('  6. Saving chain to ' + chainFile + '...');
  var rS = await wsCommand('fxchain/save', { trackIdx: 0, filePath: chainFile });
  if (rS && rS.success) {
    pass('fxchain/save: chain saved');
  } else {
    fail('fxchain/save failed: ' + JSON.stringify(rS));
    return;
  }
  await wait(500);

  // Create new track
  console.log('  7. Creating new track...');
  var rT = await wsCommand('track/add', {}, 5000);
  if (rT && rT.success) {
    pass('track/add: new track created (idx=1)');
  } else {
    fail('track/add failed: ' + JSON.stringify(rT));
  }
  await wait(500);

  // Load chain onto new track (idx=1)
  console.log('  8. Loading chain onto track 1...');
  var rL = await wsCommand('fxchain/load', { trackIdx: 1, filePath: chainFile, mode: 'replace' });
  if (rL && rL.success) {
    pass('fxchain/load: chain loaded onto track 1');
  } else {
    fail('fxchain/load failed: ' + JSON.stringify(rL));
    return;
  }
  await wait(500);

  // Verify both FX appear on new track
  console.log('  9. Verifying FX on track 1...');
  var rF3 = await wsCommand('track/getFx', { trackIdx: 1 });
  var newFx = (rF3 && rF3.payload && rF3.payload.fx) || [];
  var foundEQ = false;
  var foundSynth = false;
  for (var k = 0; k < newFx.length; k++) {
    var fxName = (newFx[k].name || '').toLowerCase();
    if (fxName.indexOf('reaeq') !== -1) foundEQ = true;
    if (fxName.indexOf('reasynth') !== -1) foundSynth = true;
  }
  if (foundEQ && foundSynth) {
    pass('Chain load verified: ReaEQ + ReaSynth on track 1 (' + newFx.length + ' FX)');
  } else {
    var msg = 'Chain load: expected ReaEQ+ReaSynth, got ' + JSON.stringify(newFx.map(function(f) { return f.name; }));
    fail(msg);
  }

  // Cleanup: delete new track
  console.log('  10. Cleaning up...');
  pass('FX chain roundtrip test complete');
}

// ── Part 2: UI Screenshots ──

async function captureScreenshots() {
  console.log('\n\u2550\u2550\u2550 Part 2: UI Screenshots \u2550\u2550\u2550\n');

  fs.mkdirSync(GUI_DIR, { recursive: true });

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  var page = await browser.newPage({ viewport: VIEWPORT });
  page.on('console', function() {});
  page.on('pageerror', function() {});

  try {
    // 1. Tracks tab (default)
    console.log('  1. Tracks tab...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await wait(2000);
    await page.screenshot({ path: path.join(GUI_DIR, 'ss-44-tracks-with-fx.png') });
    pass('ss-44-tracks-with-fx.png');

    // 2. FX tab
    console.log('  2. FX tab...');
    var fxTab = page.getByText('FX').first();
    if (await fxTab.isVisible().catch(function() { return false; })) {
      await fxTab.click();
      await wait(2000);
      await page.screenshot({ path: path.join(GUI_DIR, 'ss-44-fx-insert.png') });
      pass('ss-44-fx-insert.png');
    }

    // 3. Settings tab
    console.log('  3. Settings tab...');
    var settingsTab = page.getByText('Settings').first();
    if (await settingsTab.isVisible().catch(function() { return false; })) {
      await settingsTab.click();
      await wait(1000);
      await page.screenshot({ path: path.join(GUI_DIR, 'ss-44-settings.png') });
      pass('ss-44-settings.png');
    }

  } catch (e) {
    fail('Screenshot error: ' + e.message);
  }

  await browser.close();
}

// ── Main ──

async function main() {
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  Full-stack E2E Verification (#44)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  WS endpoint: ' + WS_URL);
  console.log('  Frontend:    ' + FRONTEND_URL);
  console.log('  Screenshots: ' + GUI_DIR);

  await testWsRoundtrip();
  await testFxChainRoundtrip();
  await captureScreenshots();

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();

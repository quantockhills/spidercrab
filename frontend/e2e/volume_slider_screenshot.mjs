/**
 * Screenshot script for Issue #85: Volume slider always reads 0.0dB
 *
 * Tests that:
 * 1. Volume slider shows correct dB value (not always 0.0dB)
 * 2. After changing volume, the readout updates
 *
 * Usage: node e2e/volume_slider_screenshot.mjs
 * Requires: Reaper running on WS 9224, frontend on http://localhost:5173
 */

import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS_URL = 'ws://127.0.0.1:9224';
const SCREENSHOT_DIR = path.resolve(__dirname, '../gui_testing');
const FRONTEND_URL = 'http://localhost:5173';
const VIEWPORT = { width: 2360, height: 1640 };

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Helper: send WS command, get response
function wsCommand(command, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; try { ws.close(); } catch (e) {} reject(new Error('Timeout: ' + command)); }
    }, timeoutMs);
    ws.on('open', () => {
      const msg = { type: 'command', command, id, ...params };
      ws.send(JSON.stringify(msg));
    });
    ws.on('message', (data) => {
      try {
        const resp = JSON.parse(data.toString());
        if (resp.id === id) {
          clearTimeout(timer);
          done = true;
          try { ws.close(); } catch (e) {}
          resolve(resp);
        }
      } catch (e) {}
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        reject(new Error('WS closed before response for ' + command));
      }
    });
  });
}

async function main() {
  console.log('=== Issue #85: Volume slider screenshot ===\n');

  // 1. Ensure at least one track exists with non-unity volume
  console.log('1. Setting up track with non-unity volume...');
  
  // Get current tracks
  const tracksResp = await wsCommand('track/getAll');
  let tracks = tracksResp?.payload?.tracks || [];
  console.log(`   Found ${tracks.length} track(s)`);
  
  // If no tracks, create one
  if (tracks.length === 0) {
    await wsCommand('track/add');
    await wait(500);
  }
  
  // Set volume to something non-unity (-6dB ≈ 0.5)
  await wsCommand('track/setVolume', { trackIdx: 0, volume: 0.5 });
  await wait(300);
  
  // Set pan to 0.3 for visual variety
  await wsCommand('track/setPan', { trackIdx: 0, pan: 0.3 });
  await wait(300);

  // Verify the volume was set
  const verifyResp = await wsCommand('track/getAll');
  const updatedTracks = verifyResp?.payload?.tracks || [];
  if (updatedTracks.length > 0) {
    console.log(`   Track volume: ${updatedTracks[0].volume} (should be ~0.5 → -6dB)`);
    console.log(`   Track pan: ${updatedTracks[0].pan}`);
  }

  // 2. Launch browser and take screenshots
  console.log('\n2. Launching browser for screenshots...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage({ viewport: VIEWPORT });
  
  // Proxy WebSocket through Playwright
  page.routeWebSocket(WS_URL, (ws) => {
    const realWs = new WebSocket(WS_URL);
    realWs.on('open', () => {
      ws.onMessage((msg) => realWs.send(msg.toString()));
    });
    realWs.on('message', (data) => ws.send(data.toString()));
    realWs.on('error', () => {});
    ws.on('close', () => realWs.close());
  });

  try {
    console.log('3. Navigating to frontend...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(4000);

    // Check connection status
    const text = await page.evaluate(() => document.body.textContent ?? '');
    console.log(`   Page text (first 300 chars): ${text.substring(0, 300)}`);

    // Wait for tracks to load
    await wait(2000);

    // Screenshot 1: Initial tracks view with volume readout
    console.log('\n4. Taking screenshot: tracks view with volume slider...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ss-85-tracks-volume.png') });
    console.log('   ✓ Saved ss-85-tracks-volume.png');

    // Try to find and interact with volume slider
    // Look for the volume fader/slider input
    const volumeSlider = page.locator('input[type="range"]').first();
    const sliderExists = await volumeSlider.isVisible().catch(() => false);
    if (sliderExists) {
      console.log('5. Volume slider found, changing value...');
      
      // Get initial value
      const initVal = await volumeSlider.inputValue();
      console.log(`   Initial slider value: ${initVal}`);

      // Drag the slider to change volume
      const box = await volumeSlider.boundingBox();
      if (box) {
        // Drag to ~80% (higher volume)
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        await wait(500);
      }

      // Screenshot 2: After slider interaction
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ss-85-volume-after-drag.png') });
      console.log('   ✓ Saved ss-85-volume-after-drag.png');

      // Check the displayed dB value
      const pageText = await page.evaluate(() => document.body.textContent ?? '');
      // Look for dB patterns
      const dbMatches = pageText.match(/[-+]?\d+\.\d+\s*dB/gi);
      if (dbMatches) {
        console.log(`   Found dB readouts: ${dbMatches.join(', ')}`);
      } else {
        console.log('   No "X.X dB" pattern found in page text');
        // Try looking for just numbers with decimal
        const numMatches = pageText.match(/[-+]?\d+\.\d+/g);
        console.log(`   All decimal numbers: ${numMatches?.join(', ') || 'none'}`);
      }
    } else {
      console.log('   No range slider found, taking additional screenshot');
      // Take another shot after waiting longer
      await wait(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ss-85-full-ui.png') });
      
      const buttons = await page.locator('button').allTextContents();
      console.log(`   Buttons found: ${buttons.join(' | ')}`);
    }

  } catch (e) {
    console.error('ERROR:', e.message);
    // Take error screenshot
    try {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ss-85-error.png') });
    } catch (e2) {}
  } finally {
    await browser.close();
  }

  // List all screenshots
  console.log('\n=== Screenshots captured ===');
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith('ss-85'));
  for (const f of files) {
    const stat = fs.statSync(path.join(SCREENSHOT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  console.log('\nDone.');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

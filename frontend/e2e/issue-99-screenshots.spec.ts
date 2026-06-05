import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

function wsSend(command: string, params: Record<string, any> = {}) {
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9224');
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'command', command, id: 'test', payload: params }));
    });
    ws.on('message', (data: any) => {
      try { resolve(JSON.parse(data.toString())); } catch(e) { resolve(data); }
      ws.close();
    });
    ws.on('error', reject);
  });
}

// Helper to wait for connection
async function waitForConnected(page: any) {
  for (let i = 0; i < 30; i++) {
    const text = await page.textContent('body');
    if (text && text.includes('Connected')) return;
    await page.waitForTimeout(500);
  }
}

test.describe('Issue #99 Record Mode Toggle', () => {
  test.beforeAll(async () => {
    // Reset all tracks
    for (let i = 0; i < 7; i++) {
      await wsSend('track/setArm', { trackIdx: i, armed: 'false' });
      await wsSend('track/setRecordMode', { trackIdx: i, recMode: 0 });
    }
  });

  test('1. All tracks disarmed', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await waitForConnected(page);

    // Click refresh button by index
    await page.locator('button').nth(0).click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'gui_testing/ss-99-v4-disarmed.png', fullPage: false });
    console.log('Saved ss-99-v4-disarmed.png');
  });

  test('2. Track 0 armed audio mode', async ({ page }) => {
    await wsSend('track/setArm', { trackIdx: 0, armed: 'true' });
    await wsSend('track/setRecordMode', { trackIdx: 0, recMode: 0 });

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await waitForConnected(page);

    await page.locator('button').nth(0).click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'gui_testing/ss-99-v4-armed-audio.png', fullPage: false });
    console.log('Saved ss-99-v4-armed-audio.png');
  });

  test('3. Track 0 MIDI mode', async ({ page }) => {
    await wsSend('track/setRecordMode', { trackIdx: 0, recMode: 7 });

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await waitForConnected(page);

    await page.locator('button').nth(0).click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'gui_testing/ss-99-v4-armed-midi.png', fullPage: false });
    console.log('Saved ss-99-v4-armed-midi.png');
  });

  test('4. Mixed modes', async ({ page }) => {
    await wsSend('track/setRecordMode', { trackIdx: 0, recMode: 0 });
    await wsSend('track/setArm', { trackIdx: 1, armed: 'true' });
    await wsSend('track/setRecordMode', { trackIdx: 1, recMode: 7 });

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await waitForConnected(page);

    await page.locator('button').nth(0).click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'gui_testing/ss-99-v4-mixed.png', fullPage: false });
    console.log('Saved ss-99-v4-mixed.png');
  });
});

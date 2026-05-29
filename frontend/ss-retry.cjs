#!/usr/bin/env node
/**
 * Screenshot capture with async waits for real data.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/tmp/screenshots';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  // ── 1. Load frontend, select Tracks, click Track 2 ──
  console.log('[1/4] Loading frontend + Tracks...');
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.getByText('Tracks').first().click();

  // Wait for actual track data
  await page.waitForSelector('text=Track 1', { timeout: 15000 });
  await page.waitForSelector('text=Track 2', { timeout: 15000 });
  await page.waitForSelector('text=Track 3', { timeout: 15000 });
  await page.waitForSelector('[data-testid="transport-play"]', { timeout: 10000 });

  // Select track 2 so FX browser enables param view later
  await page.getByText('Track 2').first().click();
  await sleep(400);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'ss-01-tracks.png'), fullPage: false });
  console.log('[1/4] ✅ ss-01-tracks.png');

  // ── 2. FX Browser tab ──
  console.log('[2/4] FX Browser...');
  await page.getByText('FX').first().click();

  // Wait for loading to finish
  await page.waitForFunction(() => !document.body.textContent.includes('Loading FX...'), { timeout: 30000 });
  // Wait for count footer
  await page.waitForFunction(() => {
    for (const s of document.querySelectorAll('span')) {
      if (/\d+ total plugins/.test(s.textContent)) return true;
    }
    return false;
  }, { timeout: 30000 });

  await sleep(600);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'ss-02-fx-browser.png'), fullPage: false });
  console.log('[2/4] ✅ ss-02-fx-browser.png');

  // ── 3. FX Search for "ReaVerb" ──
  console.log('[3/4] Search ReaVerb...');
  const searchInput = page.locator('input[placeholder="Search FX..."]');
  await searchInput.fill('ReaVerb');
  await sleep(1000);
  // Wait for results with ReaVerb
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes('ReaVerb') && !body.includes('ReaVerbate'); // actual ReaVerb, not verbate
  }, { timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'ss-03-fx-search.png'), fullPage: false });
  console.log('[3/4] ✅ ss-03-fx-search.png');

  // ── 4. ReaEQ params ──
  console.log('[4/4] ReaEQ params...');
  // Clear search
  await searchInput.fill('');
  await sleep(600);

  // Search for ReaEQ
  await searchInput.fill('ReaEQ');
  await sleep(1000);

  // Click the ReaEQ plugin name row (the left button, not Add)
  // The row has the name in a button inside the row div
  await page.locator('div', { hasText: /ReaEQ/ })
    .filter({ has: page.locator('span:has-text("VST3")') })
    .first()
    .click();

  // Wait for param sliders to appear
  await page.waitForSelector('text=Freq', { timeout: 15000 });
  await page.waitForSelector('text=Gain', { timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'ss-04-params.png'), fullPage: false });
  console.log('[4/4] ✅ ss-04-params.png');

  await browser.close();
  console.log('\n🎉 All screenshots captured in', OUTPUT_DIR);
}

main().catch(err => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});

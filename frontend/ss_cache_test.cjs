const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 2360, height: 1640 } });
  const G = '/home/sasha/projects/reaper-ipad/gui_testing';

  await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Wait for WS
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    if (await p.evaluate(() => document.body.textContent.includes('Connected'))) {
      console.log('WS at', i+1, 's'); break;
    }
  }

  // Tracks
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(500);
    const names = await p.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="font-medium"]'))
        .map(e => e.textContent.trim()).filter(n => n.startsWith('Track'))
    );
    if (names.length >= 2) { console.log('Tracks:', JSON.stringify(names)); break; }
  }

  // Select Track 2
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const r of rows) {
      const n = r.querySelector('[class*="font-medium"]');
      if (n && n.textContent.trim() === 'Track 2') { r.click(); return; }
    }
  });

  // ── FIRST FX LOAD ──
  const t0 = Date.now();
  await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    for (const b of btns) { if (b.textContent.includes('FX')) { b.click(); return; } }
  });
  console.log('First FX load...');

  for (let i = 0; i < 45; i++) {
    await p.waitForTimeout(1000);
    const names = await p.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
        .map(e => e.textContent.trim())
    );
    if (names.length > 0) {
      const t1 = Date.now();
      console.log(`FIRST LOAD: ${names.length} plugins in ${((t1-t0)/1000).toFixed(1)}s`);
      await p.screenshot({ path: G + '/ss-02-fx-list-landscape.png' });

      // Click ReaEQ
      for (const n of names) {
        if (n.includes('ReaEQ')) {
          await p.evaluate(() => {
            const all = document.querySelectorAll('[class*="font-medium"][class*="truncate"]');
            for (const el of all) {
              if (el.textContent.includes('ReaEQ')) {
                const btn = el.closest('button'); if (btn) btn.click(); return;
              }
            }
          });
          console.log('ReaEQ clicked');
          break;
        }
      }
      await p.waitForTimeout(5000);
      await p.screenshot({ path: G + '/ss-06-fx-params-landscape.png' });
      console.log('ss-06 captured');

      // ── CACHED FX LOAD ──
      // Go back to Tracks
      await p.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('nav button'));
        for (const b of btns) { if (b.textContent.includes('Tracks')) { b.click(); return; } }
      });
      await p.waitForTimeout(500);

      // Re-open FX tab
      const t2 = Date.now();
      await p.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('nav button'));
        for (const b of btns) { if (b.textContent.includes('FX')) { b.click(); return; } }
      });

      for (let i = 0; i < 45; i++) {
        await p.waitForTimeout(1000);
        const names = await p.evaluate(() =>
          Array.from(document.querySelectorAll('[class*="font-medium"][class*="truncate"]'))
            .map(e => e.textContent.trim())
        );
        if (names.length > 0) {
          const t3 = Date.now();
          console.log(`CACHED LOAD: ${names.length} plugins in ${((t3-t2)/1000).toFixed(1)}s`);
          break;
        }
        if (i % 10 === 9) console.log(`  cached wait ${i+1}s...`);
      }

      await b.close();
      return;
    }
    if (i % 10 === 9) console.log(`  waiting ${i+1}s...`);
  }
  console.log('FX never loaded');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });

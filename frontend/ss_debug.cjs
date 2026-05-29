const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2360, height: 1640 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const html = await page.content();
  fs.writeFileSync('/tmp/page_dump.html', html);
  console.log('Dumped HTML (' + html.length + ' chars)');

  const clickables = await page.evaluate(() => {
    const els = document.querySelectorAll('button, [class*="cursor-pointer"], [onclick]');
    return Array.from(els).slice(0, 60).map((e, i) => ({
      i, tag: e.tagName,
      text: (e.textContent || '').trim().substring(0, 60),
      cls: (e.className || '').substring(0, 80),
      w: e.getBoundingClientRect().width,
      h: e.getBoundingClientRect().height,
    }));
  });
  console.log(JSON.stringify(clickables, null, 2));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

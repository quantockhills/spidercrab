import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '../../screenshots/issue90');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--force-device-scale-factor=1',
    ],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 2360, height: 1640 });

  // Log console
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Wait for connection
  let connected = false;
  for (let i = 0; i < 40; i++) {
    const text = await page.evaluate(() => document.body.textContent ?? '');
    if (text.includes('Connected')) {
      connected = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  console.log('Connected:', connected);
  console.log('Page title:', await page.title());

  // Screenshot with fullPage and proper options
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/ss-90-connected.png`,
    fullPage: false,
  });

  if (connected) {
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/ss-90-with-data.png`,
      fullPage: false,
    });
  }

  console.log('Screenshots done');
  await browser.close();
})();

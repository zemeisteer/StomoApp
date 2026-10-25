const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\7c3f366c-08a6-4fd8-80c7-2f66d257b38b';
const BASE_URL = 'http://localhost:3000';

const VIEWPORTS = [
  { name: '360px', width: 360, height: 740 },
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1440px', width: 1440, height: 900 },
];

async function run() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  try {
    const page = await browser.newPage();

    // First login as admin so cookies are set for admin routes
    console.log('[Auth] Logging in to admin...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', 'admin@dentacare.local');
    await page.type('input[type="password"]', 'DentacareAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[Auth] Admin logged in.');

    const pagesToCapture = [
      { name: 'homepage', path: '/' },
      { name: 'booking', path: '/booking' },
      { name: 'admin_calendar', path: '/admin/calendar' },
      { name: 'admin_settings', path: '/admin/settings' },
    ];

    for (const vp of VIEWPORTS) {
      console.log(`\nCapturing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

      for (const p of pagesToCapture) {
        await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'networkidle2' });
        await new Promise((r) => setTimeout(r, 1000));
        const screenshotFile = path.join(ARTIFACTS_DIR, `${p.name}_${vp.name}.png`);
        await page.screenshot({ path: screenshotFile, fullPage: false });
        console.log(`  ✓ Saved: ${p.name}_${vp.name}.png`);
      }
    }

    console.log('\nAll responsive screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[Error capturing screenshots]', err);
  process.exit(1);
});

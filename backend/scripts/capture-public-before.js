const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\7f9f12fc-4c76-43cf-b704-011dbbebe816';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FRONTEND_URL = 'http://localhost:3000';

async function captureBefore() {
  console.log('Capturing BEFORE screenshots to:', ARTIFACT_DIR);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  // 1. Homepage Desktop
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'homepage_before_desktop.png') });
  console.log('Saved homepage_before_desktop.png');

  // 2. Homepage Mobile (390x844)
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'homepage_before_mobile.png') });
  console.log('Saved homepage_before_mobile.png');

  // 3. Services Desktop
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}/services`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'services_before_desktop.png') });
  console.log('Saved services_before_desktop.png');

  // 4. Doctors Desktop
  await page.goto(`${FRONTEND_URL}/doctors`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'doctors_before_desktop.png') });
  console.log('Saved doctors_before_desktop.png');

  // 5. Contacts Desktop
  await page.goto(`${FRONTEND_URL}/contacts`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'contacts_before_desktop.png') });
  console.log('Saved contacts_before_desktop.png');

  await browser.close();
  console.log('BEFORE screenshots captured successfully!');
}

captureBefore().catch(err => {
  console.error('Failed to capture before:', err);
  process.exit(1);
});

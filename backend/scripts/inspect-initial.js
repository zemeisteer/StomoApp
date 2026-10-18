const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOTS_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\27c48eb2-b34b-4911-8da1-cafb375ccf9a\\screenshots';

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();

  try {
    console.log('[1/9] Desktop Homepage UZ (1440x900)...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout ? page.waitForTimeout(2000) : new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_home_desktop_uz.png'), fullPage: false });

    console.log('[2/9] Desktop Homepage RU (1440x900)...');
    // Click language switcher to RU if present, or set localStorage
    await page.evaluate(() => {
      localStorage.setItem('dentacare_locale', 'ru');
      window.dispatchEvent(new Event('storage'));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_home_desktop_ru.png'), fullPage: false });

    // Switch back to UZ
    await page.evaluate(() => {
      localStorage.setItem('dentacare_locale', 'uz');
    });

    console.log('[3/9] Mobile Homepage UZ (390x844)...');
    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_home_mobile_uz.png'), fullPage: false });

    console.log('[4/9] Mobile Menu Open UZ (390x844)...');
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Menyu"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 600));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_menu_mobile_uz.png'), fullPage: false });
      // close it
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Menyu"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.log('Mobile menu click note:', e.message);
    }

    console.log('[5/9] Mobile Homepage RU (390x844)...');
    await page.evaluate(() => {
      localStorage.setItem('dentacare_locale', 'ru');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_home_mobile_ru.png'), fullPage: false });

    console.log('[6/9] Admin Login (1440x900)...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_admin_login.png'), fullPage: false });

    console.log('[7/9] Admin Login Execution...');
    await page.type('input[type="email"]', 'admin@dentacare.local');
    await page.type('input[type="password"]', 'DentacareAdmin2026!');
    await new Promise(r => setTimeout(r, 300));
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    console.log('[8/9] Admin Dashboard Desktop (1440x900)...');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_admin_dashboard_desktop.png'), fullPage: false });

    console.log('[9/9] Admin Calendar Desktop (1440x900)...');
    await page.goto('http://localhost:3000/admin/calendar', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_admin_calendar_desktop.png'), fullPage: false });

    console.log('[Bonus] Admin Dashboard Mobile (390x844)...');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'initial_admin_dashboard_mobile.png'), fullPage: false });

    console.log('--- ALL INITIAL SCREENSHOTS CAPTURED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Error during initial inspection:', err);
  } finally {
    await browser.close();
  }
}

main();

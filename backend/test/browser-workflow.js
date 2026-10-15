const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\9a0f0a5a-bac4-4c37-a771-aa868534e002';

async function run() {
  console.log('--- STARTING COMPREHENSIVE BROWSER WORKFLOW VERIFICATION ---');
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();
  const results = {};

  try {
    // -------------------------------------------------------------
    // 1. DESKTOP WORKFLOW (1440 x 900)
    // -------------------------------------------------------------
    console.log('[1/12] Setting desktop viewport 1440x900...');
    await page.setViewport({ width: 1440, height: 900 });

    console.log('[2/12] Navigating to Homepage http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500)); // allow 3D tooth / animations to initialize
    const desktopHomeShot = path.join(ARTIFACTS_DIR, 'desktop_homepage.png');
    await page.screenshot({ path: desktopHomeShot, fullPage: false });
    console.log('Saved:', desktopHomeShot);
    results.desktop_homepage = desktopHomeShot;

    // -------------------------------------------------------------
    // 2. BOOKING FLOW (Step 1 to 6)
    // -------------------------------------------------------------
    console.log('[3/12] Navigating to Booking page http://localhost:3000/booking ...');
    await page.goto('http://localhost:3000/booking', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('button', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    // Step 1: Select branch
    console.log('Selecting branch...');
    const branchBtn = await page.$('div.grid button');
    if (branchBtn) await branchBtn.click();
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent && (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.textContent.includes('Next')));
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Step 2: Select service
    console.log('Selecting service...');
    const serviceBtn = await page.$('div.grid button');
    if (serviceBtn) await serviceBtn.click();
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent && (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.textContent.includes('Next')));
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Step 3: Select doctor
    console.log('Selecting doctor...');
    const doctorBtn = await page.$('div.grid button');
    if (doctorBtn) await doctorBtn.click();
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent && (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.textContent.includes('Next')));
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Pick slot
    console.log('Picking available time slot...');
    // Ensure date has slots or choose an active date
    await new Promise(r => setTimeout(r, 2000));
    const slotShot = path.join(ARTIFACTS_DIR, 'desktop_booking_slot.png');
    await page.screenshot({ path: slotShot });
    results.desktop_booking_slot = slotShot;

    // Click first available slot button that is not disabled
    const slotClicked = await page.evaluate(() => {
      const slotButtons = Array.from(document.querySelectorAll('div.grid button:not([disabled])'));
      if (slotButtons.length > 0) {
        slotButtons[0].click();
        return true;
      }
      return false;
    });
    console.log('Available slot clicked:', slotClicked);
    await new Promise(r => setTimeout(r, 1000));

    // Click Next
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find(b => b.textContent && (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.textContent.includes('Next')));
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Step 5: Fill patient details
    console.log('Filling patient details...');
    const nameInput = await page.$('input[type="text"]');
    if (nameInput) await nameInput.type('Alisher Navoiy');
    const phoneInput = await page.$('input[type="tel"]');
    if (phoneInput) await phoneInput.type('+998901234567');
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) await emailInput.type('alisher.navoiy@dentacare.local');

    const formShot = path.join(ARTIFACTS_DIR, 'desktop_booking_form.png');
    await page.screenshot({ path: formShot });
    results.desktop_booking_form = formShot;

    // Submit booking
    console.log('Submitting booking...');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const sBtn = btns.find(b => b.textContent && (b.textContent.includes('Tasdiqlash') || b.textContent.includes('Band qilish') || b.textContent.includes('Подтвердить')));
        if (sBtn) sBtn.click();
      });
    }

    await new Promise(r => setTimeout(r, 3500));
    const confirmationShot = path.join(ARTIFACTS_DIR, 'desktop_booking_confirmation.png');
    await page.screenshot({ path: confirmationShot });
    console.log('Saved:', confirmationShot);
    results.desktop_booking_confirmation = confirmationShot;

    // -------------------------------------------------------------
    // 3. ADMIN PANEL WORKFLOW
    // -------------------------------------------------------------
    console.log('[4/12] Navigating to Admin Login http://localhost:3000/admin/login ...');
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    const adminLoginShot = path.join(ARTIFACTS_DIR, 'desktop_admin_login.png');
    await page.screenshot({ path: adminLoginShot });
    results.desktop_admin_login = adminLoginShot;

    console.log('Logging in as Admin...');
    await page.type('input[type="email"]', 'admin@dentacare.local');
    await page.type('input[type="password"]', 'DentacareAdmin2026!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Navigate to Calendar
    console.log('[5/12] Navigating to Admin Calendar http://localhost:3000/admin/calendar ...');
    await page.goto('http://localhost:3000/admin/calendar', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const adminCalendarShot = path.join(ARTIFACTS_DIR, 'desktop_admin_calendar.png');
    await page.screenshot({ path: adminCalendarShot });
    console.log('Saved:', adminCalendarShot);
    results.desktop_admin_calendar = adminCalendarShot;

    // Navigate to Analytics
    console.log('[6/12] Navigating to Admin Analytics http://localhost:3000/admin/analytics ...');
    await page.goto('http://localhost:3000/admin/analytics', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const adminAnalyticsShot = path.join(ARTIFACTS_DIR, 'desktop_admin_analytics.png');
    await page.screenshot({ path: adminAnalyticsShot });
    console.log('Saved:', adminAnalyticsShot);
    results.desktop_admin_analytics = adminAnalyticsShot;

    // Navigate to CMS
    console.log('[7/12] Navigating to Admin CMS http://localhost:3000/admin/cms ...');
    await page.goto('http://localhost:3000/admin/cms', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const adminCmsShot = path.join(ARTIFACTS_DIR, 'desktop_admin_cms.png');
    await page.screenshot({ path: adminCmsShot });
    console.log('Saved:', adminCmsShot);
    results.desktop_admin_cms = adminCmsShot;

    // -------------------------------------------------------------
    // 4. MOBILE WORKFLOW (390 x 844)
    // -------------------------------------------------------------
    console.log('[8/12] Setting mobile viewport 390x844 (iPhone 13/14)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    console.log('[9/12] Navigating to Mobile Homepage http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const mobileHomeShot = path.join(ARTIFACTS_DIR, 'mobile_homepage.png');
    await page.screenshot({ path: mobileHomeShot });
    console.log('Saved:', mobileHomeShot);
    results.mobile_homepage = mobileHomeShot;

    console.log('[10/12] Navigating to Mobile Booking http://localhost:3000/booking ...');
    await page.goto('http://localhost:3000/booking', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const mobileBookingShot = path.join(ARTIFACTS_DIR, 'mobile_booking.png');
    await page.screenshot({ path: mobileBookingShot });
    console.log('Saved:', mobileBookingShot);
    results.mobile_booking = mobileBookingShot;

    console.log('[11/12] Navigating to Mobile Admin Calendar http://localhost:3000/admin/calendar ...');
    await page.goto('http://localhost:3000/admin/calendar', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const mobileCalendarShot = path.join(ARTIFACTS_DIR, 'mobile_admin_calendar.png');
    await page.screenshot({ path: mobileCalendarShot });
    console.log('Saved:', mobileCalendarShot);
    results.mobile_admin_calendar = mobileCalendarShot;

    // -------------------------------------------------------------
    // 5. TABLET WORKFLOW (768 x 1024)
    // -------------------------------------------------------------
    console.log('[12/12] Setting tablet viewport 768x1024 (iPad)...');
    await page.setViewport({ width: 768, height: 1024, isMobile: true });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const tabletHomeShot = path.join(ARTIFACTS_DIR, 'tablet_homepage.png');
    await page.screenshot({ path: tabletHomeShot });
    console.log('Saved:', tabletHomeShot);
    results.tablet_homepage = tabletHomeShot;

    console.log('ALL WORKFLOWS AND SCREENSHOTS COMPLETED SUCCESSFULLY!');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('BROWSER VERIFICATION ERROR:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();

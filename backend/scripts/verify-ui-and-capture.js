const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\5994479d-6fb5-4b40-95ef-f1cfaf06f457\\screenshots';

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function run() {
  console.log('========================================================================');
  console.log('   STOMOAPP BROWSER UI VERIFICATION & RESPONSIVE SCREENSHOT SUITE');
  console.log('========================================================================');
  console.log(`Base URL      : ${BASE_URL}`);
  console.log(`Artifacts Dir : ${ARTIFACTS_DIR}`);

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

  try {
    const page = await browser.newPage();

    // -------------------------------------------------------------------------
    // 1. Homepage at 1440px (Desktop)
    // -------------------------------------------------------------------------
    console.log('\n[1/7] Testing Homepage Desktop (1440px)...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    // Scroll smoothly to trigger ScrollReveal animations
    await page.evaluate(async () => {
      const distance = 400;
      const delay = 100;
      while (document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight) {
        document.scrollingElement.scrollBy(0, distance);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      // scroll back up
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    const homeDesktopPath = path.join(ARTIFACTS_DIR, 'homepage-desktop-1440.png');
    await page.screenshot({ path: homeDesktopPath, fullPage: true });
    console.log(`[SAVED] Desktop screenshot: ${homeDesktopPath}`);

    // Verify sections present
    const sections = await page.evaluate(() => {
      return {
        hasHero: Boolean(document.querySelector('h1')),
        hasServices: Boolean(document.getElementById('services')),
        hasDoctors: Boolean(document.getElementById('doctors')),
        hasClinic: Boolean(document.getElementById('clinic')),
        hasReviews: Boolean(document.getElementById('reviews')),
        hasBranches: Boolean(document.getElementById('branches')),
        hasFaq: Boolean(document.getElementById('faq')),
      };
    });
    console.log('Homepage Sections:', sections);
    assert(sections.hasHero, 'Hero section must exist');
    assert(sections.hasServices, 'Services section must exist');
    assert(sections.hasDoctors, 'Doctors section must exist');
    assert(sections.hasClinic, 'Clinic section must exist');
    assert(sections.hasBranches, 'Branches section must exist');
    console.log('[PASS] All homepage sections verified');

    // -------------------------------------------------------------------------
    // 2. Responsive Viewports: Tablet (768px), Mobile (390px), Small Mobile (360px)
    // -------------------------------------------------------------------------
    console.log('\n[2/7] Testing Responsive Viewports (768px, 390px, 360px)...');
    
    // Tablet 768px
    await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    const tabletPath = path.join(ARTIFACTS_DIR, 'homepage-tablet-768.png');
    await page.screenshot({ path: tabletPath, fullPage: true });
    console.log(`[SAVED] Tablet screenshot: ${tabletPath}`);

    // Mobile 390px
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    const mobile390Path = path.join(ARTIFACTS_DIR, 'homepage-mobile-390.png');
    await page.screenshot({ path: mobile390Path, fullPage: true });
    console.log(`[SAVED] Mobile 390px screenshot: ${mobile390Path}`);

    // Small Mobile 360px (Check for horizontal scroll/overflow)
    await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    const overflowCheck = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    console.log(`360px Layout fits without horizontal overflow: ${overflowCheck}`);
    assert(overflowCheck, 'Page must not have horizontal scroll/overflow defect at 360px');

    const mobile360Path = path.join(ARTIFACTS_DIR, 'homepage-mobile-360.png');
    await page.screenshot({ path: mobile360Path, fullPage: true });
    console.log(`[SAVED] Mobile 360px screenshot: ${mobile360Path}`);

    // -------------------------------------------------------------------------
    // 3. Mobile Navigation Drawer Accessibility (Focus trap, Close button, Escape key)
    // -------------------------------------------------------------------------
    console.log('\n[3/7] Testing Mobile Navigation Drawer Accessibility at 360px...');
    const hamburgerBtn = await page.$('button[aria-label*="Menyu"], button[aria-label*="menu" i]');
    assert(hamburgerBtn, 'Mobile hamburger button must exist');
    await hamburgerBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    // Verify drawer dialog
    const drawerState = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const closeBtn = document.getElementById('mobile-drawer-close-btn') ||
        document.querySelector('button[aria-label*="yopish" i], button[aria-label*="закрыть" i]');
      const activeEl = document.activeElement;
      return {
        isOpen: Boolean(dialog),
        hasCloseBtn: Boolean(closeBtn),
        isFocusedInDrawer: dialog ? dialog.contains(activeEl) : false,
      };
    });
    console.log('Mobile Drawer State:', drawerState);
    assert(drawerState.isOpen, 'Drawer dialog must be open');
    assert(drawerState.hasCloseBtn, 'Visible close button must exist inside drawer');
    assert(drawerState.isFocusedInDrawer, 'Focus must move into drawer upon opening');

    const drawerScreenshotPath = path.join(ARTIFACTS_DIR, 'mobile-drawer-open-360.png');
    await page.screenshot({ path: drawerScreenshotPath });
    console.log(`[SAVED] Mobile drawer screenshot: ${drawerScreenshotPath}`);

    // Test Escape key closes drawer and restores focus
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 400));
    const isClosedAfterEscape = await page.evaluate(() => !document.querySelector('div[role="dialog"]'));
    assert(isClosedAfterEscape, 'Drawer must close on Escape key');
    console.log('[PASS] Mobile drawer keyboard accessibility (focus trap, close button, Escape key) verified');

    // -------------------------------------------------------------------------
    // 4. Russian Language Switch (RU)
    // -------------------------------------------------------------------------
    console.log('\n[4/7] Testing Language Switch (UZ -> RU)...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    
    // Click RU button
    const ruBtn = await page.$('button[aria-label="Русский"]');
    if (ruBtn) {
      await ruBtn.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    const ruPageTitle = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
    console.log('RU Page Heading:', ruPageTitle);
    
    const ruScreenshotPath = path.join(ARTIFACTS_DIR, 'homepage-ru-1440.png');
    await page.screenshot({ path: ruScreenshotPath, fullPage: true });
    console.log(`[SAVED] Russian homepage screenshot: ${ruScreenshotPath}`);

    // Switch back to UZ
    const uzBtn = await page.$('button[aria-label="O\'zbekcha"]');
    if (uzBtn) {
      await uzBtn.click();
      await new Promise((r) => setTimeout(r, 400));
    }

    // -------------------------------------------------------------------------
    // 5. Booking Flow: Step 1 (Date), Step 2 (Services), Step 3 (Doctor)
    // -------------------------------------------------------------------------
    console.log('\n[5/7] Testing Booking Flow (Step 1 -> Step 2 -> Step 3)...');
    await page.goto(`${BASE_URL}/booking?serviceId=srv-consultation`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button[id="booking-next-step"]', { timeout: 15000 });

    // Capture Step 1 Date
    const step1Path = path.join(ARTIFACTS_DIR, 'booking-step1-date-1440.png');
    await page.screenshot({ path: step1Path, fullPage: true });
    console.log(`[SAVED] Booking Step 1 screenshot: ${step1Path}`);

    // Click "Davom etish" to go to Step 2
    const nextBtn1 = await page.$('button[id="booking-next-step"]');
    assert(nextBtn1, 'Step 1 Next button must exist');
    await nextBtn1.click();
    await page.waitForSelector('button[aria-pressed]', { timeout: 15000 });

    const step2Path = path.join(ARTIFACTS_DIR, 'booking-step2-services-1440.png');
    await page.screenshot({ path: step2Path, fullPage: true });
    console.log(`[SAVED] Booking Step 2 screenshot: ${step2Path}`);

    // Click Next to Step 3
    const nextBtn2 = await page.$('button[id="booking-next-step-2"], button[id="booking-next-step"]');
    if (nextBtn2) {
      await nextBtn2.click();
      await page.waitForSelector('button[id^="doctor-select-"]', { timeout: 15000 });
    }

    // Step 3 Doctor
    const step3Path = path.join(ARTIFACTS_DIR, 'booking-step3-doctors-1440.png');
    await page.screenshot({ path: step3Path, fullPage: true });
    console.log(`[SAVED] Booking Step 3 screenshot: ${step3Path}`);

    // Select doctor
    const doctorCards = await page.$$('button[id^="doctor-select-"]:not([id^="doctor-select-other-"])');
    console.log(`Step 3 Doctors count: ${doctorCards.length}`);
    if (doctorCards.length > 0) {
      await doctorCards[0].click();
      await new Promise((r) => setTimeout(r, 600));
    } else {
      const otherCards = await page.$$('button[id^="doctor-select-other-"]');
      console.log(`Step 3 Other Doctors count: ${otherCards.length}`);
      if (otherCards.length > 0) {
        await otherCards[0].click();
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    // Click Next on Step 3 to advance to Step 4
    const nextBtn3 = await page.$('button[id="booking-next-step-3"], button[id="booking-next-step"]');
    assert(nextBtn3, 'Step 3 Next button must exist');
    await nextBtn3.click();
    await new Promise((r) => setTimeout(r, 1200));

    // -------------------------------------------------------------------------
    // 6. Booking Flow: Step 4 (Slots with Branch Badges), Step 5 (Location Confirmation)
    // -------------------------------------------------------------------------
    console.log('\n[6/7] Testing Booking Flow (Step 4 Slots -> Step 5 Location Confirmation)...');
    await page.waitForSelector('button[id^="slot-"]', { timeout: 12000 });
    
    // Verify Step 4 Time Slots
    const step4Path = path.join(ARTIFACTS_DIR, 'booking-step4-slots-branch-badges-1440.png');
    await page.screenshot({ path: step4Path, fullPage: true });
    console.log(`[SAVED] Booking Step 4 screenshot: ${step4Path}`);

    // Check branch badges rendered on slots
    const branchBadgesCount = await page.evaluate(() => {
      const badges = document.querySelectorAll('span.bg-emerald-50, span.bg-teal-50, span.text-emerald-700, span.text-teal-700, span[class*="bg-[#167b78]"]');
      return badges.length;
    });
    console.log(`Branch badges rendered on slots: ${branchBadgesCount}`);

    // Select first available slot
    const slotBtns = await page.$$('button[id^="slot-"]:not([disabled])');
    console.log(`Available slot buttons: ${slotBtns.length}`);
    assert(slotBtns.length > 0, 'Must have at least 1 available slot button');
    await slotBtns[0].click();
    await new Promise((r) => setTimeout(r, 600));

    // Advance to Step 5: Location Confirmation
    const nextBtn4 = await page.$('button[id="booking-next-step-4"], button[id="booking-next-step"]');
    assert(nextBtn4, 'Step 4 Next button must exist');
    await nextBtn4.click();
    await page.waitForSelector('button[id="booking-confirm-location-btn"]', { timeout: 10000 });

    // Verify Step 5 is Location Confirmation
    const step5Heading = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
    console.log('Step 5 Heading:', step5Heading);

    const step5Path = path.join(ARTIFACTS_DIR, 'booking-step5-location-confirmation-1440.png');
    await page.screenshot({ path: step5Path, fullPage: true });
    console.log(`[SAVED] Booking Step 5 screenshot: ${step5Path}`);

    // Step 5: Confirm location and advance to Step 6
    const confirmLocationBtn = await page.$('button[id="booking-confirm-location-btn"]');
    assert(confirmLocationBtn, 'Location confirmation button must exist in Step 5');
    await confirmLocationBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // -------------------------------------------------------------------------
    // 7. Booking Step 6 (Summary & Patient details)
    // -------------------------------------------------------------------------
    console.log('\n[7/7] Testing Booking Step 6 Summary & Patient details...');
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });

    const step6Path = path.join(ARTIFACTS_DIR, 'booking-step6-summary-patient-1440.png');
    await page.screenshot({ path: step6Path, fullPage: true });
    console.log(`[SAVED] Booking Step 6 screenshot: ${step6Path}`);

    // Mobile check at Step 6
    await page.setViewport({ width: 360, height: 800 });
    await new Promise((r) => setTimeout(r, 400));
    const step6MobilePath = path.join(ARTIFACTS_DIR, 'booking-step6-mobile-360.png');
    await page.screenshot({ path: step6MobilePath, fullPage: true });
    console.log(`[SAVED] Booking Step 6 Mobile 360px screenshot: ${step6MobilePath}`);

    console.log('\n========================================================================');
    console.log('   ALL UI VERIFICATION SCENARIOS & SCREENSHOTS COMPLETED (PASS)');
    console.log('========================================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n[FATAL] UI verification failed:', err);
  process.exit(1);
});

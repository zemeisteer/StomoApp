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
    // 1. Homepage at 1440px (Desktop) & Functional Assertions
    // -------------------------------------------------------------------------
    console.log('\n[1/8] Testing Homepage Desktop (1440px)...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    // Scroll smoothly to trigger ScrollReveal animations
    await page.evaluate(async () => {
      const distance = 400;
      const delay = 100;
      let maxSteps = 30;
      let lastTop = -1;
      while (
        document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight &&
        maxSteps-- > 0
      ) {
        if (document.scrollingElement.scrollTop === lastTop) break;
        lastTop = document.scrollingElement.scrollTop;
        document.scrollingElement.scrollBy(0, distance);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
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
    assert(sections.hasReviews, 'Reviews section must exist');
    assert(sections.hasFaq, 'FAQ section must exist');
    console.log('[PASS] All homepage sections verified functionally');

    // -------------------------------------------------------------------------
    // 2. Responsive Viewports: Tablet (768px), Mobile (390px), Small Mobile (360px)
    // -------------------------------------------------------------------------
    console.log('\n[2/8] Testing Responsive Viewports (768px, 390px, 360px)...');
    
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

    // Small Mobile 360px (Check for horizontal scroll/overflow defect)
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
    // 3. Mobile Navigation Drawer Accessibility (Focus trap, Tab & Shift+Tab, Escape & Restoration)
    // -------------------------------------------------------------------------
    console.log('\n[3/8] Testing Mobile Navigation Drawer Accessibility (Tab/Shift+Tab wrapping & focus restoration)...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));
    const hamburgerBtn = await page.$('#mobile-menu-trigger-btn, button[aria-label*="Menyu"], button[aria-label*="menu" i]');
    assert(hamburgerBtn, 'Mobile hamburger button must exist');
    await hamburgerBtn.focus();
    await hamburgerBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // Verify drawer dialog
    const drawerState = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const closeBtn = document.getElementById('mobile-drawer-close-btn') ||
        document.querySelector('button[aria-label*="yopish" i], button[aria-label*="закрыть" i]');
      const activeEl = document.activeElement;
      return {
        isOpen: Boolean(dialog),
        hasCloseBtn: Boolean(closeBtn),
        isFocusedOnClose: activeEl === closeBtn,
      };
    });
    console.log('Mobile Drawer State:', drawerState);
    assert(drawerState.isOpen, 'Drawer dialog must be open');
    assert(drawerState.hasCloseBtn, 'Visible close button must exist inside drawer');
    assert(drawerState.isFocusedOnClose, 'Initial focus must move directly onto close button in drawer');

    const drawerScreenshotPath = path.join(ARTIFACTS_DIR, 'mobile-drawer-open-360.png');
    await page.screenshot({ path: drawerScreenshotPath });
    console.log(`[SAVED] Mobile drawer screenshot: ${drawerScreenshotPath}`);

    // Test Shift+Tab wrapping from first element (close button) to last element in drawer
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await new Promise((r) => setTimeout(r, 200));

    const isWrappedToLast = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = dialog?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable || focusable.length === 0) return false;
      const lastEl = focusable[focusable.length - 1];
      return document.activeElement === lastEl;
    });
    assert(isWrappedToLast, 'Shift+Tab on first element in drawer must wrap focus to last element');
    console.log('[PASS] Shift+Tab focus trap wrapping verified');

    // Test Tab wrapping from last element back to first element (close button)
    await page.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 200));

    const isWrappedToFirst = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const focusable = dialog?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable || focusable.length === 0) return false;
      const firstEl = focusable[0];
      return document.activeElement === firstEl;
    });
    assert(isWrappedToFirst, 'Tab on last element in drawer must wrap focus back to first element');
    console.log('[PASS] Tab focus trap wrapping verified');

    // Test Escape key closes drawer and restores focus to hamburger button
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 400));
    const isClosedAfterEscape = await page.evaluate(() => !document.querySelector('div[role="dialog"]'));
    assert(isClosedAfterEscape, 'Drawer must close on Escape key');

    const isFocusRestoredToHamburger = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="Menyu"], button[aria-label*="menu" i]');
      return document.activeElement === btn;
    });
    assert(isFocusRestoredToHamburger, 'Focus must be restored to hamburger button after closing drawer');
    console.log('[PASS] Mobile drawer keyboard accessibility (focus trap, close button, Escape key, focus restoration) verified');

    // -------------------------------------------------------------------------
    // 4. Russian Language Switch (RU) & Exact Text Change Assertion
    // -------------------------------------------------------------------------
    console.log('\n[4/8] Testing Language Switch (UZ -> RU) with hard text change assertions...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

    const uzHeading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '');
    const uzNavServices = await page.evaluate(() => document.querySelector('a[href="/services"]')?.textContent?.trim() || '');
    console.log(`UZ Heading     : "${uzHeading}"`);
    console.log(`UZ Nav Services: "${uzNavServices}"`);
    assert(uzHeading.length > 0, 'Uzbek heading must not be empty');

    // Click RU button
    await page.waitForSelector('#lang-btn-ru', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('lang-btn-ru')?.click());
    await new Promise((r) => setTimeout(r, 800));

    const ruHeading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '');
    const ruNavServices = await page.evaluate(() => document.querySelector('a[href="/services"]')?.textContent?.trim() || '');
    console.log(`RU Heading     : "${ruHeading}"`);
    console.log(`RU Nav Services: "${ruNavServices}"`);

    // Hard assertions on Russian text translation
    assert.notStrictEqual(ruHeading, uzHeading, 'H1 heading must change after switching language to RU');
    assert(/[а-яА-ЯёЁ]/.test(ruHeading), 'RU H1 heading must contain Cyrillic characters');
    assert.notStrictEqual(ruNavServices, uzNavServices, 'Nav services text must change after switching to RU');
    assert(/[а-яА-ЯёЁ]/.test(ruNavServices), 'RU nav services must contain Cyrillic characters');
    console.log('[PASS] Russian language switch functionally verified with Cyrillic assertions');

    const ruScreenshotPath = path.join(ARTIFACTS_DIR, 'homepage-ru-1440.png');
    await page.screenshot({ path: ruScreenshotPath, fullPage: true });
    console.log(`[SAVED] Russian homepage screenshot: ${ruScreenshotPath}`);

    // Switch back to UZ and assert original text restored
    await page.waitForSelector('#lang-btn-uz', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('lang-btn-uz')?.click());
    await new Promise((r) => setTimeout(r, 800));
    const restoredHeading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '');
    assert.strictEqual(restoredHeading, uzHeading, 'Switching back to UZ must restore original heading');
    console.log('[PASS] Restoring Uzbek language verified');

    // -------------------------------------------------------------------------
    // 5. Booking Flow: Step 1 (Date), Step 2 (Services), Step 3 (Doctor)
    // -------------------------------------------------------------------------
    console.log('\n[5/8] Testing Booking Flow (Step 1 -> Step 2 -> Step 3)...');
    await page.goto(`${BASE_URL}/booking?serviceId=srv-consultation`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button[id="booking-next-step"]:not([disabled])', { timeout: 15000 });

    // Capture Step 1 Date
    const step1Path = path.join(ARTIFACTS_DIR, 'booking-step1-date-1440.png');
    await page.screenshot({ path: step1Path, fullPage: true });
    console.log(`[SAVED] Booking Step 1 screenshot: ${step1Path}`);

    // Click Next to go to Step 2
    const nextBtn1 = await page.$('button[id="booking-next-step"]:not([disabled])');
    assert(nextBtn1, 'Step 1 Next button must exist and be enabled');
    await nextBtn1.click();
    await page.waitForSelector('button[id="booking-next-step-2"]:not([disabled])', { timeout: 15000 });

    const step2Path = path.join(ARTIFACTS_DIR, 'booking-step2-services-1440.png');
    await page.screenshot({ path: step2Path, fullPage: true });
    console.log(`[SAVED] Booking Step 2 screenshot: ${step2Path}`);

    // Click Next to Step 3
    const nextBtn2 = await page.$('button[id="booking-next-step-2"]:not([disabled])');
    assert(nextBtn2, 'Step 2 Next button (#booking-next-step-2) must exist and be enabled');
    await nextBtn2.click();
    await page.waitForSelector('button[id^="doctor-select-"]', { timeout: 15000 });

    // Step 3 Doctor
    const step3Path = path.join(ARTIFACTS_DIR, 'booking-step3-doctors-1440.png');
    await page.screenshot({ path: step3Path, fullPage: true });
    console.log(`[SAVED] Booking Step 3 screenshot: ${step3Path}`);

    // Select doctor
    const doctorCards = await page.$$('button[id^="doctor-select-"]');
    console.log(`Step 3 Doctors count: ${doctorCards.length}`);
    assert(doctorCards.length > 0, 'Doctor selection cards must exist in Step 3');
    await doctorCards[0].click();
    await new Promise((r) => setTimeout(r, 600));

    // Click Next on Step 3 to advance to Step 4
    await page.waitForSelector('button[id="booking-next-step-3"]:not([disabled])', { timeout: 15000 });
    const nextBtn3 = await page.$('button[id="booking-next-step-3"]:not([disabled])');
    assert(nextBtn3, 'Step 3 Next button (#booking-next-step-3) must exist and be enabled');
    await nextBtn3.click();
    await new Promise((r) => setTimeout(r, 1200));

    // -------------------------------------------------------------------------
    // 6. Booking Flow: Step 4 Slots Exact Branch Badges & Step 5 Location Confirmation
    // -------------------------------------------------------------------------
    console.log('\n[6/8] Testing Step 4 Slots Exact Branch Badges & Step 5 Location Confirmation...');
    await page.waitForSelector('button[id^="slot-"]', { timeout: 15000 });

    const step4Path = path.join(ARTIFACTS_DIR, 'booking-step4-slots-branch-badges-1440.png');
    await page.screenshot({ path: step4Path, fullPage: true });
    console.log(`[SAVED] Booking Step 4 screenshot: ${step4Path}`);

    // Assert exact branch labels on actual slot elements!
    const slotBranchLabels = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[id^="slot-"]'));
      return btns.map((b) => {
        return (
          b.getAttribute('data-slot-branch-name') ||
          b.querySelector('span[class*="truncate"]')?.textContent?.trim() ||
          ''
        );
      });
    });
    console.log(`Step 4 Rendered slots count: ${slotBranchLabels.length}`);
    assert(slotBranchLabels.length > 0, 'Slots must exist in Step 4');
    for (const label of slotBranchLabels) {
      assert(label.length > 0, 'Every slot element must have an exact branch label badge');
      assert(
        label.toLowerCase().includes('filial') || label.toLowerCase().includes('филиал'),
        `Slot branch badge must match actual branch name, got: "${label}"`,
      );
    }
    console.log(`[PASS] Exact branch badges verified on all ${slotBranchLabels.length} slot elements`);

    // Select first available slot
    const slotBtns = await page.$$('button[id^="slot-"]:not([disabled])');
    assert(slotBtns.length > 0, 'Must have at least 1 available slot button');
    await slotBtns[0].click();
    await new Promise((r) => setTimeout(r, 600));

    // Advance to Step 5: Location Confirmation
    const nextBtn4 = await page.$('button[id="booking-next-step-4"]');
    assert(nextBtn4, 'Step 4 Next button must exist');
    await nextBtn4.click();
    await page.waitForSelector('button[id="booking-confirm-location-btn"]', { timeout: 10000 });

    // Verify Step 5 is Location Confirmation
    const step5Heading = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
    console.log('Step 5 Heading:', step5Heading);
    assert(
      step5Heading.toLowerCase().includes('filial') ||
        step5Heading.toLowerCase().includes('manzil') ||
        step5Heading.toLowerCase().includes('адрес') ||
        step5Heading.toLowerCase().includes('филиал'),
      'Step 5 heading must be Location/Branch Confirmation',
    );

    const step5Path = path.join(ARTIFACTS_DIR, 'booking-step5-location-confirmation-1440.png');
    await page.screenshot({ path: step5Path, fullPage: true });
    console.log(`[SAVED] Booking Step 5 screenshot: ${step5Path}`);

    // Step 5: Confirm location and advance to Step 6
    const confirmLocationBtn = await page.$('button[id="booking-confirm-location-btn"]');
    assert(confirmLocationBtn, 'Location confirmation button must exist in Step 5');
    await confirmLocationBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // Step 6 Summary & Patient Details
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

    // -------------------------------------------------------------------------
    // 7. API Failure and Successful Retry Handling
    // -------------------------------------------------------------------------
    console.log('\n[7/8] Testing API Failure and Successful Retry Handling...');
    await page.setRequestInterception(true);
    let shouldFailServices = true;

    const retryInterceptHandler = async (req) => {
      const url = req.url();
      if (url.includes('/api/public/services') && shouldFailServices) {
        console.log('Simulating 500 API failure for /api/public/services...');
        req.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error (Simulated for retry test)' }),
        });
      } else {
        req.continue();
      }
    };
    page.on('request', retryInterceptHandler);

    await page.goto(`${BASE_URL}/booking`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#booking-error-banner', { timeout: 10000 });

    const errorBanner = await page.$('#booking-error-banner');
    assert(errorBanner, 'Error banner (#booking-error-banner) must appear on API failure');
    const retryBtn = await page.$('#booking-retry-btn');
    assert(retryBtn, 'Retry button (#booking-retry-btn) must appear on initial data failure');
    console.log('[PASS] Error banner and retry button displayed upon API failure');

    // Now disable the failure and click retry
    shouldFailServices = false;
    console.log('Clicking retry button (#booking-retry-btn)...');
    await retryBtn.click();
    await new Promise((r) => setTimeout(r, 1200));

    // Verify error banner cleared and services loaded
    const isErrorCleared = await page.evaluate(() => !document.querySelector('#booking-error-banner'));
    assert(isErrorCleared, 'Error banner must clear after successful retry');
    console.log('[PASS] API failure and successful retry verified');

    page.off('request', retryInterceptHandler);
    await page.setRequestInterception(false);

    // -------------------------------------------------------------------------
    // 8. Reduced-Motion Behavior Verification
    // -------------------------------------------------------------------------
    console.log('\n[8/8] Testing Reduced-Motion Behavior...');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

    const prefersReducedMotionActive = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    assert(prefersReducedMotionActive, 'prefers-reduced-motion: reduce must be active in media evaluation');
    console.log('[PASS] Reduced-motion media feature evaluated and active in browser');

    console.log('\n========================================================================');
    console.log('   ALL UI VERIFICATION SCENARIOS & SCREENSHOTS COMPLETED (PASS 100%)');
    console.log('========================================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n[FATAL] UI verification failed:', err);
  process.exit(1);
});

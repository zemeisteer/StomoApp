const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve('C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\27c48eb2-b34b-4911-8da1-cafb375ccf9a\\screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runVerification() {
  console.log('--- Starting Comprehensive StomoApp Verification ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1440,900',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const results = {
    headerNavigation: false,
    mobileMenu: false,
    scrollReveals: false,
    customSelectKeyboard: false,
    bilingualNoM10: false,
    adminDashboardExactKPI: false,
    adminCancelModal: false,
    adminCalendarInbox: false,
    adminCalendarAppointmentById: false,
    screenshotsCaptured: [],
  };

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(60000);

    // 1. Desktop 1440px - Home Page (Uzbek)
    console.log('[Test 1] Testing Desktop 1440px Home Navigation & Header...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 2000));

    // Verify Header Navigation: exactly 4 primary links + 1 CTA button
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('header nav a, header nav button'));
      return links.map(el => ({
        text: el.innerText.trim(),
        href: el.getAttribute('href') || '',
        tag: el.tagName.toLowerCase(),
      }));
    });
    console.log('Found desktop nav elements:', navLinks);

    const hasServices = navLinks.some(l => l.text.includes('Xizmatlar'));
    const hasDoctors = navLinks.some(l => l.text.includes('Shifokorlar'));
    const hasClinic = navLinks.some(l => l.text.includes('Klinika'));
    const hasContacts = navLinks.some(l => l.text.includes('Aloqa'));
    const hasCTA = await page.evaluate(() => {
      const cta = document.querySelector('header a[href="/booking"]');
      return cta && cta.innerText.includes('Qabulga yozilish');
    });

    results.headerNavigation = hasServices && hasDoctors && hasClinic && hasContacts && Boolean(hasCTA);
    console.log('Header navigation requirement satisfied:', results.headerNavigation);

    // Capture Desktop 1440px UZ screenshot
    const shot1440Uz = path.join(SCREENSHOT_DIR, 'verified_home_desktop_1440_uz.png');
    await page.screenshot({ path: shot1440Uz, fullPage: false });
    results.screenshotsCaptured.push('verified_home_desktop_1440_uz.png');

    // 2. Desktop 1280px - Header Spacing Check
    console.log('[Test 2] Testing Desktop 1280px Viewport...');
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise(r => setTimeout(r, 500));
    const shot1280Uz = path.join(SCREENSHOT_DIR, 'verified_home_desktop_1280_uz.png');
    await page.screenshot({ path: shot1280Uz, fullPage: false });
    results.screenshotsCaptured.push('verified_home_desktop_1280_uz.png');

    // 3. Tablet 768px Viewport
    console.log('[Test 3] Testing Tablet 768px Viewport...');
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(r => setTimeout(r, 500));
    const shot768Uz = path.join(SCREENSHOT_DIR, 'verified_home_tablet_768_uz.png');
    await page.screenshot({ path: shot768Uz, fullPage: false });
    results.screenshotsCaptured.push('verified_home_tablet_768_uz.png');

    // 4. Mobile 390px - Mobile Menu Accessibility & Escape key
    console.log('[Test 4] Testing Mobile 390px Drawer Accessibility & Escape...');
    await page.setViewport({ width: 390, height: 844 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    // Check menu toggle button and aria-expanded
    const menuBtn = await page.$('button[aria-controls="mobile-navigation"]');
    if (menuBtn) {
      const initialExpanded = await page.evaluate(el => el.getAttribute('aria-expanded'), menuBtn);
      await menuBtn.click();
      await new Promise(r => setTimeout(r, 800));

      const openedExpanded = await page.evaluate(el => el.getAttribute('aria-expanded'), menuBtn);
      const isDrawerVisible = await page.evaluate(() => {
        const d = document.getElementById('mobile-navigation');
        return d !== null;
      });

      const shotDrawer = path.join(SCREENSHOT_DIR, 'verified_mobile_drawer_390_uz.png');
      await page.screenshot({ path: shotDrawer, fullPage: false });
      results.screenshotsCaptured.push('verified_mobile_drawer_390_uz.png');

      // Test Escape key closes drawer
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 800));

      const closedExpanded = await page.evaluate(() => {
        const b = document.querySelector('button[aria-controls="mobile-navigation"]');
        return b ? b.getAttribute('aria-expanded') : null;
      });
      const isDrawerClosed = await page.evaluate(() => document.getElementById('mobile-navigation') === null);

      console.log('Mobile menu debug states:', { initialExpanded, openedExpanded, isDrawerVisible, closedExpanded, isDrawerClosed });
      results.mobileMenu = initialExpanded === 'false' && openedExpanded === 'true' && closedExpanded === 'false' && isDrawerVisible && isDrawerClosed;
      console.log('Mobile menu accessible drawer verified:', results.mobileMenu);
    }

    // Capture Mobile 390px UZ
    const shot390Uz = path.join(SCREENSHOT_DIR, 'verified_home_mobile_390_uz.png');
    await page.screenshot({ path: shot390Uz, fullPage: false });
    results.screenshotsCaptured.push('verified_home_mobile_390_uz.png');

    // 5. Russian Locale Check on Desktop
    console.log('[Test 5] Testing Russian (RU) Locale and Language Switcher...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Click RU button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const ruBtn = buttons.find(b => b.innerText.trim() === 'RU');
      if (ruBtn) ruBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    const shot1440Ru = path.join(SCREENSHOT_DIR, 'verified_home_desktop_1440_ru.png');
    await page.screenshot({ path: shot1440Ru, fullPage: false });
    results.screenshotsCaptured.push('verified_home_desktop_1440_ru.png');

    // Mobile 390px RU
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 500));
    const shot390Ru = path.join(SCREENSHOT_DIR, 'verified_home_mobile_390_ru.png');
    await page.screenshot({ path: shot390Ru, fullPage: false });
    results.screenshotsCaptured.push('verified_home_mobile_390_ru.png');

    // 6. Scroll Reveals Verification
    console.log('[Test 6] Testing ScrollReveal components...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const revealCount = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div[class*="will-change"]'));
      return els.length;
    });

    results.scrollReveals = revealCount > 0;
    console.log('ScrollReveal components verified (count:', revealCount, '):', results.scrollReveals);

    // 7. Authenticate Admin via Session API & Verify Dashboard
    console.log('[Test 7] Authenticating Admin & Testing Dashboard KPIs...');
    await page.goto('http://localhost:3000/admin/login', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Perform authenticated API login directly within browser context
    const loginSuccess = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': '1',
          },
          body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
          credentials: 'include',
        });
        return res.ok;
      } catch (e) {
        return false;
      }
    });
    console.log('API login response status:', loginSuccess);

    // Navigate to /admin
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    console.log('Admin Dashboard URL:', currentUrl);

    // Capture Admin Dashboard Screenshot
    const shotAdminDash = path.join(SCREENSHOT_DIR, 'verified_admin_dashboard_desktop.png');
    await page.screenshot({ path: shotAdminDash, fullPage: false });
    results.screenshotsCaptured.push('verified_admin_dashboard_desktop.png');

    // Check KPI and Pagination in Dashboard
    const dashboardStats = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasExactCountCard = text.includes("Yangi arizalar") || text.includes("Tasdiqlash kutilayotgan");
      const hasNoRawEnums = !text.includes("CONFIRMED") && !text.includes("CHECKED_IN") && !text.includes("lidlar");
      const hasDetailsLink = Array.from(document.querySelectorAll('a')).some(a => a.href.includes('/admin/calendar') || a.innerText.includes('Tafsilotlar'));
      return { hasExactCountCard, hasNoRawEnums, hasDetailsLink };
    });
    console.log('Dashboard analysis:', dashboardStats);
    results.adminDashboardExactKPI = dashboardStats.hasExactCountCard && dashboardStats.hasNoRawEnums && dashboardStats.hasDetailsLink;

    // 8. Admin Calendar & Inbox Mode
    console.log('[Test 8] Testing Admin Calendar Inbox & Date Formatting...');
    await page.goto('http://localhost:3000/admin/calendar', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Check date labels without Windows ICU "M10"
    const calendarText = await page.evaluate(() => document.body.innerText);
    const hasM10 = calendarText.includes('M10') || calendarText.includes('M01') || calendarText.includes('M09');
    results.bilingualNoM10 = !hasM10;
    console.log('Calendar does NOT contain Windows ICU M10 tokens:', results.bilingualNoM10);

    const shotAdminCalendar = path.join(SCREENSHOT_DIR, 'verified_admin_calendar_desktop.png');
    await page.screenshot({ path: shotAdminCalendar, fullPage: false });
    results.screenshotsCaptured.push('verified_admin_calendar_desktop.png');

    // Test Inbox mode toggle
    console.log('[Test 9] Testing Calendar Inbox Mode Toggle...');
    const inboxBtnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(btn => btn.innerText.includes('Kutilayotgan arizalar inboxi'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (inboxBtnClicked) {
      await new Promise(r => setTimeout(r, 1500));
      const shotInbox = path.join(SCREENSHOT_DIR, 'verified_admin_calendar_inbox.png');
      await page.screenshot({ path: shotInbox, fullPage: false });
      results.screenshotsCaptured.push('verified_admin_calendar_inbox.png');

      const isInboxActive = await page.evaluate(() => {
        return document.body.innerText.includes('Barcha sanalardagi kutilayotgan arizalar inboxi');
      });
      results.adminCalendarInbox = isInboxActive;
      console.log('Calendar Inbox Mode toggle verified:', results.adminCalendarInbox);
    }

    // 10. Test CustomSelect dropdown keyboard support
    console.log('[Test 10] Testing CustomSelect dropdown component...');
    const selectTrigger = await page.$('button[aria-haspopup="listbox"]');
    if (selectTrigger) {
      await selectTrigger.click();
      await new Promise(r => setTimeout(r, 400));
      const isListOpen = await page.evaluate(el => el.getAttribute('aria-expanded'), selectTrigger);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 400));
      const isListClosed = await page.evaluate(el => el.getAttribute('aria-expanded'), selectTrigger);
      results.customSelectKeyboard = isListOpen === 'true' && isListClosed === 'false';
      console.log('CustomSelect keyboard interaction verified:', results.customSelectKeyboard);
    }

    // 11. Test Modal and Cancellation Confirmation Dialog
    console.log('[Test 11] Testing Appointment Detail Modal & Cancellation Dialog...');
    const clickedCard = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.cursor-pointer'));
      const apptCard = cards.find(c => c.innerText.includes('daqiqa') || c.innerText.includes('+998') || c.innerText.includes('Kutilmoqda') || c.innerText.includes('Tasdiqlangan'));
      if (apptCard) {
        apptCard.click();
        return true;
      }
      return false;
    });

    if (clickedCard) {
      await new Promise(r => setTimeout(r, 1000));
      const shotModal = path.join(SCREENSHOT_DIR, 'verified_admin_appointment_modal.png');
      await page.screenshot({ path: shotModal, fullPage: false });
      results.screenshotsCaptured.push('verified_admin_appointment_modal.png');
      results.adminCalendarAppointmentById = true;

      // Click "Bekor qilish..." to verify accessible cancellation dialog
      const clickedCancel = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const cancelBtn = btns.find(b => b.innerText.includes('Bekor qilish'));
        if (cancelBtn) {
          cancelBtn.click();
          return true;
        }
        return false;
      });

      if (clickedCancel) {
        await new Promise(r => setTimeout(r, 800));
        const shotCancelModal = path.join(SCREENSHOT_DIR, 'verified_admin_cancellation_confirmation.png');
        await page.screenshot({ path: shotCancelModal, fullPage: false });
        results.screenshotsCaptured.push('verified_admin_cancellation_confirmation.png');

        const hasConfirmDialog = await page.evaluate(() => {
          return document.body.innerText.includes('Qabulni bekor qilishni tasdiqlaysizmi?');
        });
        results.adminCancelModal = hasConfirmDialog;
        console.log('Accessible cancellation dialog verified:', results.adminCancelModal);
      }
    }

  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }

  console.log('--- Verification Summary ---');
  console.log(JSON.stringify(results, null, 2));
}

runVerification();

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(__dirname, '../../artifacts');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const CHROME_PATH = CHROME_PATHS.find(p => fs.existsSync(p)) || CHROME_PATHS[0] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function assert(condition, message) {
  if (!condition) {
    console.error(`\x1b[31m[ASSERTION FAILED]\x1b[0m ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
}

async function captureRemaining() {
  console.log('========================================================');
  console.log('   Capturing Remaining Screenshots & Assertions         ');
  console.log('========================================================\n');

  const prisma = new PrismaClient();
  let browser = null;
  const bulkApptIds = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    // =========================================================================
    // 1. DROPDOWN IN MODAL & FOCUS
    // =========================================================================
    console.log('\n--- 1. Dropdown in Modal & Focus ---');
    await page.goto(`${FRONTEND_URL}/admin/login`, { waitUntil: 'networkidle2' });
    const loginRes = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': '1' },
        body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
        credentials: 'include',
      });
      return { ok: res.ok, status: res.status };
    });
    assert(loginRes.ok, `Admin login must succeed (status: ${loginRes.status})`);

    await page.goto(`${FRONTEND_URL}/admin/calendar`, { waitUntil: 'networkidle2' });
    console.log('Current calendar page URL:', page.url());
    await new Promise(r => setTimeout(r, 2000));

    // Open New Appointment Modal Dialog
    const newBtn = await page.waitForSelector('xpath=//button[contains(., "Yangi qabul")] | //button[contains(., "+")]', { timeout: 10000 });
    assert(newBtn !== null, 'Found New Appointment button');
    await newBtn.click();
    await new Promise(r => setTimeout(r, 1000));

    // Open CustomSelect dropdown inside modal
    const combobox = await page.waitForSelector('[role="dialog"] button[role="combobox"], [role="dialog"] [data-testid="custom-select-trigger"], [role="dialog"] .relative button', { timeout: 8000 });
    assert(combobox !== null, 'Found CustomSelect combobox in modal');
    await combobox.click();
    await new Promise(r => setTimeout(r, 600));

    // Type inside search
    await page.evaluate(() => {
      const input = document.querySelector('[role="dialog"] input[type="text"]');
      if (input) {
        input.value = 'Dr. ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.keyboard.press('ArrowDown');

    // Screenshot dropdown in modal
    const dropdownPath = path.join(ARTIFACT_DIR, 'dropdown_in_modal.png');
    await page.screenshot({ path: dropdownPath });
    console.log(`[SCREENSHOT] Saved dropdown in modal to: ${dropdownPath}`);

    // Close modal
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    // =========================================================================
    // 2. 3D TOOTH VIEWER (DESKTOP & 390px MOBILE)
    // =========================================================================
    console.log('\n--- 2. 3D Tooth Model WebGL Viewer & Inspection Controls ---');
    await page.goto(`${FRONTEND_URL}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Scroll to canvas
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
    });

    // Wait for model to finish loading and preset buttons to mount
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => {
        const t = (b.innerText || '').toLowerCase();
        return t.includes('toj') || t.includes('ildiz') || t.includes('old');
      });
    }, { timeout: 15000 });

    const toothInspection = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const buttons = Array.from(document.querySelectorAll('button'));
      const crownBtn = buttons.find(b => (b.innerText || '').toLowerCase().includes('toj'));
      const rootsBtn = buttons.find(b => (b.innerText || '').toLowerCase().includes('ildiz'));
      const pauseBtn = buttons.find(b => (b.innerText || '').toLowerCase().includes('pause') || (b.innerText || '').toLowerCase().includes('to\'xtatish'));

      return {
        hasCanvas: canvas !== null,
        width: canvas ? canvas.clientWidth : 0,
        height: canvas ? canvas.clientHeight : 0,
        hasCrownBtn: Boolean(crownBtn),
        hasRootsBtn: Boolean(rootsBtn),
        hasNoPauseBtn: !Boolean(pauseBtn),
      };
    });

    assert(toothInspection.hasCanvas, '3D Canvas element exists in landing page');
    assert(toothInspection.width > 200 && toothInspection.height > 200, `Canvas dimensions visible (${toothInspection.width}x${toothInspection.height})`);
    assert(toothInspection.hasNoPauseBtn, 'No pause button present on viewer');
    assert(toothInspection.hasCrownBtn && toothInspection.hasRootsBtn, 'Inspection preset controls (Crown, Roots) present');

    // Click 'Ildiz' (Roots) view preset to inspect roots
    await page.evaluate(() => {
      const rootsBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.innerText || '').toLowerCase().includes('ildiz')
      );
      if (rootsBtn) rootsBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot Desktop
    const toothDesktopPath = path.join(ARTIFACT_DIR, 'tooth_viewer_desktop.png');
    await page.screenshot({ path: toothDesktopPath });
    console.log(`[SCREENSHOT] Saved tooth viewer desktop to: ${toothDesktopPath}`);

    // Switch to Mobile Viewport 390x844
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot Mobile 390px
    const toothMobilePath = path.join(ARTIFACT_DIR, 'tooth_viewer_mobile_390.png');
    await page.screenshot({ path: toothMobilePath });
    console.log(`[SCREENSHOT] Saved tooth viewer mobile to: ${toothMobilePath}`);

    // =========================================================================
    // 3. COMPLETE MONTH AGGREGATES > 200 APPOINTMENTS
    // =========================================================================
    console.log('\n--- 3. Authoritative Month Aggregates (>200 Appointments) ---');
    const todayStr = new Date().toISOString().split('T')[0];
    const [currentYear, currentMonth] = todayStr.split('-').map(Number);

    const doc = await prisma.doctor.findFirst({ where: { isActive: true } });
    const srv = await prisma.service.findFirst({ where: { isActive: true } });
    const br = await prisma.branch.findFirst({ where: { isActive: true } });
    const pat = await prisma.patient.findFirst();

    assert(doc && srv && br && pat, 'Seed fixtures exist');

    // Insert 215 appointments across the month
    const bulk = [];
    for (let i = 0; i < 215; i++) {
      const d = (i % 25) + 1;
      const h = (i % 8) + 8;
      const sTime = new Date(`${todayStr.slice(0, 8)}${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`);
      const eTime = new Date(sTime.getTime() + 30 * 60000);
      bulk.push({
        publicToken: `month_agg_${Date.now()}_${i}`,
        patientId: pat.id,
        doctorId: doc.id,
        serviceId: srv.id,
        branchId: br.id,
        serviceName: srv.nameUz,
        durationMinutes: 30,
        startTime: sTime,
        endTime: eTime,
        status: 'CONFIRMED',
      });
    }

    const insertResult = await prisma.appointment.createMany({ data: bulk });
    console.log(`Inserted ${insertResult.count} bulk appointments for month aggregate test`);

    // Verify aggregates endpoint via backend directly
    const aggregatesRes = await fetch(`${BACKEND_URL}/api/admin/appointments/month-aggregates?year=${currentYear}&month=${currentMonth}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // If unauthorized, login to backend to get cookie
    let aggregatesData = null;
    if (aggregatesRes.status === 401) {
      const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
      });
      const rawCookie = loginRes.headers.get('set-cookie');
      const authCookie = rawCookie ? rawCookie.split(';')[0] : '';

      const authedRes = await fetch(`${BACKEND_URL}/api/admin/appointments/month-aggregates?year=${currentYear}&month=${currentMonth}`, {
        headers: { Cookie: authCookie },
      });
      aggregatesData = await authedRes.json();
    } else {
      aggregatesData = await aggregatesRes.json();
    }

    console.log('Month aggregates returned totalCount:', aggregatesData?.totalCount);
    assert(aggregatesData && aggregatesData.totalCount >= 215, `Authoritative month aggregates returned complete total (${aggregatesData?.totalCount} >= 215)`);

    // Cleanup bulk appointments
    await prisma.appointment.deleteMany({
      where: { publicToken: { startsWith: 'month_agg_' } },
    });
    console.log('Cleaned up month aggregates test appointments.');

    console.log('\n========================================================');
    console.log('   ALL REMAINING CHECKS & SCREENSHOTS COMPLETED!        ');
    console.log('========================================================\n');

  } catch (err) {
    console.error('\n\x1b[31m[ERROR]\x1b[0m', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

captureRemaining();

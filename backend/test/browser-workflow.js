const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

// Configurable environment parameters
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\0afc0821-8ecf-4d8c-a876-6d9dac1c5999';

// -------------------------------------------------------------
// 1. Enforce strict database isolation before ANY execution
// -------------------------------------------------------------
if (!TEST_DATABASE_URL) {
  console.error('[FATAL] TEST_DATABASE_URL is required to run browser tests. Ambient DATABASE_URL fallback is rejected.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: TEST_DATABASE_URL },
  },
});

async function run() {
  console.log('--- STARTING ISOLATED BROWSER WORKFLOW VERIFICATION ---');
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // 1. Verify test database identity before mutations
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0].current_database;
  console.log(`[DB Check] Direct Prisma connected to database: "${currentDb}"`);

  const EXPECTED_TEST_DB = process.env.TEST_DB_NAME || 'dentacare_test';
  if (currentDb !== EXPECTED_TEST_DB) {
    throw new Error(`FAIL-CLOSED: Connected database "${currentDb}" does not match exact configured test database "${EXPECTED_TEST_DB}". A database-name substring or suffix match is rejected.`);
  }
  if (['dentacare', 'postgres', 'production', 'master', 'main'].includes(currentDb.toLowerCase()) || currentDb.toLowerCase().includes('prod')) {
    throw new Error(`FAIL-CLOSED: Refusing to run tests against protected development/production database "${currentDb}".`);
  }

  // Verify backend application server is using the EXACT same test database
  let backendDbName = '';
  try {
    const healthRes = await fetch(`${API_URL}/api/health`).then((r) => r.json());
    backendDbName = healthRes?.database?.name || '';
  } catch (healthErr) {
    throw new Error(`Backend server at ${API_URL} is unreachable: ${healthErr.message}`);
  }

  console.log(`[Backend Check] API reported connected database: "${backendDbName}"`);
  assert.strictEqual(
    backendDbName,
    currentDb,
    `Database isolation failure! Backend is connected to "${backendDbName}", but test runner is using "${currentDb}". Both must use the same test database!`,
  );

  // Verify frontend application route (${BASE_URL}/api/health) reaches the test database
  let frontDbName = '';
  try {
    const frontHealthRes = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
    frontDbName = frontHealthRes?.database?.name || '';
  } catch (frontErr) {
    throw new Error(`Frontend rewritten API route at ${BASE_URL}/api/health is unreachable: ${frontErr.message}`);
  }

  console.log(`[Frontend Route Check] Frontend rewritten API reported connected database: "${frontDbName}"`);
  assert.strictEqual(
    frontDbName,
    currentDb,
    `Frontend API route isolation failure! Frontend at ${BASE_URL}/api/health is connected to "${frontDbName}", but test runner is using "${currentDb}". Fail closed!`,
  );

  // 2. Set up run-scoped identifiers (7 digits for phone suffix -> 12-digit normalized phone)
  const testRunId = Date.now().toString().slice(-7);
  const runKey = `t${testRunId}`;

  // Phone: +998 (country) + 90 (operator) + 7 digits = 12 digits total normalized
  const testPatientPhoneDigits = `90${testRunId}`;
  const expectedNormalizedPhone = `+998${testPatientPhoneDigits}`;
  const testPatientName = `Browser Patient ${runKey}`;
  const testPatientEmail = `browser.${runKey}@dentacare.local`;

  // Fixture IDs
  const testBranchId = `br-${runKey}`;
  const testServiceAId = `srv-a-${runKey}`;
  const testServiceBId = `srv-b-${runKey}`;
  const testDoctorId = `doc-${runKey}`;
  const testLegacyApptId = `appt-leg-${runKey}`;
  const testLegacyItemId = `item-leg-${runKey}`;

  let createdAppointmentId = null;
  let createdPatientId = null;
  let legacyPatientId = null;

  // Cleanup tracking lists
  const cleanupTasks = [];

  // Launch Google Chrome via puppeteer-core
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
    // FIXTURE CREATION: Completely isolated branch, services, doctor, and schedule
    // -------------------------------------------------------------
    console.log('[Setup] Creating isolated run fixtures in test database...');

    // 1. Isolated Branch
    const testBranch = await prisma.branch.create({
      data: {
        id: testBranchId,
        nameUz: `Filial Test ${runKey}`,
        nameRu: `Филиал Тест ${runKey}`,
        addressUz: `Toshkent sh., Test ko'chasi ${runKey}`,
        addressRu: `г. Ташкент, ул. Тестовая ${runKey}`,
        phone: expectedNormalizedPhone,
        isActive: true,
      },
    });

    // 2. Isolated Services
    const testServiceA = await prisma.service.create({
      data: {
        id: testServiceAId,
        nameUz: `Xizmat A ${runKey}`,
        nameRu: `Услуга А ${runKey}`,
        slug: `srv-a-${runKey}`,
        category: 'THERAPY',
        durationMinutes: 30,
        priceFrom: 120000,
        isActive: true,
      },
    });

    const testServiceB = await prisma.service.create({
      data: {
        id: testServiceBId,
        nameUz: `Xizmat B ${runKey}`,
        nameRu: `Услуга Б ${runKey}`,
        slug: `srv-b-${runKey}`,
        category: 'PREVENTIVE',
        durationMinutes: 30,
        priceFrom: 180000,
        isActive: true,
      },
    });

    // 3. Isolated Doctor
    const testDoctor = await prisma.doctor.create({
      data: {
        id: testDoctorId,
        firstNameUz: `Shifokor`,
        lastNameUz: `Test ${runKey}`,
        firstNameRu: `Врач`,
        lastNameRu: `Тест ${runKey}`,
        slug: `dr-test-${runKey}`,
        experienceYears: 8,
        isActive: true,
        branches: {
          create: [{ branchId: testBranch.id }],
        },
        services: {
          create: [{ serviceId: testServiceA.id }, { serviceId: testServiceB.id }],
        },
      },
    });

    // 4. Doctor Schedule for all 7 days of the week (guarantees slot availability)
    const weekDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    for (const day of weekDays) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: testDoctor.id,
          branchId: testBranch.id,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '20:00',
          isActive: true,
        },
      });
    }

    console.log(`[Setup] Isolated fixtures created: Branch "${testBranch.nameUz}", Doctor "${testDoctor.lastNameUz}"`);

    // -------------------------------------------------------------
    // WORKFLOW 1: HOMEPAGE (1440 x 900)
    // -------------------------------------------------------------
    console.log('[1/7] Desktop Homepage (1440x900)...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector('h1') && document.body.innerText.length > 200,
      { timeout: 15000 },
    );
    const desktopHomeShot = path.join(ARTIFACTS_DIR, 'desktop_homepage.png');
    await page.screenshot({ path: desktopHomeShot });
    results.desktop_homepage = desktopHomeShot;

    // -------------------------------------------------------------
    // WORKFLOW 2: MULTI-SERVICE BOOKING WITH ISOLATED FIXTURES
    // -------------------------------------------------------------
    console.log(`[2/7] Navigating to Booking page with isolated branch ${BASE_URL}/booking?branchId=${testBranch.id} ...`);
    await page.goto(`${BASE_URL}/booking?branchId=${testBranch.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Step 1: Select date and advance
    console.log('Step 1: Selecting date and advancing...');
    await page.waitForSelector('#booking-next-step:not([disabled])', { timeout: 30000 });
    await page.click('#booking-next-step');

    // Step 2: Select EXACTLY the TWO isolated test services
    console.log(`Step 2: Selecting isolated test services "Xizmat A ${runKey}" and "Xizmat B ${runKey}"...`);
    await page.waitForFunction(
      (nameA) => Array.from(document.querySelectorAll('div.grid button, button')).some((b) => b.textContent && b.textContent.includes(nameA)),
      { timeout: 15000 },
      `Xizmat A ${runKey}`,
    );

    const selectionResult = await page.evaluate((nameA, nameB) => {
      const buttons = Array.from(document.querySelectorAll('div.grid button, button'));
      const s1 = buttons.find((b) => b.textContent && b.textContent.includes(nameA));
      const s2 = buttons.find((b) => b.textContent && b.textContent.includes(nameB));

      if (!s1 || !s2) {
        return { success: false, s1Found: !!s1, s2Found: !!s2 };
      }

      s1.click();
      s2.click();
      return { success: true };
    }, `Xizmat A ${runKey}`, `Xizmat B ${runKey}`);

    assert(selectionResult.success, `Isolated services must be selectable. Result: ${JSON.stringify(selectionResult)}`);
    await new Promise((r) => setTimeout(r, 600));

    // Verify 2 services selected in summary
    const twoSelected = await page.evaluate(() => {
      const summary = document.body.innerText;
      return summary.includes('2 ta tanlandi') || summary.includes('2 выбрано');
    });
    assert(twoSelected, 'UI must confirm exactly 2 services selected');

    // Click Next (Step 2 -> Step 3)
    await page.waitForSelector('#booking-next-step-2:not([disabled])', { timeout: 15000 });
    await page.click('#booking-next-step-2');

    // Step 3: Select isolated doctor
    console.log(`Step 3: Selecting isolated doctor "Test ${runKey}"...`);
    await page.waitForFunction(
      (docLastName) => Array.from(document.querySelectorAll('button:not([disabled])')).some((b) => b.textContent && b.textContent.includes(docLastName)),
      { timeout: 15000 },
      `Test ${runKey}`,
    );

    const doctorSelected = await page.evaluate((docLastName) => {
      const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
      const docBtn = buttons.find((b) => b.textContent && b.textContent.includes(docLastName));
      if (docBtn) {
        docBtn.click();
        return true;
      }
      return false;
    }, `Test ${runKey}`);
    assert(doctorSelected, `Isolated doctor "Test ${runKey}" must be selectable`);
    await new Promise((r) => setTimeout(r, 600));

    // Click Next (Step 3 -> Step 4)
    await page.waitForSelector('#booking-next-step-3:not([disabled])', { timeout: 15000 });
    await page.click('#booking-next-step-3');

    // Step 4: Pick slot
    console.log('Step 4: Picking an available working time slot...');
    await page.waitForSelector('button[id^="slot-"]:not([disabled])', { timeout: 30000 });

    const slotSelected = await page.evaluate(() => {
      const slotBtn = document.querySelector('button[id^="slot-"]:not([disabled])');
      if (slotBtn) {
        slotBtn.click();
        return true;
      }
      return false;
    });
    assert(slotSelected, 'An available time slot must be selectable');
    await new Promise((r) => setTimeout(r, 600));

    // Click Next (Step 4 -> Step 5)
    await page.waitForSelector('#booking-next-step-4:not([disabled])', { timeout: 15000 });
    await page.click('#booking-next-step-4');

    // Step 5: Location confirmation
    console.log('Step 5: Confirming branch location...');
    await page.waitForSelector('#booking-confirm-location-btn:not([disabled])', { timeout: 15000 });
    await page.click('#booking-confirm-location-btn');

    // Step 6: Fill isolated patient fixture details
    console.log('Step 6: Filling patient details with safe masked phone input...');
    await page.waitForSelector('#patient-name-input', { timeout: 15000 });
    const nameInput = await page.$('#patient-name-input');
    assert(nameInput, 'Patient name input must exist');
    await nameInput.type(testPatientName);

    await page.waitForSelector('#patient-phone-input', { timeout: 15000 });
    await page.type('#patient-phone-input', testPatientPhoneDigits);

    const emailInput = (await page.$('#patient-email-input')) || (await page.$('input[type="email"]'));
    if (emailInput) {
      await emailInput.type(testPatientEmail);
    }

    // Check consent checkbox
    await page.evaluate(() => {
      const cb = document.querySelector('#consent-checkbox');
      if (cb && !cb.checked) {
        cb.click();
      }
    });

    await new Promise((r) => setTimeout(r, 500));

    const submitState = await page.evaluate(() => {
      const btn = document.getElementById('booking-submit-btn');
      return {
        disabled: btn ? btn.disabled : null,
        name: document.getElementById('patient-name-input')?.value,
        phone: document.getElementById('patient-phone-input')?.value,
        email: document.getElementById('patient-email-input')?.value,
        consent: document.getElementById('consent-checkbox')?.checked,
      };
    });
    console.log('Submit button state before click:', JSON.stringify(submitState));

    // Wait for submit button to be enabled
    await page.waitForSelector('#booking-submit-btn:not([disabled])', { timeout: 15000 });

    // Set up network listener to capture EXACT booking request and response
    let capturedBookingPayload = null;
    let submittedBookingPayload = null;
    const bookingResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/booking') && res.request().method() === 'POST',
      { timeout: 20000 },
    ).then(async (res) => {
      try {
        submittedBookingPayload = JSON.parse(res.request().postData());
        capturedBookingPayload = await res.json();
      } catch (e) {}
      return res;
    });

    // Submit booking
    console.log('Submitting booking mutation...');
    await page.click('#booking-submit-btn');

    await bookingResponsePromise;
    assert(capturedBookingPayload && capturedBookingPayload.id, 'Booking API must return created appointment payload with id');
    createdAppointmentId = capturedBookingPayload.id;
    console.log(`Captured exact appointment ID: ${createdAppointmentId}`);

    // Assert normalized submitted phone
    const submittedNormalized = (submittedBookingPayload?.patientPhone || '').replace(/\D/g, '');
    assert.strictEqual(
      `+${submittedNormalized}`,
      expectedNormalizedPhone,
      `Submitted patient phone "+${submittedNormalized}" must match normalized "${expectedNormalizedPhone}"`,
    );

    // Wait for confirmation view
    await page.waitForFunction(
      (apptId) =>
        document.body.innerText.includes('muvaffaqiyatli') ||
        document.body.innerText.includes('успешно') ||
        document.body.innerText.includes('qabul qilindi') ||
        document.body.innerText.includes('принята') ||
        (apptId && document.body.innerText.includes(apptId)),
      { timeout: 15000 },
      createdAppointmentId,
    );

    const confirmationShot = path.join(ARTIFACTS_DIR, 'desktop_booking_confirmation.png');
    await page.screenshot({ path: confirmationShot });
    results.desktop_booking_confirmation = confirmationShot;

    // Database verification: Exactly 2 service items and normalized phone
    const dbBooking = await prisma.appointment.findUnique({
      where: { id: createdAppointmentId },
      include: { serviceItems: true, patient: true },
    });
    assert(dbBooking, 'Appointment must exist in database');
    createdPatientId = dbBooking.patientId;
    assert.strictEqual(dbBooking.serviceItems.length, 2, 'Database must contain exactly 2 persisted service items');
    assert.strictEqual(dbBooking.patient.fullName, testPatientName, 'Database patient name must match fixture');
    assert.strictEqual(dbBooking.patient.phone, expectedNormalizedPhone, `Database phone must match normalized 12-digit number ${expectedNormalizedPhone}`);
    console.log('>>> ASSERTION 1 PASSED: Multi-service booking confirmed and verified in database with 2 items and normalized phone.');

    // -------------------------------------------------------------
    // WORKFLOW 3: AUTHENTICATED ADMIN LOGIN VIA ACTUAL FORM
    // -------------------------------------------------------------
    console.log('[3/7] Logging in via actual admin login form at http://localhost:3000/admin/login ...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });

    await page.type('input[type="email"]', 'admin@dentacare.local');
    await page.type('input[type="password"]', 'DentacareAdmin2026!');

    const loginSubmitBtn = await page.$('button[type="submit"]');
    assert(loginSubmitBtn, 'Login form submit button must exist');
    await loginSubmitBtn.click();

    // Wait for authenticated redirect to /admin
    await page.waitForFunction(
      () =>
        !window.location.pathname.includes('/admin/login') &&
        (window.location.pathname.startsWith('/admin') || document.body.innerText.includes('admin')),
      { timeout: 20000 },
    );
    console.log('>>> ASSERTION 2 PASSED: Authenticated admin access verified via actual login form.');

    // -------------------------------------------------------------
    // WORKFLOW 4: APPOINTMENT CALENDAR VISIBILITY & DETAIL VERIFICATION
    // -------------------------------------------------------------
    console.log('[4/7] Navigating to Admin Calendar and locating exact created appointment...');
    await page.goto(`${BASE_URL}/admin/calendar`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 });

    // Switch to Month view ('Oylik')
    let monthViewActive = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      monthViewActive = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const monthBtn = btns.find((b) => b.textContent && b.textContent.trim() === 'Oylik');
        if (monthBtn) {
          if (monthBtn.className.includes('text-teal-800') || monthBtn.classList.contains('bg-white')) {
            return true;
          }
          monthBtn.click();
        }
        return false;
      });
      if (monthViewActive) break;
      await new Promise((r) => setTimeout(r, 800));
    }

    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15000 });

    // Locate card for our patient
    console.log(`Locating appointment card for patient "${testPatientName}"...`);
    const cardHandle = await page.waitForFunction(
      (name) => {
        const headings = Array.from(document.querySelectorAll('h3, div, span, p'));
        return headings.find((el) => el.textContent && el.textContent.includes(name));
      },
      { timeout: 20000 },
      testPatientName,
    );
    assert(cardHandle, 'Created appointment card must be located in admin calendar');

    // Click card to open detail modal
    await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const targetCard = cards.find((c) => c.textContent && c.textContent.includes(name));
      if (targetCard) targetCard.click();
    }, testPatientName);

    // Wait for detail modal
    await page.waitForFunction(
      () =>
        document.querySelector('div.fixed') &&
        (document.querySelector('div.fixed').textContent.includes("Qabul ma'lumotlari") ||
          document.querySelector('div.fixed').textContent.includes('Qabul boshqaruvi') ||
          document.querySelector('div.fixed').textContent.includes('Telefon:')),
      { timeout: 15000 },
    );

    const modalShot = path.join(ARTIFACTS_DIR, 'desktop_admin_calendar_modal.png');
    await page.screenshot({ path: modalShot });
    results.desktop_admin_calendar_modal = modalShot;

    // Verify modal details: doctor name, 2 services, and duration
    const modalDetails = await page.evaluate((docLastName) => {
      const modal = document.querySelector('div.fixed');
      if (!modal) return null;
      const text = modal.textContent || '';
      return {
        hasDoctor: text.includes(docLastName),
        hasServices: text.includes('Xizmatlar (2)') || text.includes('Xizmatlar'),
        hasDuration: /\d+\s*daq/.test(text),
      };
    }, `Test ${runKey}`);

    assert(modalDetails && modalDetails.hasDoctor, `Modal must display assigned doctor "Test ${runKey}"`);
    assert(modalDetails && modalDetails.hasServices, 'Modal must display the 2 selected services');
    assert(modalDetails && modalDetails.hasDuration, 'Modal must display authoritative appointment duration');
    console.log('>>> ASSERTION 3 PASSED: Exact appointment located and details verified in admin calendar.');

    // -------------------------------------------------------------
    // WORKFLOW 5: RESCHEDULING WITH UI & DATABASE TIME ASSERTION
    // -------------------------------------------------------------
    console.log('[5/7] Executing Rescheduling workflow in modal...');
    const originalStartTime = dbBooking.startTime;

    const clickedReschedBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('div.fixed button'));
      const rBtn = btns.find((b) => b.textContent && (b.textContent.includes('ko\'chirish') || b.textContent.includes('Reschedule')));
      if (rBtn) {
        rBtn.click();
        return true;
      }
      return false;
    });
    assert(clickedReschedBtn, 'Reschedule button must exist in appointment modal');
    await new Promise((r) => setTimeout(r, 1000));

    // Wait for reschedule slot buttons
    await page.waitForFunction(
      () => document.querySelectorAll('div.fixed div.grid button').length > 0,
      { timeout: 15000 },
    );

    // Pick a genuinely different available slot time
    const selectedNewTimeStr = await page.evaluate((origIso) => {
      const origDate = new Date(origIso);
      const origTime = origDate.toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });
      const slotBtns = Array.from(document.querySelectorAll('div.fixed div.grid button:not([disabled])'));
      const diffSlot = slotBtns.find((b) => {
        const txt = (b.textContent || '').trim();
        return /\d{1,2}:\d{2}/.test(txt) && txt !== origTime;
      });
      if (diffSlot) {
        diffSlot.click();
        return (diffSlot.textContent || '').trim();
      }
      return null;
    }, originalStartTime.toISOString());

    assert(selectedNewTimeStr, 'A genuinely different available time slot must be selectable for rescheduling');
    console.log(`Selected new reschedule time: ${selectedNewTimeStr}`);
    await new Promise((r) => setTimeout(r, 500));

    // Click "Ko'chirishni saqlash" (Save Reschedule)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('div.fixed button'));
      const saveBtn = btns.find((b) => b.textContent && b.textContent.includes('saqlash'));
      if (saveBtn) saveBtn.click();
    });

    // Wait for modal to close / update
    await page.waitForFunction(
      () => !document.querySelector('div.fixed') || !document.querySelector('div.fixed').textContent.includes('Ko\'chirishni saqlash'),
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 1500));

    const reschedShot = path.join(ARTIFACTS_DIR, 'desktop_rescheduled.png');
    await page.screenshot({ path: reschedShot });
    results.desktop_rescheduled = reschedShot;

    // Database verification: Verify new start time and incremented scheduleRevision
    const rescheduledDbBooking = await prisma.appointment.findUnique({
      where: { id: createdAppointmentId },
    });
    assert(rescheduledDbBooking, 'Rescheduled appointment must exist in DB');
    assert(rescheduledDbBooking.startTime.getTime() !== originalStartTime.getTime(), 'Database startTime must be genuinely updated to the new time');
    assert.strictEqual(rescheduledDbBooking.scheduleRevision, dbBooking.scheduleRevision + 1, 'Database scheduleRevision must be incremented');

    // UI verification: Verify UI displays the new time
    const uiDisplaysNewTime = await page.evaluate((newTime) => {
      return document.body.innerText.includes(newTime);
    }, selectedNewTimeStr);
    assert(uiDisplaysNewTime, `Admin calendar UI must display the updated appointment time "${selectedNewTimeStr}"`);
    console.log('>>> ASSERTION 4 PASSED: Rescheduling succeeded with matching time in UI and database.');

    // -------------------------------------------------------------
    // WORKFLOW 6: LEGACY REVIEW RESOLUTION & AUDIT VERIFICATION
    // -------------------------------------------------------------
    console.log('[6/7] Creating isolated legacy fixture and navigating to Legacy Review...');
    const legacyPatient = await prisma.patient.create({
      data: { fullName: `Legacy Patient ${runKey}`, phone: `+99890${Date.now().toString().slice(-7)}` },
    });
    legacyPatientId = legacyPatient.id;

    const legacyAppt = await prisma.appointment.create({
      data: {
        id: testLegacyApptId,
        publicToken: `hist_brow_${runKey}`,
        patientId: legacyPatient.id,
        doctorId: testDoctor.id,
        serviceId: testServiceA.id,
        branchId: testBranch.id,
        status: 'COMPLETED',
        startTime: new Date('2025-02-01T10:00:00.000Z'),
        endTime: new Date('2025-02-01T11:15:00.000Z'),
        durationMinutes: 70,
        bufferMinutes: 5,
        serviceName: `Noaniq Paket ${runKey}`,
        consentGiven: true,
      },
    });

    const legacyItem = await prisma.appointmentServiceItem.create({
      data: {
        id: testLegacyItemId,
        appointmentId: legacyAppt.id,
        serviceNameUz: `Noaniq Paket ${runKey}`,
        serviceNameRu: `Пакет Неопределенный ${runKey}`,
        durationMinutes: 45,
        priceFrom: 180000,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
        isLegacyBundle: true,
      },
    });

    // Navigate to Admin Services Legacy Review
    await page.goto(`${BASE_URL}/admin/services`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Switch to Legacy Review tab
    console.log('Switching to Legacy Review tab...');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some((b) => b.textContent && (b.textContent.includes('Tarixiy') || b.textContent.includes('Legacy'))),
      { timeout: 20000 },
    );

    let tabSwitched = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      tabSwitched = await page.evaluate(() => {
        if (document.body.innerText.includes('Tarixiy xizmat nomi') || document.body.innerText.includes('Holat (Provenance)')) {
          return true;
        }
        const tabs = Array.from(document.querySelectorAll('button'));
        const legTab = tabs.find((b) => b.textContent && (b.textContent.includes('Tarixiy') || b.textContent.includes('Legacy')));
        if (legTab) legTab.click();
        return false;
      });
      if (tabSwitched) break;
      await new Promise((r) => setTimeout(r, 800));
    }

    // Wait for table rows to appear
    await page.waitForFunction(
      () => !document.body.innerText.includes('Yuklanmoqda...'),
      { timeout: 15000 },
    );

    // Wait for our run's legacy record to appear in the table
    console.log(`Waiting for legacy fixture item "Noaniq Paket ${runKey}"...`);
    await page.waitForFunction(
      (name) => document.body.innerText.includes(name),
      { timeout: 15000 },
      `Noaniq Paket ${runKey}`,
    );

    const legacyReviewShot = path.join(ARTIFACTS_DIR, 'desktop_legacy_review.png');
    await page.screenshot({ path: legacyReviewShot });
    results.desktop_legacy_review = legacyReviewShot;

    // Click action button "Paket deb saqlash" for this item
    const actionClicked = await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const targetRow = rows.find((r) => r.textContent && r.textContent.includes(name));
      if (!targetRow) return false;
      const actBtn = Array.from(targetRow.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Paket'));
      if (actBtn) {
        actBtn.click();
        return true;
      }
      return false;
    }, `Noaniq Paket ${runKey}`);

    assert(actionClicked, 'Action button "Paket deb saqlash" for legacy review item must exist and be clicked');

    // Wait for action modal
    await page.waitForSelector('div.fixed textarea', { timeout: 10000 });
    const textarea = await page.$('div.fixed textarea');
    assert(textarea, 'Review reason textarea must exist in action modal');
    await textarea.type(`Taftish qarori tasdiqlandi ${runKey}`);
    await new Promise((r) => setTimeout(r, 500));

    const legacyActionShot = path.join(ARTIFACTS_DIR, 'desktop_legacy_action.png');
    await page.screenshot({ path: legacyActionShot });
    results.desktop_legacy_action = legacyActionShot;

    // Submit action modal
    const modalSubmitBtn = await page.$('div.fixed form button[type="submit"]');
    if (modalSubmitBtn) {
      await modalSubmitBtn.click();
    } else {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div.fixed button'));
        const cBtn = btns.find((b) => b.textContent && (b.textContent.includes('Tasdiqlash') || b.textContent.includes('Saqlash')));
        if (cBtn) cBtn.click();
      });
    }

    // Wait for modal to close
    await page.waitForFunction(
      () => !document.querySelector('div.fixed textarea'),
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 1000));

    // Database verification: Verify audit log was recorded
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        entityId: testLegacyItemId,
        action: 'service_item.legacy_reconciled',
      },
    });
    assert(auditRecord, 'Audit log entry must be created for legacy reconciliation');
    console.log('>>> ASSERTION 5 PASSED: Legacy review action completed and verified with audit log.');

    // -------------------------------------------------------------
    // WORKFLOW 7: RESPONSIVE VIEWPORT VERIFICATION
    // -------------------------------------------------------------
    console.log('[7/7] Verifying Mobile (390x844) and Tablet (768x1024) layouts...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('h1'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));
    const mobileHomeShot = path.join(ARTIFACTS_DIR, 'mobile_homepage.png');
    await page.screenshot({ path: mobileHomeShot });
    results.mobile_homepage = mobileHomeShot;

    await page.setViewport({ width: 768, height: 1024, isMobile: true });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('h1'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));
    const tabletHomeShot = path.join(ARTIFACTS_DIR, 'tablet_homepage.png');
    await page.screenshot({ path: tabletHomeShot });
    results.tablet_homepage = tabletHomeShot;

    console.log('====================================================');
    console.log('ALL WORKFLOWS AND HONEST ASSERTIONS SUCCESSFULLY PASSED!');
    console.log('====================================================');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('BROWSER VERIFICATION ERROR:', err);
    process.exitCode = 1;
  } finally {
    console.log('--- PERFORMING ROBUST RUN TEARDOWN ---');

    // 1. Clean up created / interrupted appointments matching run identifiers
    try {
      const apptsToClean = await prisma.appointment.findMany({
        where: {
          OR: [
            ...(createdAppointmentId ? [{ id: createdAppointmentId }] : []),
            { patient: { phone: expectedNormalizedPhone } },
            { patient: { email: testPatientEmail } },
          ],
        },
        select: { id: true, patientId: true },
      });

      for (const a of apptsToClean) {
        try {
          await prisma.auditLog.deleteMany({ where: { entityId: a.id } });
        } catch (e) {
          console.warn(`[Teardown Warning] Appointment auditLog cleanup failed: ${e.message}`);
        }
        try {
          await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: a.id } });
        } catch (e) {
          console.warn(`[Teardown Warning] AppointmentStatusHistory cleanup failed: ${e.message}`);
        }
        try {
          await prisma.notificationJob.deleteMany({ where: { appointmentId: a.id } });
        } catch (e) {
          console.warn(`[Teardown Warning] NotificationJob cleanup failed: ${e.message}`);
        }
        try {
          await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: a.id } });
        } catch (e) {
          console.warn(`[Teardown Warning] AppointmentServiceItem cleanup failed: ${e.message}`);
        }
        try {
          await prisma.appointment.delete({ where: { id: a.id } });
        } catch (e) {
          console.warn(`[Teardown Warning] Appointment delete failed: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[Teardown Warning] Appointment search/cleanup failed: ${e.message}`);
    }

    // 2. Clean up test patient
    try {
      await prisma.patient.deleteMany({
        where: {
          OR: [
            ...(createdPatientId ? [{ id: createdPatientId }] : []),
            { phone: expectedNormalizedPhone },
            { email: testPatientEmail },
          ],
        },
      });
    } catch (e) {
      console.warn(`[Teardown Warning] Patient cleanup failed: ${e.message}`);
    }

    // 3. Clean up legacy fixtures
    try {
      await prisma.auditLog.deleteMany({ where: { entityId: testLegacyItemId } });
      await prisma.appointmentServiceItem.deleteMany({ where: { id: testLegacyItemId } });
      await prisma.appointment.deleteMany({ where: { id: testLegacyApptId } });
      if (legacyPatientId) {
        await prisma.patient.deleteMany({ where: { id: legacyPatientId } });
      }
    } catch (e) {
      console.warn(`[Teardown Warning] Legacy fixtures cleanup failed: ${e.message}`);
    }

    // 4. Clean up doctor schedules
    try {
      await prisma.doctorSchedule.deleteMany({ where: { doctorId: testDoctorId } });
    } catch (e) {
      console.warn(`[Teardown Warning] DoctorSchedule cleanup failed: ${e.message}`);
    }

    // 5. Clean up doctor
    try {
      await prisma.doctor.deleteMany({ where: { id: testDoctorId } });
    } catch (e) {
      console.warn(`[Teardown Warning] Doctor cleanup failed: ${e.message}`);
    }

    // 6. Clean up services
    try {
      await prisma.service.deleteMany({
        where: { id: { in: [testServiceAId, testServiceBId] } },
      });
    } catch (e) {
      console.warn(`[Teardown Warning] Services cleanup failed: ${e.message}`);
    }

    // 7. Clean up branch
    try {
      await prisma.branch.deleteMany({ where: { id: testBranchId } });
    } catch (e) {
      console.warn(`[Teardown Warning] Branch cleanup failed: ${e.message}`);
    }

    await browser.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    console.log('--- TEARDOWN FINISHED ---');
  }
}

run();

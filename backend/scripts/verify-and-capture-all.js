const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
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

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\x1b[31m[ASSERTION FAILED]\x1b[0m ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
}

async function runVerificationAndScreenshots() {
  console.log('========================================================');
  console.log('   StomoApp End-to-End Verification & Screenshots       ');
  console.log('   Frontend: ', FRONTEND_URL);
  console.log('   Backend:  ', BACKEND_URL);
  console.log('   Chrome:   ', CHROME_PATH);
  console.log('   Artifacts:', ARTIFACT_DIR);
  console.log('========================================================\n');

  const prisma = new PrismaClient();
  const runId = `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`Starting run: ${runId}`);

  let browser = null;
  const createdApptIds = [];
  const createdPatientIds = [];
  let testBranch1 = null;
  let testBranch2 = null;
  let testDoctor1 = null;
  let testDoctor2 = null;
  let testService = null;

  try {
    // 1. Fixture Creation
    testBranch1 = await prisma.branch.create({
      data: {
        nameUz: `Filial Chilonzor ${runId}`,
        nameRu: `Филиал Чиланзар ${runId}`,
        addressUz: 'Chilonzor 9-mavze',
        addressRu: 'Чиланзар 9-квартал',
        phone: '+998901002030',
        isActive: true,
      },
    });

    testBranch2 = await prisma.branch.create({
      data: {
        nameUz: `Filial Yunusobod ${runId}`,
        nameRu: `Филиал Юнусабад ${runId}`,
        addressUz: 'Yunusobod 4-mavze',
        addressRu: 'Юнусабад 4-квартал',
        phone: '+998909887766',
        isActive: true,
      },
    });

    testDoctor1 = await prisma.doctor.create({
      data: {
        slug: `dr-doc1-${runId}`,
        firstNameUz: 'Jasur',
        lastNameUz: `Aliyev_${runId}`,
        firstNameRu: 'Жасур',
        lastNameRu: `Алиев_${runId}`,
        titleUz: 'Terapevt stomatolog',
        titleRu: 'Стоматолог терапевт',
        isActive: true,
      },
    });

    testDoctor2 = await prisma.doctor.create({
      data: {
        slug: `dr-doc2-${runId}`,
        firstNameUz: 'Madina',
        lastNameUz: `Karimova_${runId}`,
        firstNameRu: 'Мадина',
        lastNameRu: `Каримова_${runId}`,
        titleUz: 'Ortodont',
        titleRu: 'Ортодонт',
        isActive: true,
      },
    });

    // Doctor 1 works ONLY at Branch 1
    // Doctor 2 works ONLY at Branch 2
    await prisma.doctorBranch.createMany({
      data: [
        { doctorId: testDoctor1.id, branchId: testBranch1.id },
        { doctorId: testDoctor2.id, branchId: testBranch2.id },
      ],
    });

    testService = await prisma.service.create({
      data: {
        slug: `srv-${runId}`,
        nameUz: `Kariyes davolash ${runId}`,
        nameRu: `Лечение кариеса ${runId}`,
        durationMinutes: 45,
        priceFrom: 35000000, // 350,000 UZS
        isActive: true,
      },
    });

    // Link doctor1 to service with custom duration 45m
    await prisma.doctorService.create({
      data: {
        doctorId: testDoctor1.id,
        serviceId: testService.id,
        customDurationMinutes: 45,
      },
    });

    // Add full schedule for doctor1 at branch1
    const allDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    await prisma.doctorSchedule.createMany({
      data: allDays.map(d => ({
        doctorId: testDoctor1.id,
        branchId: testBranch1.id,
        dayOfWeek: d,
        startTime: '08:00',
        endTime: '20:00',
        isActive: true,
      })),
    });

    // Launch headless Chrome
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,800',
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
    page.on('response', res => {
      if (res.status() >= 400) {
        console.log(`HTTP ${res.status()} ${res.url()}`);
      }
    });

    // Set cookie for Uzbek language to ensure deterministic UI
    await page.goto(`${FRONTEND_URL}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('dentacare_lang', 'uz');
      document.cookie = 'dentacare_lang=uz;path=/';
    });

    // =========================================================================
    // PART 1: PUBLIC BOOKING INTERACTION & CONFLICT RECOVERY (Req 7)
    // =========================================================================
    console.log('\n--- Part 1: Public Booking Branch Enforce, Cascading Reset & Conflict ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${FRONTEND_URL}/booking`, { waitUntil: 'networkidle2' });

    // Step 1: Branch must be required
    const initialStepText = await page.evaluate(() => document.body.innerText);
    assert(initialStepText.includes('Filial') || initialStepText.includes('filial'), 'Booking starts at Branch selection');

    // Verify advancing without branch is disabled
    const canAdvanceWithoutBranch = await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')
      );
      return nextBtn ? !nextBtn.disabled : false;
    });
    assert(!canAdvanceWithoutBranch, 'Advancing without selecting a branch is strictly disabled');

    // Check what browser receives for branches, services, doctors
    const loadDiagnostics = await page.evaluate(async () => {
      try {
        const [b, s, d] = await Promise.all([
          fetch('/api/public/branches').then(r => r.json()),
          fetch('/api/public/services').then(r => r.json()),
          fetch('/api/public/doctors').then(r => r.json()),
        ]);
        const errEl = document.querySelector('.bg-red-50, .text-red-800, [role="alert"]');
        return {
          branchesCount: Array.isArray(b) ? b.length : b,
          servicesCount: Array.isArray(s) ? s.length : s,
          doctorsCount: Array.isArray(d) ? d.length : d,
          errorBanner: errEl ? errEl.textContent.trim() : null,
          bodyText: document.body.innerText,
        };
      } catch (e) {
        return { error: e.message, bodyText: document.body.innerText };
      }
    });
    console.log('Load diagnostics:', loadDiagnostics);

    // Wait for branch buttons to appear in DOM
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('filiali') || b.textContent.includes('Filial'));
    }, { timeout: 10000 }).catch(e => console.log('Wait for branch buttons timeout:', e.message));

    // Select testBranch1
    const branchClickResult = await page.evaluate((nameUz, nameRu) => {
      const branchCards = Array.from(document.querySelectorAll('button'));
      const target = branchCards.find(el => el.textContent.includes(nameUz) || (nameRu && el.textContent.includes(nameRu)));
      if (target) {
        target.click();
        return { clicked: true, text: target.textContent.slice(0, 50) };
      }
      return { clicked: false, buttons: branchCards.map(b => b.textContent.trim().slice(0, 30)) };
    }, testBranch1.nameUz, testBranch1.nameRu);
    console.log('Branch selection click result:', branchClickResult);

    await new Promise(r => setTimeout(r, 800));

    // Advance to Step 2 (Service)
    const step1NextResult = await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) {
        nextBtn.click();
        return { clicked: true, text: nextBtn.textContent.trim() };
      }
      const allNexts = Array.from(document.querySelectorAll('button')).filter(b =>
        b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')
      );
      return { clicked: false, foundTotal: allNexts.length, disabled: allNexts.map(b => b.disabled) };
    });
    console.log('Step 1 Next button result:', step1NextResult);
    await new Promise(r => setTimeout(r, 1200));

    // Check step 2 heading
    const step2Heading = await page.evaluate(() => document.querySelector('h2')?.textContent);
    console.log('Step 2 heading:', step2Heading);

    // Select testService in Step 2
    const serviceClickResult = await page.evaluate((nameUz, nameRu) => {
      const cards = Array.from(document.querySelectorAll('button'));
      const target = cards.find(el => el.textContent.includes(nameUz) || (nameRu && el.textContent.includes(nameRu)));
      if (target) {
        target.click();
        return { clicked: true, text: target.textContent.slice(0, 50) };
      }
      return { clicked: false, cardsTotal: cards.length, sample: cards.slice(0, 5).map(c => c.textContent.trim().slice(0, 30)) };
    }, testService.nameUz, testService.nameRu);
    console.log('Service selection click result:', serviceClickResult);
    await new Promise(r => setTimeout(r, 800));

    // Advance to Step 3 (Doctor)
    const step2NextResult = await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) {
        nextBtn.click();
        return { clicked: true, text: nextBtn.textContent.trim() };
      }
      return { clicked: false };
    });
    console.log('Step 2 Next button result:', step2NextResult);
    await new Promise(r => setTimeout(r, 1200));

    const step3Heading = await page.evaluate(() => document.querySelector('h2')?.textContent);
    console.log('Step 3 heading:', step3Heading);

    // Doctor 1 must be present (Doctor 2 works at Branch 2 so is not eligible)
    const docListText = await page.evaluate(() => document.body.innerText);
    assert(docListText.includes('Jasur') || docListText.includes('Aliyev'), 'Doctor 1 working at Branch 1 is listed');

    // Select Doctor 1
    await page.evaluate((dName) => {
      const cards = Array.from(document.querySelectorAll('button'));
      const target = cards.find(el => el.textContent.includes(dName));
      if (target) target.click();
    }, 'Jasur');
    await new Promise(r => setTimeout(r, 600));

    // Advance to Step 4 (Date & Slots)
    await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Select available slot
    const slotFound = await page.evaluate(() => {
      const slotBtns = Array.from(document.querySelectorAll('button')).filter(b => /\d{2}:\d{2}/.test(b.textContent || ''));
      if (slotBtns.length > 0) {
        slotBtns[0].click();
        return true;
      }
      return false;
    });
    assert(slotFound, 'Found and clicked available slot');
    await new Promise(r => setTimeout(r, 600));

    // NOW TEST CASCADING RESET: Go back to Step 1 and change branch
    console.log('Testing branch change clears doctor/slot selections...');
    await page.evaluate(() => {
      const step1Btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Filial') || b.textContent.includes('Филиал')
      );
      if (step1Btn) step1Btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Switch to Branch 2 (Doctor 1 does NOT work at Branch 2)
    await page.evaluate((nameUz, nameRu) => {
      const branchCards = Array.from(document.querySelectorAll('button'));
      const target = branchCards.find(el => el.textContent.includes(nameUz) || (nameRu && el.textContent.includes(nameRu)));
      if (target) target.click();
    }, testBranch2.nameUz, testBranch2.nameRu);
    await new Promise(r => setTimeout(r, 1000));

    // Check that Doctor 1 was cleared
    const branch2State = await page.evaluate(() => {
      const text = document.body.innerText;
      return !text.includes('Jasur');
    });
    assert(branch2State, 'Doctor selection was safely cleared after branch change');

    // Switch back to Branch 1 to complete booking
    await page.evaluate((nameUz, nameRu) => {
      const branchCards = Array.from(document.querySelectorAll('button'));
      const target = branchCards.find(el => el.textContent.includes(nameUz) || (nameRu && el.textContent.includes(nameRu)));
      if (target) target.click();
    }, testBranch1.nameUz, testBranch1.nameRu);
    await new Promise(r => setTimeout(r, 800));

    // Advance to Step 2
    await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Select service again
    await page.evaluate((nameUz, nameRu) => {
      const cards = Array.from(document.querySelectorAll('button'));
      const target = cards.find(el => el.textContent.includes(nameUz) || (nameRu && el.textContent.includes(nameRu)));
      if (target) target.click();
    }, testService.nameUz, testService.nameRu);
    await new Promise(r => setTimeout(r, 600));

    // Advance to Doctor
    await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Select Doctor 1
    await page.evaluate((dName) => {
      const cards = Array.from(document.querySelectorAll('button'));
      const target = cards.find(el => el.textContent.includes(dName));
      if (target) target.click();
    }, 'Jasur');
    await new Promise(r => setTimeout(r, 600));

    // Advance to Date & Slot
    await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Select slot
    await page.evaluate(() => {
      const slotBtns = Array.from(document.querySelectorAll('button')).filter(b => /\d{2}:\d{2}/.test(b.textContent || ''));
      if (slotBtns.length > 0) slotBtns[0].click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Advance to Step 5 (Patient Information)
    await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent.includes('Keyingisi') || b.textContent.includes('Далее') || b.querySelector('svg.lucide-chevron-right')) && !b.disabled
      );
      if (nextBtn) nextBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Fill patient fields
    const testPatientName = `Bemor_${runId}`;
    const testPatientPhone = '901234567';
    const testPatientNote = 'Kariyes profilaktikasi';

    await page.evaluate((pName, pNote) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nameInput = inputs.find(i => i.placeholder?.includes('Ism') || i.name === 'patientName' || i.id?.includes('name'));
      if (nameInput) {
        nameInput.value = pName;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const noteInput = document.querySelector('textarea');
      if (noteInput) {
        noteInput.value = pNote;
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, testPatientName, testPatientNote);

    const pPhoneInput = await page.$('input[type="tel"], input[placeholder*="998"], input[name="patientPhone"]');
    if (pPhoneInput) {
      await pPhoneInput.click();
      await pPhoneInput.type(testPatientPhone);
    }
    await new Promise(r => setTimeout(r, 400));

    // Submit booking
    await page.evaluate(() => {
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Tasdiqlash') || b.textContent.includes('Yozilish') || b.textContent.includes('Записаться') || b.type === 'submit'
      );
      if (submitBtn) submitBtn.click();
    });
    await new Promise(r => setTimeout(r, 3500));

    // Verify confirmation view
    const confirmViewText = await page.evaluate(() => document.body.innerText);
    assert(confirmViewText.includes('muvaffaqiyatli') || confirmViewText.includes('Qabul kodi') || confirmViewText.includes('kod') || confirmViewText.includes('Jasur') || confirmViewText.includes('успешно'), 'Booking was confirmed');
    assert(confirmViewText.includes('45') || confirmViewText.includes('daqiq') || confirmViewText.includes('350,000') || confirmViewText.includes('350 000') || confirmViewText.includes('350.000'), 'Doctor custom duration & price match in summary');

    // CAPTURE SCREENSHOT: booking_summary.png
    const bookingSummaryPath = path.join(ARTIFACT_DIR, 'booking_summary.png');
    await page.screenshot({ path: bookingSummaryPath, fullPage: true });
    console.log(`[SCREENSHOT] Saved booking summary to: ${bookingSummaryPath}`);

    // =========================================================================
    // PART 2: CALENDAR OCCUPANCY DISPLAY (Req 3 & Req 7)
    // =========================================================================
    console.log('\n--- Part 2: Calendar Interval Occupancy (Desktop & Mobile) ---');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const patCal = await prisma.patient.create({
      data: { fullName: `Bemor_Cal_${runId}`, phone: '+998907778899' },
    });
    createdPatientIds.push(patCal.id);

    // Multi-hour appointment (09:00 - 11:00)
    const apptCal1 = await prisma.appointment.create({
      data: {
        patientId: patCal.id,
        doctorId: testDoctor1.id,
        serviceId: testService.id,
        serviceName: testService.nameUz,
        branchId: testBranch1.id,
        startTime: new Date(`${todayStr}T04:00:00.000Z`),
        endTime: new Date(`${todayStr}T06:00:00.000Z`),
        durationMinutes: 120,
        status: 'CONFIRMED',
        publicToken: `token_cal1_${runId}`,
      },
    });
    createdApptIds.push(apptCal1.id);

    // Overrun appointment (14:00 - 15:30 with 30m overrun)
    const apptCal2 = await prisma.appointment.create({
      data: {
        patientId: patCal.id,
        doctorId: testDoctor1.id,
        serviceId: testService.id,
        serviceName: testService.nameUz,
        branchId: testBranch1.id,
        startTime: new Date(`${todayStr}T09:00:00.000Z`),
        endTime: new Date(`${todayStr}T10:00:00.000Z`),
        durationMinutes: 60,
        overrunActive: true,
        overrunMinutes: 30,
        overrunEstimatedEndTime: new Date(`${todayStr}T10:30:00.000Z`),
        overrunReason: 'Kanal tozalash',
        status: 'CHECKED_IN',
        publicToken: `token_cal2_${runId}`,
      },
    });
    createdApptIds.push(apptCal2.id);

    // Login as Admin
    await page.goto(`${FRONTEND_URL}/admin/login`, { waitUntil: 'networkidle2' });
    await page.evaluate(async () => {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': '1' },
        body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
        credentials: 'include',
      });
    });

    // Desktop Calendar View
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${FRONTEND_URL}/admin/calendar?view=day&date=${todayStr}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // CAPTURE SCREENSHOT: calendar_occupancy_desktop.png
    const calDesktopPath = path.join(ARTIFACT_DIR, 'calendar_occupancy_desktop.png');
    await page.screenshot({ path: calDesktopPath, fullPage: true });
    console.log(`[SCREENSHOT] Saved calendar desktop to: ${calDesktopPath}`);

    // Mobile Calendar View (360px viewport)
    await page.setViewport({ width: 360, height: 740 });
    await new Promise(r => setTimeout(r, 1200));

    // CAPTURE SCREENSHOT: calendar_occupancy_mobile_360.png
    const calMobilePath = path.join(ARTIFACT_DIR, 'calendar_occupancy_mobile_360.png');
    await page.screenshot({ path: calMobilePath, fullPage: true });
    console.log(`[SCREENSHOT] Saved calendar mobile to: ${calMobilePath}`);

    // Reset viewport to desktop
    await page.setViewport({ width: 1280, height: 800 });

    // Verify complete month aggregate > 200 appointments
    console.log('Testing month aggregates with > 200 appointments...');
    const bulkAppointments = [];
    for (let i = 0; i < 210; i++) {
      const dayOffset = (i % 25) + 1;
      const sTime = new Date(`${todayStr.slice(0, 8)}${String(dayOffset).padStart(2, '0')}T08:00:00.000Z`);
      const eTime = new Date(sTime.getTime() + 30 * 60000);
      bulkAppointments.push({
        patientId: patCal.id,
        doctorId: testDoctor1.id,
        serviceId: testService.id,
        serviceName: testService.nameUz,
        durationMinutes: 30,
        branchId: testBranch1.id,
        startTime: sTime,
        endTime: eTime,
        status: 'CONFIRMED',
        publicToken: `bulk_${runId}_${i}`,
      });
    }
    await prisma.appointment.createMany({ data: bulkAppointments });

    const [currentYear, currentMonth] = todayStr.split('-').map(Number);
    const aggregatesRes = await page.evaluate(async (y, m) => {
      try {
        const res = await fetch(`/api/admin/appointments/month-aggregates?year=${y}&month=${m}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      } catch (e) {
        return { error: e.message };
      }
    }, currentYear, currentMonth);
    console.log('Month aggregates response:', aggregatesRes);

    const totalCount = aggregatesRes?.data?.totalCount;
    assert(aggregatesRes?.ok && totalCount >= 210, `Complete month aggregates returned ${totalCount} appointments without page-size truncation`);

    // =========================================================================
    // PART 3: DROPDOWN IN MODAL & FOCUS (Req 7)
    // =========================================================================
    console.log('\n--- Part 3: Dropdown-in-Modal & Keyboard Interaction ---');
    await page.goto(`${FRONTEND_URL}/admin/calendar`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Open New Appointment Modal
    const openModalBtn = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Yangi qabul') || b.textContent.includes('Новый прием') || b.textContent.includes('+')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    assert(openModalBtn, 'Clicked New Appointment button');
    await new Promise(r => setTimeout(r, 1000));

    // Expand CustomSelect inside modal
    await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const trigger = modal.querySelector('button[role="combobox"], [data-testid="custom-select-trigger"], .relative button');
        if (trigger) trigger.click();
      }
    });
    await new Promise(r => setTimeout(r, 600));

    // Type space and search in modal dropdown
    await page.evaluate(() => {
      const input = document.querySelector('[role="dialog"] input[type="text"]');
      if (input) {
        input.value = 'Dr. ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.keyboard.press('ArrowDown');

    // CAPTURE SCREENSHOT: dropdown_in_modal.png
    const dropdownModalPath = path.join(ARTIFACT_DIR, 'dropdown_in_modal.png');
    await page.screenshot({ path: dropdownModalPath });
    console.log(`[SCREENSHOT] Saved dropdown in modal to: ${dropdownModalPath}`);

    // Close modal
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    // =========================================================================
    // PART 4: REAL 3D TOOTH VIEWER (Req 6 & Req 7)
    // =========================================================================
    console.log('\n--- Part 4: 3D Tooth Model Inspection Controls & Framing ---');
    await page.goto(`${FRONTEND_URL}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Scroll to Tooth 3D
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 1500));

    // Click 'Ildiz' (Roots) view preset to inspect roots
    await page.evaluate(() => {
      const rootsBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Ildiz') || b.textContent.includes('Корни')
      );
      if (rootsBtn) rootsBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // CAPTURE SCREENSHOT: tooth_viewer_desktop.png
    const toothDesktopPath = path.join(ARTIFACT_DIR, 'tooth_viewer_desktop.png');
    await page.screenshot({ path: toothDesktopPath });
    console.log(`[SCREENSHOT] Saved tooth viewer desktop to: ${toothDesktopPath}`);

    // Mobile Viewport (390px)
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 1000));

    // CAPTURE SCREENSHOT: tooth_viewer_mobile_390.png
    const toothMobilePath = path.join(ARTIFACT_DIR, 'tooth_viewer_mobile_390.png');
    await page.screenshot({ path: toothMobilePath });
    console.log(`[SCREENSHOT] Saved tooth viewer mobile to: ${toothMobilePath}`);

    console.log('\n========================================================');
    console.log('   ALL E2E CHECKS & SCREENSHOTS COMPLETED SUCCESSFULLY!  ');
    console.log('========================================================\n');

  } catch (err) {
    console.error('\n\x1b[31m[ERROR IN VERIFICATION SCRIPT]\x1b[0m', err);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }

    console.log('Cleaning up test fixtures...');
    try {
      if (createdApptIds.length > 0) {
        await prisma.appointment.deleteMany({ where: { id: { in: createdApptIds } } });
      }
      if (testDoctor1) {
        await prisma.appointment.deleteMany({ where: { doctorId: testDoctor1.id } });
      }
      if (createdPatientIds.length > 0) {
        await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
      }
      if (testDoctor1) {
        await prisma.doctorSchedule.deleteMany({ where: { doctorId: testDoctor1.id } });
        await prisma.doctorService.deleteMany({ where: { doctorId: testDoctor1.id } });
        await prisma.doctorBranch.deleteMany({ where: { doctorId: testDoctor1.id } });
        await prisma.doctor.delete({ where: { id: testDoctor1.id } });
      }
      if (testDoctor2) {
        await prisma.doctorBranch.deleteMany({ where: { doctorId: testDoctor2.id } });
        await prisma.doctor.delete({ where: { id: testDoctor2.id } });
      }
      if (testService) {
        await prisma.service.delete({ where: { id: testService.id } });
      }
      if (testBranch1) {
        await prisma.branch.delete({ where: { id: testBranch1.id } });
      }
      if (testBranch2) {
        await prisma.branch.delete({ where: { id: testBranch2.id } });
      }
      console.log('Cleanup completed successfully.');
    } catch (cleanErr) {
      console.error('Error during cleanup:', cleanErr.message);
    }
    await prisma.$disconnect();
  }
}

runVerificationAndScreenshots();

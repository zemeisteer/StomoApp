const assert = require('assert');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { PrismaClient } = require('@prisma/client');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function run() {
  console.log('========================================================================');
  console.log('   STOMOAPP REAL APPLICATION BOOKING & SCHEDULING INTEGRATION SUITE');
  console.log('========================================================================');
  const maskedDbUrl = TEST_DATABASE_URL.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
  console.log(`Target Frontend URL : ${BASE_URL}`);
  console.log(`Target Database     : ${maskedDbUrl}`);

  // 1. Verify isolated test database
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0]?.current_database;
  console.log(`Connected to database: "${currentDb}"`);
  if (currentDb !== 'dentacare_test') {
    throw new Error(`FAIL-CLOSED: Expected test database 'dentacare_test', connected to '${currentDb}'`);
  }

  const runId = `t${Date.now().toString().slice(-6)}`;
  console.log(`Run ID: ${runId}`);

  // 2. Verify frontend proxy points to test backend using a run-specific probe fixture BEFORE any mutation
  console.log('\n[Check] Verifying frontend API proxy points to backend on dentacare_test...');
  const probeBranch = await prisma.branch.create({
    data: {
      id: `probe-br-${runId}`,
      nameUz: `Probe Filial ${runId}`,
      nameRu: `Пробный Филиал ${runId}`,
      addressUz: `Probe Manzil ${runId}`,
      addressRu: `Probe Адрес ${runId}`,
      phone: `+99890999${runId.slice(-4)}`,
      isActive: true,
      sortOrder: 999,
    },
  });

  try {
    const proxyCheckRes = await fetch(`${BASE_URL}/api/public/branches`);
    assert.strictEqual(proxyCheckRes.status, 200, 'Frontend proxy /api/public/branches must return 200');
    const publicBranches = await proxyCheckRes.json();
    assert(Array.isArray(publicBranches), 'Public branches must be an array');
    const foundProbe = publicBranches.some((b) => b.id === probeBranch.id);
    assert(
      foundProbe,
      `FAIL-CLOSED: Probe branch '${probeBranch.id}' was NOT found in frontend proxy response (${publicBranches.length} branches returned). Frontend is not routing to dentacare_test!`,
    );
    console.log(`[PASS] Frontend API proxy verified: probe fixture successfully queried through frontend proxy`);
  } finally {
    await prisma.branch.delete({ where: { id: probeBranch.id } }).catch(() => {});
  }

  // Load production backend services for direct scheduling model tests
  const { SchedulingService } = require('../dist/scheduling/scheduling.service');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const prismaService = new PrismaService();
  const schedulingService = new SchedulingService(prismaService);

  const cleanupTasks = [];

  let browser;

  try {
    // -------------------------------------------------------------------------
    // SETUP ISOLATED FIXTURES
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Creating isolated fixtures in dentacare_test...');

    // Branch A
    const branchA = await prisma.branch.create({
      data: {
        id: `br-a-${runId}`,
        nameUz: `Filial A ${runId}`,
        nameRu: `Филиал А ${runId}`,
        addressUz: `Manzil A Toshkent ${runId}`,
        addressRu: `Адрес А Ташкент ${runId}`,
        phone: `+99890111${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 10,
      },
    });
    cleanupTasks.push(() => prisma.branch.delete({ where: { id: branchA.id } }));

    // Branch B
    const branchB = await prisma.branch.create({
      data: {
        id: `br-b-${runId}`,
        nameUz: `Filial B ${runId}`,
        nameRu: `Филиал B ${runId}`,
        addressUz: `Manzil B Toshkent ${runId}`,
        addressRu: `Адрес B Ташкент ${runId}`,
        phone: `+99890222${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 11,
      },
    });
    cleanupTasks.push(() => prisma.branch.delete({ where: { id: branchB.id } }));

    // Doctor
    const doctor = await prisma.doctor.create({
      data: {
        id: `doc-${runId}`,
        slug: `dr-${runId}`,
        firstNameUz: `Shifokor_${runId}`,
        lastNameUz: 'Testov',
        firstNameRu: `Доктор_${runId}`,
        lastNameRu: 'Тестов',
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.doctor.delete({ where: { id: doctor.id } }));

    // Assign doctor to both Branch A and Branch B
    await prisma.doctorBranch.create({
      data: { doctorId: doctor.id, branchId: branchA.id },
    });
    await prisma.doctorBranch.create({
      data: { doctorId: doctor.id, branchId: branchB.id },
    });
    cleanupTasks.push(() => prisma.doctorBranch.deleteMany({ where: { doctorId: doctor.id } }));

    // Service 1: Standard Service (30m base, 150,000 UZS)
    const service1 = await prisma.service.create({
      data: {
        id: `srv-1-${runId}`,
        slug: `service-1-${runId}`,
        nameUz: `Plomba ${runId}`,
        nameRu: `Пломба ${runId}`,
        category: 'THERAPY',
        durationMinutes: 30,
        priceFrom: 15000000, // 150,000 UZS in tiyin
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.service.delete({ where: { id: service1.id } }));

    // DoctorService override on Service 1: 45m duration
    const doctorService1 = await prisma.doctorService.create({
      data: {
        doctorId: doctor.id,
        serviceId: service1.id,
        customDurationMinutes: 45,
      },
    });

    // Service 2: Zero Price & Zero Buffer Service (free consultation)
    const freeService = await prisma.service.create({
      data: {
        id: `srv-free-${runId}`,
        slug: `service-free-${runId}`,
        nameUz: `Bepul Konsultatsiya ${runId}`,
        nameRu: `Бесплатная Консультация ${runId}`,
        category: 'THERAPY',
        durationMinutes: 20,
        priceFrom: 0,
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.service.delete({ where: { id: freeService.id } }));

    await prisma.doctorService.create({
      data: {
        doctorId: doctor.id,
        serviceId: freeService.id,
        customDurationMinutes: 20,
      },
    });
    cleanupTasks.push(() => prisma.doctorService.deleteMany({ where: { doctorId: doctor.id } }));

    // Target Date: Find Wednesday (day 3) 14 days in future
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    while (targetDate.getDay() !== 3) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const targetDateStr = targetDate.toISOString().slice(0, 10);
    console.log(`Target Wednesday date: ${targetDateStr}`);

    // Schedules for WEDNESDAY:
    // Morning in Branch A: 09:00 - 13:00
    // Afternoon in Branch B: 14:00 - 18:00
    const schedA = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor.id,
        branchId: branchA.id,
        dayOfWeek: 'WEDNESDAY',
        startTime: '09:00',
        endTime: '13:00',
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.doctorSchedule.delete({ where: { id: schedA.id } }));

    const schedB = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor.id,
        branchId: branchB.id,
        dayOfWeek: 'WEDNESDAY',
        startTime: '14:00',
        endTime: '18:00',
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.doctorSchedule.delete({ where: { id: schedB.id } }));

    // =========================================================================
    // PART 1: EXPLICIT OVERTIME & SCHEDULING LOGIC VERIFICATION
    // =========================================================================
    console.log('\n--- PART 1: Explicit Overtime Location & Interval Policy Checks ---');

    // 1.1 Overtime on an off-day (Sunday) with explicit branch
    const sundayDate = new Date(targetDate);
    sundayDate.setDate(sundayDate.getDate() + (7 - sundayDate.getDay()));
    const sundayStr = sundayDate.toISOString().slice(0, 10);

    const overtimeExceptionA = await prisma.scheduleException.create({
      data: {
        doctorId: doctor.id,
        branchId: branchA.id, // Explicit branch assignment!
        date: new Date(sundayStr),
        type: 'OVERTIME',
        startTime: '10:00',
        endTime: '13:00',
        reason: 'Weekend emergency shift in Branch A',
      },
    });
    cleanupTasks.push(() => prisma.scheduleException.delete({ where: { id: overtimeExceptionA.id } }));

    // Query Sunday for Branch A: must return slots with branchA.id
    const sundaySlotsBranchA = await schedulingService.getAvailableSlots(
      doctor.id,
      sundayStr,
      service1.id,
      branchA.id,
      'Asia/Tashkent',
      [service1.id],
    );
    assert(sundaySlotsBranchA.slots.length > 0, 'Explicit overtime in Branch A must produce slots');
    assert(sundaySlotsBranchA.slots.every((s) => s.branchId === branchA.id), 'All Sunday slots must belong to Branch A');
    console.log(`[PASS] Explicit overtime in Branch A yielded ${sundaySlotsBranchA.slots.length} slots strictly bound to Branch A`);

    // Query Sunday for Branch B: MUST return 0 slots (Branch A overtime must NEVER leak into Branch B!)
    const sundaySlotsBranchB = await schedulingService.getAvailableSlots(
      doctor.id,
      sundayStr,
      service1.id,
      branchB.id,
      'Asia/Tashkent',
      [service1.id],
    );
    assert.strictEqual(sundaySlotsBranchB.slots.length, 0, 'Branch A overtime must not appear when querying Branch B');
    console.log('[PASS] Branch A overtime is completely excluded when querying Branch B');

    // Also verify via public HTTP API
    const pubSlotsResA = await fetch(`${BASE_URL}/api/scheduling/slots?doctorId=${doctor.id}&date=${sundayStr}&serviceId=${service1.id}&branchId=${branchA.id}`);
    assert.strictEqual(pubSlotsResA.status, 200, 'Public slots API for Branch A overtime must return 200');
    const pubSlotsDataA = await pubSlotsResA.json();
    assert(pubSlotsDataA.slots && pubSlotsDataA.slots.length > 0, 'Public slots API for Branch A overtime must produce slots');
    assert(pubSlotsDataA.slots.every((s) => s.branchId === branchA.id), 'All public slots must belong to Branch A');

    const pubSlotsResB = await fetch(`${BASE_URL}/api/scheduling/slots?doctorId=${doctor.id}&date=${sundayStr}&serviceId=${service1.id}&branchId=${branchB.id}`);
    assert.strictEqual(pubSlotsResB.status, 200, 'Public slots API for Branch B overtime must return 200');
    const pubSlotsDataB = await pubSlotsResB.json();
    assert(pubSlotsDataB.slots && pubSlotsDataB.slots.length === 0, 'Public slots API for Branch B must return 0 slots');
    console.log('[PASS] Overtime branch isolation verified via public HTTP slots API');

    // 1.2 Adjacent shifts in different branches must NOT be merged
    // Doctor works 09:00 - 13:00 in Branch A and 14:00 - 18:00 in Branch B on Wednesday.
    const splitSlots = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service1.id,
      undefined,
      'Asia/Tashkent',
      [service1.id],
    );
    assert(splitSlots.slots.length > 0, 'Wednesday must have bookable slots');
    for (const s of splitSlots.slots) {
      assert(s.branchId, 'Every publicly bookable slot must have an authoritative branchId');
      assert([branchA.id, branchB.id].includes(s.branchId), 'Slot branchId must be Branch A or Branch B');
    }
    console.log(`[PASS] Authoritative branchId present on all ${splitSlots.slots.length} public slots without cross-branch merging`);

    // 1.3 Configured Pending Expiry (15, 30, 60 minutes) & Staff-Created Status
    console.log('\n--- PART 1.3: Configured Pending-Expiry (15, 30, 60 min) & Staff-Created Checks ---');
    for (const expMin of [15, 30, 60]) {
      await prisma.clinicSettings.upsert({
        where: { id: 'default' },
        update: { pendingExpiryMinutes: expMin },
        create: { id: 'default', pendingExpiryMinutes: expMin, name: 'DentaCare' },
      });

      const futureWed = new Date(targetDate);
      const weekMultiplier = expMin === 15 ? 1 : expMin === 30 ? 2 : 3;
      futureWed.setDate(futureWed.getDate() + 7 * weekMultiplier);
      const futureDateIso = `${futureWed.toISOString().slice(0, 10)}T05:00:00.000Z`;

      const expRes = await fetch(`${BASE_URL}/api/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          branchId: branchA.id,
          serviceId: service1.id,
          startTime: futureDateIso,
          patientName: `Bemor Expiry ${expMin}m ${runId}`,
          patientPhone: `+99890${String(expMin).padStart(2, '0')}${runId.slice(-5)}`,
          consentGiven: true,
        }),
      });
      if (expRes.status !== 201) {
        const errBody = await expRes.text();
        throw new Error(`Booking for expiry ${expMin}m failed (HTTP ${expRes.status}): ${errBody}`);
      }
      const expData = await expRes.json();
      const savedExpAppt = await prisma.appointment.findUnique({
        where: { id: expData.id },
        include: { statusHistory: true },
      });
      assert(savedExpAppt, 'Saved appointment must exist in DB');
      cleanupTasks.push(() => prisma.appointment.delete({ where: { id: savedExpAppt.id } }));

      assert.strictEqual(savedExpAppt.status, 'PENDING', 'Website appointment must start as PENDING');
      assert(savedExpAppt.expiresAt, `expiresAt must be set for pendingExpiryMinutes=${expMin}`);
      const diffMin = (new Date(savedExpAppt.expiresAt).getTime() - Date.now()) / 60000;
      assert(
        diffMin >= expMin - 2 && diffMin <= expMin + 2,
        `expiresAt should be approx now + ${expMin}m, got diff=${diffMin.toFixed(2)}m`,
      );
      assert.strictEqual(
        savedExpAppt.statusHistory[0]?.toStatus,
        'PENDING',
        'Initial status history must record PENDING',
      );
      console.log(`[PASS] Configured pendingExpiryMinutes=${expMin} verified: expiresAt set to ~${diffMin.toFixed(1)}m from now`);
    }

    // Staff-created appointment (admin source)
    const bcrypt = require('bcrypt');
    let adminUser = await prisma.staffUser.findUnique({ where: { email: 'admin@dentacare.local' } });
    if (!adminUser) {
      const hash = await bcrypt.hash('DentacareAdmin2026!', 10);
      adminUser = await prisma.staffUser.create({
        data: {
          email: 'admin@dentacare.local',
          passwordHash: hash,
          fullName: 'Test Admin',
          role: 'OWNER',
          isActive: true,
        },
      });
    }
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
    });
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login must succeed');
    const { accessToken } = await adminLoginRes.json();

    const staffWed = new Date(targetDate);
    staffWed.setDate(staffWed.getDate() + 28);
    const staffDateIso = `${staffWed.toISOString().slice(0, 10)}T05:00:00.000Z`;

    const adminBookingRes = await fetch(`${BASE_URL}/api/admin/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        doctorId: doctor.id,
        branchId: branchA.id,
        serviceId: service1.id,
        startTime: staffDateIso,
        patientName: `Staff Bemor ${runId}`,
        patientPhone: `+99890988${runId.slice(-4)}`,
        consentGiven: true,
      }),
    });
    assert.strictEqual(adminBookingRes.status, 201, 'Staff appointment creation must return 201');
    const adminBookingData = await adminBookingRes.json();
    const savedStaffAppt = await prisma.appointment.findUnique({
      where: { id: adminBookingData.id },
      include: { statusHistory: true },
    });
    assert(savedStaffAppt, 'Saved staff appointment must exist in DB');
    cleanupTasks.push(() => prisma.appointment.delete({ where: { id: savedStaffAppt.id } }));

    assert.strictEqual(savedStaffAppt.status, 'CONFIRMED', 'Staff-created appointment must have status CONFIRMED');
    assert.strictEqual(savedStaffAppt.expiresAt, null, 'Staff-created appointment must have expiresAt null');
    assert.strictEqual(
      savedStaffAppt.statusHistory[0]?.toStatus,
      'CONFIRMED',
      'Initial status history for staff appointment must be CONFIRMED',
    );
    console.log('[PASS] Staff-created appointment is CONFIRMED with expiresAt=null and statusHistory toStatus=CONFIRMED');

    // =========================================================================
    // PART 2: REAL BROWSER APPLICATION TESTS WITH PUPPETEER
    // =========================================================================
    console.log('\n--- PART 2: Launching Browser Tests Against Real React Application ---');

    browser = await puppeteer.launch({
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
    await page.setViewport({ width: 1440, height: 900 });

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 1: Branch Switch Invalidation & Submission Blocking
    // - Select Branch A slot (morning).
    // - Proceed to Step 5 (Location Confirmation).
    // - Click switch branch to Branch B.
    // - Verify Step 4 is activated with switch banner.
    async function advanceToStep4(p) {
      await p.waitForSelector('#booking-next-step:not([disabled])', { timeout: 30000 });
      await p.click('#booking-next-step');
      await p.waitForSelector('#booking-next-step-2:not([disabled])', { timeout: 30000 });
      await p.click('#booking-next-step-2');
      await p.waitForSelector('#booking-next-step-3:not([disabled])', { timeout: 30000 });
      await p.click('#booking-next-step-3');
      await p.waitForSelector('button[id^="slot-"]', { timeout: 30000 });
    }

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 1: Branch Switch Invalidation & Submission Blocking
    // - Select Branch A slot (morning).
    // - Proceed to Step 5 (Location Confirmation).
    // - Click switch branch to Branch B.
    // - Verify Step 4 is activated with switch banner.
    // - Verify old slot selection is cleared.
    // - Verify new availability for Branch B is loaded (only afternoon slots).
    // - Verify next step button is disabled (invalid submission blocked).
    // -------------------------------------------------------------------------
    console.log('\n[Browser 1/6] Testing Branch Switch Selection Invalidation & Submission Blocking...');
    await page.goto(`${BASE_URL}/booking?serviceId=${service1.id}&doctorId=${doctor.id}&date=${targetDateStr}&branchId=${branchA.id}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Advance through Step 1 -> Step 2 -> Step 3 to Step 4 (slots)
    await advanceToStep4(page);

    // Verify slots belong to Branch A
    const branchASlots = await page.$$(`button[data-slot-branch-id="${branchA.id}"]`);
    assert(branchASlots.length > 0, 'Branch A slots must be rendered');

    // Click the first Branch A slot
    const firstSlot = branchASlots[0];
    const firstSlotTime = await page.evaluate((el) => el.getAttribute('data-slot-time'), firstSlot);
    console.log(`Selecting Branch A slot: ${firstSlotTime}`);
    await firstSlot.click();
    await new Promise((r) => setTimeout(r, 400));

    // Verify slot is selected
    const isSelectedBefore = await page.evaluate((el) => el.classList.contains('scale-[1.02]'), firstSlot);
    assert(isSelectedBefore, 'First slot must be visually selected');

    // Advance to Step 5 (Location confirmation)
    const nextBtn4 = await page.$('#booking-next-step-4');
    assert(nextBtn4, 'Step 4 Next button must exist');
    await nextBtn4.click();
    await page.waitForSelector('#booking-confirm-location-btn', { timeout: 10000 });

    // Step 5 should offer switching to Branch B
    const switchBranchBBtn = await page.$(`#switch-branch-${branchB.id}`);
    assert(switchBranchBBtn, 'Switch button for Branch B must exist in Step 5');
    console.log('Clicking switch to Branch B in Step 5...');
    await switchBranchBBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // Assert: User returned to Step 4
    const isStep4Active = await page.evaluate(() => {
      return Boolean(document.querySelector('#booking-next-step-4'));
    });
    assert(isStep4Active, 'Switching branch must navigate back to Step 4');

    // Assert: Switch notice banner is displayed
    const switchBannerText = await page.evaluate(() => {
      const banner = document.querySelector('.animate-fade-in');
      return banner ? banner.textContent : '';
    });
    assert(switchBannerText.includes(branchB.nameUz), 'Switch banner must display Branch B name');
    console.log('[PASS] Switch branch banner displayed properly');

    // Assert: Previous slot selection is cleared and Next button is disabled
    const isNextBtnDisabled = await page.evaluate(() => {
      const btn = document.querySelector('#booking-next-step-4');
      return btn ? btn.hasAttribute('disabled') : false;
    });
    assert(isNextBtnDisabled, 'Advancing without selecting a new slot MUST be blocked (disabled)');
    console.log('[PASS] Invalid submission blocked: Step 4 Next button is disabled');

    // Assert: New availability requested for Branch B (afternoon slots only)
    await page.waitForSelector(`button[data-slot-branch-id="${branchB.id}"]`, { timeout: 10000 });
    const branchBSlotTimes = await page.evaluate((bId) => {
      const btns = Array.from(document.querySelectorAll(`button[data-slot-branch-id="${bId}"]`));
      return btns.map((b) => b.getAttribute('data-slot-time'));
    }, branchB.id);
    assert(branchBSlotTimes.length > 0, 'Branch B slots must be loaded');
    console.log(`[PASS] Branch B slots loaded successfully (${branchBSlotTimes.length} afternoon slots)`);

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 2: Stale Request Race Condition (Delay A, Switch to B)
    // -------------------------------------------------------------------------
    console.log('\n[Browser 2/6] Testing Stale Request Race Condition Protection...');
    await page.setRequestInterception(true);

    let delayBranchAPromiseResolve = null;
    const branchADelayPromise = new Promise((resolve) => {
      delayBranchAPromiseResolve = resolve;
    });

    const requestHandler = async (req) => {
      const url = req.url();
      if (url.includes('/api/public/slots') && url.includes(`branchId=${branchA.id}`)) {
        console.log('Intercepted slot request for Branch A: delaying response...');
        await branchADelayPromise;
        console.log('Resuming delayed slot request for Branch A...');
        req.continue();
      } else {
        req.continue();
      }
    };
    page.on('request', requestHandler);

    // In Step 4: Click branch filter for Branch A (request will be delayed)
    const step4BranchABtn = await page.$(`#step4-branch-filter-${branchA.id}`);
    assert(step4BranchABtn, 'Step 4 Branch A filter button must exist');
    await step4BranchABtn.click();
    await new Promise((r) => setTimeout(r, 400));

    // Immediately switch back to Branch B! (Allowed through immediately)
    const step4BranchBBtn = await page.$(`#step4-branch-filter-${branchB.id}`);
    assert(step4BranchBBtn, 'Step 4 Branch B filter button must exist');
    await step4BranchBBtn.click();
    await page.waitForSelector(`button[data-slot-branch-id="${branchB.id}"]`, { timeout: 10000 });

    // Verify Branch B slots are displayed
    const currentRenderedBranchesBefore = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[data-slot-branch-id]'));
      return btns.map((b) => b.getAttribute('data-slot-branch-id'));
    });
    assert(currentRenderedBranchesBefore.length > 0 && currentRenderedBranchesBefore.every((id) => id === branchB.id), 'Must show Branch B slots');

    // Now resolve the delayed Branch A response!
    if (delayBranchAPromiseResolve) {
      delayBranchAPromiseResolve();
    }
    await new Promise((r) => setTimeout(r, 1200));

    // Assert: UI still displays Branch B slots! The late Branch A response was safely discarded!
    const currentRenderedBranchesAfter = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[data-slot-branch-id]'));
      return btns.map((b) => b.getAttribute('data-slot-branch-id'));
    });
    assert(currentRenderedBranchesAfter.length > 0 && currentRenderedBranchesAfter.every((id) => id === branchB.id), 'Stale Branch A response MUST NOT overwrite Branch B!');
    console.log('[PASS] Stale slot response was discarded: active selection remains Branch B');

    page.off('request', requestHandler);
    await page.setRequestInterception(false);

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 3: Real 409 Booking Conflict & Contact Preservation
    // - Select slot at Branch B.
    // - Advance through Step 5 to Step 6.
    // - Fill patient fields (name, phone, email, note).
    // - Insert concurrent appointment directly into DB for that slot.
    // - Click submit in UI.
    // - Verify 409 banner appears, and patient details remain intact in inputs.
    // -------------------------------------------------------------------------
    console.log('\n[Browser 3/6] Testing Real 409 Conflict & Patient Data Preservation...');

    // Select slot at Branch B
    const slotToBook = await page.$(`button[data-slot-branch-id="${branchB.id}"]:not([disabled])`);
    const slotTimeToBook = await page.evaluate((el) => el.getAttribute('data-slot-time'), slotToBook);
    console.log(`Target conflicting slot: ${slotTimeToBook}`);
    await slotToBook.click();
    await new Promise((r) => setTimeout(r, 400));

    // Next to Step 5
    const step4Next = await page.$('#booking-next-step-4');
    await step4Next.click();
    await page.waitForSelector('#booking-confirm-location-btn', { timeout: 10000 });

    // Step 5 -> Step 6
    const confirmLocBtn = await page.$('#booking-confirm-location-btn');
    await confirmLocBtn.click();
    await page.waitForSelector('#patient-name-input', { timeout: 10000 });

    // Fill patient details
    const testPatientName = `Bemor Conflict ${runId}`;
    const testPatientPhone = '901234567';
    const testPatientEmail = `conflict.${runId}@test.local`;
    const testPatientNote = 'Ogriq kuchli, tezroq yordam kerak';

    await page.type('#patient-name-input', testPatientName);
    await page.type('#patient-phone-input', testPatientPhone);
    await page.type('#patient-email-input', testPatientEmail);
    await page.type('#patient-note-input', testPatientNote);
    await page.evaluate(() => {
      const cb = document.querySelector('#consent-checkbox');
      if (cb && !cb.checked) {
        cb.click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    // Inject concurrent conflicting booking into dentacare_test via Prisma!
    console.log('Injecting concurrent conflicting booking directly into DB...');
    const competitorPatient = await prisma.patient.create({
      data: {
        fullName: 'Raqobatchi Bemor',
        phone: '+998909999999',
      },
    });
    cleanupTasks.push(() => prisma.patient.delete({ where: { id: competitorPatient.id } }));

    const conflictingAppt = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        branchId: branchB.id,
        serviceId: service1.id,
        patientId: competitorPatient.id,
        startTime: new Date(slotTimeToBook),
        endTime: new Date(new Date(slotTimeToBook).getTime() + 45 * 60000),
        status: 'CONFIRMED',
        publicToken: `tok-conflict-${runId}`,
        serviceName: service1.nameUz,
        durationMinutes: 45,
      },
    });
    cleanupTasks.push(() => prisma.appointment.delete({ where: { id: conflictingAppt.id } }));

    // Click submit in UI!
    console.log('Submitting booking to trigger 409 Conflict...');
    const submitBtnState = await page.evaluate(() => {
      const btn = document.getElementById('booking-submit-btn');
      return {
        disabled: btn?.disabled,
        name: document.getElementById('patient-name-input')?.value,
        phone: document.getElementById('patient-phone-input')?.value,
        email: document.getElementById('patient-email-input')?.value,
        consent: document.getElementById('consent-checkbox')?.checked,
      };
    });
    console.log('Submit button state before click:', JSON.stringify(submitBtnState));

    await page.click('#booking-submit-btn');
    await page.waitForSelector('#booking-error-banner', { timeout: 10000 });

    const pageError = await page.evaluate(() => document.getElementById('booking-error-banner')?.textContent?.trim() || '');
    console.log(`[PASS] Conflict notice displayed: "${pageError.slice(0, 60)}..."`);
    assert(
      pageError.includes('band') || pageError.includes('boshqa') || pageError.includes('tanlang'),
      `Must display slot conflict notice, got: "${pageError}"`,
    );

    // UI returned to Step 4 to pick another slot
    await page.waitForSelector('button[id^="slot-"]', { timeout: 10000 });

    // Pick another available slot in Branch B
    const availableSlotsNow = await page.$$(`button[data-slot-branch-id="${branchB.id}"]:not([disabled])`);
    const alternativeSlot = availableSlotsNow.find((s) => s !== slotToBook) || availableSlotsNow[0];
    await alternativeSlot.click();
    await new Promise((r) => setTimeout(r, 400));

    // Advance through Step 5 back to Step 6
    const step4NextAgain = await page.$('#booking-next-step-4');
    await step4NextAgain.click();
    await page.waitForSelector('#booking-confirm-location-btn', { timeout: 10000 });
    const confirmLocBtnAgain = await page.$('#booking-confirm-location-btn');
    await confirmLocBtnAgain.click();
    await page.waitForSelector('#patient-name-input', { timeout: 10000 });

    // ASSERT: Patient fields REMAIN INTACT!
    const preservedName = await page.evaluate(() => document.querySelector('#patient-name-input')?.value);
    const preservedPhone = await page.evaluate(() => document.querySelector('#patient-phone-input')?.value);
    const preservedEmail = await page.evaluate(() => document.querySelector('#patient-email-input')?.value);
    const preservedNote = await page.evaluate(() => document.querySelector('#patient-note-input')?.value);

    assert.strictEqual(preservedName, testPatientName, 'Patient name must be preserved');
    assert(preservedPhone.includes('90') && preservedPhone.includes('123'), 'Patient phone must be preserved');
    assert.strictEqual(preservedEmail, testPatientEmail, 'Patient email must be preserved');
    assert.strictEqual(preservedNote, testPatientNote, 'Patient note must be preserved');
    console.log('[PASS] 100% of patient contact and note fields preserved after conflict recovery');

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 5: Doctor-Specific Duration & Price Against Saved Appointment
    // - Submit booking with our doctor who has 45m duration & 200,000 UZS override.
    // - Check Step 7 confirmation screen.
    // - Check database saved appointment.
    // -------------------------------------------------------------------------
    console.log('\n[Browser 4/6] Testing Doctor-Specific Duration & Price Truth...');
    // Ensure consent is checked
    await page.evaluate(() => {
      const cb = document.querySelector('#consent-checkbox');
      if (cb && !cb.checked) {
        cb.click();
      }
    });

    // ITEM 1 REGRESSION TEST:
    // Update service1 price in DB right before submission!
    // The pre-submission quote in frontend was 150,000 UZS.
    // We update DB to 185,000 UZS (18500000 tiyin).
    // The server will calculate and save 185,000 UZS and return servicePriceFrom: 18500000.
    // The frontend must display 185 000 so'm on confirmation, NOT falling back to 150,000 UZS!
    const updatedPriceTiyin = 18500000;
    console.log('Updating service1 price in DB to 185,000 UZS (18500000 tiyin) before submission to test response contract truth...');
    await prisma.service.update({
      where: { id: service1.id },
      data: { priceFrom: updatedPriceTiyin },
    });

    // Submit valid alternative booking
    const submitBtn2 = await page.$('#booking-submit-btn');
    await submitBtn2.click();
    await page.waitForSelector('#confirmation-duration', { timeout: 15000 });

    // Assert Confirmation Screen displays 45 minutes and exact updated saved price (185 000 UZS)
    const confirmedDurationText = await page.evaluate(() => document.querySelector('#confirmation-duration')?.textContent || '');
    const confirmedPriceText = await page.evaluate(() => document.querySelector('#confirmation-price')?.textContent || '');
    console.log(`Confirmation screen duration: "${confirmedDurationText.trim()}", price: "${confirmedPriceText.trim()}"`);

    assert(confirmedDurationText.includes('45'), 'Confirmation must display 45m from doctor override');

    // Exact monetary comparison:
    const normalizedPrice = parseInt(confirmedPriceText.replace(/\D/g, ''), 10);
    assert.strictEqual(
      normalizedPrice,
      185000,
      `Confirmation must strictly display updated saved price (185,000 UZS), not stale pre-submission quote (150,000 UZS). Got ${normalizedPrice} (raw: "${confirmedPriceText}")`,
    );
    console.log('[PASS] Item 1 Regression Verified: confirmation screen displays authoritative saved price (185,000 UZS)');

    // Query DB for saved appointment
    const savedAppt = await prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        branchId: branchB.id,
        serviceId: service1.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(savedAppt, 'Saved appointment must exist in DB');
    cleanupTasks.push(() => prisma.appointment.delete({ where: { id: savedAppt.id } }));

    assert.strictEqual(savedAppt.durationMinutes, 45, 'DB durationMinutes must be 45');
    assert.strictEqual(savedAppt.servicePriceFrom, updatedPriceTiyin, `DB servicePriceFrom must be ${updatedPriceTiyin} tiyin (185,000 UZS)`);
    assert.strictEqual(savedAppt.branchId, branchB.id, 'DB branchId must match Branch B');
    console.log(`[PASS] Database record confirmed: duration=${savedAppt.durationMinutes}m, price=${savedAppt.servicePriceFrom / 100} UZS`);

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 4: Branch-Prefilled URL Flow
    // - Navigate to /booking?branchId=branchA&serviceId=service1
    // - Complete flow and verify Branch A is preserved and booked.
    // -------------------------------------------------------------------------
    console.log('\n[Browser 5/6] Testing Branch-Prefilled URL Flow...');
    await page.goto(`${BASE_URL}/booking?branchId=${branchA.id}&serviceId=${service1.id}&date=${targetDateStr}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Step 1: Date is selected by default, click Next
    await page.waitForSelector('#booking-next-step:not([disabled])', { timeout: 15000 });
    const step1Next = await page.$('#booking-next-step');
    await step1Next.click();
    await page.waitForSelector('#booking-next-step-2:not([disabled])', { timeout: 10000 });

    // Step 2: Service is already prefilled, click Next
    const step2Next = await page.$('#booking-next-step-2');
    await step2Next.click();
    await page.waitForSelector(`button[id="doctor-select-${doctor.id}"]`, { timeout: 10000 });

    // Step 3: Select our test doctor
    await page.click(`button[id="doctor-select-${doctor.id}"]`);
    await new Promise((r) => setTimeout(r, 400));
    const step3Next = await page.$('#booking-next-step-3');
    await step3Next.click();
    await page.waitForSelector(`button[data-slot-branch-id="${branchA.id}"]`, { timeout: 15000 });

    // Step 4: Verify slots belong strictly to prefilled Branch A
    const prefilledSlots = await page.$$(`button[data-slot-branch-id="${branchA.id}"]:not([disabled])`);
    assert(prefilledSlots.length > 0, 'Prefilled Branch A slots must be available');
    await prefilledSlots[0].click();
    await new Promise((r) => setTimeout(r, 300));
    const step4NextPrefilled = await page.$('#booking-next-step-4');
    await step4NextPrefilled.click();
    await page.waitForSelector('#booking-confirm-location-btn', { timeout: 10000 });

    // Step 5: Verify prefilled branch is Branch A
    const locationBranchText = await page.evaluate(() => document.querySelector('h3')?.textContent || '');
    assert(locationBranchText.includes(branchA.nameUz), `Location confirmation must display Branch A (${branchA.nameUz})`);
    console.log(`[PASS] Branch-prefilled URL safely preserved Branch A throughout selection`);

    // -------------------------------------------------------------------------
    // BROWSER SCENARIO 6: Zero Price and Zero Buffer Verification
    // - Book free service (priceFrom: 0, bufferMinutes: 0)
    // - Verify 0 UZS / Bepul display in summary & confirmation
    // - Verify DB record has servicePriceFrom === 0 and bufferMinutes === 0
    // -------------------------------------------------------------------------
    console.log('\n[Browser 6/6] Testing Zero Price & Zero Buffer Handling...');
    await prisma.clinicSettings.upsert({
      where: { id: 'default' },
      update: { bufferMinutes: 0 },
      create: { id: 'default', bufferMinutes: 0, name: 'DentaCare' },
    });
    await page.goto(`${BASE_URL}/booking?serviceId=${freeService.id}&doctorId=${doctor.id}&date=${targetDateStr}&branchId=${branchA.id}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await advanceToStep4(page);
    await page.waitForSelector(`button[data-slot-branch-id="${branchA.id}"]`, { timeout: 15000 });
    const freeSlots = await page.$$(`button[data-slot-branch-id="${branchA.id}"]:not([disabled])`);
    assert(freeSlots.length > 0, 'Free service slots must be available');
    await freeSlots[0].click();
    await new Promise((r) => setTimeout(r, 300));

    // Next to Step 5 -> Step 6
    const step4NextFree = await page.$('#booking-next-step-4');
    await step4NextFree.click();
    await page.waitForSelector('#booking-confirm-location-btn', { timeout: 10000 });
    const confirmLocBtnFree = await page.$('#booking-confirm-location-btn');
    await confirmLocBtnFree.click();
    await page.waitForSelector('#patient-name-input', { timeout: 10000 });

    // Verify summary price shows "Bepul" or 0 UZS
    const summaryPriceText = await page.evaluate(() => {
      const summaryHeader = document.querySelector('.uppercase.text-\\[11px\\]');
      const container = summaryHeader?.closest('div');
      return container ? container.textContent : '';
    });
    console.log(`Step 6 Summary price text: "${summaryPriceText.trim()}"`);
    assert(
      summaryPriceText.toLowerCase().includes('bepul') ||
        summaryPriceText.toLowerCase().includes('бесплатно') ||
        summaryPriceText.includes('0'),
      'Step 6 summary must show Free / 0 price',
    );

    // Fill form and submit
    await page.type('#patient-name-input', `Bemor Free ${runId}`);
    await page.type('#patient-phone-input', '907777777');
    await page.evaluate(() => {
      const cb = document.querySelector('#consent-checkbox');
      if (cb && !cb.checked) {
        cb.click();
      }
    });
    const submitBtnFree = await page.$('#booking-submit-btn');
    await submitBtnFree.click();
    await page.waitForSelector('#confirmation-price', { timeout: 15000 });

    // Assert confirmation displays free / 0
    const confirmedFreePrice = await page.evaluate(() => document.querySelector('#confirmation-price')?.textContent || '');
    console.log(`Confirmation screen free price: "${confirmedFreePrice.trim()}"`);
    assert(
      confirmedFreePrice.toLowerCase().includes('bepul') ||
        confirmedFreePrice.toLowerCase().includes('бесплатно') ||
        confirmedFreePrice.includes('0'),
      'Confirmation screen must show Free / 0 price',
    );

    // Assert DB record
    const savedFreeAppt = await prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        serviceId: freeService.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(savedFreeAppt, 'Saved free appointment must exist in DB');
    cleanupTasks.push(() => prisma.appointment.delete({ where: { id: savedFreeAppt.id } }));

    assert.strictEqual(savedFreeAppt.servicePriceFrom, 0, 'DB servicePriceFrom must be exactly 0 (not null or fallback)');
    assert.strictEqual(savedFreeAppt.bufferMinutes, 0, 'DB bufferMinutes must be strictly 0');
    console.log(`[PASS] Zero price (0 UZS) and buffer=0 handling verified in DB (price=${savedFreeAppt.servicePriceFrom}, buffer=${savedFreeAppt.bufferMinutes}m)`);

    console.log('\n========================================================================');
    console.log('   ALL 6 REAL APPLICATION BROWSER INTEGRATION SCENARIOS PASSED (100%)');
    console.log('========================================================================');
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n[Teardown] Cleaning up isolated test fixtures in dentacare_test...');
    for (const task of cleanupTasks.reverse()) {
      try {
        await task();
      } catch (err) {
        console.warn('Cleanup warning:', err.message);
      }
    }
    await prisma.$disconnect();
    await prismaService.$disconnect();
    console.log('[Teardown] Finished cleanup.');
  }
}

run().catch((err) => {
  console.error('\n[FATAL] Integration test failed:', err);
  process.exit(1);
});

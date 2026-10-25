const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const http = require('http');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
const API_BASE = 'http://localhost:4000/api';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function apiRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${endpoint}`);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(resBody);
          } catch {
            parsed = resBody;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('   PHASE 2 VERIFICATION: BOOKING PRICE & DURATION CONSISTENCY');
  console.log('========================================================================\n');

  // 1. Verify isolated test database
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0]?.current_database;
  console.log(`[DB Check] Connected to database: "${currentDb}"`);
  if (currentDb !== 'dentacare_test') {
    throw new Error(`FAIL-CLOSED: Expected test database 'dentacare_test', connected to '${currentDb}'`);
  }

  const runId = `p2_${Date.now().toString().slice(-6)}`;
  console.log(`[Run ID] ${runId}\n`);

  const cleanupFns = [];
  let passedTests = 0;
  const totalTests = 7;

  try {
    // -------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------
    console.log('--- Setting up test fixtures ---');
    const branchA = await prisma.branch.create({
      data: {
        id: `br-a-${runId}`,
        nameUz: `Filial A ${runId}`,
        nameRu: `Филиал А ${runId}`,
        addressUz: `Manzil A`,
        addressRu: `Адрес А`,
        phone: `+99890111${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 1,
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branchA.id } }).catch(() => {}));

    const branchB = await prisma.branch.create({
      data: {
        id: `br-b-${runId}`,
        nameUz: `Filial B ${runId}`,
        nameRu: `Филиал B ${runId}`,
        addressUz: `Manzil B`,
        addressRu: `Адрес B`,
        phone: `+99890222${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 2,
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branchB.id } }).catch(() => {}));

    const doctor1 = await prisma.doctor.create({
      data: {
        id: `doc-1-${runId}`,
        slug: `dr-one-${runId}`,
        firstNameUz: `Ali`,
        lastNameUz: `Valiyev`,
        firstNameRu: `Али`,
        lastNameRu: `Валиев`,
        isActive: true,
        isArchived: false,
      },
    });
    cleanupFns.push(() => prisma.doctor.delete({ where: { id: doctor1.id } }).catch(() => {}));

    // Assign doctor1 to branchA ONLY
    const docBranchA = await prisma.doctorBranch.create({
      data: {
        doctorId: doctor1.id,
        branchId: branchA.id,
      },
    });
    cleanupFns.push(() =>
      prisma.doctorBranch.delete({
        where: { doctorId_branchId: { doctorId: doctor1.id, branchId: branchA.id } },
      }).catch(() => {})
    );

    // Services
    const service1 = await prisma.service.create({
      data: {
        id: `srv-1-${runId}`,
        slug: `konsultatsiya-${runId}`,
        nameUz: `Konsultatsiya ${runId}`,
        nameRu: `Консультация ${runId}`,
        priceFrom: 150000,
        priceTo: 200000,
        durationMinutes: 30,
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.service.delete({ where: { id: service1.id } }).catch(() => {}));

    const service2 = await prisma.service.create({
      data: {
        id: `srv-2-${runId}`,
        slug: `plomba-${runId}`,
        nameUz: `Plomba ${runId}`,
        nameRu: `Пломба ${runId}`,
        priceFrom: 250000,
        priceTo: 350000,
        durationMinutes: 45,
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.service.delete({ where: { id: service2.id } }).catch(() => {}));

    // Link doctor1 to service1 & service2
    const docSrv1 = await prisma.doctorService.create({
      data: { doctorId: doctor1.id, serviceId: service1.id },
    });
    cleanupFns.push(() =>
      prisma.doctorService.delete({
        where: { doctorId_serviceId: { doctorId: doctor1.id, serviceId: service1.id } },
      }).catch(() => {})
    );

    const docSrv2 = await prisma.doctorService.create({
      data: { doctorId: doctor1.id, serviceId: service2.id },
    });
    cleanupFns.push(() =>
      prisma.doctorService.delete({
        where: { doctorId_serviceId: { doctorId: doctor1.id, serviceId: service2.id } },
      }).catch(() => {})
    );

    // Target a date: 7 days in the future
    const targetDateObj = new Date();
    targetDateObj.setDate(targetDateObj.getDate() + 7);
    const y = targetDateObj.getFullYear();
    const m = String(targetDateObj.getMonth() + 1).padStart(2, '0');
    const d = String(targetDateObj.getDate()).padStart(2, '0');
    const targetDateStr = `${y}-${m}-${d}`;

    const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const targetDayOfWeek = DAY_NAMES[targetDateObj.getDay()];

    // Schedule for doctor1 at branchA on that day of week (09:00 - 18:00)
    const sched1 = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor1.id,
        branchId: branchA.id,
        dayOfWeek: targetDayOfWeek,
        startTime: '09:00',
        endTime: '18:00',
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.doctorSchedule.delete({ where: { id: sched1.id } }).catch(() => {}));

    // Check clinic bufferMinutes setting
    const clinicSettings = await prisma.clinicSettings.findFirst();
    const expectedBuffer = clinicSettings?.bufferMinutes ?? 0;
    console.log(`Clinic settings bufferMinutes: ${expectedBuffer}`);

    // Local slot times in Tashkent (+05:00) converted to ISO strings
    const slot10Utc = new Date(`${targetDateStr}T10:00:00+05:00`).toISOString();
    const slot11Utc = new Date(`${targetDateStr}T11:00:00+05:00`).toISOString();
    const slot13Utc = new Date(`${targetDateStr}T13:00:00+05:00`).toISOString();

    console.log(`Fixtures ready. Target date: ${targetDateStr} (${targetDayOfWeek})\n`);

    // -------------------------------------------------------------
    // TEST 1: Missing branchId validation
    // -------------------------------------------------------------
    console.log('TEST 1: Required branchId validation');
    const res1 = await apiRequest('/booking', 'POST', {
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Jasur Test',
      patientPhone: '+998901234567',
      consentGiven: true,
      // branchId omitted
    });

    console.log(`  Response status: ${res1.status}`);
    assert.strictEqual(res1.status, 400, `Expected 400 Bad Request, got ${res1.status}`);
    const msg1 = Array.isArray(res1.data?.message) ? res1.data.message.join(' ') : (res1.data?.message || '');
    assert(
      msg1.includes('Filial tanlanishi shart') || msg1.includes('branchId'),
      `Expected 'Filial tanlanishi shart' message, got: ${JSON.stringify(res1.data)}`
    );
    console.log('  ✓ Test 1 Passed: Missing branchId properly rejected with HTTP 400.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 2: Doctor/Branch compatibility validation
    // -------------------------------------------------------------
    console.log('TEST 2: Doctor/Branch compatibility validation');
    const res2 = await apiRequest('/booking', 'POST', {
      branchId: branchB.id, // doctor1 is NOT at branchB
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Jasur Test',
      patientPhone: '+998901234567',
      consentGiven: true,
    });

    console.log(`  Response status: ${res2.status}`);
    assert.strictEqual(res2.status, 400, `Expected 400 Bad Request, got ${res2.status}`);
    const msg2 = Array.isArray(res2.data?.message) ? res2.data.message.join(' ') : (res2.data?.message || '');
    assert(
      msg2.includes('Shifokor bu filialda ishlamaydi'),
      `Expected 'Shifokor bu filialda ishlamaydi' message, got: ${JSON.stringify(res2.data)}`
    );
    console.log('  ✓ Test 2 Passed: Incompatible doctor/branch rejected with HTTP 400.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 3: Stale quote triggers QUOTE_CHANGED without creating appointment
    // -------------------------------------------------------------
    console.log('TEST 3: Authoritative quote recalculation & QUOTE_CHANGED conflict');
    const res3 = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Jasur Test',
      patientPhone: '+998901234567',
      consentGiven: true,
      expectedQuote: {
        priceFrom: 120000, // Stale! Service is actually 150000
        price: 120000,
        durationMinutes: 30,
        bufferMinutes: 5,
      },
    });

    console.log(`  Response status: ${res3.status}`);
    assert.strictEqual(res3.status, 409, `Expected 409 Conflict, got ${res3.status}`);
    assert.strictEqual(res3.data?.code, 'QUOTE_CHANGED', `Expected code 'QUOTE_CHANGED', got: ${res3.data?.code}`);
    assert.strictEqual(res3.data?.quoteChanged, true, `Expected quoteChanged: true`);
    assert.strictEqual(res3.data?.expectedQuote?.priceFrom, 120000);
    assert.strictEqual(res3.data?.currentQuote?.priceFrom, 150000);
    assert(
      res3.data?.materialChanges?.priceChanged === true,
      `Expected materialChanges.priceChanged to be true, got: ${JSON.stringify(res3.data?.materialChanges)}`
    );

    // Verify atomic rollback in DB: no appointment was created
    const countAfter3 = await prisma.appointment.count({
      where: { doctorId: doctor1.id },
    });
    assert.strictEqual(countAfter3, 0, `Expected 0 appointments in DB after quote rejection, found ${countAfter3}`);
    console.log('  ✓ Test 3 Passed: Stale quote rejected with HTTP 409 QUOTE_CHANGED and zero DB appointments.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 4: Quote update acceptance flow succeeds with authoritative quote
    // -------------------------------------------------------------
    console.log('TEST 4: Quote update acceptance resubmission');
    const acceptIdempotencyKey = `idemp_accept_${runId}_1`;
    const res4 = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Jasur Test',
      patientPhone: '+998901234567',
      consentGiven: true,
      idempotencyKey: acceptIdempotencyKey,
      expectedQuote: {
        priceFrom: 150000, // Authoritative price from DB
        price: 150000,
        durationMinutes: 30,
        bufferMinutes: expectedBuffer,
      },
    });

    console.log(`  Response status: ${res4.status}`);
    assert.strictEqual(res4.status, 201, `Expected 201 Created, got ${res4.status}`);
    assert(res4.data?.id, 'Expected appointment ID in response');
    const createdAptId = res4.data.id;
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: createdAptId } }).catch(() => {}));

    const aptInDb = await prisma.appointment.findUnique({
      where: { id: createdAptId },
    });
    assert.strictEqual(aptInDb?.status, 'PENDING');
    assert.strictEqual(aptInDb?.servicePriceFrom, 150000, `Expected servicePriceFrom 150000, got ${aptInDb?.servicePriceFrom}`);
    assert.strictEqual(aptInDb?.durationMinutes, 30);
    console.log('  ✓ Test 4 Passed: Resubmitted quote accepted and stored with authoritative price.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 5: Idempotency integration
    // -------------------------------------------------------------
    console.log('TEST 5: Idempotency key handling (replay vs mismatch)');
    // 5a. Replay exact same request
    const res5a = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Jasur Test',
      patientPhone: '+998901234567',
      consentGiven: true,
      idempotencyKey: acceptIdempotencyKey,
      expectedQuote: {
        priceFrom: 150000,
        price: 150000,
        durationMinutes: 30,
        bufferMinutes: expectedBuffer,
      },
    });

    assert.strictEqual(res5a.status, 201, `Expected 201 Created replay, got ${res5a.status}`);
    assert.strictEqual(res5a.data?.id, createdAptId, 'Expected same appointment ID returned');

    // Ensure no duplicate appointment created in DB
    const countAfter5a = await prisma.appointment.count({
      where: { doctorId: doctor1.id },
    });
    assert.strictEqual(countAfter5a, 1, `Expected exactly 1 appointment in DB, got ${countAfter5a}`);

    // 5b. Same idempotency key with conflicting payload (e.g. different patient name)
    const res5b = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot10Utc,
      patientName: 'Different Name',
      patientPhone: '+998901234567',
      consentGiven: true,
      idempotencyKey: acceptIdempotencyKey,
    });
    assert.strictEqual(res5b.status, 409, `Expected 409 Conflict on payload mismatch with same idempotency key, got ${res5b.status}`);
    console.log('  ✓ Test 5 Passed: Idempotency replay returns existing appointment; payload collision rejected with 409.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 6: Multi-service booking quote recalculation
    // -------------------------------------------------------------
    console.log('TEST 6: Multi-service bundle quote recalculation');
    // service1 (30m, 150000) + service2 (45m, 250000)
    // combined total: duration = 75m, price = 400000
    const res6stale = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceIds: [service1.id, service2.id],
      startTime: slot11Utc,
      patientName: 'Dilshod Test',
      patientPhone: '+998907654321',
      consentGiven: true,
      expectedQuote: {
        priceFrom: 350000, // Stale! Actual total is 400000
        durationMinutes: 75,
        bufferMinutes: expectedBuffer,
      },
    });

    assert.strictEqual(res6stale.status, 409, `Expected 409 Conflict for multi-service stale quote, got ${res6stale.status}`);
    assert.strictEqual(res6stale.data?.code, 'QUOTE_CHANGED');
    assert.strictEqual(res6stale.data?.currentQuote?.priceFrom, 400000);
    assert.strictEqual(res6stale.data?.currentQuote?.durationMinutes, 75);

    // Now send with authoritative values
    const multiAptKey = `idemp_multi_${runId}`;
    const res6ok = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceIds: [service1.id, service2.id],
      startTime: slot11Utc,
      patientName: 'Dilshod Test',
      patientPhone: '+998907654321',
      consentGiven: true,
      idempotencyKey: multiAptKey,
      expectedQuote: {
        priceFrom: 400000,
        price: 400000,
        durationMinutes: 75,
        bufferMinutes: expectedBuffer,
      },
    });

    assert.strictEqual(res6ok.status, 201, `Expected 201 Created for multi-service booking, got ${res6ok.status}`);
    const multiAptId = res6ok.data.id;
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: multiAptId } }).catch(() => {}));

    const multiAptInDb = await prisma.appointment.findUnique({
      where: { id: multiAptId },
      include: { serviceItems: true },
    });
    assert.strictEqual(multiAptInDb?.servicePriceFrom, 400000);
    assert.strictEqual(multiAptInDb?.durationMinutes, 75);
    assert.strictEqual(multiAptInDb?.serviceItems.length, 2);
    console.log('  ✓ Test 6 Passed: Multi-service quote recalculation & item linkage verified.\n');
    passedTests++;

    // -------------------------------------------------------------
    // TEST 7: Phone format validation
    // -------------------------------------------------------------
    console.log('TEST 7: Strict Uzbekistan phone format validation');
    const res7invalid = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot13Utc,
      patientName: 'Invalid Phone User',
      patientPhone: '12345', // clearly invalid
      consentGiven: true,
    });
    assert.strictEqual(res7invalid.status, 400, `Expected 400 Bad Request for invalid phone, got ${res7invalid.status}`);

    const res7valid = await apiRequest('/booking', 'POST', {
      branchId: branchA.id,
      doctorId: doctor1.id,
      serviceId: service1.id,
      startTime: slot13Utc,
      patientName: 'Valid Phone User',
      patientPhone: '+998901234567',
      consentGiven: true,
      expectedQuote: {
        priceFrom: 150000,
        durationMinutes: 30,
        bufferMinutes: expectedBuffer,
      },
    });
    assert.strictEqual(res7valid.status, 201, `Expected 201 Created for valid phone, got ${res7valid.status}`);
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: res7valid.data.id } }).catch(() => {}));
    console.log('  ✓ Test 7 Passed: Invalid phone rejected with 400; valid phone accepted.\n');
    passedTests++;

  } finally {
    console.log('--- Cleaning up test fixtures ---');
    for (const fn of cleanupFns.reverse()) {
      try {
        await fn();
      } catch (err) {
        console.error('Cleanup error:', err.message);
      }
    }
    await prisma.$disconnect();
    console.log('Cleanup completed.');
  }

  console.log('\n========================================================================');
  console.log(`   PHASE 2 SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});

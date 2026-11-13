const assert = require('assert');
const { PrismaClient, StaffRole, DayOfWeek, ExceptionType, AppointmentStatus, PaymentMethod } = require('@prisma/client');
const http = require('http');
const jwt = require('jsonwebtoken');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
const API_BASE = 'http://localhost:4000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123456789_change_in_production';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${endpoint}`);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  console.log('   PHASE 3 VERIFICATION: CORRECT ANALYTICS');
  console.log('========================================================================\n');

  // 1. Verify isolated test database
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0]?.current_database;
  console.log(`[DB Check] Connected to database: "${currentDb}"`);
  if (currentDb !== 'dentacare_test') {
    throw new Error(`FAIL-CLOSED: Expected test database 'dentacare_test', connected to '${currentDb}'`);
  }

  const runId = `p3_${Date.now().toString().slice(-6)}`;
  console.log(`[Run ID] ${runId}\n`);

  const cleanupFns = [];
  let passedTests = 0;
  const totalTests = 5;

  try {
    // Create admin user in DB for JWT validation
    const adminUser = await prisma.staffUser.create({
      data: {
        id: `admin-${runId}`,
        email: `admin_${runId}@example.com`,
        fullName: `Admin ${runId}`,
        passwordHash: 'dummy',
        role: 'ADMIN',
        isActive: true,
        tokenVersion: 1,
      },
    });
    cleanupFns.push(() => prisma.staffUser.delete({ where: { id: adminUser.id } }).catch(() => {}));

    // Generate valid admin JWT token
    const adminToken = jwt.sign(
      { sub: adminUser.id, email: adminUser.email, role: 'ADMIN', tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: Default to Current Calendar Month in Clinic Timezone
    // -------------------------------------------------------------------------
    console.log('TEST 1: Default period boundaries to current month in Asia/Tashkent');
    const res1 = await apiRequest('/admin/analytics/overview', 'GET', null, adminToken);
    assert.strictEqual(res1.status, 200, `Expected 200 OK, got ${res1.status}: ${JSON.stringify(res1.data)}`);
    assert(res1.data?.period, 'Expected period in response');
    assert.strictEqual(res1.data.period.timezone, 'Asia/Tashkent');

    // Calculate expected current month start and end dates
    const now = new Date();
    // In UTC+5 (Tashkent):
    const nowTz = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const expectedYear = nowTz.getUTCFullYear();
    const expectedMonth = nowTz.getUTCMonth(); // 0-indexed
    const expectedLastDay = new Date(Date.UTC(expectedYear, expectedMonth + 1, 0)).getUTCDate();

    const expectedStartPrefix = `${expectedYear}-${String(expectedMonth + 1).padStart(2, '0')}-01`;
    const expectedEndPrefix = `${expectedYear}-${String(expectedMonth + 1).padStart(2, '0')}-${String(expectedLastDay).padStart(2, '0')}`;

    const startInTz = new Date(new Date(res1.data.period.startDate).getTime() + 5 * 60 * 60 * 1000);
    const endInTz = new Date(new Date(res1.data.period.endDate).getTime() + 5 * 60 * 60 * 1000);
    const actualStartPrefix = `${startInTz.getUTCFullYear()}-${String(startInTz.getUTCMonth() + 1).padStart(2, '0')}-${String(startInTz.getUTCDate()).padStart(2, '0')}`;
    const actualEndPrefix = `${endInTz.getUTCFullYear()}-${String(endInTz.getUTCMonth() + 1).padStart(2, '0')}-${String(endInTz.getUTCDate()).padStart(2, '0')}`;

    console.log(`  Period in Asia/Tashkent: ${actualStartPrefix} 00:00 to ${actualEndPrefix} 23:59`);
    assert.strictEqual(actualStartPrefix, expectedStartPrefix, `Expected Tashkent start date ${expectedStartPrefix}, got ${actualStartPrefix}`);
    assert.strictEqual(actualEndPrefix, expectedEndPrefix, `Expected Tashkent end date ${expectedEndPrefix}, got ${actualEndPrefix}`);
    assert.strictEqual(startInTz.getUTCHours(), 0, 'Start hour in Tashkent should be 00');
    assert.strictEqual(endInTz.getUTCHours(), 23, 'End hour in Tashkent should be 23');

    console.log('  ✓ Test 1 Passed: Default analytics period matches current calendar month in clinic timezone.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // SETUP FIXTURES FOR MULTI-SERVICE, REVENUE & UTILIZATION
    // -------------------------------------------------------------------------
    console.log('--- Setting up isolated test fixtures ---');
    const branchA = await prisma.branch.create({
      data: {
        id: `br-a-${runId}`,
        nameUz: `Filial A ${runId}`,
        nameRu: `Филиал А ${runId}`,
        addressUz: `Manzil A`,
        addressRu: `Адрес А`,
        phone: `+99890111${runId.slice(-4)}`,
        isActive: true,
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
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branchB.id } }).catch(() => {}));

    const doctor1 = await prisma.doctor.create({
      data: {
        id: `doc-1-${runId}`,
        slug: `dr-one-${runId}`,
        firstNameUz: `Shifokor`,
        lastNameUz: `Tahlilov`,
        firstNameRu: `Доктор`,
        lastNameRu: `Аналитиков`,
        isActive: true,
        isArchived: false,
      },
    });
    cleanupFns.push(() => prisma.doctor.delete({ where: { id: doctor1.id } }).catch(() => {}));

    const service1 = await prisma.service.create({
      data: {
        id: `srv-1-${runId}`,
        slug: `konsult-${runId}`,
        nameUz: `Konsultatsiya ${runId}`,
        nameRu: `Консультация ${runId}`,
        priceFrom: 100000,
        priceTo: 150000,
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
        priceFrom: 200000,
        priceTo: 250000,
        durationMinutes: 45,
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.service.delete({ where: { id: service2.id } }).catch(() => {}));

    const patient1 = await prisma.patient.create({
      data: {
        id: `pat-1-${runId}`,
        fullName: `Bemor Test ${runId}`,
        phone: `+99890123${runId.slice(-4)}`,
      },
    });
    cleanupFns.push(() => prisma.patient.delete({ where: { id: patient1.id } }).catch(() => {}));

    // Choose target calendar date in current month (e.g. 15th of current month)
    const targetDateStr = `${expectedYear}-${String(expectedMonth + 1).padStart(2, '0')}-15`;
    const targetDateObj = new Date(Date.UTC(expectedYear, expectedMonth, 15, 12, 0, 0));
    const dayOfWeekEnum = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][targetDateObj.getUTCDay()];

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Service Appointments & Service Usage vs Distinct Appointments
    // -------------------------------------------------------------------------
    console.log('TEST 2: Multi-service appointments: separate service usage from appointment counts');

    // Appointment 1: Multi-service (Service 1 + Service 2) -> 1 appointment, 2 service usages
    const appt1 = await prisma.appointment.create({
      data: {
        id: `apt-1-${runId}`,
        publicToken: `tok-1-${runId}`,
        patientId: patient1.id,
        doctorId: doctor1.id,
        branchId: branchA.id,
        serviceId: service1.id, // primary
        status: AppointmentStatus.COMPLETED,
        startTime: new Date(`${targetDateStr}T09:00:00+05:00`),
        endTime: new Date(`${targetDateStr}T10:15:00+05:00`),
        serviceName: `${service1.nameUz}, ${service2.nameUz}`,
        servicePriceFrom: 300000,
        durationMinutes: 75,
        bufferMinutes: 0,
        serviceItems: {
          create: [
            { serviceId: service1.id, serviceNameUz: service1.nameUz, sortOrder: 0, durationMinutes: 30, priceFrom: 100000 },
            { serviceId: service2.id, serviceNameUz: service2.nameUz, sortOrder: 1, durationMinutes: 45, priceFrom: 200000 },
          ],
        },
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: appt1.id } }).catch(() => {}));

    // Appointment 2: Legacy single-service appointment (NO serviceItems rows!) -> 1 appointment, 1 service usage
    const appt2 = await prisma.appointment.create({
      data: {
        id: `apt-2-${runId}`,
        publicToken: `tok-2-${runId}`,
        patientId: patient1.id,
        doctorId: doctor1.id,
        branchId: branchA.id,
        serviceId: service1.id,
        status: AppointmentStatus.COMPLETED,
        startTime: new Date(`${targetDateStr}T11:00:00+05:00`),
        endTime: new Date(`${targetDateStr}T11:30:00+05:00`),
        serviceName: service1.nameUz,
        servicePriceFrom: 100000,
        durationMinutes: 30,
        bufferMinutes: 0,
        // no serviceItems!
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: appt2.id } }).catch(() => {}));

    const res2 = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&doctorId=${doctor1.id}`,
      'GET',
      null,
      adminToken
    );

    assert.strictEqual(res2.status, 200);
    console.log(`  Total appointments: ${res2.data.summary.totalAppointments}`);
    console.log(`  Total service usage: ${res2.data.summary.totalServiceUsage}`);
    console.log(`  Services per appointment: ${res2.data.summary.servicesPerAppointment}`);

    // Must be exactly 2 distinct appointments
    assert.strictEqual(res2.data.summary.totalAppointments, 2, 'Must have exactly 2 distinct appointments');
    // Must be exactly 3 service usages (2 from appt1 + 1 from appt2)
    assert.strictEqual(res2.data.summary.totalServiceUsage, 3, 'Must have 3 service usages across the 2 appointments');
    assert.strictEqual(res2.data.summary.servicesPerAppointment, 1.5, 'Must be 1.5 services per appointment');

    // Verify popularServices contains both services
    const s1Stat = res2.data.popularServices.find((s) => s.name === service1.nameUz || s.serviceId === service1.id);
    const s2Stat = res2.data.popularServices.find((s) => s.name === service2.nameUz || s.serviceId === service2.id);
    assert(s1Stat, 'Service 1 must be present in popularServices');
    assert(s2Stat, 'Service 2 must be present in popularServices');

    console.log(`  Service 1 usages: ${s1Stat.count}, appointments: ${s1Stat.appointmentsCount}`);
    console.log(`  Service 2 usages: ${s2Stat.count}, appointments: ${s2Stat.appointmentsCount}`);

    // Service 1 was in both appt1 and appt2
    assert.strictEqual(s1Stat.count, 2, 'Service 1 must have 2 usages');
    assert.strictEqual(s1Stat.appointmentsCount, 2, 'Service 1 must be in 2 appointments');

    // Service 2 was only in appt1
    assert.strictEqual(s2Stat.count, 1, 'Service 2 must have 1 usage');
    assert.strictEqual(s2Stat.appointmentsCount, 1, 'Service 2 must be in 1 appointment');

    console.log('  ✓ Test 2 Passed: Multi-service and legacy appointments correctly separate service usage from appointment counts.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Service-Specific Revenue Apportionment (No Inflation)
    // -------------------------------------------------------------------------
    console.log('TEST 3: Service-specific revenue: proportionate share vs whole-bundle inflation');

    // Record a 300,000 UZS payment for appt1 (bundle total)
    const payment1 = await prisma.payment.create({
      data: {
        id: `pay-1-${runId}`,
        appointmentId: appt1.id,
        amount: 300000,
        isRefund: false,
        method: PaymentMethod.CASH,
        recordedAt: new Date(`${targetDateStr}T10:15:00+05:00`),
      },
    });
    cleanupFns.push(() => prisma.payment.delete({ where: { id: payment1.id } }).catch(() => {}));

    // Filter by Service 1: should ONLY report 100,000 UZS (1/3 of payment), NOT 300,000 UZS!
    const res3Srv1 = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&serviceId=${service1.id}`,
      'GET',
      null,
      adminToken
    );

    console.log(`  Filtered by Service 1 Net Revenue: ${res3Srv1.data.revenue.netRevenueMinor} UZS`);
    assert.strictEqual(
      res3Srv1.data.revenue.netRevenueMinor,
      100000,
      `Service 1 revenue must be proportionate 100,000 UZS, got ${res3Srv1.data.revenue.netRevenueMinor} UZS`
    );

    // Filter by Service 2: should ONLY report 200,000 UZS (2/3 of payment), NOT 300,000 UZS!
    const res3Srv2 = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&serviceId=${service2.id}`,
      'GET',
      null,
      adminToken
    );

    console.log(`  Filtered by Service 2 Net Revenue: ${res3Srv2.data.revenue.netRevenueMinor} UZS`);
    assert.strictEqual(
      res3Srv2.data.revenue.netRevenueMinor,
      200000,
      `Service 2 revenue must be proportionate 200,000 UZS, got ${res3Srv2.data.revenue.netRevenueMinor} UZS`
    );

    console.log('  ✓ Test 3 Passed: Service-specific revenue correctly apportioned without inflating bundle totals.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Branch-Scoped Doctor Utilization & Branch-Specific Overtime Isolation
    // -------------------------------------------------------------------------
    console.log('TEST 4: Branch-scoped utilization with branch-specific overtime isolation');

    // Doctor 1 regular schedule:
    // Branch A: 09:00 - 13:00 (240 mins)
    const schedA = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor1.id,
        branchId: branchA.id,
        dayOfWeek: dayOfWeekEnum,
        startTime: '09:00',
        endTime: '13:00',
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.doctorSchedule.delete({ where: { id: schedA.id } }).catch(() => {}));

    // Branch B: 15:00 - 18:00 (180 mins)
    const schedB = await prisma.doctorSchedule.create({
      data: {
        doctorId: doctor1.id,
        branchId: branchB.id,
        dayOfWeek: dayOfWeekEnum,
        startTime: '15:00',
        endTime: '18:00',
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.doctorSchedule.delete({ where: { id: schedB.id } }).catch(() => {}));

    // Overtime exception at Branch A: 13:00 - 15:00 (120 mins)
    const otBranchA = await prisma.scheduleException.create({
      data: {
        id: `ot-a-${runId}`,
        doctorId: doctor1.id,
        branchId: branchA.id,
        type: ExceptionType.OVERTIME,
        date: new Date(`${targetDateStr}T00:00:00.000Z`),
        startTime: '13:00',
        endTime: '15:00',
        reason: 'Extra shift Branch A',
      },
    });
    cleanupFns.push(() => prisma.scheduleException.delete({ where: { id: otBranchA.id } }).catch(() => {}));

    // Overtime exception at Branch B: 18:00 - 20:00 (120 mins)
    const otBranchB = await prisma.scheduleException.create({
      data: {
        id: `ot-b-${runId}`,
        doctorId: doctor1.id,
        branchId: branchB.id,
        type: ExceptionType.OVERTIME,
        date: new Date(`${targetDateStr}T00:00:00.000Z`),
        startTime: '18:00',
        endTime: '20:00',
        reason: 'Extra shift Branch B',
      },
    });
    cleanupFns.push(() => prisma.scheduleException.delete({ where: { id: otBranchB.id } }).catch(() => {}));

    // Query Branch A utilization
    // Expected Branch A available minutes: 240 (schedule) + 120 (overtime Branch A) = 360 mins.
    // Must NOT include Branch B schedule (180m) or Branch B overtime (120m).
    const res4A = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&branchId=${branchA.id}&doctorId=${doctor1.id}`,
      'GET',
      null,
      adminToken
    );
    assert.strictEqual(res4A.status, 200);
    const docAUtil = res4A.data.doctorUtilization.find((d) => d.doctorId === doctor1.id);
    console.log(`  Branch A available minutes: ${docAUtil?.totalAvailableMinutes} (expected: 360)`);
    assert.strictEqual(
      docAUtil?.totalAvailableMinutes,
      360,
      `Branch A available minutes must be 360 (240 base + 120 overtime), got ${docAUtil?.totalAvailableMinutes}`
    );

    // Query Branch B utilization
    // Expected Branch B available minutes: 180 (schedule) + 120 (overtime Branch B) = 300 mins.
    // Must NOT include Branch A schedule (240m) or Branch A overtime (120m).
    const res4B = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&branchId=${branchB.id}&doctorId=${doctor1.id}`,
      'GET',
      null,
      adminToken
    );
    assert.strictEqual(res4B.status, 200);
    const docBUtil = res4B.data.doctorUtilization.find((d) => d.doctorId === doctor1.id);
    console.log(`  Branch B available minutes: ${docBUtil?.totalAvailableMinutes} (expected: 300)`);
    assert.strictEqual(
      docBUtil?.totalAvailableMinutes,
      300,
      `Branch B available minutes must be 300 (180 base + 120 overtime), got ${docBUtil?.totalAvailableMinutes}`
    );

    console.log('  ✓ Test 4 Passed: Branch-scoped doctor utilization strictly isolates branch schedules and branch overtime.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Multi-Service Filter Matching (Primary vs ServiceItems)
    // -------------------------------------------------------------------------
    console.log('TEST 5: Filtering by service matches both primary serviceId and multi-service items');

    // Service 2 was secondary in appt1 (not in appt.serviceId).
    // Filtering by service2 must still find appt1!
    const res5 = await apiRequest(
      `/admin/analytics/overview?startDate=${targetDateStr}&endDate=${targetDateStr}&serviceId=${service2.id}`,
      'GET',
      null,
      adminToken
    );

    assert.strictEqual(res5.status, 200);
    console.log(`  Appointments matching secondary Service 2: ${res5.data.summary.totalAppointments}`);
    assert.strictEqual(
      res5.data.summary.totalAppointments,
      1,
      `Filtering by secondary service must find the multi-service appointment (expected 1, got ${res5.data.summary.totalAppointments})`
    );

    console.log('  ✓ Test 5 Passed: Filtering by secondary service correctly matches appointments containing it in serviceItems.\n');
    passedTests++;

  } finally {
    console.log('--- Cleaning up test fixtures in dentacare_test ---');
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
  console.log(`   PHASE 3 SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});

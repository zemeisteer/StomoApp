const assert = require('assert');
const { PrismaClient, StaffRole, DayOfWeek, ExceptionType, AppointmentStatus } = require('@prisma/client');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function run() {
  console.log('========================================================================');
  console.log('   PHASE 4 VERIFICATION: SETTINGS BOUNDARIES & EXPIRATION LIFECYCLE');
  console.log('========================================================================\n');

  // 1. Fail-closed isolated test database check
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0]?.current_database;
  console.log(`[DB Check] Connected to database: "${currentDb}"`);
  if (currentDb !== 'dentacare_test') {
    throw new Error(`FAIL-CLOSED: Expected test database 'dentacare_test', connected to '${currentDb}'`);
  }

  const { ClinicService } = require('../dist/clinic/clinic.service');
  const { AppointmentsService } = require('../dist/appointments/appointments.service');
  const { SchedulingService } = require('../dist/scheduling/scheduling.service');
  const { PrismaService } = require('../dist/prisma/prisma.service');

  const prismaService = new PrismaService();
  const clinicService = new ClinicService(prismaService);
  const schedulingService = new SchedulingService(prismaService);

  // Mock NotificationsService & AuditService for AppointmentsService
  const notificationsService = new Proxy({}, {
    get: (_target, prop) => {
      return async (...args) => {};
    },
  });
  const auditService = new Proxy({}, {
    get: (_target, prop) => {
      return async (...args) => {};
    },
  });
  const appointmentsService = new AppointmentsService(prismaService, schedulingService, notificationsService, auditService);

  const runId = `p4_${Date.now().toString().slice(-6)}`;
  console.log(`[Run ID] ${runId}\n`);

  const cleanupFns = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Clinic settings boundaries & DTO/service validation
    // -------------------------------------------------------------------------
    console.log('[Test 1] Testing pendingExpiryMinutes boundary validation...');

    // 1.1 Out-of-bounds low (< 5) must be rejected
    let rejectedLow = false;
    try {
      await clinicService.updateSettings({ pendingExpiryMinutes: 4 });
    } catch (err) {
      if (err.message && err.message.includes('5 daqiqadan 10080 daqiqagacha')) {
        rejectedLow = true;
      }
    }
    assert.strictEqual(rejectedLow, true, 'FAIL: updateSettings should reject pendingExpiryMinutes < 5');
    console.log('  [PASS] Successfully rejected pendingExpiryMinutes = 4 (< 5)');

    // 1.2 Out-of-bounds high (> 10080) must be rejected
    let rejectedHigh = false;
    try {
      await clinicService.updateSettings({ pendingExpiryMinutes: 10081 });
    } catch (err) {
      if (err.message && err.message.includes('5 daqiqadan 10080 daqiqagacha')) {
        rejectedHigh = true;
      }
    }
    assert.strictEqual(rejectedHigh, true, 'FAIL: updateSettings should reject pendingExpiryMinutes > 10080');
    console.log('  [PASS] Successfully rejected pendingExpiryMinutes = 10081 (> 10080)');

    // 1.3 Boundary values: 5, 10080, and standard 30 must succeed
    const set5 = await clinicService.updateSettings({ pendingExpiryMinutes: 5 });
    assert.strictEqual(set5.pendingExpiryMinutes, 5);

    const set10080 = await clinicService.updateSettings({ pendingExpiryMinutes: 10080 });
    assert.strictEqual(set10080.pendingExpiryMinutes, 10080);

    const set30 = await clinicService.updateSettings({ pendingExpiryMinutes: 30 });
    assert.strictEqual(set30.pendingExpiryMinutes, 30);
    console.log('  [PASS] Accepted valid boundary settings: 5 min, 10080 min (7 days), and 30 min');

    // -------------------------------------------------------------------------
    // TEST 2: Preserving valid zero settings
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Testing preservation of valid zero settings (buffer=0, notice=0)...');
    const setZeros = await clinicService.updateSettings({
      bufferMinutes: 0,
      minBookingNoticeHours: 0,
    });
    assert.strictEqual(setZeros.bufferMinutes, 0, 'FAIL: bufferMinutes 0 was overwritten or ignored');
    assert.strictEqual(setZeros.minBookingNoticeHours, 0, 'FAIL: minBookingNoticeHours 0 was overwritten or ignored');

    const readZeros = await clinicService.getSettings();
    assert.strictEqual(readZeros.bufferMinutes, 0, 'FAIL: bufferMinutes 0 should persist across getSettings');
    assert.strictEqual(readZeros.minBookingNoticeHours, 0, 'FAIL: minBookingNoticeHours 0 should persist across getSettings');
    console.log('  [PASS] Valid zeros preserved correctly (bufferMinutes: 0, minBookingNoticeHours: 0)');

    // -------------------------------------------------------------------------
    // TEST 3: Explicit handling of legacy out-of-range database settings
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing handling of pre-existing legacy out-of-range database rows...');

    // 3.1 Simulate legacy row with pendingExpiryMinutes = 0
    await prisma.clinicSettings.update({
      where: { id: 'default' },
      data: { pendingExpiryMinutes: 0 },
    });
    const legacyLow = await clinicService.getSettings();
    assert.strictEqual(legacyLow.pendingExpiryOutOfRange, true, 'FAIL: pendingExpiryOutOfRange should be true for 0');
    assert.strictEqual(legacyLow.rawPendingExpiryMinutes, 0, 'FAIL: rawPendingExpiryMinutes should preserve 0');
    assert.strictEqual(legacyLow.pendingExpiryMinutes, 5, 'FAIL: pendingExpiryMinutes should sanitize 0 to min bound 5');
    console.log('  [PASS] Legacy setting 0 min sanitized to safe minimum 5 min with out-of-range notice');

    // 3.2 Simulate legacy row with pendingExpiryMinutes = 50000
    await prisma.clinicSettings.update({
      where: { id: 'default' },
      data: { pendingExpiryMinutes: 50000 },
    });
    const legacyHigh = await clinicService.getSettings();
    assert.strictEqual(legacyHigh.pendingExpiryOutOfRange, true, 'FAIL: pendingExpiryOutOfRange should be true for 50000');
    assert.strictEqual(legacyHigh.rawPendingExpiryMinutes, 50000, 'FAIL: rawPendingExpiryMinutes should preserve 50000');
    assert.strictEqual(legacyHigh.pendingExpiryMinutes, 10080, 'FAIL: pendingExpiryMinutes should sanitize 50000 to max bound 10080');
    console.log('  [PASS] Legacy setting 50000 min sanitized to safe maximum 10080 min with out-of-range notice');

    // Reset settings to a clean 30 minutes test state
    await clinicService.updateSettings({
      pendingExpiryMinutes: 30,
      bufferMinutes: 5,
      minBookingNoticeHours: 2,
      maxBookingHorizonDays: 60,
    });

    // -------------------------------------------------------------------------
    // TEST 4: Booking creation honoring configured expiration boundaries
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Testing booking creation honoring configured expiration...');

    // Setup fixtures: Branch, Doctor, Service
    const branch = await prisma.branch.create({
      data: {
        id: `br-${runId}`,
        nameUz: `Filial ${runId}`,
        nameRu: `Филиал ${runId}`,
        addressUz: 'Manzil',
        addressRu: 'Адрес',
        phone: `+99890111${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 1,
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branch.id } }).catch(() => {}));

    const doctor = await prisma.doctor.create({
      data: {
        id: `doc-${runId}`,
        firstNameUz: 'Anvar',
        lastNameUz: 'Karimov',
        firstNameRu: 'Анвар',
        lastNameRu: 'Каримов',
        slug: `dr-anvar-${runId}`,
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.doctor.delete({ where: { id: doctor.id } }).catch(() => {}));

    await prisma.doctorBranch.create({
      data: { doctorId: doctor.id, branchId: branch.id },
    });

    const service = await prisma.service.create({
      data: {
        id: `srv-${runId}`,
        nameUz: 'Konsultatsiya',
        nameRu: 'Консультация',
        slug: `konsult-${runId}`,
        durationMinutes: 30,
        priceFrom: 150000,
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.service.delete({ where: { id: service.id } }).catch(() => {}));

    await prisma.doctorService.create({
      data: { doctorId: doctor.id, serviceId: service.id },
    });

    // Set schedule: Mon-Sun 09:00 - 18:00
    for (const dow of Object.values(DayOfWeek)) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor.id,
          branchId: branch.id,
          dayOfWeek: dow,
          startTime: '09:00',
          endTime: '18:00',
          isActive: true,
        },
      });
    }

    // Configure 15 minutes pendingExpiryMinutes
    await clinicService.updateSettings({ pendingExpiryMinutes: 15 });

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const targetDateStr = targetDate.toISOString().slice(0, 10);
    const bookingStartStr = `${targetDateStr}T10:00:00.000Z`;

    const beforeBooking = Date.now();
    const websiteBooking = await appointmentsService.createBooking({
      doctorId: doctor.id,
      branchId: branch.id,
      serviceId: service.id,
      startTime: bookingStartStr,
      patientName: 'Bemor Test',
      patientPhone: `+99890123${runId.slice(-4)}`,
      consentGiven: true,
      source: 'website',
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: websiteBooking.id } }).catch(() => {}));

    assert.strictEqual(websiteBooking.status, AppointmentStatus.PENDING);
    assert.notStrictEqual(websiteBooking.expiresAt, null);
    const calculatedExpiryMin = (new Date(websiteBooking.expiresAt).getTime() - beforeBooking) / (60 * 1000);
    assert.strictEqual(
      calculatedExpiryMin >= 14 && calculatedExpiryMin <= 16,
      true,
      `FAIL: Expected expiresAt ~15min, got ${calculatedExpiryMin.toFixed(2)}min`
    );
    console.log(`  [PASS] Website booking has status PENDING and expiresAt in ~${calculatedExpiryMin.toFixed(1)} minutes (matches configured 15 min)`);

    // Staff booking via admin should have status CONFIRMED and expiresAt === null
    const staffBooking = await appointmentsService.createBooking({
      doctorId: doctor.id,
      branchId: branch.id,
      serviceId: service.id,
      startTime: `${targetDateStr}T11:00:00.000Z`,
      patientName: 'Staff Client',
      patientPhone: `+99890987${runId.slice(-4)}`,
      consentGiven: true,
      source: 'admin',
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: staffBooking.id } }).catch(() => {}));

    assert.strictEqual(staffBooking.status, AppointmentStatus.CONFIRMED);
    assert.strictEqual(staffBooking.expiresAt, null);
    console.log('  [PASS] Staff-created booking via admin has status CONFIRMED and expiresAt = null');

    // -------------------------------------------------------------------------
    // TEST 5: Real expiration runner (expirePending)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing background expiration processing (expirePending)...');

    // Create an abandoned pending appointment and explicitly backdate expiresAt to 5 minutes ago
    const abanPatient = await prisma.patient.create({
      data: {
        fullName: 'Abandoned Patient',
        phone: `+99890555${runId.slice(-4)}`,
      },
    });
    cleanupFns.push(() => prisma.patient.delete({ where: { id: abanPatient.id } }).catch(() => {}));

    const abandonedAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_aban_${runId}`,
        patientId: abanPatient.id,
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        serviceName: service.nameUz,
        startTime: new Date(`${targetDateStr}T06:00:00.000Z`),
        endTime: new Date(`${targetDateStr}T06:30:00.000Z`),
        durationMinutes: 30,
        bufferMinutes: 5,
        status: AppointmentStatus.PENDING,
        expiresAt: new Date(Date.now() - 5 * 60 * 1000), // Expired 5 minutes ago!
        source: 'website',
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: abandonedAppt.id } }).catch(() => {}));

    // Check slot availability before sweep: should already be available because expiresAt has passed
    const isSlotAvailableEvenBeforeSweep = await schedulingService.isTimeSlotAvailable(
      doctor.id,
      new Date(`${targetDateStr}T06:00:00.000Z`),
      new Date(`${targetDateStr}T06:35:00.000Z`),
      'Asia/Tashkent',
      undefined,
      branch.id
    );
    assert.strictEqual(
      isSlotAvailableEvenBeforeSweep,
      true,
      'FAIL: Slot should be available immediately once expiresAt passes, even before sweep'
    );
    console.log('  [PASS] Slot is immediately available for new bookings once expiresAt has lapsed');

    // Run expirePending()
    const sweepCount = await appointmentsService.expirePending();
    assert.strictEqual(sweepCount >= 1, true, `FAIL: Expected at least 1 expired appointment, got ${sweepCount}`);

    // Verify persisted state of abandoned appointment
    const refreshedAbandoned = await prisma.appointment.findUnique({
      where: { id: abandonedAppt.id },
      include: { statusHistory: true },
    });

    assert.strictEqual(refreshedAbandoned.status, AppointmentStatus.CANCELLED);
    assert.notStrictEqual(refreshedAbandoned.tokenRevokedAt, null);

    const historyRecord = refreshedAbandoned.statusHistory.find((h) => h.toStatus === AppointmentStatus.CANCELLED);
    assert.notStrictEqual(historyRecord, undefined, 'FAIL: Status history record for cancellation must exist');
    assert.strictEqual(historyRecord.fromStatus, AppointmentStatus.PENDING);
    assert.strictEqual(historyRecord.changedBy, 'system');
    assert.strictEqual(historyRecord.reason.includes('avtomatik bekor qilindi'), true);

    const auditRecord = await prisma.auditLog.findFirst({
      where: { entityId: abandonedAppt.id, action: 'appointment.status_expired' },
    });
    assert.notStrictEqual(auditRecord, null, 'FAIL: AuditLog record for status_expired must exist');
    console.log('  [PASS] expirePending() swept abandoned appointment: status CANCELLED, token revoked, status history & audit log written');

    // -------------------------------------------------------------------------
    // TEST 6: Concurrent Confirmation vs Expiration race
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing concurrent confirmation vs expiration race condition...');

    // Create appointment right on the expiration edge
    const racePatient = await prisma.patient.create({
      data: {
        fullName: 'Race Patient',
        phone: `+99890666${runId.slice(-4)}`,
      },
    });
    cleanupFns.push(() => prisma.patient.delete({ where: { id: racePatient.id } }).catch(() => {}));

    const edgeAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_race_${runId}`,
        patientId: racePatient.id,
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        serviceName: service.nameUz,
        startTime: new Date(`${targetDateStr}T07:00:00.000Z`),
        endTime: new Date(`${targetDateStr}T07:30:00.000Z`),
        durationMinutes: 30,
        bufferMinutes: 5,
        status: AppointmentStatus.PENDING,
        expiresAt: new Date(Date.now() - 500), // Just passed 500ms ago
        source: 'website',
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: edgeAppt.id } }).catch(() => {}));

    // Concurrently trigger changeStatus (CONFIRMED) and expirePending()
    let confirmSuccess = false;
    let confirmError = null;

    await Promise.all([
      appointmentsService
        .changeStatus(edgeAppt.id, AppointmentStatus.CONFIRMED, 'system', 'Staff confirmed at counter')
        .then(() => {
          confirmSuccess = true;
        })
        .catch((err) => {
          confirmError = err;
        }),
      appointmentsService.expirePending(),
    ]);

    const postRaceAppt = await prisma.appointment.findUnique({
      where: { id: edgeAppt.id },
    });

    // Result must be strictly deterministic: either CONFIRMED or CANCELLED, never in between
    assert.strictEqual(
      postRaceAppt.status === AppointmentStatus.CONFIRMED || postRaceAppt.status === AppointmentStatus.CANCELLED,
      true,
      `FAIL: Invalid post-race status ${postRaceAppt.status}`
    );

    if (postRaceAppt.status === AppointmentStatus.CONFIRMED) {
      assert.strictEqual(postRaceAppt.expiresAt, null, 'CONFIRMED appointment must clear expiresAt to null');
      console.log('  [PASS] Race resolution: Confirmation acquired lock first; status is cleanly CONFIRMED, expiresAt cleared to null');
    } else {
      assert.strictEqual(postRaceAppt.status, AppointmentStatus.CANCELLED);
      console.log('  [PASS] Race resolution: Expiration acquired lock first; status is cleanly CANCELLED, late confirmation rejected safely');
    }

    // 6.2 Test: A cancelled appointment cannot be confirmed
    let zombieConfirmBlocked = false;
    try {
      await appointmentsService.changeStatus(abandonedAppt.id, AppointmentStatus.CONFIRMED, 'system');
    } catch (err) {
      if (err.message && err.message.includes('o\'tish taqiqlangan')) {
        zombieConfirmBlocked = true;
      }
    }
    assert.strictEqual(zombieConfirmBlocked, true, 'FAIL: Confirming an already CANCELLED appointment must throw BadRequestException');
    console.log('  [PASS] Reconfirming an already expired/cancelled appointment is strictly rejected by transition guards');

    console.log('\n========================================================================');
    console.log('   ALL 6 PHASE 4 SETTINGS & EXPIRATION TESTS PASSED (100%)');
    console.log('========================================================================\n');
  } finally {
    console.log('[Cleanup] Cleaning up test fixtures in dentacare_test...');
    for (const fn of cleanupFns.reverse()) {
      try {
        await fn();
      } catch {}
    }
    await prisma.$disconnect();
    console.log('[Cleanup] Completed.\n');
  }
}

run().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});

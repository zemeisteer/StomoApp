const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function run() {
  console.log('========================================================================');
  console.log('   PHASE 1 VERIFICATION: SAFE SCHEDULE CHANGES & UNIFIED LOCKS');
  console.log('========================================================================');

  // 1. Verify isolated test database
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0]?.current_database;
  console.log(`Connected to database: "${currentDb}"`);
  if (currentDb !== 'dentacare_test') {
    throw new Error(`FAIL-CLOSED: Expected test database 'dentacare_test', connected to '${currentDb}'`);
  }

  const { SchedulingService } = require('../dist/scheduling/scheduling.service');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const prismaService = new PrismaService();
  const schedulingService = new SchedulingService(prismaService);

  const runId = `p1_${Date.now().toString().slice(-6)}`;
  console.log(`Run ID: ${runId}`);

  const cleanupFns = [];

  try {
    // Setup Branches
    const branchA = await prisma.branch.create({
      data: {
        id: `br-a-${runId}`,
        nameUz: `Filial A ${runId}`,
        nameRu: `Филиал А ${runId}`,
        addressUz: `Manzil A ${runId}`,
        addressRu: `Адрес А ${runId}`,
        phone: `+99890111${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 10,
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branchA.id } }).catch(() => {}));

    const branchB = await prisma.branch.create({
      data: {
        id: `br-b-${runId}`,
        nameUz: `Filial B ${runId}`,
        nameRu: `Филиал B ${runId}`,
        addressUz: `Manzil B ${runId}`,
        addressRu: `Адрес B ${runId}`,
        phone: `+99890222${runId.slice(-4)}`,
        isActive: true,
        sortOrder: 20,
      },
    });
    cleanupFns.push(() => prisma.branch.delete({ where: { id: branchB.id } }).catch(() => {}));

    // Setup Doctors
    const doctor1 = await prisma.doctor.create({
      data: {
        id: `doc-1-${runId}`,
        slug: `dr-one-${runId}`,
        firstNameUz: `ShifokorBir`,
        lastNameUz: `Testov`,
        firstNameRu: `ДокторОдин`,
        lastNameRu: `Тестов`,
        isActive: true,
        isArchived: false,
      },
    });
    cleanupFns.push(() => prisma.doctor.delete({ where: { id: doctor1.id } }).catch(() => {}));

    const doctor2 = await prisma.doctor.create({
      data: {
        id: `doc-2-${runId}`,
        slug: `dr-two-${runId}`,
        firstNameUz: `ShifokorIkki`,
        lastNameUz: `Testov`,
        firstNameRu: `ДокторДва`,
        lastNameRu: `Тестов`,
        isActive: true,
        isArchived: false,
      },
    });
    cleanupFns.push(() => prisma.doctor.delete({ where: { id: doctor2.id } }).catch(() => {}));

    // Setup Patient and Service for appointments
    const service1 = await prisma.service.create({
      data: {
        id: `srv-1-${runId}`,
        slug: `konsultatsiya-${runId}`,
        nameUz: `Konsultatsiya ${runId}`,
        nameRu: `Консультация ${runId}`,
        durationMinutes: 30,
        priceFrom: 10000000, // 100,000 UZS
        isActive: true,
      },
    });
    cleanupFns.push(() => prisma.service.delete({ where: { id: service1.id } }).catch(() => {}));

    const patient1 = await prisma.patient.create({
      data: {
        id: `pat-1-${runId}`,
        fullName: `Bemor Ali ${runId}`,
        phone: `+99890333${runId.slice(-4)}`,
      },
    });
    cleanupFns.push(() => prisma.patient.delete({ where: { id: patient1.id } }).catch(() => {}));

    // -------------------------------------------------------------------------
    // TEST 1: Unified Advisory Lock Namespace & Hash
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Checking unified advisory lock key generation...');
    const lockKey1 = schedulingService.getDoctorLockKey(doctor1.id);
    assert.strictEqual(typeof lockKey1, 'number', 'Lock key must be an integer');
    assert(lockKey1 > 0, 'Lock key must be positive');
    console.log(`[PASS] Doctor lock key generated: ${lockKey1} for ${doctor1.id}`);

    // -------------------------------------------------------------------------
    // TEST 2: Cross-Branch Schedule Conflict Inside Transaction
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Testing cross-branch schedule conflict inside transaction...');
    // Create Monday 09:00 - 14:00 at Branch A
    await schedulingService.setDoctorSchedule({
      doctorId: doctor1.id,
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '14:00',
      branchId: branchA.id,
    });
    console.log('Created initial schedule: Mon 09:00-14:00 at Branch A');

    // Attempt to set batch schedule for Monday 12:00 - 18:00 at Branch B (cross-branch overlap!)
    let crossBranchErrorCaught = false;
    try {
      await schedulingService.setBatchSchedules({
        doctorIds: [doctor1.id],
        daysOfWeek: ['MONDAY'],
        startTime: '12:00',
        endTime: '18:00',
        branchId: branchB.id,
        mode: 'replace',
      });
    } catch (err) {
      crossBranchErrorCaught = true;
      assert(err.message.includes('boshqa filialda') || err.message.includes('kesishmoqda'), `Expected overlap error message, got: ${err.message}`);
      console.log(`[PASS] Caught expected cross-branch conflict: "${err.message}"`);
    }
    assert(crossBranchErrorCaught, 'Cross-branch schedule overlap MUST be rejected');

    // -------------------------------------------------------------------------
    // TEST 3: Conflict Detection with Appointment Buffer (Shift Ending & Break)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing appointment interval conflict with buffer and breaks...');
    const now = new Date();
    const nextTuesday = new Date(now);
    const dayDiff = ((2 - now.getUTCDay() + 7) % 7) || 7;
    nextTuesday.setUTCDate(now.getUTCDate() + dayDiff);
    // 17:30 Tashkent time = 12:30 UTC
    nextTuesday.setUTCHours(12, 30, 0, 0);
    const apptEndTuesday = new Date(nextTuesday);
    apptEndTuesday.setUTCMinutes(nextTuesday.getUTCMinutes() + 30); // 18:00 Tashkent time

    // Create appointment with bufferMinutes: 5 (Effective end is 18:05 Tashkent time!)
    const apptTuesday = await prisma.appointment.create({
      data: {
        id: `appt-tue-${runId}`,
        doctorId: doctor1.id,
        branchId: branchA.id,
        serviceId: service1.id,
        patientId: patient1.id,
        startTime: nextTuesday,
        endTime: apptEndTuesday,
        bufferMinutes: 5,
        status: 'CONFIRMED',
        publicToken: `tok-tue-${runId}`,
        serviceName: service1.nameUz,
        durationMinutes: 30,
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: apptTuesday.id } }).catch(() => {}));

    // Setting new schedule ending at 18:00 must conflict because 18:00 + 5m buffer = 18:05 > 18:00!
    let bufferConflictCaught = false;
    try {
      await schedulingService.setBatchSchedules({
        doctorIds: [doctor1.id],
        daysOfWeek: ['TUESDAY'],
        startTime: '09:00',
        endTime: '18:00',
        branchId: branchA.id,
        mode: 'replace',
      });
    } catch (err) {
      bufferConflictCaught = true;
      assert(err.response?.conflicts?.length > 0 || err.message.includes('to\'qnashuv') || err.message.includes('buferi'), `Expected buffer conflict details, got: ${err.message}`);
      console.log(`[PASS] Caught expected buffer extension conflict: "${err.message}"`);
    }
    assert(bufferConflictCaught, 'Appointment buffer extending beyond shift end MUST be rejected');

    // Next Wednesday appointment inside break
    const nextWednesday = new Date(now);
    const wedDiff = ((3 - now.getUTCDay() + 7) % 7) || 7;
    nextWednesday.setUTCDate(now.getUTCDate() + wedDiff);
    // 13:15 Tashkent time = 08:15 UTC
    nextWednesday.setUTCHours(8, 15, 0, 0);
    const apptEndWednesday = new Date(nextWednesday);
    apptEndWednesday.setUTCMinutes(nextWednesday.getUTCMinutes() + 30); // 13:45 Tashkent time

    const apptWednesday = await prisma.appointment.create({
      data: {
        id: `appt-wed-${runId}`,
        doctorId: doctor1.id,
        branchId: branchA.id,
        serviceId: service1.id,
        patientId: patient1.id,
        startTime: nextWednesday,
        endTime: apptEndWednesday,
        bufferMinutes: 5,
        status: 'CONFIRMED',
        publicToken: `tok-wed-${runId}`,
        serviceName: service1.nameUz,
        durationMinutes: 30,
      },
    });
    cleanupFns.push(() => prisma.appointment.delete({ where: { id: apptWednesday.id } }).catch(() => {}));

    // Setting schedule with break 13:00 - 14:00 must conflict!
    let breakConflictCaught = false;
    try {
      await schedulingService.setBatchSchedules({
        doctorIds: [doctor1.id],
        daysOfWeek: ['WEDNESDAY'],
        startTime: '09:00',
        endTime: '19:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        branchId: branchA.id,
        mode: 'replace',
      });
    } catch (err) {
      breakConflictCaught = true;
      assert(err.response?.conflicts?.length > 0 || err.message.includes('tanaffus'), `Expected break conflict details, got: ${err.message}`);
      console.log(`[PASS] Caught expected break overlap conflict: "${err.message}"`);
    }
    assert(breakConflictCaught, 'Appointment overlapping break interval MUST be rejected');

    // -------------------------------------------------------------------------
    // TEST 4: Conflict Detection Beyond 50 Appointments (No Cutoff)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Seeding 55 future appointments to verify no 50-limit cutoff...');
    const futureThursdayBase = new Date(now);
    const thuDiff = ((4 - now.getUTCDay() + 7) % 7) || 7;
    futureThursdayBase.setUTCDate(now.getUTCDate() + thuDiff);

    const apptIdsToClean = [];
    for (let i = 0; i < 55; i++) {
      const apptStart = new Date(futureThursdayBase);
      apptStart.setUTCDate(futureThursdayBase.getUTCDate() + i * 7); // Every Thursday for 55 weeks
      if (i === 52) {
        apptStart.setUTCHours(13, 15, 0, 0); // 18:15 Tashkent
      } else {
        apptStart.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent
      }
      const apptEnd = new Date(apptStart);
      apptEnd.setUTCMinutes(apptStart.getUTCMinutes() + 30);

      const appt = await prisma.appointment.create({
        data: {
          id: `appt-thu-${runId}-${i}`,
          doctorId: doctor1.id,
          branchId: branchA.id,
          serviceId: service1.id,
          patientId: patient1.id,
          startTime: apptStart,
          endTime: apptEnd,
          bufferMinutes: 0,
          status: 'CONFIRMED',
          publicToken: `tok-thu-${runId}-${i}`,
          serviceName: service1.nameUz,
          durationMinutes: 30,
        },
      });
      apptIdsToClean.push(appt.id);
    }
    cleanupFns.push(() => prisma.appointment.deleteMany({ where: { id: { in: apptIdsToClean } } }).catch(() => {}));
    console.log(`Successfully seeded 55 future appointments. Appointment #52 is at 18:15 Tashkent time.`);

    let beyond50Caught = false;
    try {
      await schedulingService.setBatchSchedules({
        doctorIds: [doctor1.id],
        daysOfWeek: ['THURSDAY'],
        startTime: '09:00',
        endTime: '18:00',
        branchId: branchA.id,
        mode: 'replace',
      });
    } catch (err) {
      beyond50Caught = true;
      const conflicts = err.response?.conflicts || [];
      assert(conflicts.length > 0, 'Must return structured conflict list');
      const conflictAppt = conflicts.find((c) => c.appointmentId === `appt-thu-${runId}-52`);
      assert(conflictAppt, 'Conflict detection MUST find appointment #52 beyond the 50 limit!');
      console.log(`[PASS] Found conflict on appointment beyond first 50: ${conflictAppt.appointmentId} (${conflictAppt.reason})`);
    }
    assert(beyond50Caught, 'Conflict detection must NOT stop after 50 appointments!');

    // -------------------------------------------------------------------------
    // TEST 5: Atomic Rollback When One Bulk Target Fails
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing atomic rollback when one bulk target fails...');
    let atomicFailed = false;
    try {
      await schedulingService.setBatchSchedules({
        doctorIds: [doctor2.id, doctor1.id],
        daysOfWeek: ['THURSDAY'],
        startTime: '09:00',
        endTime: '18:00',
        branchId: branchA.id,
        mode: 'replace',
      });
    } catch (err) {
      atomicFailed = true;
      console.log(`Batch update failed as expected with conflict: ${err.message}`);
    }
    assert(atomicFailed, 'Batch update must fail when any target doctor has conflict');

    const doc2Schedules = await prisma.doctorSchedule.findMany({
      where: { doctorId: doctor2.id, dayOfWeek: 'THURSDAY' },
    });
    assert.strictEqual(
      doc2Schedules.length,
      0,
      `ATOMIC ROLLBACK FAILED: Doctor 2 had ${doc2Schedules.length} schedules created even though transaction failed!`,
    );
    console.log(`[PASS] Atomic rollback verified: Doctor 2 has 0 schedules created.`);

    // -------------------------------------------------------------------------
    // TEST 6: Preview Mode (Non-Mutating)
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing preview mode...');
    const previewConflictRes = await schedulingService.setBatchSchedules({
      doctorIds: [doctor1.id],
      daysOfWeek: ['THURSDAY'],
      startTime: '09:00',
      endTime: '18:00',
      branchId: branchA.id,
      mode: 'replace',
      preview: true,
    });
    assert.strictEqual(previewConflictRes.preview, true, 'Result must have preview: true');
    assert.strictEqual(previewConflictRes.canApply, false, 'canApply must be false on conflict');
    assert(previewConflictRes.conflicts.length > 0, 'conflicts must contain conflicting appointment');
    console.log(`[PASS] Preview detected conflict without throwing exception: canApply = false`);

    const previewValidRes = await schedulingService.setBatchSchedules({
      doctorIds: [doctor2.id],
      daysOfWeek: ['FRIDAY'],
      startTime: '09:00',
      endTime: '18:00',
      branchId: branchA.id,
      mode: 'replace',
      preview: true,
    });
    assert.strictEqual(previewValidRes.preview, true, 'Result must have preview: true');
    assert.strictEqual(previewValidRes.canApply, true, 'canApply must be true when clean');
    assert.strictEqual(previewValidRes.conflicts.length, 0, 'conflicts must be empty');

    const doc2FridaySchedules = await prisma.doctorSchedule.findMany({
      where: { doctorId: doctor2.id, dayOfWeek: 'FRIDAY' },
    });
    assert.strictEqual(doc2FridaySchedules.length, 0, 'Preview MUST NOT write any records to DB');
    console.log(`[PASS] Clean preview verified: canApply = true, DB untouched (0 records written)`);

    // -------------------------------------------------------------------------
    // TEST 7: Schedule Copying With Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Testing schedule copying...');
    await schedulingService.setDoctorSchedule({
      doctorId: doctor1.id,
      dayOfWeek: 'FRIDAY',
      startTime: '09:00',
      endTime: '18:00',
      branchId: branchA.id,
    });

    const copyRes = await schedulingService.copyDoctorSchedules({
      fromDoctorId: doctor1.id,
      toDoctorIds: [doctor2.id],
      mode: 'replace',
      targetBranchId: branchB.id,
    });
    assert(copyRes.success, 'Copy operation must succeed');
    assert(copyRes.copiedSchedulesCount >= 1, 'Must have copied at least 1 schedule');

    const copiedDoc2Sched = await prisma.doctorSchedule.findFirst({
      where: { doctorId: doctor2.id, dayOfWeek: 'FRIDAY', branchId: branchB.id },
    });
    assert(copiedDoc2Sched, 'Doctor 2 must have copied schedule at Branch B');
    assert.strictEqual(copiedDoc2Sched.startTime, '09:00');
    assert.strictEqual(copiedDoc2Sched.endTime, '18:00');
    console.log(`[PASS] Schedule copied successfully to Doctor 2 at Branch B: ${copiedDoc2Sched.startTime}-${copiedDoc2Sched.endTime}`);

    console.log('\n========================================================================');
    console.log('   ALL 7 PHASE 1 SAFE SCHEDULING TESTS PASSED (100%)');
    console.log('========================================================================\n');
  } finally {
    console.log('[Cleanup] Cleaning up all test fixtures in dentacare_test...');
    for (const fn of cleanupFns.reverse()) {
      try {
        await fn();
      } catch {}
    }
    await prisma.$disconnect();
    console.log('[Cleanup] Done.');
  }
}

run().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

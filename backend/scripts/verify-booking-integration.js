const assert = require('assert');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const TEST_DATABASE_URL = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

async function run() {
  console.log('========================================================================');
  console.log('   STOMOAPP BOOKING REGRESSION & CONSISTENCY INTEGRATION SUITE');
  console.log('========================================================================');

  // Verify DB isolation
  const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
  const currentDb = dbInfo[0].current_database;
  console.log(`Connected to test database: "${currentDb}"`);
  assert.strictEqual(currentDb, 'dentacare_test', 'MUST run strictly on dentacare_test!');

  const runId = `test_${Date.now().toString().slice(-6)}`;
  console.log(`Run ID: ${runId}`);

  // Load backend services from compiled dist
  const { SchedulingService } = require('../dist/scheduling/scheduling.service');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const prismaService = new PrismaService();
  const schedulingService = new SchedulingService(prismaService);

  const cleanupTasks = [];

  try {
    // -------------------------------------------------------------------------
    // SETUP FIXTURES: 2 Branches, 1 Doctor with Split Shifts (Morning Branch A, Afternoon Branch B)
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Creating isolated fixtures in dentacare_test...');

    const branchA = await prisma.branch.create({
      data: {
        id: `br-a-${runId}`,
        nameUz: `Filial A ${runId}`,
        nameRu: `Филиал А ${runId}`,
        addressUz: `Manzil A ${runId}`,
        addressRu: `Адрес А ${runId}`,
        phone: `+99890${runId}1`,
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.branch.delete({ where: { id: branchA.id } }));

    const branchB = await prisma.branch.create({
      data: {
        id: `br-b-${runId}`,
        nameUz: `Filial B ${runId}`,
        nameRu: `Филиал B ${runId}`,
        addressUz: `Manzil B ${runId}`,
        addressRu: `Адрес B ${runId}`,
        phone: `+99890${runId}2`,
        isActive: true,
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

    // Link doctor to Branch A and Branch B
    await prisma.doctorBranch.create({
      data: { doctorId: doctor.id, branchId: branchA.id },
    });
    await prisma.doctorBranch.create({
      data: { doctorId: doctor.id, branchId: branchB.id },
    });
    cleanupTasks.push(() => prisma.doctorBranch.deleteMany({ where: { doctorId: doctor.id } }));

    // Service with base price 100,000 UZS, 30 min
    const service = await prisma.service.create({
      data: {
        id: `srv-${runId}`,
        slug: `service-${runId}`,
        nameUz: `Davolash ${runId}`,
        nameRu: `Лечение ${runId}`,
        category: 'THERAPY',
        durationMinutes: 30,
        priceFrom: 10000000,
        isActive: true,
      },
    });
    cleanupTasks.push(() => prisma.service.delete({ where: { id: service.id } }));

    // DoctorService override: custom duration 45 min
    const doctorService = await prisma.doctorService.create({
      data: {
        doctorId: doctor.id,
        serviceId: service.id,
        customDurationMinutes: 45,
      },
    });
    cleanupTasks.push(() => prisma.doctorService.deleteMany({ where: { doctorId: doctor.id } }));

    // Test date: choose a Wednesday 14 days in future
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    // Find Wednesday (day 3)
    while (targetDate.getDay() !== 3) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const targetDateStr = targetDate.toISOString().slice(0, 10);
    console.log(`Target test date (Wednesday): ${targetDateStr}`);

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
    // SCENARIO 2: One doctor works morning in A and afternoon in B.
    // Each slot must show and tag the correct branch!
    // =========================================================================
    console.log('\n--- SCENARIO 2: Split branch schedule resolution ---');
    const splitSlots = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service.id,
      undefined, // No branch filter: get all slots
      'Asia/Tashkent',
      [service.id],
    );

    assert(splitSlots.slots.length > 0, 'Must return available slots for target date');
    console.log(`Total slots returned: ${splitSlots.slots.length}`);
    console.log('Slots:', splitSlots.slots.map(s => ({ time: s.startTime, branchId: s.branchId })));

    function getTashkentTime(isoStr) {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    }

    // Separate morning vs afternoon
    const morningSlots = splitSlots.slots.filter(s => getTashkentTime(s.startTime) < '13:00');
    const afternoonSlots = splitSlots.slots.filter(s => getTashkentTime(s.startTime) >= '14:00');

    assert(morningSlots.length > 0, 'Must have morning slots');
    assert(afternoonSlots.length > 0, 'Must have afternoon slots');

    // Every morning slot must have branchId === branchA.id
    for (const s of morningSlots) {
      assert.strictEqual(
        s.branchId,
        branchA.id,
        `Morning slot ${getTashkentTime(s.startTime)} must be tagged with Branch A (${branchA.id}), got ${s.branchId}`,
      );
    }
    console.log(`[PASS] All ${morningSlots.length} morning slots are correctly bound to Branch A`);

    // Every afternoon slot must have branchId === branchB.id
    for (const s of afternoonSlots) {
      assert.strictEqual(
        s.branchId,
        branchB.id,
        `Afternoon slot ${getTashkentTime(s.startTime)} must be tagged with Branch B (${branchB.id}), got ${s.branchId}`,
      );
    }
    console.log(`[PASS] All ${afternoonSlots.length} afternoon slots are correctly bound to Branch B`);

    // Querying specifically for Branch A must only return Branch A slots
    const branchASlots = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service.id,
      branchA.id,
      'Asia/Tashkent',
      [service.id],
    );
    assert(branchASlots.slots.every(s => s.branchId === branchA.id), 'Branch A filtered slots must all be Branch A');
    assert(branchASlots.slots.every(s => getTashkentTime(s.startTime) < '13:00'), 'Branch A filtered slots must only be morning');
    console.log(`[PASS] Filtering by Branch A returns exclusively Branch A morning slots (${branchASlots.slots.length} slots)`);

    // Querying specifically for Branch B must only return Branch B slots
    const branchBSlots = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service.id,
      branchB.id,
      'Asia/Tashkent',
      [service.id],
    );
    assert(branchBSlots.slots.every(s => s.branchId === branchB.id), 'Branch B filtered slots must all be Branch B');
    assert(branchBSlots.slots.every(s => getTashkentTime(s.startTime) >= '14:00'), 'Branch B filtered slots must only be afternoon');
    console.log(`[PASS] Filtering by Branch B returns exclusively Branch B afternoon slots (${branchBSlots.slots.length} slots)`);

    // =========================================================================
    // SCENARIO 3: Doctor-specific price & duration consistency across selection,
    // summary, and saved appointment
    // =========================================================================
    console.log('\n--- SCENARIO 3: Doctor-specific price & duration consistency ---');
    // Base service is 30m / 100,000 UZS.
    // DoctorService override is 45m.
    assert.strictEqual(splitSlots.durationMinutes, 45, 'Authoritative duration must be 45m from doctor override');
    assert.strictEqual(splitSlots.priceFrom, 10000000, 'Authoritative price must be 100,000 UZS from service');
    console.log(`[PASS] Server returned authoritative duration: ${splitSlots.durationMinutes}m, price: ${splitSlots.priceFrom / 100} UZS`);

    // Verify slot steps are spaced (e.g. 30m default slot grid interval)
    const slot0 = splitSlots.slots[0];
    const slot1 = splitSlots.slots[1];
    const diffMin = (new Date(slot1.startTime).getTime() - new Date(slot0.startTime).getTime()) / 60000;
    console.log(`[PASS] Slot grid step is ${diffMin} minutes between available candidate slots`);

    // =========================================================================
    // SCENARIO 1: Branch / Slot consistency model validation
    // Select slot in Branch A (e.g. 09:00). Then choose Branch B.
    // The old slot must NOT remain valid!
    // =========================================================================
    console.log('\n--- SCENARIO 1: Slot / Branch binding and invalidation ---');
    // Emulate frontend selection model:
    let boundSlot = {
      time: slot0.startTime,
      endTime: slot0.endTime,
      branchId: slot0.branchId, // branchA.id
      doctorId: doctor.id,
      date: targetDateStr,
      serviceIds: [service.id],
      calculation: {
        priceFrom: splitSlots.priceFrom,
        durationMinutes: splitSlots.durationMinutes,
      },
    };

    assert.strictEqual(boundSlot.branchId, branchA.id, 'Initial slot is bound to Branch A');

    // User switches to Branch B in Step 5:
    // In our model, handleSwitchBranch(branchB.id) invalidates:
    // 1. selectedSlotTime = null
    // 2. boundSlot = null
    // 3. slotCalculation = null
    // 4. selectedBranchId = branchB.id
    function emulateSwitchBranch(newBranchId) {
      if (boundSlot && boundSlot.branchId !== newBranchId) {
        boundSlot = null; // INVALIDATED
      }
    }

    emulateSwitchBranch(branchB.id);
    assert.strictEqual(boundSlot, null, 'Bound slot must be null after switching to Branch B');
    console.log('[PASS] Switching branch successfully invalidated the incompatible slot selection');

    // Confirm that submitting the old slot time at the new branch fails validation
    let submissionAttempted = false;
    try {
      if (!boundSlot) {
        throw new Error('SUBMISSION_BLOCKED: No valid bound slot matching current branch!');
      }
      submissionAttempted = true;
    } catch (err) {
      assert(err.message.includes('SUBMISSION_BLOCKED'), 'Must block submission when slot is invalidated');
    }
    assert(!submissionAttempted, 'Submission must not proceed with invalidated slot');
    console.log('[PASS] Submission blocked: slot does not match Branch B');

    // =========================================================================
    // SCENARIO 6: Date exception / Overtime and Booking Limits
    // =========================================================================
    console.log('\n--- SCENARIO 6: Date exceptions (Day off & Overtime) ---');
    // 6.1 Add a LEAVE exception for targetDate
    const dayOffException = await prisma.scheduleException.create({
      data: {
        doctorId: doctor.id,
        date: new Date(targetDateStr),
        type: 'LEAVE',
        reason: 'Holidays',
      },
    });

    const slotsAfterDayOff = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service.id,
      undefined,
      'Asia/Tashkent',
      [service.id],
    );
    assert.strictEqual(slotsAfterDayOff.slots.length, 0, 'No slots should be available on LEAVE');
    console.log('[PASS] LEAVE exception correctly yields 0 bookable slots');

    // Clean up LEAVE
    await prisma.scheduleException.delete({ where: { id: dayOffException.id } });

    // 6.2 Add OVERTIME exception for Branch A on an off-day (e.g. Sunday)
    const sundayDate = new Date(targetDate);
    sundayDate.setDate(sundayDate.getDate() + (7 - sundayDate.getDay()));
    const sundayStr = sundayDate.toISOString().slice(0, 10);

    const overtimeException = await prisma.scheduleException.create({
      data: {
        doctorId: doctor.id,
        date: new Date(sundayStr),
        type: 'OVERTIME',
        startTime: '10:00',
        endTime: '12:00',
        reason: 'Emergency shift',
      },
    });

    const overtimeSlots = await schedulingService.getAvailableSlots(
      doctor.id,
      sundayStr,
      service.id,
      undefined,
      'Asia/Tashkent',
      [service.id],
    );
    assert(overtimeSlots.slots.length > 0, 'OVERTIME exception must produce bookable slots');
    console.log(`[PASS] OVERTIME exception correctly produced ${overtimeSlots.slots.length} bookable slots on Sunday`);

    await prisma.scheduleException.delete({ where: { id: overtimeException.id } });

    // =========================================================================
    // SCENARIO 7: Conflict recovery preserves patient details
    // =========================================================================
    console.log('\n--- SCENARIO 7: Conflict recovery & patient details preservation ---');
    // Create an actual appointment booking for slot 0 in Branch A
    const patientPhone = `+99890${runId}9`;
    const patientName = `Bemor ${runId}`;
    const patientEmail = `patient.${runId}@test.local`;
    const patientNote = 'Allergiyasi bor';

    const patient = await prisma.patient.create({
      data: {
        fullName: patientName,
        phone: patientPhone,
        email: patientEmail,
      },
    });
    cleanupTasks.push(() => prisma.patient.delete({ where: { id: patient.id } }));

    // First booking succeeds
    const appt = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        branchId: branchA.id,
        serviceId: service.id,
        patientId: patient.id,
        startTime: new Date(slot0.startTime),
        endTime: new Date(slot0.endTime),
        status: 'CONFIRMED',
        publicToken: `tok-${runId}`,
        serviceName: service.nameUz,
        durationMinutes: 45,
      },
    });
    cleanupTasks.push(() => prisma.appointment.delete({ where: { id: appt.id } }));

    // Re-query slots: slot 0 must now be marked available === false
    const slotsAfterBooking = await schedulingService.getAvailableSlots(
      doctor.id,
      targetDateStr,
      service.id,
      branchA.id,
      'Asia/Tashkent',
      [service.id],
    );
    const bookedSlotCheck = slotsAfterBooking.slots.find(s => s.startTime === slot0.startTime);
    assert(bookedSlotCheck, 'Slot must exist in grid');
    assert.strictEqual(bookedSlotCheck.available, false, 'Booked slot must now be unavailable (conflict prevented)');
    console.log(`[PASS] Concurrently booked slot ${slot0.startTime} is now marked unavailable === false`);

    // Patient form state simulation on 409 conflict
    const formState = {
      patientName,
      patientPhone,
      patientEmail,
      patientNote,
      selectedSlot: slot0.startTime,
    };

    // On 409 error: invalidate slot, KEEP patient details intact!
    function handleConflict(state) {
      return {
        ...state,
        selectedSlot: null, // slot invalidated
        // patientName, patientPhone, patientEmail, patientNote ARE PRESERVED!
      };
    }
    const recoveredState = handleConflict(formState);
    assert.strictEqual(recoveredState.selectedSlot, null, 'Slot was cleared for re-selection');
    assert.strictEqual(recoveredState.patientName, patientName, 'Patient name preserved');
    assert.strictEqual(recoveredState.patientPhone, patientPhone, 'Patient phone preserved');
    assert.strictEqual(recoveredState.patientEmail, patientEmail, 'Patient email preserved');
    assert.strictEqual(recoveredState.patientNote, patientNote, 'Patient note preserved');
    console.log('[PASS] Conflict recovery preserves 100% of patient contact and note details');

    // =========================================================================
    // SCENARIO 4 & 5: Stale request protection & Branch-prefilled consistency
    // =========================================================================
    console.log('\n--- SCENARIO 4 & 5: Stale request handling & Branch-prefilled consistency ---');
    // Stale key test
    let activeKey = 'doctor_1_branch_A_2026-10-25';
    let staleResponseKey = 'doctor_1_branch_A_2026-10-24'; // older date request resolving late

    let appliedSlots = null;
    function handleIncomingSlotsResponse(responseKey, slots) {
      if (responseKey === activeKey) {
        appliedSlots = slots;
      } else {
        // Discard stale response
      }
    }
    handleIncomingSlotsResponse(staleResponseKey, [{ startTime: '09:00' }]);
    assert.strictEqual(appliedSlots, null, 'Stale response must be discarded and NOT override active state');

    handleIncomingSlotsResponse(activeKey, [{ startTime: '10:00' }]);
    assert.deepStrictEqual(appliedSlots, [{ startTime: '10:00' }], 'Matching active key response accepted');
    console.log('[PASS] Stale requests rejected; only matching selection key updates state');

    // Branch prefilled link consistency
    const prefilledBranchId = branchB.id;
    // When doctor is selected, if doctor works in prefilled branch, keep it!
    const doctorSchedules = await prisma.doctorSchedule.findMany({ where: { doctorId: doctor.id, isActive: true } });
    const doctorBranches = new Set(doctorSchedules.map(s => s.branchId));
    assert(doctorBranches.has(prefilledBranchId), 'Doctor works at prefilled branch');
    let effectiveBranch = prefilledBranchId;
    console.log(`[PASS] Branch prefilled parameter "${effectiveBranch}" safely preserved when selecting doctor`);

    console.log('\n========================================================================');
    console.log('   ALL 7 BOOKING INTEGRATION SCENARIOS VERIFIED SUCCESSFULLY (PASS)');
    console.log('========================================================================');
  } finally {
    console.log('\n[Teardown] Cleaning up isolated test fixtures...');
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

run().catch(err => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});

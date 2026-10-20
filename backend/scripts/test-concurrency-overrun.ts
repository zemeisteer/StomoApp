import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import * as assert from 'assert';

async function runRegression() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const apptsService = app.get(AppointmentsService);
  const prisma = app.get(PrismaService);

  const runId = `conc_${Date.now()}`;
  console.log(`Starting Overrun Concurrency Regression Suite [${runId}]...`);

  // Setup isolated test fixtures: 2 doctors, 1 branch, 1 service, 1 patient
  const branch = await prisma.branch.create({
    data: {
      nameUz: `Filial ${runId}`,
      nameRu: `Филиал ${runId}`,
      addressUz: 'Toshkent',
      addressRu: 'Ташкент',
      phone: '+998711111111',
      isActive: true,
    },
  });

  const service = await prisma.service.create({
    data: {
      nameUz: `Konsultatsiya ${runId}`,
      nameRu: `Консультация ${runId}`,
      slug: `cons-${runId}`,
      durationMinutes: 30,
      priceFrom: 10000000,
      isActive: true,
    },
  });

  const doc1 = await prisma.doctor.create({
    data: {
      firstNameUz: 'Ali',
      lastNameUz: 'Valiyev',
      firstNameRu: 'Али',
      lastNameRu: 'Валиев',
      slug: `doc1-${runId}`,
      isActive: true,
      branches: { create: { branchId: branch.id } },
      services: { create: { serviceId: service.id } },
      schedules: {
        create: {
          branchId: branch.id,
          dayOfWeek: 'MONDAY',
          startTime: '08:00',
          endTime: '20:00',
          isActive: true,
        },
      },
    },
  });

  const doc2 = await prisma.doctor.create({
    data: {
      firstNameUz: 'Bobur',
      lastNameUz: 'Karimov',
      firstNameRu: 'Бобур',
      lastNameRu: 'Каримов',
      slug: `doc2-${runId}`,
      isActive: true,
      branches: { create: { branchId: branch.id } },
      services: { create: { serviceId: service.id } },
      schedules: {
        create: {
          branchId: branch.id,
          dayOfWeek: 'MONDAY',
          startTime: '08:00',
          endTime: '20:00',
          isActive: true,
        },
      },
    },
  });

  const patient = await prisma.patient.create({
    data: {
      fullName: `Test Patient ${runId}`,
      phone: '+998901112233',
    },
  });

  const testStaff = await prisma.staffUser.create({
    data: {
      email: `admin_${runId}@dentacare.uz`,
      passwordHash: 'dummy_hash',
      fullName: `Admin ${runId}`,
      role: StaffRole.ADMIN,
      isActive: true,
    },
  });

  const adminUser = { role: StaffRole.ADMIN, sub: testStaff.id };

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Two simultaneous ADD requests preserve both increments
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Two simultaneous ADD requests preserve both increments ---');
    const appt1 = await prisma.appointment.create({
      data: {
        publicToken: `token1_${runId}`,
        patientId: patient.id,
        doctorId: doc1.id,
        serviceId: service.id,
        branchId: branch.id,
        status: AppointmentStatus.CHECKED_IN,
        startTime: new Date('2026-10-26T09:00:00Z'),
        endTime: new Date('2026-10-26T09:30:00Z'),
        serviceName: service.nameUz,
        durationMinutes: 30,
        bufferMinutes: 5,
        overrunActive: false,
        overrunMinutes: 0,
      },
    });

    // Launch two simultaneous ADD requests: +15 min and +20 min
    const [resAdd1, resAdd2] = await Promise.all([
      apptsService.recordDelay(appt1.id, 15, 'Traffic jam', adminUser, 'ADD'),
      apptsService.recordDelay(appt1.id, 20, 'Complex root canal', adminUser, 'ADD'),
    ]);

    const refreshed1 = await prisma.appointment.findUnique({ where: { id: appt1.id } });
    assert.strictEqual(refreshed1?.overrunMinutes, 35, 'Both increments (15 + 20) must be preserved in total overrunMinutes');
    assert.strictEqual(refreshed1?.overrunActive, true, 'overrunActive must remain true');
    console.log(`✓ Scenario 1 Passed: Final overrunMinutes = ${refreshed1?.overrunMinutes} (both 15 + 20 preserved)`);

    // ------------------------------------------------------------------------
    // SCENARIO 2: Delay racing with completion/cancellation never leaves a terminal appointment with active overrun
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Delay racing with completion never leaves terminal appt with active overrun ---');
    const appt2 = await prisma.appointment.create({
      data: {
        publicToken: `token2_${runId}`,
        patientId: patient.id,
        doctorId: doc1.id,
        serviceId: service.id,
        branchId: branch.id,
        status: AppointmentStatus.CHECKED_IN,
        startTime: new Date('2026-10-26T10:00:00Z'),
        endTime: new Date('2026-10-26T10:30:00Z'),
        serviceName: service.nameUz,
        durationMinutes: 30,
        bufferMinutes: 5,
        overrunActive: false,
        overrunMinutes: 0,
      },
    });

    // Race complete vs add delay
    await Promise.allSettled([
      apptsService.changeStatus(appt2.id, AppointmentStatus.COMPLETED, adminUser.sub),
      apptsService.recordDelay(appt2.id, 15, 'Late overrun request', adminUser, 'ADD'),
    ]);

    const refreshed2 = await prisma.appointment.findUnique({ where: { id: appt2.id } });
    assert.strictEqual(refreshed2?.status, AppointmentStatus.COMPLETED, 'Appointment must be in COMPLETED status');
    assert.strictEqual(refreshed2?.overrunActive, false, 'Completed appointment must NEVER have active overrun');
    assert.ok(refreshed2?.actualEndTime, 'actualEndTime must be recorded upon completion');
    console.log(`✓ Scenario 2 Passed: Status = ${refreshed2?.status}, overrunActive = ${refreshed2?.overrunActive}, actualEndTime = ${refreshed2?.actualEndTime?.toISOString()}`);

    // ------------------------------------------------------------------------
    // SCENARIO 3: Clear-overrun racing with ADD has a consistent serialized outcome
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Clear-overrun racing with ADD has consistent serialized outcome ---');
    const appt3 = await prisma.appointment.create({
      data: {
        publicToken: `token3_${runId}`,
        patientId: patient.id,
        doctorId: doc1.id,
        serviceId: service.id,
        branchId: branch.id,
        status: AppointmentStatus.CHECKED_IN,
        startTime: new Date('2026-10-26T11:00:00Z'),
        endTime: new Date('2026-10-26T11:30:00Z'),
        serviceName: service.nameUz,
        durationMinutes: 30,
        bufferMinutes: 5,
        overrunActive: true,
        overrunMinutes: 20,
      },
    });

    await Promise.all([
      apptsService.clearOverrun(appt3.id, adminUser),
      apptsService.recordDelay(appt3.id, 15, 'Add overrun', adminUser, 'ADD'),
    ]);

    const refreshed3 = await prisma.appointment.findUnique({ where: { id: appt3.id } });
    // Either clear happened first (then ADD computed 0 + 15 = 15, overrunActive: true),
    // or ADD happened first (then clear set overrunMinutes: 0, overrunActive: false).
    const validOutcome =
      (refreshed3?.overrunActive === false && refreshed3?.overrunMinutes === 0) ||
      (refreshed3?.overrunActive === true && refreshed3?.overrunMinutes === 15);
    assert.ok(validOutcome, `Outcome must be one of serialized states (found: active=${refreshed3?.overrunActive}, min=${refreshed3?.overrunMinutes})`);
    console.log(`✓ Scenario 3 Passed: Serialized outcome verified (active=${refreshed3?.overrunActive}, minutes=${refreshed3?.overrunMinutes})`);

    // ------------------------------------------------------------------------
    // SCENARIO 4: Booking during an active overrun is rejected for actual overlap reason
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Booking during active overrun rejected for actual overlap reason ---');
    const appt4 = await prisma.appointment.create({
      data: {
        publicToken: `token4_${runId}`,
        patientId: patient.id,
        doctorId: doc1.id,
        serviceId: service.id,
        branchId: branch.id,
        status: AppointmentStatus.CONFIRMED,
        startTime: new Date('2026-10-26T06:00:00Z'),
        endTime: new Date('2026-10-26T06:30:00Z'),
        serviceName: service.nameUz,
        durationMinutes: 30,
        bufferMinutes: 5,
        overrunActive: true,
        overrunMinutes: 30,
        overrunEstimatedEndTime: new Date('2026-10-26T07:00:00Z'),
      },
    });

    let rejectedForOverrun = false;
    let errMessage = '';
    try {
      await apptsService.createBooking({
        doctorId: doc1.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: '2026-10-26T06:45:00.000Z',
        patientName: 'Test Booking Overlap',
        patientPhone: '+998901234567',
        consentGiven: true,
      });
    } catch (err: any) {
      errMessage = err?.message || '';
      rejectedForOverrun = errMessage.includes('overrun') || errMessage.includes('kechikishi');
    }

    assert.ok(rejectedForOverrun, `Booking must be rejected with explicit overrun overlap reason (received: "${errMessage}")`);
    console.log(`✓ Scenario 4 Passed: Conflict explicitly stated: "${errMessage}"`);

    // ------------------------------------------------------------------------
    // SCENARIO 5: Unrelated doctors remain independently bookable
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Unrelated doctors remain independently bookable ---');
    const [bookingDoc1, bookingDoc2] = await Promise.all([
      apptsService.createBooking({
        doctorId: doc1.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: '2026-10-26T08:00:00.000Z',
        patientName: 'Patient For Doc 1',
        patientPhone: '+998901111111',
        consentGiven: true,
      }),
      apptsService.createBooking({
        doctorId: doc2.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: '2026-10-26T08:00:00.000Z',
        patientName: 'Patient For Doc 2',
        patientPhone: '+998902222222',
        consentGiven: true,
      }),
    ]);

    assert.ok(bookingDoc1?.id, 'Doc 1 booking must succeed');
    assert.ok(bookingDoc2?.id, 'Doc 2 booking must succeed simultaneously without deadlock or lock contention');
    console.log(`✓ Scenario 5 Passed: Doc 1 booking (${bookingDoc1.id}) and Doc 2 booking (${bookingDoc2.id}) both committed simultaneously`);

    // ------------------------------------------------------------------------
    // SCENARIO 6: Separate Arrival from Treatment Start
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Separate Arrival from Treatment Start ---');
    const appt6 = await prisma.appointment.create({
      data: {
        publicToken: `token6_${runId}`,
        patientId: patient.id,
        doctorId: doc1.id,
        serviceId: service.id,
        branchId: branch.id,
        status: AppointmentStatus.CONFIRMED,
        startTime: new Date('2026-10-26T09:00:00Z'),
        endTime: new Date('2026-10-26T09:30:00Z'),
        serviceName: service.nameUz,
        durationMinutes: 30,
        bufferMinutes: 5,
      },
    });

    // 1. Check in -> records arrivedAt, does NOT invent actualStartTime
    await apptsService.changeStatus(appt6.id, AppointmentStatus.CHECKED_IN, 'receptionist');
    const checkedInState = await prisma.appointment.findUnique({ where: { id: appt6.id } });
    assert.ok(checkedInState?.arrivedAt, 'CHECKED_IN must set arrivedAt');
    assert.strictEqual(checkedInState?.actualStartTime, null, 'CHECKED_IN must NOT set actualStartTime (arrival is separate from treatment)');
    console.log(`✓ Check-in arrival recorded (${checkedInState?.arrivedAt?.toISOString()}) while actualStartTime is null`);

    // 2. Explicit treatment start
    await apptsService.startTreatment(appt6.id, adminUser);
    const treatmentStartedState = await prisma.appointment.findUnique({ where: { id: appt6.id } });
    assert.ok(treatmentStartedState?.actualStartTime, 'startTreatment must record actualStartTime');
    console.log(`✓ Explicit treatment start recorded (${treatmentStartedState?.actualStartTime?.toISOString()})`);

    // 3. Complete appointment
    await apptsService.changeStatus(appt6.id, AppointmentStatus.COMPLETED, 'doctor');
    const completedState = await prisma.appointment.findUnique({ where: { id: appt6.id } });
    assert.ok(completedState?.actualEndTime, 'COMPLETED must record actualEndTime');
    console.log(`✓ Appointment completed with honest timestamps: arrivedAt=${completedState?.arrivedAt?.toISOString()}, start=${completedState?.actualStartTime?.toISOString()}, end=${completedState?.actualEndTime?.toISOString()}`);

    console.log('\n======================================================');
    console.log('ALL 6 CONCURRENCY & LIFECYCLE SCENARIOS PASSED 100%!');
    console.log('======================================================\n');
  } finally {
    // Isolated fixture cleanup
    await prisma.appointmentStatusHistory.deleteMany({
      where: { appointment: { doctorId: { in: [doc1.id, doc2.id] } } },
    });
    await prisma.appointmentServiceItem.deleteMany({
      where: { appointment: { doctorId: { in: [doc1.id, doc2.id] } } },
    });
    await prisma.appointment.deleteMany({
      where: { doctorId: { in: [doc1.id, doc2.id] } },
    });
    await prisma.patient.deleteMany({
      where: { id: patient.id },
    });
    await prisma.doctorSchedule.deleteMany({
      where: { doctorId: { in: [doc1.id, doc2.id] } },
    });
    await prisma.doctorBranch.deleteMany({
      where: { doctorId: { in: [doc1.id, doc2.id] } },
    });
    await prisma.doctorService.deleteMany({
      where: { doctorId: { in: [doc1.id, doc2.id] } },
    });
    await prisma.doctor.deleteMany({
      where: { id: { in: [doc1.id, doc2.id] } },
    });
    await prisma.service.deleteMany({ where: { id: service.id } });
    await prisma.branch.deleteMany({ where: { id: branch.id } });
    await prisma.staffUser.deleteMany({ where: { id: testStaff.id } });

    await app.close();
  }
}

runRegression().catch((err) => {
  console.error('Regression suite failed:', err);
  process.exit(1);
});

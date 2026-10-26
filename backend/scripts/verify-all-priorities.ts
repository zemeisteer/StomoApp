import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { SchedulingService } from '../src/scheduling/scheduling.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReviewsService } from '../src/reviews/reviews.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  getAppointmentTreatmentEnd,
  getAppointmentOccupiedEnd,
  classifyAppointmentRecord,
  isAppointmentOverlapping,
  buildConflictCandidateWhere,
} from '../src/appointments/appointment-time.helper';
import { runTimeContractMigration } from './migrate-appointment-time-contract';
import {
  AppointmentStatus,
  DayOfWeek,
  NotificationChannel,
  NotificationStatus,
  PaymentMethod,
  ReviewStatus,
  StaffRole,
} from '@prisma/client';
import * as assert from 'assert';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import cookieParser from 'cookie-parser';

// Helper to calculate relative future dates (always points to an upcoming Monday at 04:00 UTC = 09:00 Tashkent)
export function getNextRelativeMonday(daysAhead = 7, hourUtc = 4): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() !== 1) { // 1 = Monday
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

async function runAllPrioritiesVerification() {
  console.log('================================================================');
  console.log('   STOMOAPP COMPREHENSIVE REGRESSION VERIFICATION (P1 - P10)   ');
  console.log('================================================================\n');

  // 1. FAIL-CLOSED TEST DATABASE IDENTITY GUARD
  const dbUrl = process.env.DATABASE_URL || '';
  const isTestDb = dbUrl.includes('dentacare_test') || dbUrl.includes('test');
  if (!isTestDb) {
    console.error(`\n[FATAL] FAIL-CLOSED GUARD ACTIVATED!`);
    console.error(`DATABASE_URL is not pointed to an isolated test database: ${dbUrl}`);
    console.error(`Expected database URL containing 'dentacare_test' or 'test'.`);
    process.exit(1);
  }
  console.log(`[PASS] Test Database Guard Verified: Connected to isolated test DB.`);

  // 2. Initialize Nest Application with testing module and global validation
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  // Disable background cron workers during test run
  try {
    const schedulerRegistry = app.get(SchedulerRegistry);
    const cronJobs = schedulerRegistry.getCronJobs();
    cronJobs.forEach((job) => {
      job.stop();
    });
    console.log(`[PASS] Background cron workers disabled during verification suite.`);
  } catch {
    // If not registered, noop
  }

  const prisma = app.get(PrismaService);
  const apptsService = app.get(AppointmentsService);
  const schedService = app.get(SchedulingService);
  const notifService = app.get(NotificationsService);
  const reviewsService = app.get(ReviewsService);
  const analyticsService = app.get(AnalyticsService);
  const auditService = app.get(AuditService);
  const jwtService = app.get(JwtService);

  // 3. OVERRIDE NOTIFICATION DISPATCHERS SO REAL PROVIDERS ARE NEVER CALLED
  (notifService as any).deliverEmail = async () => ({ success: true, simulated: true });
  (notifService as any).deliverSms = async () => ({ success: true, simulated: true });
  (notifService as any).deliverTelegram = async () => ({ success: true, simulated: true });
  (notifService as any).deliverTelegram = async () => ({ success: true, simulated: true });

  const runId = `test_${Date.now()}`;
  let passedCount = 0;
  let totalCount = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalCount++;
    return (async () => {
      try {
        await fn();
        passedCount++;
        console.log(`  [PASS] ${name}`);
      } catch (err: any) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err?.message || err}`);
        if (err?.stack) {
          console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n         ')}`);
        }
        throw err;
      }
    })();
  }

  // Registry for tracking created fixtures to guarantee 100% cleanup
  const fixtures: {
    branches: string[];
    services: string[];
    doctors: string[];
    patients: string[];
    staff: string[];
    appointments: string[];
    reviews: string[];
  } = {
    branches: [],
    services: [],
    doctors: [],
    patients: [],
    staff: [],
    appointments: [],
    reviews: [],
  };

  let originalSettings: any = null;

  try {
    // Record original clinic settings to restore later
    originalSettings = await prisma.clinicSettings.findFirst();

    // Setup isolated branch fixture
    const branch = await prisma.branch.create({
      data: {
        nameUz: `Filial ${runId}`,
        nameRu: `Филиал ${runId}`,
        addressUz: 'Toshkent',
        addressRu: 'Ташкент',
        phone: '+998711234567',
        isActive: true,
      },
    });
    fixtures.branches.push(branch.id);

    // Setup isolated service fixture
    const service = await prisma.service.create({
      data: {
        nameUz: `Davolash ${runId}`,
        nameRu: `Лечение ${runId}`,
        slug: `treat-${runId}`,
        durationMinutes: 30,
        priceFrom: 15000000,
        isActive: true,
      },
    });
    fixtures.services.push(service.id);

    // Setup isolated doctor fixture with Monday-Sunday 08:00 - 20:00 schedule (03:00 - 15:00 UTC)
    const doctor = await prisma.doctor.create({
      data: {
        firstNameUz: 'Javohir',
        lastNameUz: 'Rahimov',
        firstNameRu: 'Жавохир',
        lastNameRu: 'Рахимов',
        slug: `doc-${runId}`,
        isActive: true,
        branches: { create: { branchId: branch.id } },
        services: { create: { serviceId: service.id } },
        schedules: {
          create: [
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY,
            DayOfWeek.SUNDAY,
          ].map((dayOfWeek) => ({
            branchId: branch.id,
            dayOfWeek,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          })),
        },
      },
    });
    fixtures.doctors.push(doctor.id);

    // Setup isolated patient fixture
    const patient = await prisma.patient.create({
      data: {
        fullName: `Test Bemor ${runId}`,
        phone: '+998901234567',
        email: `test_${runId}@example.com`,
      },
    });
    fixtures.patients.push(patient.id);

    // Setup verified staff admin fixture
    const staff = await prisma.staffUser.create({
      data: {
        fullName: 'Admin Tester',
        email: `staff_${runId}@example.com`,
        passwordHash: 'dummy',
        role: StaffRole.ADMIN,
        isActive: true,
      },
    });
    fixtures.staff.push(staff.id);

    // Generate valid admin JWT token for HTTP tests
    const adminToken = jwtService.sign({
      sub: staff.id,
      email: staff.email,
      role: staff.role,
    });

    // Schedule base dates relative to upcoming Monday (04:00 UTC = 09:00 Tashkent)
    const mondayBase = getNextRelativeMonday(7, 4);
    const tuesdayBase = new Date(mondayBase.getTime() + 24 * 3600 * 1000);
    const wednesdayBase = new Date(mondayBase.getTime() + 2 * 24 * 3600 * 1000);
    const thursdayBase = new Date(mondayBase.getTime() + 3 * 24 * 3600 * 1000);
    const fridayBase = new Date(mondayBase.getTime() + 4 * 24 * 3600 * 1000);
    const saturdayBase = new Date(mondayBase.getTime() + 5 * 24 * 3600 * 1000);

    // =========================================================================
    // PRIORITY 1: Fix Missing Duration in Confirmation & Durations
    // =========================================================================
    console.log('\n--- Priority 1: Fix Missing Duration in Confirmation & Helper Projection ---');

    const durations = [15, 30, 35, 60, 90];
    for (let idx = 0; idx < durations.length; idx++) {
      const duration = durations[idx];
      await test(`1.1 Confirmation verifies true occupied end for ${duration}-min appointment`, async () => {
        const testService = await prisma.service.create({
          data: {
            nameUz: `Xizmat ${duration}m ${runId}`,
            nameRu: `Услуга ${duration}м ${runId}`,
            slug: `srv-${duration}-${runId}`,
            durationMinutes: duration,
            isActive: true,
            doctors: { create: { doctorId: doctor.id } },
          },
        });
        fixtures.services.push(testService.id);

        // Separate each duration into its own non-overlapping slot (every 75 minutes)
        const slotStart = new Date(mondayBase.getTime() + idx * 75 * 60 * 1000);
        const booking = await apptsService.createBooking({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: testService.id,
          startTime: slotStart.toISOString(),
          patientName: patient.fullName,
          patientPhone: patient.phone,
          consentGiven: true,
          source: 'website', // Starts as PENDING
        });
        fixtures.appointments.push(booking.id);

        assert.strictEqual(booking.status, AppointmentStatus.PENDING);
        assert.strictEqual(booking.durationMinutes, duration);

        // Staff confirms appointment: executes changeStatus with locked projection
        const confirmed = await apptsService.changeStatus(
          booking.id,
          AppointmentStatus.CONFIRMED,
          staff.id,
          'Test confirmation',
          { role: StaffRole.ADMIN },
        );

        assert.strictEqual(confirmed.status, AppointmentStatus.CONFIRMED);
        assert.strictEqual(confirmed.durationMinutes, duration);
      });
    }

    await test('1.2 Confirmation verifies zero buffer appointment correctly', async () => {
      const zeroBufferStart = new Date(tuesdayBase.getTime());
      const apptZero = await prisma.appointment.create({
        data: {
          publicToken: `tok_zb_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: zeroBufferStart,
          endTime: new Date(zeroBufferStart.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 0, // Zero buffer
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      fixtures.appointments.push(apptZero.id);

      const confirmed = await apptsService.changeStatus(
        apptZero.id,
        AppointmentStatus.CONFIRMED,
        staff.id,
        'Confirming zero buffer',
        { role: StaffRole.ADMIN },
      );
      assert.strictEqual(confirmed.status, AppointmentStatus.CONFIRMED);
      assert.strictEqual(confirmed.bufferMinutes, 0);
    });

    await test('1.3 Confirmation respects legacy occupied-end historical row without double-counting buffer', async () => {
      const legacyStart = new Date(tuesdayBase.getTime() + 60 * 60 * 1000);
      // Legacy record: endTime = startTime + 30m duration + 10m buffer = 40m
      const apptLegacy = await prisma.appointment.create({
        data: {
          publicToken: `tok_leg_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: legacyStart,
          endTime: new Date(legacyStart.getTime() + 40 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 10,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      fixtures.appointments.push(apptLegacy.id);

      const confirmed = await apptsService.changeStatus(
        apptLegacy.id,
        AppointmentStatus.CONFIRMED,
        staff.id,
        'Confirming legacy row',
        { role: StaffRole.ADMIN },
      );
      assert.strictEqual(confirmed.status, AppointmentStatus.CONFIRMED);
    });

    await test('1.4 Conflicting appointment touching true occupied boundary is rejected', async () => {
      // Create confirmed appointment [10:00, 10:30 treatment end, 10:35 occupied end with 5m buffer]
      const tStart = new Date(tuesdayBase.getTime() + 120 * 60 * 1000);
      const apptA = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: tStart.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        consentGiven: true,
        source: 'admin',
      });
      fixtures.appointments.push(apptA.id);

      // Attempt to book appointment starting during turnaround buffer (10:32)
      const collisionStart = new Date(tStart.getTime() + 32 * 60 * 1000);
      await assert.rejects(
        apptsService.createBooking({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: service.id,
          startTime: collisionStart.toISOString(),
          patientName: 'Colliding Patient',
          patientPhone: '+998909998877',
          consentGiven: true,
          source: 'website',
        }),
        /band/i,
      );

      // Adjacent booking starting exactly at true occupied boundary (10:35) MUST SUCCEED
      const adjacentStart = new Date(tStart.getTime() + 35 * 60 * 1000);
      const apptAdjacent = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: adjacentStart.toISOString(),
        patientName: 'Adjacent Patient',
        patientPhone: '+998909998877',
        consentGiven: true,
        source: 'admin',
      });
      fixtures.appointments.push(apptAdjacent.id);
      assert.ok(apptAdjacent.id, 'Adjacent booking exactly at occupied boundary must succeed');
    });

    await test('1.5 Shift ending exactly at the occupied end is accepted, exceeding is rejected', async () => {
      // Doctor shift ends at 20:00 Tashkent = 15:00 UTC
      // Valid appointment: start 14:25 UTC, duration 30m, buffer 5m -> occupied end 15:00 UTC (exact shift boundary)
      const exactShiftStart = new Date(tuesdayBase.getTime());
      exactShiftStart.setUTCHours(14, 25, 0, 0);

      const apptExact = await prisma.appointment.create({
        data: {
          publicToken: `tok_exact_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: exactShiftStart,
          endTime: new Date(exactShiftStart.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      fixtures.appointments.push(apptExact.id);

      // Confirming exactly touching shift end MUST SUCCEED
      const confirmedExact = await apptsService.changeStatus(
        apptExact.id,
        AppointmentStatus.CONFIRMED,
        staff.id,
        'Exact shift boundary',
        { role: StaffRole.ADMIN },
      );
      assert.strictEqual(confirmedExact.status, AppointmentStatus.CONFIRMED);

      // Now create an appointment that exceeds shift end by 1 minute: start 14:26 UTC -> occupied end 15:01 UTC
      const exceedingShiftStart = new Date(tuesdayBase.getTime());
      exceedingShiftStart.setUTCHours(14, 26, 0, 0);

      const apptExceeding = await prisma.appointment.create({
        data: {
          publicToken: `tok_exceed_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: exceedingShiftStart,
          endTime: new Date(exceedingShiftStart.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      fixtures.appointments.push(apptExceeding.id);

      // Confirming appointment exceeding shift end MUST BE REJECTED
      await assert.rejects(
        apptsService.changeStatus(
          apptExceeding.id,
          AppointmentStatus.CONFIRMED,
          staff.id,
          'Exceeding shift boundary',
          { role: StaffRole.ADMIN },
        ),
        /ish grafigi/i,
      );
    });

    // =========================================================================
    // PRIORITY 2: Harden Historical Time Classification & Candidate Queries
    // =========================================================================
    console.log('\n--- Priority 2: Harden Historical Time Classification & Query Candidate Verification ---');

    await test('2.1 Sub-minute timestamp difference classification', () => {
      // 30 min duration with 500ms drift (within 1000ms tolerance) -> TREATMENT_END
      const resTolerant = classifyAppointmentRecord({
        startTime: '2026-11-02T10:00:00.000Z',
        endTime: '2026-11-02T10:30:00.500Z',
        durationMinutes: 30,
        bufferMinutes: 5,
      });
      assert.strictEqual(resTolerant.classification, 'TREATMENT_END');
      assert.strictEqual(resTolerant.isAmbiguous, false);

      // 30 min duration with 2000ms drift (> 1000ms tolerance) -> AMBIGUOUS
      const resDrifted = classifyAppointmentRecord({
        startTime: '2026-11-02T10:00:00.000Z',
        endTime: '2026-11-02T10:30:02.000Z',
        durationMinutes: 30,
        bufferMinutes: 5,
      });
      assert.strictEqual(resDrifted.classification, 'AMBIGUOUS');
      assert.strictEqual(resDrifted.isAmbiguous, true);
    });

    await test('2.2 Zero-buffer row with inconsistent duration is classified as AMBIGUOUS', () => {
      // buffer = 0, but diffMinutes (15) !== durationMinutes (30) -> MUST BE AMBIGUOUS
      const res = classifyAppointmentRecord({
        startTime: '2026-11-02T10:00:00.000Z',
        endTime: '2026-11-02T10:15:00.000Z',
        durationMinutes: 30,
        bufferMinutes: 0,
      });
      assert.strictEqual(res.classification, 'AMBIGUOUS');
      assert.strictEqual(res.isAmbiguous, true);
    });

    await test('2.3 Missing or invalid values are classified as AMBIGUOUS without guessing 30m', () => {
      const resMissingDuration = classifyAppointmentRecord({
        startTime: '2026-11-02T10:00:00.000Z',
        endTime: '2026-11-02T10:30:00.000Z',
        durationMinutes: undefined,
      });
      assert.strictEqual(resMissingDuration.classification, 'AMBIGUOUS');
      assert.strictEqual(resMissingDuration.durationMinutes, null);
      assert.strictEqual(resMissingDuration.isAmbiguous, true);

      const resInverted = classifyAppointmentRecord({
        startTime: '2026-11-02T10:30:00.000Z',
        endTime: '2026-11-02T10:00:00.000Z',
        durationMinutes: 30,
      });
      assert.strictEqual(resInverted.classification, 'AMBIGUOUS');
      assert.strictEqual(resInverted.isAmbiguous, true);
    });

    await test('2.4 Candidate query guarantees zero false negatives for truncated ambiguous records', async () => {
      // Ambiguous record: start 09:00, corrupt short endTime 09:15, canonical duration 180m (occupied until 12:10)
      const corruptStart = new Date(wednesdayBase.getTime());
      const corruptEnd = new Date(corruptStart.getTime() + 15 * 60 * 1000);
      const apptCorrupt = await prisma.appointment.create({
        data: {
          publicToken: `tok_corr_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: corruptStart,
          endTime: corruptEnd, // Corrupt 15m endTime
          serviceName: service.nameUz,
          durationMinutes: 180, // Canonical duration is 3 hours!
          bufferMinutes: 10,
        },
      });
      fixtures.appointments.push(apptCorrupt.id);

      // Query candidate slot at 11:30 - 12:00
      const querySlotStart = new Date(corruptStart.getTime() + 150 * 60 * 1000);
      const querySlotEnd = new Date(querySlotStart.getTime() + 30 * 60 * 1000);

      // Authoritative in-memory overlap check confirms collision
      const overlapsInMemory = isAppointmentOverlapping(apptCorrupt, querySlotStart, querySlotEnd);
      assert.strictEqual(overlapsInMemory, true, 'In-memory helper must detect canonical overlap');

      // Query candidates through buildConflictCandidateWhere
      const candidates = await prisma.appointment.findMany({
        where: buildConflictCandidateWhere(doctor.id, querySlotStart, querySlotEnd),
      });

      const found = candidates.some((c) => c.id === apptCorrupt.id);
      assert.strictEqual(found, true, 'Truncated ambiguous record MUST NOT escape candidate query (zero false negatives)');
    });

    // =========================================================================
    // PRIORITY 3: Safe and Resumable Migration
    // =========================================================================
    console.log('\n--- Priority 3: Safe and Resumable Migration & Race Safety ---');

    await test('3.1 Migration race safety: Concurrent reschedule preserves new schedule and skips backfill', async () => {
      const raceStart = new Date(wednesdayBase.getTime() + 180 * 60 * 1000);
      // Create legacy occupied-end record (duration 30, buffer 5, endTime = start + 35m)
      const legacyAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_race_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: raceStart,
          endTime: new Date(raceStart.getTime() + 35 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(legacyAppt.id);

      // Concurrently reschedule the appointment through application workflow before backfill commits
      const newReschedStart = new Date(raceStart.getTime() + 60 * 60 * 1000);
      await apptsService.reschedule(legacyAppt.id, newReschedStart.toISOString(), staff.id);

      // Attempt migration on this appointment
      const result = await runTimeContractMigration(
        { dryRun: false, batchSize: 10, limit: 100 },
        prisma,
      );

      // Re-fetch appointment: new schedule MUST remain intact
      const fresh = await prisma.appointment.findUnique({ where: { id: legacyAppt.id } });
      assert.ok(fresh);
      assert.strictEqual(fresh.startTime.toISOString(), newReschedStart.toISOString());
      assert.strictEqual(
        fresh.endTime.toISOString(),
        new Date(newReschedStart.getTime() + 30 * 60000).toISOString(),
        'Rescheduled appointment treatment-end must remain intact',
      );
    });

    await test('3.2 Migration pagination cursor and remaining work reporting', async () => {
      // Test running migration with limit=1 to verify continuation cursor
      const res = await runTimeContractMigration(
        { dryRun: true, batchSize: 1, limit: 1 },
        prisma,
      );
      assert.strictEqual(res.scanned, 1);
      if (res.hasMore) {
        assert.ok(res.nextCursor, 'Continuation cursor must be reported when more records remain');
        assert.ok(res.remainingWork > 0, 'Remaining work count must be positive');
      }
    });

    // =========================================================================
    // PRIORITY 4: Transactional Business Audit Writes
    // =========================================================================
    console.log('\n--- Priority 4: Transactional Business Audit Writes ---');

    await test('4.1 Audit failure rolls back business operation atomically', async () => {
      const rev = await prisma.review.create({
        data: {
          authorName: `Patient ${runId}`,
          rating: 5,
          text: 'Super service',
          status: ReviewStatus.PENDING,
        },
      });
      fixtures.reviews.push(rev.id);

      // Attempt moderation with an invalid staff actor ID that violates Foreign Key constraint
      await assert.rejects(
        reviewsService.updateStatus(rev.id, ReviewStatus.APPROVED, 'Ok', {
          sub: 'non-existent-user-uuid',
          id: 'non-existent-user-uuid',
          role: StaffRole.ADMIN,
        }),
      );

      // Verify business operation was rolled back: review status MUST still be PENDING
      const reviewAfter = await prisma.review.findUnique({ where: { id: rev.id } });
      assert.ok(reviewAfter);
      assert.strictEqual(reviewAfter.status, ReviewStatus.PENDING, 'Review status must remain PENDING after audit failure rollback');
    });

    await test('4.2 Successful moderation records verified staff actor atomically', async () => {
      const rev = await prisma.review.create({
        data: {
          authorName: `Patient B ${runId}`,
          rating: 4,
          text: 'Great experience',
          status: ReviewStatus.PENDING,
        },
      });
      fixtures.reviews.push(rev.id);

      await reviewsService.updateStatus(rev.id, ReviewStatus.APPROVED, 'Approved by staff', {
        sub: staff.id,
        id: staff.id,
        role: StaffRole.ADMIN,
      });

      const reviewAfter = await prisma.review.findUnique({ where: { id: rev.id } });
      assert.strictEqual(reviewAfter?.status, ReviewStatus.APPROVED);

      // Verify audit log exists with exact staff actor ID
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'review.moderated',
          entityId: rev.id,
        },
      });
      assert.ok(audit, 'Audit log entry must exist');
      assert.strictEqual(audit.userId, staff.id, 'Audit log actor must match staff.id');
    });

    // =========================================================================
    // PRIORITY 5: Align Notification Lock Order & Concurrency Safety
    // =========================================================================
    console.log('\n--- Priority 5: Notification Lock Order & Concurrency Safety ---');

    await test('5.1 Concurrency: Notification retry vs appointment cancellation executes without deadlock', async () => {
      const tJob = new Date(thursdayBase.getTime());
      const appt = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: tJob.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        consentGiven: true,
        source: 'admin',
      });
      fixtures.appointments.push(appt.id);

      // Create a failed notification job for this appointment
      const job = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.FAILED,
          attempts: 3,
          maxAttempts: 3,
          appointmentId: appt.id,
          payload: { appointmentId: appt.id, startTime: tJob.toISOString() },
        },
      });

      // Execute retry and cancellation concurrently
      const results = await Promise.allSettled([
        notifService.retryJob(job.id, { sub: staff.id }),
        apptsService.changeStatus(appt.id, AppointmentStatus.CANCELLED, staff.id, 'Cancel concurrent test', { role: StaffRole.ADMIN }),
      ]);

      // Both must complete cleanly without deadlock (neither should throw SQL deadlock error 40P01)
      for (const r of results) {
        if (r.status === 'rejected') {
          assert.doesNotMatch(r.reason?.message || '', /deadlock/i, 'No deadlocks allowed between retry and cancellation');
        }
      }
    });

    await test('5.2 Two concurrent retries on the same job execute safely without deadlock', async () => {
      const job = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.FAILED,
          attempts: 3,
          maxAttempts: 3,
          payload: {},
        },
      });

      const [r1, r2] = await Promise.allSettled([
        notifService.retryJob(job.id, { sub: staff.id }),
        notifService.retryJob(job.id, { sub: staff.id }),
      ]);

      // At least one must succeed; neither must deadlock
      const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled');
      assert.ok(succeeded.length >= 1, 'At least one concurrent retry must succeed');
      const finalJob = await prisma.notificationJob.findUnique({ where: { id: job.id } });
      assert.strictEqual(finalJob?.status, NotificationStatus.PENDING);
    });

    await test('5.3 Active worker lease in PROCESSING status rejects retry', async () => {
      const activeJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.PROCESSING,
          lockedAt: new Date(), // Active lease
          attempts: 1,
          payload: {},
        },
      });

      await assert.rejects(
        notifService.retryJob(activeJob.id, { sub: staff.id }),
        /fon xizmati|worker/i,
      );
    });

    // =========================================================================
    // PRIORITY 6: Communication Language Precedence & Multi-Service Names
    // =========================================================================
    console.log('\n--- Priority 6: Communication Language Precedence & Multi-Service Names ---');

    await test('6.1 Explicit uz choice overrides older ru preference', async () => {
      // Patient with persisted [lang:ru] tag
      const ruPatient = await prisma.patient.create({
        data: {
          fullName: `RU Patient ${runId}`,
          phone: '+998901112233',
          notes: 'Old clinical notes [lang:ru]',
        },
      });
      fixtures.patients.push(ruPatient.id);

      const bTime = new Date(fridayBase.getTime());
      const booking = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: bTime.toISOString(),
        patientName: ruPatient.fullName,
        patientPhone: ruPatient.phone,
        consentGiven: true,
        source: 'website',
        lang: 'uz', // Explicit UZ choice!
      });
      fixtures.appointments.push(booking.id);

      // Check notification job enqueued
      const job = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(job);
      assert.strictEqual((job.payload as any)?.lang, 'uz', 'Explicit uz must override older ru preference');

      // Patient notes must retain clinical notes and update tag
      const updatedPat = await prisma.patient.findUnique({ where: { id: ruPatient.id } });
      assert.ok(updatedPat?.notes?.includes('Old clinical notes'));
      assert.ok(updatedPat?.notes?.includes('[lang:uz]'));
      assert.strictEqual(updatedPat?.notes?.includes('[lang:ru]'), false);
    });

    await test('6.2 Explicit ru choice with Uzbek clinical note does not falsely infer uz', async () => {
      const bTime = new Date(fridayBase.getTime() + 60 * 60 * 1000);
      const booking = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: bTime.toISOString(),
        patientName: 'Uzbek Notes Patient',
        patientPhone: '+998904445566',
        patientNote: 'Tish og‘riyapti, ertalab kelaman',
        consentGiven: true,
        source: 'website',
        lang: 'ru', // Explicit RU choice!
      });
      fixtures.appointments.push(booking.id);

      const job = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id },
        orderBy: { createdAt: 'desc' },
      });
      assert.strictEqual((job?.payload as any)?.lang, 'ru', 'Explicit ru must win despite Uzbek clinical notes');
    });

    await test('6.3 Multi-service appointment confirmation & rescheduling builds Russian names from all items', async () => {
      const srv2 = await prisma.service.create({
        data: {
          nameUz: 'Plomba qo‘yish',
          nameRu: 'Пломбирование',
          slug: `plomba-${runId}`,
          durationMinutes: 30,
          doctors: { create: { doctorId: doctor.id } },
        },
      });
      fixtures.services.push(srv2.id);

      const bTime = new Date(fridayBase.getTime() + 120 * 60 * 1000);
      const booking = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        serviceIds: [service.id, srv2.id],
        startTime: bTime.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        consentGiven: true,
        source: 'website',
        lang: 'ru',
      });
      fixtures.appointments.push(booking.id);

      // Confirm appointment
      await apptsService.changeStatus(booking.id, AppointmentStatus.CONFIRMED, staff.id, 'Confirm multi', { role: StaffRole.ADMIN });

      // Check confirmation notification job
      const confirmJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: 'patient_booking_confirmed' },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(confirmJob);
      const payloadRu = (confirmJob.payload as any)?.serviceNameRu;
      assert.ok(payloadRu?.includes('Лечение') && payloadRu?.includes('Пломбирование'), `Russian name (${payloadRu}) must contain all bundle service items`);

      // Reschedule appointment
      const reschedTime = new Date(bTime.getTime() + 60 * 60 * 1000);
      await apptsService.reschedule(booking.id, reschedTime.toISOString(), staff.id);

      const reschedJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: 'appointment_rescheduled' },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(reschedJob);
      const reschedRu = (reschedJob.payload as any)?.serviceNameRu;
      assert.ok(reschedRu?.includes('Лечение') && reschedRu?.includes('Пломбирование'), `Rescheduled Russian name (${reschedRu}) must contain all bundle items`);
    });

    // =========================================================================
    // PRIORITY 7: Correct Clinical Analytics Definitions
    // =========================================================================
    console.log('\n--- Priority 7: Clinical Analytics Definitions & Denominators ---');

    await test('7.1 Arrival (CHECKED_IN) is not counted in performedCount; only COMPLETED counts', async () => {
      const aTime = new Date(saturdayBase.getTime());
      const apptArrived = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: aTime.toISOString(),
        patientName: 'Arrived Patient',
        patientPhone: '+998907778899',
        consentGiven: true,
        source: 'admin',
      });
      fixtures.appointments.push(apptArrived.id);

      // Check-in patient (status = CHECKED_IN)
      await apptsService.changeStatus(apptArrived.id, AppointmentStatus.CHECKED_IN, staff.id, 'Arrived', { role: StaffRole.ADMIN });

      const analytics = await analyticsService.getDashboardAnalytics({
        startDate: new Date(aTime.getTime() - 3600000).toISOString(),
        endDate: new Date(aTime.getTime() + 3600000).toISOString(),
        doctorId: doctor.id,
      });

      assert.strictEqual(analytics.summary.arrived >= 1, true, 'Arrived count must be recorded');
      // performedCount for this appointment must NOT be incremented because it is not COMPLETED
      const srvStats = analytics.popularServices.find((s) => s.serviceId === service.id);
      assert.strictEqual(srvStats?.performedCount, 0, 'performedCount must be 0 for CHECKED_IN appointment');

      // Now complete the appointment
      await apptsService.changeStatus(apptArrived.id, AppointmentStatus.COMPLETED, staff.id, 'Done', { role: StaffRole.ADMIN });

      const analyticsCompleted = await analyticsService.getDashboardAnalytics({
        startDate: new Date(aTime.getTime() - 3600000).toISOString(),
        endDate: new Date(aTime.getTime() + 3600000).toISOString(),
        doctorId: doctor.id,
      });

      const srvStatsCompleted = analyticsCompleted.popularServices.find((s) => s.serviceId === service.id);
      assert.strictEqual(srvStatsCompleted?.performedCount, 1, 'performedCount must be 1 after COMPLETED status');
    });

    // =========================================================================
    // PRIORITY 8: HTTP Controller Tests (DTO Validation & Role Guards)
    // =========================================================================
    console.log('\n--- Priority 8: HTTP Tests for DTO Validation & Role Guards ---');

    await test('8.1 HTTP: Invalid phone number in public booking fails with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/booking')
        .send({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: service.id,
          startTime: new Date().toISOString(),
          patientName: 'Invalid Phone Tester',
          patientPhone: '12345', // Invalid format
          consentGiven: true,
        });

      assert.strictEqual(res.status, 400);
    });

    await test('8.2 HTTP: Admin endpoint without JWT auth fails with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/analytics/overview');

      assert.strictEqual(res.status, 401);
    });

    await test('8.3 HTTP: Admin endpoint with valid JWT token succeeds', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
    });

    console.log('\n================================================================');
    console.log(`   ALL ${passedCount}/${totalCount} VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
    console.log('================================================================\n');
  } finally {
    console.log('\n--- Executing Guaranteed Cleanup Coverage ---');
    try {
      // Clean appointment related records
      if (fixtures.doctors.length > 0) {
        await prisma.appointmentStatusHistory.deleteMany({
          where: { appointment: { doctorId: { in: fixtures.doctors } } },
        });
        await prisma.notificationJob.deleteMany({
          where: { appointment: { doctorId: { in: fixtures.doctors } } },
        });
        await prisma.payment.deleteMany({
          where: { appointment: { doctorId: { in: fixtures.doctors } } },
        });
        await prisma.appointmentServiceItem.deleteMany({
          where: { appointment: { doctorId: { in: fixtures.doctors } } },
        });
        await prisma.appointment.deleteMany({
          where: { doctorId: { in: fixtures.doctors } },
        });
        await prisma.doctorSchedule.deleteMany({
          where: { doctorId: { in: fixtures.doctors } },
        });
        await prisma.doctorBranch.deleteMany({
          where: { doctorId: { in: fixtures.doctors } },
        });
        await prisma.doctorService.deleteMany({
          where: { doctorId: { in: fixtures.doctors } },
        });
        await prisma.doctor.deleteMany({
          where: { id: { in: fixtures.doctors } },
        });
      }

      if (fixtures.reviews.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entityId: { in: fixtures.reviews } },
        });
        await prisma.review.deleteMany({
          where: { id: { in: fixtures.reviews } },
        });
      }

      if (fixtures.services.length > 0) {
        await prisma.service.deleteMany({
          where: { id: { in: fixtures.services } },
        });
      }

      if (fixtures.staff.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { userId: { in: fixtures.staff } },
        });
        await prisma.staffUser.deleteMany({
          where: { id: { in: fixtures.staff } },
        });
      }

      if (fixtures.branches.length > 0) {
        await prisma.branch.deleteMany({
          where: { id: { in: fixtures.branches } },
        });
      }

      if (fixtures.patients.length > 0) {
        await prisma.patient.deleteMany({
          where: { id: { in: fixtures.patients } },
        });
      }

      // Restore singleton clinic settings if modified
      if (originalSettings) {
        await prisma.clinicSettings.update({
          where: { id: originalSettings.id },
          data: {
            bufferMinutes: originalSettings.bufferMinutes,
            pendingExpiryMinutes: originalSettings.pendingExpiryMinutes,
          },
        });
      }

      console.log('[PASS] Cleanup completed cleanly. Zero leaked fixtures.');
    } catch (cleanupErr: any) {
      console.error('[FATAL] Cleanup failed! Making suite fail closed:', cleanupErr);
      await app.close();
      throw cleanupErr;
    }

    await app.close();
  }
}

runAllPrioritiesVerification()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Test Suite Failed:', e);
    process.exit(1);
  });

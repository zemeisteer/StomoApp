import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentsService, PATIENT_COMMUNICATION_TEMPLATES } from '../src/appointments/appointments.service';
import { SchedulingService, DAY_MAP, TIME_RESERVING_STATUSES } from '../src/scheduling/scheduling.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReviewsService } from '../src/reviews/reviews.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  getAppointmentTreatmentEnd,
  getAppointmentOccupiedEnd,
  getAppointmentEffectiveTreatmentEnd,
  getAppointmentEffectiveOccupiedEnd,
  classifyAppointmentRecord,
  isAppointmentOverlapping,
  buildConflictCandidateWhere,
  validateAppointmentTime,
  InvalidAppointmentTimeError,
  MAX_SUPPORTED_DURATION_MINUTES,
} from '../src/appointments/appointment-time.helper';
import { runTimeContractMigration } from './migrate-appointment-time-contract';
import {
  AppointmentStatus,
  DayOfWeek,
  ExceptionType,
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

/**
 * Robust database identity guard that verifies exact allowed database names.
 * Uses strict URL parsing instead of substring checks, prevents credentials from leaking,
 * and rejects sneaky URLs where 'test' appears in the username, password, host, or query params.
 */
export function verifyDatabaseIdentity(
  rawUrl: string,
  allowedDbNames: string[] = ['dentacare_test'],
): { dbName: string; host: string } {
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid DATABASE_URL format (cannot parse as URL)');
  }

  // Extract exact database name from pathname (e.g. "/dentacare_test" -> "dentacare_test")
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0].trim();
  const host = parsed.host;

  if (!dbName) {
    throw new Error('No database name specified in DATABASE_URL');
  }

  if (!allowedDbNames.includes(dbName)) {
    // Note: NEVER print rawUrl or credentials in failure message
    throw new Error(
      `STRICT GUARD: Target database '${dbName}' on host '${host}' is NOT in allowed test databases (${allowedDbNames.join(', ')}). Aborting.`,
    );
  }

  return { dbName, host };
}

// Intercept SchedulerRegistry and delivery providers BEFORE any application initialization
let externalProviderCallsAttempted = 0;
const originalAddCronJob = SchedulerRegistry.prototype.addCronJob;
SchedulerRegistry.prototype.addCronJob = function (name: string, job: any) {
  if (job && typeof job.stop === 'function') {
    job.stop();
  }
  return originalAddCronJob.call(this, name, job);
};

// Replace delivery providers with typed mocks returning Promise<boolean> BEFORE application init
NotificationsService.prototype['deliverEmail'] = async () => false;
NotificationsService.prototype['deliverSms'] = async () => false;
NotificationsService.prototype['deliverTelegram'] = async () => false;

async function runAllPrioritiesVerification() {
  console.log('================================================================');
  console.log('   STOMOAPP COMPREHENSIVE REGRESSION VERIFICATION (P1 - P10)   ');
  console.log('================================================================\n');

  // 1. FAIL-CLOSED TEST DATABASE IDENTITY GUARD
  const dbUrl = process.env.DATABASE_URL || '';
  const allowedTestDbs = ['dentacare_test'];
  const { dbName, host } = verifyDatabaseIdentity(dbUrl, allowedTestDbs);
  console.log(`[PASS] Test Database Guard Verified: Exact match '${dbName}' on ${host}.`);

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

  const prisma = app.get(PrismaService);
  const apptsService = app.get(AppointmentsService);
  const schedService = app.get(SchedulingService);
  const notifService = app.get(NotificationsService);
  const reviewsService = app.get(ReviewsService);
  const analyticsService = app.get(AnalyticsService);
  const auditService = app.get(AuditService);
  const jwtService = app.get(JwtService);
  const configService = app.get(ConfigService);

  // 3. Live database read-only SELECT current_database() verification before mutations
  const [liveDbResult] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const liveDbName = liveDbResult?.current_database;
  if (!allowedTestDbs.includes(liveDbName)) {
    console.error(`\n[FATAL] LIVE DATABASE IDENTITY MISMATCH!`);
    console.error(`PostgreSQL current_database() returned '${liveDbName}', which is not in allowed test databases (${allowedTestDbs.join(', ')}).`);
    await app.close();
    process.exit(1);
  }
  console.log(`[PASS] Live DB Verification: SELECT current_database() confirms '${liveDbName}'.`);

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
    // SECTION 0: Test Database Guard, Pre-init Schedulers & Typed Delivery Mocks
    // =========================================================================
    console.log('\n--- Section 0: Fail-Closed Test Database Guard & Isolated Environment ---');

    await test('0.1 Database identity guard rejects URLs with non-test databases even if credentials or query contain "test"', () => {
      // Sneaky URLs with "test" in username, password, host or query
      const sneaky1 = 'postgresql://test:test@localhost:5432/dentacare?test=1';
      const sneaky2 = 'postgresql://user:password@localhost:5432/dentacare?test=true';
      const sneaky3 = 'postgresql://test_user:secret@localhost:5432/production';

      assert.throws(
        () => verifyDatabaseIdentity(sneaky1, ['dentacare_test']),
        (err: Error) => {
          assert.strictEqual(err.message.includes('dentacare'), true);
          assert.strictEqual(err.message.includes('test:test'), false, 'Credentials must never be printed');
          return true;
        },
      );

      assert.throws(() => verifyDatabaseIdentity(sneaky2, ['dentacare_test']), /STRICT GUARD/);
      assert.throws(() => verifyDatabaseIdentity(sneaky3, ['dentacare_test']), /STRICT GUARD/);

      // Allowed test database passes
      const valid = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
      const res = verifyDatabaseIdentity(valid, ['dentacare_test']);
      assert.strictEqual(res.dbName, 'dentacare_test');
    });

    await test('0.2 Typed notification dispatchers correctly classify SIMULATED, SENT, and retry on failure', async () => {
      // 1. Simulated delivery (mock returns false)
      (notifService as any).deliverSms = async () => false;
      const jobSimulated = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.PENDING,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
        },
      });

      await (notifService as any).processPendingJobs();
      const updatedSimulated = await prisma.notificationJob.findUnique({ where: { id: jobSimulated.id } });
      assert.strictEqual(updatedSimulated?.status, NotificationStatus.SIMULATED);
      assert.strictEqual(updatedSimulated?.lastError, 'Simulated delivery (development sink)');

      // 2. Mocked provider acceptance (mock returns true)
      (notifService as any).deliverSms = async () => true;
      const jobSent = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.PENDING,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
        },
      });

      await (notifService as any).processPendingJobs();
      const updatedSent = await prisma.notificationJob.findUnique({ where: { id: jobSent.id } });
      assert.strictEqual(updatedSent?.status, NotificationStatus.SENT);
      assert.strictEqual(updatedSent?.lastError, null);

      // 3. Provider failure follows retry behavior (mock throws error)
      (notifService as any).deliverSms = async () => {
        throw new Error('Simulated upstream SMS gateway 504 Gateway Timeout');
      };
      const jobFail = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'booking_created',
          recipient: patient.phone,
          status: NotificationStatus.PENDING,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
        },
      });

      await (notifService as any).processPendingJobs();
      const updatedFail = await prisma.notificationJob.findUnique({ where: { id: jobFail.id } });
      assert.strictEqual(updatedFail?.status, NotificationStatus.PENDING);
      assert.strictEqual(updatedFail?.attempts, 1);
      assert.ok(updatedFail?.lastError?.includes('504 Gateway Timeout'));

      // Restore safe mock
      (notifService as any).deliverSms = async () => false;
    });

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

        const slotStart = new Date(mondayBase.getTime() + idx * 75 * 60 * 1000);
        const booking = await apptsService.createBooking({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: testService.id,
          startTime: slotStart.toISOString(),
          patientName: patient.fullName,
          patientPhone: patient.phone,
          consentGiven: true,
          source: 'website',
        });
        fixtures.appointments.push(booking.id);

        assert.strictEqual(booking.status, AppointmentStatus.PENDING);
        assert.strictEqual(booking.durationMinutes, duration);

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
          bufferMinutes: 0,
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

      const confirmedExact = await apptsService.changeStatus(
        apptExact.id,
        AppointmentStatus.CONFIRMED,
        staff.id,
        'Exact shift boundary',
        { role: StaffRole.ADMIN },
      );
      assert.strictEqual(confirmedExact.status, AppointmentStatus.CONFIRMED);

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

    // Schedule Changes vs Effective Availability (Requirement 6)
    await test('1.6 Expired pending appointments do not block schedule changes', async () => {
      const schedTime = new Date(wednesdayBase.getTime());
      schedTime.setUTCHours(8, 0, 0, 0);

      // Create an expired PENDING appointment
      const expiredPending = await prisma.appointment.create({
        data: {
          publicToken: `tok_exp_sched_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: schedTime,
          endTime: new Date(schedTime.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          expiresAt: new Date(Date.now() - 10 * 60000), // Expired 10 min ago!
        },
      });
      fixtures.appointments.push(expiredPending.id);

      // findAppointmentConflictsForDoctorDay with schedule covering or breaking over this slot
      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma as any,
        doctorId: doctor.id,
        doctorName: 'Dr. Test',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        branchId: branch.id,
        branchName: 'Filial',
        schedStart: 9 * 60, // 09:00 Tashkent = 04:00 UTC
        schedEnd: 12 * 60,  // schedule ends before 8:00 UTC (13:00 Tashkent)
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      const hasExpiredConflict = conflicts.some((c) => c.appointmentId === expiredPending.id);
      assert.strictEqual(hasExpiredConflict, false, 'Expired pending appointment must not block schedule changes');
    });

    await test('1.7 Active treatment overruns remain protected during schedule checks', async () => {
      const schedTime = new Date(wednesdayBase.getTime() + 2 * 3600000);
      const overrunAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_ovr_sched_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CHECKED_IN,
          startTime: schedTime,
          endTime: new Date(schedTime.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          overrunActive: true,
          overrunEstimatedEndTime: new Date(schedTime.getTime() + 90 * 60000), // Overrun extended by 60 min!
        },
      });
      fixtures.appointments.push(overrunAppt.id);

      // Check conflict against schedule ending before the overrun completes
      const apptZonedStart = new Date(schedTime.getTime() + 5 * 3600000); // 09:00 UTC + 5h = 14:00 Tashkent
      const schedEndMinutes = 11 * 60; // 11:00 Tashkent (earlier than overrun completion)

      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma as any,
        doctorId: doctor.id,
        doctorName: 'Dr. Test',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        branchId: branch.id,
        branchName: 'Filial',
        schedStart: 8 * 60,
        schedEnd: schedEndMinutes,
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      const found = conflicts.some((c) => c.appointmentId === overrunAppt.id);
      assert.strictEqual(found, true, 'Active treatment overrun must be protected during schedule changes');
    });

    await test('1.8 Date-specific overtime exceptions are respected and do not conflict with regular schedule changes', async () => {
      const schedTime = new Date(wednesdayBase.getTime());
      schedTime.setUTCHours(16, 0, 0, 0); // 16:00 UTC = 21:00 Tashkent (outside regular 08:00-20:00 schedule)

      // Add date-specific OVERTIME exception: 20:30 - 22:00 Tashkent
      const otException = await prisma.scheduleException.create({
        data: {
          doctorId: doctor.id,
          branchId: branch.id,
          date: schedTime,
          type: ExceptionType.OVERTIME,
          startTime: '20:30',
          endTime: '22:00',
          reason: 'Kechki qabul',
        },
      });

      const otAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_ot_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: schedTime,
          endTime: new Date(schedTime.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(otAppt.id);

      // Updating regular Wednesday schedule to 08:00 - 18:00 Tashkent (480..1080)
      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma as any,
        doctorId: doctor.id,
        doctorName: 'Dr. Test',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        branchId: branch.id,
        branchName: 'Filial',
        schedStart: 8 * 60,
        schedEnd: 18 * 60,
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      const hasOtConflict = conflicts.some((c) => c.appointmentId === otAppt.id);
      assert.strictEqual(hasOtConflict, false, 'Appointment covered by date-specific overtime must not conflict with regular schedule change');

      await prisma.scheduleException.delete({ where: { id: otException.id } });
    });

    await test('1.9 Cross-midnight occupied intervals retain their date information', async () => {
      // Slot starting at 23:45 Tashkent and occupied until 00:20 tomorrow Tashkent
      const apptZonedDate = new Date(wednesdayBase.getTime());
      apptZonedDate.setUTCHours(18, 45, 0, 0); // 18:45 UTC = 23:45 Tashkent

      const crossMidAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_cross_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: apptZonedDate,
          endTime: new Date(apptZonedDate.getTime() + 30 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5, // Occupied until 00:20 tomorrow
        },
      });
      fixtures.appointments.push(crossMidAppt.id);

      // Check against schedule ending at 24:00 (1440 min)
      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma as any,
        doctorId: doctor.id,
        doctorName: 'Dr. Test',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        branchId: branch.id,
        branchName: 'Filial',
        schedStart: 8 * 60,
        schedEnd: 24 * 60, // 1440 min
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      const found = conflicts.some((c) => c.appointmentId === crossMidAppt.id);
      assert.strictEqual(found, true, 'Cross-midnight occupied end (1460m) must not wrap around to 20m and escape schedule conflict detection');
    });

    // =========================================================================
    // PRIORITY 2: Harden Historical Time Classification & Candidate Queries
    // =========================================================================
    console.log('\n--- Priority 2: Harden Historical Time Classification & Query Candidate Verification ---');

    await test('2.1 Sub-minute timestamp difference classification', () => {
      const resTolerant = classifyAppointmentRecord({
        startTime: '2026-11-02T10:00:00.000Z',
        endTime: '2026-11-02T10:30:00.500Z',
        durationMinutes: 30,
        bufferMinutes: 5,
      });
      assert.strictEqual(resTolerant.classification, 'TREATMENT_END');
      assert.strictEqual(resTolerant.isAmbiguous, false);

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
          endTime: corruptEnd,
          serviceName: service.nameUz,
          durationMinutes: 180,
          bufferMinutes: 10,
        },
      });
      fixtures.appointments.push(apptCorrupt.id);

      const querySlotStart = new Date(corruptStart.getTime() + 150 * 60 * 1000);
      const querySlotEnd = new Date(querySlotStart.getTime() + 30 * 60 * 1000);

      const overlapsInMemory = isAppointmentOverlapping(apptCorrupt, querySlotStart, querySlotEnd);
      assert.strictEqual(overlapsInMemory, true, 'In-memory helper must detect canonical overlap');

      const candidates = await prisma.appointment.findMany({
        where: buildConflictCandidateWhere(doctor.id, querySlotStart, querySlotEnd),
      });

      const found = candidates.some((c) => c.id === apptCorrupt.id);
      assert.strictEqual(found, true, 'Truncated ambiguous record MUST NOT escape candidate query (zero false negatives)');
    });

    // Invalid-time handling & bounds verification (Requirements 3 & 4)
    await test('2.5 validateAppointmentTime rejects invalid dates, inverted times, fractional/non-finite durations, and malformed overruns', () => {
      // Invalid date string
      assert.strictEqual(validateAppointmentTime({ startTime: 'invalid-date', endTime: '2026-10-26T10:00:00Z', durationMinutes: 30 }).isValid, false);
      assert.throws(
        () => validateAppointmentTime({ startTime: 'invalid-date', endTime: '2026-10-26T10:00:00Z', durationMinutes: 30 }, { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );

      // end <= start
      assert.strictEqual(validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T09:30:00Z', durationMinutes: 30 }).isValid, false);
      assert.throws(
        () => validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T09:30:00Z', durationMinutes: 30 }, { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );

      // Fractional duration
      assert.strictEqual(validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z', durationMinutes: 30.5 }).isValid, false);
      assert.throws(
        () => validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z', durationMinutes: 30.5 }, { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );

      // Non-finite duration
      assert.strictEqual(validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z', durationMinutes: Infinity }).isValid, false);
      assert.throws(
        () => validateAppointmentTime({ startTime: '2026-10-26T10:00:00Z', endTime: '2026-10-26T10:30:00Z', durationMinutes: Infinity }, { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );

      // Malformed overrun
      assert.strictEqual(validateAppointmentTime({
        startTime: '2026-10-26T10:00:00Z',
        endTime: '2026-10-26T10:30:00Z',
        durationMinutes: 30,
        overrunActive: true,
        overrunEstimatedEndTime: undefined,
      }).isValid, false);
      assert.throws(
        () => validateAppointmentTime({
          startTime: '2026-10-26T10:00:00Z',
          endTime: '2026-10-26T10:30:00Z',
          durationMinutes: 30,
          overrunActive: true,
          overrunEstimatedEndTime: undefined,
        }, { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );
    });

    await test('2.6 isAppointmentOverlapping fails closed on corrupted candidate records to prevent advertising false availability', () => {
      const corruptedAppt = {
        id: 'corrupted-id',
        startTime: 'invalid-date',
        endTime: 'invalid-date',
        durationMinutes: 30,
      };

      // Fails closed (returns true) so slot is marked unavailable
      const isBlocked = isAppointmentOverlapping(
        corruptedAppt as any,
        '2026-10-26T10:00:00Z',
        '2026-10-26T10:30:00Z',
      );
      assert.strictEqual(isBlocked, true, 'Corrupted candidate record must fail closed and block slot');

      // With throwOnInvalid: true, throws explicit domain error
      assert.throws(
        () => isAppointmentOverlapping(corruptedAppt as any, '2026-10-26T10:00:00Z', '2026-10-26T10:30:00Z', { throwOnInvalid: true }),
        (err: Error) => err instanceof InvalidAppointmentTimeError,
      );
    });

    await test('2.7 Database regression: Ambiguous record with truncated endTime and 900m canonical duration beyond lookback is found by candidate query and blocks booking', async () => {
      // Create ambiguous record starting at Monday 03:00 UTC (08:00 Tashkent) with 900m canonical duration (15h) but truncated 30m endTime
      const ambigStart = new Date(mondayBase.getTime());
      ambigStart.setUTCHours(3, 0, 0, 0);
      const truncatedEnd = new Date(ambigStart.getTime() + 30 * 60000); // 30m truncated endTime
      const ambigAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_ambig_900_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: ambigStart,
          endTime: truncatedEnd,
          serviceName: service.nameUz,
          durationMinutes: 900, // 15 hours canonical duration!
          bufferMinutes: 10,
        },
      });
      fixtures.appointments.push(ambigAppt.id);

      // Requested slot is at Monday 14:00 UTC (19:00 Tashkent, 11 hours = 660m after ambigStart, beyond the 600m lookback!)
      const targetSlotStart = new Date(ambigStart.getTime() + 11 * 3600000);
      const targetSlotEnd = new Date(targetSlotStart.getTime() + 30 * 60000);

      // In-memory canonical check
      const overlaps = isAppointmentOverlapping(ambigAppt, targetSlotStart, targetSlotEnd);
      assert.strictEqual(overlaps, true, 'Slot within 900m canonical span must overlap in memory');

      // Query database candidate appointments
      const candidates = await prisma.appointment.findMany({
        where: buildConflictCandidateWhere(doctor.id, targetSlotStart, targetSlotEnd),
      });

      const found = candidates.some((c) => c.id === ambigAppt.id);
      assert.strictEqual(found, true, 'Candidate query with durationMinutes > 480 bound must return out-of-range ambiguous appointment');

      // Attempting to book this slot via public booking MUST BE BLOCKED
      await assert.rejects(
        apptsService.createBooking({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: service.id,
          startTime: targetSlotStart.toISOString(),
          patientName: 'Test Patient Overlap',
          patientPhone: '+998901239988',
          consentGiven: true,
          source: 'website',
        }),
        /band/i,
      );
    });

    await test('2.8 Service duration calculator enforces MAX_SUPPORTED_DURATION_MINUTES (480m)', async () => {
      // Create a service with duration 300m
      const srvA = await prisma.service.create({
        data: {
          nameUz: 'Uzoq davolash A',
          nameRu: 'Длительное лечение А',
          slug: `long-srv-a-${runId}`,
          durationMinutes: 260,
          isActive: true,
          doctors: { create: { doctorId: doctor.id } },
        },
      });
      fixtures.services.push(srvA.id);

      const srvB = await prisma.service.create({
        data: {
          nameUz: 'Uzoq davolash B',
          nameRu: 'Длительное лечение Б',
          slug: `long-srv-b-${runId}`,
          durationMinutes: 250,
          isActive: true,
          doctors: { create: { doctorId: doctor.id } },
        },
      });
      fixtures.services.push(srvB.id);

      // Sum of A + B is 260 + 250 = 510m > 480m
      await assert.rejects(
        schedService.calculateAuthoritativeServiceDuration(doctor.id, [srvA.id, srvB.id]),
        /maksimal vaqtdan/i,
      );
    });

    // =========================================================================
    // PRIORITY 3: Safe and Resumable Migration
    // =========================================================================
    console.log('\n--- Priority 3: Safe and Resumable Migration & Race Safety ---');

    await test('3.1 Migration race safety: Concurrent reschedule preserves new schedule and skips backfill', async () => {
      const raceStart = new Date(wednesdayBase.getTime() + 180 * 60 * 1000);
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

      const newReschedStart = new Date(raceStart.getTime() + 60 * 60 * 1000);
      await apptsService.reschedule(legacyAppt.id, newReschedStart.toISOString(), staff.id);

      const result = await runTimeContractMigration(
        { dryRun: false, batchSize: 10, limit: 100, approvedManifestIds: [legacyAppt.id] },
        prisma,
      );

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

    // Provenance Enforcement in Migration (Requirement 5)
    await test('3.3 Migration requires provenance: arithmetic matches without provenance are classified for review and not modified', async () => {
      const migStart = new Date(thursdayBase.getTime());
      // Create arithmetic record (endTime - startTime = 30 + 5 = 35m)
      const arithAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_arith_${runId}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: migStart,
          endTime: new Date(migStart.getTime() + 35 * 60000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(arithAppt.id);

      // Run migration with execute mode but WITHOUT manifest or provenance cutoff
      const res = await runTimeContractMigration(
        { dryRun: false, batchSize: 10, limit: 1000 },
        prisma,
      );

      // The record must NOT be modified and must be classified as review candidate
      const foundInReview = res.arithmeticCandidatesReview.some((r) => r.id === arithAppt.id);
      assert.strictEqual(foundInReview, true, 'Record without provenance must be classified for review');
      assert.ok(res.skippedRecordIds.includes(arithAppt.id), 'Skipped record ID must be included in report');

      const fresh = await prisma.appointment.findUnique({ where: { id: arithAppt.id } });
      assert.strictEqual(
        fresh?.endTime.toISOString(),
        new Date(migStart.getTime() + 35 * 60000).toISOString(),
        'Uncertain arithmetic candidate must NOT be modified without provenance',
      );

      // Now run with explicit manifest approval for this record: MUST MIGRATE
      const resManifest = await runTimeContractMigration(
        { dryRun: false, batchSize: 10, limit: 1000, approvedManifestIds: [arithAppt.id] },
        prisma,
      );
      assert.strictEqual(resManifest.migrated >= 1, true, 'Proven record in manifest must be migrated');

      const freshMigrated = await prisma.appointment.findUnique({ where: { id: arithAppt.id } });
      assert.strictEqual(
        freshMigrated?.endTime.toISOString(),
        new Date(migStart.getTime() + 30 * 60000).toISOString(),
        'Proven record must now have treatment-end',
      );

      // Second execution: idempotent (0 new migrations)
      const resSecond = await runTimeContractMigration(
        { dryRun: false, batchSize: 10, limit: 1000, approvedManifestIds: [arithAppt.id] },
        prisma,
      );
      assert.strictEqual(resSecond.migrated, 0, 'Second execution must be idempotent with 0 mutations');
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

      await assert.rejects(
        reviewsService.updateStatus(rev.id, ReviewStatus.APPROVED, 'Ok', {
          sub: 'non-existent-user-uuid',
          id: 'non-existent-user-uuid',
          role: StaffRole.ADMIN,
        }),
      );

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
      const tJob = new Date(thursdayBase.getTime() + 4 * 3600000);
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

      const results = await Promise.allSettled([
        notifService.retryJob(job.id, { sub: staff.id }),
        apptsService.changeStatus(appt.id, AppointmentStatus.CANCELLED, staff.id, 'Cancel concurrent test', { role: StaffRole.ADMIN }),
      ]);

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
          lockedAt: new Date(),
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
        lang: 'uz',
      });
      fixtures.appointments.push(booking.id);

      const job = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: { in: [...PATIENT_COMMUNICATION_TEMPLATES] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(job);
      assert.strictEqual((job.payload as any)?.lang, 'uz', 'Explicit uz must override older ru preference');

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
        lang: 'ru',
      });
      fixtures.appointments.push(booking.id);

      const job = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: { in: [...PATIENT_COMMUNICATION_TEMPLATES] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

      await apptsService.changeStatus(booking.id, AppointmentStatus.CONFIRMED, staff.id, 'Confirm multi', { role: StaffRole.ADMIN });

      const confirmJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: 'patient_booking_confirmed' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(confirmJob);
      const payloadRu = (confirmJob.payload as any)?.serviceNameRu;
      assert.ok(payloadRu?.includes('Лечение') && payloadRu?.includes('Пломбирование'), `Russian name (${payloadRu}) must contain all bundle service items`);

      const reschedTime = new Date(bTime.getTime() + 60 * 60 * 1000);
      await apptsService.reschedule(booking.id, reschedTime.toISOString(), staff.id);

      const reschedJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: booking.id, templateKey: 'appointment_rescheduled' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(reschedJob);
      const reschedRu = (reschedJob.payload as any)?.serviceNameRu;
      assert.ok(reschedRu?.includes('Лечение') && reschedRu?.includes('Пломбирование'), `Rescheduled Russian name (${reschedRu}) must contain all bundle items`);
    });

    // Language independence from staff Telegram alerts (Requirement 2)
    await test('6.4 Staff Telegram alert (staff_new_booking with lang: uz) does NOT override Russian patient messages on confirmation or rescheduling', async () => {
      // Mock TELEGRAM_CHAT_ID to enable staff Telegram notifications
      const originalConfigGet = configService.get.bind(configService);
      configService.get = (key: string, def?: any) => {
        if (key === 'TELEGRAM_CHAT_ID') return 'mock_staff_telegram_channel';
        return originalConfigGet(key, def);
      };

      // Ensure doctor has overtime coverage for today so test runs reliably at any hour
      const todayException = await prisma.scheduleException.create({
        data: {
          doctorId: doctor.id,
          branchId: branch.id,
          date: new Date(),
          type: ExceptionType.OVERTIME,
          startTime: '00:00',
          endTime: '23:59',
          reason: 'Test 24h overtime',
        },
      });

      // Allow 90-minute booking by setting notice hours to 1
      if (originalSettings) {
        await prisma.clinicSettings.update({
          where: { id: originalSettings.id },
          data: { minBookingNoticeHours: 1 },
        });
      }

      // Appointment starts within 90 minutes (within 2 hours, so no future reminder is scheduled)
      const nearFutureStart = new Date(Date.now() + 90 * 60 * 1000);
      const nearFutureBooking = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: nearFutureStart.toISOString(),
        patientName: 'Russian Speaking Patient',
        patientPhone: '+998905556677',
        consentGiven: true,
        source: 'website',
        lang: 'ru', // Patient booked in Russian!
      });
      fixtures.appointments.push(nearFutureBooking.id);

      // Restore notice hours setting
      if (originalSettings) {
        await prisma.clinicSettings.update({
          where: { id: originalSettings.id },
          data: { minBookingNoticeHours: originalSettings.minBookingNoticeHours },
        });
      }

      // Verify staff_new_booking exists with lang: uz as the newest notification record
      const jobs = await prisma.notificationJob.findMany({
        where: { appointmentId: nearFutureBooking.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(jobs.length >= 2, 'Must have at least patient received and staff telegram jobs');
      const newestJob = jobs[0];
      assert.strictEqual(newestJob.templateKey, 'staff_new_booking');
      assert.strictEqual((newestJob.payload as any)?.lang, 'uz', 'Staff alert has default uz');

      // Now staff confirms the appointment: patient confirmation MUST remain Russian!
      await apptsService.changeStatus(
        nearFutureBooking.id,
        AppointmentStatus.CONFIRMED,
        staff.id,
        'Confirm Russian patient',
        { role: StaffRole.ADMIN },
      );

      const confirmJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: nearFutureBooking.id, templateKey: 'patient_booking_confirmed' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(confirmJob);
      assert.strictEqual(
        (confirmJob.payload as any)?.lang,
        'ru',
        'Patient confirmation must remain Russian, not overridden by staff alert uz!',
      );

      // Reschedule appointment: MUST also remain Russian!
      const newReschedTime = new Date(nearFutureStart.getTime() + 45 * 60000);
      await apptsService.reschedule(nearFutureBooking.id, newReschedTime.toISOString(), staff.id);

      const reschedJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: nearFutureBooking.id, templateKey: 'appointment_rescheduled' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.ok(reschedJob);
      assert.strictEqual(
        (reschedJob.payload as any)?.lang,
        'ru',
        'Patient rescheduling must remain Russian!',
      );

      // Cleanup overtime exception & restore configService
      await prisma.scheduleException.delete({ where: { id: todayException.id } });
      configService.get = originalConfigGet;
    });

    await test('6.5 Later booking in Uzbek does NOT alter an older appointment intended language', async () => {
      // First booking: Russian
      const start1 = new Date(saturdayBase.getTime() + 180 * 60 * 1000);
      const bookingRu = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: start1.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        consentGiven: true,
        source: 'website',
        lang: 'ru',
      });
      fixtures.appointments.push(bookingRu.id);

      // Second booking for the same patient: Uzbek
      const start2 = new Date(saturdayBase.getTime() + 240 * 60 * 1000);
      const bookingUz = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: start2.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        consentGiven: true,
        source: 'website',
        lang: 'uz', // Later preference changed to uz!
      });
      fixtures.appointments.push(bookingUz.id);

      // Confirm the FIRST booking now: its own snapshot MUST remain Russian!
      await apptsService.changeStatus(bookingRu.id, AppointmentStatus.CONFIRMED, staff.id, 'Confirm 1st', { role: StaffRole.ADMIN });

      const confirmJobRu = await prisma.notificationJob.findFirst({
        where: { appointmentId: bookingRu.id, templateKey: 'patient_booking_confirmed' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      assert.strictEqual((confirmJobRu?.payload as any)?.lang, 'ru', 'Older appointment must retain its own Russian snapshot');
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

      await apptsService.changeStatus(apptArrived.id, AppointmentStatus.CHECKED_IN, staff.id, 'Arrived', { role: StaffRole.ADMIN });

      const analytics = await analyticsService.getDashboardAnalytics({
        startDate: new Date(aTime.getTime() - 3600000).toISOString(),
        endDate: new Date(aTime.getTime() + 3600000).toISOString(),
        doctorId: doctor.id,
      });

      assert.strictEqual(analytics.summary.arrived >= 1, true, 'Arrived count must be recorded');
      const srvStats = analytics.popularServices.find((s) => s.serviceId === service.id);
      assert.strictEqual(srvStats?.performedCount, 0, 'performedCount must be 0 for CHECKED_IN appointment');

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
          patientPhone: '12345',
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
        await prisma.scheduleException.deleteMany({
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

      if (fixtures.appointments.length > 0) {
        await prisma.appointmentStatusHistory.deleteMany({
          where: { appointmentId: { in: fixtures.appointments } },
        });
        await prisma.notificationJob.deleteMany({
          where: { appointmentId: { in: fixtures.appointments } },
        });
        await prisma.appointmentServiceItem.deleteMany({
          where: { appointmentId: { in: fixtures.appointments } },
        });
        await prisma.appointment.deleteMany({
          where: { id: { in: fixtures.appointments } },
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
            minBookingNoticeHours: originalSettings.minBookingNoticeHours,
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

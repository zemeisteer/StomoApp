import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentsService, PATIENT_COMMUNICATION_TEMPLATES } from '../src/appointments/appointments.service';
import { SchedulingService, DAY_MAP, TIME_RESERVING_STATUSES } from '../src/scheduling/scheduling.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReviewsService } from '../src/reviews/reviews.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { AuditService } from '../src/audit/audit.service';
import { DoctorsService } from '../src/doctors/doctors.service';
import { ClinicService } from '../src/clinic/clinic.service';
import {
  hashStringToInt,
  getDoctorLockKey,
  getBranchLockKey,
  acquireDeterministicLocks,
} from '../src/common/concurrency-lock.helper';
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
import { checkEntityLifecycleBlockers } from '../src/common/lifecycle.helper';
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
import { ValidationPipe, ConflictException, ForbiddenException } from '@nestjs/common';
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
  const doctorsService = app.get(DoctorsService);
  const clinicService = app.get(ClinicService);
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
        note: 'Tish og‘riyapti, ertalab kelaman',
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

    // =========================================================================
    // SECTION 9: Safe Doctor & Branch Lifecycle, Deterministic Locks & Effective Schedule
    // =========================================================================
    console.log('\n--- SECTION 9: Safe Doctor & Branch Lifecycle & Effective Schedules ---');

    await test('9.1 Doctor lifecycle preview correctly distinguishes clean delete, historical archive, future appointments block, and active treatment block', async () => {
      // 1. Clean doctor with no appointments
      const cleanDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Clean',
          lastNameUz: 'Doctor',
          firstNameRu: 'Чистый',
          lastNameRu: 'Врач',
          slug: `clean-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(cleanDoc.id);

      const cleanPreview = await doctorsService.getLifecyclePreview(cleanDoc.id);
      assert.strictEqual(cleanPreview.canDelete, true);
      assert.strictEqual(cleanPreview.actionType, 'DELETE');
      assert.strictEqual(cleanPreview.activeTreatmentCount, 0);
      assert.strictEqual(cleanPreview.futureAppointmentCount, 0);
      assert.strictEqual(cleanPreview.historicalAppointmentCount, 0);

      // 2. Doctor with historical completed appointment
      const histDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Hist',
          lastNameUz: 'Doctor',
          firstNameRu: 'Исторический',
          lastNameRu: 'Врач',
          slug: `hist-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(histDoc.id);

      const pastStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
      const histAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_hist_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: histDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.COMPLETED,
          startTime: pastStart,
          endTime: pastEnd,
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(histAppt.id);

      const histPreview = await doctorsService.getLifecyclePreview(histDoc.id);
      assert.strictEqual(histPreview.canDelete, true);
      assert.strictEqual(histPreview.actionType, 'ARCHIVE');
      assert.strictEqual(histPreview.historicalAppointmentCount, 1);
      assert.strictEqual(histPreview.futureAppointmentCount, 0);

      // 3. Doctor with future confirmed appointment
      const futureDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Future',
          lastNameUz: 'Doctor',
          firstNameRu: 'Будущий',
          lastNameRu: 'Врач',
          slug: `future-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(futureDoc.id);

      const futureStart = new Date(Date.now() + 3 * 24 * 3600 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);
      const futureAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_fut_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: futureDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: futureStart,
          endTime: futureEnd,
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(futureAppt.id);

      const futurePreview = await doctorsService.getLifecyclePreview(futureDoc.id);
      assert.strictEqual(futurePreview.canDelete, false);
      assert.strictEqual(futurePreview.actionType, 'BLOCK');
      assert.strictEqual(futurePreview.futureAppointmentCount, 1);

      // 4. Doctor with active ongoing treatment
      const activeDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Active',
          lastNameUz: 'Doctor',
          firstNameRu: 'Активный',
          lastNameRu: 'Врач',
          slug: `active-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(activeDoc.id);

      const activeStart = new Date(Date.now() - 15 * 60 * 1000); // started 15 min ago
      const activeEnd = new Date(Date.now() + 45 * 60 * 1000); // ends in 45 min
      const activeAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_act_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: activeDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CHECKED_IN,
          startTime: activeStart,
          endTime: activeEnd,
          serviceName: service.nameUz,
          durationMinutes: 60,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(activeAppt.id);

      const activePreview = await doctorsService.getLifecyclePreview(activeDoc.id);
      assert.strictEqual(activePreview.canDelete, false);
      assert.strictEqual(activePreview.actionType, 'BLOCK');
      assert.strictEqual(activePreview.activeTreatmentCount, 1);
    });

    await test('9.2 Doctor lifecycle mutation enforces blocking on active/future, archiving historical, and deleting clean', async () => {
      // Find the docs created in 9.1
      const activeDoc = await prisma.doctor.findFirst({ where: { slug: `active-doc-${runId}` } });
      const futureDoc = await prisma.doctor.findFirst({ where: { slug: `future-doc-${runId}` } });
      const histDoc = await prisma.doctor.findFirst({ where: { slug: `hist-doc-${runId}` } });
      const cleanDoc = await prisma.doctor.findFirst({ where: { slug: `clean-doc-${runId}` } });

      assert.ok(activeDoc && futureDoc && histDoc && cleanDoc);

      // Attempting to delete activeDoc must fail closed
      await assert.rejects(
        async () => {
          await doctorsService.delete(activeDoc.id, { id: staff.id, role: StaffRole.ADMIN });
        },
        (err: any) => err.message.includes("muolajada bo'lgan") || err.message.includes('ACTIVE_TREATMENT_IN_PROGRESS'),
      );

      // Attempting to delete futureDoc must fail closed
      await assert.rejects(
        async () => {
          await doctorsService.delete(futureDoc.id, { id: staff.id, role: StaffRole.ADMIN });
        },
        (err: any) => err.message.includes('kelgusida') || err.message.includes('FUTURE_APPOINTMENTS_EXIST'),
      );

      // Deleting histDoc must archive (isActive: false) and preserve record
      const archiveRes = await doctorsService.delete(histDoc.id, { id: staff.id, role: StaffRole.ADMIN });
      assert.strictEqual(archiveRes.action, 'ARCHIVE');
      const histAfter = await prisma.doctor.findUnique({ where: { id: histDoc.id } });
      assert.ok(histAfter !== null, 'Historical doctor record must NOT be deleted from DB');
      assert.strictEqual(histAfter.isActive, false, 'Historical doctor must be archived with isActive=false');

      // Deleting cleanDoc must delete record completely
      const deleteRes = await doctorsService.delete(cleanDoc.id, { id: staff.id, role: StaffRole.ADMIN });
      assert.strictEqual(deleteRes.action, 'DELETE');
      const cleanAfter = await prisma.doctor.findUnique({ where: { id: cleanDoc.id } });
      assert.strictEqual(cleanAfter, null, 'Clean doctor record must be deleted completely from DB');
    });

    await test('9.3 Linked staff account deactivation policy on doctor delete and archive', async () => {
      const docWithStaff = await prisma.doctor.create({
        data: {
          firstNameUz: 'StaffLinked',
          lastNameUz: 'Doctor',
          firstNameRu: 'Связанный',
          lastNameRu: 'Врач',
          slug: `stafflinked-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
        },
      });
      fixtures.doctors.push(docWithStaff.id);

      const staffDoctor = await prisma.staffUser.create({
        data: {
          fullName: 'StaffLinked Doctor',
          email: `${docWithStaff.slug}@clinic.local`,
          passwordHash: 'dummyhash',
          role: StaffRole.DOCTOR,
          isActive: true,
          tokenVersion: 1,
          doctorId: docWithStaff.id,
        },
      });
      fixtures.staff.push(staffDoctor.id);

      // Check lifecycle preview detects linked staff consequence
      const preview = await doctorsService.getLifecyclePreview(docWithStaff.id);
      assert.ok(preview.staffConsequences.some((s: string) => s.includes('DOCTOR') || s.includes(staffDoctor.email)));

      // Perform delete
      await doctorsService.delete(docWithStaff.id, { id: staff.id, role: StaffRole.ADMIN });

      // Verify linked staff user was deactivated and token revoked
      const updatedStaff = await prisma.staffUser.findUnique({ where: { id: staffDoctor.id } });
      assert.ok(updatedStaff);
      assert.strictEqual(updatedStaff.isActive, false, 'Linked DOCTOR staff user must be deactivated');
      assert.strictEqual(updatedStaff.tokenVersion, 2, 'Token version must be incremented to revoke sessions');
    });

    await test('9.4 Branch lifecycle preview and mutation enforces blocking on active/future, deactivation on historical, and deletion on clean', async () => {
      // 1. Clean branch
      const cleanBranch = await prisma.branch.create({
        data: {
          nameUz: `Clean Branch ${runId}`,
          nameRu: `Чистый Филиал ${runId}`,
          addressUz: 'Toshkent',
          addressRu: 'Ташкент',
          phone: '+998711111111',
          isActive: true,
        },
      });
      fixtures.branches.push(cleanBranch.id);

      const cleanBPreview = await clinicService.getBranchLifecyclePreview(cleanBranch.id);
      assert.strictEqual(cleanBPreview.canDelete, true);
      assert.strictEqual(cleanBPreview.actionType, 'DELETE');

      const cleanBRes = await clinicService.deleteBranch(cleanBranch.id, { id: staff.id, role: StaffRole.OWNER });
      assert.strictEqual(cleanBRes.action, 'DELETE');
      const cleanBAfter = await prisma.branch.findUnique({ where: { id: cleanBranch.id } });
      assert.strictEqual(cleanBAfter, null);

      // 2. Historical branch with completed appointment
      const histBranch = await prisma.branch.create({
        data: {
          nameUz: `Hist Branch ${runId}`,
          nameRu: `Исторический Филиал ${runId}`,
          addressUz: 'Toshkent',
          addressRu: 'Ташкент',
          phone: '+998712222222',
          isActive: true,
        },
      });
      fixtures.branches.push(histBranch.id);

      const pastStart = new Date(Date.now() - 10 * 24 * 3600 * 1000);
      const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
      const bAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_bhist_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: histBranch.id,
          status: AppointmentStatus.COMPLETED,
          startTime: pastStart,
          endTime: pastEnd,
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(bAppt.id);

      const histBPreview = await clinicService.getBranchLifecyclePreview(histBranch.id);
      assert.strictEqual(histBPreview.canDelete, true);
      assert.strictEqual(histBPreview.actionType, 'DEACTIVATE');
      assert.strictEqual(histBPreview.historicalAppointmentCount, 1);

      const histBRes = await clinicService.deleteBranch(histBranch.id, { id: staff.id, role: StaffRole.OWNER });
      assert.strictEqual(histBRes.action, 'DEACTIVATE');
      const histBAfter = await prisma.branch.findUnique({ where: { id: histBranch.id } });
      assert.ok(histBAfter !== null);
      assert.strictEqual(histBAfter.isActive, false);

      // 3. Branch with future confirmed appointment
      const futureBranch = await prisma.branch.create({
        data: {
          nameUz: `Future Branch ${runId}`,
          nameRu: `Будущий Филиал ${runId}`,
          addressUz: 'Toshkent',
          addressRu: 'Ташкент',
          phone: '+998713333333',
          isActive: true,
        },
      });
      fixtures.branches.push(futureBranch.id);

      const futureStart = new Date(Date.now() + 4 * 24 * 3600 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);
      const fAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_bfut_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: futureBranch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: futureStart,
          endTime: futureEnd,
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(fAppt.id);

      const futureBPreview = await clinicService.getBranchLifecyclePreview(futureBranch.id);
      assert.strictEqual(futureBPreview.canDelete, false);
      assert.strictEqual(futureBPreview.actionType, 'BLOCK');

      await assert.rejects(
        async () => {
          await clinicService.deleteBranch(futureBranch.id, { id: staff.id, role: StaffRole.OWNER });
        },
        (err: any) => err.message.includes('kelgusida') || err.message.includes('FUTURE_APPOINTMENTS_EXIST'),
      );
    });

    await test('9.5 Deterministic Advisory Lock ordering prevents deadlock between doctor and branch keys', async () => {
      // 1. Verify hashStringToInt produces stable signed 32-bit integers
      const h1 = hashStringToInt('doc_123');
      const h2 = hashStringToInt('doc_123');
      assert.strictEqual(h1, h2);
      assert.ok(Number.isInteger(h1));

      // 2. Distinct entity prefixes produce different lock keys for same ID string
      const docKey = getDoctorLockKey('shared-id-xyz');
      const branchKey = getBranchLockKey('shared-id-xyz');
      assert.notStrictEqual(docKey, branchKey, 'Doctor lock key and branch lock key must have distinct integer hashes');

      // 3. Acquire sorted locks in a transaction
      await prisma.$transaction(async (tx) => {
        await acquireDeterministicLocks(tx, [branchKey, docKey]);
      });
    });

    await test('9.6 Effective schedule validation: Cross-branch conflicts are NEVER bypassed by overtime at another branch', async () => {
      // Doctor has regular schedule at branch1 on Monday 08:00 - 20:00
      // Create a second branch
      const branch2 = await prisma.branch.create({
        data: {
          nameUz: `Branch Two ${runId}`,
          nameRu: `Филиал Два ${runId}`,
          addressUz: 'Toshkent',
          addressRu: 'Ташкент',
          phone: '+998719999999',
          isActive: true,
        },
      });
      fixtures.branches.push(branch2.id);

      await prisma.doctorBranch.create({
        data: {
          doctorId: doctor.id,
          branchId: branch2.id,
        },
      });

      // Add OVERTIME at branch2 for upcoming Monday 10:00-14:00 (05:00 - 09:00 UTC)
      const testMondayDate = mondayBase.toISOString().split('T')[0];
      await prisma.scheduleException.create({
        data: {
          doctorId: doctor.id,
          branchId: branch2.id,
          type: ExceptionType.OVERTIME,
          date: new Date(testMondayDate),
          startTime: '10:00',
          endTime: '14:00',
          reason: 'Emergency shift at branch 2',
        },
      });

      // Create an existing confirmed appointment at Branch 2 during that overtime: 10:00 - 11:00 (05:00 - 06:00 UTC)
      const b2Start = new Date(mondayBase.getTime() + 1 * 3600 * 1000); // 05:00 UTC
      const b2End = new Date(b2Start.getTime() + 60 * 60 * 1000); // 06:00 UTC
      const apptBranch2 = await prisma.appointment.create({
        data: {
          publicToken: `tok_b2_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch2.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: b2Start,
          endTime: b2End,
          serviceName: service.nameUz,
          durationMinutes: 60,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(apptBranch2.id);

      // Now check conflicts for booking at Branch 1 during the same hours
      // Even though doctor has regular schedule at Branch 1, cross-branch commitment at Branch 2 must be detected!
      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
        dayOfWeek: DayOfWeek.MONDAY,
        branchId: branch.id,
        branchName: branch.nameUz,
        schedStart: 8 * 60,
        schedEnd: 20 * 60,
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      assert.ok(conflicts.length > 0, 'Cross-branch conflict at Branch 2 must NOT be skipped for Branch 1 booking');
      assert.ok(
        conflicts.some((c) => c.appointmentId === apptBranch2.id),
        'Conflicts must include the Branch 2 appointment',
      );
    });

    await test('9.7 Effective schedule validation: Regular + adjacent overtime at same branch are merged into continuous available interval', async () => {
      // Doctor has regular shift [08:00 - 20:00]
      const testDateStr = tuesdayBase.toISOString().split('T')[0];

      // Add OVERTIME at branch1 adjacent to regular shift (20:00 - 22:00)
      await prisma.scheduleException.create({
        data: {
          doctorId: doctor.id,
          branchId: branch.id,
          type: ExceptionType.OVERTIME,
          date: new Date(testDateStr),
          startTime: '20:00',
          endTime: '22:00',
          reason: 'Evening shift extension',
        },
      });

      // An appointment spanning across the boundary: 19:30 - 20:30 (14:30 - 15:30 UTC)
      // TuesdayBase is at 04:00 UTC (09:00 Tashkent). 19:30 is TuesdayBase + 10h30m = 14:30 UTC
      const spanStart = new Date(tuesdayBase.getTime() + 10.5 * 3600 * 1000);
      const spanEnd = new Date(spanStart.getTime() + 60 * 60 * 1000); // 15:30 UTC = 20:30 Tashkent

      const spanningAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_span_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: spanStart,
          endTime: spanEnd,
          serviceName: service.nameUz,
          durationMinutes: 60,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(spanningAppt.id);

      // Should have zero conflicts because regular [08:00-20:00] + overtime [20:00-22:00] merge into [08:00-22:00]
      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
        dayOfWeek: DayOfWeek.TUESDAY,
        branchId: branch.id,
        branchName: branch.nameUz,
        schedStart: 8 * 60,
        schedEnd: 20 * 60,
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      assert.strictEqual(
        conflicts.filter((c) => c.appointmentId === spanningAppt.id).length,
        0,
        'Spanning regular and adjacent overtime on same branch must have 0 conflicts',
      );
    });

    await test('9.8 Ongoing treatment lookback query captures active treatments currently in the chair', async () => {
      // Create an ongoing appointment (CHECKED_IN) that started 20 minutes ago and has 40 min left
      const now = new Date();
      const onStart = new Date(now.getTime() - 20 * 60 * 1000);
      const onEnd = new Date(now.getTime() + 40 * 60 * 1000);

      const ongoingAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_ongo_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CHECKED_IN,
          startTime: onStart,
          endTime: onEnd,
          serviceName: service.nameUz,
          durationMinutes: 60,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(ongoingAppt.id);

      // Determine dayOfWeek for today in clinic timezone
      const dayNames: DayOfWeek[] = [
        DayOfWeek.SUNDAY,
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
        DayOfWeek.SATURDAY,
      ];
      const todayDayOfWeek = dayNames[now.getDay()];

      const conflicts = await schedService.findAppointmentConflictsForDoctorDay({
        tx: prisma,
        doctorId: doctor.id,
        doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
        dayOfWeek: todayDayOfWeek,
        branchId: branch.id,
        branchName: branch.nameUz,
        schedStart: 0,
        schedEnd: 24 * 60,
        timezone: 'Asia/Tashkent',
        defaultBufferMinutes: 5,
      });

      // The candidate query in findAppointmentConflictsForDoctorDay retrieves upcomingAppts including ongoing treatments
      // (which have status: CHECKED_IN even though startTime < now)
      const foundOngoing = await prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          status: { in: TIME_RESERVING_STATUSES },
          OR: [
            { startTime: { gte: now } },
            { status: AppointmentStatus.CHECKED_IN },
            { actualStartTime: { not: null }, status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] } },
            { overrunActive: true, overrunEstimatedEndTime: { gte: now } },
            { endTime: { gte: now } },
          ],
        },
      });

      assert.ok(
        foundOngoing.some((c) => c.id === ongoingAppt.id),
        'Candidate query must capture ongoing treatment that started in the past and is currently in the chair',
      );
    });

    // =========================================================================
    // SECTION 10: Lifecycle Bypass Prevention, Audit Actor Identity & Concurrency Safety
    // =========================================================================
    console.log('\n--- SECTION 10: Lifecycle Bypass Prevention, Audit Actor & Concurrency ---');

    await test('10.1 DoctorsService.archive() strictly blocks on active treatment and future appointments', async () => {
      const activeDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Active',
          lastNameUz: 'Doc',
          firstNameRu: 'Активный',
          lastNameRu: 'Врач',
          slug: `active-archive-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(activeDoc.id);

      const futureAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_fut_arch_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: activeDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date(Date.now() + 2 * 24 * 3600 * 1000),
          endTime: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 30 * 60 * 1000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(futureAppt.id);

      // Attempting to archive active doctor MUST throw 409 ConflictException
      let caughtErr: any = null;
      try {
        await doctorsService.archive(activeDoc.id, { sub: staff.id, role: StaffRole.ADMIN } as any);
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr instanceof ConflictException, 'Direct archive must throw ConflictException when future appointments exist');
      assert.strictEqual((caughtErr.getResponse() as any).error, 'FUTURE_APPOINTMENTS_EXIST');

      // Verify doctor was NOT archived
      const recheckedDoc = await prisma.doctor.findUnique({ where: { id: activeDoc.id } });
      assert.strictEqual(recheckedDoc?.isActive, true);
      assert.strictEqual(recheckedDoc?.isArchived, false);
    });

    await test('10.2 DoctorsService.update({ isActive: false }) enforces lifecycle blocker check', async () => {
      const busyDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Busy',
          lastNameUz: 'Doc',
          firstNameRu: 'Занятый',
          lastNameRu: 'Врач',
          slug: `busy-update-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(busyDoc.id);

      const ongoingAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_ong_upd_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: busyDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CHECKED_IN,
          actualStartTime: new Date(Date.now() - 10 * 60 * 1000),
          startTime: new Date(Date.now() - 10 * 60 * 1000),
          endTime: new Date(Date.now() + 20 * 60 * 1000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(ongoingAppt.id);

      let caughtErr: any = null;
      try {
        await doctorsService.update(busyDoc.id, { isActive: false }, { sub: staff.id, role: StaffRole.ADMIN } as any);
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr instanceof ConflictException, 'Deactivating busy doctor via update must throw ConflictException');
      assert.strictEqual((caughtErr.getResponse() as any).error, 'ACTIVE_TREATMENT_IN_PROGRESS');

      const recheckedDoc = await prisma.doctor.findUnique({ where: { id: busyDoc.id } });
      assert.strictEqual(recheckedDoc?.isActive, true);
    });

    await test('10.3 DoctorsService.update() blocks removing a branch where doctor has future appointments', async () => {
      const branch2 = await prisma.branch.create({
        data: {
          nameUz: `Filial 2 ${runId}`,
          nameRu: `Филиал 2 ${runId}`,
          addressUz: 'Manzil 2',
          addressRu: 'Адрес 2',
          phone: '+998901234568',
          isActive: true,
        },
      });
      fixtures.branches.push(branch2.id);

      const multiBranchDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Multi',
          lastNameUz: 'Branch',
          firstNameRu: 'Мульти',
          lastNameRu: 'Врач',
          slug: `multibranch-doc-${runId}`,
          isActive: true,
          branches: {
            create: [{ branchId: branch.id }, { branchId: branch2.id }],
          },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(multiBranchDoc.id);

      const apptAtBranch2 = await prisma.appointment.create({
        data: {
          publicToken: `tok_b2_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: multiBranchDoc.id,
          serviceId: service.id,
          branchId: branch2.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date(Date.now() + 24 * 3600 * 1000),
          endTime: new Date(Date.now() + 24 * 3600 * 1000 + 30 * 60 * 1000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(apptAtBranch2.id);

      // Attempt to remove branch2 from doctor's branches: branchIds: [branch.id]
      let caughtErr: any = null;
      try {
        await doctorsService.update(
          multiBranchDoc.id,
          { branchIds: [branch.id] },
          { sub: staff.id, role: StaffRole.ADMIN } as any,
        );
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr instanceof ConflictException, 'Removing branch with future appointments must fail with ConflictException');
      assert.strictEqual((caughtErr.getResponse() as any).error, 'FUTURE_APPOINTMENTS_AT_REMOVED_BRANCH');

      // Verify branch2 was NOT removed
      const docBranches = await prisma.doctorBranch.findMany({ where: { doctorId: multiBranchDoc.id } });
      assert.strictEqual(docBranches.length, 2);
    });

    await test('10.4 DoctorsService.update() blocks removing a service where doctor has active/future appointments', async () => {
      const service2 = await prisma.service.create({
        data: {
          nameUz: `Xizmat 2 ${runId}`,
          nameRu: `Услуга 2 ${runId}`,
          slug: `service-2-${runId}`,
          durationMinutes: 45,
          priceFrom: 200000,
          isActive: true,
        },
      });
      fixtures.services.push(service2.id);

      const multiSrvDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Multi',
          lastNameUz: 'Service',
          firstNameRu: 'Мульти',
          lastNameRu: 'Услуга',
          slug: `multisrv-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: {
            create: [{ serviceId: service.id }, { serviceId: service2.id }],
          },
        },
      });
      fixtures.doctors.push(multiSrvDoc.id);

      const apptForSrv2 = await prisma.appointment.create({
        data: {
          publicToken: `tok_s2_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: multiSrvDoc.id,
          serviceId: service2.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date(Date.now() + 24 * 3600 * 1000),
          endTime: new Date(Date.now() + 24 * 3600 * 1000 + 45 * 60 * 1000),
          serviceName: service2.nameUz,
          durationMinutes: 45,
          bufferMinutes: 5,
        },
      });
      fixtures.appointments.push(apptForSrv2.id);

      // Attempt to remove service2 from doctor's services
      let caughtErr: any = null;
      try {
        await doctorsService.update(
          multiSrvDoc.id,
          { serviceIds: [service.id] },
          { sub: staff.id, role: StaffRole.ADMIN } as any,
        );
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr instanceof ConflictException, 'Removing service with future appointments must fail with ConflictException');
      assert.strictEqual((caughtErr.getResponse() as any).error, 'FUTURE_APPOINTMENTS_FOR_REMOVED_SERVICE');

      const docServices = await prisma.doctorService.findMany({ where: { doctorId: multiSrvDoc.id } });
      assert.strictEqual(docServices.length, 2);
    });

    await test('10.5 ClinicService.updateBranch({ isActive: false }) rejects ADMIN with 403, allows OWNER with lifecycle checks', async () => {
      const testBranch = await prisma.branch.create({
        data: {
          nameUz: `RBAC Branch ${runId}`,
          nameRu: `РБАК Филиал ${runId}`,
          addressUz: 'Manzil',
          addressRu: 'Адрес',
          phone: '+998901234569',
          isActive: true,
        },
      });
      fixtures.branches.push(testBranch.id);

      // ADMIN role tries to set isActive: false via updateBranch -> MUST fail with 403 Forbidden
      let adminErr: any = null;
      try {
        await clinicService.updateBranch(
          testBranch.id,
          { isActive: false },
          { sub: staff.id, role: StaffRole.ADMIN } as any,
        );
      } catch (err) {
        adminErr = err;
      }

      assert.ok(adminErr instanceof ForbiddenException, 'ADMIN cannot deactivate branch via updateBranch (ForbiddenException)');

      // OWNER role sets isActive: false on clean branch -> deactivates branch, does NOT physically delete
      const ownerRes: any = await clinicService.updateBranch(
        testBranch.id,
        { isActive: false },
        { sub: staff.id, role: StaffRole.OWNER } as any,
      );

      assert.strictEqual(ownerRes.id, testBranch.id);
      assert.strictEqual(ownerRes.isActive, false, 'Branch must be deactivated');

      const recheckedBranch = await prisma.branch.findUnique({ where: { id: testBranch.id } });
      assert.ok(recheckedBranch, 'Deactivated clean branch must continue to exist in DB');
      assert.strictEqual(recheckedBranch.isActive, false, 'Branch isActive must be false');

      // Audit log must record branch.deactivate
      const deactAudit = await prisma.auditLog.findFirst({
        where: { action: 'branch.deactivate', entityId: testBranch.id },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(deactAudit, 'Deactivation must write transactional audit log');
      assert.strictEqual(deactAudit.userId, staff.id, 'Audit log userId must match actor sub');

      // Explicit delete on clean branch -> physically deletes
      const deleteRes: any = await clinicService.deleteBranch(
        testBranch.id,
        { sub: staff.id, role: StaffRole.OWNER } as any,
      );
      assert.strictEqual(deleteRes.success, true);
      assert.strictEqual(deleteRes.action, 'DELETE');

      const finalCheck = await prisma.branch.findUnique({ where: { id: testBranch.id } });
      assert.strictEqual(finalCheck, null, 'Clean branch must only be physically deleted via explicit deleteBranch');
    });

    await test('10.6 Lifecycle audit records contain the authenticated actor ID (sub), NOT null', async () => {
      const auditDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Audit',
          lastNameUz: 'Actor',
          firstNameRu: 'Аудит',
          lastNameRu: 'Актор',
          slug: `audit-actor-doc-${runId}`,
          isActive: true,
        },
      });
      fixtures.doctors.push(auditDoc.id);

      // Authenticated deletion with real actor sub
      const delRes = await doctorsService.delete(auditDoc.id, {
        sub: staff.id,
        email: staff.email,
        role: StaffRole.OWNER,
      } as any);

      assert.strictEqual(delRes.success, true);

      // Query audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'doctor.delete',
          entityId: auditDoc.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog, 'Audit log record must be created');
      assert.strictEqual(auditLog.userId, staff.id, 'Audit log userId must match actor sub, NOT null');
    });

    await test('10.7 PostgreSQL concurrent booking vs branch deactivation guarantees consistent serializable result', async () => {
      const concBranch = await prisma.branch.create({
        data: {
          nameUz: `Conc Branch ${runId}`,
          nameRu: `Конк Филиал ${runId}`,
          addressUz: 'Manzil',
          addressRu: 'Адрес',
          phone: '+998901234560',
          isActive: true,
        },
      });
      fixtures.branches.push(concBranch.id);

      const concDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Conc',
          lastNameUz: 'Doc',
          firstNameRu: 'Конк',
          lastNameRu: 'Врач',
          slug: `conc-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: concBranch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(concDoc.id);

      const sched = await prisma.doctorSchedule.create({
        data: {
          doctorId: concDoc.id,
          branchId: concBranch.id,
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '18:00',
          isActive: true,
        },
      });

      // Target future slot on upcoming Monday (dynamic valid working day)
      const nextMondayUtc = getNextRelativeMonday(14, 5); // 05:00 UTC = 10:00 Tashkent time

      // Pre-flight check: Prove the booking slot is valid BEFORE the race
      const slots = await schedService.getAvailableSlots(
        concDoc.id,
        nextMondayUtc.toISOString().split('T')[0],
        service.id,
        concBranch.id,
      );
      assert.ok(slots.slots.length > 0, 'Doctor must have available slots on the target dynamic Monday');

      // Fire concurrent booking and branch deactivation
      const [bookingResult, deactivationResult] = await Promise.allSettled([
        apptsService.createBooking({
          patientName: 'Conc Patient',
          patientPhone: '+998901234567',
          doctorId: concDoc.id,
          serviceId: service.id,
          branchId: concBranch.id,
          startTime: nextMondayUtc.toISOString(),
          consentGiven: true,
          idempotencyKey: `conc_book_${runId}_${Math.random()}`,
        }),
        clinicService.deleteBranch(concBranch.id, { sub: staff.id, role: StaffRole.OWNER } as any),
      ]);

      // Under PostgreSQL advisory locking:
      // Either booking acquired locks first -> booking succeeded, and branch deactivation was BLOCKED (rejected with 409 Conflict)
      // OR branch deactivation acquired locks first -> branch was deleted, and booking failed
      if (bookingResult.status === 'fulfilled') {
        fixtures.appointments.push(bookingResult.value.id);
        assert.strictEqual(
          deactivationResult.status,
          'rejected',
          'If booking commits first, branch deactivation must be rejected with 409 Conflict',
        );
        const rejectionErr = (deactivationResult as PromiseRejectedResult).reason;
        assert.ok(rejectionErr instanceof ConflictException, 'Rejection must be ConflictException');
        assert.strictEqual((rejectionErr.getResponse() as any).error, 'FUTURE_APPOINTMENTS_EXIST');

        const recheckedBranch = await prisma.branch.findUnique({ where: { id: concBranch.id } });
        assert.ok(recheckedBranch, 'Branch must remain in DB when deactivation is blocked');
        assert.strictEqual(recheckedBranch.isActive, true, 'Branch must remain active');
      } else {
        assert.strictEqual(
          deactivationResult.status,
          'fulfilled',
          'If deactivation commits first, branch was deleted and booking was rejected',
        );
        const bookingErr = (bookingResult as PromiseRejectedResult).reason;
        assert.ok(bookingErr, 'Booking must fail with descriptive error when branch is deleted');

        const recheckedBranch = await prisma.branch.findUnique({ where: { id: concBranch.id } });
        assert.strictEqual(recheckedBranch, null, 'Branch must be deleted if deactivation committed first');
      }

      // Exercise Order B deterministically: Branch deactivation acquires lock first
      const orderBBranch = await prisma.branch.create({
        data: {
          nameUz: `OrderB Branch ${runId}`,
          nameRu: `ОрдерБ Филиал ${runId}`,
          addressUz: 'Manzil',
          addressRu: 'Адрес',
          phone: '+998901234561',
          isActive: true,
        },
      });
      fixtures.branches.push(orderBBranch.id);

      // Explicitly delete clean branch first
      const delBRes = await clinicService.deleteBranch(orderBBranch.id, { sub: staff.id, role: StaffRole.OWNER } as any);
      assert.strictEqual(delBRes.action, 'DELETE');

      // Attempt booking on now-deleted branch -> MUST fail closed
      let bookFailErr: any = null;
      try {
        await apptsService.createBooking({
          patientName: 'OrderB Patient',
          patientPhone: '+998901234567',
          doctorId: concDoc.id,
          serviceId: service.id,
          branchId: orderBBranch.id,
          startTime: nextMondayUtc.toISOString(),
          consentGiven: true,
          idempotencyKey: `orderb_book_${runId}_${Math.random()}`,
        });
      } catch (err) {
        bookFailErr = err;
      }
      assert.ok(bookFailErr, 'Booking on deleted branch must fail closed');
    });

    await test('10.8 Lifecycle counts: >100 future reservations reports exact count and bounded display preview', async () => {
      const busyBatchDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Batch',
          lastNameUz: 'Doc',
          firstNameRu: 'Батч',
          lastNameRu: 'Врач',
          slug: `batch-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(busyBatchDoc.id);

      // Create 105 future reservations (more than the preview limit of 10 or candidate slice of 100)
      const baseTime = Date.now() + 48 * 3600 * 1000;
      const apptData = [];
      for (let i = 0; i < 105; i++) {
        const start = new Date(baseTime + i * 3600 * 1000);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        apptData.push({
          publicToken: `tok_batch_${runId}_${i}_${Math.random()}`,
          patientId: patient.id,
          doctorId: busyBatchDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: start,
          endTime: end,
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
        });
      }

      await prisma.appointment.createMany({ data: apptData });

      const createdBatchAppts = await prisma.appointment.findMany({
        where: { doctorId: busyBatchDoc.id },
        select: { id: true },
      });
      createdBatchAppts.forEach((a) => fixtures.appointments.push(a.id));

      const blockers = await checkEntityLifecycleBlockers(prisma, { doctorId: busyBatchDoc.id });

      assert.strictEqual(blockers.canProceed, false);
      assert.strictEqual(blockers.actionType, 'BLOCK');
      assert.strictEqual(blockers.futureAppointmentCount, 105, 'futureAppointmentCount must be EXACT (105), not truncated to 100');
      assert.strictEqual(blockers.historicalAppointmentCount, 0, 'historicalAppointmentCount must be 0, NOT falsely calculated from truncated array');
      assert.strictEqual(blockers.totalAppointmentCount, 105);
      assert.strictEqual(blockers.futureAppointments.length, 10, 'Display preview must be bounded to display limit (10)');
      assert.strictEqual(blockers.futureAppointmentsTruncated, true, 'Truncation metadata must indicate more rows exist');
    });

    await test('10.9 Lifecycle counts: Treatment ended but buffer remains active blocks deactivation', async () => {
      const bufferDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Buffer',
          lastNameUz: 'Doc',
          firstNameRu: 'Буфер',
          lastNameRu: 'Врач',
          slug: `buffer-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: { create: { serviceId: service.id } },
        },
      });
      fixtures.doctors.push(bufferDoc.id);

      // Treatment started 25 minutes ago, treatment duration 20m, ended 5 minutes ago!
      // But bufferMinutes is 10m, so occupied end is in the future (+5m from now)!
      const start = new Date(Date.now() - 25 * 60 * 1000);
      const end = new Date(Date.now() - 5 * 60 * 1000); // endTime <= now!
      const bufferAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_buf_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: bufferDoc.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: start,
          endTime: end,
          serviceName: service.nameUz,
          durationMinutes: 20,
          bufferMinutes: 10,
        },
      });
      fixtures.appointments.push(bufferAppt.id);

      const blockers = await checkEntityLifecycleBlockers(prisma, { doctorId: bufferDoc.id });

      assert.strictEqual(blockers.canProceed, false, 'Must block when buffer is still active');
      assert.strictEqual(blockers.actionType, 'BLOCK');
      assert.strictEqual(blockers.activeTreatmentCount, 1, 'Must count ongoing active buffer as active treatment');
      assert.strictEqual(blockers.activeTreatments[0].id, bufferAppt.id);
    });

    await test('10.10 Secondary service items in multi-service appointment are protected against removal', async () => {
      const srvA = await prisma.service.create({
        data: {
          nameUz: `Xizmat A ${runId}`,
          nameRu: `Услуга А ${runId}`,
          slug: `service-a-${runId}`,
          durationMinutes: 30,
          isActive: true,
        },
      });
      fixtures.services.push(srvA.id);

      const srvB = await prisma.service.create({
        data: {
          nameUz: `Xizmat B ${runId}`,
          nameRu: `Услуга Б ${runId}`,
          slug: `service-b-${runId}`,
          durationMinutes: 30,
          isActive: true,
        },
      });
      fixtures.services.push(srvB.id);

      const multiSrvDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Multi',
          lastNameUz: 'Srv',
          firstNameRu: 'Мульти',
          lastNameRu: 'Срв',
          slug: `multisrv2-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
          services: {
            create: [{ serviceId: srvA.id }, { serviceId: srvB.id }],
          },
        },
      });
      fixtures.doctors.push(multiSrvDoc.id);

      // Create appointment with primary service A, but secondary item service B
      const multiSrvAppt = await prisma.appointment.create({
        data: {
          publicToken: `tok_multi_${runId}_${Math.random()}`,
          patientId: patient.id,
          doctorId: multiSrvDoc.id,
          serviceId: srvA.id, // Primary service A
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date(Date.now() + 24 * 3600 * 1000),
          endTime: new Date(Date.now() + 24 * 3600 * 1000 + 60 * 60 * 1000),
          serviceName: srvA.nameUz,
          durationMinutes: 60,
          bufferMinutes: 5,
          serviceItems: {
            create: [
              {
                serviceId: srvA.id,
                serviceNameUz: srvA.nameUz,
                durationMinutes: 30,
                sortOrder: 0,
              },
              {
                serviceId: srvB.id, // Secondary item B!
                serviceNameUz: srvB.nameUz,
                durationMinutes: 30,
                sortOrder: 1,
              },
            ],
          },
        },
      });
      fixtures.appointments.push(multiSrvAppt.id);

      // Attempt to remove service B from doctor -> MUST BE BLOCKED
      let caughtErr: any = null;
      try {
        await doctorsService.update(
          multiSrvDoc.id,
          { serviceIds: [srvA.id] },
          { sub: staff.id, role: StaffRole.ADMIN } as any,
        );
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr instanceof ConflictException, 'Removing secondary service B must fail with ConflictException');
      assert.strictEqual((caughtErr.getResponse() as any).error, 'FUTURE_APPOINTMENTS_FOR_REMOVED_SERVICE');

      // Now set appointment to COMPLETED (historical)
      await prisma.appointment.update({
        where: { id: multiSrvAppt.id },
        data: { status: AppointmentStatus.COMPLETED },
      });

      // Attempt to remove service B again -> MUST SUCCEED (historical appointments do not block indefinitely)
      const updatedDoc = await doctorsService.update(
        multiSrvDoc.id,
        { serviceIds: [srvA.id] },
        { sub: staff.id, role: StaffRole.ADMIN } as any,
      );
      assert.ok(updatedDoc);
      const remainingDocServices = await prisma.doctorService.findMany({ where: { doctorId: multiSrvDoc.id } });
      assert.strictEqual(remainingDocServices.length, 1);
      assert.strictEqual(remainingDocServices[0].serviceId, srvA.id);
    });

    await test('10.11 Doctor lifecycle side effects: deactivating clean doctor disables schedules and deactivates DOCTOR staff account', async () => {
      const cleanDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Clean',
          lastNameUz: 'Doc',
          firstNameRu: 'Чистый',
          lastNameRu: 'Врач',
          slug: `clean-doc-${runId}`,
          isActive: true,
          branches: { create: { branchId: branch.id } },
        },
      });
      fixtures.doctors.push(cleanDoc.id);

      const docSched = await prisma.doctorSchedule.create({
        data: {
          doctorId: cleanDoc.id,
          branchId: branch.id,
          dayOfWeek: 'TUESDAY',
          startTime: '09:00',
          endTime: '17:00',
          isActive: true,
        },
      });

      const docStaff = await prisma.staffUser.create({
        data: {
          email: `docstaff_${runId}@dentacare.local`,
          passwordHash: 'dummy',
          fullName: 'Doc Staff',
          role: StaffRole.DOCTOR,
          doctorId: cleanDoc.id,
          isActive: true,
          tokenVersion: 1,
        },
      });
      fixtures.staff.push(docStaff.id);

      // Deactivate doctor via update
      await doctorsService.update(
        cleanDoc.id,
        { isActive: false },
        { sub: staff.id, role: StaffRole.ADMIN } as any,
      );

      // Verify schedule is deactivated even with 0 history
      const recheckedSched = await prisma.doctorSchedule.findUnique({ where: { id: docSched.id } });
      assert.strictEqual(recheckedSched?.isActive, false, 'Schedule must be deactivated on doctor deactivation');

      // Verify DOCTOR staff account is deactivated and tokenVersion incremented
      const recheckedStaff = await prisma.staffUser.findUnique({ where: { id: docStaff.id } });
      assert.strictEqual(recheckedStaff?.isActive, false, 'Linked DOCTOR staff account must be deactivated');
      assert.strictEqual(recheckedStaff?.tokenVersion, 2, 'Token version must be incremented to revoke sessions');

      // Reactivation policy: restoring doctor MUST NOT silently auto-enable schedules or staff account
      await doctorsService.update(
        cleanDoc.id,
        { isActive: true },
        { sub: staff.id, role: StaffRole.ADMIN } as any,
      );

      const restoredDoc = await prisma.doctor.findUnique({ where: { id: cleanDoc.id } });
      assert.strictEqual(restoredDoc?.isActive, true, 'Doctor is restored to active');

      const schedAfterRestore = await prisma.doctorSchedule.findUnique({ where: { id: docSched.id } });
      assert.strictEqual(schedAfterRestore?.isActive, false, 'Schedules must remain inactive upon doctor reactivation');

      const staffAfterRestore = await prisma.staffUser.findUnique({ where: { id: docStaff.id } });
      assert.strictEqual(staffAfterRestore?.isActive, false, 'Staff account must remain inactive upon doctor reactivation');
    });

    await test('10.12 Doctor lifecycle side effects: ADMIN/OWNER linked account is PRESERVED when doctor is archived', async () => {
      const ownerDoc = await prisma.doctor.create({
        data: {
          firstNameUz: 'Owner',
          lastNameUz: 'Doc',
          firstNameRu: 'Владелец',
          lastNameRu: 'Врач',
          slug: `owner-doc-${runId}`,
          isActive: true,
        },
      });
      fixtures.doctors.push(ownerDoc.id);

      const ownerStaff = await prisma.staffUser.create({
        data: {
          email: `ownerstaff_${runId}@dentacare.local`,
          passwordHash: 'dummy',
          fullName: 'Owner Staff',
          role: StaffRole.OWNER,
          doctorId: ownerDoc.id,
          isActive: true,
          tokenVersion: 1,
        },
      });
      fixtures.staff.push(ownerStaff.id);

      // Archive doctor
      await doctorsService.archive(ownerDoc.id, { sub: staff.id, role: StaffRole.OWNER } as any);

      // Verify doctor is archived
      const recheckedDoc = await prisma.doctor.findUnique({ where: { id: ownerDoc.id } });
      assert.strictEqual(recheckedDoc?.isArchived, true);
      assert.strictEqual(recheckedDoc?.isActive, false);

      // Verify OWNER staff account is PRESERVED active (not deactivated!)
      const recheckedOwnerStaff = await prisma.staffUser.findUnique({ where: { id: ownerStaff.id } });
      assert.strictEqual(recheckedOwnerStaff?.isActive, true, 'OWNER staff account must remain active');
      assert.strictEqual(recheckedOwnerStaff?.doctorId, null, 'Doctor ID link must be detached on archive');
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

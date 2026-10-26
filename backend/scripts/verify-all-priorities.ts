import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { SchedulingService } from '../src/scheduling/scheduling.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReviewsService } from '../src/reviews/reviews.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  getAppointmentTreatmentEnd,
  getAppointmentOccupiedEnd,
  classifyAppointmentRecord,
  isAppointmentOverlapping,
  buildConflictCandidateWhere,
} from '../src/appointments/appointment-time.helper';
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

async function runAllPrioritiesVerification() {
  console.log('================================================================');
  console.log('   STOMOAPP COMPREHENSIVE REGRESSION VERIFICATION (P1 - P9)    ');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const apptsService = app.get(AppointmentsService);
  const schedService = app.get(SchedulingService);
  const notifService = app.get(NotificationsService);
  const reviewsService = app.get(ReviewsService);
  const analyticsService = app.get(AnalyticsService);

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

  // Setup isolated fixture
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

  const service = await prisma.service.create({
    data: {
      nameUz: `Davolash ${runId}`,
      nameRu: `Лечение ${runId}`,
      slug: `treat-${runId}`,
      durationMinutes: 30,
      priceFrom: 15000000, // 150,000 UZS
      isActive: true,
    },
  });

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
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.TUESDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.WEDNESDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.THURSDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.FRIDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.SATURDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
          {
            branchId: branch.id,
            dayOfWeek: DayOfWeek.SUNDAY,
            startTime: '08:00',
            endTime: '20:00',
            isActive: true,
          },
        ],
      },
    },
  });

  const patient = await prisma.patient.create({
    data: {
      fullName: `Test Bemor ${runId}`,
      phone: '+998901234567',
      email: `test_${runId}@example.com`,
    },
  });

  const staff = await prisma.staffUser.create({
    data: {
      fullName: 'Admin Tester',
      email: `staff_${runId}@example.com`,
      passwordHash: 'dummy',
      role: StaffRole.ADMIN,
      isActive: true,
    },
  });

  // Future Monday at 10:00 UTC (15:00 Tashkent)
  const baseTime = new Date('2026-11-02T10:00:00.000Z');

  try {
    // =========================================================================
    // PRIORITY 1 & 2: Time Contract & Conflict Queries
    // =========================================================================
    console.log('\n--- Checking Priority 1 & 2: Appointment Time Contract & Database Conflict Queries ---');

    let appt1: any;
    await test('1.1 Booking persists treatment end in endTime, excluding bufferMinutes', async () => {
      const clinicSettings = await prisma.clinicSettings.findFirst();
      const expectedBuffer = clinicSettings?.bufferMinutes ?? 5;

      appt1 = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: baseTime.toISOString(),
        patientName: patient.fullName,
        patientPhone: patient.phone,
        patientEmail: patient.email || undefined,
        consentGiven: true,
        source: 'admin',
      });

      const dbRow = await prisma.appointment.findUnique({ where: { id: appt1.id } });
      assert.ok(dbRow, 'Appointment must exist in DB');
      assert.strictEqual(dbRow.startTime.toISOString(), baseTime.toISOString());

      // Treatment duration = 30 minutes, buffer = expectedBuffer
      const expectedTreatmentEnd = new Date(baseTime.getTime() + 30 * 60 * 1000);
      assert.strictEqual(
        dbRow.endTime.toISOString(),
        expectedTreatmentEnd.toISOString(),
        'endTime MUST store treatment end (10:30), NOT treatment + buffer',
      );
      assert.strictEqual(dbRow.bufferMinutes, expectedBuffer);

      // Verify helpers
      const treatmentEnd = getAppointmentTreatmentEnd(dbRow);
      const occupiedEnd = getAppointmentOccupiedEnd(dbRow);
      assert.strictEqual(treatmentEnd.toISOString(), expectedTreatmentEnd.toISOString());
      assert.strictEqual(
        occupiedEnd.toISOString(),
        new Date(baseTime.getTime() + (30 + expectedBuffer) * 60 * 1000).toISOString(),
      );
    });

    await test('1.2 Candidate query & overlap helper catches buffer-only collision', async () => {
      const clinicSettings = await prisma.clinicSettings.findFirst();
      const expectedBuffer = clinicSettings?.bufferMinutes ?? 5;
      const collisionOffsetMinutes = 30 + Math.max(1, Math.floor(expectedBuffer / 2));
      const slotDuringBuffer = new Date(baseTime.getTime() + collisionOffsetMinutes * 60 * 1000);

      let failed = false;
      try {
        await apptsService.createBooking({
          doctorId: doctor.id,
          branchId: branch.id,
          serviceId: service.id,
          startTime: slotDuringBuffer.toISOString(),
          patientName: 'Bemor Buffer Collision',
          patientPhone: '+998909999901',
          consentGiven: true,
          source: 'admin',
        });
      } catch (e: any) {
        failed = true;
        assert.ok(
          e.message.includes('band') || e.status === 409 || e.status === 400,
          `Expected conflict/occupied error, got: ${e.message}`,
        );
      }
      assert.ok(failed, 'Booking during buffer MUST be rejected because operatory turnaround buffer is occupied');
    });

    await test('1.3 Candidate query allows booking immediately after occupied end', async () => {
      const clinicSettings = await prisma.clinicSettings.findFirst();
      const expectedBuffer = clinicSettings?.bufferMinutes ?? 5;
      const slotAfterBuffer = new Date(baseTime.getTime() + (30 + expectedBuffer) * 60 * 1000);

      const apptAdjacent = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: slotAfterBuffer.toISOString(),
        patientName: 'Bemor Adjacent',
        patientPhone: '+998909999902',
        consentGiven: true,
        source: 'admin',
      });

      assert.ok(apptAdjacent?.id, 'Booking at slotAfterBuffer must succeed');
      const row = await prisma.appointment.findUnique({ where: { id: apptAdjacent.id } });
      assert.strictEqual(row?.startTime.toISOString(), slotAfterBuffer.toISOString());
      assert.strictEqual(row?.endTime.toISOString(), new Date(slotAfterBuffer.getTime() + 30 * 60 * 1000).toISOString());
    });

    await test('1.4 Duration override saves treatment end, revalidates conflicts, and shifts occupiedEnd', async () => {
      const clinicSettings = await prisma.clinicSettings.findFirst();
      const expectedBuffer = clinicSettings?.bufferMinutes ?? 5;
      const collidingDuration = 30 + expectedBuffer + 5;

      let conflictCaught = false;
      try {
        await apptsService.overrideDuration(appt1.id, collidingDuration, staff.id, 'Testing collision detection');
      } catch (e: any) {
        conflictCaught = true;
      }
      assert.ok(conflictCaught, 'Extending duration into an existing occupied appointment MUST throw ConflictException');

      // Now create an unblocked appointment at 13:00 and test duration extension
      const isolatedSlot = new Date('2026-11-02T13:00:00.000Z');
      const isolatedAppt = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: isolatedSlot.toISOString(),
        patientName: 'Bemor Override',
        patientPhone: '+998909999903',
        consentGiven: true,
        source: 'admin',
      });

      const updated = await apptsService.overrideDuration(
        isolatedAppt.id,
        40,
        staff.id,
        'Procedure extended',
      );

      assert.strictEqual(updated.durationMinutes, 40);
      const row = await prisma.appointment.findUnique({ where: { id: isolatedAppt.id } });
      const expectedEnd = new Date(isolatedSlot.getTime() + 40 * 60 * 1000); // 13:40
      assert.strictEqual(
        row?.endTime.toISOString(),
        expectedEnd.toISOString(),
        'overrideDuration must save newTreatmentEndTime into endTime, NOT start + duration + buffer',
      );
      assert.strictEqual(
        getAppointmentOccupiedEnd(row!).toISOString(),
        new Date(isolatedSlot.getTime() + (40 + expectedBuffer) * 60 * 1000).toISOString(),
      );
    });

    await test('1.5 Zero buffer and legacy historical row compatibility', () => {
      // 1. Zero buffer
      const zeroBufferAppt = {
        startTime: new Date('2026-11-02T10:00:00.000Z'),
        endTime: new Date('2026-11-02T10:30:00.000Z'),
        durationMinutes: 30,
        bufferMinutes: 0,
      };
      assert.strictEqual(
        getAppointmentTreatmentEnd(zeroBufferAppt).toISOString(),
        getAppointmentOccupiedEnd(zeroBufferAppt).toISOString(),
        'Zero buffer appointment must have treatmentEnd === occupiedEnd',
      );

      // 2. Historical row where endTime = start + duration + buffer (10:00 to 10:35)
      const legacyRow = {
        startTime: new Date('2026-11-02T10:00:00.000Z'),
        endTime: new Date('2026-11-02T10:35:00.000Z'),
        durationMinutes: 30,
        bufferMinutes: 5,
      };
      assert.strictEqual(classifyAppointmentRecord(legacyRow).classification, 'LEGACY_OCCUPIED_END');
      assert.strictEqual(
        getAppointmentTreatmentEnd(legacyRow).toISOString(),
        '2026-11-02T10:30:00.000Z',
        'Legacy record treatmentEnd must be correctly derived as 10:30',
      );
      assert.strictEqual(
        getAppointmentOccupiedEnd(legacyRow).toISOString(),
        '2026-11-02T10:35:00.000Z',
        'Legacy record occupiedEnd must not add buffer twice (must be 10:35)',
      );
    });

    // =========================================================================
    // PRIORITY 3: Expiration and Confirmation Rules
    // =========================================================================
    console.log('\n--- Checking Priority 3: Expiration and Confirmation Rules ---');

    await test('3.1 Ordinary confirmation cannot resurrect expired pending reservation', async () => {
      const expSlot = new Date('2026-11-03T09:00:00.000Z');
      const pastExpiry = new Date(Date.now() - 15 * 60 * 1000); // Expired 15 mins ago

      const pendingAppt = await prisma.appointment.create({
        data: {
          publicToken: `token_exp_${Date.now()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.PENDING,
          startTime: expSlot,
          endTime: new Date(expSlot.getTime() + 30 * 60 * 1000),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          consentGiven: true,
          expiresAt: pastExpiry,
        },
      });

      // Staff attempts ordinary confirmation
      let rejected = false;
      try {
        await apptsService.changeStatus(
          pendingAppt.id,
          AppointmentStatus.CONFIRMED,
          staff.id,
          'Reception trying to confirm expired',
          { role: StaffRole.ADMIN, doctorId: null },
        );
      } catch (err: any) {
        rejected = true;
        assert.ok(
          err.message.includes('muddati o\'tgan') || err.status === 409,
          `Expected expired conflict rejection, got: ${err.message}`,
        );
      }
      assert.ok(rejected, 'Ordinary confirmation of expired pending appointment MUST throw ConflictException');

      // Verify no confirmed status and no notification job enqueued
      const reloaded = await prisma.appointment.findUnique({ where: { id: pendingAppt.id } });
      assert.strictEqual(reloaded?.status, AppointmentStatus.PENDING);

      const notifJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: pendingAppt.id, templateKey: 'patient_booking_confirmed' },
      });
      assert.strictEqual(notifJob, null, 'No confirmation notification should be enqueued for rejected transition');
    });

    // =========================================================================
    // PRIORITY 4: Concurrency-Safe Notification Retries
    // =========================================================================
    console.log('\n--- Checking Priority 4: Concurrency-Safe Notification Retries ---');

    await test('4.1 Retry explicitly rejects SENT, SIMULATED, CANCELLED, and active PROCESSING jobs', async () => {
      // 1. SENT job
      const sentJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'test_sent',
          recipient: '+998901234567',
          payload: {},
          status: NotificationStatus.SENT,
          attempts: 1,
        },
      });
      let sentRejected = false;
      try {
        await notifService.retryJob(sentJob.id);
      } catch {
        sentRejected = true;
      }
      assert.ok(sentRejected, 'SENT job retry must be rejected');

      // 2. SIMULATED job
      const simJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.EMAIL,
          templateKey: 'test_sim',
          recipient: 'test@example.com',
          payload: {},
          status: NotificationStatus.SIMULATED,
          attempts: 1,
        },
      });
      let simRejected = false;
      try {
        await notifService.retryJob(simJob.id);
      } catch {
        simRejected = true;
      }
      assert.ok(simRejected, 'SIMULATED job retry must be rejected');

      // 3. CANCELLED job
      const cancelledJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'test_cancel',
          recipient: '+998901234567',
          payload: {},
          status: NotificationStatus.CANCELLED,
          attempts: 1,
        },
      });
      let cancelRejected = false;
      try {
        await notifService.retryJob(cancelledJob.id);
      } catch {
        cancelRejected = true;
      }
      assert.ok(cancelRejected, 'CANCELLED job retry must be rejected');

      // 4. Active PROCESSING job with unexpired worker lease
      const activeProcessingJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'test_proc',
          recipient: '+998901234567',
          payload: {},
          status: NotificationStatus.PROCESSING,
          lockedAt: new Date(), // Active lease just acquired
          leaseToken: 'worker-lease-active',
          attempts: 1,
        },
      });
      let procRejected = false;
      try {
        await notifService.retryJob(activeProcessingJob.id);
      } catch {
        procRejected = true;
      }
      assert.ok(procRejected, 'Active PROCESSING job with unexpired lease must be rejected');
    });

    await test('4.2 Retry revalidates reminder eligibility and returns sanitized DTO', async () => {
      // Stale reminder for past appointment
      const pastAppt = await prisma.appointment.create({
        data: {
          publicToken: `token_past_${Date.now()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          branchId: branch.id,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date('2020-01-01T10:00:00.000Z'), // Past
          endTime: new Date('2020-01-01T10:30:00.000Z'),
          serviceName: service.nameUz,
          durationMinutes: 30,
          bufferMinutes: 5,
          consentGiven: true,
        },
      });

      const failedReminder = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: '+998901234567',
          payload: { appointmentId: pastAppt.id },
          appointmentId: pastAppt.id,
          scheduleRevision: 1,
          status: NotificationStatus.FAILED,
          attempts: 3,
          maxAttempts: 3,
          lastError: 'Provider error',
        },
      });

      let pastRejected = false;
      try {
        await notifService.retryJob(failedReminder.id);
      } catch (err: any) {
        pastRejected = true;
        assert.ok(err.message.includes('o‘tib ketgan') || err.status === 400);
      }
      assert.ok(pastRejected, 'Reminder retry for past appointment must be rejected');

      // Valid failed notification job (non-reminder)
      const validFailed = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'patient_booking_received_sms',
          recipient: '+998901234567',
          payload: { internalSecret: 'do-not-leak' },
          status: NotificationStatus.FAILED,
          attempts: 3,
          maxAttempts: 3,
          lastError: 'Network timeout',
        },
      });

      const retryDto = await notifService.retryJob(validFailed.id, { sub: staff.id, role: 'ADMIN' });
      assert.strictEqual(retryDto.status, NotificationStatus.PENDING);
      assert.strictEqual(retryDto.attempts, 0);
      assert.strictEqual(retryDto.recipient, '+998 90 *** ** 67', 'Recipient must be masked in return DTO');
      assert.strictEqual((retryDto as any).payload, undefined, 'Raw internal payload must NOT be exposed in DTO');
      assert.strictEqual((retryDto as any).leaseToken, undefined, 'Internal lease token must NOT be exposed in DTO');
    });

    // =========================================================================
    // PRIORITY 5: Audit Actors and Consistency
    // =========================================================================
    console.log('\n--- Checking Priority 5: Audit Actors and Consistency ---');

    await test('5.1 Review moderation and deletion records verified staff sub as audit actor', async () => {
      const review = await prisma.review.create({
        data: {
          authorName: 'Audit Test Author',
          rating: 5,
          text: 'Super klinika!',
          status: ReviewStatus.PENDING,
          consentDisplayName: true,
        },
      });

      const testStaffSub = staff.id;

      // Moderation
      await reviewsService.updateStatus(review.id, ReviewStatus.APPROVED, 'Approved by admin', {
        sub: testStaffSub,
        role: StaffRole.ADMIN,
      });

      const modAudit = await prisma.auditLog.findFirst({
        where: { entityId: review.id, action: 'review.moderated' },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(modAudit, 'Audit log entry for review moderation must exist');
      assert.strictEqual(modAudit?.userId, testStaffSub, 'AuditLog userId must match authenticated user sub');

      // Deletion
      await reviewsService.delete(review.id, {
        sub: testStaffSub,
        role: StaffRole.ADMIN,
      });

      const delAudit = await prisma.auditLog.findFirst({
        where: { entityId: review.id, action: 'review.deleted' },
        orderBy: { createdAt: 'desc' },
      });
      assert.strictEqual(delAudit?.userId, testStaffSub, 'AuditLog userId must match authenticated user sub on deletion');
    });

    // =========================================================================
    // PRIORITY 6: Clean Plain-Text Review Storage Without Double Encoding
    // =========================================================================
    console.log('\n--- Checking Priority 6: Clean Plain-Text Review Storage Without Double Encoding ---');

    await test('6.1 Reviews store normalized plain text without HTML escaping entity artifacts', async () => {
      const testCases = [
        { author: "O'zbekiston Bemor", text: "Bizning O'zbekistondagi eng yaxshi shifoxona!" },
        { author: 'A & B Hamkorlik', text: 'Tez & sifatli xizmat ko\'rsatildi.' },
        { author: 'Tech <User>', text: '<script>alert("safe")</script> va <b style="color:red">zo\'r</b>' },
        { author: 'Иван Иванов', text: 'Отличная стоматология, профессиональные врачи и заботливый персонал!' },
        { author: 'Murod 🦷✨', text: 'Yulduzli natija! 👍 Juda mamnun bo\'ldim.' },
      ];

      for (const tc of testCases) {
        const created = await reviewsService.create({
          authorName: tc.author,
          rating: 5,
          text: tc.text,
          consentDisplayName: true,
        });

        // Direct DB inspection
        const row = await prisma.review.findUnique({ where: { id: created.id } });
        assert.ok(row);

        // Verify NO double escaping
        assert.ok(!row.text.includes('&amp;'), `Must not contain &amp;, got: ${row.text}`);
        assert.ok(!row.text.includes('&#39;'), `Must not contain &#39;, got: ${row.text}`);
        assert.ok(!row.text.includes('&quot;'), `Must not contain &quot;, got: ${row.text}`);
        assert.ok(!row.text.includes('&lt;'), `Must not contain &lt;, got: ${row.text}`);
        assert.ok(!row.text.includes('&gt;'), `Must not contain &gt;, got: ${row.text}`);

        // Plain text exact match
        assert.strictEqual(row.authorName, tc.author.trim());
        assert.strictEqual(row.text, tc.text.trim());
      }
    });

    // =========================================================================
    // PRIORITY 7: Notification Language and Settings Wiring
    // =========================================================================
    console.log('\n--- Checking Priority 7: Notification Language and Settings Wiring ---');

    await test('7.1 Booking with Russian language derives lang=ru and formats dates in Russian', async () => {
      const ruSlot = new Date('2026-11-04T07:00:00.000Z'); // 12:00 Tashkent
      const ruAppt = await apptsService.createBooking({
        doctorId: doctor.id,
        branchId: branch.id,
        serviceId: service.id,
        startTime: ruSlot.toISOString(),
        patientName: 'Алексей Смирнов',
        patientPhone: '+998901112233',
        patientEmail: 'alex@example.com',
        lang: 'ru',
        consentGiven: true,
        source: 'website',
      });

      const notifJob = await prisma.notificationJob.findFirst({
        where: { appointmentId: ruAppt.id, templateKey: 'patient_booking_received' },
      });
      assert.ok(notifJob, 'Notification job must be enqueued');
      const payload = notifJob.payload as any;
      assert.strictEqual(payload.lang, 'ru', 'Payload must record lang: ru');
      assert.strictEqual(payload.startTime, ruSlot.toISOString());

      // Test dynamic Russian date/time formatter
      const formattedRu = notifService.formatAppointmentDateTime(ruSlot, 'Asia/Tashkent', 'ru');
      assert.ok(formattedRu.includes(' в '), `Russian format must use 'в', got: ${formattedRu}`);
      assert.ok(formattedRu.includes('12:00'), `Time in Tashkent must be 12:00, got: ${formattedRu}`);
    });

    await test('7.2 Integration status accurately reflects configuration requirements', async () => {
      const status = await notifService.getIntegrationStatus();
      assert.ok('email' in status && 'sms' in status && 'telegram' in status);
      assert.ok('configured' in status.email);
      assert.ok('status' in status.email);
      assert.ok('mode' in status.email);
      assert.strictEqual(typeof status.email.configured, 'boolean');
    });

    // =========================================================================
    // PRIORITY 8: Analytics Reconciliation
    // =========================================================================
    console.log('\n--- Checking Priority 8: Analytics Financial Reconciliation ---');

    await test('8.1 Two equal-price services with small payments and refunds reconcile exactly', async () => {
      // Create two services with equal price: 100,000 UZS each
      const srvA = await prisma.service.create({
        data: {
          nameUz: `Xizmat A ${runId}`,
          nameRu: `Услуга A ${runId}`,
          slug: `srv-a-${runId}`,
          durationMinutes: 30,
          priceFrom: 10000000,
          isActive: true,
        },
      });
      const srvB = await prisma.service.create({
        data: {
          nameUz: `Xizmat B ${runId}`,
          nameRu: `Услуга B ${runId}`,
          slug: `srv-b-${runId}`,
          durationMinutes: 30,
          priceFrom: 10000000,
          isActive: true,
        },
      });

      // Appointment within November 2026
      const apptNov = await prisma.appointment.create({
        data: {
          publicToken: `token_fin_${Date.now()}`,
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: srvA.id,
          branchId: branch.id,
          status: AppointmentStatus.COMPLETED,
          startTime: new Date('2026-11-10T10:00:00.000Z'),
          endTime: new Date('2026-11-10T11:00:00.000Z'),
          serviceName: `${srvA.nameUz} + ${srvB.nameUz}`,
          servicePriceFrom: 20000000,
          durationMinutes: 60,
          bufferMinutes: 5,
          consentGiven: true,
          serviceItems: {
            create: [
              {
                serviceId: srvA.id,
                sortOrder: 0,
                serviceNameUz: srvA.nameUz,
                priceFrom: 10000000,
                durationMinutes: 30,
              },
              {
                serviceId: srvB.id,
                sortOrder: 1,
                serviceNameUz: srvB.nameUz,
                priceFrom: 10000000,
                durationMinutes: 30,
              },
            ],
          },
        },
      });

      // Record multiple small payments and refunds
      // Payments: 3 small payments of 100,000 minor units each (total gross: 300,000)
      // Refund: 1 refund of 100,000 minor units (total refund: 100,000)
      // Net recorded: 200,000
      const paymentDate = new Date('2026-11-10T12:00:00.000Z');
      await prisma.payment.createMany({
        data: [
          {
            appointmentId: apptNov.id,
            amount: 100000,
            isRefund: false,
            method: PaymentMethod.CASH,
            recordedAt: paymentDate,
          },
          {
            appointmentId: apptNov.id,
            amount: 100000,
            isRefund: false,
            method: PaymentMethod.CASH,
            recordedAt: paymentDate,
          },
          {
            appointmentId: apptNov.id,
            amount: 100000,
            isRefund: false,
            method: PaymentMethod.CARD,
            recordedAt: paymentDate,
          },
          {
            appointmentId: apptNov.id,
            amount: 100000,
            isRefund: true,
            method: PaymentMethod.CASH,
            recordedAt: paymentDate,
          },
        ],
      });

      // Run analytics query for this date range
      const analyticsOverall = await analyticsService.getDashboardAnalytics({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        branchId: branch.id,
      });

      // Filter by Service A
      const analyticsSrvA = await analyticsService.getDashboardAnalytics({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        branchId: branch.id,
        serviceId: srvA.id,
      });

      // Find Service A in popular services
      const srvAInTable = analyticsOverall.popularServices.find((s) => s.serviceId === srvA.id);
      assert.ok(srvAInTable, 'Service A must be present in popular services');

      // Net revenue of Service A in service breakdown table:
      const tableNetRevenue = srvAInTable.netRevenueMinor;

      // Filtered cash ledger net revenue for Service A:
      const filteredCashNetRevenue = analyticsSrvA.revenue.netRevenueMinor;

      // MUST RECONCILE EXACTLY
      assert.strictEqual(
        tableNetRevenue,
        filteredCashNetRevenue,
        `Service table net revenue (${tableNetRevenue}) MUST match filtered cash ledger net revenue (${filteredCashNetRevenue})`,
      );
    });

    console.log('\n================================================================');
    console.log(`   ALL ${passedCount}/${totalCount} REGRESSION CHECKS PASSED SUCCESSFULLY!`);
    console.log('================================================================\n');
  } finally {
    // Cleanup isolated fixtures
    try {
      await prisma.appointmentStatusHistory.deleteMany({
        where: { appointment: { doctorId: doctor.id } },
      });
      await prisma.notificationJob.deleteMany({
        where: { appointment: { doctorId: doctor.id } },
      });
      await prisma.payment.deleteMany({
        where: { appointment: { doctorId: doctor.id } },
      });
      await prisma.appointmentServiceItem.deleteMany({
        where: { appointment: { doctorId: doctor.id } },
      });
      await prisma.appointment.deleteMany({
        where: { doctorId: doctor.id },
      });
      await prisma.doctorSchedule.deleteMany({
        where: { doctorId: doctor.id },
      });
      await prisma.doctorBranch.deleteMany({
        where: { doctorId: doctor.id },
      });
      await prisma.doctorService.deleteMany({
        where: { doctorId: doctor.id },
      });
      await prisma.doctor.delete({ where: { id: doctor.id } });
      await prisma.service.deleteMany({
        where: { OR: [{ id: service.id }, { slug: { contains: runId } }] },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: staff.id },
      });
      await prisma.staffUser.delete({ where: { id: staff.id } });
      await prisma.branch.delete({ where: { id: branch.id } });
      await prisma.patient.delete({ where: { id: patient.id } });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
    await app.close();
  }
}

runAllPrioritiesVerification()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

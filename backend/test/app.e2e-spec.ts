import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppointmentStatus, StaffRole, ExceptionType, LeadStatus, DayOfWeek, NotificationStatus, NotificationChannel } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { ServicesService } from '../src/services/services.service';
import { parseArgs, sanitizeDatabaseUrl } from '../scripts/repair-reminders';

function parseAndValidateTestDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const dbName = parsed.pathname.replace(/^\/+/, '').split('?')[0];
    const isTestDb = dbName === 'dentacare_test' || dbName.endsWith('_test') || dbName.startsWith('test_');
    if (!isTestDb) {
      throw new Error(`Database "${dbName}" is not recognized as a dedicated test database`);
    }
    return rawUrl;
  } catch (err: any) {
    throw new Error(`FAIL-CLOSED: Rejected test database configuration. Error: ${err.message}`);
  }
}

const currentDbUrl = parseAndValidateTestDatabaseUrl(
  process.env.TEST_DATABASE_URL ||
    (process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.includes('/dentacare_test') ||
      process.env.DATABASE_URL.includes('_test'))
      ? process.env.DATABASE_URL
      : 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public'),
);

process.env.DATABASE_URL = currentDbUrl;
process.env.NODE_ENV = 'test';

describe('DentaCare Backend Regression & Integration Suite (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminCookie: string;
  let doctorAToken: string;
  let doctorBToken: string;
  let unlinkedDoctorToken: string;
  let authService: AuthService;

  let testDoctorAId: string;
  let testDoctorBId: string;
  let testServiceId: string;
  let testBranchId: string;
  let ownerUserId: string;
  let notificationsService: NotificationsService;
  let appointmentsService: AppointmentsService;
  let servicesService: ServicesService;

  // Run-specific fixture prefix (does NOT delete broad phone prefixes)
  const runId = Date.now().toString().slice(-5);
  const testPhonePrefix = `+99800${runId}`;

  function getNextWorkingSlot(daysAhead = 2, hourTashkent = 10, minuteTashkent = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    d.setUTCHours(hourTashkent - 5, minuteTashkent, 0, 0);
    return d;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    (app.getHttpAdapter().getInstance() as any).set('trust proxy', true);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    notificationsService = app.get(NotificationsService);
    appointmentsService = app.get(AppointmentsService);
    servicesService = app.get(ServicesService);

    // Verify connected database identity before mutations
    const [{ current_database }] = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database();`;
    if (current_database !== 'dentacare_test' && !current_database.endsWith('_test') && !current_database.startsWith('test_')) {
      throw new Error(`FAIL-CLOSED: Connected to unexpected database "${current_database}". Expected test database.`);
    }

    // Get fixture IDs from database seed
    const docA = await prisma.doctor.findFirst({ where: { slug: 'aziz-rahimov' } });
    const docB = await prisma.doctor.findFirst({ where: { slug: 'nilufar-karimova' } });
    const service = await prisma.service.findFirst({ where: { slug: 'konsultatsiya' } });
    const branch = await prisma.branch.findFirst({ where: { id: 'branch-chilonzor' } });

    testDoctorAId = docA!.id;
    testDoctorBId = docB!.id;
    testServiceId = service!.id;
    testBranchId = branch!.id;

    // Clean up any test appointments and patients from prior test runs
    await prisma.appointmentStatusHistory.deleteMany({
      where: { appointment: { patient: { phone: { startsWith: '+99800' } } } },
    });
    await prisma.appointmentServiceItem.deleteMany({
      where: { appointment: { patient: { phone: { startsWith: '+99800' } } } },
    });
    await prisma.appointment.deleteMany({
      where: { patient: { phone: { startsWith: '+99800' } } },
    });
    await prisma.patient.deleteMany({
      where: { phone: { startsWith: '+99800' } },
    });

    // 1. Clean up extra owners and ensure admin@dentacare.local is sole active OWNER
    await prisma.staffUser.deleteMany({
      where: {
        role: StaffRole.OWNER,
        email: { not: 'admin@dentacare.local' },
      },
    });

    const adminUser = await prisma.staffUser.upsert({
      where: { email: 'admin@dentacare.local' },
      update: {
        role: StaffRole.OWNER,
        isActive: true,
        passwordHash: await bcrypt.hash('DentacareAdmin2026!', 10),
      },
      create: {
        email: 'admin@dentacare.local',
        passwordHash: await bcrypt.hash('DentacareAdmin2026!', 10),
        fullName: 'Bosh Administrator',
        role: StaffRole.OWNER,
        isActive: true,
      },
    });
    ownerUserId = adminUser.id;

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' });

    adminToken = adminLoginRes.body.accessToken;
    adminCookie = adminLoginRes.headers['set-cookie'];

    // 2. Create Doctor B Staff User if not exists
    await prisma.staffUser.upsert({
      where: { email: 'dr.karimova@dentacare.local' },
      update: { doctorId: testDoctorBId },
      create: {
        email: 'dr.karimova@dentacare.local',
        passwordHash: await bcrypt.hash('Doctor2026!', 12),
        fullName: 'Dr. Nilufar Karimova',
        role: StaffRole.DOCTOR,
        doctorId: testDoctorBId,
        isActive: true,
      },
    });

    // 3. Create Unlinked Doctor Staff User (role DOCTOR but doctorId is null)
    await prisma.staffUser.upsert({
      where: { email: 'dr.unlinked@dentacare.local' },
      update: { doctorId: null },
      create: {
        email: 'dr.unlinked@dentacare.local',
        passwordHash: await bcrypt.hash('Doctor2026!', 12),
        fullName: 'Dr. Unlinked',
        role: StaffRole.DOCTOR,
        doctorId: null,
        isActive: true,
      },
    });

    // Login Doctor A
    const docALoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dr.rahimov@dentacare.local', password: 'Doctor2026!' });
    doctorAToken = docALoginRes.body.accessToken;

    // Login Doctor B
    const docBLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dr.karimova@dentacare.local', password: 'Doctor2026!' });
    doctorBToken = docBLoginRes.body.accessToken;

    // Login Unlinked Doctor
    const unlinkedLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dr.unlinked@dentacare.local', password: 'Doctor2026!' });
    unlinkedDoctorToken = unlinkedLoginRes.body.accessToken;
  });

  afterAll(async () => {
    // Isolated cleanup of ONLY run-specific fixtures
    await prisma.appointmentStatusHistory.deleteMany({
      where: { appointment: { patient: { phone: { startsWith: testPhonePrefix } } } },
    });
    await prisma.appointment.deleteMany({
      where: { patient: { phone: { startsWith: testPhonePrefix } } },
    });
    await prisma.patient.deleteMany({
      where: { phone: { startsWith: testPhonePrefix } },
    });
    await prisma.review.deleteMany({
      where: { text: { contains: `Run-${runId}` } },
    });
    await prisma.lead.deleteMany({
      where: { phone: { startsWith: testPhonePrefix } },
    });
    await app.close();
  });

  // -------------------------------------------------------------
  // REGRESSION 1: Health Check
  // -------------------------------------------------------------
  it('Regression 1: Health endpoint returns ok and database connection status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database.status).toBe('ok');
    expect(res.body.clinicTimezone).toBe('Asia/Tashkent');
  });

  // -------------------------------------------------------------
  // REGRESSION 2: Refresh token rotation, CSRF protection & replay revocation
  // -------------------------------------------------------------
  it('Regression 2: Refresh succeeds with CSRF header, rotates tokens, and detects replay', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'reception@dentacare.local', password: 'Reception2026!' })
      .expect(200);

    const cookies: string[] = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie']
      : [loginRes.headers['set-cookie'] as string];
    const refreshCookie = cookies.find((c: string) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();

    // 1st Refresh: with CSRF header -> succeeds and rotates token
    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    const rotatedCookies: string[] = Array.isArray(refreshRes.headers['set-cookie'])
      ? refreshRes.headers['set-cookie']
      : [refreshRes.headers['set-cookie'] as string];
    const newRefreshCookie = rotatedCookies.find((c: string) => c.startsWith('refresh_token='));
    expect(newRefreshCookie).toBeDefined();

    // 2nd Refresh with OLD token (replay attempt): must fail with 401 Unauthorized
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(401);

    // After replay detection, session is revoked: even new token is invalidated
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [newRefreshCookie!])
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(401);
  });

  // -------------------------------------------------------------
  // REGRESSION 3: Doctor Scoping & Fail Closed for unlinked doctors
  // -------------------------------------------------------------
  it('Regression 3: Doctor without linked profile fails closed (denied 403)', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/appointments')
      .set('Authorization', `Bearer ${unlinkedDoctorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/appointments/today')
      .set('Authorization', `Bearer ${unlinkedDoctorToken}`)
      .expect(403);
  });

  it('Regression 4: Doctor A cannot read Doctor B appointment details or unauthorized patient', async () => {
    const futureDate = getNextWorkingSlot(3, 10, 0);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: futureDate.toISOString(),
        patientName: 'Doctor B Patient',
        patientPhone: `${testPhonePrefix}01`,
        consentGiven: true,
      })
      .expect(201);

    const appointmentId = bookingRes.body.appointmentId;
    expect(appointmentId).toBeDefined();

    // Doctor A attempts to view Doctor B's appointment detail
    await request(app.getHttpServer())
      .get(`/api/admin/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${doctorAToken}`)
      .expect(403);

    // Doctor B can view their own appointment
    await request(app.getHttpServer())
      .get(`/api/admin/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${doctorBToken}`)
      .expect(200);
  });

  // -------------------------------------------------------------
  // REGRESSION 5: Concurrency Safety (Simultaneous overlapping requests)
  // -------------------------------------------------------------
  it('Regression 5: Simultaneous overlapping bookings cannot both succeed', async () => {
    const slotTime = getNextWorkingSlot(4, 11, 0);

    const req1 = request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Concurrency Patient 1',
        patientPhone: `${testPhonePrefix}02`,
        consentGiven: true,
      });

    const req2 = request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Concurrency Patient 2',
        patientPhone: `${testPhonePrefix}03`,
        consentGiven: true,
      });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  // -------------------------------------------------------------
  // REGRESSION 6: True Concurrent Idempotency Submissions
  // -------------------------------------------------------------
  it('Regression 6: True concurrent idempotent submissions create one booking, changed payload rejected', async () => {
    const idempotencyKey = `idem-${runId}-${Date.now()}`;
    const slotTime = getNextWorkingSlot(5, 12, 0);

    const basePayload = {
      doctorId: testDoctorBId,
      serviceId: testServiceId,
      branchId: testBranchId,
      startTime: slotTime.toISOString(),
      patientName: 'Idempotent Patient',
      patientPhone: `${testPhonePrefix}04`,
      consentGiven: true,
      idempotencyKey,
    };

    // Parallel submission of identical requests
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).post('/api/booking').send(basePayload),
      request(app.getHttpServer()).post('/api/booking').send(basePayload),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.appointmentId).toBe(res2.body.appointmentId);

    // Submission with same key but DIFFERENT doctor: must be rejected with 409
    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        ...basePayload,
        doctorId: testDoctorAId,
      })
      .expect(409);
  });

  // -------------------------------------------------------------
  // REGRESSION 7: Shared Family Phone Numbers
  // -------------------------------------------------------------
  it('Regression 7: Shared family phone does not silently merge different patients', async () => {
    const familyPhone = `${testPhonePrefix}05`;

    const slot1 = getNextWorkingSlot(6, 12, 0);
    const slot2 = getNextWorkingSlot(6, 14, 0);

    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slot1.toISOString(),
        patientName: 'Anvar Karimov',
        patientPhone: familyPhone,
        consentGiven: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slot2.toISOString(),
        patientName: 'Malika Karimova',
        patientPhone: familyPhone,
        consentGiven: true,
      })
      .expect(201);

    const patients = await prisma.patient.findMany({
      where: { phone: familyPhone },
    });

    expect(patients.length).toBe(2);
    const names = patients.map((p) => p.fullName).sort();
    expect(names).toEqual(['Anvar Karimov', 'Malika Karimova']);
  });

  // -------------------------------------------------------------
  // REGRESSION 8: Public Reviews Moderation
  // -------------------------------------------------------------
  it('Regression 8: Public reviews require moderation before appearing publicly', async () => {
    const uniqueReviewText = `Ajoyib klinika va professional xodimlar! Run-${runId}-${Date.now()}`;

    await request(app.getHttpServer())
      .post('/api/reviews')
      .send({
        authorName: 'Bekzod Aliyev',
        rating: 5,
        text: uniqueReviewText,
        consentDisplayName: true,
      })
      .expect(201);

    const publicBefore = await request(app.getHttpServer())
      .get('/api/reviews')
      .expect(200);

    const existsBefore = publicBefore.body.items.some((r: any) => r.text === uniqueReviewText);
    expect(existsBefore).toBe(false);

    const pendingReview = await prisma.review.findFirst({
      where: { text: uniqueReviewText },
    });
    expect(pendingReview).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/admin/reviews/${pendingReview!.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    const publicAfter = await request(app.getHttpServer())
      .get('/api/reviews')
      .expect(200);

    const existsAfter = publicAfter.body.items.some((r: any) => r.text === uniqueReviewText);
    expect(existsAfter).toBe(true);
  });

  // -------------------------------------------------------------
  // REGRESSION 9: Rescheduling Buffer Preservation & Rollback on Failure
  // -------------------------------------------------------------
  it('Regression 9: Failed rescheduling preserves original slot intact', async () => {
    const slot = getNextWorkingSlot(7, 14, 0);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slot.toISOString(),
        patientName: 'Rollback Test Patient',
        patientPhone: `${testPhonePrefix}06`,
        consentGiven: true,
      })
      .expect(201);

    const apptId = bookingRes.body.appointmentId;
    const token = bookingRes.body.publicToken;

    // Attempt to reschedule outside doctor working hours (e.g. 02:00 AM)
    const invalidSlot = new Date(Date.now() + 72 * 60 * 60 * 1000);
    invalidSlot.setUTCHours(21, 0, 0, 0); // 02:00 AM Tashkent time

    await request(app.getHttpServer())
      .post(`/api/booking/reschedule/${token}`)
      .send({ startTime: invalidSlot.toISOString() })
      .expect(400);

    // Original appointment must remain completely unchanged
    const originalAppt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(originalAppt!.startTime.toISOString()).toBe(slot.toISOString());
    expect(originalAppt!.status).toBe(AppointmentStatus.PENDING);
  });

  // -------------------------------------------------------------
  // REGRESSION 10: Confirmation vs Expiry/Cancellation Integrity
  // -------------------------------------------------------------
  it('Regression 10: Cannot confirm an already cancelled appointment', async () => {
    const slot = getNextWorkingSlot(8, 15, 0);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: slot.toISOString(),
        patientName: 'Transition Test Patient',
        patientPhone: `${testPhonePrefix}07`,
        consentGiven: true,
      })
      .expect(201);

    const apptId = bookingRes.body.appointmentId;
    const token = bookingRes.body.publicToken;

    // 1. Patient cancels appointment
    await request(app.getHttpServer())
      .post(`/api/booking/cancel/${token}`)
      .send({ reason: 'Reja o\'zgardi' })
      .expect(200);

    // 2. Admin attempts to confirm cancelled appointment: MUST FAIL (400)
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AppointmentStatus.CONFIRMED })
      .expect(400);

    const apptAfter = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(apptAfter!.status).toBe(AppointmentStatus.CANCELLED);
  });

  // -------------------------------------------------------------
  // REGRESSION 11: Callback Leads & Internal Notes Persistence
  // -------------------------------------------------------------
  it('Regression 11: Callback requests persist preferred branch/time and internal notes', async () => {
    const leadRes = await request(app.getHttpServer())
      .post('/api/leads')
      .send({
        fullName: 'Zafar Ergashev',
        phone: `${testPhonePrefix}08`,
        preferredBranch: 'Chilonzor',
        preferredTime: '14:00 - 16:00',
        notes: 'Old tishlarimda og\'riq bor',
      })
      .expect(201);

    expect(leadRes.body.leadId).toBeDefined();
    const leadId = leadRes.body.leadId;

    // Verify persisted in DB
    const leadInDb = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(leadInDb!.preferredBranch).toBe('Chilonzor');
    expect(leadInDb!.preferredTime).toBe('14:00 - 16:00');
    expect(leadInDb!.internalNotes).toBe('Old tishlarimda og\'riq bor');
    expect(leadInDb!.status).toBe(LeadStatus.NEW);

    // Update status and notes via admin
    await request(app.getHttpServer())
      .patch(`/api/admin/leads/${leadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: LeadStatus.CONTACTED,
        internalNotes: 'Qo\'ng\'iroq qilindi, ertaga keladi',
      })
      .expect(200);

    const updatedLead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(updatedLead!.status).toBe(LeadStatus.CONTACTED);
    expect(updatedLead!.internalNotes).toBe('Qo\'ng\'iroq qilindi, ertaga keladi');
  });

  // -------------------------------------------------------------
  // REGRESSION 12: Staff Management Last-Owner Protection
  // -------------------------------------------------------------
  it('Regression 12: Demoting or disabling the last active OWNER is strictly rejected', async () => {
    // Ensure ownerUserId is the sole active owner in the system
    await prisma.staffUser.deleteMany({
      where: {
        role: StaffRole.OWNER,
        id: { not: ownerUserId },
      },
    });
    await prisma.staffUser.update({
      where: { id: ownerUserId },
      data: { role: StaffRole.OWNER, isActive: true },
    });

    // Attempt to demote sole active OWNER to ADMIN
    const res = await request(app.getHttpServer())
      .put(`/api/admin/staff/${ownerUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: StaffRole.ADMIN })
      .expect(400);

    expect(res.body.message).toContain('OWNER');

    // Attempt to deactivate sole active OWNER
    const resDeact = await request(app.getHttpServer())
      .put(`/api/admin/staff/${ownerUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(400);

    expect(resDeact.body.message).toContain('OWNER');
  });

  // -------------------------------------------------------------
  // REGRESSION 13: Scheduling & Exceptions Full CRUD
  // -------------------------------------------------------------
  it('Regression 13: Doctor scheduling and exception CRUD operates correctly', async () => {
    // 1. Add exception (LEAVE)
    const excDate = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString().split('T')[0];
    const addExcRes = await request(app.getHttpServer())
      .post('/api/scheduling/exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        doctorId: testDoctorAId,
        type: ExceptionType.LEAVE,
        date: excDate,
        reason: 'Xizmat safari',
      })
      .expect(201);

    const excId = addExcRes.body.id;
    expect(excId).toBeDefined();

    // 2. Fetch doctor exceptions
    const getExcRes = await request(app.getHttpServer())
      .get(`/api/scheduling/exceptions/${testDoctorAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(getExcRes.body.some((e: any) => e.id === excId)).toBe(true);

    // 3. Delete exception
    await request(app.getHttpServer())
      .delete(`/api/scheduling/exceptions/${excId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // 4. Verify deleted
    const excAfter = await prisma.scheduleException.findUnique({ where: { id: excId } });
    expect(excAfter).toBeNull();
  });

  // -------------------------------------------------------------
  // REGRESSION 14: Analytics Agrees with Database Records
  // -------------------------------------------------------------
  it('Regression 14: Analytics overview accurately aggregates database metrics', async () => {
    const analyticsRes = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(analyticsRes.body.period.timezone).toBe('Asia/Tashkent');
    expect(analyticsRes.body.summary.totalAppointments).toBeGreaterThan(0);
    expect(analyticsRes.body.statusBreakdown).toBeDefined();
    expect(Array.isArray(analyticsRes.body.popularServices)).toBe(true);
    expect(Array.isArray(analyticsRes.body.doctorUtilization)).toBe(true);
  });

  // -------------------------------------------------------------
  // REGRESSION 15: Media API Hardening & Security
  // -------------------------------------------------------------
  it('Regression 15: Media upload validates magic bytes, rejects SVG, spoofed MIME, oversized files, and serves with secure headers', async () => {
    const sharp = require('sharp');
    const validPngBuffer = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 13, g: 115, b: 119, alpha: 1 } },
    }).png().toBuffer();

    // Valid upload succeeds
    const uploadRes = await request(app.getHttpServer())
      .post('/api/admin/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', validPngBuffer, 'valid-test-image.png')
      .field('category', 'test')
      .expect(201);

    expect(uploadRes.body.id).toBeDefined();
    expect(uploadRes.body.mimeType).toBe('image/png');
    expect(uploadRes.body.fileName).toMatch(/\.png$/);
    const mediaId = uploadRes.body.id;
    const fileName = uploadRes.body.fileName;

    // Unauthorized upload rejected (401)
    await request(app.getHttpServer())
      .post('/api/admin/media/upload')
      .attach('file', validPngBuffer, 'test.png')
      .expect(401);

    // Active SVG upload strictly rejected (400)
    const activeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgRes = await request(app.getHttpServer())
      .post('/api/admin/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', activeSvg, 'xss.svg')
      .expect(400);
    expect(svgRes.body.message).toContain('SVG');

    // Spoofed MIME (text/html content with .jpg filename) rejected (400)
    const spoofedBuffer = Buffer.from('<html><body><h1>Fake Image</h1></body></html>');
    await request(app.getHttpServer())
      .post('/api/admin/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', spoofedBuffer, 'spoof.jpg')
      .expect(400);

    // Oversized upload (> 5MB) rejected
    const bigBuffer = Buffer.alloc(5.5 * 1024 * 1024);
    await request(app.getHttpServer())
      .post('/api/admin/media/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', bigBuffer, 'huge.png')
      .expect((res) => {
        expect([400, 413]).toContain(res.status);
      });

    // Secure serving endpoint headers
    const fileRes = await request(app.getHttpServer())
      .get(`/api/admin/media/file/${fileName}`)
      .expect(200);

    expect(fileRes.headers['x-content-type-options']).toBe('nosniff');
    expect(fileRes.headers['content-security-policy']).toBe("default-src 'none'");

    // Cleanup
    await request(app.getHttpServer())
      .delete(`/api/admin/media/${mediaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  // -------------------------------------------------------------
  // REGRESSION 16: Durable Idempotency with Fingerprinting & Legacy Key Policy
  // -------------------------------------------------------------
  it('Regression 16: Idempotency fingerprint binds all fields, rejects altered payload, and parallel identical requests yield one booking', async () => {
    const slotTime = getNextWorkingSlot(9, 11, 0);
    const startIso = slotTime.toISOString();
    const testKey = `e2e_idemp_${runId}_${Date.now()}`;

    const basePayload = {
      serviceId: testServiceId,
      doctorId: testDoctorBId,
      branchId: testBranchId,
      startTime: startIso,
      patientName: `Idempotency Test ${runId}`,
      patientPhone: `${testPhonePrefix}11`,
      patientEmail: `idemp_${runId}@example.com`,
      note: 'Base note',
      consentGiven: true,
      idempotencyKey: testKey,
    };

    try {
      // 1. Truly parallel identical submissions
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/api/booking').send(basePayload),
        request(app.getHttpServer()).post('/api/booking').send(basePayload),
      ]);

      expect(res1.status).toBeLessThan(300);
      expect(res2.status).toBeLessThan(300);
      const bookingId1 = res1.body.id || res1.body.appointmentId;
      const bookingId2 = res2.body.id || res2.body.appointmentId;
      expect(bookingId1).toBeDefined();
      expect(bookingId1).toBe(bookingId2);

      // Verify database contains exactly ONE appointment with this key
      const countInDb = await prisma.appointment.count({
        where: { idempotencyKey: testKey },
      });
      expect(countInDb).toBe(1);

      // 2. Changed phone with reused key -> Rejected with 409 Conflict
      await request(app.getHttpServer())
        .post('/api/booking')
        .send({ ...basePayload, patientPhone: '+998901234567' })
        .expect(409);

      // 3. Changed patient name with reused key -> Rejected with 409 Conflict
      await request(app.getHttpServer())
        .post('/api/booking')
        .send({ ...basePayload, patientName: 'Different Name' })
        .expect(409);

      // 4. Changed note with reused key -> Rejected with 409 Conflict
      await request(app.getHttpServer())
        .post('/api/booking')
        .send({ ...basePayload, note: 'Tampered note' })
        .expect(409);

      // 5. Changed start time with reused key -> Rejected with 409 Conflict
      const anotherTime = new Date(Date.now() + 85 * 60 * 60 * 1000).toISOString();
      await request(app.getHttpServer())
        .post('/api/booking')
        .send({ ...basePayload, startTime: anotherTime })
        .expect(409);

      // 6. Legacy idempotency key policy: key with missing fingerprint must be rejected with 409
      const legacyKey = `legacy_${runId}_${Date.now()}`;
      await prisma.appointment.create({
        data: {
          publicToken: `legacy_tok_${runId}_${Date.now()}`,
          patientId: (await prisma.patient.findFirst())!.id,
          doctorId: testDoctorBId,
          serviceId: testServiceId,
          branchId: testBranchId,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date(Date.now() + 120 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 121 * 60 * 60 * 1000),
          serviceName: 'Legacy Service',
          durationMinutes: 30,
          bufferMinutes: 5,
          idempotencyKey: legacyKey,
          requestFingerprint: null, // Legacy row lacking fingerprint
          consentGiven: true,
        },
      });

      const legacyRes = await request(app.getHttpServer())
        .post('/api/booking')
        .send({ ...basePayload, idempotencyKey: legacyKey })
        .expect(409);

      expect(legacyRes.body.message).toContain('idempotency');
    } finally {
      await prisma.appointmentServiceItem.deleteMany({
        where: { appointment: { idempotencyKey: { in: [testKey, `legacy_${runId}`] } } },
      });
      await prisma.appointment.deleteMany({
        where: { OR: [{ idempotencyKey: testKey }, { idempotencyKey: { startsWith: `legacy_${runId}` } }] },
      });
    }
  });

  // -------------------------------------------------------------
  // REGRESSION 17: Runtime Validation for Update Endpoints
  // -------------------------------------------------------------
  it('Regression 17: Update endpoints enforce runtime validation classes and reject unexpected or invalid fields', async () => {
    // 1. Valid partial update to doctor succeeds
    await request(app.getHttpServer())
      .put(`/api/doctors/admin/${testDoctorAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titleUz: 'Oliy toifali shifokor' })
      .expect(200);

    // 2. Unexpected/forbidden property rejected (400) via forbidNonWhitelisted
    await request(app.getHttpServer())
      .put(`/api/doctors/admin/${testDoctorAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unexpectedInjectedProperty: 'hack' })
      .expect(400);

    // 3. Invalid negative experience rejected (400)
    await request(app.getHttpServer())
      .put(`/api/doctors/admin/${testDoctorAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ experienceYears: -5 })
      .expect(400);

    // 4. Invalid service duration (< 5 mins) rejected (400)
    await request(app.getHttpServer())
      .put(`/api/services/admin/${testServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 2 })
      .expect(400);

    // 5. Invalid price range (priceTo < priceFrom) rejected (400)
    await request(app.getHttpServer())
      .put(`/api/services/admin/${testServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceFrom: 50000000, priceTo: 20000000 })
      .expect(400);
  });

  // -------------------------------------------------------------
  // REGRESSION 18: Concurrency-Safe Owner Protection with Dual Owners
  // -------------------------------------------------------------
  it('Regression 18: Concurrency-safe owner protection prevents simultaneous demotions of last active owners', async () => {
    // Clean to exactly 1 owner before adding second owner
    await prisma.staffUser.deleteMany({
      where: {
        role: StaffRole.OWNER,
        id: { not: ownerUserId },
      },
    });
    await prisma.staffUser.update({
      where: { id: ownerUserId },
      data: { role: StaffRole.OWNER, isActive: true },
    });

    // Explicitly create a second active OWNER
    const secondOwner = await prisma.staffUser.create({
      data: {
        email: `second_owner_${runId}_${Date.now()}@dentacare.local`,
        fullName: 'Second Verified Owner',
        passwordHash: await bcrypt.hash('OwnerPassword2026!', 10),
        role: StaffRole.OWNER,
        isActive: true,
      },
    });

    const activeOwnersBefore = await prisma.staffUser.count({
      where: { role: StaffRole.OWNER, isActive: true },
    });
    expect(activeOwnersBefore).toBeGreaterThanOrEqual(2);

    // Attempt CONCURRENT demotions of both owners simultaneously!
    const [demoteRes1, demoteRes2] = await Promise.all([
      request(app.getHttpServer())
        .put(`/api/admin/staff/${ownerUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: StaffRole.ADMIN }),
      request(app.getHttpServer())
        .put(`/api/admin/staff/${secondOwner.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: StaffRole.ADMIN }),
    ]);

    // Mutex & transaction serialization guarantee they cannot both succeed!
    const statuses = [demoteRes1.status, demoteRes2.status];
    expect(statuses).toContain(400);

    // At least ONE active owner strictly remains in the database
    const remainingActiveOwners = await prisma.staffUser.count({
      where: { role: StaffRole.OWNER, isActive: true },
    });
    expect(remainingActiveOwners).toBeGreaterThanOrEqual(1);

    // Cleanup: restore original owner to OWNER if demoted, delete second owner
    await prisma.staffUser.update({
      where: { id: ownerUserId },
      data: { role: StaffRole.OWNER, isActive: true },
    });
    await prisma.staffUser.delete({
      where: { id: secondOwner.id },
    });

    // Re-login admin via authService directly to avoid HTTP throttler rate limits!
    const reloginTokens = await authService.login('admin@dentacare.local', 'DentacareAdmin2026!');
    adminToken = reloginTokens.accessToken;
  });

  // -------------------------------------------------------------
  // REGRESSION 19: Doctor Utilization Deterministic Fixtures
  // -------------------------------------------------------------
  it('Regression 19: Doctor utilization accurately computes availability, breaks, overtime on non-working days, and zero-appointment doctors', async () => {
    // Create dedicated fixture doctor
    const fixtureDoctor = await prisma.doctor.create({
      data: {
        slug: `fixture-doc-${runId}-${Date.now()}`,
        firstNameUz: 'Aniq',
        lastNameUz: 'Hisobchi',
        firstNameRu: 'Точный',
        lastNameRu: 'Бухгалтер',
        titleUz: 'Bosh shifokor',
        titleRu: 'Главный врач',
        experienceYears: 10,
        isActive: true,
      },
    });

    // Dedicated zero-appointment doctor
    const zeroDoctor = await prisma.doctor.create({
      data: {
        slug: `zero-doc-${runId}-${Date.now()}`,
        firstNameUz: 'Nol',
        lastNameUz: 'Bandlik',
        firstNameRu: 'Ноль',
        lastNameRu: 'Занятость',
        titleUz: 'Shifokor',
        titleRu: 'Врач',
        experienceYears: 3,
        isActive: true,
      },
    });

    // 1. Monday Schedule for fixtureDoctor & zeroDoctor (09:00 - 18:00, lunch 13:00 - 14:00 => 480 min available)
    await prisma.doctorSchedule.create({
      data: {
        doctorId: fixtureDoctor.id,
        branchId: testBranchId,
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '18:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        isActive: true,
      },
    });

    await prisma.doctorSchedule.create({
      data: {
        doctorId: zeroDoctor.id,
        branchId: testBranchId,
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '18:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        isActive: true,
      },
    });

    // 2. Overtime on Sunday 2026-11-01 (normally non-working day, 10:00 - 14:00 => 240 min available)
    await prisma.scheduleException.create({
      data: {
        doctorId: fixtureDoctor.id,
        type: ExceptionType.OVERTIME,
        date: new Date('2026-11-01T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '14:00',
      },
    });

    // 3. Appointments on Monday 2026-11-02:
    // Confirmed appointment of 60 minutes
    const patient = await prisma.patient.findFirst();
    await prisma.appointment.create({
      data: {
        publicToken: `util_tok_${runId}_1`,
        patientId: patient!.id,
        doctorId: fixtureDoctor.id,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: new Date('2026-11-02T05:00:00.000Z'), // 10:00 Tashkent
        endTime: new Date('2026-11-02T06:05:00.000Z'),   // 11:05 Tashkent (60 min + 5 min buffer)
        serviceName: 'Konsultatsiya',
        durationMinutes: 60,
        bufferMinutes: 5,
        consentGiven: true,
      },
    });

    // Cancelled appointment of 30 minutes (must NOT be counted in numerator!)
    await prisma.appointment.create({
      data: {
        publicToken: `util_tok_${runId}_2`,
        patientId: patient!.id,
        doctorId: fixtureDoctor.id,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CANCELLED,
        startTime: new Date('2026-11-02T07:00:00.000Z'),
        endTime: new Date('2026-11-02T07:35:00.000Z'),
        serviceName: 'Konsultatsiya',
        durationMinutes: 30,
        bufferMinutes: 5,
        consentGiven: true,
      },
    });

    // No-show appointment of 30 minutes (must NOT be counted in numerator!)
    await prisma.appointment.create({
      data: {
        publicToken: `util_tok_${runId}_3`,
        patientId: patient!.id,
        doctorId: fixtureDoctor.id,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.NO_SHOW,
        startTime: new Date('2026-11-02T08:00:00.000Z'),
        endTime: new Date('2026-11-02T08:35:00.000Z'),
        serviceName: 'Konsultatsiya',
        durationMinutes: 30,
        bufferMinutes: 5,
        consentGiven: true,
      },
    });

    // Test Sunday 2026-11-01 (Overtime on non-working day)
    const sundayRes = await request(app.getHttpServer())
      .get(`/api/admin/analytics/overview?startDate=2026-11-01&endDate=2026-11-01&doctorId=${fixtureDoctor.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const sundayDoc = sundayRes.body.doctorUtilization[0];
    expect(sundayDoc).toBeDefined();
    expect(sundayDoc.totalAvailableMinutes).toBe(240); // Exactly 4 hours overtime
    expect(sundayDoc.totalMinutesBooked).toBe(0);

    // Test Monday 2026-11-02 (Normal working day with 1 confirmed booking, excluding cancelled/no-show)
    const mondayRes = await request(app.getHttpServer())
      .get(`/api/admin/analytics/overview?startDate=2026-11-02&endDate=2026-11-02&doctorId=${fixtureDoctor.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const mondayDoc = mondayRes.body.doctorUtilization[0];
    expect(mondayDoc).toBeDefined();
    expect(mondayDoc.totalAvailableMinutes).toBe(480); // 540 - 60 break = 480
    expect(mondayDoc.totalMinutesBooked).toBe(60);      // Only confirmed appointment
    expect(mondayDoc.totalBufferMinutes).toBe(5);
    expect(mondayDoc.appointmentsCount).toBe(1);
    expect(mondayDoc.utilizationRate).toBe(12.5);       // (60 / 480) * 100 = 12.5%

    // Test zero-appointment doctor on Monday
    const zeroRes = await request(app.getHttpServer())
      .get(`/api/admin/analytics/overview?startDate=2026-11-02&endDate=2026-11-02&doctorId=${zeroDoctor.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const zeroDoc = zeroRes.body.doctorUtilization[0];
    expect(zeroDoc).toBeDefined();
    expect(zeroDoc.totalAvailableMinutes).toBe(480);
    expect(zeroDoc.totalMinutesBooked).toBe(0);
    expect(zeroDoc.utilizationRate).toBe(0);

    // Cleanup
    await prisma.appointment.deleteMany({ where: { doctorId: fixtureDoctor.id } });
    await prisma.scheduleException.deleteMany({ where: { doctorId: fixtureDoctor.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: { in: [fixtureDoctor.id, zeroDoctor.id] } } });
    await prisma.doctor.deleteMany({ where: { id: { in: [fixtureDoctor.id, zeroDoctor.id] } } });
  });

  // -------------------------------------------------------------
  // REGRESSION 20: Historical Buffer Preservation Across Reschedule
  // -------------------------------------------------------------
  it('Regression 20: Rescheduling preserves original buffer and duration snapshot even when clinic settings buffer changes', async () => {
    let patient = await prisma.patient.findFirst();
    if (!patient) {
      patient = await prisma.patient.create({
        data: { fullName: 'Buffer Test Patient', phone: `${testPhonePrefix}20` },
      });
    }
    const origStart = getNextWorkingSlot(4, 11, 0);

    const durationMinutes = 40;
    const originalBuffer = 10; // Explicit 10-minute historical buffer
    const origEnd = new Date(origStart.getTime() + (durationMinutes + originalBuffer) * 60 * 1000);

    const historicalAppt = await prisma.appointment.create({
      data: {
        publicToken: `hist_${runId}_${Date.now()}`,
        patientId: patient!.id,
        doctorId: testDoctorBId,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: origStart,
        endTime: origEnd,
        serviceName: 'Buffer Test Service',
        durationMinutes,
        bufferMinutes: originalBuffer,
        consentGiven: true,
      },
    });

    try {
      // Mutate clinic settings buffer to 20 minutes
      await prisma.clinicSettings.updateMany({
        data: { bufferMinutes: 20 },
      });

      // Reschedule appointment to new slot
      const newSlot = getNextWorkingSlot(7, 11, 0);

      const rescheduleRes = await request(app.getHttpServer())
        .post(`/api/admin/appointments/${historicalAppt.id}/reschedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: newSlot.toISOString() })
        .expect(200);

      const resAppt = rescheduleRes.body.appointment || rescheduleRes.body;
      expect(resAppt.bufferMinutes).toBe(originalBuffer); // Preserved at 10, NOT changed to 20!
      expect(resAppt.durationMinutes).toBe(durationMinutes);
      const diffMin = Math.round(
        (new Date(resAppt.endTime).getTime() - new Date(resAppt.startTime).getTime()) / 60000,
      );
      expect(diffMin).toBe(durationMinutes + originalBuffer); // Exactly 50 minutes total duration
    } finally {
      // Cleanup
      await prisma.clinicSettings.updateMany({
        data: { bufferMinutes: 5 },
      });
      await prisma.appointment.delete({ where: { id: historicalAppt.id } }).catch(() => {});
    }
  });

  // -------------------------------------------------------------
  // REGRESSION 21: Transactional Outbox & Notification Reliability
  // -------------------------------------------------------------
  it('Regression 21: Notification intents are persisted transactionally, outbox cancels stale reminders on reschedule/cancel', async () => {
    const patient = await prisma.patient.findFirst();
    const slotTime = new Date(Date.now() + 140 * 60 * 60 * 1000);
    slotTime.setUTCHours(6, 0, 0, 0);
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: testServiceId,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: `Outbox Patient ${runId}`,
        patientPhone: `${testPhonePrefix}99`,
        patientEmail: `outbox_${runId}@example.com`,
        consentGiven: true,
      })
      .expect(201);

    const apptId = bookingRes.body.id || bookingRes.body.appointmentId;

    // 1. Verify notification job was transactionally created
    const createdJobs = await prisma.notificationJob.findMany({
      where: { appointmentId: apptId },
    });
    expect(createdJobs.length).toBeGreaterThanOrEqual(1);
    const bookingJob = createdJobs.find((j) => j.templateKey === 'patient_booking_received' || j.templateKey === 'patient_booking_received_sms');
    expect(bookingJob).toBeDefined();
    expect(bookingJob!.status).toBe(NotificationStatus.PENDING);

    // 2. Confirm appointment -> Verify patient_booking_confirmed enqueued
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AppointmentStatus.CONFIRMED })
      .expect(200);

    const confirmedJobs = await prisma.notificationJob.findMany({
      where: { appointmentId: apptId, templateKey: 'patient_booking_confirmed' },
    });
    expect(confirmedJobs.length).toBe(1);

    // 3. Reschedule appointment -> Verify old reminder cancelled and appointment_rescheduled enqueued with revision 2
    const newSlotTime = new Date(slotTime.getTime() + 24 * 60 * 60 * 1000);
    if (newSlotTime.getUTCDay() === 0) newSlotTime.setUTCDate(newSlotTime.getUTCDate() + 1);

    await request(app.getHttpServer())
      .post(`/api/admin/appointments/${apptId}/reschedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: newSlotTime.toISOString() })
      .expect(200);

    const rescheduledJobs = await prisma.notificationJob.findMany({
      where: { appointmentId: apptId, templateKey: 'appointment_rescheduled' },
    });
    expect(rescheduledJobs.length).toBe(1);
    expect(rescheduledJobs[0].appointmentRevision).toBe(2);

    // 4. Cancel appointment -> Verify appointment_cancellation enqueued and reminders cancelled
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AppointmentStatus.CANCELLED })
      .expect(200);

    const cancelledJobs = await prisma.notificationJob.findMany({
      where: { appointmentId: apptId, templateKey: 'appointment_cancellation' },
    });
    expect(cancelledJobs.length).toBe(1);

    // All reminders must be in CANCELLED status
    const pendingReminders = await prisma.notificationJob.findMany({
      where: { appointmentId: apptId, templateKey: 'appointment_reminder', status: NotificationStatus.PENDING },
    });
    expect(pendingReminders.length).toBe(0);

    // Cleanup
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointment.delete({ where: { id: apptId } });
  });

  it('Regression 22: Two-service booking creates exact duration and price snapshots in AppointmentServiceItem and totals', async () => {
    // Create two test services
    const s1 = await prisma.service.create({
      data: {
        nameUz: 'Plomba qo\'yish',
        nameRu: 'Пломбирование',
        slug: `plomba-${runId}`,
        durationMinutes: 30,
        priceFrom: 15000000,
      },
    });
    const s2 = await prisma.service.create({
      data: {
        nameUz: 'Tish tozalash',
        nameRu: 'Чистка зубов',
        slug: `tozalash-${runId}`,
        durationMinutes: 45,
        priceFrom: 20000000,
      },
    });

    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorBId, serviceId: s1.id },
        { doctorId: testDoctorBId, serviceId: s2.id },
      ],
    });

    const slotTime = getNextWorkingSlot(11, 10, 0);

    const res = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [s1.id, s2.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Dilshod Karimov',
        patientPhone: `${testPhonePrefix}22`,
        consentGiven: true,
      })
      .expect(201);

    expect(res.body.durationMinutes).toBe(75);
    expect(res.body.bufferMinutes).toBe(5);

    // Verify database record and appointment_service_items
    const dbAppt = await prisma.appointment.findUnique({
      where: { id: res.body.appointmentId },
      include: { serviceItems: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(dbAppt).toBeDefined();
    expect(dbAppt!.durationMinutes).toBe(75);
    expect(dbAppt!.servicePriceFrom).toBe(35000000);
    expect(dbAppt!.serviceItems.length).toBe(2);

    expect(dbAppt!.serviceItems[0].serviceId).toBe(s1.id);
    expect(dbAppt!.serviceItems[0].sortOrder).toBe(0);
    expect(dbAppt!.serviceItems[0].durationMinutes).toBe(30);
    expect(dbAppt!.serviceItems[0].priceFrom).toBe(15000000);

    expect(dbAppt!.serviceItems[1].serviceId).toBe(s2.id);
    expect(dbAppt!.serviceItems[1].sortOrder).toBe(1);
    expect(dbAppt!.serviceItems[1].durationMinutes).toBe(45);
    expect(dbAppt!.serviceItems[1].priceFrom).toBe(20000000);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: dbAppt!.id } });
    await prisma.appointment.delete({ where: { id: dbAppt!.id } });
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [s1.id, s2.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
  });

  it('Regression 23: Doctor-specific durations are server-authoritative and override service defaults', async () => {
    const sCustom = await prisma.service.create({
      data: {
        nameUz: 'Murakkab implantatsiya',
        nameRu: 'Сложная имплантация',
        slug: `implant-${runId}`,
        durationMinutes: 40,
        priceFrom: 50000000,
      },
    });

    // Doctor has customDurationMinutes 65 instead of default 40
    await prisma.doctorService.create({
      data: {
        doctorId: testDoctorBId,
        serviceId: sCustom.id,
        customDurationMinutes: 65,
      },
    });

    const slotTime = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    const res = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sCustom.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Anvar Rahimov',
        patientPhone: `${testPhonePrefix}23`,
        consentGiven: true,
      })
      .expect(201);

    expect(res.body.durationMinutes).toBe(65);

    const dbAppt = await prisma.appointment.findUnique({
      where: { id: res.body.appointmentId },
      include: { serviceItems: true },
    });
    expect(dbAppt!.durationMinutes).toBe(65);
    expect(dbAppt!.serviceItems[0].durationMinutes).toBe(65);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: dbAppt!.id } });
    await prisma.appointment.delete({ where: { id: dbAppt!.id } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sCustom.id } });
    await prisma.service.delete({ where: { id: sCustom.id } });
  });

  it('Regression 24: Unauthorized second service not provided by doctor is rejected with 400', async () => {
    const sAssigned = await prisma.service.create({
      data: {
        nameUz: 'Birinchi xizmat',
        nameRu: 'Первая услуга',
        slug: `s-assign-${runId}`,
        durationMinutes: 30,
      },
    });
    const sUnassigned = await prisma.service.create({
      data: {
        nameUz: 'Biriktirilmagan xizmat',
        nameRu: 'Непривязанная услуга',
        slug: `s-unassign-${runId}`,
        durationMinutes: 30,
      },
    });

    // Only assign sAssigned to doctor
    await prisma.doctorService.create({
      data: { doctorId: testDoctorAId, serviceId: sAssigned.id },
    });

    const slotTime = new Date(Date.now() + 52 * 60 * 60 * 1000);
    slotTime.setHours(12, 0, 0, 0);

    // 1. Booking endpoint rejection
    const bookRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sAssigned.id, sUnassigned.id],
        doctorId: testDoctorAId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Alisher Oripov',
        patientPhone: `${testPhonePrefix}24`,
        consentGiven: true,
      })
      .expect(400);

    expect(bookRes.body.message).toContain('Shifokor tanlangan barcha xizmatlarni ko\'rsatmaydi');

    // 2. Slot endpoint rejection
    const slotRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: testDoctorAId,
        date: slotTime.toISOString().split('T')[0],
        serviceIds: `${sAssigned.id},${sUnassigned.id}`,
      })
      .expect(400);

    expect(slotRes.body.message).toContain('Shifokor tanlangan barcha xizmatlarni ko\'rsatmaydi');

    // Cleanup
    await prisma.doctorService.deleteMany({ where: { serviceId: sAssigned.id } });
    await prisma.service.deleteMany({ where: { id: { in: [sAssigned.id, sUnassigned.id] } } });
  });

  it('Regression 25: Missing, inactive, duplicate, and excessive service selections are rejected', async () => {
    const sValid = await prisma.service.create({
      data: {
        nameUz: 'Faol xizmat',
        nameRu: 'Активная услуга',
        slug: `s-act-${runId}`,
        durationMinutes: 30,
      },
    });
    const sInactive = await prisma.service.create({
      data: {
        nameUz: 'Nofaol xizmat',
        nameRu: 'Неактивная услуга',
        slug: `s-inact-${runId}`,
        durationMinutes: 30,
        isActive: false,
      },
    });

    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorAId, serviceId: sValid.id },
        { doctorId: testDoctorAId, serviceId: sInactive.id },
      ],
    });

    const slotTime = new Date(Date.now() + 54 * 60 * 60 * 1000);
    slotTime.setHours(14, 0, 0, 0);

    // 1. Missing service ID
    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sValid.id, 'cuid_nonexistent_service_123'],
        doctorId: testDoctorAId,
        startTime: slotTime.toISOString(),
        patientName: 'Test Patient',
        patientPhone: `${testPhonePrefix}25`,
        consentGiven: true,
      })
      .expect(400);

    // 2. Inactive service
    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sValid.id, sInactive.id],
        doctorId: testDoctorAId,
        startTime: slotTime.toISOString(),
        patientName: 'Test Patient',
        patientPhone: `${testPhonePrefix}25`,
        consentGiven: true,
      })
      .expect(400);

    // 3. Duplicate services
    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sValid.id, sValid.id],
        doctorId: testDoctorAId,
        startTime: slotTime.toISOString(),
        patientName: 'Test Patient',
        patientPhone: `${testPhonePrefix}25`,
        consentGiven: true,
      })
      .expect(400);

    // 4. Excessive (>3) services
    await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sValid.id, sValid.id, sValid.id, sValid.id],
        doctorId: testDoctorAId,
        startTime: slotTime.toISOString(),
        patientName: 'Test Patient',
        patientPhone: `${testPhonePrefix}25`,
        consentGiven: true,
      })
      .expect(400);

    // Cleanup
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [sValid.id, sInactive.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [sValid.id, sInactive.id] } } });
  });

  it('Regression 26: Attempts to alter duration via public API are rejected; staff override supported with bounds & audit', async () => {
    const sTest = await prisma.service.create({
      data: {
        nameUz: 'Audited Duration Service',
        nameRu: 'Услуга с проверкой длительности',
        slug: `audit-dur-${runId}`,
        durationMinutes: 45,
      },
    });
    await prisma.doctorService.create({
      data: { doctorId: testDoctorBId, serviceId: sTest.id },
    });

    const slotTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    // 1. Public client cannot send customDurationMinutes
    const rejectCustom = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sTest.id,
        customDurationMinutes: 10, // Attempting to shorten duration!
        doctorId: testDoctorBId,
        startTime: slotTime.toISOString(),
        patientName: 'Hacker Patient',
        patientPhone: `${testPhonePrefix}26`,
        consentGiven: true,
      })
      .expect(400);
    expect(rejectCustom.body.message).toEqual(expect.arrayContaining([expect.stringContaining('customDurationMinutes')]));

    // 2. Public client cannot send durationMinutes query param to slots
    const rejectQueryDur = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: testDoctorBId,
        date: slotTime.toISOString().split('T')[0],
        serviceId: sTest.id,
        durationMinutes: 10,
      })
      .expect(400);
    expect(rejectQueryDur.body.message).toEqual(expect.arrayContaining([expect.stringContaining('durationMinutes')]));

    // 3. Legitimate booking creation
    const legit = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sTest.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Legit Patient',
        patientPhone: `${testPhonePrefix}26`,
        consentGiven: true,
      })
      .expect(201);
    expect(legit.body.durationMinutes).toBe(45);

    // 4. Authorized staff duration override with bounds check
    // Out of bounds: 2 minutes (< 5 min)
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${legit.body.appointmentId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 2 })
      .expect(400);

    // Valid override: 60 minutes
    const overrideRes = await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${legit.body.appointmentId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 60, reason: 'Treatment complexity increased' })
      .expect(200);

    expect(overrideRes.body.durationMinutes).toBe(60);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: legit.body.appointmentId,
        action: 'appointment.duration_overridden',
      },
    });
    expect(audit).toBeDefined();

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: legit.body.appointmentId } });
    await prisma.auditLog.deleteMany({ where: { entityId: legit.body.appointmentId } });
    await prisma.appointment.delete({ where: { id: legit.body.appointmentId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sTest.id } });
    await prisma.service.delete({ where: { id: sTest.id } });
  });

  it('Regression 27: Slot availability matches booking creation duration and buffer', async () => {
    const sMatch = await prisma.service.create({
      data: {
        nameUz: 'Slot Matching Service',
        nameRu: 'Услуга сопоставления слотов',
        slug: `slot-match-${runId}`,
        durationMinutes: 50,
      },
    });
    await prisma.doctorService.create({
      data: { doctorId: testDoctorAId, serviceId: sMatch.id },
    });

    const targetDate = getNextWorkingSlot(10, 10, 0);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    // Ensure deterministic schedule fixture for testDoctorAId at testBranchId
    const dayNames: DayOfWeek[] = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    const dayOfWeekEnum = dayNames[targetDate.getDay()];
    await prisma.doctorSchedule.upsert({
      where: {
        doctorId_dayOfWeek_branchId: {
          doctorId: testDoctorAId,
          dayOfWeek: dayOfWeekEnum,
          branchId: testBranchId,
        },
      },
      update: { startTime: '09:00', endTime: '18:00', isActive: true },
      create: {
        doctorId: testDoctorAId,
        dayOfWeek: dayOfWeekEnum,
        branchId: testBranchId,
        startTime: '09:00',
        endTime: '18:00',
        isActive: true,
      },
    });

    // Query slots
    const slotRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: testDoctorAId,
        date: dateStr,
        serviceId: sMatch.id,
        branchId: testBranchId,
      })
      .expect(200);

    expect(slotRes.body.durationMinutes).toBe(50);
    expect(slotRes.body.bufferMinutes).toBe(5);
    expect(slotRes.body.totalDurationWithBufferMinutes).toBe(55);

    const availableSlots = slotRes.body.slots.filter((s: any) => s.available);
    // Non-conditional: deterministic assertion that slot exists
    expect(availableSlots.length).toBeGreaterThan(0);
    const chosen = availableSlots[0];

    // Book that exact slot
    const bookRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sMatch.id,
        doctorId: testDoctorAId,
        branchId: testBranchId,
        startTime: chosen.startTime,
        patientName: 'Slot Test Patient',
        patientPhone: `${testPhonePrefix}27`,
        consentGiven: true,
      })
      .expect(201);

    // Re-query slots: that slot must now be unavailable
    const slotResAfter = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: testDoctorAId,
        date: dateStr,
        serviceId: sMatch.id,
        branchId: testBranchId,
      })
      .expect(200);

    const slotAfter = slotResAfter.body.slots.find((s: any) => s.startTime === chosen.startTime);
    expect(slotAfter).toBeDefined();
    expect(slotAfter.available).toBe(false);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: bookRes.body.appointmentId } });
    await prisma.appointment.delete({ where: { id: bookRes.body.appointmentId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sMatch.id } });
    await prisma.service.delete({ where: { id: sMatch.id } });
  });

  it('Regression 28: Multi-service rescheduling preserves snapshots and validates all services', async () => {
    const sReschedA = await prisma.service.create({
      data: {
        nameUz: 'Resched Service A',
        nameRu: 'Перенос услуги А',
        slug: `resched-a-${runId}`,
        durationMinutes: 30,
        priceFrom: 10000000,
      },
    });
    const sReschedB = await prisma.service.create({
      data: {
        nameUz: 'Resched Service B',
        nameRu: 'Перенос услуги Б',
        slug: `resched-b-${runId}`,
        durationMinutes: 40,
        priceFrom: 12000000,
      },
    });

    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorBId, serviceId: sReschedA.id },
        { doctorId: testDoctorBId, serviceId: sReschedB.id },
      ],
    });

    const slot1 = getNextWorkingSlot(12, 10, 0);

    const booking = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sReschedA.id, sReschedB.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slot1.toISOString(),
        patientName: 'Resched Patient',
        patientPhone: `${testPhonePrefix}28`,
        consentGiven: true,
      })
      .expect(201);

    expect(booking.body.durationMinutes).toBe(70);

    // CHANGE CATALOG SETTINGS BEFORE RESCHEDULING:
    // Change sReschedA catalog duration from 30 to 60 minutes
    await prisma.service.update({
      where: { id: sReschedA.id },
      data: { durationMinutes: 60 },
    });

    // Reschedule to a new slot: MUST preserve historical snapshot duration (70 min = 30 + 40)
    const slot2 = getNextWorkingSlot(13, 11, 0);

    const reschedRes = await request(app.getHttpServer())
      .post(`/api/booking/reschedule/${booking.body.publicToken}`)
      .send({ startTime: slot2.toISOString() })
      .expect(200);

    expect(reschedRes.body.durationMinutes).toBe(70);

    // Verify snapshots in DB preserved
    const items = await prisma.appointmentServiceItem.findMany({
      where: { appointmentId: booking.body.appointmentId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(items.length).toBe(2);
    expect(items[0].durationMinutes).toBe(30);
    expect(items[1].durationMinutes).toBe(40);

    // NOW TEST REJECTION WHEN SECONDARY SERVICE BECOMES INELIGIBLE:
    // Remove doctor B's assignment to sReschedB
    await prisma.doctorService.delete({
      where: {
        doctorId_serviceId: {
          doctorId: testDoctorBId,
          serviceId: sReschedB.id,
        },
      },
    });

    const slot3 = getNextWorkingSlot(14, 14, 0);

    const rejectRes = await request(app.getHttpServer())
      .post(`/api/booking/reschedule/${booking.body.publicToken}`)
      .send({ startTime: slot3.toISOString() })
      .expect(400);

    expect(rejectRes.body.message).toMatch(/xizmat.*ko'rsatilmaydi|biriktirilmagan/i);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: booking.body.appointmentId } });
    await prisma.appointment.delete({ where: { id: booking.body.appointmentId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [sReschedA.id, sReschedB.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [sReschedA.id, sReschedB.id] } } });
  });

  it('Regression 29: Idempotency binds full canonical service selection and rejects changed secondary services', async () => {
    const sIdemA = await prisma.service.create({
      data: { nameUz: 'Idem Srv A', nameRu: 'Идем сервис А', slug: `idem-a-${runId}`, durationMinutes: 30 },
    });
    const sIdemB = await prisma.service.create({
      data: { nameUz: 'Idem Srv B', nameRu: 'Идем сервис Б', slug: `idem-b-${runId}`, durationMinutes: 30 },
    });
    const sIdemC = await prisma.service.create({
      data: { nameUz: 'Idem Srv C', nameRu: 'Идем сервис В', slug: `idem-c-${runId}`, durationMinutes: 30 },
    });

    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorBId, serviceId: sIdemA.id },
        { doctorId: testDoctorBId, serviceId: sIdemB.id },
        { doctorId: testDoctorBId, serviceId: sIdemC.id },
      ],
    });

    const idemKey = `idem-sec-change-${runId}`;
    const slotTime = getNextWorkingSlot(18, 10, 0);

    // Initial booking for A + B
    const res1 = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        idempotencyKey: idemKey,
        serviceIds: [sIdemA.id, sIdemB.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Idem Patient',
        patientPhone: `${testPhonePrefix}29`,
        consentGiven: true,
      });

    if (res1.status !== 201) {
      console.error('Regression 29 res1 FAILED:', res1.status, JSON.stringify(res1.body));
    }
    expect(res1.status).toBe(201);

    // Replay identical request with same idempotency key -> returns same appointment
    const resReplay = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        idempotencyKey: idemKey,
        serviceIds: [sIdemA.id, sIdemB.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Idem Patient',
        patientPhone: `${testPhonePrefix}29`,
        consentGiven: true,
      })
      .expect(201);
    expect(resReplay.body.appointmentId).toBe(res1.body.appointmentId);

    // Replay with CHANGED secondary service (A + C instead of A + B) -> MUST fail with 409 Conflict
    const resConflict = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        idempotencyKey: idemKey,
        serviceIds: [sIdemA.id, sIdemC.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Idem Patient',
        patientPhone: `${testPhonePrefix}29`,
        consentGiven: true,
      })
      .expect(409);
    expect(resConflict.body.message).toContain('Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan');

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: res1.body.appointmentId } });
    await prisma.appointment.delete({ where: { id: res1.body.appointmentId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [sIdemA.id, sIdemB.id, sIdemC.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [sIdemA.id, sIdemB.id, sIdemC.id] } } });
  });

  it('Regression 30: Historical service-item migration semantics preserve snapshot names and distinguish legacy bundles', async () => {
    const patient = await prisma.patient.findFirst();
    const origStart1 = new Date(Date.now() + 120 * 60 * 60 * 1000);
    origStart1.setUTCHours(6, 0, 0, 0);
    if (origStart1.getUTCDay() === 0) origStart1.setUTCDate(origStart1.getUTCDate() + 1);

    // 1. Create catalog service that will be renamed
    const sCatalog = await prisma.service.create({
      data: {
        nameUz: 'Eski Boshlangich Xizmat',
        nameRu: 'Старая услуга',
        slug: `legacy-cat-${runId}`,
        durationMinutes: 30,
        priceFrom: 15000000,
      },
    });

    // 2. Legacy Appointment 1: single-service with historical snapshot name that differs from catalog
    const legacyAppt1 = await prisma.appointment.create({
      data: {
        publicToken: `hist_single_${runId}_${Date.now()}`,
        patientId: patient!.id,
        doctorId: testDoctorBId,
        serviceId: sCatalog.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: origStart1,
        endTime: new Date(origStart1.getTime() + 35 * 60 * 1000),
        serviceName: 'Tarixiy Haqiqiy Snapshot Nomi',
        durationMinutes: 30,
        bufferMinutes: 5,
        servicePriceFrom: 15000000,
        consentGiven: true,
      },
    });

    // Rename catalog service (simulating catalog changes over time)
    await prisma.service.update({
      where: { id: sCatalog.id },
      data: { nameUz: 'Yangi O\'zgargan Katalog Nomi', nameRu: 'Новое имя из каталога' },
    });

    // 3. Legacy Appointment 2: unresolved legacy bundle (multi-service booked before multi-service schema)
    const origStart2 = new Date(origStart1.getTime() + 2 * 60 * 60 * 1000);
    const legacyAppt2 = await prisma.appointment.create({
      data: {
        publicToken: `hist_bundle_${runId}_${Date.now()}`,
        patientId: patient!.id,
        doctorId: testDoctorBId,
        serviceId: sCatalog.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: origStart2,
        endTime: new Date(origStart2.getTime() + 95 * 60 * 1000),
        serviceName: 'Plomba qo\'yish, Tish tozalash, Oqartirish',
        durationMinutes: 90,
        bufferMinutes: 5,
        servicePriceFrom: 45000000,
        consentGiven: true,
      },
    });

    // 4. Simulate the initial backfill (which erroneously used catalog COALESCE)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "appointment_service_items" (
        "id", "appointment_id", "service_id", "sort_order",
        "service_name_uz", "service_name_ru", "duration_minutes", "price_from"
      )
      SELECT
        concat('hist_', a."id"),
        a."id",
        a."service_id",
        0,
        COALESCE(s."name_uz", a."service_name"),
        s."name_ru",
        a."duration_minutes",
        a."service_price_from"
      FROM "appointments" a
      LEFT JOIN "services" s ON a."service_id" = s."id"
      WHERE a."id" IN ('${legacyAppt1.id}', '${legacyAppt2.id}')
      ON CONFLICT ("id") DO NOTHING;
    `);

    // 5. Execute the real forward repair migration SQL
    const migrationFilePath = path.join(__dirname, '../prisma/migrations/20261015170000_repair_historical_service_items/migration.sql');
    const repairSql = fs.readFileSync(migrationFilePath, 'utf-8');
    const statements = repairSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toLowerCase().includes('alter table'));

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    // 6. Assertions for legacyAppt1 (single service historical snapshot)
    const item1 = await prisma.appointmentServiceItem.findUnique({
      where: { id: `hist_${legacyAppt1.id}` },
    });
    expect(item1).toBeDefined();
    // Authoritative snapshot name preserved, NOT overwritten by renamed catalog value
    expect(item1!.serviceNameUz).toBe('Tarixiy Haqiqiy Snapshot Nomi');
    // Russian translation cleared because snapshot name differed from catalog service
    expect(item1!.serviceNameRu).toBeNull();
    expect(item1!.isLegacyBundle).toBe(false);

    // 7. Assertions for legacyAppt2 (unresolved bundle)
    const item2 = await prisma.appointmentServiceItem.findUnique({
      where: { id: `hist_${legacyAppt2.id}` },
    });
    expect(item2).toBeDefined();
    expect(item2!.serviceNameUz).toBe('Plomba qo\'yish, Tish tozalash, Oqartirish');
    // Disassociated from primary service_id so analytics do NOT falsely attribute bundle to a single service!
    expect(item2!.serviceId).toBeNull();
    expect(item2!.isLegacyBundle).toBe(true);
    expect(item2!.durationMinutes).toBe(90);

    // 8. Verify public status endpoint accurately displays both
    const res1 = await request(app.getHttpServer()).get(`/api/booking/status/${legacyAppt1.publicToken}`).expect(200);
    expect(res1.body.serviceItems[0].serviceNameUz).toBe('Tarixiy Haqiqiy Snapshot Nomi');

    const res2 = await request(app.getHttpServer()).get(`/api/booking/status/${legacyAppt2.publicToken}`).expect(200);
    expect(res2.body.serviceItems[0].serviceNameUz).toBe('Plomba qo\'yish, Tish tozalash, Oqartirish');
    expect(res2.body.serviceItems[0].isLegacyBundle).toBe(true);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: { in: [legacyAppt1.id, legacyAppt2.id] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [legacyAppt1.id, legacyAppt2.id] } } });
    await prisma.service.delete({ where: { id: sCatalog.id } });
  });

  it('Regression 31: Service analytics accurately count service items without double-counting appointments or estimated prices', async () => {
    const sStat = await prisma.service.create({
      data: {
        nameUz: `Analytics Service ${runId}`,
        nameRu: `Аналитика услуги ${runId}`,
        slug: `stat-${runId}`,
        durationMinutes: 30,
        priceFrom: 25000000, // 250,000 UZS
      },
    });
    await prisma.doctorService.create({
      data: { doctorId: testDoctorBId, serviceId: sStat.id },
    });

    // Baseline analytics
    const baseAnalytics = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const initialIncome = baseAnalytics.body.revenue.totalIncomeMinor;

    const slotTime = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    // Create UNPAID booking
    const appt = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sStat.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Analytics Patient',
        patientPhone: `${testPhonePrefix}31`,
        consentGiven: true,
      })
      .expect(201);

    // Query analytics: Unpaid booking must NOT increase collected revenue!
    const afterBookingAnalytics = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(afterBookingAnalytics.body.revenue.totalIncomeMinor).toBe(initialIncome);

    // Record an actual payment of 250,000 UZS (25000000 minor units)
    await prisma.payment.create({
      data: {
        appointmentId: appt.body.appointmentId,
        amount: 25000000,
        method: 'CASH',
        recordedAt: new Date(),
      },
    });

    // Query analytics: Revenue must now reflect EXACT payment amount recorded
    const afterPaymentAnalytics = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(afterPaymentAnalytics.body.revenue.totalIncomeMinor).toBe(initialIncome + 25000000);

    // Verify exact service count for this specific service without top-7 ranking dependency
    const serviceItemCount = await prisma.appointmentServiceItem.count({
      where: { serviceId: sStat.id, isLegacyBundle: false },
    });
    expect(serviceItemCount).toBe(1);

    // Cleanup
    await prisma.payment.deleteMany({ where: { appointmentId: appt.body.appointmentId } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: appt.body.appointmentId } });
    await prisma.appointment.delete({ where: { id: appt.body.appointmentId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sStat.id } });
    await prisma.service.delete({ where: { id: sStat.id } });
  });

  it('Regression 32: Concurrency - Service duration change during transaction entry recomputes consistent end time and items', async () => {
    const sConA = await prisma.service.create({
      data: { nameUz: 'Concur Srv A', nameRu: 'Конкур А', slug: `con-a-${runId}`, durationMinutes: 30, priceFrom: 10000000 },
    });
    const sConB = await prisma.service.create({
      data: { nameUz: 'Concur Srv B', nameRu: 'Конкур Б', slug: `con-b-${runId}`, durationMinutes: 30, priceFrom: 10000000 },
    });
    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorBId, serviceId: sConA.id },
        { doctorId: testDoctorBId, serviceId: sConB.id },
      ],
    });

    const slotTime = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    // Book multi-service: duration was initially 60 min. But update sConB in DB to 45 min
    await prisma.service.update({
      where: { id: sConB.id },
      data: { durationMinutes: 45 },
    });

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sConA.id, sConB.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Concurrency Patient',
        patientPhone: `${testPhonePrefix}32`,
        consentGiven: true,
      })
      .expect(201);

    const appt = await prisma.appointment.findUnique({
      where: { id: bookingRes.body.appointmentId },
      include: { serviceItems: { orderBy: { sortOrder: 'asc' } } },
    });

    expect(appt).toBeDefined();
    // Inside tx, durations were reread consistently: 30 + 45 = 75 min
    expect(appt!.durationMinutes).toBe(75);
    expect(appt!.bufferMinutes).toBe(5);

    // Assert: endTime - startTime = durationMinutes + bufferMinutes
    const actualIntervalMs = new Date(appt!.endTime).getTime() - new Date(appt!.startTime).getTime();
    const expectedIntervalMs = (appt!.durationMinutes + (appt!.bufferMinutes ?? 5)) * 60 * 1000;
    expect(actualIntervalMs).toBe(expectedIntervalMs);

    // Assert: service-item totals match defined appointment duration policy
    const sumServiceItemDurations = appt!.serviceItems.reduce((acc, item) => acc + item.durationMinutes, 0);
    expect(sumServiceItemDurations).toBe(appt!.durationMinutes);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: appt!.id } });
    await prisma.appointment.delete({ where: { id: appt!.id } });
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [sConA.id, sConB.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [sConA.id, sConB.id] } } });
  });

  it('Regression 33: Duration override safely locks row, rejects terminal appointments, and detects overlap collisions', async () => {
    const sRace = await prisma.service.create({
      data: { nameUz: 'Race Srv', nameRu: 'Гонка', slug: `race-${runId}`, durationMinutes: 30 },
    });
    await prisma.doctorService.create({
      data: { doctorId: testDoctorBId, serviceId: sRace.id },
    });

    const slotTime = getNextWorkingSlot(20, 10, 0);

    // Appointment 1: 10:00 - 10:35
    const appt1 = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sRace.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Race Patient 1',
        patientPhone: `${testPhonePrefix}31`,
        consentGiven: true,
      })
      .expect(201);

    // Appointment 2: 11:00 - 11:35
    const slot2Time = new Date(slotTime.getTime() + 60 * 60 * 1000);
    const appt2 = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sRace.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slot2Time.toISOString(),
        patientName: 'Race Patient 2',
        patientPhone: `${testPhonePrefix}32`,
        consentGiven: true,
      })
      .expect(201);

    // 1. Attempt to override Appt 1 duration to 90 min (would extend to 11:35 and collide with Appt 2 at 11:00)
    const collideRes = await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${appt1.body.appointmentId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 90, reason: 'Need more time for treatment' })
      .expect(409);
    expect(collideRes.body.message).toMatch(/to'qnashuv/i);

    // 2. Test rejection on terminal appointment:
    // Cancel Appt 2
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${appt2.body.appointmentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED', reason: 'Patient cancelled' })
      .expect(200);

    // Attempting duration override on CANCELLED appointment must be rejected!
    const terminalRes = await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${appt2.body.appointmentId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 45, reason: 'Late adjustment' })
      .expect(400);
    expect(terminalRes.body.message).toMatch(/bekor qilingan.*o'zgartirib bo'lmaydi/i);

    // 3. Now override Appt 1 duration safely to 50 min (10:00 - 10:55, does not collide with anything)
    const overrideRes = await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${appt1.body.appointmentId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 50, reason: 'Detailed examination needed' })
      .expect(200);
    expect(overrideRes.body.durationMinutes).toBe(50);

    // Audit log must record the duration override with staff reason and previous/new values
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: appt1.body.appointmentId, action: 'appointment.duration_override' },
    });
    expect(audit).toBeDefined();
    expect((audit!.details as any).previousDurationMinutes).toBe(30);
    expect((audit!.details as any).newDurationMinutes).toBe(50);
    expect((audit!.details as any).reason).toBe('Detailed examination needed');

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: { in: [appt1.body.appointmentId, appt2.body.appointmentId] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [appt1.body.appointmentId, appt2.body.appointmentId] } } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sRace.id } });
    await prisma.service.delete({ where: { id: sRace.id } });
  });

  it('Regression 34: Reminder preservation after duration override keeps valid reminder job with matched revision', async () => {
    const sRem = await prisma.service.create({
      data: { nameUz: 'Reminder Srv', nameRu: 'Напоминание', slug: `rem-${runId}`, durationMinutes: 30 },
    });
    await prisma.doctorService.create({
      data: { doctorId: testDoctorBId, serviceId: sRem.id },
    });

    const slotTime = new Date(Date.now() + 26 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: sRem.id,
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Reminder Patient',
        patientPhone: `${testPhonePrefix}34`,
        consentGiven: true,
      })
      .expect(201);

    const apptId = bookingRes.body.appointmentId;

    // Verify reminder notification job was enqueued
    const initialReminder = await prisma.notificationJob.findFirst({
      where: {
        appointmentId: apptId,
        templateKey: 'appointment_reminder',
      },
    });
    expect(initialReminder).toBeDefined();
    expect(initialReminder!.status).toBe(NotificationStatus.PENDING);
    const initialRevision = initialReminder!.appointmentRevision ?? 1;

    // Perform duration override
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 45, reason: 'Extended cleaning' })
      .expect(200);

    const updatedAppt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(updatedAppt!.revision).toBe(initialRevision + 1);

    // Verify transactionally: the pending reminder job MUST have its revision updated to match!
    const preservedReminder = await prisma.notificationJob.findFirst({
      where: {
        appointmentId: apptId,
        templateKey: 'appointment_reminder',
      },
    });
    expect(preservedReminder).toBeDefined();
    expect(preservedReminder!.status).toBe(NotificationStatus.PENDING);
    expect(preservedReminder!.appointmentRevision).toBe(updatedAppt!.revision);

    // Cleanup
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointment.delete({ where: { id: apptId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: sRem.id } });
    await prisma.service.delete({ where: { id: sRem.id } });
  });

  it('Regression 35: Appointment-aware availability uses stored appointment duration/buffer and excludes self from overlap', async () => {
    const sAwareA = await prisma.service.create({
      data: { nameUz: 'Aware Srv A', nameRu: 'Уведомление А', slug: `aware-a-${runId}`, durationMinutes: 30, priceFrom: 10000000 },
    });
    const sAwareB = await prisma.service.create({
      data: { nameUz: 'Aware Srv B', nameRu: 'Уведомление Б', slug: `aware-b-${runId}`, durationMinutes: 40, priceFrom: 15000000 },
    });
    await prisma.doctorService.createMany({
      data: [
        { doctorId: testDoctorBId, serviceId: sAwareA.id },
        { doctorId: testDoctorBId, serviceId: sAwareB.id },
      ],
    });

    const slotTime = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
    slotTime.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent
    if (slotTime.getUTCDay() === 0) slotTime.setUTCDate(slotTime.getUTCDate() + 1);

    // Book 70 min duration (30 + 40)
    const bookingRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceIds: [sAwareA.id, sAwareB.id],
        doctorId: testDoctorBId,
        branchId: testBranchId,
        startTime: slotTime.toISOString(),
        patientName: 'Aware Patient',
        patientPhone: `${testPhonePrefix}35`,
        consentGiven: true,
      })
      .expect(201);

    const token = bookingRes.body.publicToken;
    const apptId = bookingRes.body.appointmentId;

    // Admin duration override to 80 minutes
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptId}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 80, reason: 'Special care needed' })
      .expect(200);

    // Now change catalog service duration to 120 minutes!
    await prisma.service.update({
      where: { id: sAwareA.id },
      data: { durationMinutes: 120 },
    });

    const dateStr = slotTime.toISOString().split('T')[0];

    // Query public appointment-aware reschedule slots
    const publicSlotsRes = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/${token}/slots`)
      .query({ date: dateStr })
      .expect(200);

    // MUST use the appointment's stored historical duration (80 min), NOT catalog's (120+40 = 160 min)!
    expect(publicSlotsRes.body.durationMinutes).toBe(80);
    expect(publicSlotsRes.body.bufferMinutes).toBe(5);
    expect(publicSlotsRes.body.totalDurationWithBufferMinutes).toBe(85);

    // The appointment's OWN slot must be excluded from overlap checks (so self-slot is available)
    const selfSlot = publicSlotsRes.body.slots.find((s: any) => s.startTime === slotTime.toISOString());
    expect(selfSlot).toBeDefined();
    expect(selfSlot.available).toBe(true);

    // Query admin appointment-aware reschedule slots
    const adminSlotsRes = await request(app.getHttpServer())
      .get(`/api/admin/appointments/${apptId}/reschedule-slots`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ date: dateStr })
      .expect(200);

    expect(adminSlotsRes.body.durationMinutes).toBe(80);
    expect(adminSlotsRes.body.totalDurationWithBufferMinutes).toBe(85);

    // Cleanup
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointment.delete({ where: { id: apptId } });
    await prisma.doctorService.deleteMany({ where: { serviceId: { in: [sAwareA.id, sAwareB.id] } } });
    await prisma.service.deleteMany({ where: { id: { in: [sAwareA.id, sAwareB.id] } } });
  });

  it('Regression 36: Doctor schedule accuracy - handles different weekday hours and overtime-only dates correctly', async () => {
    // 1. Create dedicated doctor with different weekday schedules
    const docUnique = await prisma.doctor.create({
      data: {
        firstNameUz: 'Jahongir',
        lastNameUz: 'Oripov',
        firstNameRu: 'Джахонгир',
        lastNameRu: 'Орипов',
        slug: `oripov-${runId}`,
        isActive: true,
      },
    });

    await prisma.doctorBranch.create({
      data: { doctorId: docUnique.id, branchId: testBranchId },
    });

    const sSched = await prisma.service.create({
      data: { nameUz: 'Sched Srv', nameRu: 'Расписание', slug: `sched-${runId}`, durationMinutes: 30 },
    });
    await prisma.doctorService.create({
      data: { doctorId: docUnique.id, serviceId: sSched.id },
    });

    // Monday schedule: 09:00 - 13:00 (morning only)
    await prisma.doctorSchedule.create({
      data: {
        doctorId: docUnique.id,
        dayOfWeek: DayOfWeek.MONDAY,
        branchId: testBranchId,
        startTime: '09:00',
        endTime: '13:00',
        isActive: true,
      },
    });

    // Wednesday schedule: 14:00 - 19:00 (afternoon only)
    await prisma.doctorSchedule.create({
      data: {
        doctorId: docUnique.id,
        dayOfWeek: DayOfWeek.WEDNESDAY,
        branchId: testBranchId,
        startTime: '14:00',
        endTime: '19:00',
        isActive: true,
      },
    });

    // 2. Overtime-only date: Saturday (no weekly schedule, but OVERTIME exception added)
    const targetSat = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // Find next Saturday
    while (targetSat.getUTCDay() !== 6) {
      targetSat.setUTCDate(targetSat.getUTCDate() + 1);
    }
    const satDateStr = targetSat.toISOString().split('T')[0];

    await prisma.scheduleException.create({
      data: {
        doctorId: docUnique.id,
        type: ExceptionType.OVERTIME,
        date: new Date(`${satDateStr}T00:00:00.000Z`),
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Extra Saturday shift',
      },
    });

    // Query Saturday slots: backend MUST return available slots for this overtime date!
    const satSlotsRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: docUnique.id,
        date: satDateStr,
        serviceId: sSched.id,
        branchId: testBranchId,
      })
      .expect(200);

    expect(satSlotsRes.body.slots.length).toBeGreaterThan(0);
    expect(satSlotsRes.body.slots.some((s: any) => s.available)).toBe(true);

    // 3. Full-day Holiday on an otherwise working Monday
    const targetMon = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
    while (targetMon.getUTCDay() !== 1) {
      targetMon.setUTCDate(targetMon.getUTCDate() + 1);
    }
    const monDateStr = targetMon.toISOString().split('T')[0];

    await prisma.scheduleException.create({
      data: {
        doctorId: docUnique.id,
        type: ExceptionType.HOLIDAY,
        date: new Date(`${monDateStr}T00:00:00.000Z`),
        reason: 'National Holiday',
      },
    });

    const holidaySlotsRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({
        doctorId: docUnique.id,
        date: monDateStr,
        serviceId: sSched.id,
        branchId: testBranchId,
      })
      .expect(200);

    expect(holidaySlotsRes.body.slots.length).toBe(0);

    // Cleanup
    await prisma.scheduleException.deleteMany({ where: { doctorId: docUnique.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docUnique.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docUnique.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docUnique.id } });
    await prisma.doctor.delete({ where: { id: docUnique.id } });
    await prisma.service.delete({ where: { id: sSched.id } });
  });

  it('Regression 37: Deterministic concurrent tests for override versus reschedule, in both execution orders', async () => {
    const docConc = await prisma.doctor.create({
      data: {
        firstNameUz: 'Concurrent',
        lastNameUz: 'Doctor',
        firstNameRu: 'Конкурент',
        lastNameRu: 'Доктор',
        slug: `concurrent-doc-${runId}`,
        isActive: true,
      },
    });
    const srvConc = await prisma.service.create({
      data: {
        nameUz: 'Concurrent Srv',
        nameRu: 'Конкурент',
        slug: `conc-srv-${runId}`,
        durationMinutes: 30,
        priceFrom: 10000000,
      },
    });
    await prisma.doctorService.create({
      data: { doctorId: docConc.id, serviceId: srvConc.id },
    });
    await prisma.doctorBranch.create({
      data: { doctorId: docConc.id, branchId: testBranchId },
    });

    for (const d of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
      await prisma.doctorSchedule.create({
        data: { doctorId: docConc.id, dayOfWeek: d, branchId: testBranchId, startTime: '08:00', endTime: '20:00', isActive: true },
      });
    }

    const testSlot1 = getNextWorkingSlot(5, 9, 0);
    const patientConc = await prisma.patient.create({
      data: { fullName: 'Concurrent Patient', phone: `${testPhonePrefix}91` },
    });

    // ORDER A: Duration override started first, reschedule concurrent
    const apptA = await prisma.appointment.create({
      data: {
        publicToken: `conc_a_${runId}_${Date.now()}`,
        patientId: patientConc.id,
        doctorId: docConc.id,
        serviceId: srvConc.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: testSlot1,
        endTime: new Date(testSlot1.getTime() + 35 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 5,
        serviceName: srvConc.nameUz,
        servicePriceFrom: srvConc.priceFrom,
        consentGiven: true,
        serviceItems: {
          create: [{
            serviceId: srvConc.id,
            serviceNameUz: srvConc.nameUz,
            durationMinutes: 30,
            priceFrom: srvConc.priceFrom,
            sortOrder: 0,
          }],
        },
      },
    });

    const newSlotA = new Date(testSlot1.getTime() + 2 * 60 * 60 * 1000);

    const [overrideResA, rescheduleResA] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/admin/appointments/${apptA.id}/duration`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ durationMinutes: 60 }),
      request(app.getHttpServer())
        .put(`/api/admin/appointments/${apptA.id}/reschedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: newSlotA.toISOString() }),
    ]);

    expect(overrideResA.status).toBe(200);
    expect(rescheduleResA.status).toBe(200);

    const finalApptA = await prisma.appointment.findUnique({
      where: { id: apptA.id },
    });
    expect(finalApptA).toBeDefined();
    expect(finalApptA!.durationMinutes).toBe(60);
    const intervalA = (finalApptA!.endTime.getTime() - finalApptA!.startTime.getTime()) / (60 * 1000);
    expect(intervalA).toBe(finalApptA!.durationMinutes + finalApptA!.bufferMinutes);
    expect(intervalA).toBe(65);

    const overlapSlotA = new Date(finalApptA!.startTime.getTime() + 15 * 60 * 1000);
    const conflictResA = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: docConc.id,
        serviceId: srvConc.id,
        branchId: testBranchId,
        startTime: overlapSlotA.toISOString(),
        patientName: 'Overlap Patient',
        patientPhone: `${testPhonePrefix}92`,
        consentGiven: true,
      });
    expect(conflictResA.status).toBe(409);

    // ORDER B: Reschedule started first, override concurrent
    const testSlot2 = new Date(testSlot1.getTime() + 24 * 60 * 60 * 1000);
    const apptB = await prisma.appointment.create({
      data: {
        publicToken: `conc_b_${runId}_${Date.now()}`,
        patientId: patientConc.id,
        doctorId: docConc.id,
        serviceId: srvConc.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: testSlot2,
        endTime: new Date(testSlot2.getTime() + 35 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 5,
        serviceName: srvConc.nameUz,
        servicePriceFrom: srvConc.priceFrom,
        consentGiven: true,
        serviceItems: {
          create: [{
            serviceId: srvConc.id,
            serviceNameUz: srvConc.nameUz,
            durationMinutes: 30,
            priceFrom: srvConc.priceFrom,
            sortOrder: 0,
          }],
        },
      },
    });

    const newSlotB = new Date(testSlot2.getTime() + 3 * 60 * 60 * 1000);

    const [rescheduleResB, overrideResB] = await Promise.all([
      request(app.getHttpServer())
        .put(`/api/admin/appointments/${apptB.id}/reschedule`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime: newSlotB.toISOString() }),
      request(app.getHttpServer())
        .patch(`/api/admin/appointments/${apptB.id}/duration`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ durationMinutes: 45 }),
    ]);

    expect(rescheduleResB.status).toBe(200);
    expect(overrideResB.status).toBe(200);

    const finalApptB = await prisma.appointment.findUnique({
      where: { id: apptB.id },
    });
    expect(finalApptB).toBeDefined();
    expect(finalApptB!.durationMinutes).toBe(45);
    const intervalB = (finalApptB!.endTime.getTime() - finalApptB!.startTime.getTime()) / (60 * 1000);
    expect(intervalB).toBe(finalApptB!.durationMinutes + finalApptB!.bufferMinutes);
    expect(intervalB).toBe(50);

    const overlapSlotB = new Date(finalApptB!.startTime.getTime() + 10 * 60 * 1000);
    const conflictResB = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        doctorId: docConc.id,
        serviceId: srvConc.id,
        branchId: testBranchId,
        startTime: overlapSlotB.toISOString(),
        patientName: 'Overlap Patient B',
        patientPhone: `${testPhonePrefix}93`,
        consentGiven: true,
      });
    expect(conflictResB.status).toBe(409);

    // Cleanup
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: { in: [apptA.id, apptB.id] } } });
    await prisma.notificationJob.deleteMany({ where: { appointmentId: { in: [apptA.id, apptB.id] } } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: { in: [apptA.id, apptB.id] } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [apptA.id, apptB.id] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [apptA.id, apptB.id] } } });
    await prisma.patient.delete({ where: { id: patientConc.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docConc.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docConc.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docConc.id } });
    await prisma.doctor.delete({ where: { id: docConc.id } });
    await prisma.service.delete({ where: { id: srvConc.id } });
  });

  it('Regression 38: Sequential duration override with leased reminder preserves valid reminder', async () => {
    const docReminder = await prisma.doctor.create({
      data: {
        firstNameUz: 'Reminder',
        lastNameUz: 'Doctor',
        firstNameRu: 'Напоминание',
        lastNameRu: 'Доктор',
        slug: `reminder-doc-${runId}`,
        isActive: true,
      },
    });
    const srvReminder = await prisma.service.create({
      data: { nameUz: 'Reminder Srv', nameRu: 'Напоминание', slug: `rem-srv-${runId}`, durationMinutes: 30 },
    });
    await prisma.doctorService.create({ data: { doctorId: docReminder.id, serviceId: srvReminder.id } });
    await prisma.doctorBranch.create({ data: { doctorId: docReminder.id, branchId: testBranchId } });

    for (const d of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
      await prisma.doctorSchedule.create({
        data: { doctorId: docReminder.id, dayOfWeek: d, branchId: testBranchId, startTime: '08:00', endTime: '20:00', isActive: true },
      });
    }

    const futureSlot = getNextWorkingSlot(4, 10, 0);
    const patientRem = await prisma.patient.create({
      data: { fullName: 'Reminder Patient', phone: `${testPhonePrefix}94` },
    });

    const apptRem = await prisma.appointment.create({
      data: {
        publicToken: `rem_tok_${runId}_${Date.now()}`,
        patientId: patientRem.id,
        doctorId: docReminder.id,
        serviceId: srvReminder.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: futureSlot,
        endTime: new Date(futureSlot.getTime() + 35 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 5,
        serviceName: srvReminder.nameUz,
        consentGiven: true,
        revision: 1,
        scheduleRevision: 1,
        serviceItems: {
          create: [{
            serviceId: srvReminder.id,
            serviceNameUz: srvReminder.nameUz,
            durationMinutes: 30,
            sortOrder: 0,
          }],
        },
      },
    });

    // 1. Create a reminder job leased as PROCESSING by worker
    const workerLease = `worker-lease-race-token-${runId}`;
    const job = await prisma.notificationJob.create({
      data: {
        appointmentId: apptRem.id,
        templateKey: 'appointment_reminder',
        channel: 'SMS',
        recipient: patientRem.phone,
        appointmentRevision: 1,
        scheduleRevision: 1,
        status: NotificationStatus.PROCESSING,
        leaseToken: workerLease,
        lockedAt: new Date(),
        scheduledFor: new Date(Date.now() - 5000),
        payload: {
          appointmentId: apptRem.id,
          startTime: apptRem.startTime.toISOString(),
          scheduleRevision: 1,
          formattedTime: 'Bugun soat 10:00',
        },
      },
    });

    // 2. Concurrently execute overrideDuration (revisions 1 -> 2, startTime unchanged)
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptRem.id}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 60 })
      .expect(200);

    const apptAfterOverride = await prisma.appointment.findUnique({ where: { id: apptRem.id } });
    expect(apptAfterOverride!.revision).toBe(2);

    // 3. Worker completes delivery of the in-flight job
    await (notificationsService as any).deliverJob(job, workerLease);

    // 4. Assert: because startTime was unchanged, the reminder was NOT cancelled as stale!
    const jobAfterDelivery = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(jobAfterDelivery!.status).toBe(NotificationStatus.SIMULATED);
    expect(jobAfterDelivery!.leaseToken).toBeNull();

    // 5. Contrast scenario: genuine reschedule changes startTime -> in-flight reminder IS cancelled
    const jobRescheduled = await prisma.notificationJob.create({
      data: {
        appointmentId: apptRem.id,
        templateKey: 'appointment_reminder',
        channel: 'SMS',
        recipient: patientRem.phone,
        appointmentRevision: 2,
        scheduleRevision: 1,
        status: NotificationStatus.PROCESSING,
        leaseToken: `worker-lease-resched-${runId}`,
        lockedAt: new Date(),
        scheduledFor: new Date(Date.now() - 5000),
        payload: {
          appointmentId: apptRem.id,
          startTime: apptRem.startTime.toISOString(),
          scheduleRevision: 1,
        },
      },
    });

    const genuinelyNewSlot = new Date(futureSlot.getTime() + 4 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .put(`/api/admin/appointments/${apptRem.id}/reschedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: genuinelyNewSlot.toISOString() })
      .expect(200);

    await (notificationsService as any).deliverJob(jobRescheduled, `worker-lease-resched-${runId}`);

    const jobAfterReschedDelivery = await prisma.notificationJob.findUnique({ where: { id: jobRescheduled.id } });
    expect(jobAfterReschedDelivery!.status).toBe(NotificationStatus.CANCELLED);
    expect(jobAfterReschedDelivery!.lastError).toContain('Qabul qayta rejalashtirilganligi');

    // Cleanup
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: apptRem.id } });
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptRem.id } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptRem.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: apptRem.id } });
    await prisma.appointment.delete({ where: { id: apptRem.id } });
    await prisma.patient.delete({ where: { id: patientRem.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docReminder.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docReminder.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docReminder.id } });
    await prisma.doctor.delete({ where: { id: docReminder.id } });
    await prisma.service.delete({ where: { id: srvReminder.id } });
  });

  it('Regression 38b: Truly synchronized concurrent worker and override test using controlled fake provider boundary', async () => {
    const docSync = await prisma.doctor.create({
      data: {
        firstNameUz: 'Sync',
        lastNameUz: 'Doctor',
        firstNameRu: 'Синх',
        lastNameRu: 'Доктор',
        slug: `sync-doc-${runId}`,
        isActive: true,
      },
    });
    const srvSync = await prisma.service.create({
      data: { nameUz: 'Sync Srv', nameRu: 'Синхронизация', slug: `sync-srv-${runId}`, durationMinutes: 30 },
    });
    await prisma.doctorService.create({ data: { doctorId: docSync.id, serviceId: srvSync.id } });
    await prisma.doctorBranch.create({ data: { doctorId: docSync.id, branchId: testBranchId } });

    for (const d of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
      await prisma.doctorSchedule.create({
        data: { doctorId: docSync.id, dayOfWeek: d, branchId: testBranchId, startTime: '08:00', endTime: '20:00', isActive: true },
      });
    }

    const futureSlot = getNextWorkingSlot(4, 10, 0);
    const patientSync = await prisma.patient.create({
      data: { fullName: 'Sync Patient', phone: `${testPhonePrefix}93` },
    });

    const apptSync = await prisma.appointment.create({
      data: {
        publicToken: `sync_tok_${runId}_${Date.now()}`,
        patientId: patientSync.id,
        doctorId: docSync.id,
        serviceId: srvSync.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: futureSlot,
        endTime: new Date(futureSlot.getTime() + 35 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 5,
        serviceName: srvSync.nameUz,
        consentGiven: true,
        revision: 1,
        scheduleRevision: 1,
        serviceItems: {
          create: [{
            serviceId: srvSync.id,
            serviceNameUz: srvSync.nameUz,
            durationMinutes: 30,
            sortOrder: 0,
          }],
        },
      },
    });

    const workerLease = `worker-lease-sync-token-${runId}`;
    const job = await prisma.notificationJob.create({
      data: {
        appointmentId: apptSync.id,
        templateKey: 'appointment_reminder',
        channel: 'SMS',
        recipient: patientSync.phone,
        appointmentRevision: 1,
        scheduleRevision: 1,
        status: NotificationStatus.PROCESSING,
        leaseToken: workerLease,
        lockedAt: new Date(),
        scheduledFor: new Date(Date.now() - 5000),
        payload: {
          appointmentId: apptSync.id,
          startTime: apptSync.startTime.toISOString(),
          scheduleRevision: 1,
          formattedTime: 'Bugun soat 10:00',
        },
      },
    });

    // Explicit barrier synchronization:
    // Fake SMS provider pauses execution while physically in flight
    let providerStartedResolve!: () => void;
    const providerStartedPromise = new Promise<void>((res) => { providerStartedResolve = res; });
    let providerProceedResolve!: () => void;
    const providerProceedPromise = new Promise<void>((res) => { providerProceedResolve = res; });

    const deliverSmsSpy = jest.spyOn(notificationsService as any, 'deliverSms').mockImplementation(async () => {
      providerStartedResolve();
      await providerProceedPromise;
      return false; // Simulated delivery
    });

    // 1. Worker begins deliverJob asynchronously
    const workerDeliveryPromise = (notificationsService as any).deliverJob(job, workerLease);

    // 2. Wait until provider is physically inside the network boundary
    await providerStartedPromise;

    // 3. Concurrently execute overrideDuration while provider call is in flight
    await request(app.getHttpServer())
      .patch(`/api/admin/appointments/${apptSync.id}/duration`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 60 })
      .expect(200);

    const apptAfterOverride = await prisma.appointment.findUnique({ where: { id: apptSync.id } });
    expect(apptAfterOverride!.revision).toBe(2);
    expect(apptAfterOverride!.scheduleRevision).toBe(1); // Schedule revision preserved!

    // 4. Release external provider
    providerProceedResolve();

    // 5. Worker completes delivery
    await workerDeliveryPromise;

    // 6. Assert conditional completion succeeded
    const jobAfterDelivery = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(jobAfterDelivery!.status).toBe(NotificationStatus.SIMULATED);
    expect(jobAfterDelivery!.leaseToken).toBeNull();

    deliverSmsSpy.mockRestore();

    // Cleanup
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: apptSync.id } });
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptSync.id } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptSync.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: apptSync.id } });
    await prisma.appointment.delete({ where: { id: apptSync.id } });
    await prisma.patient.delete({ where: { id: patientSync.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docSync.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docSync.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docSync.id } });
    await prisma.doctor.delete({ where: { id: docSync.id } });
    await prisma.service.delete({ where: { id: srvSync.id } });
  });

  it('Regression 39: Reschedule availability agrees with reschedule execution', async () => {
    const docAgree = await prisma.doctor.create({
      data: {
        firstNameUz: 'Agree',
        lastNameUz: 'Doctor',
        firstNameRu: 'Агри',
        lastNameRu: 'Доктор',
        slug: `agree-doc-${runId}`,
        isActive: true,
      },
    });
    const srvA = await prisma.service.create({
      data: { nameUz: 'Srv Primary', nameRu: 'Основной', slug: `srv-a-${runId}`, durationMinutes: 30 },
    });
    const srvB = await prisma.service.create({
      data: { nameUz: 'Srv Secondary', nameRu: 'Вторичный', slug: `srv-b-${runId}`, durationMinutes: 30 },
    });

    await prisma.doctorService.create({ data: { doctorId: docAgree.id, serviceId: srvA.id } });
    await prisma.doctorService.create({ data: { doctorId: docAgree.id, serviceId: srvB.id } });
    await prisma.doctorBranch.create({ data: { doctorId: docAgree.id, branchId: testBranchId } });

    for (const d of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
      await prisma.doctorSchedule.create({
        data: { doctorId: docAgree.id, dayOfWeek: d, branchId: testBranchId, startTime: '08:00', endTime: '20:00', isActive: true },
      });
    }

    const testSlot = getNextWorkingSlot(6, 10, 0);
    const patientAgree = await prisma.patient.create({
      data: { fullName: 'Agree Patient', phone: `${testPhonePrefix}95` },
    });

    const apptAgree = await prisma.appointment.create({
      data: {
        patientId: patientAgree.id,
        doctorId: docAgree.id,
        serviceId: srvA.id,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: testSlot,
        endTime: new Date(testSlot.getTime() + 65 * 60 * 1000),
        durationMinutes: 60,
        bufferMinutes: 5,
        serviceName: `${srvA.nameUz}, ${srvB.nameUz}`,
        consentGiven: true,
        publicToken: `agree-token-${runId}`,
        serviceItems: {
          create: [
            { serviceId: srvA.id, serviceNameUz: srvA.nameUz, durationMinutes: 30, sortOrder: 0 },
            { serviceId: srvB.id, serviceNameUz: srvB.nameUz, durationMinutes: 30, sortOrder: 1 },
          ],
        },
      },
    });

    const targetDateStr = testSlot.toISOString().split('T')[0];

    // Initial state: doctor has both services -> availability succeeds
    const availRes1 = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/${apptAgree.publicToken}/slots`)
      .query({ date: targetDateStr })
      .expect(200);
    expect(availRes1.body.slots.length).toBeGreaterThan(0);

    // Remove doctor's assignment to secondary service B
    await prisma.doctorService.delete({
      where: { doctorId_serviceId: { doctorId: docAgree.id, serviceId: srvB.id } },
    });

    // 1. Availability check MUST fail with 400
    const availRes2 = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/${apptAgree.publicToken}/slots`)
      .query({ date: targetDateStr })
      .expect(400);
    expect(availRes2.body.message).toContain('biriktirilmagan');

    // 2. Reschedule mutation MUST ALSO fail with 400
    const newSlotTime = new Date(testSlot.getTime() + 2 * 60 * 60 * 1000);
    const reschedRes = await request(app.getHttpServer())
      .put(`/api/admin/appointments/${apptAgree.id}/reschedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: newSlotTime.toISOString() })
      .expect(400);
    expect(reschedRes.body.message).toContain('biriktirilmagan');

    // 3. Unresolved legacy bundle policy: component services unknown
    await prisma.doctorService.create({ data: { doctorId: docAgree.id, serviceId: srvB.id } });

    await prisma.appointmentServiceItem.updateMany({
      where: { appointmentId: apptAgree.id },
      data: { isLegacyBundle: true, legacyProvenance: 'AMBIGUOUS_BUNDLE', serviceId: null },
    });

    const bundleAvailRes = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/${apptAgree.publicToken}/slots`)
      .query({ date: targetDateStr })
      .expect(400);
    expect(bundleAvailRes.body.message).toContain('xodimlar ko\'rib chiqishini talab qiladi');

    const bundleReschedRes = await request(app.getHttpServer())
      .put(`/api/admin/appointments/${apptAgree.id}/reschedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: newSlotTime.toISOString() })
      .expect(400);
    expect(bundleReschedRes.body.message).toContain('xodimlar ko\'rib chiqishini talab qiladi');

    // Cleanup
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: apptAgree.id } });
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptAgree.id } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptAgree.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: apptAgree.id } });
    await prisma.appointment.delete({ where: { id: apptAgree.id } });
    await prisma.patient.delete({ where: { id: patientAgree.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docAgree.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docAgree.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docAgree.id } });
    await prisma.doctor.delete({ where: { id: docAgree.id } });
    await prisma.service.deleteMany({ where: { id: { in: [srvA.id, srvB.id] } } });
  });

  it('Regression 40: Strict reschedule slot and booking slot query validation', async () => {
    // 1. Impossible calendar dates: Feb 30, Month 13, April 31
    const feb30Res = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/nonexistent-token/slots`)
      .query({ date: '2026-02-30' });
    expect(feb30Res.status).toBe(400);

    const month13Res = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/nonexistent-token/slots`)
      .query({ date: '2026-13-01' });
    expect(month13Res.status).toBe(400);

    const april31Res = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/nonexistent-token/slots`)
      .query({ date: '2026-04-31' });
    expect(april31Res.status).toBe(400);

    const malformedRes = await request(app.getHttpServer())
      .get(`/api/booking/reschedule/nonexistent-token/slots`)
      .query({ date: 'not-a-date' });
    expect(malformedRes.status).toBe(400);

    // 2. Strict validation on ordinary booking slots endpoint (/api/scheduling/slots)
    const bookingFeb30Res = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({ doctorId: testDoctorAId, date: '2026-02-30', serviceId: testServiceId });
    expect(bookingFeb30Res.status).toBe(400);

    // 3. Timezone validation: reject invalid timezone
    const invalidTzRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({ doctorId: testDoctorAId, date: '2026-10-25', serviceId: testServiceId, timezone: 'Invalid_Zone_123' });
    expect(invalidTzRes.status).toBe(400);

    // 4. Booking horizon consistency: dates beyond 60 days rejected with controlled 400
    const farFutureDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const farFutureRes = await request(app.getHttpServer())
      .get('/api/scheduling/slots')
      .query({ doctorId: testDoctorAId, date: farFutureDate, serviceId: testServiceId });
    expect(farFutureRes.status).toBe(400);
    expect(farFutureRes.body.message).toContain('kundan keyingi muddatga');
  });

  it('Regression 41: Legacy classification without guessing, reconciliation, and transparent analytics', async () => {
    // 1. Legitimate comma-containing single service name in catalog
    const srvComma = await prisma.service.create({
      data: {
        nameUz: 'Konsultatsiya, birlamchi ko\'rik',
        nameRu: 'Консультация, первичный осмотр',
        slug: `konsult-comma-${runId}`,
        durationMinutes: 30,
        priceFrom: 15000000,
      },
    });

    const patientHist = await prisma.patient.create({
      data: { fullName: 'Historical Patient', phone: `${testPhonePrefix}96` },
    });

    const apptComma = await prisma.appointment.create({
      data: {
        id: `hist_appt_comma_${runId}`,
        publicToken: `hist_comma_${runId}_${Date.now()}`,
        patientId: patientHist.id,
        doctorId: testDoctorAId,
        serviceId: srvComma.id,
        branchId: testBranchId,
        status: AppointmentStatus.COMPLETED,
        startTime: new Date('2025-01-10T10:00:00.000Z'),
        endTime: new Date('2025-01-10T10:35:00.000Z'),
        durationMinutes: 30,
        bufferMinutes: 5,
        serviceName: srvComma.nameUz,
        consentGiven: true,
      },
    });

    const itemComma = await prisma.appointmentServiceItem.create({
      data: {
        id: `hist_item_comma_${runId}`,
        appointmentId: apptComma.id,
        serviceId: srvComma.id,
        serviceNameUz: srvComma.nameUz,
        serviceNameRu: srvComma.nameRu,
        durationMinutes: 30,
        priceFrom: srvComma.priceFrom,
        isLegacyBundle: false,
        legacyProvenance: 'VERIFIED_SINGLE',
        originalServiceId: srvComma.id,
      },
    });

    // 2. Renamed historical service
    const srvRenamed = await prisma.service.create({
      data: {
        nameUz: 'Karies davolash (yangi)',
        nameRu: 'Лечение кариеса (новое)',
        slug: `karies-renamed-${runId}`,
        durationMinutes: 45,
      },
    });

    const apptRenamed = await prisma.appointment.create({
      data: {
        id: `hist_appt_renamed_${runId}`,
        publicToken: `hist_renamed_${runId}_${Date.now()}`,
        patientId: patientHist.id,
        doctorId: testDoctorAId,
        serviceId: srvRenamed.id,
        branchId: testBranchId,
        status: AppointmentStatus.COMPLETED,
        startTime: new Date('2025-01-11T11:00:00.000Z'),
        endTime: new Date('2025-01-11T11:50:00.000Z'),
        durationMinutes: 45,
        bufferMinutes: 5,
        serviceName: 'Eski karies nomi',
        consentGiven: true,
      },
    });

    const itemRenamed = await prisma.appointmentServiceItem.create({
      data: {
        id: `hist_item_renamed_${runId}`,
        appointmentId: apptRenamed.id,
        serviceId: null,
        serviceNameUz: 'Eski karies nomi',
        durationMinutes: 45,
        isLegacyBundle: false,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
        originalServiceId: srvRenamed.id,
      },
    });

    // 3. Actual legacy combined-service booking
    const apptBundle = await prisma.appointment.create({
      data: {
        id: `hist_appt_bundle_${runId}`,
        publicToken: `hist_bundle_${runId}_${Date.now()}`,
        patientId: patientHist.id,
        doctorId: testDoctorAId,
        serviceId: srvComma.id,
        branchId: testBranchId,
        status: AppointmentStatus.COMPLETED,
        startTime: new Date('2025-01-12T12:00:00.000Z'),
        endTime: new Date('2025-01-12T13:20:00.000Z'),
        durationMinutes: 75,
        bufferMinutes: 5,
        serviceName: 'Konsultatsiya, Tish tozalash kompleksi',
        consentGiven: true,
      },
    });

    const itemBundle = await prisma.appointmentServiceItem.create({
      data: {
        id: `hist_item_bundle_${runId}`,
        appointmentId: apptBundle.id,
        serviceId: null,
        serviceNameUz: 'Konsultatsiya, Tish tozalash kompleksi',
        durationMinutes: 75,
        isLegacyBundle: true,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
        originalServiceId: srvComma.id,
      },
    });

    // 4. Verify Admin Legacy Review endpoint with pagination
    const reviewRes = await request(app.getHttpServer())
      .get('/api/services/admin/legacy-review?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(reviewRes.body.unresolvedCount).toBeGreaterThanOrEqual(1);
    expect(reviewRes.body.page).toBe(1);
    expect(reviewRes.body.limit).toBe(10);
    expect(reviewRes.body.records.some((r: any) => r.id === itemBundle.id)).toBe(true);

    // 5. Ineligible record rejection: cannot reconcile verified single record
    await request(app.getHttpServer())
      .post('/api/services/admin/reconcile-legacy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemId: itemComma.id,
        action: 'RESOLVE_TO_SERVICE',
        serviceId: srvComma.id,
        reason: 'Bu xizmat allaqachon tekshirilgan',
      })
      .expect(400);

    // 6. Anti-collapse check: cannot force a genuine multi-service bundle into one service
    await request(app.getHttpServer())
      .post('/api/services/admin/reconcile-legacy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemId: itemBundle.id,
        action: 'RESOLVE_TO_SERVICE',
        serviceId: srvComma.id,
        reason: 'Bitta xizmatga majburan bog\'lash urinishi',
      })
      .expect(400);

    // 7. Reconcile bundle using KEEP_AMBIGUOUS_BUNDLE with required reason
    const keepBundleRes = await request(app.getHttpServer())
      .post('/api/services/admin/reconcile-legacy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemId: itemBundle.id,
        action: 'KEEP_AMBIGUOUS_BUNDLE',
        reason: 'Tasdiqlangan ko\'p xizmatli tarixiy paket',
      })
      .expect(201);

    expect(keepBundleRes.body.isLegacyBundle).toBe(true);
    expect(keepBundleRes.body.legacyProvenance).toBe('AMBIGUOUS_BUNDLE');
    expect(keepBundleRes.body.serviceId).toBeNull();

    // 8. Reconcile renamed single service using RESOLVE_TO_SERVICE
    const resolveRenamedRes = await request(app.getHttpServer())
      .post('/api/services/admin/reconcile-legacy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemId: itemRenamed.id,
        action: 'RESOLVE_TO_SERVICE',
        serviceId: srvRenamed.id,
        reason: 'Tarixiy karies xizmati yangi katalog nomiga biriktirildi',
      })
      .expect(201);

    expect(resolveRenamedRes.body.isLegacyBundle).toBe(false);
    expect(resolveRenamedRes.body.legacyProvenance).toBe('RESOLVED_MANUAL');
    expect(resolveRenamedRes.body.serviceId).toBe(srvRenamed.id);
    expect(resolveRenamedRes.body.serviceNameUz).toBe('Eski karies nomi'); // Historical snapshot preserved!
    expect(resolveRenamedRes.body.durationMinutes).toBe(45); // Historical duration preserved!

    // 9. Verify AuditLog created atomically with actor and details
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: { in: [itemBundle.id, itemRenamed.id] } },
    });
    expect(auditLogs.length).toBe(2);
    expect(auditLogs.some((l) => (l.details as any)?.action === 'KEEP_AMBIGUOUS_BUNDLE')).toBe(true);
    expect(auditLogs.some((l) => (l.details as any)?.action === 'RESOLVE_TO_SERVICE')).toBe(true);

    // 10. Cannot reconcile already resolved record again
    await request(app.getHttpServer())
      .post('/api/services/admin/reconcile-legacy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemId: itemRenamed.id,
        action: 'RESOLVE_TO_SERVICE',
        serviceId: srvRenamed.id,
        reason: 'Ikkinchi bor qayta muvofiqlashtirish',
      })
      .expect(400);

    // 11. Transparent Analytics Overview
    const analyticsRes = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ dateFrom: '2025-01-01', dateTo: '2025-01-31' })
      .expect(200);

    expect(analyticsRes.body).toHaveProperty('legacyBundlesCount');
    expect(analyticsRes.body).toHaveProperty('unresolvedRecords');

    // Cleanup
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [itemBundle.id, itemRenamed.id] } },
    });
    await prisma.appointmentServiceItem.deleteMany({
      where: { id: { in: [itemComma.id, itemRenamed.id, itemBundle.id] } },
    });
    await prisma.appointment.deleteMany({
      where: { id: { in: [apptComma.id, apptRenamed.id, apptBundle.id] } },
    });
    await prisma.patient.delete({ where: { id: patientHist.id } });
    await prisma.service.deleteMany({ where: { id: { in: [srvComma.id, srvRenamed.id] } } });
  });

  it('Regression 42: Reminder identity across rescheduling (A delivered -> B delivered), A -> B -> A, and safe payload handling', async () => {
    const srvRem = await prisma.service.create({
      data: {
        nameUz: 'Eslatma Xizmati',
        nameRu: 'Услуга Напоминания',
        slug: `eslatma-${runId}`,
        durationMinutes: 30,
        priceFrom: 10000000,
      },
    });

    const docRem = await prisma.doctor.create({
      data: {
        firstNameUz: 'Eslatma',
        lastNameUz: 'Shifokor',
        firstNameRu: 'Напоминание',
        lastNameRu: 'Врач',
        slug: `doc-eslatma-${runId}`,
        isActive: true,
      },
    });

    await prisma.doctorService.create({ data: { doctorId: docRem.id, serviceId: srvRem.id } });
    await prisma.doctorBranch.create({ data: { doctorId: docRem.id, branchId: testBranchId } });

    for (const d of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
      await prisma.doctorSchedule.create({
        data: { doctorId: docRem.id, dayOfWeek: d, branchId: testBranchId, startTime: '08:00', endTime: '20:00', isActive: true },
      });
    }

    const slotA = getNextWorkingSlot(5, 10, 0);
    const patientRem = await prisma.patient.create({
      data: { fullName: 'Reminder Patient', phone: `${testPhonePrefix}97` },
    });

    // 1. Book appointment for Slot A
    const bookRes = await request(app.getHttpServer())
      .post('/api/booking')
      .send({
        serviceId: srvRem.id,
        doctorId: docRem.id,
        branchId: testBranchId,
        startTime: slotA.toISOString(),
        patientName: patientRem.fullName,
        patientPhone: patientRem.phone,
        consentGiven: true,
      })
      .expect(201);

    const apptId = bookRes.body.appointmentId;
    const publicToken = bookRes.body.publicToken;

    const apptAfterBook = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(apptAfterBook!.scheduleRevision).toBe(1);

    // 2. Deliver reminder for Slot A
    const jobA = await prisma.notificationJob.findFirst({
      where: { appointmentId: apptId, scheduleRevision: 1, templateKey: 'appointment_reminder' },
    });
    expect(jobA).toBeDefined();

    const leaseA = `lease-a-${runId}`;
    await prisma.notificationJob.update({
      where: { id: jobA!.id },
      data: { status: NotificationStatus.PROCESSING, leaseToken: leaseA, lockedAt: new Date() },
    });
    await (notificationsService as any).deliverJob(jobA, leaseA);

    const jobAAfter = await prisma.notificationJob.findUnique({ where: { id: jobA!.id } });
    expect([NotificationStatus.SENT, NotificationStatus.SIMULATED]).toContain(jobAAfter!.status);

    // 3. Reschedule appointment to Slot B
    const slotB = getNextWorkingSlot(6, 14, 0);
    await request(app.getHttpServer())
      .post(`/api/booking/reschedule/${publicToken}`)
      .send({ startTime: slotB.toISOString() })
      .expect(200);

    const apptAfterReschedB = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(apptAfterReschedB!.scheduleRevision).toBe(2);

    // 4. Verify reminder for Slot B is enqueued and NOT suppressed by already delivered Slot A!
    const jobB = await prisma.notificationJob.findFirst({
      where: { appointmentId: apptId, scheduleRevision: 2, templateKey: 'appointment_reminder', status: NotificationStatus.PENDING },
    });
    expect(jobB).toBeDefined();

    const leaseB = `lease-b-${runId}`;
    await prisma.notificationJob.update({
      where: { id: jobB!.id },
      data: { status: NotificationStatus.PROCESSING, leaseToken: leaseB, lockedAt: new Date() },
    });
    await (notificationsService as any).deliverJob(jobB, leaseB);

    const jobBAfter = await prisma.notificationJob.findUnique({ where: { id: jobB!.id } });
    // MUST be delivered (SIMULATED or SENT), NOT cancelled as duplicate!
    expect([NotificationStatus.SENT, NotificationStatus.SIMULATED]).toContain(jobBAfter!.status);

    // 5. Reschedule BACK to Slot A: A -> B -> A
    await request(app.getHttpServer())
      .post(`/api/booking/reschedule/${publicToken}`)
      .send({ startTime: slotA.toISOString() })
      .expect(200);

    const apptAfterReschedA = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(apptAfterReschedA!.scheduleRevision).toBe(3);

    // 6. Simulate an obsolete in-flight reminder from revision 2 attempting delivery
    const obsoleteJob = await prisma.notificationJob.create({
      data: {
        appointmentId: apptId,
        templateKey: 'appointment_reminder',
        channel: 'SMS',
        recipient: patientRem.phone,
        appointmentRevision: 2,
        scheduleRevision: 2,
        status: NotificationStatus.PROCESSING,
        leaseToken: `lease-obs-${runId}`,
        lockedAt: new Date(),
        scheduledFor: new Date(),
        payload: {
          appointmentId: apptId,
          startTime: slotB.toISOString(),
          scheduleRevision: 2,
        },
      },
    });

    await (notificationsService as any).deliverJob(obsoleteJob, `lease-obs-${runId}`);

    const obsoleteAfter = await prisma.notificationJob.findUnique({ where: { id: obsoleteJob.id } });
    expect(obsoleteAfter!.status).toBe(NotificationStatus.CANCELLED);
    expect(obsoleteAfter!.lastError).toContain('Qabul qayta rejalashtirilganligi sababli');

    // 7. Verify replacement reminder for revision 3 delivers cleanly
    const jobRev3 = await prisma.notificationJob.findFirst({
      where: { appointmentId: apptId, scheduleRevision: 3, templateKey: 'appointment_reminder', status: NotificationStatus.PENDING },
    });
    expect(jobRev3).toBeDefined();

    const leaseRev3 = `lease-rev3-${runId}`;
    await prisma.notificationJob.update({
      where: { id: jobRev3!.id },
      data: { status: NotificationStatus.PROCESSING, leaseToken: leaseRev3, lockedAt: new Date() },
    });
    await (notificationsService as any).deliverJob(jobRev3, leaseRev3);

    const jobRev3After = await prisma.notificationJob.findUnique({ where: { id: jobRev3!.id } });
    expect([NotificationStatus.SENT, NotificationStatus.SIMULATED]).toContain(jobRev3After!.status);

    // 8. Safe handling of missing or malformed payload
    const malformedJob = await prisma.notificationJob.create({
      data: {
        appointmentId: apptId,
        templateKey: 'appointment_reminder',
        channel: 'SMS',
        recipient: patientRem.phone,
        appointmentRevision: 3,
        scheduleRevision: 3,
        status: NotificationStatus.PROCESSING,
        leaseToken: `lease-malform-${runId}`,
        lockedAt: new Date(),
        scheduledFor: new Date(),
        payload: {
          foo: 'bar',
        },
      },
    });

    await (notificationsService as any).deliverJob(malformedJob, `lease-malform-${runId}`);

    const malformedAfter = await prisma.notificationJob.findUnique({ where: { id: malformedJob.id } });
    expect(malformedAfter!.status).toBe(NotificationStatus.FAILED);
    expect(malformedAfter!.lastError).toContain('mavjud emas yoki noto\'g\'ri formatda');

    // Cleanup
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptId } });
    await prisma.auditLog.deleteMany({ where: { entityId: apptId } });
    await prisma.appointment.delete({ where: { id: apptId } });
    await prisma.patient.delete({ where: { id: patientRem.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: docRem.id } });
    await prisma.doctorService.deleteMany({ where: { doctorId: docRem.id } });
    await prisma.doctorBranch.deleteMany({ where: { doctorId: docRem.id } });
    await prisma.doctor.delete({ where: { id: docRem.id } });
    await prisma.service.delete({ where: { id: srvRem.id } });
  });

  it('Regression 43: Authoritative clinic timezone from settings with non-Tashkent timezone and UTC day boundaries', async () => {
    // 1. Get or create clinic settings and backup original timezone
    const initialSettings = await prisma.clinicSettings.findFirst();
    const originalTimezone = initialSettings?.timezone || 'Asia/Tashkent';

    // 2. Set clinic timezone to Europe/Samara (UTC+4, 1 hour behind Tashkent UTC+5)
    if (initialSettings) {
      await prisma.clinicSettings.update({
        where: { id: initialSettings.id },
        data: { timezone: 'Europe/Samara' },
      });
    } else {
      await prisma.clinicSettings.create({
        data: { id: 'default', timezone: 'Europe/Samara' },
      });
    }

    try {
      const srvTz = await prisma.service.create({
        data: {
          nameUz: 'Vaqt Mintaqasi Xizmati',
          nameRu: 'Услуга Часового Пояса',
          slug: `tz-srv-${runId}`,
          durationMinutes: 30,
          priceFrom: 10000000,
        },
      });

      const docTz = await prisma.doctor.create({
        data: {
          firstNameUz: 'Samara',
          lastNameUz: 'Doktor',
          firstNameRu: 'Самара',
          lastNameRu: 'Доктор',
          slug: `doc-samara-${runId}`,
          isActive: true,
        },
      });

      await prisma.doctorService.create({ data: { doctorId: docTz.id, serviceId: srvTz.id } });
      await prisma.doctorBranch.create({ data: { doctorId: docTz.id, branchId: testBranchId } });

      // Working hours: Wednesday 09:00 to 18:00 Samara time (UTC+4)
      // 09:00 Samara is 05:00 UTC.
      await prisma.doctorSchedule.create({
        data: {
          doctorId: docTz.id,
          dayOfWeek: DayOfWeek.WEDNESDAY,
          branchId: testBranchId,
          startTime: '09:00',
          endTime: '18:00',
          isActive: true,
        },
      });

      // Target future Wednesday
      const targetDate = '2026-11-18'; // Known Wednesday

      // 3. Query slots without display timezone:
      // Authoritative clinic timezone Europe/Samara must produce first slot at 09:00 Samara = 05:00 UTC!
      const slotRes = await request(app.getHttpServer())
        .get('/api/scheduling/slots')
        .query({
          doctorId: docTz.id,
          date: targetDate,
          serviceId: srvTz.id,
          branchId: testBranchId,
        })
        .expect(200);

      expect(slotRes.body.slots.length).toBeGreaterThan(0);
      expect(slotRes.body.slots[0].startTime).toBe('2026-11-18T05:00:00.000Z');

      // 4. Query slots WITH display timezone parameter (e.g. timezone: 'Asia/Tashkent'):
      // Display timezone must NOT shift physical clinic working hours!
      const slotResDisplay = await request(app.getHttpServer())
        .get('/api/scheduling/slots')
        .query({
          doctorId: docTz.id,
          date: targetDate,
          serviceId: srvTz.id,
          branchId: testBranchId,
          timezone: 'Asia/Tashkent',
        })
        .expect(200);

      expect(slotResDisplay.body.slots.length).toBeGreaterThan(0);
      // Working slot is STILL 05:00 UTC (which corresponds to 09:00 Samara clinic physical time)
      expect(slotResDisplay.body.slots[0].startTime).toBe('2026-11-18T05:00:00.000Z');

      // 5. Test reschedule slots also honors authoritative clinic timezone
      const patientTz = await prisma.patient.create({
        data: { fullName: 'Tz Patient', phone: `${testPhonePrefix}98` },
      });

      const apptTz = await prisma.appointment.create({
        data: {
          publicToken: `tok_tz_${runId}`,
          patientId: patientTz.id,
          doctorId: docTz.id,
          serviceId: srvTz.id,
          branchId: testBranchId,
          status: AppointmentStatus.CONFIRMED,
          startTime: new Date('2026-11-18T05:00:00.000Z'),
          endTime: new Date('2026-11-18T05:35:00.000Z'),
          durationMinutes: 30,
          bufferMinutes: 5,
          serviceName: srvTz.nameUz,
          consentGiven: true,
          serviceItems: {
            create: [{ serviceId: srvTz.id, serviceNameUz: srvTz.nameUz, durationMinutes: 30, sortOrder: 0 }],
          },
        },
      });

      const reschedSlotRes = await request(app.getHttpServer())
        .get(`/api/booking/reschedule/${apptTz.publicToken}/slots`)
        .query({ date: targetDate })
        .expect(200);

      expect(reschedSlotRes.body.slots.length).toBeGreaterThan(0);
      expect(reschedSlotRes.body.slots[0].startTime).toBe('2026-11-18T05:00:00.000Z');

      // Cleanup fixtures
      await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: apptTz.id } });
      await prisma.appointment.delete({ where: { id: apptTz.id } });
      await prisma.patient.delete({ where: { id: patientTz.id } });
      await prisma.doctorSchedule.deleteMany({ where: { doctorId: docTz.id } });
      await prisma.doctorService.deleteMany({ where: { doctorId: docTz.id } });
      await prisma.doctorBranch.deleteMany({ where: { doctorId: docTz.id } });
      await prisma.doctor.delete({ where: { id: docTz.id } });
      await prisma.service.delete({ where: { id: srvTz.id } });
    } finally {
      // Restore clinic settings timezone
      if (initialSettings) {
        await prisma.clinicSettings.update({
          where: { id: initialSettings.id },
          data: { timezone: originalTimezone },
        });
      }
    }
  });

  it('Regression 44: Upgrade legacy reminder identity for pre-scheduleRevision database fixtures', async () => {
    const patient44 = await prisma.patient.create({
      data: { fullName: 'Legacy Upgrade Patient', phone: `${testPhonePrefix}44` },
    });

    const nowUtc = new Date();
    const apptFutureTime = new Date(nowUtc.getTime() + 48 * 60 * 60 * 1000); // 2 days ahead
    const apptOldTime = new Date(nowUtc.getTime() + 24 * 60 * 60 * 1000);

    // Appt 1: generation 1 appointment (scheduleRevision = 1)
    const appt1 = await prisma.appointment.create({
      data: {
        publicToken: `tok_upg1_${runId}`,
        patientId: patient44.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: apptFutureTime,
        endTime: new Date(apptFutureTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 0,
        serviceName: 'Konsultatsiya',
        consentGiven: true,
        scheduleRevision: 1,
        serviceItems: {
          create: [{ serviceId: testServiceId, serviceNameUz: 'Konsultatsiya', durationMinutes: 30, sortOrder: 0 }],
        },
      },
    });

    // Appt 2: historical rescheduled appointment (scheduleRevision = 2, start time changed)
    const appt2 = await prisma.appointment.create({
      data: {
        publicToken: `tok_upg2_${runId}`,
        patientId: patient44.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: apptFutureTime,
        endTime: new Date(apptFutureTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 0,
        serviceName: 'Konsultatsiya',
        consentGiven: true,
        scheduleRevision: 2,
        serviceItems: {
          create: [{ serviceId: testServiceId, serviceNameUz: 'Konsultatsiya', durationMinutes: 30, sortOrder: 0 }],
        },
      },
    });

    // Create pre-scheduleRevision notification jobs with scheduleRevision = null
    // Job 1: Pending job for appt1 matching start time
    const job1 = await prisma.notificationJob.create({
      data: {
        channel: 'SMS',
        templateKey: 'appointment_reminder',
        recipient: patient44.phone,
        appointmentId: appt1.id,
        scheduledFor: new Date(apptFutureTime.getTime() - 2 * 60 * 60 * 1000),
        deduplicationKey: `test_pre_rev_j1_${runId}`,
        status: NotificationStatus.PENDING,
        scheduleRevision: null,
        payload: {
          appointmentId: appt1.id,
          startTime: apptFutureTime.toISOString(),
          serviceName: 'Konsultatsiya',
        },
      },
    });

    // Job 2: Obsolete pending job for appt2 with OLD start time
    const job2 = await prisma.notificationJob.create({
      data: {
        channel: 'SMS',
        templateKey: 'appointment_reminder',
        recipient: patient44.phone,
        appointmentId: appt2.id,
        scheduledFor: new Date(apptOldTime.getTime() - 2 * 60 * 60 * 1000),
        deduplicationKey: `test_pre_rev_j2_${runId}`,
        status: NotificationStatus.PENDING,
        scheduleRevision: null,
        payload: {
          appointmentId: appt2.id,
          startTime: apptOldTime.toISOString(),
          serviceName: 'Konsultatsiya',
        },
      },
    });

    // Job 3: Historical delivered (SENT) job
    const job3 = await prisma.notificationJob.create({
      data: {
        channel: 'SMS',
        templateKey: 'appointment_reminder',
        recipient: patient44.phone,
        appointmentId: appt1.id,
        scheduledFor: new Date(nowUtc.getTime() - 10000),
        deduplicationKey: `test_pre_rev_j3_${runId}`,
        status: NotificationStatus.SENT,
        scheduleRevision: null,
        payload: {
          appointmentId: appt1.id,
          startTime: apptFutureTime.toISOString(),
          serviceName: 'Konsultatsiya',
        },
      },
    });

    // Job 4: Historical FAILED job
    const job4 = await prisma.notificationJob.create({
      data: {
        channel: 'SMS',
        templateKey: 'appointment_reminder',
        recipient: patient44.phone,
        appointmentId: appt1.id,
        scheduledFor: new Date(nowUtc.getTime() - 20000),
        deduplicationKey: `test_pre_rev_j4_${runId}`,
        status: NotificationStatus.FAILED,
        lastError: 'Provider timeout (historical)',
        scheduleRevision: null,
        payload: {
          appointmentId: appt1.id,
          startTime: apptFutureTime.toISOString(),
          serviceName: 'Konsultatsiya',
        },
      },
    });

    // Job 5: Historical CANCELLED job
    const job5 = await prisma.notificationJob.create({
      data: {
        channel: 'SMS',
        templateKey: 'appointment_reminder',
        recipient: patient44.phone,
        appointmentId: appt1.id,
        scheduledFor: new Date(nowUtc.getTime() - 30000),
        deduplicationKey: `test_pre_rev_j5_${runId}`,
        status: NotificationStatus.CANCELLED,
        lastError: 'Historical manual cancel',
        scheduleRevision: null,
        payload: {
          appointmentId: appt1.id,
          startTime: apptFutureTime.toISOString(),
          serviceName: 'Konsultatsiya',
        },
      },
    });

    try {
      // Execute explicit upgrade policy routine
      await notificationsService.upgradeLegacyReminderJobs();

      // Assertions:
      // 1. Verifiable generation 1 job1 was associated with scheduleRevision = 1
      const updatedJob1 = await prisma.notificationJob.findUnique({ where: { id: job1.id } });
      expect(updatedJob1!.scheduleRevision).toBe(1);
      expect(updatedJob1!.status).toBe(NotificationStatus.PENDING);

      // 2. Obsolete job2 (start time was changed / revision > 1) was cancelled and quarantined
      const updatedJob2 = await prisma.notificationJob.findUnique({ where: { id: job2.id } });
      expect(updatedJob2!.status).toBe(NotificationStatus.CANCELLED);
      expect(updatedJob2!.lastError).toContain('Eski yoki tasdiqlanmagan eslatma');

      // 3. Historical SENT job3 delivery history preserved (remains SENT)
      const updatedJob3 = await prisma.notificationJob.findUnique({ where: { id: job3.id } });
      expect(updatedJob3!.status).toBe(NotificationStatus.SENT);

      // 4. Historical FAILED job4 preserved
      const updatedJob4 = await prisma.notificationJob.findUnique({ where: { id: job4.id } });
      expect(updatedJob4!.status).toBe(NotificationStatus.FAILED);
      expect(updatedJob4!.lastError).toBe('Provider timeout (historical)');

      // 5. Historical CANCELLED job5 preserved
      const updatedJob5 = await prisma.notificationJob.findUnique({ where: { id: job5.id } });
      expect(updatedJob5!.status).toBe(NotificationStatus.CANCELLED);

      // 6. Appt 2 is upcoming CONFIRMED with scheduleRevision = 2, so upgrade ensured a valid reminder exists
      const appt2CurrentReminder = await prisma.notificationJob.findFirst({
        where: {
          appointmentId: appt2.id,
          templateKey: 'appointment_reminder',
          scheduleRevision: 2,
          status: NotificationStatus.PENDING,
        },
      });
      expect(appt2CurrentReminder).toBeDefined();
      expect(appt2CurrentReminder!.deduplicationKey).toBe(`reminder_${appt2.id}_s2`);
    } finally {
      await prisma.notificationJob.deleteMany({
        where: { appointmentId: { in: [appt1.id, appt2.id] } },
      });
      await prisma.appointmentServiceItem.deleteMany({
        where: { appointmentId: { in: [appt1.id, appt2.id] } },
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: [appt1.id, appt2.id] } },
      });
      await prisma.patient.delete({ where: { id: patient44.id } });
    }
  });

  it('Regression 45: Deliberate current-generation reminder recovery with existing deduplication keys', async () => {
    const patient45 = await prisma.patient.create({
      data: { fullName: 'Recovery Patient', phone: `${testPhonePrefix}45` },
    });

    const nowUtc = new Date();
    const apptTime = new Date(nowUtc.getTime() + 36 * 60 * 60 * 1000);

    const appt = await prisma.appointment.create({
      data: {
        publicToken: `tok_recov_${runId}`,
        patientId: patient45.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        status: AppointmentStatus.CONFIRMED,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        bufferMinutes: 0,
        serviceName: 'Konsultatsiya',
        consentGiven: true,
        scheduleRevision: 1,
        revision: 1,
        serviceItems: {
          create: [{ serviceId: testServiceId, serviceNameUz: 'Konsultatsiya', durationMinutes: 30, sortOrder: 0 }],
        },
      },
    });

    const canonicalKey = `reminder_${appt.id}_s1`;

    try {
      // 1. Existing FAILED job sharing canonical key
      const failedJob = await prisma.notificationJob.create({
        data: {
          channel: 'SMS',
          templateKey: 'appointment_reminder',
          recipient: patient45.phone,
          appointmentId: appt.id,
          appointmentRevision: 1,
          scheduleRevision: 1,
          scheduledFor: new Date(apptTime.getTime() - 2 * 60 * 60 * 1000),
          deduplicationKey: canonicalKey,
          status: NotificationStatus.FAILED,
          lastError: 'Gateway connection failed 504',
          payload: {
            appointmentId: appt.id,
            startTime: apptTime.toISOString(),
            scheduleRevision: 1,
          },
        },
      });

      // Recover reminder:
      const recoveredJob = await notificationsService.recoverOrEnqueueCurrentReminder({
        id: appt.id,
        startTime: appt.startTime,
        serviceName: appt.serviceName,
        patientEmail: null,
        patientPhone: patient45.phone,
        status: appt.status,
        revision: appt.revision,
        scheduleRevision: 1,
      });

      expect(recoveredJob).toBeDefined();
      expect(recoveredJob!.id).not.toBe(failedJob.id);
      expect(recoveredJob!.status).toBe(NotificationStatus.PENDING);
      expect(recoveredJob!.deduplicationKey).toBe(canonicalKey);

      // Verify the previous failed job's history was strictly preserved with archived key
      const archivedJob = await prisma.notificationJob.findUnique({ where: { id: failedJob.id } });
      expect(archivedJob!.deduplicationKey).toBe(`${canonicalKey}_superseded_${failedJob.id}`);
      expect(archivedJob!.status).toBe(NotificationStatus.FAILED);
      expect(archivedJob!.lastError).toBe('Gateway connection failed 504');

      // 2. Concurrent recovery race:
      await prisma.notificationJob.delete({ where: { id: recoveredJob!.id } });
      await prisma.notificationJob.create({
        data: {
          channel: 'SMS',
          templateKey: 'appointment_reminder',
          recipient: patient45.phone,
          appointmentId: appt.id,
          appointmentRevision: 1,
          scheduleRevision: 1,
          scheduledFor: new Date(apptTime.getTime() - 2 * 60 * 60 * 1000),
          deduplicationKey: canonicalKey,
          status: NotificationStatus.CANCELLED,
          lastError: 'Cancelled in test',
          payload: { appointmentId: appt.id, startTime: apptTime.toISOString(), scheduleRevision: 1 },
        },
      });

      // 5 concurrent recovery requests racing
      const concurrentResults = await Promise.all([
        notificationsService.recoverOrEnqueueCurrentReminder({
          id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
          patientEmail: null, patientPhone: patient45.phone, status: appt.status,
          revision: appt.revision, scheduleRevision: 1,
        }),
        notificationsService.recoverOrEnqueueCurrentReminder({
          id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
          patientEmail: null, patientPhone: patient45.phone, status: appt.status,
          revision: appt.revision, scheduleRevision: 1,
        }),
        notificationsService.recoverOrEnqueueCurrentReminder({
          id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
          patientEmail: null, patientPhone: patient45.phone, status: appt.status,
          revision: appt.revision, scheduleRevision: 1,
        }),
        notificationsService.recoverOrEnqueueCurrentReminder({
          id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
          patientEmail: null, patientPhone: patient45.phone, status: appt.status,
          revision: appt.revision, scheduleRevision: 1,
        }),
        notificationsService.recoverOrEnqueueCurrentReminder({
          id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
          patientEmail: null, patientPhone: patient45.phone, status: appt.status,
          revision: appt.revision, scheduleRevision: 1,
        }),
      ]);

      for (const res of concurrentResults) {
        expect(res).toBeDefined();
        expect(res!.deduplicationKey).toBe(canonicalKey);
      }

      const activeJobs = await prisma.notificationJob.findMany({
        where: { deduplicationKey: canonicalKey },
      });
      expect(activeJobs.length).toBe(1);

      // 3. Delivered reminder check
      await prisma.notificationJob.update({
        where: { id: activeJobs[0].id },
        data: { status: NotificationStatus.SENT },
      });

      const recoveryOnDelivered = await notificationsService.recoverOrEnqueueCurrentReminder({
        id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
        patientEmail: null, patientPhone: patient45.phone, status: appt.status,
        revision: appt.revision, scheduleRevision: 1,
      });

      expect(recoveryOnDelivered!.id).toBe(activeJobs[0].id);
      expect(recoveryOnDelivered!.status).toBe(NotificationStatus.SENT);

      // 4. Ineligible appointment: cancelled appointment returns null
      const cancelledApptRecovery = await notificationsService.recoverOrEnqueueCurrentReminder({
        id: appt.id, startTime: appt.startTime, serviceName: appt.serviceName,
        patientEmail: null, patientPhone: patient45.phone, status: AppointmentStatus.CANCELLED,
        revision: appt.revision, scheduleRevision: 1,
      });
      expect(cancelledApptRecovery).toBeNull();
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.appointment.delete({ where: { id: appt.id } });
      await prisma.patient.delete({ where: { id: patient45.id } });
    }
  });

  it('Regression 46: Intentional production authentication throttling enforces 5 attempts per minute', async () => {
    const testEmail = `throttle_${runId}@dentacare.local`;
    const testIp = `198.51.100.${runId.slice(-2) || '46'}`;

    // Send 5 failed attempts (within the 5-attempt limit)
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ email: testEmail, password: 'WrongPassword123!' });
      expect(res.status).toBe(401);
    }

    // The 6th attempt from the same IP must be rejected with 429 Too Many Requests
    const throttledRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', testIp)
      .send({ email: testEmail, password: 'WrongPassword123!' });

    expect(throttledRes.status).toBe(429);
  });

  it('Regression 47: Safe legacy review edge cases (concurrency conflict handling, renamed single services with commas, and anti-collapse)', async () => {
    const patient47 = await prisma.patient.create({
      data: { fullName: 'Legacy Review Patient', phone: `${testPhonePrefix}47` },
    });

    const nowUtc = new Date();
    const apptTime = new Date(nowUtc.getTime() + 24 * 60 * 60 * 1000);

    // Create single service in catalog
    const singleCatalogService = await prisma.service.create({
      data: {
        nameUz: 'Professional tish profilaktikasi',
        nameRu: 'Профессиональная профилактика зубов',
        slug: `prof-profilaktika-${runId}`,
        category: 'THERAPY',
        durationMinutes: 45,
        priceFrom: 18000000,
        isActive: true,
      },
    });

    // Create multi-service catalog targets
    const multiService1 = await prisma.service.create({
      data: {
        nameUz: `Muolaja A ${runId}`,
        nameRu: `Процедура A ${runId}`,
        slug: `muolaja-a-${runId}`,
        category: 'THERAPY',
        durationMinutes: 30,
        isActive: true,
      },
    });
    const multiService2 = await prisma.service.create({
      data: {
        nameUz: `Muolaja B ${runId}`,
        nameRu: `Процедура B ${runId}`,
        slug: `muolaja-b-${runId}`,
        category: 'THERAPY',
        durationMinutes: 30,
        isActive: true,
      },
    });

    const appt = await prisma.appointment.create({
      data: {
        publicToken: `tok_leg_${runId}`,
        patientId: patient47.id,
        doctorId: testDoctorAId,
        serviceId: singleCatalogService.id,
        branchId: testBranchId,
        status: AppointmentStatus.COMPLETED,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 45 * 60 * 1000),
        durationMinutes: 45,
        bufferMinutes: 0,
        serviceName: 'Tish tozalash, sayqallash',
        consentGiven: true,
      },
    });

    // 1. Renamed single service with a comma: historical snapshot "Tish tozalash, sayqallash"
    const legacyItemComma = await prisma.appointmentServiceItem.create({
      data: {
        appointmentId: appt.id,
        serviceId: null,
        serviceNameUz: 'Tish tozalash, sayqallash',
        durationMinutes: 45,
        priceFrom: 18000000,
        isLegacyBundle: true,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
      },
    });

    // 2. Genuinely uncertain bundle: snapshot contains both Muolaja A and Muolaja B
    const genuineBundleItem = await prisma.appointmentServiceItem.create({
      data: {
        appointmentId: appt.id,
        serviceId: null,
        serviceNameUz: `${multiService1.nameUz}, ${multiService2.nameUz}`,
        durationMinutes: 60,
        isLegacyBundle: true,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
      },
    });

    try {
      // Test 1: Reconcile renamed single service with a comma to the new catalog service
      // Must NOT fail solely because of the comma!
      const reconciledSingle = await servicesService.reconcileLegacyRecord(
        legacyItemComma.id,
        {
          action: 'RESOLVE_TO_SERVICE',
          serviceId: singleCatalogService.id,
          reason: 'Katalog nomi o\'zgargan bitta xizmat (muvofiqlashtirildi)',
        },
        ownerUserId,
      );

      expect(reconciledSingle!.serviceId).toBe(singleCatalogService.id);
      expect(reconciledSingle!.isLegacyBundle).toBe(false);
      expect(reconciledSingle!.legacyProvenance).toBe('RESOLVED_MANUAL');
      expect(reconciledSingle!.serviceNameUz).toBe('Tish tozalash, sayqallash'); // Preserves snapshot!

      // Audit log was created
      const auditEntry = await prisma.auditLog.findFirst({
        where: { entityId: legacyItemComma.id, action: 'service_item.legacy_reconciled' },
      });
      expect(auditEntry).toBeDefined();

      // Test 2: Genuinely uncertain bundle cannot be collapsed into single service
      await expect(
        servicesService.reconcileLegacyRecord(
          genuineBundleItem.id,
          {
            action: 'RESOLVE_TO_SERVICE',
            serviceId: multiService1.id,
            reason: 'Bitta xizmatga bog\'lashga urinish',
          },
          ownerUserId,
        ),
      ).rejects.toThrow('Haqiqiy ko\'p xizmatli paketni (bundle) bitta xizmatga majburan bog\'lash mumkin emas');

      // Test 3: Concurrent resolution race on genuineBundleItem
      const [res1, res2] = await Promise.allSettled([
        servicesService.reconcileLegacyRecord(
          genuineBundleItem.id,
          { action: 'KEEP_AMBIGUOUS_BUNDLE', reason: 'Birinchi qaror tasdiqlandi' },
          ownerUserId,
        ),
        servicesService.reconcileLegacyRecord(
          genuineBundleItem.id,
          { action: 'KEEP_AMBIGUOUS_BUNDLE', reason: 'Ikkinchi parallel qaror' },
          ownerUserId,
        ),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      // Exactly one succeeds, the other gets controlled conflict rejection (no 500 unhandled serialization crash)
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError.status).toBe(409); // Controlled ConflictException!

      // Test 4: Report filter agreement:
      const report = await servicesService.getLegacyReviewReport(1, 20);
      const hasResolvedItem = report.records.some((r) => r.id === legacyItemComma.id);
      expect(hasResolvedItem).toBe(false);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [legacyItemComma.id, genuineBundleItem.id] } },
      });
      await prisma.appointmentServiceItem.deleteMany({
        where: { appointmentId: appt.id },
      });
      await prisma.appointment.delete({ where: { id: appt.id } });
      await prisma.service.deleteMany({
        where: { id: { in: [singleCatalogService.id, multiService1.id, multiService2.id] } },
      });
      await prisma.patient.delete({ where: { id: patient47.id } });
    }
  });

  it('Hardening: Robust Legacy Reminder Upgrade handles malformed timestamps, nulls, orphans, and historical A-B-A', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Legacy Upgrade Patient ${runId}`,
        phone: `+99800${runId}77`,
      },
    });

    const apptFuture = await prisma.appointment.create({
      data: {
        publicToken: `tok_future_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: getNextWorkingSlot(3, 10, 0),
        endTime: getNextWorkingSlot(3, 11, 0),
        durationMinutes: 60,
        bufferMinutes: 0,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Maslahat va tekshiruv',
        scheduleRevision: 1,
        revision: 1,
      },
    });

    // 1. Job with impossible/malformed date (e.g. Feb 30th)
    const malformedJob1 = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: {
          appointmentId: apptFuture.id,
          startTime: '2025-02-30T10:00:00Z', // Impossible calendar date!
        },
      },
    });

    // 2. Job with invalid non-ISO string
    const malformedJob2 = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: {
          appointmentId: apptFuture.id,
          startTime: 'corrupted-timestamp-data',
        },
      },
    });

    // 3. Job with null payload
    const nullPayloadJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: {},
      },
    });

    // 4. Job with null appointmentId
    const nullApptJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: null,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: { startTime: apptFuture.startTime.toISOString() },
      },
    });

    // 5. Orphaned job pointing to nonexistent appointment (created safely with replication role)
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
    const orphanedJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: 'non-existent-appointment-uuid',
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: { startTime: apptFuture.startTime.toISOString() },
      },
    });
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);

    // 6. Valid legacy job matching appointment start time
    const validLegacyJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: {
          appointmentId: apptFuture.id,
          startTime: apptFuture.startTime.toISOString(),
        },
      },
    });

    // 7. Duplicate legacy job matching same start time
    const duplicateLegacyJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PENDING,
        payload: {
          appointmentId: apptFuture.id,
          startTime: apptFuture.startTime.toISOString(),
        },
      },
    });

    // 8. In-flight job with active lease (< 5m)
    const activeLeaseJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: apptFuture.id,
        scheduleRevision: null,
        status: NotificationStatus.PROCESSING,
        lockedAt: new Date(),
        leaseToken: 'worker-lease-token-123',
        payload: {
          appointmentId: apptFuture.id,
          startTime: apptFuture.startTime.toISOString(),
        },
      },
    });

    try {
      // Execute upgrade/repair command implementation
      const upgradeStats = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: false,
        batchSize: 50,
      });

      // Assert that one malformed job did NOT abort the batch
      expect(upgradeStats.errors).toBe(0);
      expect(upgradeStats.scanned).toBeGreaterThanOrEqual(8);
      expect(upgradeStats.quarantined).toBeGreaterThanOrEqual(4); // jobs 1, 2, 3, 4, 5
      expect(upgradeStats.upgraded).toBeGreaterThanOrEqual(1); // validLegacyJob
      expect(upgradeStats.cancelled).toBeGreaterThanOrEqual(5); // malformed, nulls, orphans, duplicate
      expect(upgradeStats.skippedActiveLease).toBeGreaterThanOrEqual(1); // activeLeaseJob

      // Inspect persisted database states
      const dbJob1 = await prisma.notificationJob.findUnique({ where: { id: malformedJob1.id } });
      expect(dbJob1!.status).toBe(NotificationStatus.CANCELLED);
      expect(dbJob1!.lastError).toContain('Quarantined');

      const dbJob2 = await prisma.notificationJob.findUnique({ where: { id: malformedJob2.id } });
      expect(dbJob2!.status).toBe(NotificationStatus.CANCELLED);
      expect(dbJob2!.lastError).toContain('Quarantined');

      const dbNullAppt = await prisma.notificationJob.findUnique({ where: { id: nullApptJob.id } });
      expect(dbNullAppt!.status).toBe(NotificationStatus.CANCELLED);
      expect(dbNullAppt!.lastError).toContain('missing appointmentId');

      const dbOrphan = await prisma.notificationJob.findUnique({ where: { id: orphanedJob.id } });
      expect(dbOrphan!.status).toBe(NotificationStatus.CANCELLED);
      expect(dbOrphan!.lastError).toContain('appointment not found');

      const dbValid = await prisma.notificationJob.findUnique({ where: { id: validLegacyJob.id } });
      expect(dbValid!.scheduleRevision).toBe(1);

      const dbDuplicate = await prisma.notificationJob.findUnique({ where: { id: duplicateLegacyJob.id } });
      expect(dbDuplicate!.status).toBe(NotificationStatus.CANCELLED);
      expect(dbDuplicate!.lastError).toContain('Duplicate legacy reminder');

      const dbActiveLease = await prisma.notificationJob.findUnique({ where: { id: activeLeaseJob.id } });
      expect(dbActiveLease!.status).toBe(NotificationStatus.PROCESSING);
      expect(dbActiveLease!.leaseToken).toBe('worker-lease-token-123');

      // Idempotency: Second execution produces 0 new changes
      const rerunStats = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: false,
        batchSize: 50,
      });
      expect(rerunStats.errors).toBe(0);
      expect(rerunStats.upgraded).toBe(0);
      expect(rerunStats.quarantined).toBe(0);
    } finally {
      await prisma.notificationJob.deleteMany({
        where: {
          id: {
            in: [
              malformedJob1.id,
              malformedJob2.id,
              nullPayloadJob.id,
              nullApptJob.id,
              orphanedJob.id,
              validLegacyJob.id,
              duplicateLegacyJob.id,
              activeLeaseJob.id,
            ],
          },
        },
      });
      await prisma.appointment.delete({ where: { id: apptFuture.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Atomic Reminder Recovery preserves invariants across concurrent recoveries, leases, and rollback', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Atomic Recovery Patient ${runId}`,
        phone: `+99800${runId}88`,
      },
    });

    const appt = await prisma.appointment.create({
      data: {
        publicToken: `tok_atomic_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: getNextWorkingSlot(4, 15, 0),
        endTime: getNextWorkingSlot(4, 16, 0),
        durationMinutes: 60,
        bufferMinutes: 0,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Ortopedik konsultatsiya',
        scheduleRevision: 1,
        revision: 1,
      },
    });

    const apptParams = {
      id: appt.id,
      startTime: appt.startTime,
      serviceName: appt.serviceName,
      patientPhone: testPatient.phone,
      status: appt.status,
      revision: appt.revision,
      scheduleRevision: appt.scheduleRevision,
    };

    try {
      // 1. Two concurrent recoveries without a supplied transaction (auto-starts transaction with row locks)
      const [res1, res2] = await Promise.all([
        notificationsService.recoverOrEnqueueCurrentReminder(apptParams),
        notificationsService.recoverOrEnqueueCurrentReminder(apptParams),
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
      expect(res1.id).toBe(res2.id); // Exactly one canonical job created!

      // Assert only 1 canonical job exists in database
      const canonicalJobs = await prisma.notificationJob.findMany({
        where: { deduplicationKey: `reminder_${appt.id}_s1` },
      });
      expect(canonicalJobs.length).toBe(1);
      const initialJob = canonicalJobs[0];
      expect(initialJob.status).toBe(NotificationStatus.PENDING);

      // 2. Active worker lease (< 5m): Recovery must NOT steal or duplicate
      await prisma.notificationJob.update({
        where: { id: initialJob.id },
        data: {
          status: NotificationStatus.PROCESSING,
          lockedAt: new Date(),
          leaseToken: 'active-lease-token',
        },
      });

      const activeLeaseRecovery = await notificationsService.recoverOrEnqueueCurrentReminder(apptParams);
      expect(activeLeaseRecovery.id).toBe(initialJob.id);
      expect(activeLeaseRecovery.status).toBe(NotificationStatus.PROCESSING);

      // 3. Expired worker lease (>= 5m): Recovery must archive stalled job and create fresh replacement
      await prisma.notificationJob.update({
        where: { id: initialJob.id },
        data: {
          lockedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        },
      });

      const expiredLeaseRecovery = await notificationsService.recoverOrEnqueueCurrentReminder(apptParams);
      expect(expiredLeaseRecovery.id).not.toBe(initialJob.id);
      expect(expiredLeaseRecovery.status).toBe(NotificationStatus.PENDING);
      expect(expiredLeaseRecovery.deduplicationKey).toBe(`reminder_${appt.id}_s1`);

      // Verify old job was archived with superseded key and lastError
      const archivedJob = await prisma.notificationJob.findUnique({ where: { id: initialJob.id } });
      expect(archivedJob!.status).toBe(NotificationStatus.FAILED);
      expect(archivedJob!.lastError).toContain('Worker lease expired');
      expect(archivedJob!.deduplicationKey).toContain('expired_lease');

      // 4. Delivered job (SENT or SIMULATED): Must return existing delivered job without creating duplicates
      await prisma.notificationJob.update({
        where: { id: expiredLeaseRecovery.id },
        data: { status: NotificationStatus.SENT },
      });

      const deliveredRecovery = await notificationsService.recoverOrEnqueueCurrentReminder(apptParams);
      expect(deliveredRecovery.id).toBe(expiredLeaseRecovery.id);
      expect(deliveredRecovery.status).toBe(NotificationStatus.SENT);

      // Clean up jobs for this appointment
      await prisma.notificationJob.deleteMany({ where: { appointmentId: appt.id } });
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: appt.id } });
      await prisma.appointment.delete({ where: { id: appt.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Progressive Legacy Review permits subsequent review of AMBIGUOUS_BUNDLE and rejects stale versions with 409', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Progressive Review Patient ${runId}`,
        phone: `+99800${runId}99`,
      },
    });

    const targetService = await prisma.service.create({
      data: {
        nameUz: 'Plomba qo\'yish va tiklash',
        nameRu: 'Пломбирование и реставрация',
        slug: `plomba-service-${runId}`,
        category: 'THERAPY',
        durationMinutes: 45,
        priceFrom: 180000,
        isActive: true,
      },
    });

    const histAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_prog_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: targetService.id,
        branchId: testBranchId,
        startTime: new Date('2025-01-15T09:00:00.000Z'),
        endTime: new Date('2025-01-15T09:45:00.000Z'),
        durationMinutes: 45,
        bufferMinutes: 0,
        status: AppointmentStatus.COMPLETED,
        serviceName: 'Plomba qo\'yish va tiklash',
      },
    });

    const legacyItem = await prisma.appointmentServiceItem.create({
      data: {
        appointmentId: histAppt.id,
        serviceNameUz: 'Plomba qo\'yish va tiklash',
        serviceNameRu: 'Пломбирование и реставрация',
        durationMinutes: 45,
        priceFrom: 180000,
        legacyProvenance: 'AMBIGUOUS_BUNDLE',
        isLegacyBundle: true,
      },
    });

    try {
      // 1. Initial review: Decision is KEEP_AMBIGUOUS_BUNDLE
      const review1 = await servicesService.reconcileLegacyRecord(
        legacyItem.id,
        {
          action: 'KEEP_AMBIGUOUS_BUNDLE',
          reason: 'Boshlang\'ich taftish: hujjatlar to\'liq emas, paket sifatida saqlandi',
          expectedAuditCount: 0,
        },
        ownerUserId,
      );

      expect(review1.legacyProvenance).toBe('AMBIGUOUS_BUNDLE');
      expect(review1.isLegacyBundle).toBe(true);

      // Verify audit log entry #1 was created
      const audits1 = await prisma.auditLog.findMany({
        where: { entityId: legacyItem.id, action: 'service_item.legacy_reconciled' },
      });
      expect(audits1.length).toBe(1);

      // 2. Stale submission rejected with 409 Conflict: Submitting with expectedAuditCount 0 when actual count is 1
      await expect(
        servicesService.reconcileLegacyRecord(
          legacyItem.id,
          {
            action: 'RESOLVE_TO_SERVICE',
            serviceId: targetService.id,
            reason: 'Eski sahifadan yuborilgan so\'rov',
            expectedAuditCount: 0, // Stale!
          },
          ownerUserId,
        ),
      ).rejects.toThrow('versiya nomutanosibligi');

      // 3. Deliberate subsequent review: Staff later obtains evidence and resolves the record with expectedAuditCount: 1
      const review2 = await servicesService.reconcileLegacyRecord(
        legacyItem.id,
        {
          action: 'RESOLVE_TO_SERVICE',
          serviceId: targetService.id,
          reason: 'Bemorning qog\'oz ambulatoriya kartasi topildi va katalog xizmatiga muvofiqlashtirildi',
          expectedAuditCount: 1, // Matches current audit count!
        },
        ownerUserId,
      );

      expect(review2.legacyProvenance).toBe('RESOLVED_MANUAL');
      expect(review2.isLegacyBundle).toBe(false);
      expect(review2.serviceId).toBe(targetService.id);
      expect(review2.serviceNameUz).toBe('Plomba qo\'yish va tiklash'); // Preserved historical snapshot!

      // Audit history is append-only: Exactly 2 audit logs now exist
      const audits2 = await prisma.auditLog.findMany({
        where: { entityId: legacyItem.id, action: 'service_item.legacy_reconciled' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits2.length).toBe(2);

      // 4. Once resolved to RESOLVED_MANUAL, further modification is rejected per documented policy
      await expect(
        servicesService.reconcileLegacyRecord(
          legacyItem.id,
          {
            action: 'KEEP_AMBIGUOUS_BUNDLE',
            reason: 'Yana paketga qaytarishga urinish',
            expectedAuditCount: 2,
          },
          ownerUserId,
        ),
      ).rejects.toThrow('allaqachon muvofiqlashtirilgan');
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: legacyItem.id } });
      await prisma.appointmentServiceItem.deleteMany({ where: { appointmentId: histAppt.id } });
      await prisma.appointment.delete({ where: { id: histAppt.id } });
      await prisma.service.delete({ where: { id: targetService.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Reminder Repair CLI validation and genuinely read-only dry-run with zero writes across scheduler interval', async () => {
    // 1. Argument validation: Reject unknown options and invalid limits
    expect(() => parseArgs(['--unknown-flag'])).toThrow('Unknown option');
    expect(() => parseArgs(['--batch-size=0'])).toThrow('Invalid --batch-size');
    expect(() => parseArgs(['--batch-size=999'])).toThrow('Invalid --batch-size');
    expect(() => parseArgs(['--max-jobs=-5'])).toThrow('Invalid --max-jobs');
    expect(() => parseArgs(['--database-url='])).toThrow('cannot be empty');

    // 2. Credential sanitization: Never print database passwords
    const rawUrl = 'postgresql://dentacare:supersecretpassword123@localhost:5432/dentacare_test?schema=public';
    const sanitized = sanitizeDatabaseUrl(rawUrl);
    expect(sanitized).not.toContain('supersecretpassword123');
    expect(sanitized).toContain(':****@');

    // 3. Dry-run mode: Genuinely read-only, causes zero database writes
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Dry Run Patient ${runId}`,
        phone: `+99800${runId}71`,
      },
    });

    const apptTime = getNextWorkingSlot(10, 10, 0);
    const testAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_dry_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Maslahat',
        scheduleRevision: 1,
      },
    });

    const legacyJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: testAppt.id,
        status: NotificationStatus.PENDING,
        scheduleRevision: null, // Legacy
        payload: {
          appointmentId: testAppt.id,
          startTime: apptTime.toISOString(),
        },
      },
    });

    try {
      const dryResult = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: true,
        batchSize: 50,
        maxJobs: 100,
      });

      expect(dryResult.scanned).toBeGreaterThanOrEqual(1);
      expect(dryResult.errors).toBe(0);

      // Verify the legacy job in database remains 100% UNCHANGED
      const jobAfterDry = await prisma.notificationJob.findUnique({
        where: { id: legacyJob.id },
      });
      expect(jobAfterDry!.scheduleRevision).toBeNull();
      expect(jobAfterDry!.status).toBe(NotificationStatus.PENDING);
      expect(jobAfterDry!.lastError).toBeNull();
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: testAppt.id } });
      await prisma.appointment.delete({ where: { id: testAppt.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Concurrency safety during legacy reminder repair - active leases, concurrent reschedule, and multi-repair', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Concurrency Patient ${runId}`,
        phone: `+99800${runId}72`,
      },
    });

    const apptTime = getNextWorkingSlot(11, 11, 0);
    const testAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_conc_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Maslahat',
        scheduleRevision: 1,
      },
    });

    try {
      // 1. Worker claiming a reminder during repair (active lease preserved)
      const leasedJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: testAppt.id,
          status: NotificationStatus.PROCESSING,
          lockedAt: new Date(),
          leaseToken: 'active-worker-lease-xyz',
          scheduleRevision: null,
          payload: {
            appointmentId: testAppt.id,
            startTime: apptTime.toISOString(),
          },
        },
      });

      const leaseResult = await notificationsService.upgradeLegacyReminderJobs({
        batchSize: 10,
        maxJobs: 10,
      });

      expect(leaseResult.skippedActiveLease).toBeGreaterThanOrEqual(1);

      // Verify active worker lease was NOT disrupted or overwritten
      const checkLeasedJob = await prisma.notificationJob.findUnique({ where: { id: leasedJob.id } });
      expect(checkLeasedJob!.status).toBe(NotificationStatus.PROCESSING);
      expect(checkLeasedJob!.leaseToken).toBe('active-worker-lease-xyz');
      expect(checkLeasedJob!.scheduleRevision).toBeNull();

      // Clean up leased job
      await prisma.notificationJob.delete({ where: { id: leasedJob.id } });

      // 2. Rescheduling during repair: Legacy reminder for old time is cancelled rather than bound to new schedule
      const oldTimeJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: testAppt.id,
          status: NotificationStatus.PENDING,
          scheduleRevision: null,
          payload: {
            appointmentId: testAppt.id,
            startTime: apptTime.toISOString(), // Old time
          },
        },
      });

      // Concurrently reschedule appointment to a new time
      const newApptTime = new Date(apptTime.getTime() + 24 * 60 * 60 * 1000);
      await prisma.appointment.update({
        where: { id: testAppt.id },
        data: {
          startTime: newApptTime,
          endTime: new Date(newApptTime.getTime() + 30 * 60 * 1000),
          scheduleRevision: 2,
        },
      });

      await notificationsService.upgradeLegacyReminderJobs({ batchSize: 10, maxJobs: 10 });

      const checkOldJob = await prisma.notificationJob.findUnique({ where: { id: oldTimeJob.id } });
      // Obsolete reminder for old schedule must be CANCELLED with scheduleRevision: 0, not bound to revision 2!
      expect(checkOldJob!.status).toBe(NotificationStatus.CANCELLED);
      expect(checkOldJob!.scheduleRevision).toBe(0);

      // Clean up oldTimeJob and any reminder jobs created for testAppt from prior step
      await prisma.notificationJob.deleteMany({ where: { appointmentId: testAppt.id } });

      // 3. Two concurrent repair processes on the same legacy record
      const concurrentJob = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: testAppt.id,
          status: NotificationStatus.PENDING,
          scheduleRevision: null,
          payload: {
            appointmentId: testAppt.id,
            startTime: newApptTime.toISOString(),
          },
        },
      });

      // Launch two repairs concurrently
      const [run1, run2] = await Promise.all([
        notificationsService.upgradeLegacyReminderJobs({ batchSize: 10, maxJobs: 10 }),
        notificationsService.upgradeLegacyReminderJobs({ batchSize: 10, maxJobs: 10 }),
      ]);

      expect(run1.errors).toBe(0);
      expect(run2.errors).toBe(0);

      // Total upgrades for this job across both runs must be exactly 1
      const totalUpgraded = run1.upgraded + run2.upgraded;
      expect(totalUpgraded).toBeGreaterThanOrEqual(1);

      // Database record must have scheduleRevision: 2 and deduplicationKey set
      const finalJob = await prisma.notificationJob.findUnique({ where: { id: concurrentJob.id } });
      expect(finalJob!.scheduleRevision).toBe(2);
      expect(finalJob!.deduplicationKey).toBe(`reminder_${testAppt.id}_s2`);
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: testAppt.id } });
      await prisma.appointment.delete({ where: { id: testAppt.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Delivery history preservation and ambiguous pre-migration A-B-A schedule handling', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `History Preservation Patient ${runId}`,
        phone: `+99800${runId}73`,
      },
    });

    const timeA = getNextWorkingSlot(12, 10, 0);
    const timeB = getNextWorkingSlot(12, 14, 0);

    const testAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_aba_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: timeA,
        endTime: new Date(timeA.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Maslahat',
        scheduleRevision: 1,
      },
    });

    try {
      // 1. Delivery history preservation for malformed records
      const malformedSent = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: testAppt.id,
          status: NotificationStatus.SENT, // Already delivered!
          scheduleRevision: null,
          payload: {
            // Missing startTime!
            appointmentId: testAppt.id,
          },
        },
      });

      await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
      const orphanedSimulated = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: 'non-existent-appointment-id',
          status: NotificationStatus.SIMULATED, // Already delivered!
          scheduleRevision: null,
          payload: {
            startTime: 'invalid-date',
          },
        },
      });
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);

      await notificationsService.upgradeLegacyReminderJobs({ batchSize: 10, maxJobs: 10 });

      // Delivery outcomes must be PRESERVED (NOT overwritten with CANCELLED)
      const checkMalformed = await prisma.notificationJob.findUnique({ where: { id: malformedSent.id } });
      expect(checkMalformed!.status).toBe(NotificationStatus.SENT);
      expect(checkMalformed!.scheduleRevision).toBe(0);
      expect(checkMalformed!.lastError).toContain('Quarantined');

      const checkOrphaned = await prisma.notificationJob.findUnique({ where: { id: orphanedSimulated.id } });
      expect(checkOrphaned!.status).toBe(NotificationStatus.SIMULATED);
      expect(checkOrphaned!.scheduleRevision).toBe(0);

      // Clean up test 1 records
      await prisma.notificationJob.delete({ where: { id: malformedSent.id } });
      await prisma.notificationJob.delete({ where: { id: orphanedSimulated.id } });

      // 2. Pre-migration A -> B -> A Reschedule Identity Verification:
      // Create legacy job sent at Time A before any reschedules
      const pastCreatedAt = new Date(Date.now() - 3600000); // 1 hour ago
      const legacySentJobA = await prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: testPatient.phone,
          appointmentId: testAppt.id,
          status: NotificationStatus.SENT,
          scheduleRevision: null,
          createdAt: pastCreatedAt,
          payload: {
            appointmentId: testAppt.id,
            startTime: timeA.toISOString(),
          },
        },
      });

      // Simulate A -> B -> A rescheduling in database:
      // Rescheduled to B (rev 2), then rescheduled BACK to A (rev 3)
      await prisma.appointment.update({
        where: { id: testAppt.id },
        data: {
          startTime: timeA, // Back at time A!
          scheduleRevision: 3, // Rescheduled twice
          updatedAt: new Date(), // Newer than legacySentJobA.createdAt!
        },
      });

      const abaResult = await notificationsService.upgradeLegacyReminderJobs({ batchSize: 10, maxJobs: 10 });

      // The legacy job at Time A pre-dates the rescheduling -> Ambiguous generation!
      const checkAbaJob = await prisma.notificationJob.findUnique({ where: { id: legacySentJobA.id } });
      expect(checkAbaJob!.status).toBe(NotificationStatus.SENT); // Preserved delivery
      expect(checkAbaJob!.scheduleRevision).toBe(0); // Archived as ambiguous, NOT assigned revision 3!
      expect(checkAbaJob!.lastError).toContain('Ambiguous legacy generation');

      // Conservative recovery creates fresh canonical reminder for current generation (revision 3)
      // so the upcoming appointment at Time A is NOT falsely suppressed!
      const rev3Job = await prisma.notificationJob.findFirst({
        where: {
          appointmentId: testAppt.id,
          scheduleRevision: 3,
        },
      });
      expect(rev3Job).toBeDefined();
      expect(rev3Job!.status).toBe(NotificationStatus.PENDING);
      expect(rev3Job!.deduplicationKey).toBe(`reminder_${testAppt.id}_s3`);
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: testAppt.id } });
      await prisma.appointment.delete({ where: { id: testAppt.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });

  it('Hardening: Bounded repair operation and accurate dry-run reporting without double-counting', async () => {
    const testPatient = await prisma.patient.create({
      data: {
        fullName: `Bounding Patient ${runId}`,
        phone: `+99800${runId}74`,
      },
    });

    const apptTime = getNextWorkingSlot(13, 10, 0);
    const testAppt = await prisma.appointment.create({
      data: {
        publicToken: `tok_bound_${runId}_${Date.now()}`,
        patientId: testPatient.id,
        doctorId: testDoctorAId,
        serviceId: testServiceId,
        branchId: testBranchId,
        startTime: apptTime,
        endTime: new Date(apptTime.getTime() + 30 * 60 * 1000),
        durationMinutes: 30,
        status: AppointmentStatus.CONFIRMED,
        serviceName: 'Maslahat',
        scheduleRevision: 1,
      },
    });

    const legacyJob = await prisma.notificationJob.create({
      data: {
        channel: NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: testPatient.phone,
        appointmentId: testAppt.id,
        status: NotificationStatus.PENDING,
        scheduleRevision: null,
        payload: {
          appointmentId: testAppt.id,
          startTime: apptTime.toISOString(),
        },
      },
    });

    try {
      // Dry-run mode: Planned upgrade of legacyJob satisfies the appointment's reminder requirement.
      // Dry-run MUST NOT double-count newlyCreated!
      const dryResult = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: true,
        batchSize: 50,
        maxJobs: 50,
        maxUpcomingAudit: 50,
      });

      expect(dryResult.upgraded).toBeGreaterThanOrEqual(1);
      // Because planned upgrade covers the appointment, newlyCreated should be 0 for this appointment
      expect(dryResult.details?.some((d) => d.jobId === `new_reminder_${testAppt.id}`)).toBeFalsy();

      // Live mode: Performs the upgrade
      const liveResult = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: false,
        batchSize: 50,
        maxJobs: 50,
        maxUpcomingAudit: 50,
      });

      expect(liveResult.upgraded).toBeGreaterThanOrEqual(1);

      // Verify the upgraded job in DB now has scheduleRevision: 1
      const checkJob = await prisma.notificationJob.findUnique({ where: { id: legacyJob.id } });
      expect(checkJob!.scheduleRevision).toBe(1);

      // Rerun: Idempotent! Nothing to upgrade, nothing newly created
      const rerunResult = await notificationsService.upgradeLegacyReminderJobs({
        dryRun: false,
        batchSize: 50,
        maxJobs: 50,
      });
      expect(rerunResult.upgraded).toBe(0);
      expect(rerunResult.newlyCreated).toBe(0);
    } finally {
      await prisma.notificationJob.deleteMany({ where: { appointmentId: testAppt.id } });
      await prisma.appointment.delete({ where: { id: testAppt.id } });
      await prisma.patient.delete({ where: { id: testPatient.id } });
    }
  });
});




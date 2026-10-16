import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppointmentStatus, StaffRole, ExceptionType, LeadStatus, DayOfWeek, NotificationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';

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
    const patient = await prisma.patient.findFirst();
    const origStart = new Date(Date.now() + 100 * 60 * 60 * 1000);
    origStart.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent
    if (origStart.getUTCDay() === 0) origStart.setUTCDate(origStart.getUTCDate() + 1);

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

    // Mutate clinic settings buffer to 20 minutes
    await prisma.clinicSettings.updateMany({
      data: { bufferMinutes: 20 },
    });

    // Reschedule appointment to new slot
    const newSlot = new Date(origStart.getTime() + 24 * 60 * 60 * 1000);
    if (newSlot.getUTCDay() === 0) newSlot.setUTCDate(newSlot.getUTCDate() + 1);

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

    // Cleanup
    await prisma.clinicSettings.updateMany({
      data: { bufferMinutes: 5 },
    });
    await prisma.appointment.delete({ where: { id: historicalAppt.id } });
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
});



import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
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
  const runId = Date.now().toString().slice(-6);
  const testPhonePrefix = `+99800${runId}`;

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
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    futureDate.setUTCHours(4, 0, 0, 0); // 09:00 Tashkent time

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
    const slotTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slotTime.setUTCHours(5, 0, 0, 0); // 10:00 Tashkent time

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
    const slotTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slotTime.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent time

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

    const slot1 = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slot1.setUTCHours(7, 0, 0, 0); // 12:00 Tashkent time

    const slot2 = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slot2.setUTCHours(9, 0, 0, 0); // 14:00 Tashkent time

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
    const slot = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slot.setUTCHours(11, 0, 0, 0); // 16:00 Tashkent time

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
    const slot = new Date(Date.now() + 48 * 60 * 60 * 1000);
    slot.setUTCHours(12, 0, 0, 0);

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
    const slotTime = new Date(Date.now() + 96 * 60 * 60 * 1000);
    slotTime.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent time
    if (slotTime.getUTCDay() === 0) {
      slotTime.setUTCDate(slotTime.getUTCDate() + 1);
    }
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
});


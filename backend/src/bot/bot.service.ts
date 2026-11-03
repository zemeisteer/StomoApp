import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus } from '@prisma/client';
import { SyncPatientDto, CreateBotBookingDto } from './bot.dto';

@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentsService: AppointmentsService,
    private readonly schedulingService: SchedulingService,
    private readonly auditService: AuditService,
  ) {}

  private normalizePhone(phone: string): string {
    const cleaned = (phone || '').replace(/\D/g, '');
    if (!cleaned.startsWith('998') && cleaned.length === 9) {
      return '+998' + cleaned;
    }
    return '+' + cleaned;
  }

  async getDoctors() {
    const doctors = await this.prisma.doctor.findMany({
      where: { isActive: true },
      include: {
        specialties: { include: { specialty: true } },
        branches: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return doctors.map((doc) => ({
      id: doc.id,
      name: `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`.trim(),
      spec: doc.specialties?.[0]?.specialty?.nameUz || doc.titleUz || 'Stomatolog',
      branchId: doc.branches?.[0]?.branchId || null,
    }));
  }

  async getSlots(dateStr: string, doctorId: string, serviceId?: string, branchId?: string) {
    let effectiveServiceId = serviceId;
    if (!effectiveServiceId) {
      const docService = await this.prisma.doctorService.findFirst({
        where: { doctorId },
        select: { serviceId: true },
      });
      effectiveServiceId = docService?.serviceId;
    }
    if (!effectiveServiceId) {
      const firstService = await this.prisma.service.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      effectiveServiceId = firstService?.id;
    }

    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const docBranch = await this.prisma.doctorBranch.findFirst({
        where: { doctorId },
        select: { branchId: true },
      });
      effectiveBranchId = docBranch?.branchId;
    }

    if (!effectiveServiceId) {
      return { date: dateStr, doctorId, slots: [] };
    }

    const res = await this.schedulingService.getAvailableSlots(
      doctorId,
      dateStr,
      effectiveServiceId,
      effectiveBranchId,
      'Asia/Tashkent',
    );

    const availableTimeStrings = (res.slots || [])
      .filter((s) => s.available)
      .map((s) => {
        const timePart = s.startTime.includes('T') ? s.startTime.split('T')[1].slice(0, 5) : s.startTime.slice(0, 5);
        return timePart;
      });

    return {
      date: dateStr,
      doctorId,
      durationMinutes: res.durationMinutes,
      slots: availableTimeStrings,
      slotObjects: res.slots,
    };
  }

  async syncPatient(dto: SyncPatientDto) {
    const normalized = this.normalizePhone(dto.phone);

    let patient = await this.prisma.patient.findFirst({
      where: { phone: normalized },
    });

    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          phone: normalized,
          fullName: dto.fullName.trim() || 'Telegram Bemor',
          notes: 'Telegram Bot orqali ro\'yxatdan o\'tgan',
        },
      });
    }

    const debtData = await this.getPatientDebt(patient.id);

    return {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      totalDebt: debtData.totalDebt,
    };
  }

  async getPatientAppointments(patientId: string) {
    const appts = await this.prisma.appointment.findMany({
      where: {
        patientId,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
        },
      },
      include: {
        doctor: {
          include: {
            specialties: { include: { specialty: true } },
          },
        },
        service: { select: { nameUz: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    return appts.map((a) => {
      const datePart = a.startTime.toISOString().slice(0, 10);
      const timePart = a.startTime.toISOString().slice(11, 16);
      const docName = a.doctor ? `Dr. ${a.doctor.firstNameUz} ${a.doctor.lastNameUz}`.trim() : 'Shifokor';
      const spec = a.doctor?.specialties?.[0]?.specialty?.nameUz || a.doctor?.titleUz || 'Stomatolog';
      return {
        id: a.id,
        token: a.publicToken,
        doctorName: docName,
        specialization: spec,
        date: datePart,
        time: timePart,
        status: a.status,
        notes: a.note || a.serviceName || a.service?.nameUz || '',
      };
    });
  }

  async getPatientTreatmentPlan(patientId: string) {
    const planItems = await this.prisma.treatmentPlanItem.findMany({
      where: {
        patientId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { toothNumber: 'asc' },
    });

    const odontogramRecords = await this.prisma.odontogramRecord.findMany({
      where: {
        patientId,
        condition: { not: 'HEALTHY' },
      },
      orderBy: { toothNumber: 'asc' },
    });

    const results = planItems.map((p) => ({
      toothNumber: p.toothNumber,
      procedureName: p.treatmentNameUz,
      price: p.costUzs,
      status: p.status,
    }));

    if (results.length === 0 && odontogramRecords.length > 0) {
      for (const rec of odontogramRecords) {
        results.push({
          toothNumber: rec.toothNumber,
          procedureName: `${rec.condition} muolajasi`,
          price: 150000,
          status: 'PLANNED',
        });
      }
    }

    return results;
  }

  async getPatientDebt(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        invoices: { select: { totalAmount: true, discount: true } },
        payments: { select: { amount: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Bemor topilmadi');
    }

    const totalBilled = patient.invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.discount), 0);
    const totalPaid = patient.payments.reduce((sum, p) => sum + p.amount, 0);
    const totalDebt = Math.max(0, totalBilled - totalPaid);

    return {
      patientId: patient.id,
      patientName: patient.fullName,
      totalDebt,
    };
  }

  async createBooking(dto: CreateBotBookingDto) {
    let branchId = dto.branchId;
    if (!branchId) {
      const docBranch = await this.prisma.doctorBranch.findFirst({
        where: { doctorId: dto.doctorId },
        select: { branchId: true },
      });
      branchId = docBranch?.branchId;
    }
    if (!branchId) {
      const firstBranch = await this.prisma.branch.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      branchId = firstBranch?.id;
    }
    if (!branchId) {
      throw new BadRequestException('Faol filial topilmadi');
    }

    let serviceId = dto.serviceId;
    if (!serviceId) {
      const docService = await this.prisma.doctorService.findFirst({
        where: { doctorId: dto.doctorId },
        select: { serviceId: true },
      });
      serviceId = docService?.serviceId;
    }
    if (!serviceId) {
      const firstService = await this.prisma.service.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      serviceId = firstService?.id;
    }
    if (!serviceId) {
      throw new BadRequestException('Faol xizmat topilmadi');
    }

    const normalizedPhone = this.normalizePhone(dto.patientPhone);

    const bookingResult = await this.appointmentsService.createBooking({
      doctorId: dto.doctorId,
      branchId,
      serviceId,
      startTime: dto.startTime,
      patientName: dto.patientName,
      patientPhone: normalizedPhone,
      consentGiven: true,
      source: 'telegram_bot',
      note: dto.notes || 'Telegram bot orqali band qilindi',
    });

    return {
      appointmentId: (bookingResult as any).id || (bookingResult as any).appointmentId,
      publicToken: bookingResult.publicToken,
      doctorName: bookingResult.doctorName,
      startTime: bookingResult.startTime,
      endTime: bookingResult.endTime,
      status: bookingResult.status,
    };
  }

  async cancelAppointment(appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: {
        OR: [{ id: appointmentId }, { publicToken: appointmentId }],
      },
      include: {
        doctor: true,
        patient: true,
      },
    });

    if (!appt) {
      throw new NotFoundException('Qabul topilmadi');
    }

    await this.prisma.appointment.update({
      where: { id: appt.id },
      data: { status: AppointmentStatus.CANCELLED },
    });

    const doctorName = appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}`.trim() : 'Shifokor';

    await this.auditService.log({
      action: 'appointment.cancelled_via_bot',
      entity: 'Appointment',
      entityId: appt.id,
      details: {
        patientName: appt.patient?.fullName,
        doctorName,
        cancelledAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      appointmentId: appt.id,
      patientName: appt.patient?.fullName || 'Bemor',
      doctorName,
      startTime: appt.startTime,
    };
  }

  async getUpcomingReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const windowMs = 15 * 60 * 1000;

    const appts = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        OR: [
          {
            startTime: {
              gte: new Date(in24h.getTime() - windowMs),
              lte: new Date(in24h.getTime() + windowMs),
            },
          },
          {
            startTime: {
              gte: new Date(in2h.getTime() - windowMs),
              lte: new Date(in2h.getTime() + windowMs),
            },
          },
        ],
      },
      include: {
        doctor: true,
        patient: true,
      },
    });

    return appts.map((a) => {
      const diffHours = (a.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const windowType = diffHours > 10 ? '24h' : '2h';
      const timeStr = a.startTime.toISOString().slice(11, 16);
      const doctorName = a.doctor ? `Dr. ${a.doctor.firstNameUz} ${a.doctor.lastNameUz}`.trim() : 'Shifokor';
      return {
        id: a.id,
        patientName: a.patient?.fullName || 'Bemor',
        patientPhone: a.patient?.phone || '',
        doctorName,
        startTime: a.startTime.toISOString(),
        timeStr,
        window: windowType,
      };
    });
  }

  async getDailyDoctorSchedules() {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const doctors = await this.prisma.doctor.findMany({
      where: { isActive: true },
      include: {
        appointments: {
          where: {
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            startTime: { gte: todayStart, lte: todayEnd },
          },
          include: { patient: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    return doctors.map((doc) => ({
      doctorId: doc.id,
      doctorName: `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`.trim(),
      appointments: doc.appointments.map((a) => ({
        id: a.id,
        patientName: a.patient?.fullName || 'Bemor',
        time: a.startTime.toISOString().slice(11, 16),
        notes: a.note || a.serviceName || '',
      })),
    }));
  }
}

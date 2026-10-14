import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, DayOfWeek, ExceptionType } from '@prisma/client';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

const TIME_RESERVING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

export interface TimeSlot {
  startTime: string; // ISO string in UTC
  endTime: string;   // ISO string in UTC
  available: boolean;
}

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a time slot is within the doctor's working hours and not on leave/break
   */
  async isDoctorWorkingAt(
    doctorId: string,
    startTimeUtc: Date,
    endTimeUtc: Date,
    timezone: string = 'Asia/Tashkent',
    branchId?: string,
  ): Promise<boolean> {
    const startZoned = toZonedTime(startTimeUtc, timezone);
    const endZoned = toZonedTime(endTimeUtc, timezone);

    const dayOfWeek = DAY_MAP[startZoned.getDay()];

    const scheduleWhere: any = {
      doctorId,
      dayOfWeek,
      isActive: true,
    };
    if (branchId) {
      scheduleWhere.branchId = branchId;
    }

    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: scheduleWhere,
    });

    if (!schedule) {
      return false;
    }

    const slotStartMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
    const slotEndMinutes = endZoned.getHours() * 60 + endZoned.getMinutes();
    const schedStart = this.parseTime(schedule.startTime);
    const schedEnd = this.parseTime(schedule.endTime);

    if (schedEnd <= schedStart) {
      throw new BadRequestException('Tungi/yarim kechadan o\'tuvchi ish grafigi qo\'llab-quvvatlanmaydi');
    }

    if (slotStartMinutes < schedStart || slotEndMinutes > schedEnd) {
      return false;
    }

    if (schedule.breakStart && schedule.breakEnd) {
      const breakStart = this.parseTime(schedule.breakStart);
      const breakEnd = this.parseTime(schedule.breakEnd);
      if (slotStartMinutes < breakEnd && slotEndMinutes > breakStart) {
        return false;
      }
    }

    const dateOnlyZoned = new Date(startZoned);
    dateOnlyZoned.setHours(0, 0, 0, 0);

    const exceptions = await this.prisma.scheduleException.findMany({
      where: {
        doctorId,
        date: dateOnlyZoned,
        type: { in: [ExceptionType.LEAVE, ExceptionType.HOLIDAY, ExceptionType.BLOCKED] },
      },
    });

    for (const exc of exceptions) {
      if (!exc.startTime || !exc.endTime) {
        return false;
      }
      const excStart = this.parseTime(exc.startTime);
      const excEnd = this.parseTime(exc.endTime);
      if (slotStartMinutes < excEnd && slotEndMinutes > excStart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a time slot is available for a doctor using clinic timezone
   */
  async isTimeSlotAvailable(
    doctorId: string,
    startTimeUtc: Date,
    endTimeUtc: Date,
    timezone: string = 'Asia/Tashkent',
    excludeAppointmentId?: string,
    branchId?: string,
  ): Promise<boolean> {
    const isWorking = await this.isDoctorWorkingAt(
      doctorId,
      startTimeUtc,
      endTimeUtc,
      timezone,
      branchId,
    );
    if (!isWorking) {
      return false;
    }

    // Check existing appointments in UTC
    const whereClause: any = {
      doctorId,
      status: { in: TIME_RESERVING_STATUSES },
      startTime: { lt: endTimeUtc },
      endTime: { gt: startTimeUtc },
    };

    if (excludeAppointmentId) {
      whereClause.id = { not: excludeAppointmentId };
    }

    const conflicting = await this.prisma.appointment.findFirst({
      where: whereClause,
    });

    return !conflicting;
  }

  /**
   * Get available slots for a doctor on a specific date in clinic timezone
   */
  async getAvailableSlots(
    doctorId: string,
    dateStr: string, // YYYY-MM-DD
    serviceId: string,
    branchId?: string,
    timezone: string = 'Asia/Tashkent',
  ): Promise<TimeSlot[]> {
    // Validate doctor
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, isActive: true, isArchived: false },
    });
    if (!doctor) return [];

    // Validate service
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, isActive: true, isArchived: false },
    });
    if (!service) return [];

    // Validate doctor provides this service
    const doctorService = await this.prisma.doctorService.findUnique({
      where: { doctorId_serviceId: { doctorId, serviceId } },
    });
    if (!doctorService) return [];

    // Validate branch if provided
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, isActive: true },
      });
      if (!branch) return [];

      const doctorBranch = await this.prisma.doctorBranch.findUnique({
        where: { doctorId_branchId: { doctorId, branchId } },
      });
      if (!doctorBranch) return [];
    }

    // Parse date in clinic timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return [];

    // Construct local midnight in clinic timezone
    const localDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dayOfWeek = DAY_MAP[localDay.getDay()];

    const scheduleWhere: any = {
      doctorId,
      dayOfWeek,
      isActive: true,
    };
    if (branchId) scheduleWhere.branchId = branchId;

    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: scheduleWhere,
    });

    if (!schedule) return [];

    const settings = await this.prisma.clinicSettings.findFirst();
    const slotInterval = settings?.slotIntervalMinutes ?? 15;
    const buffer = settings?.bufferMinutes ?? 5;
    const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = settings?.maxBookingHorizonDays ?? 60;

    const durationMinutes = doctorService.customDurationMinutes ?? service.durationMinutes;
    const totalMinutes = durationMinutes + buffer;

    const schedStart = this.parseTime(schedule.startTime);
    const schedEnd = this.parseTime(schedule.endTime);

    if (schedEnd <= schedStart) {
      return []; // Unsupported cross-midnight
    }

    const nowUtc = new Date();
    const minBookingTimeUtc = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
    const maxBookingTimeUtc = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

    const slots: TimeSlot[] = [];

    for (let minutes = schedStart; minutes + totalMinutes <= schedEnd; minutes += slotInterval) {
      const startHour = Math.floor(minutes / 60);
      const startMin = minutes % 60;

      // Construct local date time in clinic timezone
      const localSlotStart = new Date(year, month - 1, day, startHour, startMin, 0, 0);
      const localSlotEnd = new Date(localSlotStart.getTime() + totalMinutes * 60 * 1000);

      // Convert local date time to UTC Date
      const slotStartUtc = fromZonedTime(localSlotStart, timezone);
      const slotEndUtc = fromZonedTime(localSlotEnd, timezone);

      // Check minimum booking notice and booking horizon
      if (slotStartUtc < minBookingTimeUtc || slotStartUtc > maxBookingTimeUtc) {
        continue;
      }

      // Check break times
      if (schedule.breakStart && schedule.breakEnd) {
        const breakStartMin = this.parseTime(schedule.breakStart);
        const breakEndMin = this.parseTime(schedule.breakEnd);
        if (minutes < breakEndMin && minutes + totalMinutes > breakStartMin) {
          continue;
        }
      }

      const available = await this.isTimeSlotAvailable(
        doctorId,
        slotStartUtc,
        slotEndUtc,
        timezone,
        undefined,
        branchId || schedule.branchId,
      );

      slots.push({
        startTime: slotStartUtc.toISOString(),
        endTime: slotEndUtc.toISOString(),
        available,
      });
    }

    return slots;
  }

  async getDoctorSchedules(doctorId: string) {
    return this.prisma.doctorSchedule.findMany({
      where: { doctorId },
      include: { branch: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setDoctorSchedule(data: {
    doctorId: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    branchId?: string;
  }) {
    // Validate branchId or resolve default branch
    let branchId = data.branchId;
    if (!branchId) {
      const doctorBranch = await this.prisma.doctorBranch.findFirst({
        where: { doctorId: data.doctorId },
      });
      if (doctorBranch) {
        branchId = doctorBranch.branchId;
      } else {
        const defaultBranch = await this.prisma.branch.findFirst({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        if (!defaultBranch) {
          throw new BadRequestException('Filial topilmadi. Avval filial yarating.');
        }
        branchId = defaultBranch.id;
      }
    }

    const schedStart = this.parseTime(data.startTime);
    const schedEnd = this.parseTime(data.endTime);
    if (schedEnd <= schedStart) {
      throw new BadRequestException('Tugash vaqti boshlanish vaqtidan keyin bo\'lishi kerak');
    }

    if (data.breakStart && data.breakEnd) {
      const bStart = this.parseTime(data.breakStart);
      const bEnd = this.parseTime(data.breakEnd);
      if (bEnd <= bStart || bStart < schedStart || bEnd > schedEnd) {
        throw new BadRequestException('Tanaffus vaqti ish soatlari oralig\'ida bo\'lishi kerak');
      }
    }

    return this.prisma.doctorSchedule.upsert({
      where: {
        doctorId_dayOfWeek_branchId: {
          doctorId: data.doctorId,
          dayOfWeek: data.dayOfWeek,
          branchId,
        },
      },
      create: {
        doctorId: data.doctorId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        breakStart: data.breakStart,
        breakEnd: data.breakEnd,
        branchId,
      },
      update: {
        startTime: data.startTime,
        endTime: data.endTime,
        breakStart: data.breakStart,
        breakEnd: data.breakEnd,
      },
    });
  }

  async addException(data: {
    doctorId: string;
    type: ExceptionType;
    date: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }) {
    return this.prisma.scheduleException.create({
      data: {
        doctorId: data.doctorId,
        type: data.type,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason,
      },
    });
  }

  async getExceptions(doctorId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { doctorId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    return this.prisma.scheduleException.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async deleteException(id: string) {
    return this.prisma.scheduleException.delete({ where: { id } });
  }

  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, DayOfWeek, ExceptionType, Prisma } from '@prisma/client';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

export const TIME_RESERVING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

export interface TimeSlot {
  startTime: string; // ISO string in UTC
  endTime: string;   // ISO string in UTC
  available: boolean;
}

export interface TimeInterval {
  start: number; // minutes from midnight (0..1440)
  end: number;
}

export function subtractInterval(source: TimeInterval, remove: TimeInterval): TimeInterval[] {
  if (remove.start >= source.end || remove.end <= source.start) {
    return [source];
  }
  const result: TimeInterval[] = [];
  if (remove.start > source.start) {
    result.push({ start: source.start, end: Math.min(remove.start, source.end) });
  }
  if (remove.end < source.end) {
    result.push({ start: Math.max(remove.end, source.start), end: source.end });
  }
  return result;
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  private hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Parse "HH:mm" time string to minutes from midnight
   */
  parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Compute unified working intervals for a doctor on a clinic-local calendar date.
   * Supports base schedules, breaks, overtime on non-working days, and deterministic exception precedence.
   */
  async getDoctorWorkingIntervals(
    doctorId: string,
    dateOnlyZoned: Date,
    timezone: string = 'Asia/Tashkent',
    branchId?: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<TimeInterval[]> {
    const client = tx || this.prisma;
    const dayOfWeek = DAY_MAP[dateOnlyZoned.getDay()];

    const scheduleWhere: any = {
      doctorId,
      dayOfWeek,
      isActive: true,
    };
    if (branchId) {
      scheduleWhere.branchId = branchId;
    }

    const schedules = await client.doctorSchedule.findMany({
      where: scheduleWhere,
    });

    let dayIntervals: TimeInterval[] = [];
    for (const sched of schedules) {
      const sStart = this.parseTime(sched.startTime);
      const sEnd = this.parseTime(sched.endTime);
      if (sEnd <= sStart) {
        throw new BadRequestException('Tungi/yarim kechadan o\'tuvchi ish grafigi qo\'llab-quvvatlanmaydi');
      }
      let currentList: TimeInterval[] = [{ start: sStart, end: sEnd }];
      if (sched.breakStart && sched.breakEnd) {
        const bStart = this.parseTime(sched.breakStart);
        const bEnd = this.parseTime(sched.breakEnd);
        const afterBreak: TimeInterval[] = [];
        for (const item of currentList) {
          afterBreak.push(...subtractInterval(item, { start: bStart, end: bEnd }));
        }
        currentList = afterBreak;
      }
      dayIntervals.push(...currentList);
    }

    // Query exceptions on this calendar date
    const dateQuery = new Date(dateOnlyZoned);
    dateQuery.setHours(0, 0, 0, 0);

    const exceptions = await client.scheduleException.findMany({
      where: {
        doctorId,
        date: dateQuery,
      },
    });

    // Check whole day holiday or leave
    const isWholeDayOff = exceptions.some(
      (ex) =>
        ex.type === ExceptionType.HOLIDAY ||
        ((ex.type === ExceptionType.LEAVE || ex.type === ExceptionType.BLOCKED) && (!ex.startTime || !ex.endTime)),
    );
    if (isWholeDayOff) {
      return [];
    }

    // Deterministic Precedence:
    // 1. Add all OVERTIME intervals (even if no regular schedule existed)
    for (const ex of exceptions) {
      if (ex.type === ExceptionType.OVERTIME && ex.startTime && ex.endTime) {
        const otStart = this.parseTime(ex.startTime);
        const otEnd = this.parseTime(ex.endTime);
        if (otEnd > otStart) {
          dayIntervals.push({ start: otStart, end: otEnd });
        }
      }
    }

    // 2. Merge overlapping additions
    dayIntervals = mergeIntervals(dayIntervals);

    // 3. Subtract BLOCKED intervals
    for (const ex of exceptions) {
      if (ex.type === ExceptionType.BLOCKED && ex.startTime && ex.endTime) {
        const blStart = this.parseTime(ex.startTime);
        const blEnd = this.parseTime(ex.endTime);
        const remaining: TimeInterval[] = [];
        for (const item of dayIntervals) {
          remaining.push(...subtractInterval(item, { start: blStart, end: blEnd }));
        }
        dayIntervals = remaining;
      }
    }

    // 4. Subtract partial LEAVE intervals
    for (const ex of exceptions) {
      if (ex.type === ExceptionType.LEAVE && ex.startTime && ex.endTime) {
        const lvStart = this.parseTime(ex.startTime);
        const lvEnd = this.parseTime(ex.endTime);
        const remaining: TimeInterval[] = [];
        for (const item of dayIntervals) {
          remaining.push(...subtractInterval(item, { start: lvStart, end: lvEnd }));
        }
        dayIntervals = remaining;
      }
    }

    return mergeIntervals(dayIntervals);
  }

  /**
   * Check if a time slot is within the doctor's working hours and not on leave/break.
   * Can execute within a Prisma transaction.
   */
  async isDoctorWorkingAt(
    doctorId: string,
    startTimeUtc: Date,
    endTimeUtc: Date,
    timezone: string = 'Asia/Tashkent',
    branchId?: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    const startZoned = toZonedTime(startTimeUtc, timezone);
    const endZoned = toZonedTime(endTimeUtc, timezone);

    if (startZoned.toDateString() !== endZoned.toDateString()) {
      return false; // crosses midnight or multiple calendar days
    }

    const dateOnlyZoned = new Date(startZoned);
    dateOnlyZoned.setHours(0, 0, 0, 0);

    const intervals = await this.getDoctorWorkingIntervals(
      doctorId,
      dateOnlyZoned,
      timezone,
      branchId,
      tx,
    );

    const slotStartMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
    const slotEndMinutes = endZoned.getHours() * 60 + endZoned.getMinutes();

    return intervals.some(
      (int) => slotStartMinutes >= int.start && slotEndMinutes <= int.end,
    );
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
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    const isWorking = await this.isDoctorWorkingAt(
      doctorId,
      startTimeUtc,
      endTimeUtc,
      timezone,
      branchId,
      client,
    );
    if (!isWorking) {
      return false;
    }

    const whereClause: any = {
      doctorId,
      status: { in: TIME_RESERVING_STATUSES },
      startTime: { lt: endTimeUtc },
      endTime: { gt: startTimeUtc },
    };

    if (excludeAppointmentId) {
      whereClause.id = { not: excludeAppointmentId };
    }

    const conflicting = await client.appointment.findFirst({
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
    customDurationMinutes?: number,
    serviceIds?: string[],
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

    const localDay = new Date(year, month - 1, day, 0, 0, 0, 0);

    const clinicSettings = await this.prisma.clinicSettings.findFirst();

    // Multi-service combined duration calculation
    let effectiveDuration = customDurationMinutes ?? (doctorService.customDurationMinutes ?? service.durationMinutes);
    if (!customDurationMinutes && serviceIds && serviceIds.length > 1) {
      const allServices = await this.prisma.service.findMany({
        where: { id: { in: serviceIds }, isActive: true, isArchived: false },
      });
      const doctorServices = await this.prisma.doctorService.findMany({
        where: { doctorId, serviceId: { in: serviceIds } },
      });
      if (allServices.length > 0) {
        effectiveDuration = allServices.reduce((sum, s) => {
          const ds = doctorServices.find(d => d.serviceId === s.id);
          return sum + (ds?.customDurationMinutes ?? s.durationMinutes);
        }, 0);
      }
    }

    const bufferMinutes = clinicSettings?.bufferMinutes ?? 5;
    const totalMinutes = effectiveDuration + bufferMinutes;
    const minNoticeHours = clinicSettings?.minBookingNoticeHours ?? 2;
    const nowUtc = new Date();
    const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);

    // Retrieve unified working intervals for this day (supporting weekly hours, overtime, holidays)
    const workingIntervals = await this.getDoctorWorkingIntervals(
      doctorId,
      localDay,
      timezone,
      branchId,
    );

    if (workingIntervals.length === 0) {
      return [];
    }

    const slots: TimeSlot[] = [];

    // Step across working intervals by totalMinutes or 30-minute increments
    const step = 30; // 30-minute standard slot alignment
    for (const interval of workingIntervals) {
      for (let minutes = interval.start; minutes + totalMinutes <= interval.end; minutes += step) {
        const slotStartHour = Math.floor(minutes / 60);
        const slotStartMinute = minutes % 60;
        const slotStartStr = `${dateStr} ${String(slotStartHour).padStart(2, '0')}:${String(slotStartMinute).padStart(2, '0')}:00`;
        const slotStartUtc = fromZonedTime(slotStartStr, timezone);
        const slotEndUtc = new Date(slotStartUtc.getTime() + totalMinutes * 60 * 1000);

        if (slotStartUtc < minNoticeTime) {
          continue;
        }

        const available = await this.isTimeSlotAvailable(
          doctorId,
          slotStartUtc,
          slotEndUtc,
          timezone,
          undefined,
          branchId,
        );

        slots.push({
          startTime: slotStartUtc.toISOString(),
          endTime: slotEndUtc.toISOString(),
          available,
        });
      }
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

  /**
   * Transactional schedule update with advisory locking
   */
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

    const lockKey = this.hashStringToInt(`doc_${data.doctorId}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      return tx.doctorSchedule.upsert({
        where: {
          doctorId_dayOfWeek_branchId: {
            doctorId: data.doctorId,
            dayOfWeek: data.dayOfWeek,
            branchId: branchId!,
          },
        },
        create: {
          doctorId: data.doctorId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          breakStart: data.breakStart,
          breakEnd: data.breakEnd,
          branchId: branchId!,
        },
        update: {
          startTime: data.startTime,
          endTime: data.endTime,
          breakStart: data.breakStart,
          breakEnd: data.breakEnd,
        },
      });
    });
  }

  /**
   * Transactional exception addition with advisory lock and collision check against active bookings
   */
  async addException(data: {
    doctorId: string;
    type: ExceptionType;
    date: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }) {
    const lockKey = this.hashStringToInt(`doc_${data.doctorId}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // When adding leave, holiday, or blocked period, verify no active appointments are silently stranded
      if (
        data.type === ExceptionType.LEAVE ||
        data.type === ExceptionType.HOLIDAY ||
        data.type === ExceptionType.BLOCKED
      ) {
        const datePart = data.date.split('T')[0];
        const clinicSettings = await tx.clinicSettings.findFirst();
        const tz = clinicSettings?.timezone || 'Asia/Tashkent';

        let checkStart: Date;
        let checkEnd: Date;

        if (data.startTime && data.endTime) {
          checkStart = fromZonedTime(`${datePart} ${data.startTime}:00`, tz);
          checkEnd = fromZonedTime(`${datePart} ${data.endTime}:00`, tz);
        } else {
          checkStart = fromZonedTime(`${datePart} 00:00:00`, tz);
          checkEnd = fromZonedTime(`${datePart} 23:59:59.999`, tz);
        }

        const conflicting = await tx.appointment.findMany({
          where: {
            doctorId: data.doctorId,
            status: { in: TIME_RESERVING_STATUSES },
            startTime: { lt: checkEnd },
            endTime: { gt: checkStart },
          },
          select: { id: true, startTime: true },
        });

        if (conflicting.length > 0) {
          throw new ConflictException(
            `Ushbu muddatda ${conflicting.length} ta faol qabul mavjud. Avval ularni boshqa vaqtga ko'chiring yoki bekor qiling.`,
          );
        }
      }

      return tx.scheduleException.create({
        data: {
          doctorId: data.doctorId,
          type: data.type,
          date: new Date(data.date),
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
        },
      });
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
    const exc = await this.prisma.scheduleException.findUnique({ where: { id } });
    if (!exc) {
      throw new NotFoundException('Istisno topilmadi');
    }
    const lockKey = this.hashStringToInt(`doc_${exc.doctorId}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      return tx.scheduleException.delete({ where: { id } });
    });
  }
}

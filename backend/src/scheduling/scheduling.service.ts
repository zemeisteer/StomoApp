import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, DayOfWeek, ExceptionType, Prisma } from '@prisma/client';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

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

export function validateCalendarDate(dateStr: string): { year: number; month: number; day: number; localDay: Date } {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new BadRequestException('Sana ko\'rsatilishi shart');
  }
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
  if (!match) {
    throw new BadRequestException('Sana YYYY-MM-DD formatida bo\'lishi kerak');
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    utcCheck.getUTCFullYear() !== year ||
    utcCheck.getUTCMonth() !== month - 1 ||
    utcCheck.getUTCDate() !== day
  ) {
    throw new BadRequestException('Mavjud bo\'lmagan sana kiritildi (masalan, 30-fevral)');
  }

  const localDay = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return { year, month, day, localDay };
}

export function validateTimezone(tz?: string, defaultTz = 'Asia/Tashkent'): string {
  if (!tz || !tz.trim()) return defaultTz;
  const trimmed = tz.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    throw new BadRequestException(`Noto'g'ri yoki qo'llab-quvvatlanmaydigan vaqt mintaqasi: ${tz}`);
  }
}

export function IsStrictCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrictCalendarDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          try {
            validateCalendarDate(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(_args: ValidationArguments) {
          return 'Noto\'g\'ri yoki mavjud bo\'lmagan sana (masalan, 30-fevral)';
        },
      },
    });
  };
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === undefined || value === null || value === '') return true;
          if (typeof value !== 'string') return false;
          try {
            validateTimezone(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(_args: ValidationArguments) {
          return 'Noto\'g\'ri yoki qo\'llab-quvvatlanmaydigan vaqt mintaqasi';
        },
      },
    });
  };
}

export function resolveServiceIds(serviceId?: string, serviceIdsInput?: string[] | string): string[] {
  let list: string[] = [];
  if (Array.isArray(serviceIdsInput)) {
    list = serviceIdsInput.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof serviceIdsInput === 'string' && serviceIdsInput.trim()) {
    list = serviceIdsInput.split(',').map((s) => s.trim()).filter(Boolean);
  }

  if (serviceId && serviceId.trim()) {
    const trimmed = serviceId.trim();
    if (!list.includes(trimmed)) {
      list = [trimmed, ...list];
    }
  }

  const unique = new Set(list);
  if (unique.size !== list.length) {
    throw new BadRequestException('Takroriy xizmatlarni tanlash mumkin emas');
  }

  if (list.length < 1 || list.length > 3) {
    throw new BadRequestException('1 tadan 3 tagacha xizmat tanlanishi lozim');
  }

  return list;
}

export interface AuthoritativeDurationResult {
  services: Array<{
    id: string;
    nameUz: string;
    nameRu: string | null;
    durationMinutes: number;
    priceFrom: number | null;
  }>;
  serviceItems: Array<{
    serviceId: string;
    sortOrder: number;
    serviceNameUz: string;
    serviceNameRu: string | null;
    durationMinutes: number;
    priceFrom: number | null;
  }>;
  totalDurationMinutes: number;
  totalPriceFrom: number;
  combinedNameUz: string;
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
    timezone?: string,
    branchId?: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<TimeInterval[]> {
    const client = tx || this.prisma;
    let effectiveTz = timezone;
    if (!effectiveTz) {
      const settings = await client.clinicSettings.findFirst();
      effectiveTz = settings?.timezone?.trim() || 'Asia/Tashkent';
    }

    const y = dateOnlyZoned.getUTCFullYear();
    const m = dateOnlyZoned.getUTCMonth();
    const d = dateOnlyZoned.getUTCDate();
    const dayIndex = new Date(Date.UTC(y, m, d)).getUTCDay();
    const dayOfWeek = DAY_MAP[dayIndex];

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

    // Query exceptions on this calendar date (handling UTC midnight, local midnight, and zoned day bounds)
    const exY = dateOnlyZoned.getUTCFullYear();
    const exM = String(dateOnlyZoned.getUTCMonth() + 1).padStart(2, '0');
    const exD = String(dateOnlyZoned.getUTCDate()).padStart(2, '0');
    const dateStr = `${exY}-${exM}-${exD}`;

    const startOfZonedDay = fromZonedTime(`${dateStr} 00:00:00`, effectiveTz);
    const endOfZonedDay = fromZonedTime(`${dateStr} 23:59:59.999`, effectiveTz);
    const utcMidnight = new Date(`${dateStr}T00:00:00.000Z`);

    const dateQuery = new Date(dateOnlyZoned);
    dateQuery.setHours(0, 0, 0, 0);

    const exceptions = await client.scheduleException.findMany({
      where: {
        doctorId,
        OR: [
          { date: { gte: startOfZonedDay, lte: endOfZonedDay } },
          { date: utcMidnight },
          { date: dateQuery },
        ],
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
    timezone?: string,
    branchId?: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    let effectiveTz = timezone;
    if (!effectiveTz) {
      const settings = await client.clinicSettings.findFirst();
      effectiveTz = settings?.timezone?.trim() || 'Asia/Tashkent';
    }

    const startZoned = toZonedTime(startTimeUtc, effectiveTz);
    const endZoned = toZonedTime(endTimeUtc, effectiveTz);

    if (startZoned.toDateString() !== endZoned.toDateString()) {
      return false; // crosses midnight or multiple calendar days
    }

    const y = startZoned.getFullYear();
    const m = startZoned.getMonth();
    const d = startZoned.getDate();
    const dateOnlyZoned = new Date(Date.UTC(y, m, d, 12, 0, 0));

    const intervals = await this.getDoctorWorkingIntervals(
      doctorId,
      dateOnlyZoned,
      effectiveTz,
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
    timezone?: string,
    excludeAppointmentId?: string,
    branchId?: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    const client = tx || this.prisma;
    let effectiveTz = timezone;
    if (!effectiveTz) {
      const settings = await client.clinicSettings.findFirst();
      effectiveTz = settings?.timezone?.trim() || 'Asia/Tashkent';
    }
    const isWorking = await this.isDoctorWorkingAt(
      doctorId,
      startTimeUtc,
      endTimeUtc,
      effectiveTz,
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
   * Authoritatively calculate treatment duration and pricing based on doctor-specific settings
   */
  async calculateAuthoritativeServiceDuration(
    doctorId: string,
    serviceIds: string[],
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<AuthoritativeDurationResult> {
    const client = tx || this.prisma;

    if (!serviceIds || serviceIds.length === 0 || serviceIds.length > 3) {
      throw new BadRequestException('1 tadan 3 tagacha xizmat tanlanishi lozim');
    }

    const uniqueIds = new Set(serviceIds);
    if (uniqueIds.size !== serviceIds.length) {
      throw new BadRequestException('Takroriy xizmatlarni tanlash mumkin emas');
    }

    const doctor = await client.doctor.findFirst({
      where: { id: doctorId, isActive: true, isArchived: false },
      include: {
        services: true,
      },
    });
    if (!doctor) {
      throw new BadRequestException('Shifokor topilmadi yoki faol emas');
    }

    const services = await client.service.findMany({
      where: { id: { in: serviceIds } },
    });

    if (services.length !== serviceIds.length) {
      throw new BadRequestException('Tanlangan xizmat(lar) topilmadi');
    }

    const inactiveOrArchived = services.find((s) => !s.isActive || s.isArchived);
    if (inactiveOrArchived) {
      throw new BadRequestException('Tanlangan xizmat faol emas yoki arxivlangan');
    }

    const doctorServices = doctor.services.filter((ds) => serviceIds.includes(ds.serviceId));
    if (doctorServices.length !== serviceIds.length) {
      throw new BadRequestException('Shifokor tanlangan barcha xizmatlarni ko\'rsatmaydi');
    }

    const items: Array<{
      serviceId: string;
      sortOrder: number;
      serviceNameUz: string;
      serviceNameRu: string | null;
      durationMinutes: number;
      priceFrom: number | null;
    }> = [];

    let totalDurationMinutes = 0;
    let totalPriceFrom = 0;

    serviceIds.forEach((id, index) => {
      const s = services.find((srv) => srv.id === id)!;
      const ds = doctorServices.find((d) => d.serviceId === id)!;
      const duration = ds.customDurationMinutes ?? s.durationMinutes;

      items.push({
        serviceId: s.id,
        sortOrder: index,
        serviceNameUz: s.nameUz,
        serviceNameRu: s.nameRu,
        durationMinutes: duration,
        priceFrom: s.priceFrom,
      });

      totalDurationMinutes += duration;
      totalPriceFrom += (s.priceFrom || 0);
    });

    const combinedNameUz = items.map((i) => i.serviceNameUz).join(', ');

    return {
      services: services.map((s) => ({
        id: s.id,
        nameUz: s.nameUz,
        nameRu: s.nameRu,
        durationMinutes: s.durationMinutes,
        priceFrom: s.priceFrom,
      })),
      serviceItems: items,
      totalDurationMinutes,
      totalPriceFrom,
      combinedNameUz,
    };
  }

  /**
   * Get available slots for a doctor on a specific date in clinic timezone
   */
  async getAvailableSlots(
    doctorId: string,
    dateStr: string, // YYYY-MM-DD
    serviceId?: string,
    branchId?: string,
    timezone?: string,
    serviceIds?: string[],
  ): Promise<{
    slots: TimeSlot[];
    durationMinutes: number;
    bufferMinutes: number;
    totalDurationWithBufferMinutes: number;
    priceFrom: number;
    serviceName: string;
  }> {
    const effectiveServiceIds = resolveServiceIds(serviceId, serviceIds);

    // Validate branch if provided
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, isActive: true },
      });
      if (!branch) {
        throw new BadRequestException('Filial topilmadi yoki faol emas');
      }

      const doctorBranch = await this.prisma.doctorBranch.findUnique({
        where: { doctorId_branchId: { doctorId, branchId } },
      });
      if (!doctorBranch) {
        throw new BadRequestException('Shifokor bu filialda ishlamaydi');
      }
    }

    const authoritative = await this.calculateAuthoritativeServiceDuration(doctorId, effectiveServiceIds);

    const { localDay } = validateCalendarDate(dateStr);

    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const clinicTimezone = clinicSettings?.timezone?.trim() || 'Asia/Tashkent';

    // Validate display timezone if provided by caller; working hours must not be reinterpreted
    if (timezone) {
      validateTimezone(timezone, clinicTimezone);
    }

    const bufferMinutes = clinicSettings?.bufferMinutes ?? 5;
    const totalMinutes = authoritative.totalDurationMinutes + bufferMinutes;
    const minNoticeHours = clinicSettings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = clinicSettings?.maxBookingHorizonDays ?? 60;
    const nowUtc = new Date();
    const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
    const maxHorizonTime = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

    const startOfSelectedDayUtc = fromZonedTime(`${dateStr} 00:00:00`, clinicTimezone);
    if (startOfSelectedDayUtc > maxHorizonTime) {
      throw new BadRequestException(`${maxHorizonDays} kundan keyingi muddatga band qilib bo'lmaydi`);
    }

    // Retrieve unified working intervals for this day (supporting weekly hours, overtime, holidays)
    const workingIntervals = await this.getDoctorWorkingIntervals(
      doctorId,
      localDay,
      clinicTimezone,
      branchId,
    );

    if (workingIntervals.length === 0) {
      return {
        slots: [],
        durationMinutes: authoritative.totalDurationMinutes,
        bufferMinutes,
        totalDurationWithBufferMinutes: totalMinutes,
        priceFrom: authoritative.totalPriceFrom,
        serviceName: authoritative.combinedNameUz,
      };
    }

    const slots: TimeSlot[] = [];

    // Step across working intervals by totalMinutes or 30-minute increments
    const step = 30; // 30-minute standard slot alignment
    for (const interval of workingIntervals) {
      for (let minutes = interval.start; minutes + totalMinutes <= interval.end; minutes += step) {
        const slotStartHour = Math.floor(minutes / 60);
        const slotStartMinute = minutes % 60;
        const slotStartStr = `${dateStr} ${String(slotStartHour).padStart(2, '0')}:${String(slotStartMinute).padStart(2, '0')}:00`;
        const slotStartUtc = fromZonedTime(slotStartStr, clinicTimezone);
        const slotEndUtc = new Date(slotStartUtc.getTime() + totalMinutes * 60 * 1000);

        if (slotStartUtc < minNoticeTime || slotStartUtc > maxHorizonTime) {
          continue;
        }

        const available = await this.isTimeSlotAvailable(
          doctorId,
          slotStartUtc,
          slotEndUtc,
          clinicTimezone,
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

    return {
      slots,
      durationMinutes: authoritative.totalDurationMinutes,
      bufferMinutes,
      totalDurationWithBufferMinutes: totalMinutes,
      priceFrom: authoritative.totalPriceFrom,
      serviceName: authoritative.combinedNameUz,
    };
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
   * Bulk weekly schedules:
   * Select multiple weekdays, single working interval & break applied to selected days.
   * Supports 'replace' or 'merge' mode.
   */
  async setBatchSchedules(data: {
    doctorIds: string[];
    daysOfWeek: DayOfWeek[];
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    branchId: string;
    mode: 'replace' | 'merge';
  }) {
    if (!data.doctorIds || data.doctorIds.length === 0) {
      throw new BadRequestException('Kamida bitta shifokor tanlanishi shart');
    }
    if (!data.daysOfWeek || data.daysOfWeek.length === 0) {
      throw new BadRequestException('Kamida bitta hafta kuni tanlanishi shart');
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch || !branch.isActive) {
      throw new BadRequestException('Tanlangan filial mavjud emas yoki nofaol');
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

    const warnings: string[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      let createdOrUpdatedCount = 0;

      for (const doctorId of data.doctorIds) {
        const doc = await tx.doctor.findUnique({ where: { id: doctorId } });
        if (!doc) continue;

        // Ensure doctor is assigned to branch
        await tx.doctorBranch.upsert({
          where: { doctorId_branchId: { doctorId, branchId: data.branchId } },
          create: { doctorId, branchId: data.branchId },
          update: {},
        });

        if (data.mode === 'replace') {
          await tx.doctorSchedule.deleteMany({
            where: {
              doctorId,
              branchId: data.branchId,
              dayOfWeek: { in: data.daysOfWeek },
            },
          });
        }

        for (const dayOfWeek of data.daysOfWeek) {
          await tx.doctorSchedule.upsert({
            where: {
              doctorId_dayOfWeek_branchId: {
                doctorId,
                dayOfWeek,
                branchId: data.branchId,
              },
            },
            create: {
              doctorId,
              dayOfWeek,
              startTime: data.startTime,
              endTime: data.endTime,
              breakStart: data.breakStart,
              breakEnd: data.breakEnd,
              branchId: data.branchId,
            },
            update: {
              startTime: data.startTime,
              endTime: data.endTime,
              breakStart: data.breakStart,
              breakEnd: data.breakEnd,
            },
          });
          createdOrUpdatedCount++;
        }
      }

      return { count: createdOrUpdatedCount };
    });

    return {
      success: true,
      updatedCount: result.count,
      doctorCount: data.doctorIds.length,
      daysCount: data.daysOfWeek.length,
      warnings,
    };
  }

  /**
   * Copy schedule from one doctor to one or more other doctors
   */
  async copyDoctorSchedules(data: {
    fromDoctorId: string;
    toDoctorIds: string[];
    mode: 'replace' | 'merge';
    targetBranchId?: string;
  }) {
    if (!data.toDoctorIds || data.toDoctorIds.length === 0) {
      throw new BadRequestException('Nusxa olinadigan shifokorlar tanlanmagan');
    }

    const sourceSchedules = await this.prisma.doctorSchedule.findMany({
      where: { doctorId: data.fromDoctorId, isActive: true },
    });

    if (sourceSchedules.length === 0) {
      throw new BadRequestException('Manba shifokorning faol ish jadvali topilmadi');
    }

    return this.prisma.$transaction(async (tx) => {
      let totalCopied = 0;

      for (const targetDoctorId of data.toDoctorIds) {
        if (targetDoctorId === data.fromDoctorId) continue;

        if (data.mode === 'replace') {
          await tx.doctorSchedule.deleteMany({
            where: { doctorId: targetDoctorId },
          });
        }

        for (const sched of sourceSchedules) {
          const effectiveBranchId = data.targetBranchId || sched.branchId;

          await tx.doctorBranch.upsert({
            where: { doctorId_branchId: { doctorId: targetDoctorId, branchId: effectiveBranchId } },
            create: { doctorId: targetDoctorId, branchId: effectiveBranchId },
            update: {},
          });

          await tx.doctorSchedule.upsert({
            where: {
              doctorId_dayOfWeek_branchId: {
                doctorId: targetDoctorId,
                dayOfWeek: sched.dayOfWeek,
                branchId: effectiveBranchId,
              },
            },
            create: {
              doctorId: targetDoctorId,
              dayOfWeek: sched.dayOfWeek,
              startTime: sched.startTime,
              endTime: sched.endTime,
              breakStart: sched.breakStart,
              breakEnd: sched.breakEnd,
              branchId: effectiveBranchId,
            },
            update: {
              startTime: sched.startTime,
              endTime: sched.endTime,
              breakStart: sched.breakStart,
              breakEnd: sched.breakEnd,
            },
          });
          totalCopied++;
        }
      }

      return {
        success: true,
        copiedSchedulesCount: totalCopied,
        targetDoctorsCount: data.toDoctorIds.length,
      };
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

  /**
   * Appointment-aware availability for rescheduling:
   * Uses stored duration and buffer snapshots from the appointment itself.
   * Excludes the appointment itself from overlap checks so the patient can shift or re-pick their slot.
   * Revalidates current doctor, service, and branch eligibility.
   */
  async getRescheduleSlotsForAppointment(
    appointmentId: string,
    dateStr: string,
    timezone?: string,
  ): Promise<{
    slots: TimeSlot[];
    durationMinutes: number;
    bufferMinutes: number;
    totalDurationWithBufferMinutes: number;
    priceFrom: number | null;
    serviceName: string;
    serviceItems: any[];
  }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { include: { branches: true, services: true } },
        service: true,
        branch: true,
        serviceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(appointment.status)) {
      throw new BadRequestException('Tugallangan yoki bekor qilingan qabulni qayta rejalashtirib bo\'lmaydi');
    }

    // Explicit policy for unresolved legacy bundles: do not claim eligibility verified when component services are unknown
    const hasUnresolvedBundle =
      appointment.serviceItems.some(
        (si: any) => si.isLegacyBundle || si.legacyProvenance === 'AMBIGUOUS_BUNDLE' || !si.serviceId,
      ) || (!appointment.serviceId && appointment.serviceItems.length === 0);

    if (hasUnresolvedBundle) {
      throw new BadRequestException(
        'Tarixiy ko\'p xizmatli qabul tarkibi noaniq bo\'lganligi sababli qayta rejalashtirish xodimlar ko\'rib chiqishini talab qiladi',
      );
    }

    // Validate doctor eligibility
    if (!appointment.doctor || !appointment.doctor.isActive || appointment.doctor.isArchived) {
      throw new BadRequestException('Shifokor profili faol emas');
    }

    // Validate branch eligibility if branch assigned
    if (appointment.branchId) {
      if (!appointment.branch || !appointment.branch.isActive) {
        throw new BadRequestException('Filial faol emas');
      }
      const isAssigned = appointment.doctor.branches.some((b) => b.branchId === appointment.branchId);
      if (!isAssigned) {
        throw new BadRequestException('Shifokor bu filialga biriktirilmagan');
      }
    }

    // Validate all services in serviceItems (or primary serviceId) are still active and assigned to doctor
    const serviceIdsToCheck = appointment.serviceItems.length > 0
      ? (appointment.serviceItems.map((si) => si.serviceId).filter(Boolean) as string[])
      : [appointment.serviceId];

    if (serviceIdsToCheck.length > 0) {
      const activeServices = await this.prisma.service.findMany({
        where: { id: { in: serviceIdsToCheck } },
      });
      if (activeServices.length !== serviceIdsToCheck.length || activeServices.some((s) => !s.isActive || s.isArchived)) {
        throw new BadRequestException('Tanlangan xizmatlardan biri faol emas yoki arxivlangan');
      }

      const doctorServiceIds = (appointment.doctor as any).services?.map((s: any) => s.serviceId) || [];
      for (const sId of serviceIdsToCheck) {
        if (!doctorServiceIds.includes(sId)) {
          throw new BadRequestException('Shifokor ushbu xizmatni ko\'rsatishga biriktirilmagan');
        }
      }
    }

    // Parse and strictly validate date in calendar and timezone
    const { localDay } = validateCalendarDate(dateStr);

    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const clinicTimezone = clinicSettings?.timezone?.trim() || 'Asia/Tashkent';

    // Validate display timezone if provided by caller; working hours must not be reinterpreted
    if (timezone) {
      validateTimezone(timezone, clinicTimezone);
    }

    // USE STORED HISTORICAL SNAPSHOTS FROM APPOINTMENT ITSELF!
    const durationMinutes = appointment.durationMinutes;
    const bufferMinutes = appointment.bufferMinutes ?? clinicSettings?.bufferMinutes ?? 5;
    const totalMinutes = durationMinutes + bufferMinutes;

    const minNoticeHours = clinicSettings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = clinicSettings?.maxBookingHorizonDays ?? 60;
    const nowUtc = new Date();
    const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
    const maxHorizonTime = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);

    const startOfSelectedDayUtc = fromZonedTime(`${dateStr} 00:00:00`, clinicTimezone);
    if (startOfSelectedDayUtc > maxHorizonTime) {
      throw new BadRequestException(`${maxHorizonDays} kundan keyingi muddatga rejalashtirib bo'lmaydi`);
    }

    const workingIntervals = await this.getDoctorWorkingIntervals(
      appointment.doctorId,
      localDay,
      clinicTimezone,
      appointment.branchId || undefined,
    );

    if (workingIntervals.length === 0) {
      return {
        slots: [],
        durationMinutes,
        bufferMinutes,
        totalDurationWithBufferMinutes: totalMinutes,
        priceFrom: appointment.servicePriceFrom,
        serviceName: appointment.serviceName,
        serviceItems: appointment.serviceItems,
      };
    }

    const slots: TimeSlot[] = [];
    const step = 30; // 30-minute standard slot alignment

    for (const interval of workingIntervals) {
      for (let minutes = interval.start; minutes + totalMinutes <= interval.end; minutes += step) {
        const slotStartHour = Math.floor(minutes / 60);
        const slotStartMinute = minutes % 60;
        const slotStartStr = `${dateStr} ${String(slotStartHour).padStart(2, '0')}:${String(slotStartMinute).padStart(2, '0')}:00`;
        const slotStartUtc = fromZonedTime(slotStartStr, clinicTimezone);
        const slotEndUtc = new Date(slotStartUtc.getTime() + totalMinutes * 60 * 1000);

        if (slotStartUtc < minNoticeTime || slotStartUtc > maxHorizonTime) {
          continue;
        }

        // Exclude the current appointment from overlap check!
        const available = await this.isTimeSlotAvailable(
          appointment.doctorId,
          slotStartUtc,
          slotEndUtc,
          clinicTimezone,
          appointment.id, // Exclude appointment!
          appointment.branchId || undefined,
        );

        slots.push({
          startTime: slotStartUtc.toISOString(),
          endTime: slotEndUtc.toISOString(),
          available,
        });
      }
    }

    return {
      slots,
      durationMinutes,
      bufferMinutes,
      totalDurationWithBufferMinutes: totalMinutes,
      priceFrom: appointment.servicePriceFrom,
      serviceName: appointment.serviceName,
      serviceItems: appointment.serviceItems,
    };
  }
}


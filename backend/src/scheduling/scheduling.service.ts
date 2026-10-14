import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, DayOfWeek, ExceptionType } from '@prisma/client';

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
  startTime: string; // ISO string
  endTime: string;
  available: boolean;
}

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a time slot is available for a doctor
   */
  async isTimeSlotAvailable(
    doctorId: string,
    startTime: Date,
    endTime: Date,
    timezone: string,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    // 1. Check doctor's regular schedule for this day
    const dayOfWeek = DAY_MAP[startTime.getDay()];
    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: {
        doctorId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (!schedule) {
      return false; // Doctor doesn't work this day
    }

    // Parse time strings
    const slotStartMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const slotEndMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const schedStart = this.parseTime(schedule.startTime);
    const schedEnd = this.parseTime(schedule.endTime);

    // Check if slot is within working hours
    if (slotStartMinutes < schedStart || slotEndMinutes > schedEnd) {
      return false;
    }

    // Check if slot overlaps with break
    if (schedule.breakStart && schedule.breakEnd) {
      const breakStart = this.parseTime(schedule.breakStart);
      const breakEnd = this.parseTime(schedule.breakEnd);
      if (slotStartMinutes < breakEnd && slotEndMinutes > breakStart) {
        return false;
      }
    }

    // 2. Check schedule exceptions (leave, holidays, blocks)
    const dateOnly = new Date(startTime);
    dateOnly.setHours(0, 0, 0, 0);

    const exceptions = await this.prisma.scheduleException.findMany({
      where: {
        doctorId,
        date: dateOnly,
        type: { in: [ExceptionType.LEAVE, ExceptionType.HOLIDAY, ExceptionType.BLOCKED] },
      },
    });

    for (const exc of exceptions) {
      if (!exc.startTime || !exc.endTime) {
        // Whole day exception
        return false;
      }
      const excStart = this.parseTime(exc.startTime);
      const excEnd = this.parseTime(exc.endTime);
      if (slotStartMinutes < excEnd && slotEndMinutes > excStart) {
        return false;
      }
    }

    // 3. Check existing appointments
    const whereClause: any = {
      doctorId,
      status: { in: TIME_RESERVING_STATUSES },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
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
   * Get available slots for a doctor on a specific date
   */
  async getAvailableSlots(
    doctorId: string,
    date: string, // YYYY-MM-DD
    serviceId: string,
    timezone: string = 'Asia/Tashkent',
  ): Promise<TimeSlot[]> {
    const targetDate = new Date(date + 'T00:00:00');
    const dayOfWeek = DAY_MAP[targetDate.getDay()];

    // Get schedule
    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: { doctorId, dayOfWeek, isActive: true },
    });

    if (!schedule) return [];

    // Get service duration
    const doctorService = await this.prisma.doctorService.findUnique({
      where: { doctorId_serviceId: { doctorId, serviceId } },
    });
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) return [];

    const settings = await this.prisma.clinicSettings.findFirst();
    const slotInterval = settings?.slotIntervalMinutes || 15;
    const buffer = settings?.bufferMinutes || 5;
    const durationMinutes = doctorService?.customDurationMinutes || service.durationMinutes;
    const totalMinutes = durationMinutes + buffer;

    // Generate time slots
    const schedStart = this.parseTime(schedule.startTime);
    const schedEnd = this.parseTime(schedule.endTime);
    const slots: TimeSlot[] = [];

    for (let minutes = schedStart; minutes + totalMinutes <= schedEnd; minutes += slotInterval) {
      const startHour = Math.floor(minutes / 60);
      const startMin = minutes % 60;

      const slotStart = new Date(targetDate);
      slotStart.setHours(startHour, startMin, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + totalMinutes * 60 * 1000);

      // Skip break times
      if (schedule.breakStart && schedule.breakEnd) {
        const breakStartMin = this.parseTime(schedule.breakStart);
        const breakEndMin = this.parseTime(schedule.breakEnd);
        if (minutes < breakEndMin && minutes + totalMinutes > breakStartMin) {
          continue;
        }
      }

      const available = await this.isTimeSlotAvailable(
        doctorId, slotStart, slotEnd, timezone,
      );

      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        available,
      });
    }

    return slots;
  }

  /**
   * Get doctor schedules
   */
  async getDoctorSchedules(doctorId: string) {
    return this.prisma.doctorSchedule.findMany({
      where: { doctorId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * Set doctor schedule for a day
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
    return this.prisma.doctorSchedule.upsert({
      where: {
        doctorId_dayOfWeek_branchId: {
          doctorId: data.doctorId,
          dayOfWeek: data.dayOfWeek,
          branchId: data.branchId || null,
        },
      },
      create: {
        doctorId: data.doctorId,
        dayOfWeek: data.dayOfWeek,
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
  }

  /**
   * Add schedule exception
   */
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

  /**
   * Get exceptions for a doctor
   */
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

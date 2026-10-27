import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus } from '@prisma/client';
import { getBranchLockKey, acquireDeterministicLocks } from '../common/concurrency-lock.helper';

@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getSettings() {
    let settings = await this.prisma.clinicSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.clinicSettings.create({ data: {} });
    }

    let parsedPhones: Array<{ id: string; number: string; label: string; isPrimary: boolean }> = [];
    if (settings.phones && Array.isArray(settings.phones) && settings.phones.length > 0) {
      parsedPhones = (settings.phones as any[]).map((p, idx) => ({
        id: p.id || `phone-${idx + 1}`,
        number: p.number || '',
        label: p.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam'),
        isPrimary: Boolean(p.isPrimary ?? idx === 0),
      }));
    } else if (settings.phone) {
      try {
        if (settings.phone.trim().startsWith('[')) {
          const rawParsed = JSON.parse(settings.phone);
          if (Array.isArray(rawParsed) && rawParsed.length > 0) {
            parsedPhones = rawParsed.map((p: any, idx: number) => ({
              id: p.id || `phone-${idx + 1}`,
              number: p.number || '',
              label: p.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam'),
              isPrimary: Boolean(p.isPrimary ?? idx === 0),
            }));
          }
        }
      } catch {}

      if (parsedPhones.length === 0) {
        parsedPhones = [{ id: 'phone-1', number: settings.phone, label: 'Asosiy raqam', isPrimary: true }];
      }
    }

    const primaryNumber = parsedPhones.find((p) => p.isPrimary)?.number || parsedPhones[0]?.number || settings.phone;

    // Explicitly handle out-of-range pendingExpiryMinutes
    let sanitizedPendingExpiry = settings.pendingExpiryMinutes;
    let pendingExpiryOutOfRange = false;
    if (sanitizedPendingExpiry !== null && sanitizedPendingExpiry !== undefined && !isNaN(sanitizedPendingExpiry)) {
      if (sanitizedPendingExpiry < 5) {
        sanitizedPendingExpiry = 5;
        pendingExpiryOutOfRange = true;
      } else if (sanitizedPendingExpiry > 10080) {
        sanitizedPendingExpiry = 10080;
        pendingExpiryOutOfRange = true;
      }
    } else {
      sanitizedPendingExpiry = 30;
    }

    return {
      ...settings,
      phone: primaryNumber,
      phones: parsedPhones,
      pendingExpiryMinutes: sanitizedPendingExpiry,
      rawPendingExpiryMinutes: settings.pendingExpiryMinutes,
      pendingExpiryOutOfRange,
    };
  }

  async updateSettings(data: any) {
    let normalizedPhones: Array<{ id: string; number: string; label: string; isPrimary: boolean }> | undefined;
    let primaryPhoneString: string | undefined;

    const rawPhones = data.phones !== undefined ? data.phones : data.phone;

    if (rawPhones !== undefined) {
      let candidateList: any[] = [];
      if (Array.isArray(rawPhones)) {
        candidateList = rawPhones;
      } else if (typeof rawPhones === 'string') {
        const trimmed = rawPhones.trim();
        if (trimmed.startsWith('[')) {
          try {
            candidateList = JSON.parse(trimmed);
          } catch {
            throw new BadRequestException('Telefon raqamlar ro\'yxati yaroqsiz JSON formatida');
          }
        } else if (trimmed) {
          candidateList = [{ number: trimmed, label: 'Asosiy raqam', isPrimary: true }];
        }
      }

      if (!Array.isArray(candidateList) || candidateList.length === 0) {
        throw new BadRequestException('Kamida bitta telefon raqami kiritilishi shart');
      }

      const seenNumbers = new Set<string>();
      let foundPrimary = false;

      normalizedPhones = candidateList.map((item: any, idx: number) => {
        if (!item || !item.number || typeof item.number !== 'string') {
          throw new BadRequestException(`Telefon raqami kiritilishi shart (qator ${idx + 1})`);
        }
        const cleaned = item.number.replace(/[^\d+]/g, '');
        const digits = cleaned.replace(/\D/g, '');
        let canonicalNumber = '';
        if (digits.startsWith('998') && digits.length === 12) {
          canonicalNumber = '+' + digits;
        } else if (digits.length === 9) {
          canonicalNumber = '+998' + digits;
        } else if (cleaned.startsWith('+998') && digits.length === 12) {
          canonicalNumber = '+' + digits;
        } else {
          throw new BadRequestException(
            `Noto'g'ri telefon formati: "${item.number}". O'zbekiston raqami (+998XXXXXXXXX) kiritilishi lozim`,
          );
        }

        if (seenNumbers.has(canonicalNumber)) {
          throw new BadRequestException(`Takroriy telefon raqami kiritildi: ${canonicalNumber}`);
        }
        seenNumbers.add(canonicalNumber);

        const isPrimary = Boolean(item.isPrimary);
        if (isPrimary) {
          if (foundPrimary) {
            // Already found a primary, this one cannot be primary
            throw new BadRequestException('Faqat bitta asosiy telefon raqami bo\'lishi lozim');
          }
          foundPrimary = true;
        }

        return {
          id: item.id || `phone-${idx + 1}`,
          number: canonicalNumber,
          label: (item.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam')).trim(),
          isPrimary,
        };
      });

      // Ensure exactly one primary phone
      if (!foundPrimary && normalizedPhones.length > 0) {
        normalizedPhones[0].isPrimary = true;
      }

      primaryPhoneString = normalizedPhones.find((p) => p.isPrimary)?.number || normalizedPhones[0]?.number;
    }

    const payload: any = { ...data };
    if (normalizedPhones) {
      payload.phones = normalizedPhones;
      payload.phone = primaryPhoneString;
    }

    // Explicit validation of booking rules and pendingExpiryMinutes (range: 5..10080)
    if (payload.pendingExpiryMinutes !== undefined && payload.pendingExpiryMinutes !== null) {
      const pem = Number(payload.pendingExpiryMinutes);
      if (isNaN(pem) || pem < 5 || pem > 10080) {
        throw new BadRequestException('Kutilayotgan qabul eskirish vaqti 5 daqiqadan 10080 daqiqagacha (7 kun) bo\'lishi lozim');
      }
      payload.pendingExpiryMinutes = Math.round(pem);
    }

    // Preserve valid zero for bufferMinutes (range: 0..120)
    if (payload.bufferMinutes !== undefined && payload.bufferMinutes !== null) {
      const bm = Number(payload.bufferMinutes);
      if (isNaN(bm) || bm < 0 || bm > 120) {
        throw new BadRequestException('Qabullar orasidagi tanaffus 0 dan 120 daqiqagacha bo\'lishi lozim');
      }
      payload.bufferMinutes = Math.round(bm);
    }

    // Preserve valid zero for minBookingNoticeHours (range: 0..720)
    if (payload.minBookingNoticeHours !== undefined && payload.minBookingNoticeHours !== null) {
      const nh = Number(payload.minBookingNoticeHours);
      if (isNaN(nh) || nh < 0 || nh > 720) {
        throw new BadRequestException('Minimal oldindan yozilish vaqti 0 dan 720 soatgacha bo\'lishi lozim');
      }
      payload.minBookingNoticeHours = Math.round(nh);
    }

    // Validate maxBookingHorizonDays (range: 1..365)
    if (payload.maxBookingHorizonDays !== undefined && payload.maxBookingHorizonDays !== null) {
      const hd = Number(payload.maxBookingHorizonDays);
      if (isNaN(hd) || hd < 1 || hd > 365) {
        throw new BadRequestException('Maksimal oldindan yozilish muddati 1 dan 365 kungacha bo\'lishi lozim');
      }
      payload.maxBookingHorizonDays = Math.round(hd);
    }

    const updated = await this.prisma.clinicSettings.upsert({
      where: { id: 'default' },
      create: { ...payload, id: 'default' },
      update: payload,
    });

    return {
      ...updated,
      phone: primaryPhoneString || updated.phone,
      phones: normalizedPhones || (updated.phones as any) || [],
    };
  }

  private validateBranchData(data: any) {
    if (data.mapUrl && typeof data.mapUrl === 'string' && data.mapUrl.trim()) {
      try {
        const parsed = new URL(data.mapUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new BadRequestException('Xarita havolasi faqat http:// yoki https:// protokoli orqali bo\'lishi lozim');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Xarita havolasi yaroqsiz URL formatida');
      }
    }
  }

  // Branches
  async getBranches() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getAllBranches() {
    return this.prisma.branch.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createBranch(data: any) {
    this.validateBranchData(data);
    return this.prisma.branch.create({ data });
  }

  async updateBranch(id: string, data: any) {
    this.validateBranchData(data);
    return this.prisma.branch.update({ where: { id }, data });
  }

  /**
   * Lifecycle preview for branch: inspects active treatments, future reservations,
   * historical snapshots and linked staff/schedule consequences before removal.
   */
  async getBranchLifecyclePreview(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        doctors: {
          include: { doctor: { select: { id: true, firstNameUz: true, lastNameUz: true } } },
        },
        schedules: {
          where: { isActive: true },
          select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
        },
        appointments: {
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            actualStartTime: true,
            overrunActive: true,
            expiresAt: true,
            patient: { select: { fullName: true, phone: true } },
            doctor: { select: { firstNameUz: true, lastNameUz: true } },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!branch) throw new NotFoundException('Filial topilmadi');

    const now = new Date();
    const activeTreatments: any[] = [];
    const futureAppointments: any[] = [];
    let historicalCount = 0;

    for (const appt of branch.appointments) {
      const isExpiredPending =
        appt.status === AppointmentStatus.PENDING &&
        appt.expiresAt &&
        new Date(appt.expiresAt) <= now;

      const isOngoing =
        appt.status === AppointmentStatus.CHECKED_IN ||
        (appt.actualStartTime &&
          appt.status !== AppointmentStatus.COMPLETED &&
          appt.status !== AppointmentStatus.CANCELLED) ||
        appt.overrunActive;

      if (isOngoing) {
        activeTreatments.push({
          id: appt.id,
          patientName: appt.patient?.fullName || 'Bemor',
          patientPhone: appt.patient?.phone || '',
          doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
          startTime: appt.startTime.toISOString(),
          status: appt.status,
          actualStartTime: appt.actualStartTime ? appt.actualStartTime.toISOString() : undefined,
        });
        continue;
      }

      const isFutureActive =
        !isExpiredPending &&
        new Date(appt.startTime) >= now &&
        (appt.status === AppointmentStatus.PENDING || appt.status === AppointmentStatus.CONFIRMED);

      if (isFutureActive) {
        futureAppointments.push({
          id: appt.id,
          patientName: appt.patient?.fullName || 'Bemor',
          patientPhone: appt.patient?.phone || '',
          doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
          startTime: appt.startTime.toISOString(),
          status: appt.status,
        });
      } else {
        historicalCount++;
      }
    }

    const staffConsequences: string[] = [];
    if (branch.doctors.length > 0) {
      staffConsequences.push(
        `Filialga biriktirilgan ${branch.doctors.length} ta shifokor bog'lanmasi olib tashlanadi.`,
      );
    }

    const scheduleConsequences: string[] = [];
    if (branch.schedules.length > 0) {
      scheduleConsequences.push(
        `Filial bo'yicha ${branch.schedules.length} ta shifokor ish grafigi nofaol qilinadi.`,
      );
    }

    let canDelete = true;
    let actionType: 'DELETE' | 'DEACTIVATE' | 'BLOCK' = 'DELETE';
    let resolutionGuidance = '';

    if (activeTreatments.length > 0) {
      canDelete = false;
      actionType = 'BLOCK';
      resolutionGuidance =
        `Ushbu filialda ayni paytda muolajada bo'lgan ${activeTreatments.length} ta bemor mavjud. ` +
        `Filialni o'chirish yoki nofaol qilishdan oldin avval muolajani yakunlang.`;
    } else if (futureAppointments.length > 0) {
      canDelete = false;
      actionType = 'BLOCK';
      resolutionGuidance =
        `Filialda kelgusiga rejalashtirilgan ${futureAppointments.length} ta faol qabul mavjud. ` +
        `Bemorlarni qabulsiz qoldirmaslik uchun avval ushbu qabullarni boshqa filialga ko'chiring yoki bekor qiling.`;
    } else if (historicalCount > 0) {
      canDelete = true;
      actionType = 'DEACTIVATE';
      resolutionGuidance =
        `Filialda o'tmishdagi qabullar tarixi (${historicalCount} ta) mavjud. ` +
        `Tarixiy ma'lumotlar va hisobotlar yaxlitligini saqlash uchun filial nofaol holatga o'tkaziladi.`;
    } else {
      canDelete = true;
      actionType = 'DELETE';
      resolutionGuidance =
        `Filialda hech qanday qabullar tarixi yo'q. Filial tizimdan to'liq o'chiriladi.`;
    }

    return {
      entityId: branch.id,
      entityName: branch.nameUz,
      canDelete,
      actionType,
      hasClinicalHistory: historicalCount > 0 || activeTreatments.length > 0 || futureAppointments.length > 0,
      activeTreatmentCount: activeTreatments.length,
      activeTreatments,
      futureAppointmentCount: futureAppointments.length,
      futureAppointments,
      historicalAppointmentCount: historicalCount,
      staffConsequences,
      scheduleConsequences,
      resolutionGuidance,
    };
  }

  /**
   * Concurrency-safe branch deletion / deactivation.
   * Uses PostgreSQL transactional advisory locks shared with booking and scheduling.
   * Revalidates blocking appointments inside the lock.
   */
  async deleteBranch(id: string, actorUser?: any) {
    const lockKey = getBranchLockKey(id);

    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional advisory lock shared with booking and scheduling
      await acquireDeterministicLocks(tx, [lockKey]);

      const branch = await tx.branch.findUnique({
        where: { id },
        include: {
          appointments: {
            select: {
              id: true,
              status: true,
              startTime: true,
              actualStartTime: true,
              overrunActive: true,
              expiresAt: true,
              patient: { select: { fullName: true } },
            },
          },
        },
      });

      if (!branch) throw new NotFoundException('Filial topilmadi');

      const now = new Date();
      const activeTreatments: any[] = [];
      const futureAppointments: any[] = [];
      let historicalCount = 0;

      for (const appt of branch.appointments) {
        const isExpiredPending =
          appt.status === AppointmentStatus.PENDING &&
          appt.expiresAt &&
          new Date(appt.expiresAt) <= now;

        const isOngoing =
          appt.status === AppointmentStatus.CHECKED_IN ||
          (appt.actualStartTime &&
            appt.status !== AppointmentStatus.COMPLETED &&
            appt.status !== AppointmentStatus.CANCELLED) ||
          appt.overrunActive;

        if (isOngoing) {
          activeTreatments.push({
            id: appt.id,
            patientName: appt.patient?.fullName || 'Bemor',
            status: appt.status,
          });
          continue;
        }

        const isFutureActive =
          !isExpiredPending &&
          new Date(appt.startTime) >= now &&
          (appt.status === AppointmentStatus.PENDING || appt.status === AppointmentStatus.CONFIRMED);

        if (isFutureActive) {
          futureAppointments.push({
            id: appt.id,
            patientName: appt.patient?.fullName || 'Bemor',
            startTime: appt.startTime.toISOString(),
            status: appt.status,
          });
        } else {
          historicalCount++;
        }
      }

      // Block removal if ongoing treatments exist
      if (activeTreatments.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'ACTIVE_TREATMENT_IN_PROGRESS',
          message:
            `Filialni o'chirish/nofaol qilish taqiqlanadi: filialda ayni paytda muolajada bo'lgan ${activeTreatments.length} ta bemor mavjud. ` +
            `Avval qabulni yakunlang.`,
          activeTreatments,
        });
      }

      // Block removal if future active reservations exist
      if (futureAppointments.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'FUTURE_APPOINTMENTS_EXIST',
          message:
            `Filialni o'chirish/nofaol qilish taqiqlanadi: kelgusida ${futureAppointments.length} ta tasdiqlangan yoki kutilayotgan qabul mavjud. ` +
            `Avval ushbu qabullarni boshqa filialga ko'chiring yoki bekor qiling.`,
          futureAppointments,
        });
      }

      // Safe Deactivation if historical appointments exist
      if (historicalCount > 0) {
        await tx.branch.update({
          where: { id },
          data: { isActive: false },
        });

        await tx.doctorSchedule.updateMany({
          where: { branchId: id },
          data: { isActive: false },
        });

        await this.auditService.logTransactional({
          tx,
          userId: actorUser?.id,
          action: 'branch.deactivate',
          entity: 'branch',
          entityId: id,
          details: {
            branchName: branch.nameUz,
            historicalAppointments: historicalCount,
            reason: 'safe_lifecycle_deactivation',
          },
        });

        return {
          success: true,
          action: 'DEACTIVATE',
          deactivated: true,
          message: 'Filialda tarixiy qabullar mavjud bo‘lgani sababli u nofaol holatga o‘tkazildi',
        };
      }

      // Clean Hard Deletion if zero history
      await tx.doctorBranch.deleteMany({ where: { branchId: id } });
      await tx.doctorSchedule.deleteMany({ where: { branchId: id } });
      await tx.scheduleException.deleteMany({ where: { branchId: id } });
      await tx.branch.delete({ where: { id } });

      await this.auditService.logTransactional({
        tx,
        userId: actorUser?.id,
        action: 'branch.delete',
        entity: 'branch',
        entityId: id,
        details: {
          branchName: branch.nameUz,
          reason: 'clean_removal_zero_history',
        },
      });

      return {
        success: true,
        action: 'DELETE',
        deactivated: false,
        message: 'Filial tizimdan to‘liq o‘chirildi',
      };
    });
  }
}

import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import { getDoctorLockKey, acquireDeterministicLocks } from '../common/concurrency-lock.helper';

export interface DoctorInputData {
  firstNameUz: string;
  firstNameRu: string;
  lastNameUz: string;
  lastNameRu: string;
  slug: string;
  photoUrl?: string;
  titleUz?: string;
  titleRu?: string;
  bioUz?: string;
  bioRu?: string;
  educationUz?: string;
  educationRu?: string;
  experienceYears?: number;
  languages?: string[];
  isActive?: boolean;
  sortOrder?: number;
  specialtyIds?: string[];
  branchIds?: string[];
  serviceIds?: string[];
}

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(activeOnly = false) {
    const where: any = { isArchived: false };
    if (activeOnly) where.isActive = true;

    return this.prisma.doctor.findMany({
      where,
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: true } },
        schedules: { where: { isActive: true }, include: { branch: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        slug,
        isActive: true,
        isArchived: false,
      },
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: {
          where: { service: { isActive: true, isArchived: false } },
          include: { service: true },
        },
        schedules: { where: { isActive: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Shifokor topilmadi');
    return doctor;
  }

  async findById(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: true } },
        schedules: true,
        exceptions: true,
      },
    });
    if (!doctor) throw new NotFoundException('Shifokor topilmadi');
    return doctor;
  }

  async create(data: DoctorInputData) {
    const { specialtyIds, branchIds, serviceIds, ...doctorData } = data;

    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.create({
        data: {
          ...doctorData,
          specialties: specialtyIds?.length
            ? { create: specialtyIds.map(specialtyId => ({ specialtyId })) }
            : undefined,
          branches: branchIds?.length
            ? { create: branchIds.map(branchId => ({ branchId })) }
            : undefined,
          services: serviceIds?.length
            ? { create: serviceIds.map(serviceId => ({ serviceId })) }
            : undefined,
        },
        include: {
          specialties: { include: { specialty: true } },
          branches: { include: { branch: true } },
          services: { include: { service: true } },
        },
      });

      return doctor;
    });
  }

  async update(id: string, data: Partial<DoctorInputData>) {
    const existing = await this.prisma.doctor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Shifokor topilmadi');

    const { specialtyIds, branchIds, serviceIds, ...doctorData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (specialtyIds !== undefined) {
        await tx.doctorSpecialty.deleteMany({ where: { doctorId: id } });
        if (specialtyIds.length > 0) {
          await tx.doctorSpecialty.createMany({
            data: specialtyIds.map((specialtyId: string) => ({ doctorId: id, specialtyId })),
          });
        }
      }

      if (branchIds !== undefined) {
        await tx.doctorBranch.deleteMany({ where: { doctorId: id } });
        if (branchIds.length > 0) {
          await tx.doctorBranch.createMany({
            data: branchIds.map((branchId: string) => ({ doctorId: id, branchId })),
          });
        }
      }

      if (serviceIds !== undefined) {
        await tx.doctorService.deleteMany({ where: { doctorId: id } });
        if (serviceIds.length > 0) {
          await tx.doctorService.createMany({
            data: serviceIds.map((serviceId: string) => ({ doctorId: id, serviceId })),
          });
        }
      }

      return tx.doctor.update({
        where: { id },
        data: doctorData,
        include: {
          specialties: { include: { specialty: true } },
          branches: { include: { branch: true } },
          services: { include: { service: true } },
        },
      });
    });
  }

  async archive(id: string) {
    const existing = await this.prisma.doctor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Shifokor topilmadi');

    return this.prisma.doctor.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });
  }

  /**
   * Lifecycle preview: inspects active treatments, future reservations,
   * historical snapshots and linked staff/schedule consequences before removal.
   */
  async getLifecyclePreview(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        staffUser: {
          select: { id: true, email: true, fullName: true, role: true, isActive: true },
        },
        branches: {
          include: { branch: { select: { id: true, nameUz: true, nameRu: true } } },
        },
        services: {
          include: { service: { select: { id: true, nameUz: true, nameRu: true } } },
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
            branch: { select: { nameUz: true, nameRu: true } },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!doctor) throw new NotFoundException('Shifokor topilmadi');

    const now = new Date();
    const activeTreatments: any[] = [];
    const futureAppointments: any[] = [];
    let historicalCount = 0;

    for (const appt of doctor.appointments) {
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
          startTime: appt.startTime.toISOString(),
          status: appt.status,
          branchName: appt.branch?.nameUz || '',
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
          startTime: appt.startTime.toISOString(),
          status: appt.status,
          branchName: appt.branch?.nameUz || '',
        });
      } else {
        historicalCount++;
      }
    }

    const staffConsequences: string[] = [];
    if (doctor.staffUser) {
      if (doctor.staffUser.role === StaffRole.DOCTOR) {
        staffConsequences.push(
          `Bog'langan xodim hisobi (${doctor.staffUser.email}, DOCTOR roli) nofaol holatga o'tkaziladi va faol sessiyalari bekor qilinadi.`,
        );
      } else {
        staffConsequences.push(
          `Xodim hisobi (${doctor.staffUser.email}) shifokor profilidan uziladi, uning ma'muriy roli (${doctor.staffUser.role}) saqlanadi.`,
        );
      }
    }

    const scheduleConsequences: string[] = [];
    if (doctor.schedules.length > 0) {
      scheduleConsequences.push(
        `Shifokorning ${doctor.schedules.length} ta faol ish grafigi nofaol qilinadi.`,
      );
    }
    if (doctor.branches.length > 0) {
      scheduleConsequences.push(
        `${doctor.branches.length} ta filial biriktirmasi olib tashlanadi.`,
      );
    }
    if (doctor.services.length > 0) {
      scheduleConsequences.push(
        `${doctor.services.length} ta ko'rsatiladigan xizmat biriktirmasi olib tashlanadi.`,
      );
    }

    let canDelete = true;
    let actionType: 'DELETE' | 'ARCHIVE' | 'BLOCK' = 'DELETE';
    let resolutionGuidance = '';

    if (activeTreatments.length > 0) {
      canDelete = false;
      actionType = 'BLOCK';
      resolutionGuidance =
        `Hozirda shifokor qabulida davolanishi davom etayotgan ${activeTreatments.length} ta bemor mavjud. ` +
        `O'chirish yoki arxivlashdan oldin avval taqvim sahifasiga o'tib, davolash jarayonini yakunlang.`;
    } else if (futureAppointments.length > 0) {
      canDelete = false;
      actionType = 'BLOCK';
      resolutionGuidance =
        `Shifokorga rejalashtirilgan ${futureAppointments.length} ta kelgusi faol qabul mavjud. ` +
        `Bemorlarni qabulsiz qoldirmaslik uchun avval ularni boshqa shifokorga qayta rejalashtiring yoki bekor qiling.`;
    } else if (historicalCount > 0) {
      canDelete = true;
      actionType = 'ARCHIVE';
      resolutionGuidance =
        `Shifokorda o'tmishdagi qabullar tarixi (${historicalCount} ta) mavjud. ` +
        `Klinik va moliyaviy yozuvlar yaxlitligini saqlash maqsadida shifokor profili arxivlanadi va nofaol qilinadi.`;
    } else {
      canDelete = true;
      actionType = 'DELETE';
      resolutionGuidance =
        `Shifokorga tegishli hech qanday qabullar mavjud emas. Shifokor profili va sozlamalari tizimdan to'liq o'chiriladi.`;
    }

    return {
      entityId: doctor.id,
      entityName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
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
   * Concurrency-safe doctor deletion / archival.
   * Uses PostgreSQL transactional advisory locks shared with booking and scheduling.
   * Revalidates blocking appointments inside the lock.
   */
  async delete(id: string, actorUser?: any) {
    const lockKey = getDoctorLockKey(id);

    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional advisory lock shared with booking and scheduling
      await acquireDeterministicLocks(tx, [lockKey]);

      const doctor = await tx.doctor.findUnique({
        where: { id },
        include: {
          staffUser: true,
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

      if (!doctor) throw new NotFoundException('Shifokor topilmadi');

      const now = new Date();
      const activeTreatments: any[] = [];
      const futureAppointments: any[] = [];
      let historicalCount = 0;

      for (const appt of doctor.appointments) {
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
            `Shifokorni o'chirish/arxivlash taqiqlanadi: ayni paytda muolajada bo'lgan ${activeTreatments.length} ta bemor mavjud. ` +
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
            `Shifokorni o'chirish/arxivlash taqiqlanadi: kelgusida ${futureAppointments.length} ta tasdiqlangan yoki kutilayotgan qabul mavjud. ` +
            `Avval ushbu qabullarni boshqa shifokorga ko'chiring yoki bekor qiling.`,
          futureAppointments,
        });
      }

      // Safe Archival if historical appointments exist
      if (historicalCount > 0) {
        await tx.doctor.update({
          where: { id },
          data: { isArchived: true, isActive: false },
        });

        await tx.doctorSchedule.updateMany({
          where: { doctorId: id },
          data: { isActive: false },
        });

        // Linked staff account handling: deactivate DOCTOR role to avoid zombie unusable state
        if (doctor.staffUser) {
          if (doctor.staffUser.role === StaffRole.DOCTOR) {
            await tx.staffUser.update({
              where: { id: doctor.staffUser.id },
              data: {
                isActive: false,
                refreshTokenHash: null,
                tokenVersion: { increment: 1 },
              },
            });
          } else {
            // Keep admin/owner access, just clear doctor link
            await tx.staffUser.update({
              where: { id: doctor.staffUser.id },
              data: { doctorId: null },
            });
          }
        }

        await this.auditService.logTransactional({
          tx,
          userId: actorUser?.id,
          action: 'doctor.archive',
          entity: 'doctor',
          entityId: id,
          details: {
            doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
            historicalAppointments: historicalCount,
            reason: 'safe_lifecycle_archival',
          },
        });

        return {
          success: true,
          action: 'ARCHIVE',
          archived: true,
          message: 'Shifokorda tarixiy qabullar mavjudligi sababli u arxivlandi va nofaol holatga o‘tkazildi',
        };
      }

      // Clean Hard Deletion if zero history
      await tx.doctorSpecialty.deleteMany({ where: { doctorId: id } });
      await tx.doctorBranch.deleteMany({ where: { doctorId: id } });
      await tx.doctorService.deleteMany({ where: { doctorId: id } });
      await tx.doctorSchedule.deleteMany({ where: { doctorId: id } });
      await tx.scheduleException.deleteMany({ where: { doctorId: id } });

      if (doctor.staffUser) {
        if (doctor.staffUser.role === StaffRole.DOCTOR) {
          await tx.staffUser.update({
            where: { id: doctor.staffUser.id },
            data: {
              doctorId: null,
              isActive: false,
              refreshTokenHash: null,
              tokenVersion: { increment: 1 },
            },
          });
        } else {
          await tx.staffUser.update({
            where: { id: doctor.staffUser.id },
            data: { doctorId: null },
          });
        }
      }

      await tx.doctor.delete({ where: { id } });

      await this.auditService.logTransactional({
        tx,
        userId: actorUser?.id,
        action: 'doctor.delete',
        entity: 'doctor',
        entityId: id,
        details: {
          doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
          reason: 'clean_removal_zero_history',
        },
      });

      return {
        success: true,
        action: 'DELETE',
        archived: false,
        message: 'Shifokor tizimdan to‘liq o‘chirildi',
      };
    });
  }

  async getSpecialties() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createSpecialty(data: { nameUz: string; nameRu: string; slug: string; sortOrder?: number }) {
    return this.prisma.specialty.create({ data });
  }

  async updateSpecialty(id: string, data: Partial<{ nameUz: string; nameRu: string; slug: string; isActive: boolean; sortOrder: number }>) {
    const existing = await this.prisma.specialty.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mutaxassislik topilmadi');
    return this.prisma.specialty.update({ where: { id }, data });
  }
}

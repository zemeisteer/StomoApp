import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import { getDoctorLockKey, acquireDeterministicLocks } from '../common/concurrency-lock.helper';
import {
  checkEntityLifecycleBlockers,
  assertLifecycleUnblocked,
  resolveActorId,
} from '../common/lifecycle.helper';

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

  async update(id: string, data: Partial<DoctorInputData>, actorUser?: any) {
    const lockKey = getDoctorLockKey(id);

    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional advisory lock shared with booking and scheduling
      await acquireDeterministicLocks(tx, [lockKey]);

      const existing = await tx.doctor.findUnique({
        where: { id },
        include: {
          branches: true,
          services: true,
        },
      });
      if (!existing) throw new NotFoundException('Shifokor topilmadi');

      const { specialtyIds, branchIds, serviceIds, ...doctorData } = data;

      // 2. If deactivating or archiving through update, enforce lifecycle blocker checks
      if (doctorData.isActive === false || (doctorData as any).isArchived === true) {
        const blockers = await checkEntityLifecycleBlockers(tx, {
          doctorId: id,
          defaultSafeAction: 'ARCHIVE',
        });
        assertLifecycleUnblocked(blockers, 'Shifokor');
        if (blockers.historicalAppointmentCount > 0) {
          await tx.doctorSchedule.updateMany({
            where: { doctorId: id },
            data: { isActive: false },
          });
        }
      }

      // 3. Audit branch assignment removal for impacts on existing appointments
      if (branchIds !== undefined) {
        const currentBranchIds = existing.branches.map((b) => b.branchId);
        const removedBranchIds = currentBranchIds.filter((bid) => !branchIds.includes(bid));
        if (removedBranchIds.length > 0) {
          const branchBlockers = await checkEntityLifecycleBlockers(tx, {
            doctorId: id,
            removedBranchIds,
          });
          if (branchBlockers.activeTreatmentCount > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'ACTIVE_TREATMENT_AT_REMOVED_BRANCH',
              message:
                `Shifokordan filial biriktirmasini olib tashlab bo'lmaydi: ushbu filialda shifokor muolajasida bo'lgan ` +
                `${branchBlockers.activeTreatmentCount} ta bemor mavjud. Avval muolajani yakunlang.`,
              activeTreatments: branchBlockers.activeTreatments,
            });
          }
          if (branchBlockers.futureAppointmentCount > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'FUTURE_APPOINTMENTS_AT_REMOVED_BRANCH',
              message:
                `Shifokordan filial biriktirmasini olib tashlab bo'lmaydi: ushbu filialda shifokorga rejalashtirilgan ` +
                `${branchBlockers.futureAppointmentCount} ta kelgusi faol qabul mavjud. Avval ushbu qabullarni boshqa filial/shifokorga ko'chiring yoki bekor qiling.`,
              futureAppointments: branchBlockers.futureAppointments,
            });
          }
        }
      }

      // 4. Audit service assignment removal for impacts on existing appointments
      if (serviceIds !== undefined) {
        const currentServiceIds = existing.services.map((s) => s.serviceId);
        const removedServiceIds = currentServiceIds.filter((sid) => !serviceIds.includes(sid));
        if (removedServiceIds.length > 0) {
          const serviceBlockers = await checkEntityLifecycleBlockers(tx, {
            doctorId: id,
            removedServiceIds,
          });
          if (serviceBlockers.activeTreatmentCount > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'ACTIVE_TREATMENT_FOR_REMOVED_SERVICE',
              message:
                `Shifokordan xizmat biriktirmasini olib tashlab bo'lmaydi: ushbu xizmat bo'yicha shifokor muolajasida bo'lgan ` +
                `${serviceBlockers.activeTreatmentCount} ta bemor mavjud. Avval muolajani yakunlang.`,
              activeTreatments: serviceBlockers.activeTreatments,
            });
          }
          if (serviceBlockers.futureAppointmentCount > 0) {
            throw new ConflictException({
              statusCode: 409,
              error: 'FUTURE_APPOINTMENTS_FOR_REMOVED_SERVICE',
              message:
                `Shifokordan xizmat biriktirmasini olib tashlab bo'lmaydi: ushbu xizmat bo'yicha shifokorga rejalashtirilgan ` +
                `${serviceBlockers.futureAppointmentCount} ta kelgusi faol qabul mavjud. Avval ushbu qabullarni ko'chiring yoki bekor qiling.`,
              futureAppointments: serviceBlockers.futureAppointments,
            });
          }
        }
      }

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

      const updated = await tx.doctor.update({
        where: { id },
        data: doctorData,
        include: {
          specialties: { include: { specialty: true } },
          branches: { include: { branch: true } },
          services: { include: { service: true } },
        },
      });

      if (actorUser) {
        const actorId = resolveActorId(actorUser);
        await this.auditService.logTransactional({
          tx,
          userId: actorId,
          action: 'doctor.update',
          entity: 'doctor',
          entityId: id,
          details: {
            doctorName: `Dr. ${updated.firstNameUz} ${updated.lastNameUz}`,
            updatedFields: Object.keys(data),
          },
        });
      }

      return updated;
    });
  }

  async archive(id: string, actorUser?: any) {
    const lockKey = getDoctorLockKey(id);

    return this.prisma.$transaction(async (tx) => {
      await acquireDeterministicLocks(tx, [lockKey]);

      const doctor = await tx.doctor.findUnique({
        where: { id },
        include: { staffUser: true },
      });
      if (!doctor) throw new NotFoundException('Shifokor topilmadi');

      const blockers = await checkEntityLifecycleBlockers(tx, {
        doctorId: id,
        defaultSafeAction: 'ARCHIVE',
      });
      assertLifecycleUnblocked(blockers, 'Shifokor');

      await tx.doctor.update({
        where: { id },
        data: { isArchived: true, isActive: false },
      });

      await tx.doctorSchedule.updateMany({
        where: { doctorId: id },
        data: { isActive: false },
      });

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
          await tx.staffUser.update({
            where: { id: doctor.staffUser.id },
            data: { doctorId: null },
          });
        }
      }

      const actorId = resolveActorId(actorUser);
      await this.auditService.logTransactional({
        tx,
        userId: actorId,
        action: 'doctor.archive',
        entity: 'doctor',
        entityId: id,
        details: {
          doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
          historicalAppointments: blockers.historicalAppointmentCount,
          reason: 'safe_lifecycle_archival',
        },
      });

      return {
        success: true,
        action: 'ARCHIVE',
        archived: true,
        message: 'Shifokor arxivlandi va nofaol holatga o‘tkazildi',
      };
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
      },
    });

    if (!doctor) throw new NotFoundException('Shifokor topilmadi');

    const blockers = await checkEntityLifecycleBlockers(this.prisma, {
      doctorId: id,
      defaultSafeAction: 'ARCHIVE',
    });

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

    // Accurate consequence descriptions:
    // Only on clean DELETE are branch and service assignments removed.
    // On ARCHIVE, assignments are preserved for historical continuity.
    if (blockers.actionType === 'DELETE') {
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
    } else {
      if (doctor.branches.length > 0 || doctor.services.length > 0) {
        scheduleConsequences.push(
          `Tarixiy yozuvlar yaxlitligini ta'minlash uchun filial va xizmat biriktirmalari arxivda saqlab qolinadi.`,
        );
      }
    }

    return {
      entityId: doctor.id,
      entityName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
      canDelete: blockers.canProceed,
      actionType: blockers.actionType,
      hasClinicalHistory: blockers.hasClinicalHistory,
      activeTreatmentCount: blockers.activeTreatmentCount,
      activeTreatments: blockers.activeTreatments,
      futureAppointmentCount: blockers.futureAppointmentCount,
      futureAppointments: blockers.futureAppointments,
      historicalAppointmentCount: blockers.historicalAppointmentCount,
      staffConsequences,
      scheduleConsequences,
      resolutionGuidance: blockers.resolutionGuidance,
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
        include: { staffUser: true },
      });

      if (!doctor) throw new NotFoundException('Shifokor topilmadi');

      const blockers = await checkEntityLifecycleBlockers(tx, {
        doctorId: id,
        defaultSafeAction: 'ARCHIVE',
      });
      assertLifecycleUnblocked(blockers, 'Shifokor');

      const actorId = resolveActorId(actorUser);

      // Safe Archival if historical appointments exist
      if (blockers.historicalAppointmentCount > 0) {
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
          userId: actorId,
          action: 'doctor.archive',
          entity: 'doctor',
          entityId: id,
          details: {
            doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`,
            historicalAppointments: blockers.historicalAppointmentCount,
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
        userId: actorId,
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

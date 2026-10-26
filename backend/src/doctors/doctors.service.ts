import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

  async delete(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        appointments: { select: { id: true }, take: 1 },
      },
    });
    if (!doctor) throw new NotFoundException('Shifokor topilmadi');

    // If doctor has appointments, preserve historical clinical records by archiving and deactivating
    if (doctor.appointments.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.doctor.update({
          where: { id },
          data: { isArchived: true, isActive: false },
        });
        await tx.doctorSchedule.updateMany({
          where: { doctorId: id },
          data: { isActive: false },
        });
      });
      return {
        success: true,
        archived: true,
        message: 'Shifokorda tarixiy qabullar mavjudligi sababli u arxivlandi va nofaol holatga o‘tkazildi',
      };
    }

    // If doctor has NO appointments, delete relations and remove doctor record cleanly
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorSpecialty.deleteMany({ where: { doctorId: id } });
      await tx.doctorBranch.deleteMany({ where: { doctorId: id } });
      await tx.doctorService.deleteMany({ where: { doctorId: id } });
      await tx.doctorSchedule.deleteMany({ where: { doctorId: id } });
      await tx.scheduleException.deleteMany({ where: { doctorId: id } });
      await tx.staffUser.updateMany({
        where: { doctorId: id },
        data: { doctorId: null },
      });
      await tx.doctor.delete({ where: { id } });
    });

    return {
      success: true,
      archived: false,
      message: 'Shifokor muvaffaqiyatli o‘chirildi',
    };
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

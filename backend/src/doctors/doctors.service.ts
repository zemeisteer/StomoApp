import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    const where = activeOnly ? { isActive: true, isArchived: false } : {};
    return this.prisma.doctor.findMany({
      where,
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { slug },
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: { where: { isActive: true } } } },
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

  async create(data: any) {
    const { specialtyIds, branchIds, serviceIds, ...doctorData } = data;

    // Check slug uniqueness
    const existing = await this.prisma.doctor.findUnique({
      where: { slug: doctorData.slug },
    });
    if (existing) throw new ConflictException('Bu slug allaqachon mavjud');

    return this.prisma.doctor.create({
      data: {
        ...doctorData,
        specialties: specialtyIds?.length ? {
          create: specialtyIds.map((id: string) => ({ specialtyId: id })),
        } : undefined,
        branches: branchIds?.length ? {
          create: branchIds.map((id: string) => ({ branchId: id })),
        } : undefined,
        services: serviceIds?.length ? {
          create: serviceIds.map((id: string) => ({ serviceId: id })),
        } : undefined,
      },
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const { specialtyIds, branchIds, serviceIds, ...doctorData } = data;

    // Update relations if provided
    if (specialtyIds) {
      await this.prisma.doctorSpecialty.deleteMany({ where: { doctorId: id } });
      if (specialtyIds.length > 0) {
        await this.prisma.doctorSpecialty.createMany({
          data: specialtyIds.map((specialtyId: string) => ({ doctorId: id, specialtyId })),
        });
      }
    }

    if (branchIds) {
      await this.prisma.doctorBranch.deleteMany({ where: { doctorId: id } });
      if (branchIds.length > 0) {
        await this.prisma.doctorBranch.createMany({
          data: branchIds.map((branchId: string) => ({ doctorId: id, branchId })),
        });
      }
    }

    if (serviceIds) {
      await this.prisma.doctorService.deleteMany({ where: { doctorId: id } });
      if (serviceIds.length > 0) {
        await this.prisma.doctorService.createMany({
          data: serviceIds.map((serviceId: string) => ({ doctorId: id, serviceId })),
        });
      }
    }

    return this.prisma.doctor.update({
      where: { id },
      data: doctorData,
      include: {
        specialties: { include: { specialty: true } },
        branches: { include: { branch: true } },
        services: { include: { service: true } },
      },
    });
  }

  async archive(id: string) {
    return this.prisma.doctor.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });
  }

  // Specialties CRUD
  async getSpecialties() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createSpecialty(data: { nameUz: string; nameRu: string; slug: string }) {
    return this.prisma.specialty.create({ data });
  }

  async updateSpecialty(id: string, data: any) {
    return this.prisma.specialty.update({ where: { id }, data });
  }
}

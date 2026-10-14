import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getClinicInfo() {
    const settings = await this.prisma.clinicSettings.findFirst();
    if (!settings) throw new NotFoundException('Klinika ma\'lumotlari topilmadi');

    return {
      name: settings.name,
      nameRu: settings.nameRu,
      logo: settings.logo,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      telegramLink: settings.telegramLink,
      instagramLink: settings.instagramLink,
      facebookLink: settings.facebookLink,
      timezone: settings.timezone,
      minBookingNoticeHours: settings.minBookingNoticeHours,
      maxBookingHorizonDays: settings.maxBookingHorizonDays,
      metaTitleUz: settings.metaTitleUz,
      metaTitleRu: settings.metaTitleRu,
      metaDescriptionUz: settings.metaDescriptionUz,
      metaDescriptionRu: settings.metaDescriptionRu,
    };
  }

  async getBranches() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getSpecialties() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getDoctors(specialtySlug?: string, branchId?: string) {
    const where: any = {
      isActive: true,
      isArchived: false,
    };

    if (specialtySlug) {
      where.specialties = {
        some: {
          specialty: { slug: specialtySlug },
        },
      };
    }

    if (branchId) {
      where.branches = {
        some: { branchId },
      };
    }

    return this.prisma.doctor.findMany({
      where,
      select: {
        id: true,
        firstNameUz: true,
        firstNameRu: true,
        lastNameUz: true,
        lastNameRu: true,
        slug: true,
        photoUrl: true,
        titleUz: true,
        titleRu: true,
        bioUz: true,
        bioRu: true,
        experienceYears: true,
        languages: true,
        specialties: {
          include: { specialty: true },
        },
        branches: {
          include: { branch: true },
        },
        services: {
          include: { service: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getDoctorBySlug(slug: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        slug,
        isActive: true,
        isArchived: false,
      },
      select: {
        id: true,
        firstNameUz: true,
        firstNameRu: true,
        lastNameUz: true,
        lastNameRu: true,
        slug: true,
        photoUrl: true,
        titleUz: true,
        titleRu: true,
        bioUz: true,
        bioRu: true,
        educationUz: true,
        educationRu: true,
        experienceYears: true,
        languages: true,
        specialties: {
          include: { specialty: true },
        },
        branches: {
          include: { branch: true },
        },
        services: {
          include: { service: true },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Shifokor topilmadi');
    }

    return doctor;
  }

  async getServices(category?: string) {
    const where: any = {
      isActive: true,
      isArchived: false,
    };

    if (category) {
      where.category = category;
    }

    return this.prisma.service.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getServiceBySlug(slug: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        slug,
        isActive: true,
        isArchived: false,
      },
      include: {
        doctors: {
          where: {
            doctor: { isActive: true, isArchived: false },
          },
          include: {
            doctor: {
              select: {
                id: true,
                firstNameUz: true,
                lastNameUz: true,
                firstNameRu: true,
                lastNameRu: true,
                slug: true,
                photoUrl: true,
                titleUz: true,
                titleRu: true,
                experienceYears: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Xizmat topilmadi');
    }

    return service;
  }
}

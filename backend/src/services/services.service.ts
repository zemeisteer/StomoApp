import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceCategory } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    const where = activeOnly ? { isActive: true, isArchived: false } : {};
    return this.prisma.service.findMany({
      where,
      include: {
        doctors: {
          include: {
            doctor: {
              select: {
                id: true, firstNameUz: true, lastNameUz: true,
                firstNameRu: true, lastNameRu: true, slug: true,
                photoUrl: true, isActive: true,
              },
            },
          },
        },
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async findBySlug(slug: string) {
    const service = await this.prisma.service.findUnique({
      where: { slug },
      include: {
        doctors: {
          include: {
            doctor: {
              include: {
                specialties: { include: { specialty: true } },
              },
            },
          },
        },
      },
    });
    if (!service) throw new NotFoundException('Xizmat topilmadi');
    return service;
  }

  async findById(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        doctors: { include: { doctor: true } },
      },
    });
    if (!service) throw new NotFoundException('Xizmat topilmadi');
    return service;
  }

  async findByCategory(category: ServiceCategory) {
    return this.prisma.service.findMany({
      where: { category, isActive: true, isArchived: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(data: any) {
    return this.prisma.service.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.service.update({ where: { id }, data });
  }

  async archive(id: string) {
    return this.prisma.service.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });
  }

  async getCategories() {
    return Object.values(ServiceCategory);
  }

  async getPriceList() {
    return this.prisma.service.findMany({
      where: { isActive: true, isArchived: false },
      select: {
        id: true,
        nameUz: true,
        nameRu: true,
        category: true,
        priceFrom: true,
        priceTo: true,
        currency: true,
        requiresConsultation: true,
        durationMinutes: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    if (data.priceFrom !== undefined && data.priceTo !== undefined && data.priceTo < data.priceFrom) {
      throw new BadRequestException('Maksimal narx (priceTo) minimal narxdan (priceFrom) kichik bo\'lishi mumkin emas');
    }
    return this.prisma.service.create({ data });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Xizmat topilmadi');

    const effectiveFrom = data.priceFrom !== undefined ? data.priceFrom : existing.priceFrom;
    const effectiveTo = data.priceTo !== undefined ? data.priceTo : existing.priceTo;
    if (effectiveFrom !== null && effectiveTo !== null && effectiveTo < effectiveFrom) {
      throw new BadRequestException('Maksimal narx (priceTo) minimal narxdan (priceFrom) kichik bo\'lishi mumkin emas');
    }

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

  async getLegacyReviewReport() {
    const records = await this.prisma.appointmentServiceItem.findMany({
      where: {
        OR: [
          { legacyProvenance: 'AMBIGUOUS_BUNDLE' },
          { isLegacyBundle: true },
          { serviceId: null },
        ],
      },
      include: {
        appointment: {
          select: {
            id: true,
            status: true,
            startTime: true,
            serviceName: true,
            patient: { select: { fullName: true, phone: true } },
            doctor: { select: { firstNameUz: true, lastNameUz: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const verifiedCount = await this.prisma.appointmentServiceItem.count({
      where: { legacyProvenance: 'VERIFIED_SINGLE' },
    });

    return {
      unresolvedCount: records.length,
      verifiedHistoricalCount: verifiedCount,
      records: records.map((r) => ({
        id: r.id,
        appointmentId: r.appointmentId,
        serviceNameUz: r.serviceNameUz,
        originalServiceId: r.originalServiceId,
        durationMinutes: r.durationMinutes,
        priceFrom: r.priceFrom,
        legacyProvenance: r.legacyProvenance,
        isLegacyBundle: r.isLegacyBundle,
        appointment: r.appointment,
      })),
    };
  }

  async reconcileLegacyRecord(itemId: string, dto: { serviceId?: string; action?: string }) {
    const item = await this.prisma.appointmentServiceItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Xizmat bandi topilmadi');

    const targetServiceId = dto.serviceId || item.originalServiceId;
    if (!targetServiceId) {
      throw new BadRequestException('Bog\'lash uchun xizmat tanlanishi lozim');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: targetServiceId },
    });
    if (!service) throw new NotFoundException('Katalog xizmati topilmadi');

    return this.prisma.appointmentServiceItem.update({
      where: { id: itemId },
      data: {
        serviceId: service.id,
        serviceNameRu: service.nameRu,
        isLegacyBundle: false,
        legacyProvenance: 'RESOLVED_MANUAL',
      },
    });
  }
}

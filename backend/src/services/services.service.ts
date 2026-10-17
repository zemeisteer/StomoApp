import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceCategory, Prisma } from '@prisma/client';

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

  async getLegacyReviewReport(page = 1, limit = 20) {
    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, Math.min(100, limit));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.AppointmentServiceItemWhereInput = {
      OR: [
        { legacyProvenance: 'AMBIGUOUS_BUNDLE' },
        { isLegacyBundle: true },
        { serviceId: null },
      ],
      // Exclude modern records
      id: { startsWith: 'hist_' },
      legacyProvenance: { not: 'RESOLVED_MANUAL' },
    };

    const [total, records, verifiedCount] = await Promise.all([
      this.prisma.appointmentServiceItem.count({ where }),
      this.prisma.appointmentServiceItem.findMany({
        where,
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
        skip,
        take: limitNum,
      }),
      this.prisma.appointmentServiceItem.count({
        where: { legacyProvenance: 'VERIFIED_SINGLE' },
      }),
    ]);

    return {
      unresolvedCount: total,
      verifiedHistoricalCount: verifiedCount,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      records: records.map((r) => ({
        id: r.id,
        appointmentId: r.appointmentId,
        serviceNameUz: r.serviceNameUz,
        serviceNameRu: r.serviceNameRu,
        originalServiceId: r.originalServiceId,
        durationMinutes: r.durationMinutes,
        priceFrom: r.priceFrom,
        legacyProvenance: r.legacyProvenance,
        isLegacyBundle: r.isLegacyBundle,
        appointment: r.appointment,
      })),
    };
  }

  async reconcileLegacyRecord(
    itemId: string,
    dto: { serviceId?: string; action?: string; reason?: string },
    userId?: string,
  ) {
    if (!dto.action || !['RESOLVE_TO_SERVICE', 'KEEP_AMBIGUOUS_BUNDLE'].includes(dto.action)) {
      throw new BadRequestException('Qo\'llab-quvvatlanmaydigan amal. RESOLVE_TO_SERVICE yoki KEEP_AMBIGUOUS_BUNDLE kiritilishi shart');
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Muvofiqlashtirish qarorining sababi (reason) kamida 5 ta belgidan iborat bo\'lishi shart');
    }

    const reviewReason = dto.reason.trim();

    return this.prisma.$transaction(
      async (tx) => {
        // Concurrency-safe row locking
        const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "appointment_service_items" WHERE id = ${itemId} FOR UPDATE
        `;
        if (!locked) {
          throw new NotFoundException('Xizmat bandi topilmadi');
        }

        const item = await tx.appointmentServiceItem.findUnique({
          where: { id: itemId },
          include: { appointment: true },
        });
        if (!item) {
          throw new NotFoundException('Xizmat bandi topilmadi');
        }

        // Eligibility check: Only unresolved legacy records may be resolved!
        const isEligibleUnresolved =
          (item.legacyProvenance === 'AMBIGUOUS_BUNDLE' ||
            item.isLegacyBundle === true ||
            item.serviceId === null ||
            item.legacyProvenance === null) &&
          item.legacyProvenance !== 'VERIFIED_SINGLE' &&
          item.legacyProvenance !== 'MODERN';

        if (!isEligibleUnresolved) {
          throw new BadRequestException('Faqat muvofiqlashtirilmagan noaniq tarixiy yozuvlarni ko\'rib chiqish mumkin');
        }

        if (item.legacyProvenance === 'RESOLVED_MANUAL') {
          throw new BadRequestException('Ushbu yozuv allaqachon qo\'lda muvofiqlashtirilgan');
        }

        if (dto.action === 'RESOLVE_TO_SERVICE') {
          if (!dto.serviceId) {
            throw new BadRequestException('Bog\'lash uchun aniq katalog xizmati (serviceId) ko\'rsatilishi lozim');
          }

          const service = await tx.service.findUnique({
            where: { id: dto.serviceId },
          });
          if (!service || !service.isActive || service.isArchived) {
            throw new BadRequestException('Tanlangan katalog xizmati topilmadi yoki faol emas');
          }

          // Anti-collapse check: Do not silently convert a genuine multi-service bundle into one service!
          // If the snapshot has multiple procedures (e.g., contains comma ',') and target service is not that exact named service:
          const snapshotName = (item.serviceNameUz || item.appointment?.serviceName || '').trim();
          const targetNameUz = (service.nameUz || '').trim();
          const targetNameRu = (service.nameRu || '').trim();

          const isExactNameMatch =
            snapshotName.toLowerCase() === targetNameUz.toLowerCase() ||
            snapshotName.toLowerCase() === targetNameRu.toLowerCase();

          if (snapshotName.includes(',') && !isExactNameMatch) {
            throw new BadRequestException(
              'Haqiqiy ko\'p xizmatli paketni (bundle) bitta xizmatga majburan bog\'lash mumkin emas. Ko\'p xizmatli paket deb qoldiring (KEEP_AMBIGUOUS_BUNDLE)',
            );
          }

          // Atomically update item:
          // PRESERVE original identity, historical names, duration, and price snapshots!
          // DO NOT overwrite serviceNameUz or serviceNameRu with current catalog names!
          const updated = await tx.appointmentServiceItem.update({
            where: { id: itemId },
            data: {
              serviceId: service.id,
              isLegacyBundle: false,
              legacyProvenance: 'RESOLVED_MANUAL',
            },
          });

          // Atomically create audit log
          await tx.auditLog.create({
            data: {
              userId: userId || null,
              action: 'service_item.legacy_reconciled',
              entity: 'AppointmentServiceItem',
              entityId: itemId,
              details: {
                action: dto.action,
                reason: reviewReason,
                previousProvenance: item.legacyProvenance,
                previousServiceId: item.serviceId,
                resolvedServiceId: service.id,
                targetServiceName: service.nameUz,
                originalServiceId: item.originalServiceId,
                snapshotNameUz: item.serviceNameUz,
                durationMinutes: item.durationMinutes,
                priceFrom: item.priceFrom,
              } as Prisma.InputJsonValue,
            },
          });

          return updated;
        } else {
          // KEEP_AMBIGUOUS_BUNDLE
          const updated = await tx.appointmentServiceItem.update({
            where: { id: itemId },
            data: {
              serviceId: null,
              isLegacyBundle: true,
              legacyProvenance: 'AMBIGUOUS_BUNDLE',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: userId || null,
              action: 'service_item.legacy_reconciled',
              entity: 'AppointmentServiceItem',
              entityId: itemId,
              details: {
                action: dto.action,
                reason: reviewReason,
                previousProvenance: item.legacyProvenance,
                previousServiceId: item.serviceId,
                resolvedServiceId: null,
                originalServiceId: item.originalServiceId,
                snapshotNameUz: item.serviceNameUz,
              } as Prisma.InputJsonValue,
            },
          });

          return updated;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );
  }
}

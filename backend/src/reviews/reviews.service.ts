import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewStatus, Prisma } from '@prisma/client';

export interface CreateReviewDto {
  authorName: string;
  rating: number;
  text: string;
  consentDisplayName: boolean;
  patientId?: string;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit public review (always starts as PENDING moderation)
   */
  async create(data: CreateReviewDto) {
    if (data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('Baho 1 dan 5 gacha bo\'lishi kerak');
    }

    return this.prisma.review.create({
      data: {
        authorName: data.authorName.trim(),
        rating: Math.round(data.rating),
        text: data.text.trim(),
        consentDisplayName: data.consentDisplayName ?? false,
        patientId: data.patientId || null,
        status: ReviewStatus.PENDING,
      },
    });
  }

  /**
   * Public approved reviews list with display-name consent applied
   */
  async findApproved(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const where: Prisma.ReviewWhereInput = {
      status: ReviewStatus.APPROVED,
    };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    // Anonymize author name if consent was not given
    const sanitizedItems = items.map(r => ({
      id: r.id,
      authorName: r.consentDisplayName ? r.authorName : 'Bemor',
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    }));

    return { items: sanitizedItems, total, page, limit };
  }

  /**
   * Admin: List all reviews with full details and moderation controls
   */
  async findAllAdmin(params: {
    status?: ReviewStatus;
    page?: number;
    limit?: number;
  }) {
    const { status, page = 1, limit = 50 } = params;
    const where: Prisma.ReviewWhereInput = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Admin: Moderate review (Approve / Reject)
   */
  async updateStatus(id: string, status: ReviewStatus, adminNote?: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Fikr topilmadi');

    return this.prisma.review.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote !== undefined ? adminNote : review.adminNote,
      },
    });
  }

  async delete(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Fikr topilmadi');
    return this.prisma.review.delete({ where: { id } });
  }
}

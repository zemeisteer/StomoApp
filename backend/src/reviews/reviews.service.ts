import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReviewStatus, Prisma } from '@prisma/client';

export interface CreateReviewDto {
  authorName: string;
  rating: number;
  text: string;
  consentDisplayName: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Submit public review (always starts as PENDING moderation)
   * Validates non-empty/whitespace input, enforces exact integer rating 1-5,
   * escapes user HTML, and strips any untrusted patient association.
   */
  async create(data: CreateReviewDto) {
    const trimmedAuthor = (data.authorName || '').trim();
    const trimmedText = (data.text || '').trim();

    if (trimmedAuthor.length < 2 || trimmedAuthor.length > 60) {
      throw new BadRequestException('Muallif ismi 2 dan 60 belgigacha bo\'lishi kerak');
    }

    if (trimmedText.length < 5 || trimmedText.length > 2000) {
      throw new BadRequestException('Fikr matni 5 dan 2000 belgigacha bo\'lishi kerak');
    }

    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
      throw new BadRequestException('Baho 1 dan 5 gacha butun son bo\'lishi kerak');
    }

    return this.prisma.review.create({
      data: {
        authorName: escapeHtml(trimmedAuthor),
        rating: data.rating,
        text: escapeHtml(trimmedText),
        consentDisplayName: Boolean(data.consentDisplayName),
        patientId: null, // Untrusted client cannot link review to any patient
        status: ReviewStatus.PENDING,
      },
    });
  }

  /**
   * Public approved reviews list with display-name consent applied.
   * Strips all internal metadata (patientId, adminNote, etc.)
   */
  async findApproved(params: { page?: number; limit?: number }) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 20)));

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
    const sanitizedItems = items.map((r) => ({
      id: r.id,
      authorName: r.consentDisplayName ? r.authorName : 'Bemor',
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    }));

    return { items: sanitizedItems, total, page, limit };
  }

  /**
   * Admin: List all reviews with full details, filtering, and pagination bounds
   */
  async findAllAdmin(params: {
    status?: ReviewStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 50)));

    const where: Prisma.ReviewWhereInput = {};
    if (params.status) where.status = params.status;

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
   * Admin: Moderate review (Approve / Reject) with audit log
   */
  async updateStatus(
    id: string,
    status: ReviewStatus,
    adminNote?: string,
    staffUser?: any,
  ) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Fikr topilmadi');

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote !== undefined ? adminNote.trim() : review.adminNote,
      },
    });

    await this.auditService.log({
      userId: staffUser?.id || null,
      action: 'review.moderated',
      entity: 'Review',
      entityId: id,
      details: {
        previousStatus: review.status,
        newStatus: status,
        authorName: review.authorName,
        adminNote: adminNote !== undefined ? adminNote.trim() : review.adminNote,
      },
    });

    return updated;
  }

  /**
   * Admin: Permanent delete with audit log
   */
  async delete(id: string, staffUser?: any) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Fikr topilmadi');

    await this.prisma.review.delete({ where: { id } });

    await this.auditService.log({
      userId: staffUser?.id || null,
      action: 'review.deleted',
      entity: 'Review',
      entityId: id,
      details: {
        authorName: review.authorName,
        status: review.status,
      },
    });

    return { success: true };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentStatus, Prisma } from '@prisma/client';

export interface CreateArticleDto {
  slug: string;
  titleUz: string;
  titleRu: string;
  contentUz: string;
  contentRu: string;
  excerptUz?: string;
  excerptRu?: string;
  authorName: string;
  coverImageUrl?: string;
  status?: ContentStatus;
  metaTitleUz?: string;
  metaTitleRu?: string;
  metaDescriptionUz?: string;
  metaDescriptionRu?: string;
}

export interface CreateFaqDto {
  questionUz: string;
  questionRu: string;
  answerUz: string;
  answerRu: string;
  category?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // ARTICLES
  // ============================================================

  async findPublishedArticles(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 10 } = params;
    const where: Prisma.ArticleWhereInput = {
      status: ContentStatus.PUBLISHED,
    };

    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          slug: true,
          titleUz: true,
          titleRu: true,
          excerptUz: true,
          excerptRu: true,
          authorName: true,
          coverImageUrl: true,
          publishedAt: true,
          createdAt: true,
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findPublishedArticleBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: ContentStatus.PUBLISHED,
      },
    });

    if (!article) {
      throw new NotFoundException('Maqola topilmadi yoki hali e\'lon qilinmagan');
    }

    return article;
  }

  async findAllArticlesAdmin(params: {
    status?: ContentStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, search, page = 1, limit = 50 } = params;
    const where: Prisma.ArticleWhereInput = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { titleUz: { contains: search, mode: 'insensitive' } },
        { titleRu: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findArticleById(id: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Maqola topilmadi');
    return article;
  }

  async createArticle(data: CreateArticleDto) {
    const publishedAt = data.status === ContentStatus.PUBLISHED ? new Date() : null;
    return this.prisma.article.create({
      data: {
        ...data,
        publishedAt,
      },
    });
  }

  async updateArticle(id: string, data: Partial<CreateArticleDto>) {
    const current = await this.prisma.article.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Maqola topilmadi');

    let publishedAt = current.publishedAt;
    if (data.status === ContentStatus.PUBLISHED && !current.publishedAt) {
      publishedAt = new Date();
    }

    return this.prisma.article.update({
      where: { id },
      data: {
        ...data,
        publishedAt,
      },
    });
  }

  async deleteArticle(id: string) {
    const current = await this.prisma.article.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Maqola topilmadi');
    return this.prisma.article.delete({ where: { id } });
  }

  // ============================================================
  // FAQS
  // ============================================================

  async findActiveFaqs() {
    return this.prisma.fAQ.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findAllFaqsAdmin() {
    return this.prisma.fAQ.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createFaq(data: CreateFaqDto) {
    return this.prisma.fAQ.create({ data });
  }

  async updateFaq(id: string, data: Partial<CreateFaqDto>) {
    const faq = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ topilmadi');
    return this.prisma.fAQ.update({ where: { id }, data });
  }

  async deleteFaq(id: string) {
    const faq = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ topilmadi');
    return this.prisma.fAQ.delete({ where: { id } });
  }

  // ============================================================
  // HOMEPAGE SECTIONS & POLICIES
  // ============================================================

  async findActiveHomepageSections() {
    return this.prisma.homepageSection.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertHomepageSection(sectionKey: string, data: {
    titleUz?: string;
    titleRu?: string;
    contentUz?: string;
    contentRu?: string;
    data?: any;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return this.prisma.homepageSection.upsert({
      where: { sectionKey },
      update: data,
      create: {
        sectionKey,
        ...data,
      },
    });
  }

  async getPolicies() {
    const settings = await this.prisma.clinicSettings.findFirst();
    return {
      privacyPolicy: settings?.privacyPolicy || null,
      bookingPolicy: settings?.bookingPolicy || null,
    };
  }

  async updatePolicies(policies: { privacyPolicy?: any; bookingPolicy?: any }) {
    return this.prisma.clinicSettings.update({
      where: { id: 'default' },
      data: {
        privacyPolicy: policies.privacyPolicy,
        bookingPolicy: policies.bookingPolicy,
      },
    });
  }
}

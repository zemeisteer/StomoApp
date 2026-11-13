import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

export interface CreateTransactionalAuditLogParams extends CreateAuditLogParams {
  tx: Prisma.TransactionClient;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enlists audit log creation directly into the caller's transaction client.
   * Throws on failure to ensure atomic rollback of business mutations.
   */
  async logTransactional(params: CreateTransactionalAuditLogParams) {
    const sanitizedDetails = this.sanitizeDetails(params.details);
    return await params.tx.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entity: params.entity || null,
        entityId: params.entityId || null,
        details: sanitizedDetails as Prisma.InputJsonValue,
        ipAddress: params.ipAddress || null,
      },
    });
  }

  async log(params: CreateAuditLogParams) {
    try {
      // Ensure details are sanitized - strip any PII keys
      const sanitizedDetails = this.sanitizeDetails(params.details);

      return await this.prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          entity: params.entity || null,
          entityId: params.entityId || null,
          details: sanitizedDetails as Prisma.InputJsonValue,
          ipAddress: params.ipAddress || null,
        },
      });
    } catch (e: any) {
      // Non-blocking log failure
      console.error('Failed to write audit log:', e?.message || e);
      return null;
    }
  }

  async findAll(params: {
    userId?: string;
    action?: string;
    entity?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, action, entity, page = 1, limit = 50 } = params;
    const where: Prisma.AuditLogWhereInput = {};

    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entity) where.entity = entity;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  private sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;
    const sensitiveKeys = ['password', 'passwordHash', 'refreshToken', 'token', 'phone', 'patientPhone', 'email', 'patientEmail'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(details)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

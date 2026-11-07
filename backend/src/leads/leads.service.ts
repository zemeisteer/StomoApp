import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    fullName: string;
    phone: string;
    email?: string;
    message?: string;
    preferredBranch?: string;
    preferredTime?: string;
    internalNotes?: string;
    notes?: string;
    source?: string;
  }) {
    return this.prisma.lead.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        message: data.message,
        preferredBranch: data.preferredBranch,
        preferredTime: data.preferredTime,
        internalNotes: data.internalNotes || data.notes || null,
        source: data.source || 'website',
      },
    });
  }

  async findAll(params: { status?: LeadStatus; page?: number; limit?: number; search?: string }) {
    const { status, search, page = 1, limit = 20 } = params;
    const where: Prisma.LeadWhereInput = {};
    if (status) where.status = status;

    if (search && search.trim()) {
      const q = search.trim();
      const digits = q.replace(/\D/g, '');
      const orFilters: Prisma.LeadWhereInput[] = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
      if (digits.length >= 3) {
        orFilters.push({ phone: { contains: digits } });
      }
      where.OR = orFilters;
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: { assignedTo: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { assignedTo: { select: { id: true, fullName: true } } },
    });
    if (!lead) throw new NotFoundException('So\'rov topilmadi');
    return lead;
  }

  async update(id: string, data: {
    status?: LeadStatus;
    assignedToId?: string;
    internalNotes?: string;
    notes?: string;
    followUpDate?: string;
    appointmentId?: string;
  }) {
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
    if (data.internalNotes !== undefined || data.notes !== undefined) {
      updateData.internalNotes = data.internalNotes !== undefined ? data.internalNotes : data.notes;
    }
    if (data.followUpDate) updateData.followUpDate = new Date(data.followUpDate);
    if (data.appointmentId !== undefined) updateData.appointmentId = data.appointmentId;

    return this.prisma.lead.update({ where: { id }, data: updateData });
  }

  async getStats() {
    const counts = await this.prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    });
    return counts.reduce((acc, c) => ({ ...acc, [c.status]: c._count }), {});
  }
}

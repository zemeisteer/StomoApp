import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { fullName: string; phone: string; email?: string; message?: string; source?: string }) {
    return this.prisma.lead.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        message: data.message,
        source: data.source || 'website',
      },
    });
  }

  async findAll(params: { status?: LeadStatus; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params;
    const where: Prisma.LeadWhereInput = {};
    if (status) where.status = status;

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
    followUpDate?: string;
    appointmentId?: string;
  }) {
    const updateData: any = { ...data };
    if (data.followUpDate) updateData.followUpDate = new Date(data.followUpDate);
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

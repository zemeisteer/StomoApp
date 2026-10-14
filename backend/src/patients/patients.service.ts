import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { search?: string; page?: number; limit?: number }) {
    const { search, page = 1, limit = 20 } = params;
    const where: Prisma.PatientWhereInput = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        include: {
          _count: { select: { appointments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: { doctor: true, service: true },
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        _count: { select: { appointments: true } },
      },
    });
    if (!patient) throw new NotFoundException('Bemor topilmadi');
    return patient;
  }

  async update(id: string, data: { fullName?: string; phone?: string; email?: string; notes?: string }) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  async findDuplicates() {
    // Find patients with same phone number
    const duplicates = await this.prisma.$queryRaw<Array<{ phone: string; count: bigint }>>`
      SELECT phone, COUNT(*) as count
      FROM patients
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 50
    `;

    return duplicates.map(d => ({
      phone: d.phone,
      count: Number(d.count),
    }));
  }

  async exportCsv(search?: string) {
    const where: Prisma.PatientWhereInput = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const patients = await this.prisma.patient.findMany({
      where,
      include: { _count: { select: { appointments: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // CSV injection protection: prefix cells that start with special chars
    const sanitize = (val: string | null | undefined) => {
      if (!val) return '';
      if (/^[=+\-@\t\r]/.test(val)) return "'" + val;
      return val;
    };

    const header = 'Ism,Telefon,Email,Qabullar soni,Ro\'yxatga olingan';
    const rows = patients.map(p =>
      [
        sanitize(p.fullName),
        sanitize(p.phone),
        sanitize(p.email),
        p._count.appointments,
        p.createdAt.toISOString(),
      ].join(',')
    );

    return [header, ...rows].join('\n');
  }
}

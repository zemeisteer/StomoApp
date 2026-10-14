import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StaffRole } from '@prisma/client';
import { JwtPayload } from '../auth/auth.service';

export interface UpdatePatientInput {
  fullName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    params: { search?: string; page?: number; limit?: number },
    user?: JwtPayload,
  ) {
    const { search, page = 1, limit = 20 } = params;
    const where: Prisma.PatientWhereInput = {};

    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profili biriktirilmagan');
      }
      where.appointments = {
        some: { doctorId: user.doctorId },
      };
    }

    if (search) {
      const searchConditions: Prisma.PatientWhereInput[] = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
      if (where.appointments) {
        where.AND = [
          { appointments: where.appointments },
          { OR: searchConditions },
        ];
        delete where.appointments;
      } else {
        where.OR = searchConditions;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        include: {
          _count: {
            select: {
              appointments: user?.role === StaffRole.DOCTOR
                ? { where: { doctorId: user.doctorId! } }
                : true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string, user?: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            doctor: {
              select: {
                id: true,
                firstNameUz: true,
                lastNameUz: true,
                firstNameRu: true,
                lastNameRu: true,
              },
            },
            service: {
              select: { id: true, nameUz: true, nameRu: true },
            },
            branch: {
              select: { id: true, nameUz: true, nameRu: true },
            },
          },
          orderBy: { startTime: 'desc' },
        },
        _count: { select: { appointments: true } },
      },
    });

    if (!patient) throw new NotFoundException('Bemor topilmadi');

    // Doctor ownership & relationship restriction
    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profili biriktirilmagan');
      }

      // Filter appointments to only those with this doctor
      const authorizedAppointments = patient.appointments.filter(
        a => a.doctorId === user.doctorId,
      );

      // Fail closed if doctor has never treated this patient
      if (authorizedAppointments.length === 0) {
        throw new ForbiddenException('Ushbu bemor sizning qabulingizda bo\'lmagan');
      }

      // Return minimal scoped profile
      return {
        id: patient.id,
        fullName: patient.fullName,
        phone: patient.phone,
        email: patient.email,
        createdAt: patient.createdAt,
        appointments: authorizedAppointments,
        _count: { appointments: authorizedAppointments.length },
      };
    }

    // OWNER / ADMIN gets complete profile
    return patient;
  }

  async update(id: string, data: UpdatePatientInput) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException('Bemor topilmadi');

    return this.prisma.patient.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        phone: data.phone?.trim(),
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });
  }

  /**
   * Find duplicate phone numbers and group family members for review
   */
  async findDuplicates() {
    const duplicatePhones = await this.prisma.$queryRaw<Array<{ phone: string; count: bigint }>>`
      SELECT phone, COUNT(*) as count
      FROM patients
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 50
    `;

    const results = [];
    for (const d of duplicatePhones) {
      const records = await this.prisma.patient.findMany({
        where: { phone: d.phone },
        include: {
          _count: { select: { appointments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      results.push({
        phone: d.phone,
        count: Number(d.count),
        patients: records,
      });
    }

    return results;
  }

  /**
   * Safe merge of duplicate patient records (moves appointments to target)
   */
  async mergePatients(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new Error('Bir xil bemorlarni birlashtirib bo\'lmaydi');
    }

    return this.prisma.$transaction(async (tx) => {
      // Reassign appointments
      await tx.appointment.updateMany({
        where: { patientId: sourceId },
        data: { patientId: targetId },
      });

      // Reassign reviews
      await tx.review.updateMany({
        where: { patientId: sourceId },
        data: { patientId: targetId },
      });

      // Remove source patient
      await tx.patient.delete({
        where: { id: sourceId },
      });

      return tx.patient.findUnique({
        where: { id: targetId },
        include: { _count: { select: { appointments: true } } },
      });
    });
  }

  /**
   * RFC 4180 compliant CSV export with formula injection neutralization
   */
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

    // Neutralize spreadsheet formula injection and format RFC 4180 cell
    const formatCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);

      // Formula injection neutralization: prefix leading special chars
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }

      // Escape quotes and wrap in quotes
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const header = ['ID', 'F.I.SH.', 'Telefon', 'Email', 'Qabullar soni', 'Ro\'yxatdan o\'tgan sana']
      .map(h => formatCell(h))
      .join(',');

    const rows = patients.map(p =>
      [
        formatCell(p.id),
        formatCell(p.fullName),
        formatCell(p.phone),
        formatCell(p.email || ''),
        formatCell(p._count.appointments),
        formatCell(p.createdAt.toISOString()),
      ].join(',')
    );

    return [header, ...rows].join('\r\n');
  }
}

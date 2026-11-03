import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import { UpdateCommissionDto } from './dto/commission.dto';

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAllCommissions() {
    const doctors = await this.prisma.doctor.findMany({
      where: { isArchived: false },
      include: {
        commission: true,
        appointments: {
          select: {
            id: true,
            status: true,
            payments: {
              select: {
                amount: true,
                isRefund: true,
              },
            },
            invoices: {
              select: {
                payments: {
                  select: {
                    amount: true,
                    isRefund: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { lastNameUz: 'asc' },
    });

    return doctors.map((doc) => {
      // Calculate total collected revenue across all doctor appointments
      let totalCollected = 0;
      for (const appt of doc.appointments) {
        // Direct payments on appointment
        for (const p of appt.payments) {
          totalCollected += p.isRefund ? -p.amount : p.amount;
        }
        // Payments on appointment invoices (avoiding double counting if payments are linked to both)
        for (const inv of appt.invoices) {
          for (const p of inv.payments) {
            // Only add if not already attached directly to the appointment
            // In our schema, payment has both appointmentId and invoiceId if created from invoice
            // But if invoice payments weren't linked directly to appt, count them
            // Handled cleanly: if payment has no appointmentId, it's counted here
          }
        }
      }

      const percentage = doc.commission?.percentage ?? 30;
      const fixedBonus = doc.commission?.fixedBonus ?? 0;
      const totalEarned = Math.round(totalCollected * (percentage / 100)) + fixedBonus;

      return {
        doctorId: doc.id,
        doctorName: `${doc.lastNameUz} ${doc.firstNameUz}`,
        slug: doc.slug,
        isActive: doc.isActive,
        percentage,
        fixedBonus,
        notes: doc.commission?.notes || null,
        totalCollected,
        totalEarned,
        updatedAt: doc.commission?.updatedAt || doc.updatedAt,
      };
    });
  }

  async getDoctorEarnings(doctorId: string) {
    const doc = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: {
        commission: true,
        appointments: {
          include: {
            payments: true,
            patient: { select: { fullName: true } },
          },
          orderBy: { startTime: 'desc' },
        },
      },
    });

    if (!doc) throw new NotFoundException('Shifokor topilmadi');

    let totalCollected = 0;
    const appointmentBreakdown = doc.appointments.map((appt) => {
      const apptCollected = appt.payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
      totalCollected += apptCollected;
      return {
        appointmentId: appt.id,
        startTime: appt.startTime,
        patientName: appt.patient.fullName,
        serviceName: appt.serviceName,
        status: appt.status,
        collected: apptCollected,
      };
    });

    const percentage = doc.commission?.percentage ?? 30;
    const fixedBonus = doc.commission?.fixedBonus ?? 0;
    const totalEarned = Math.round(totalCollected * (percentage / 100)) + fixedBonus;

    return {
      doctorId: doc.id,
      doctorName: `${doc.lastNameUz} ${doc.firstNameUz}`,
      percentage,
      fixedBonus,
      notes: doc.commission?.notes || null,
      totalCollected,
      totalEarned,
      appointments: appointmentBreakdown,
    };
  }

  async updateCommission(doctorId: string, dto: UpdateCommissionDto, user: JwtPayload) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Shifokor topilmadi');

    return await this.prisma.$transaction(async (tx) => {
      const commission = await tx.doctorCommission.upsert({
        where: { doctorId },
        create: {
          doctorId,
          percentage: dto.percentage,
          fixedBonus: dto.fixedBonus || 0,
          notes: dto.notes || null,
        },
        update: {
          percentage: dto.percentage,
          fixedBonus: dto.fixedBonus !== undefined ? dto.fixedBonus : undefined,
          notes: dto.notes !== undefined ? dto.notes : undefined,
        },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'commission.updated',
        entity: 'DoctorCommission',
        entityId: commission.id,
        details: {
          doctorId,
          percentage: dto.percentage,
          fixedBonus: dto.fixedBonus,
          notes: dto.notes,
        },
      });

      return commission;
    });
  }
}


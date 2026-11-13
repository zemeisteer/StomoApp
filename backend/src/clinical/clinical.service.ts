import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffRole } from '@prisma/client';
import { JwtPayload } from '../auth/auth.service';
import { SaveOdontogramDto } from './dto/odontogram.dto';
import { CreateTreatmentPlanItemDto, UpdateTreatmentStatusDto } from './dto/treatment-plan.dto';

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertPatientAccess(patientId: string, user: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { appointments: { select: { doctorId: true } } },
    });
    if (!patient) throw new NotFoundException('Bemor topilmadi');

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      const hasAppt = patient.appointments.some((a) => a.doctorId === user.doctorId);
      if (!hasAppt) throw new ForbiddenException('Ushbu bemor ma\'lumotlariga ruxsat yo\'q');
    }
    return patient;
  }

  async getOdontogram(patientId: string, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);

    const records = await this.prisma.odontogramRecord.findMany({
      where: { patientId },
      include: { surfaces: true },
      orderBy: { toothNumber: 'asc' },
    });

    return records.map((r) => ({
      toothNumber: r.toothNumber,
      condition: r.condition,
      chartType: r.chartType,
      note: r.note,
      surfaces: r.surfaces.map((s) => s.surface),
      updatedAt: r.updatedAt,
    }));
  }

  async saveOdontogram(patientId: string, dto: SaveOdontogramDto, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);

    return await this.prisma.$transaction(async (tx) => {
      for (const tooth of dto.teeth) {
        const record = await tx.odontogramRecord.upsert({
          where: {
            patientId_toothNumber: {
              patientId,
              toothNumber: tooth.toothNumber,
            },
          },
          create: {
            patientId,
            doctorId: user.doctorId || null,
            appointmentId: dto.appointmentId || null,
            toothNumber: tooth.toothNumber,
            condition: tooth.condition,
            chartType: tooth.chartType || 'ADULT',
            note: tooth.note || null,
          },
          update: {
            condition: tooth.condition,
            chartType: tooth.chartType || 'ADULT',
            note: tooth.note || null,
            doctorId: user.doctorId || undefined,
            appointmentId: dto.appointmentId || undefined,
          },
        });

        if (tooth.surfaces) {
          await tx.toothSurfaceRecord.deleteMany({
            where: { odontogramRecordId: record.id },
          });
          if (tooth.surfaces.length > 0) {
            await tx.toothSurfaceRecord.createMany({
              data: tooth.surfaces.map((surface) => ({
                odontogramRecordId: record.id,
                surface,
              })),
            });
          }
        }
      }

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.odontogram_updated',
        entity: 'Patient',
        entityId: patientId,
        details: { teethCount: dto.teeth.length, appointmentId: dto.appointmentId },
      });

      return { success: true, updatedTeethCount: dto.teeth.length };
    });
  }

  async getTreatmentPlan(patientId: string, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);

    return await this.prisma.treatmentPlanItem.findMany({
      where: { patientId },
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTreatmentPlanItem(patientId: string, dto: CreateTreatmentPlanItemDto, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);

    return await this.prisma.$transaction(async (tx) => {
      const item = await tx.treatmentPlanItem.create({
        data: {
          patientId,
          doctorId: user.doctorId || null,
          appointmentId: dto.appointmentId || null,
          toothNumber: dto.toothNumber || null,
          treatmentNameUz: dto.treatmentNameUz,
          treatmentNameRu: dto.treatmentNameRu || null,
          costUzs: dto.costUzs,
          status: dto.status || 'PLANNED',
          notes: dto.notes || null,
        },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.treatment_plan_created',
        entity: 'TreatmentPlanItem',
        entityId: item.id,
        details: { patientId, treatmentNameUz: item.treatmentNameUz, costUzs: item.costUzs },
      });

      return item;
    });
  }

  async updateTreatmentPlanStatus(id: string, dto: UpdateTreatmentStatusDto, user: JwtPayload) {
    const existing = await this.prisma.treatmentPlanItem.findUnique({
      where: { id },
      include: { patient: { include: { appointments: { select: { doctorId: true } } } } },
    });
    if (!existing) throw new NotFoundException('Davolash rejasi bandi topilmadi');

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      const hasAppt = existing.patient.appointments.some((a) => a.doctorId === user.doctorId);
      if (!hasAppt && existing.doctorId !== user.doctorId) {
        throw new ForbiddenException('Ushbu yozuvni o\'zgartirishga ruxsat yo\'q');
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlanItem.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.treatment_plan_status_changed',
        entity: 'TreatmentPlanItem',
        entityId: id,
        details: { oldStatus: existing.status, newStatus: dto.status },
      });

      return updated;
    });
  }
}


import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import {
  AcceptPlanDto,
  CreatePlanDto,
  CreatePlanItemDto,
  DeclinePlanDto,
  PublicAcceptPlanDto,
  UpdatePlanDto,
  UpdatePlanItemDto,
} from './dto/treatment-plans.dto';

/** Plan lifecycle. Prices can change only before the patient accepts. */
export const PLAN_STATUSES = ['DRAFT', 'PRESENTED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
const EDITABLE: PlanStatus[] = ['DRAFT', 'PRESENTED'];
const ITEM_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const APPROVAL_LINK_DAYS = 14;
const MAX_SIGNATURE_LENGTH = 300_000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const doctorSelect = {
  id: true,
  firstNameUz: true,
  lastNameUz: true,
  firstNameRu: true,
  lastNameRu: true,
} as const;

type PlanWithItems = Prisma.TreatmentPlanGetPayload<{
  include: { items: true; doctor: { select: typeof doctorSelect } };
}>;

export function planTotals(plan: { discountUzs: number; items: Array<{ costUzs: number; status: string }> }) {
  const billable = plan.items.filter((i) => i.status !== 'CANCELLED');
  const subtotal = billable.reduce((sum, i) => sum + i.costUzs, 0);
  const discount = Math.min(plan.discountUzs, subtotal);
  const completed = billable.filter((i) => i.status === 'COMPLETED').reduce((sum, i) => sum + i.costUzs, 0);
  return { subtotalUzs: subtotal, discountUzs: discount, totalUzs: subtotal - discount, completedUzs: completed };
}

@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  /** Doctors may only work with patients they have (had) an appointment with. */
  async assertPatientAccess(patientId: string, user: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true } });
    if (!patient) throw new NotFoundException('Bemor topilmadi');
    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      const appt = await this.prisma.appointment.findFirst({
        where: { patientId, doctorId: user.doctorId },
        select: { id: true },
      });
      if (!appt) throw new ForbiddenException("Ushbu bemor ma'lumotlariga ruxsat yo'q");
    }
    return patient;
  }

  private async loadPlan(planId: string, user: JwtPayload) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: { items: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }, doctor: { select: doctorSelect } },
    });
    if (!plan) throw new NotFoundException('Davolash rejasi topilmadi');
    await this.assertPatientAccess(plan.patientId, user);
    return plan;
  }

  private assertEditable(plan: { status: string }) {
    if (!EDITABLE.includes(plan.status as PlanStatus)) {
      throw new BadRequestException(
        "Bemor rozilik bergan yoki yopilgan rejani o'zgartirib bo'lmaydi. Yangi reja yarating.",
      );
    }
  }

  private serialize(plan: PlanWithItems) {
    const { approvalTokenHash, acceptanceSignature, ...rest } = plan;
    return {
      ...rest,
      hasApprovalLink: Boolean(approvalTokenHash),
      hasSignature: Boolean(acceptanceSignature),
      totals: {
        ...planTotals(plan),
        uninvoicedUzs: plan.items.filter((i) => i.status !== 'CANCELLED' && !i.invoiceId).reduce((sum, i) => sum + i.costUzs, 0),
        uninvoicedCompletedUzs: plan.items
          .filter((i) => i.status === 'COMPLETED' && !i.invoiceId)
          .reduce((sum, i) => sum + i.costUzs, 0),
      },
    };
  }

  /**
   * Editing a plan the patient has already been shown invalidates that offer:
   * the private link stops working and the plan goes back to DRAFT.
   */
  private async revokeIfPresented(tx: Prisma.TransactionClient, plan: { id: string; status: string }) {
    if (plan.status === 'PRESENTED') {
      await tx.treatmentPlan.update({
        where: { id: plan.id },
        data: { status: 'DRAFT', approvalTokenHash: null, approvalExpiresAt: null, presentedAt: null },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  async listForPatient(patientId: string, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { patientId },
      include: { items: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }, doctor: { select: doctorSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((p) => this.serialize(p));
  }

  async getPlan(planId: string, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    return { ...this.serialize(plan), acceptanceSignature: plan.acceptanceSignature };
  }

  async createPlan(patientId: string, dto: CreatePlanDto, user: JwtPayload) {
    await this.assertPatientAccess(patientId, user);
    let doctorId = user.role === StaffRole.DOCTOR ? user.doctorId! : dto.doctorId || null;
    if (doctorId) {
      const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
      if (!doctor) doctorId = null;
    }
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.treatmentPlan.create({
        data: {
          patientId,
          doctorId,
          createdById: user.sub,
          title: dto.title.trim(),
          notes: dto.notes?.trim() || null,
        },
        include: { items: true, doctor: { select: doctorSelect } },
      });
      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.plan_created',
        entity: 'TreatmentPlan',
        entityId: plan.id,
        details: { patientId },
      });
      return this.serialize(plan);
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    const changesPrice = dto.discountUzs !== undefined && dto.discountUzs !== plan.discountUzs;
    if (changesPrice) this.assertEditable(plan);
    if (['COMPLETED', 'CANCELLED'].includes(plan.status)) throw new BadRequestException('Yopilgan rejani tahrirlab bo\'lmaydi');

    await this.prisma.$transaction(async (tx) => {
      if (changesPrice) await this.revokeIfPresented(tx, plan);
      await tx.treatmentPlan.update({
        where: { id: planId },
        data: {
          title: dto.title?.trim() || undefined,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
          discountUzs: dto.discountUzs,
        },
      });
    });
    return this.getPlan(planId, user);
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  async addItem(planId: string, dto: CreatePlanItemDto, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    this.assertEditable(plan);

    let nameUz = dto.treatmentNameUz?.trim();
    let nameRu = dto.treatmentNameRu?.trim() || null;
    let unitPrice = dto.unitPriceUzs;
    if (dto.serviceId) {
      const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
      if (!service) throw new BadRequestException('Xizmat topilmadi');
      nameUz = nameUz || service.nameUz;
      nameRu = nameRu || service.nameRu || null;
      // Catalog prices are stored in tiyin; plans work in whole so'm
      if (unitPrice === undefined) unitPrice = Math.round((service.priceFrom ?? 0) / 100);
    }
    if (!nameUz) throw new BadRequestException('Muolaja nomi kiritilishi shart');
    if (unitPrice === undefined) throw new BadRequestException('Narx kiritilishi shart');
    const quantity = dto.quantity ?? 1;

    await this.prisma.$transaction(async (tx) => {
      await this.revokeIfPresented(tx, plan);
      const maxOrder = plan.items.reduce((m, i) => Math.max(m, i.sortOrder), 0);
      await tx.treatmentPlanItem.create({
        data: {
          planId,
          patientId: plan.patientId,
          doctorId: plan.doctorId,
          serviceId: dto.serviceId || null,
          toothNumber: dto.toothNumber ?? null,
          treatmentNameUz: nameUz!,
          treatmentNameRu: nameRu,
          quantity,
          unitPriceUzs: unitPrice!,
          costUzs: unitPrice! * quantity,
          phase: dto.phase ?? 1,
          sortOrder: maxOrder + 1,
          notes: dto.notes?.trim() || null,
        },
      });
    });
    return this.getPlan(planId, user);
  }

  async updateItem(itemId: string, dto: UpdatePlanItemDto, user: JwtPayload) {
    const item = await this.prisma.treatmentPlanItem.findUnique({ where: { id: itemId } });
    if (!item || !item.planId) throw new NotFoundException('Reja bandi topilmadi');
    const plan = await this.loadPlan(item.planId, user);

    const priceFields = [dto.unitPriceUzs, dto.quantity, dto.treatmentNameUz, dto.toothNumber, dto.phase].some((v) => v !== undefined);
    if (priceFields) this.assertEditable(plan);

    if (dto.status !== undefined) {
      if (!ITEM_STATUSES.includes(dto.status)) throw new BadRequestException("Noto'g'ri holat");
      if (!['ACCEPTED', 'IN_PROGRESS'].includes(plan.status) && dto.status !== 'PLANNED') {
        throw new BadRequestException('Muolajani boshlash uchun bemor rejaga rozilik bergan bo\'lishi kerak');
      }
    }

    const quantity = dto.quantity ?? item.quantity;
    const unitPrice = dto.unitPriceUzs ?? item.unitPriceUzs;

    await this.prisma.$transaction(async (tx) => {
      if (priceFields) await this.revokeIfPresented(tx, plan);
      await tx.treatmentPlanItem.update({
        where: { id: itemId },
        data: {
          treatmentNameUz: dto.treatmentNameUz?.trim() || undefined,
          treatmentNameRu: dto.treatmentNameRu !== undefined ? dto.treatmentNameRu.trim() || null : undefined,
          toothNumber: dto.toothNumber !== undefined ? dto.toothNumber : undefined,
          phase: dto.phase,
          quantity,
          unitPriceUzs: unitPrice,
          costUzs: quantity * unitPrice,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
          status: dto.status,
        },
      });

      if (dto.status !== undefined && dto.status !== item.status) {
        await this.syncPlanProgress(tx, plan.id);
        await this.audit.logTransactional({
          tx,
          userId: user.sub,
          action: 'clinical.plan_item_status_changed',
          entity: 'TreatmentPlanItem',
          entityId: itemId,
          details: { planId: plan.id, from: item.status, to: dto.status },
        });
      }
    });
    return this.getPlan(plan.id, user);
  }

  /** ACCEPTED → IN_PROGRESS on first started item; → COMPLETED when nothing is left to do. */
  private async syncPlanProgress(tx: Prisma.TransactionClient, planId: string) {
    const plan = await tx.treatmentPlan.findUnique({ where: { id: planId }, include: { items: true } });
    if (!plan || !['ACCEPTED', 'IN_PROGRESS'].includes(plan.status)) return;
    const active = plan.items.filter((i) => i.status !== 'CANCELLED');
    let status: PlanStatus = plan.status as PlanStatus;
    if (active.length > 0 && active.every((i) => i.status === 'COMPLETED')) status = 'COMPLETED';
    else if (active.some((i) => i.status === 'IN_PROGRESS' || i.status === 'COMPLETED')) status = 'IN_PROGRESS';
    else status = 'ACCEPTED';
    if (status !== plan.status) await tx.treatmentPlan.update({ where: { id: planId }, data: { status } });
  }

  async removeItem(itemId: string, user: JwtPayload) {
    const item = await this.prisma.treatmentPlanItem.findUnique({ where: { id: itemId } });
    if (!item || !item.planId) throw new NotFoundException('Reja bandi topilmadi');
    const plan = await this.loadPlan(item.planId, user);
    this.assertEditable(plan);
    await this.prisma.$transaction(async (tx) => {
      await this.revokeIfPresented(tx, plan);
      await tx.treatmentPlanItem.delete({ where: { id: itemId } });
    });
    return this.getPlan(plan.id, user);
  }

  // ---------------------------------------------------------------------------
  // Presenting and approval
  // ---------------------------------------------------------------------------

  /** Locks the offer and returns a private link the patient can open to review and accept it. */
  async present(planId: string, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    this.assertEditable(plan);
    if (plan.items.filter((i) => i.status !== 'CANCELLED').length === 0) {
      throw new BadRequestException("Rejada kamida bitta muolaja bo'lishi kerak");
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + APPROVAL_LINK_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.treatmentPlan.update({
        where: { id: planId },
        data: { status: 'PRESENTED', presentedAt: new Date(), approvalTokenHash: hashToken(token), approvalExpiresAt: expiresAt },
      });
      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.plan_presented',
        entity: 'TreatmentPlan',
        entityId: planId,
        details: { totalUzs: planTotals(plan).totalUzs, expiresAt: expiresAt.toISOString() },
      });
    });
    return { approvalPath: `/plan/${token}`, expiresAt, plan: await this.getPlan(planId, user) };
  }

  /** Acceptance recorded at the clinic: signature on screen or verbal consent noted by staff. */
  async acceptInClinic(planId: string, dto: AcceptPlanDto, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    this.assertEditable(plan);
    if (plan.items.filter((i) => i.status !== 'CANCELLED').length === 0) {
      throw new BadRequestException("Rejada kamida bitta muolaja bo'lishi kerak");
    }
    if (dto.method === 'IN_CLINIC_SIGNATURE') {
      if (!dto.signature || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dto.signature)) {
        throw new BadRequestException('Imzo rasmi yaroqsiz');
      }
      if (dto.signature.length > MAX_SIGNATURE_LENGTH) throw new BadRequestException('Imzo rasmi juda katta');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.markAccepted(tx, plan, {
        method: dto.method,
        name: dto.acceptedByName.trim(),
        signature: dto.method === 'IN_CLINIC_SIGNATURE' ? dto.signature! : null,
        ip: null,
      });
      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.plan_accepted',
        entity: 'TreatmentPlan',
        entityId: planId,
        details: { method: dto.method, totalUzs: planTotals(plan).totalUzs },
      });
    });
    return this.getPlan(planId, user);
  }

  private async markAccepted(
    tx: Prisma.TransactionClient,
    plan: PlanWithItems,
    a: { method: string; name: string; signature: string | null; ip: string | null },
  ) {
    // Conditional update: only one acceptance can win even under concurrent requests
    const res = await tx.treatmentPlan.updateMany({
      where: { id: plan.id, status: { in: EDITABLE as unknown as string[] } },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedByName: a.name,
        acceptanceMethod: a.method,
        acceptanceSignature: a.signature,
        acceptanceIp: a.ip,
        acceptedTotalUzs: planTotals(plan).totalUzs,
        approvalTokenHash: null,
        approvalExpiresAt: null,
      },
    });
    if (res.count !== 1) throw new BadRequestException('Reja holati allaqachon o\'zgargan');
  }

  async decline(planId: string, dto: DeclinePlanDto, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    this.assertEditable(plan);
    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: dto.reason?.trim() || null,
        approvalTokenHash: null,
        approvalExpiresAt: null,
      },
    });
    return this.getPlan(planId, user);
  }

  async cancel(planId: string, user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    if (['COMPLETED', 'CANCELLED'].includes(plan.status)) throw new BadRequestException('Reja allaqachon yopilgan');
    await this.prisma.$transaction(async (tx) => {
      await tx.treatmentPlan.update({
        where: { id: planId },
        data: { status: 'CANCELLED', approvalTokenHash: null, approvalExpiresAt: null },
      });
      await tx.treatmentPlanItem.updateMany({
        where: { planId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED' },
      });
      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'clinical.plan_cancelled',
        entity: 'TreatmentPlan',
        entityId: planId,
        details: { from: plan.status },
      });
    });
    return this.getPlan(planId, user);
  }

  // ---------------------------------------------------------------------------
  // Billing
  // ---------------------------------------------------------------------------

  /**
   * Bills accepted plan items that have not been invoiced yet: either only completed work
   * or everything still to do (prepayment). The plan discount is spread over invoices
   * until it is used up, so the patient never pays more than the accepted total.
   */
  async createInvoiceFromPlan(planId: string, scope: 'COMPLETED' | 'ALL', user: JwtPayload) {
    const plan = await this.loadPlan(planId, user);
    if (!['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(plan.status)) {
      throw new BadRequestException("Hisob chiqarish uchun bemor rejaga rozilik bergan bo'lishi kerak");
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      // Serialize invoicing per plan
      await tx.$queryRaw`SELECT id FROM "treatment_plans" WHERE id = ${planId} FOR UPDATE`;
      const items = await tx.treatmentPlanItem.findMany({
        where: {
          planId,
          invoiceId: null,
          status: scope === 'COMPLETED' ? 'COMPLETED' : { not: 'CANCELLED' },
        },
        orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      });
      if (items.length === 0) {
        throw new BadRequestException(
          scope === 'COMPLETED' ? "Hisoblanmagan bajarilgan muolaja yo'q" : "Hisoblanmagan muolaja yo'q",
        );
      }
      const total = items.reduce((sum, i) => sum + i.costUzs, 0);
      const usedDiscount = await tx.invoice.aggregate({
        where: { planId, status: { not: 'CANCELLED' } },
        _sum: { discount: true },
      });
      const discount = Math.max(0, Math.min(plan.discountUzs - (usedDiscount._sum.discount || 0), total));

      const created = await tx.invoice.create({
        data: {
          patientId: plan.patientId,
          planId,
          totalAmount: total,
          discount,
          status: total - discount === 0 ? 'PAID' : 'PENDING',
          notes: `${plan.title}: ${items
            .map((i) => i.treatmentNameUz + (i.toothNumber ? ` (#${i.toothNumber})` : ''))
            .join(', ')}`.slice(0, 1000),
        },
      });
      const linked = await tx.treatmentPlanItem.updateMany({
        where: { id: { in: items.map((i) => i.id) }, invoiceId: null },
        data: { invoiceId: created.id },
      });
      if (linked.count !== items.length) throw new BadRequestException('Reja bandlari allaqachon hisoblangan');

      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'billing.invoice_created',
        entity: 'Invoice',
        entityId: created.id,
        details: { planId, scope, items: items.length, totalAmount: total, discount },
      });
      return created;
    });
    return { invoice, plan: await this.getPlan(planId, user) };
  }

  // ---------------------------------------------------------------------------
  // Public (patient-facing) approval link
  // ---------------------------------------------------------------------------

  private async findByToken(token: string) {
    if (!token || token.length < 20 || token.length > 64) throw new NotFoundException('Havola topilmadi');
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { approvalTokenHash: hashToken(token) },
      include: {
        items: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] },
        doctor: { select: doctorSelect },
        patient: { select: { fullName: true } },
      },
    });
    if (!plan || plan.status !== 'PRESENTED' || !plan.approvalExpiresAt || plan.approvalExpiresAt < new Date()) {
      throw new NotFoundException("Havola eskirgan yoki yaroqsiz. Klinikaga murojaat qiling.");
    }
    return plan;
  }

  /** Minimal view for the patient: first name only, no phone or medical history. */
  async getPublic(token: string) {
    const plan = await this.findByToken(token);
    const clinic = await this.prisma.clinicSettings.findFirst({ select: { name: true, nameRu: true, logo: true, phone: true } });
    return {
      title: plan.title,
      notes: plan.notes,
      status: plan.status,
      expiresAt: plan.approvalExpiresAt,
      patientFirstName: plan.patient.fullName.trim().split(/\s+/)[0],
      doctor: plan.doctor,
      clinic: clinic ? { name: clinic.name, nameRu: clinic.nameRu, logo: clinic.logo } : null,
      items: plan.items
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({
          id: i.id,
          treatmentNameUz: i.treatmentNameUz,
          treatmentNameRu: i.treatmentNameRu,
          toothNumber: i.toothNumber,
          quantity: i.quantity,
          unitPriceUzs: i.unitPriceUzs,
          costUzs: i.costUzs,
          phase: i.phase,
        })),
      totals: planTotals(plan),
    };
  }

  async acceptPublic(token: string, dto: PublicAcceptPlanDto, ip: string | null) {
    const plan = await this.findByToken(token);
    if (dto.agree !== true) throw new BadRequestException('Rozilik belgilanmagan');
    await this.prisma.$transaction(async (tx) => {
      await this.markAccepted(tx, plan, { method: 'ONLINE', name: dto.fullName.trim(), signature: null, ip });
      await this.audit.logTransactional({
        tx,
        userId: null,
        ipAddress: ip ?? undefined,
        action: 'clinical.plan_accepted',
        entity: 'TreatmentPlan',
        entityId: plan.id,
        details: { method: 'ONLINE', totalUzs: planTotals(plan).totalUzs },
      });
    });
    return { status: 'ACCEPTED' };
  }

  async declinePublic(token: string, dto: DeclinePlanDto) {
    const plan = await this.findByToken(token);
    await this.prisma.treatmentPlan.updateMany({
      where: { id: plan.id, status: 'PRESENTED' },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: dto.reason?.trim() || null,
        approvalTokenHash: null,
        approvalExpiresAt: null,
      },
    });
    return { status: 'DECLINED' };
  }
}

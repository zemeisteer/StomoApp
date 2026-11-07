import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TreatmentPlansService, planTotals } from '../clinical/treatment-plans.service';
import { PaymeService } from '../payments/payme.service';
import { ClickService } from '../payments/click.service';
import { invoiceBalance } from '../billing/invoice-ledger';
import { PortalSession } from './portal-auth.service';

const doctorSelect = { firstNameUz: true, lastNameUz: true, firstNameRu: true, lastNameRu: true } as const;
const PATIENT_VISIBLE_PLAN_STATUSES = ['PRESENTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'];

/**
 * Everything the patient sees in the cabinet. A session proves ownership of a phone number;
 * all patient records with that number (e.g. a parent and children) belong to it.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: TreatmentPlansService,
    private readonly payme: PaymeService,
    private readonly click: ClickService,
  ) {}

  private async profiles(session: PortalSession) {
    return this.prisma.patient.findMany({
      where: { phone: session.phone, isActive: true },
      select: { id: true, fullName: true, preferredLanguage: true, telegramUserId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async resolvePatient(session: PortalSession, patientId?: string) {
    const profiles = await this.profiles(session);
    if (profiles.length === 0) throw new ForbiddenException('Bu raqamga bog‘langan bemor topilmadi');
    const patient = patientId ? profiles.find((p) => p.id === patientId) : profiles[0];
    if (!patient) throw new NotFoundException('Bemor topilmadi');
    return { patient, profiles };
  }

  async me(session: PortalSession) {
    const profiles = await this.profiles(session);
    return {
      phone: session.phone,
      profiles: profiles.map((p) => ({ id: p.id, fullName: p.fullName, language: p.preferredLanguage, telegramLinked: Boolean(p.telegramUserId) })),
    };
  }

  async overview(session: PortalSession, patientId?: string) {
    const { patient } = await this.resolvePatient(session, patientId);
    const now = new Date();

    const [appointments, plans, invoices] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: patient.id },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          serviceName: true,
          publicToken: true,
          doctor: { select: doctorSelect },
          branch: { select: { nameUz: true, nameRu: true, addressUz: true, addressRu: true, phone: true } },
        },
        orderBy: { startTime: 'desc' },
        take: 50,
      }),
      this.prisma.treatmentPlan.findMany({
        where: { patientId: patient.id, status: { in: PATIENT_VISIBLE_PLAN_STATUSES } },
        include: { items: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] }, doctor: { select: doctorSelect } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { patientId: patient.id, status: { not: 'CANCELLED' } },
        include: { payments: { orderBy: { recordedAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const upcoming = appointments
      .filter((a) => a.startTime > now && ['PENDING', 'CONFIRMED'].includes(a.status))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const past = appointments.filter((a) => !upcoming.includes(a));

    const invoiceRows = await Promise.all(
      invoices.map(async (inv) => {
        const { effectiveTotal, paid, debt } = await invoiceBalance(this.prisma, { id: inv.id, total_amount: inv.totalAmount, discount: inv.discount });
        return {
          id: inv.id,
          createdAt: inv.createdAt,
          notes: inv.notes,
          totalUzs: effectiveTotal,
          paidUzs: paid,
          debtUzs: debt,
          canPayOnline: debt > 0 && Boolean(this.payme.checkoutUrl(inv.id, debt) || this.click.payUrl(inv.id, debt)),
          payments: inv.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, isRefund: p.isRefund, recordedAt: p.recordedAt })),
        };
      }),
    );

    // Appointment tokens let the patient reschedule/cancel through the existing self-service page
    const mapAppt = (a: (typeof appointments)[number], withLink: boolean) => {
      const { publicToken, ...rest } = a;
      return { ...rest, manageUrl: withLink ? `/booking/status/${publicToken}` : null };
    };

    return {
      patient: { id: patient.id, fullName: patient.fullName, language: patient.preferredLanguage },
      upcoming: upcoming.map((a) => mapAppt(a, true)),
      past: past.map((a) => mapAppt(a, false)),
      plans: plans.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt,
        acceptedAt: p.acceptedAt,
        doctor: p.doctor,
        totals: planTotals(p),
        items: p.items
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
            status: i.status,
          })),
      })),
      invoices: invoiceRows,
      totals: {
        debtUzs: invoiceRows.reduce((s, i) => s + i.debtUzs, 0),
        paidUzs: invoiceRows.reduce((s, i) => s + i.paidUzs, 0),
      },
    };
  }

  async acceptPlan(session: PortalSession, planId: string, ip: string | null) {
    const ids = (await this.profiles(session)).map((p) => p.id);
    return this.plans.acceptFromPortal(planId, ids, ip);
  }

  async declinePlan(session: PortalSession, planId: string, reason?: string) {
    const ids = (await this.profiles(session)).map((p) => p.id);
    return this.plans.declineFromPortal(planId, ids, reason);
  }

  async paymentLinks(session: PortalSession, invoiceId: string) {
    const ids = (await this.profiles(session)).map((p) => p.id);
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, patientId: true, totalAmount: true, discount: true, status: true } });
    if (!inv || !ids.includes(inv.patientId)) throw new NotFoundException('Hisob topilmadi');
    const { debt } = await invoiceBalance(this.prisma, { id: inv.id, total_amount: inv.totalAmount, discount: inv.discount });
    if (debt <= 0 || inv.status === 'CANCELLED') throw new BadRequestException("Bu hisob to'langan");
    return { amountUzs: debt, payme: this.payme.checkoutUrl(inv.id, debt), click: this.click.payUrl(inv.id, debt) };
  }

  async setLanguage(session: PortalSession, lang: string) {
    if (!['uz', 'ru'].includes(lang)) throw new BadRequestException('Til noto‘g‘ri');
    await this.prisma.patient.updateMany({ where: { phone: session.phone }, data: { preferredLanguage: lang } });
    return { language: lang };
  }
}

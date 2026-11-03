import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffRole } from '@prisma/client';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { RecordPaymentDto } from './dto/payment.dto';

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('invoices')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async listInvoices(
    @Query('patientId') patientId?: string,
    @Query('appointmentId') appointmentId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.listInvoices({ patientId, appointmentId }, user!);
  }

  @Post('invoices')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createInvoice(dto, user);
  }

  @Post('payments')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.RECEPTION)
  async recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recordPayment(dto, user);
  }

  @Get('debts')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async getDebts(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page !== undefined && page !== '' ? parseInt(page, 10) : undefined;
    const parsedLimit = limit !== undefined && limit !== '' ? parseInt(limit, 10) : undefined;
    return this.service.getPatientDebts(user, {
      page: parsedPage && !Number.isNaN(parsedPage) ? parsedPage : undefined,
      limit: parsedLimit && !Number.isNaN(parsedLimit) ? parsedLimit : undefined,
    });
  }
}


import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StaffRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { TreatmentPlansService } from './treatment-plans.service';
import { PatientCardService } from './patient-card.service';
import {
  AcceptPlanDto,
  CreatePlanDto,
  CreatePlanItemDto,
  DeclinePlanDto,
  InvoicePlanDto,
  PublicAcceptPlanDto,
  UpdatePlanDto,
  UpdatePlanItemDto,
} from './dto/treatment-plans.dto';

const CLINICAL_READ = [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION];
const CLINICAL_WRITE = [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR];

@Controller('admin/clinical')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TreatmentPlansController {
  constructor(
    private readonly plans: TreatmentPlansService,
    private readonly card: PatientCardService,
  ) {}

  @Get('patient-card/:patientId')
  @Roles(...CLINICAL_READ)
  getCard(@Param('patientId') patientId: string, @CurrentUser() user: JwtPayload) {
    return this.card.getCard(patientId, user);
  }

  @Get('patients/:patientId/plans')
  @Roles(...CLINICAL_READ)
  list(@Param('patientId') patientId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.listForPatient(patientId, user);
  }

  @Post('patients/:patientId/plans')
  @Roles(...CLINICAL_WRITE)
  create(@Param('patientId') patientId: string, @Body() dto: CreatePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.createPlan(patientId, dto, user);
  }

  @Get('plans/:planId')
  @Roles(...CLINICAL_READ)
  get(@Param('planId') planId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.getPlan(planId, user);
  }

  @Patch('plans/:planId')
  @Roles(...CLINICAL_WRITE)
  update(@Param('planId') planId: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.updatePlan(planId, dto, user);
  }

  @Post('plans/:planId/items')
  @Roles(...CLINICAL_WRITE)
  addItem(@Param('planId') planId: string, @Body() dto: CreatePlanItemDto, @CurrentUser() user: JwtPayload) {
    return this.plans.addItem(planId, dto, user);
  }

  @Patch('plan-items/:itemId')
  @Roles(...CLINICAL_WRITE)
  updateItem(@Param('itemId') itemId: string, @Body() dto: UpdatePlanItemDto, @CurrentUser() user: JwtPayload) {
    return this.plans.updateItem(itemId, dto, user);
  }

  @Delete('plan-items/:itemId')
  @Roles(...CLINICAL_WRITE)
  removeItem(@Param('itemId') itemId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.removeItem(itemId, user);
  }

  @Post('plans/:planId/present')
  @Roles(...CLINICAL_WRITE)
  present(@Param('planId') planId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.present(planId, user);
  }

  @Post('plans/:planId/accept')
  @Roles(...CLINICAL_READ)
  accept(@Param('planId') planId: string, @Body() dto: AcceptPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.acceptInClinic(planId, dto, user);
  }

  @Post('plans/:planId/decline')
  @Roles(...CLINICAL_READ)
  decline(@Param('planId') planId: string, @Body() dto: DeclinePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.decline(planId, dto, user);
  }

  @Post('plans/:planId/invoice')
  @Roles(...CLINICAL_READ)
  invoice(@Param('planId') planId: string, @Body() dto: InvoicePlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.createInvoiceFromPlan(planId, dto.scope, user);
  }

  @Post('plans/:planId/cancel')
  @Roles(...CLINICAL_WRITE)
  cancel(@Param('planId') planId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.cancel(planId, user);
  }
}

/** Patient-facing approval link. Possession of the unguessable token is the authorization. */
@Controller('public/treatment-plans')
export class PublicTreatmentPlansController {
  constructor(private readonly plans: TreatmentPlansService) {}

  @Get(':token')
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 30, ttl: 60000 } })
  get(@Param('token') token: string) {
    return this.plans.getPublic(token);
  }

  @Post(':token/accept')
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 5, ttl: 60000 } })
  accept(@Param('token') token: string, @Body() dto: PublicAcceptPlanDto, @Req() req: Request) {
    return this.plans.acceptPublic(token, dto, req.ip || null);
  }

  @Post(':token/decline')
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 5, ttl: 60000 } })
  decline(@Param('token') token: string, @Body() dto: DeclinePlanDto) {
    return this.plans.declinePublic(token, dto);
  }
}

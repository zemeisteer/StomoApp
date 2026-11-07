import { Controller, Get, Post, Put, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffRole } from '@prisma/client';
import { SaveOdontogramDto } from './dto/odontogram.dto';
import { CreateTreatmentPlanItemDto, UpdateTreatmentStatusDto } from './dto/treatment-plan.dto';

@Controller('admin/clinical')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicalController {
  constructor(private readonly service: ClinicalService) {}

  @Get('odontogram/:patientId')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async getOdontogram(
    @Param('patientId') patientId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getOdontogram(patientId, user);
  }

  @Put('odontogram/:patientId')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async saveOdontogram(
    @Param('patientId') patientId: string,
    @Body() dto: SaveOdontogramDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.saveOdontogram(patientId, dto, user);
  }

  @Get('treatment-plan/:patientId')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async getTreatmentPlan(
    @Param('patientId') patientId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getTreatmentPlan(patientId, user);
  }

  @Post('treatment-plan/:patientId')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async createTreatmentPlanItem(
    @Param('patientId') patientId: string,
    @Body() dto: CreateTreatmentPlanItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createTreatmentPlanItem(patientId, dto, user);
  }

  @Patch('treatment-plan/:id/status')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async updateTreatmentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateTreatmentPlanStatus(id, dto, user);
  }
}


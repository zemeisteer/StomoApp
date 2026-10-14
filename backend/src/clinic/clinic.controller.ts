import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole } from '@prisma/client';

@Controller('clinic')
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get('settings')
  @Public()
  async getSettings() {
    return this.clinicService.getSettings();
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER)
  async updateSettings(@Body() data: any) {
    return this.clinicService.updateSettings(data);
  }

  @Get('branches')
  @Public()
  async getBranches() {
    return this.clinicService.getBranches();
  }

  @Get('branches/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getAllBranches() {
    return this.clinicService.getAllBranches();
  }

  @Post('branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async createBranch(@Body() data: any) {
    return this.clinicService.createBranch(data);
  }

  @Put('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async updateBranch(@Param('id') id: string, @Body() data: any) {
    return this.clinicService.updateBranch(id, data);
  }
}

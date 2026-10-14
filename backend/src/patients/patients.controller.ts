import { Controller, Get, Put, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffRole } from '@prisma/client';

@Controller('admin/patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findAll(@Query('search') search?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.patientsService.findAll({ search, page, limit });
  }

  @Get('duplicates')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findDuplicates() {
    return this.patientsService.findDuplicates();
  }

  @Get('export')
  @Roles(StaffRole.OWNER)
  async exportCsv(@Query('search') search: string, @Res() res: Response) {
    const csv = await this.patientsService.exportCsv(search);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=patients.csv');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  }

  @Get(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  findById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Doctors see minimal info only for their patients - enforced in service
    return this.patientsService.findById(id);
  }

  @Put(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  update(@Param('id') id: string, @Body() data: any) {
    return this.patientsService.update(id, data);
  }
}

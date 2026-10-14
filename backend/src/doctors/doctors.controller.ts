import { Controller, Get, Post, Put, Param, Body, UseGuards, Query } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole } from '@prisma/client';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @Public()
  findAllPublic() {
    return this.doctorsService.findAll(true);
  }

  @Get('slug/:slug')
  @Public()
  findBySlug(@Param('slug') slug: string) {
    return this.doctorsService.findBySlug(slug);
  }

  @Get('specialties')
  @Public()
  getSpecialties() {
    return this.doctorsService.getSpecialties();
  }

  // Admin
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findAllAdmin() {
    return this.doctorsService.findAll(false);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findById(@Param('id') id: string) {
    return this.doctorsService.findById(id);
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  create(@Body() data: any) {
    return this.doctorsService.create(data);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  update(@Param('id') id: string, @Body() data: any) {
    return this.doctorsService.update(id, data);
  }

  @Put('admin/:id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  archive(@Param('id') id: string) {
    return this.doctorsService.archive(id);
  }

  @Post('admin/specialties')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  createSpecialty(@Body() data: any) {
    return this.doctorsService.createSpecialty(data);
  }

  @Put('admin/specialties/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  updateSpecialty(@Param('id') id: string, @Body() data: any) {
    return this.doctorsService.updateSpecialty(id, data);
  }
}

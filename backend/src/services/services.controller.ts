import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole, ServiceCategory } from '@prisma/client';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Public()
  findAll() {
    return this.servicesService.findAll(true);
  }

  @Get('prices')
  @Public()
  getPriceList() {
    return this.servicesService.getPriceList();
  }

  @Get('categories')
  @Public()
  getCategories() {
    return this.servicesService.getCategories();
  }

  @Get('slug/:slug')
  @Public()
  findBySlug(@Param('slug') slug: string) {
    return this.servicesService.findBySlug(slug);
  }

  @Get('category/:category')
  @Public()
  findByCategory(@Param('category') category: ServiceCategory) {
    return this.servicesService.findByCategory(category);
  }

  // Admin
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  findAllAdmin() {
    return this.servicesService.findAll(false);
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  findById(@Param('id') id: string) {
    return this.servicesService.findById(id);
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  create(@Body() data: any) {
    return this.servicesService.create(data);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  update(@Param('id') id: string, @Body() data: any) {
    return this.servicesService.update(id, data);
  }
}

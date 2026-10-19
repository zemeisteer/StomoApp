import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PartialType } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole, ServiceCategory } from '@prisma/client';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
  Length,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @Length(2, 100)
  nameUz!: string;

  @IsString()
  @Length(2, 100)
  nameRu!: string;

  @IsString()
  @Length(2, 100)
  slug!: string;

  @IsEnum(ServiceCategory)
  category!: ServiceCategory;

  @IsOptional()
  @IsString()
  descriptionUz?: string;

  @IsOptional()
  @IsString()
  descriptionRu?: string;

  @IsOptional()
  @IsString()
  preparationUz?: string;

  @IsOptional()
  @IsString()
  preparationRu?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceFrom?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceTo?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  requiresConsultation?: boolean;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  iconName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  doctorIds?: string[];
}

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export enum LegacyReconcileAction {
  RESOLVE_TO_SERVICE = 'RESOLVE_TO_SERVICE',
  KEEP_AMBIGUOUS_BUNDLE = 'KEEP_AMBIGUOUS_BUNDLE',
}

export class ReconcileLegacyDto {
  @IsString()
  itemId!: string;

  @IsEnum(LegacyReconcileAction, { message: 'Qo\'llab-quvvatlanadigan amal: RESOLVE_TO_SERVICE yoki KEEP_AMBIGUOUS_BUNDLE' })
  action!: LegacyReconcileAction;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsString()
  @Length(5, 500, { message: 'Ko\'rib chiqish sababi (reason) kamida 5 ta belgidan iborat bo\'lishi shart' })
  reason!: string;

  @IsOptional()
  @IsInt()
  expectedAuditCount?: number;
}

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
  @Get('admin/legacy-review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  getLegacyReview(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.servicesService.getLegacyReviewReport(pageNum, limitNum);
  }

  @Post('admin/reconcile-legacy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  reconcileLegacy(
    @Body() dto: ReconcileLegacyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.servicesService.reconcileLegacyRecord(dto.itemId, dto, user.sub);
  }

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
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }
}

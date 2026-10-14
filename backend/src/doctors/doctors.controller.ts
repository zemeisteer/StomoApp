import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Length,
} from 'class-validator';

export class CreateDoctorDto {
  @IsString()
  @Length(2, 50)
  firstNameUz!: string;

  @IsString()
  @Length(2, 50)
  firstNameRu!: string;

  @IsString()
  @Length(2, 50)
  lastNameUz!: string;

  @IsString()
  @Length(2, 50)
  lastNameRu!: string;

  @IsString()
  @Length(2, 100)
  slug!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  titleUz?: string;

  @IsOptional()
  @IsString()
  titleRu?: string;

  @IsOptional()
  @IsString()
  bioUz?: string;

  @IsOptional()
  @IsString()
  bioRu?: string;

  @IsOptional()
  @IsString()
  educationUz?: string;

  @IsOptional()
  @IsString()
  educationRu?: string;

  @IsOptional()
  @IsInt()
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  languages?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  specialtyIds?: string[];

  @IsOptional()
  @IsArray()
  branchIds?: string[];

  @IsOptional()
  @IsArray()
  serviceIds?: string[];
}

export class UpdateDoctorDto extends CreateDoctorDto {}

export class SpecialtyDto {
  @IsString()
  nameUz!: string;

  @IsString()
  nameRu!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

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
  create(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.create(dto);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<CreateDoctorDto>) {
    return this.doctorsService.update(id, dto);
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
  createSpecialty(@Body() dto: SpecialtyDto) {
    return this.doctorsService.createSpecialty(dto);
  }

  @Put('admin/specialties/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  updateSpecialty(@Param('id') id: string, @Body() dto: Partial<SpecialtyDto>) {
    return this.doctorsService.updateSpecialty(id, dto);
  }
}

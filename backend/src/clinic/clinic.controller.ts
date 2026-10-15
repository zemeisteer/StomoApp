import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PartialType } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export class UpdateClinicSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameRu?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minBookingNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBookingHorizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pendingExpiryMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMinutes?: number;

  @IsOptional()
  @IsString()
  telegramLink?: string;

  @IsOptional()
  @IsString()
  instagramLink?: string;

  @IsOptional()
  @IsString()
  facebookLink?: string;

  @IsOptional()
  privacyPolicy?: any;

  @IsOptional()
  bookingPolicy?: any;

  @IsOptional()
  @IsString()
  metaTitleUz?: string;

  @IsOptional()
  @IsString()
  metaTitleRu?: string;

  @IsOptional()
  @IsString()
  metaDescriptionUz?: string;

  @IsOptional()
  @IsString()
  metaDescriptionRu?: string;
}

export class CreateBranchDto {
  @IsString()
  nameUz!: string;

  @IsString()
  nameRu!: string;

  @IsString()
  addressUz!: string;

  @IsString()
  addressRu!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  mapUrl?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  workingHours?: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

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
  async updateSettings(@Body() data: UpdateClinicSettingsDto) {
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
  async createBranch(@Body() data: CreateBranchDto) {
    return this.clinicService.createBranch(data);
  }

  @Put('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async updateBranch(@Param('id') id: string, @Body() data: UpdateBranchDto) {
    return this.clinicService.updateBranch(id, data);
  }
}

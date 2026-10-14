import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { LeadStatus, StaffRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  Length,
} from 'class-validator';

export class CreatePublicLeadDto {
  @IsString()
  @Length(2, 100)
  fullName!: string;

  @IsString()
  @Length(7, 20)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  message?: string;

  @IsOptional()
  @IsString()
  preferredBranch?: string;

  @IsOptional()
  @IsString()
  preferredTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;
}

export class ListLeadsDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

@Controller()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('leads')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createPublicLead(@Body() dto: CreatePublicLeadDto) {
    const lead = await this.leadsService.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      message: dto.message || dto.notes,
      preferredBranch: dto.preferredBranch,
      preferredTime: dto.preferredTime,
      internalNotes: dto.notes,
      source: dto.source || 'callback_form',
    });
    return {
      message: 'So\'rovingiz qabul qilindi. Tez orada siz bilan bog\'lanamiz.',
      id: lead.id,
      leadId: lead.id,
    };
  }

  @Get('admin/leads/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getStats() {
    return this.leadsService.getStats();
  }

  @Get('admin/leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async findAll(@Query() query: ListLeadsDto) {
    return this.leadsService.findAll(query);
  }

  @Get('admin/leads/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async findById(@Param('id') id: string) {
    return this.leadsService.findById(id);
  }

  @Post('admin/leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async createFromAdmin(@Body() dto: CreatePublicLeadDto) {
    return this.leadsService.create({
      ...dto,
      source: dto.source || 'admin',
    });
  }

  @Patch('admin/leads/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }
}

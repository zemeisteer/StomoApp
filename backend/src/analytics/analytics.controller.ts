import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { StaffRole } from '@prisma/client';
import { IsString, IsOptional, Length } from 'class-validator';

export class RecordAnalyticsEventDto {
  @IsString()
  @Length(1, 100)
  eventType!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Post('analytics/event')
  @Public()
  async recordPublicEvent(@Body() dto: RecordAnalyticsEventDto, @Req() req: Request) {
    await this.analyticsService.recordEvent(
      dto.eventType,
      dto.sessionId,
      dto.page,
      dto.referrer,
      dto.metadata,
    );
    return { ok: true };
  }

  /** Owner dashboard: money, visits, patients, daily series, top services and doctors. */
  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getDashboard(@Query('from') from?: string, @Query('to') to?: string, @Query('branchId') branchId?: string) {
    return this.dashboardService.summary(from, to, branchId);
  }

  @Get('admin/analytics/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.analyticsService.getDashboardAnalytics({
      startDate,
      endDate,
      branchId,
      doctorId,
      serviceId,
    });
  }
}

import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { EngagementService } from './engagement.service';

export class EngagementSettingsDto {
  @IsOptional()
  @IsBoolean()
  recallEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  recallMonths?: number;

  @IsOptional()
  @IsBoolean()
  birthdayEnabled?: boolean;
}

const DESK = [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.RECEPTION];

@Controller('admin/engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('settings')
  @Roles(...DESK)
  settings() {
    return this.engagement.getSettings();
  }

  @Put('settings')
  @Roles(StaffRole.OWNER)
  updateSettings(@Body() dto: EngagementSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.engagement.updateSettings(dto, user.sub);
  }

  @Get('recall')
  @Roles(...DESK)
  recall() {
    return this.engagement.listRecallDue();
  }

  @Get('birthdays')
  @Roles(...DESK)
  birthdays() {
    return this.engagement.listBirthdays(7);
  }

  @Post('recall/:patientId/send')
  @Roles(...DESK)
  send(@Param('patientId') patientId: string, @CurrentUser() user: JwtPayload) {
    return this.engagement.sendRecall(patientId, user.sub);
  }

  @Post('recall/:patientId/contacted')
  @Roles(...DESK)
  contacted(@Param('patientId') patientId: string, @CurrentUser() user: JwtPayload) {
    return this.engagement.markContacted(patientId, user.sub);
  }
}

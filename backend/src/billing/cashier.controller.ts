import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { CashierService } from './cashier.service';
import { staffBranch } from '../common/branch-scope';

const MAX_CASH = 10_000_000_000;

export class OpenShiftDto {
  @IsInt()
  @Min(0)
  @Max(MAX_CASH)
  openingCash!: number;
}

export class CloseShiftDto {
  @IsInt()
  @Min(0)
  @Max(MAX_CASH)
  countedCash!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RefundDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

const DESK = [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.RECEPTION];

@Controller('admin/cashier')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashierController {
  constructor(private readonly cashier: CashierService) {}

  @Get('summary')
  @Roles(...DESK)
  summary(@Query('date') date?: string, @CurrentUser() user?: JwtPayload) {
    return this.cashier.summary(date, staffBranch(user), user?.sub);
  }

  @Get('shifts')
  @Roles(...DESK)
  shifts(@Query('limit') limit?: string) {
    return this.cashier.listShifts(limit ? parseInt(limit, 10) || 20 : 20);
  }

  @Post('shifts/open')
  @Roles(...DESK)
  open(@Body() dto: OpenShiftDto, @CurrentUser() user: JwtPayload) {
    return this.cashier.openShift(dto.openingCash, user);
  }

  @Post('shifts/:id/close')
  @Roles(...DESK)
  close(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() user: JwtPayload) {
    return this.cashier.closeShift(id, dto.countedCash, dto.note, user);
  }

  /** Refunds return money to a patient, so only owners and administrators may issue them. */
  @Post('payments/:id/refund')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentUser() user: JwtPayload) {
    return this.cashier.refund(id, dto.amount, dto.reason, user);
  }
}

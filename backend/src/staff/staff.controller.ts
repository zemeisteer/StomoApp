import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';
import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsOptional, IsBoolean, Matches, ValidateIf } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

// Telegram user ids are positive integers; null clears the link
const TELEGRAM_ID_PATTERN = /^\d{5,15}$/;
const TELEGRAM_ID_MESSAGE = "Telegram ID faqat raqamlardan iborat bo'lishi kerak (botga /myid yuboring)";

class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  fullName!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @ValidateIf((o) => o.branchId !== null)
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.telegramUserId !== null)
  @IsString()
  @Matches(TELEGRAM_ID_PATTERN, { message: TELEGRAM_ID_MESSAGE })
  telegramUserId?: string | null;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

class UpdateStaffDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  doctorId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.branchId !== null)
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.telegramUserId !== null)
  @IsString()
  @Matches(TELEGRAM_ID_PATTERN, { message: TELEGRAM_ID_MESSAGE })
  telegramUserId?: string | null;
}

@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.OWNER)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(dto);
  }

  @Get()
  findAll() {
    return this.staffService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffService.findById(id);
  }

  /**
   * Owner sets a temporary password. All of that person's sessions end, and they must choose
   * their own password at the next sign-in.
   */
  @Put(':id/password')
  @HttpCode(200)
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: JwtPayload) {
    return this.staffService.resetPassword(id, dto.password, actor.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.staffService.deleteStaff(id, actor.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.updateStaff(id, dto);
  }
}

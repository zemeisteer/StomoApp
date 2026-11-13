import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { StaffRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TranslateService, Lang } from './translate.service';

class TranslateDto {
  @IsString()
  @MaxLength(5000)
  text!: string;

  @IsIn(['uz', 'ru'])
  from!: Lang;

  @IsIn(['uz', 'ru'])
  to!: Lang;
}

@Controller('admin/translate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
export class TranslateController {
  constructor(private readonly service: TranslateService) {}

  @Get('status')
  status() {
    return { enabled: this.service.enabled };
  }

  @Post()
  async translate(@Body() dto: TranslateDto) {
    return { text: await this.service.translate(dto.text, dto.from, dto.to) };
  }
}

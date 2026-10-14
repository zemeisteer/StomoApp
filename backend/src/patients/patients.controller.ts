import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Length,
} from 'class-validator';

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(7, 20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MergePatientsDto {
  @IsString()
  sourceId!: string;

  @IsString()
  targetId!: string;
}

export class ListPatientsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

@Controller('admin/patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findAll(@Query() query: ListPatientsQueryDto) {
    return this.patientsService.findAll(query);
  }

  @Get('duplicates')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  findDuplicates() {
    return this.patientsService.findDuplicates();
  }

  @Post('merge')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  mergeDuplicates(@Body() dto: MergePatientsDto) {
    return this.patientsService.mergePatients(dto.sourceId, dto.targetId);
  }

  @Get('export')
  @Roles(StaffRole.OWNER)
  async exportCsv(@Query('search') search: string, @Res() res: Response) {
    const csv = await this.patientsService.exportCsv(search);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="patients.csv"');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  }

  @Get(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  findById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patientsService.findById(id, user);
  }

  @Put(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }
}

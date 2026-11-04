import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { StaffRole } from '@prisma/client';
import { JwtPayload } from '../auth/auth.service';
import { UpdateCommissionDto } from './dto/commission.dto';

@Controller('admin/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @Roles(StaffRole.OWNER)
  async listAllCommissions(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.commissionsService.listAllCommissions(from, to);
  }

  @Get('my-earnings')
  @Roles(StaffRole.DOCTOR, StaffRole.OWNER)
  async getMyEarnings(
    @CurrentUser() user: JwtPayload,
    @Query('doctorId') queryDoctorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    let targetDoctorId = user.doctorId;
    if (user.role === StaffRole.OWNER && queryDoctorId) {
      targetDoctorId = queryDoctorId;
    }
    if (!targetDoctorId) {
      throw new ForbiddenException('Shifokor profili topilmadi');
    }
    return await this.commissionsService.getDoctorEarnings(targetDoctorId, from, to);
  }

  @Put(':doctorId')
  @Roles(StaffRole.OWNER)
  async updateCommission(
    @Param('doctorId') doctorId: string,
    @Body() dto: UpdateCommissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.commissionsService.updateCommission(doctorId, dto, user);
  }
}


import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificationChannel, NotificationStatus, StaffRole } from '@prisma/client';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannel, { message: 'Noto\'g\'ri kanal turi' })
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationStatus, { message: 'Noto\'g\'ri holat turi' })
  status?: NotificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page butun son bo\'lishi kerak' })
  @Min(1, { message: 'page kamida 1 bo\'lishi kerak' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit butun son bo\'lishi kerak' })
  @Min(1, { message: 'limit kamida 1 bo\'lishi kerak' })
  @Max(100, { message: 'limit ko\'pi bilan 100 bo\'lishi kerak' })
  limit: number = 50;
}

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async findAll(@Query() query: ListNotificationsQueryDto) {
    return this.service.findAll({
      channel: query.channel,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get('integration-status')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getIntegrationStatus() {
    return this.service.getIntegrationStatus();
  }

  @Post(':id/retry')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async retryNotification(@Param('id') id: string, @Req() req: any) {
    const updated = await this.service.retryJob(id, req?.user);
    return {
      message: 'Xabarnoma qayta yuborish navbatiga qo‘yildi',
      job: updated,
    };
  }
}

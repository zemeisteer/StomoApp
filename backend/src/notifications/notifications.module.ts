import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { OpsAlertService } from './ops-alert.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, OpsAlertService],
  exports: [NotificationsService, OpsAlertService],
})
export class NotificationsModule {}

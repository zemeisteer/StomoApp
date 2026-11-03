import { Module } from '@nestjs/common';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { BotServiceGuard } from './bot-service.guard';
import { AppointmentsModule } from '../appointments/appointments.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AppointmentsModule, SchedulingModule, AuditModule],
  controllers: [BotController],
  providers: [BotService, BotServiceGuard],
  exports: [BotService],
})
export class BotModule {}


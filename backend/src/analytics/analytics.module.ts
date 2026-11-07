import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { DashboardService } from './dashboard.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DashboardService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

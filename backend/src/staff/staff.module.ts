import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { StaffTelegramController } from './staff-telegram.controller';
import { StaffTelegramService } from './staff-telegram.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StaffController, StaffTelegramController],
  providers: [StaffService, StaffTelegramService],
  exports: [StaffService, StaffTelegramService],
})
export class StaffModule {}

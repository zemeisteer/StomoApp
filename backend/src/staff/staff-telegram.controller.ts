import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffTelegramService } from './staff-telegram.service';

/** The signed-in staff member manages their own Telegram link (any role). */
@Controller('admin/me/telegram')
@UseGuards(JwtAuthGuard)
export class StaffTelegramController {
  constructor(private readonly staffTelegram: StaffTelegramService) {}

  @Get()
  status(@CurrentUser() user: JwtPayload) {
    return this.staffTelegram.getStatus(user.sub);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  createLink(@CurrentUser() user: JwtPayload) {
    return this.staffTelegram.createLink(user.sub);
  }

  @Delete()
  unlink(@CurrentUser() user: JwtPayload) {
    return this.staffTelegram.unlink(user.sub);
  }
}

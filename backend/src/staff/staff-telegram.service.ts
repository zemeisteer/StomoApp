import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTelegramLinkToken,
  parseTelegramLinkToken,
  verifyTelegramLinkToken,
} from '../common/telegram-link.helper';

/**
 * Self-service linking of a staff account (typically a doctor) to their own
 * Telegram chat, so the bot can send them personal notifications.
 */
@Injectable()
export class StaffTelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');
    return secret;
  }

  private async loadState(staffId: string) {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: staffId },
      select: { id: true, isActive: true, tokenVersion: true, telegramUserId: true, fullName: true, role: true },
    });
    if (!staff) throw new NotFoundException('Foydalanuvchi topilmadi');
    return staff;
  }

  async getStatus(staffId: string) {
    const staff = await this.loadState(staffId);
    return {
      linked: Boolean(staff.telegramUserId),
      telegramUserId: staff.telegramUserId,
      botUsername: this.config.get<string>('TELEGRAM_BOT_USERNAME') || null,
    };
  }

  async createLink(staffId: string) {
    const staff = await this.loadState(staffId);
    const { token, expiresAt } = createTelegramLinkToken(this.secret(), {
      staffId: staff.id,
      tokenVersion: staff.tokenVersion,
      telegramUserId: staff.telegramUserId,
    });
    const botUsername = (this.config.get<string>('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '');
    return {
      token,
      expiresAt,
      // Opening this link in Telegram sends `/start <token>` to the bot
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${token}` : null,
      command: `/start ${token}`,
    };
  }

  async unlink(staffId: string) {
    await this.loadState(staffId);
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { telegramUserId: null } });
    return { linked: false };
  }

  /** Called by the bot (service token) when a user opens the deep link. */
  async linkFromBot(token: string, telegramUserId: string) {
    const parsed = parseTelegramLinkToken(token);
    if (!parsed) throw new BadRequestException('Havola noto\'g\'ri');
    if (!/^\d{5,15}$/.test(telegramUserId || '')) {
      throw new BadRequestException('telegramUserId noto\'g\'ri');
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: parsed.staffId },
      select: { id: true, isActive: true, tokenVersion: true, telegramUserId: true, fullName: true },
    });
    if (
      !staff ||
      !staff.isActive ||
      !verifyTelegramLinkToken(this.secret(), token, {
        staffId: staff.id,
        tokenVersion: staff.tokenVersion,
        telegramUserId: staff.telegramUserId,
      })
    ) {
      throw new BadRequestException('Havola eskirgan yoki allaqachon ishlatilgan');
    }

    const other = await this.prisma.staffUser.findFirst({
      where: { telegramUserId, NOT: { id: staff.id } },
      select: { id: true },
    });
    if (other) throw new ConflictException('Bu Telegram akkaunt boshqa xodimga biriktirilgan');

    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { telegramUserId } });
    return { linked: true, fullName: staff.fullName };
  }
}

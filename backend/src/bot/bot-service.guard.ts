import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BotServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceToken =
      this.config.get<string>('SERVICE_TOKEN') ||
      this.config.get<string>('BOT_SERVICE_TOKEN') ||
      'stomo_bot_service_secret_token_2026';

    const headerToken = request.headers['x-service-token'];
    const authHeader = request.headers['authorization'];
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    const incomingToken = headerToken || bearerToken;

    if (!incomingToken || incomingToken !== serviceToken) {
      throw new UnauthorizedException('Xizmat autentifikatsiyasi xatosi: noto\'g\'ri yoki yetishmayotgan xizmat tokeni');
    }

    return true;
  }
}


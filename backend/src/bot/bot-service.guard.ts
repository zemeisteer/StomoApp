import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class BotServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceToken =
      this.config.get<string>('SERVICE_TOKEN') ||
      this.config.get<string>('BOT_SERVICE_TOKEN');

    // Fail-closed: Never fallback to default/hardcoded strings. Token must be >= 32 characters.
    if (!serviceToken || typeof serviceToken !== 'string' || serviceToken.length < 32) {
      throw new UnauthorizedException(
        'Xizmat autentifikatsiyasi sozlanmagan: SERVICE_TOKEN kamida 32 belgidan iborat bo\'lishi shart',
      );
    }

    const headerToken = request.headers['x-service-token'];
    const authHeader = request.headers['authorization'];
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    const incomingToken = (headerToken || bearerToken) as string | undefined;

    if (!incomingToken || typeof incomingToken !== 'string') {
      throw new UnauthorizedException(
        'Xizmat autentifikatsiyasi xatosi: xizmat tokeni yetishmayapti',
      );
    }

    const expectedBuffer = Buffer.from(serviceToken, 'utf-8');
    const actualBuffer = Buffer.from(incomingToken, 'utf-8');

    // Timing-safe comparison preventing timing attacks
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException(
        'Xizmat autentifikatsiyasi xatosi: noto\'g\'ri xizmat tokeni',
      );
    }

    return true;
  }
}

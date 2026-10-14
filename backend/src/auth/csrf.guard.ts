import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    if (safeMethods.includes(req.method)) {
      return true;
    }

    // If Authorization header is used, CSRF is not applicable
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return true;
    }

    // If cookie authentication is used for mutation, enforce CSRF protection
    const hasCookieAuth = !!req.cookies?.['access_token'];
    if (!hasCookieAuth) {
      return true;
    }

    // 1. Check custom anti-CSRF request header
    const customHeader = req.headers['x-requested-with'] || req.headers['x-csrf-protection'] || req.headers['x-csrf-token'];
    if (customHeader) {
      return true;
    }

    // 2. Validate Origin / Referer
    const origin = req.headers['origin'] || req.headers['referer'];
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const appUrl = this.configService.get('APP_URL', 'http://localhost:4000');

    if (origin) {
      try {
        const originUrl = new URL(origin as string).origin;
        const allowed = [new URL(frontendUrl).origin, new URL(appUrl).origin];
        if (allowed.includes(originUrl)) {
          return true;
        }
      } catch {
        // invalid URL
      }
    }

    throw new ForbiddenException('CSRF himoyasi: xavfsizlik sarlavhasi (X-Requested-With) yoki ruxsat etilgan Origin mavjud emas');
  }
}

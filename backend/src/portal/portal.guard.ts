import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { PORTAL_COOKIE, PortalAuthService, PortalSession } from './portal-auth.service';

/**
 * Patient session from the httpOnly cookie. The staff CSRF guard only looks at staff cookies,
 * so state-changing portal requests must carry the anti-CSRF header themselves.
 */
@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly auth: PortalAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { portal?: PortalSession }>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.headers['x-requested-with'] && !req.headers['x-csrf-token']) {
      throw new ForbiddenException('CSRF tekshiruvi muvaffaqiyatsiz');
    }
    const session = this.auth.verifySession(req.cookies?.[PORTAL_COOKIE]);
    if (!session) throw new UnauthorizedException('Kabinetga qayta kiring');
    req.portal = session;
    return true;
  }
}

export const PortalUser = createParamDecorator((_: unknown, ctx: ExecutionContext): PortalSession => {
  return ctx.switchToHttp().getRequest().portal;
});

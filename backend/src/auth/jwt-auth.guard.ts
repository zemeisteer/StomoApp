import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from './public.decorator';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    // A temporary password (set by an owner) only opens the change-password flow
    const user = context.switchToHttp().getRequest()?.user;
    if (user?.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets)) {
      throw new ForbiddenException({ message: "Avval parolingizni o'zgartiring", code: PASSWORD_CHANGE_REQUIRED });
    }
    return true;
  }
}

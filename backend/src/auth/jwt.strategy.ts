import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // First try cookie
        (req: Request) => req?.cookies?.['access_token'] || null,
        // Then try Authorization header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'dev-secret-change-me'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, doctorId: true, isActive: true, tokenVersion: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Foydalanuvchi faol emas yoki o\'chirilgan');
    }

    if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Sessiya muddati o\'tgan (parol yoki rol o\'zgargan)');
    }

    if (user.role !== payload.role) {
      throw new UnauthorizedException('Foydalanuvchi roli yangilangan, qaytadan kiring');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      doctorId: user.doctorId,
      tokenVersion: user.tokenVersion,
    };
  }
}

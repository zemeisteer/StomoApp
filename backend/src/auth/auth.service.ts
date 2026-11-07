import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: StaffRole;
  doctorId?: string | null;
  tokenVersion?: number;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    this.validateSecrets();
  }

  private validateSecrets() {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const secret = this.configService.get<string>('JWT_SECRET', '');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET', '');

    if (isProd) {
      if (!secret || secret.includes('CHANGE_ME') || secret.length < 32) {
        throw new Error('Xavfsizlik xatosi: Ishlab chiqarish (production) muhitida ishonchli JWT_SECRET kiritilishi shart!');
      }
      if (!refreshSecret || refreshSecret.includes('CHANGE_ME') || refreshSecret.length < 32) {
        throw new Error('Xavfsizlik xatosi: Ishlab chiqarish (production) muhitida ishonchli JWT_REFRESH_SECRET kiritilishi shart!');
      }
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.staffUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Noto\'g\'ri email yoki parol');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Noto\'g\'ri email yoki parol');
    }

    return user;
  }

  /**
   * Shared token issuance flow for login and refresh rotation
   */
  private async issueTokens(user: {
    id: string;
    email: string;
    role: StaffRole;
    doctorId?: string | null;
    tokenVersion: number;
  }): Promise<TokenPair> {
    const accessTokenPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      doctorId: user.doctorId,
      tokenVersion: user.tokenVersion,
    };

    const refreshTokenPayload: JwtPayload = {
      ...accessTokenPayload,
      jti: nanoid(32),
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRATION', '8h'),
    });

    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
    });

    // Store deterministic SHA-256 digest of refresh token (no bcrypt truncation)
    const refreshTokenHash = this.hashToken(refreshToken);

    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string, ipAddress?: string): Promise<TokenPair> {
    const user = await this.validateUser(email, password);

    // Update last login
    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      userId: user.id,
      action: 'staff.login',
      entity: 'StaffUser',
      entityId: user.id,
      ipAddress,
    });

    return this.issueTokens(user);
  }

  async refreshTokens(refreshToken: string, ipAddress?: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.staffUser.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Foydalanuvchi faol emas yoki topilmadi');
      }

      // Check token version to enforce immediate invalidation on password/role change
      if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Sessiya muddati o\'tgan (parol yoki rol yangilangan)');
      }

      const incomingDigest = this.hashToken(refreshToken);

      // Replay Detection: If incoming token does not match stored hash, revoke immediately
      if (!user.refreshTokenHash || user.refreshTokenHash !== incomingDigest) {
        // Possible token theft / replay attack: Revoke active session
        await this.prisma.staffUser.update({
          where: { id: user.id },
          data: { refreshTokenHash: null },
        });

        await this.auditService.log({
          userId: user.id,
          action: 'security.token_replay_detected',
          entity: 'StaffUser',
          entityId: user.id,
          ipAddress,
        });

        throw new UnauthorizedException('Xavfsizlik sababli sessiya bekor qilindi (token takroriy ishlatildi)');
      }

      // Safe Rotation: issue new tokens and update stored hash
      return this.issueTokens(user);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.staffUser.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    await this.auditService.log({
      userId,
      action: 'staff.logout',
      entity: 'StaffUser',
      entityId: userId,
    });
  }

  async invalidateAllSessions(userId: string): Promise<void> {
    await this.prisma.staffUser.update({
      where: { id: userId },
      data: {
        refreshTokenHash: null,
        tokenVersion: { increment: 1 },
      },
    });

    await this.auditService.log({
      userId,
      action: 'staff.sessions_invalidated',
      entity: 'StaffUser',
      entityId: userId,
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}

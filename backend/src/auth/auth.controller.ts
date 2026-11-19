import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, UseGuards, Get, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService, JwtPayload } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AllowPendingPasswordChange, Public } from './public.decorator';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LoginRateLimiter } from './login-rate-limiter';
import { isProductionLike } from '../common/runtime-env';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  password!: string;
}

/** Staff passwords chosen by the person themselves: at least 12 characters. */
export const MIN_STAFF_PASSWORD = 12;

class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_STAFF_PASSWORD, { message: `Yangi parol kamida ${MIN_STAFF_PASSWORD} belgidan iborat bo'lishi kerak` })
  @MaxLength(200)
  newPassword!: string;
}

const REFRESH_COOKIE_PATH = '/api/auth/refresh';

/**
 * Strict production login rate limiting:
 * Limits login attempts to 5 per minute per IP to protect against credential stuffing and brute-force attacks.
 * Test environments can independently override AUTH_LOGIN_THROTTLE_LIMIT without weakening production defaults.
 */
const LOGIN_THROTTLE_LIMIT = parseInt(process.env.AUTH_LOGIN_THROTTLE_LIMIT || '5', 10);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginLimiter: LoginRateLimiter,
  ) {}

  private setSessionCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    const secure = isProductionLike();
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });
    // Refresh token cookie with strict path
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: REFRESH_COOKIE_PATH,
    });
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Three layers (IP+email, IP, email), counted before the password check
    this.loginLimiter.consume(req.ip, dto.email);
    const tokens = await this.authService.login(dto.email, dto.password, req.ip);
    this.loginLimiter.succeeded(req.ip, dto.email);
    this.setSessionCookies(res, tokens);

    return {
      message: 'Tizimga muvaffaqiyatli kirdingiz',
      accessToken: tokens.accessToken,
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }

    try {
      const tokens = await this.authService.refreshTokens(refreshToken, req.ip);
      this.setSessionCookies(res, tokens);

      return {
        message: 'Token yangilandi',
        accessToken: tokens.accessToken,
      };
    } catch (e: any) {
      // Clear invalid cookies
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: REFRESH_COOKIE_PATH });

      throw new UnauthorizedException(e?.message || 'Sessiya muddati tugagan');
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 15 * 60000 } })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.changeOwnPassword(user.sub, dto.currentPassword, dto.newPassword, req.ip);
    this.setSessionCookies(res, tokens);
    return { message: "Parol o'zgartirildi", accessToken: tokens.accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sub);

    // Clear with exact configured paths
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: REFRESH_COOKIE_PATH });

    return { message: 'Tizimdan chiqdingiz' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  async getProfile(@CurrentUser() user: JwtPayload) {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
      doctorId: user.doctorId,
      branchId: user.branchId ?? null,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }
}

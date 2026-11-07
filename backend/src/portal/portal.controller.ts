import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { PORTAL_COOKIE, PORTAL_SESSION_DAYS, PortalAuthService, PortalSession } from './portal-auth.service';
import { PortalSessionGuard, PortalUser } from './portal.guard';
import { PortalService } from './portal.service';

export class RequestCodeDto {
  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsIn(['uz', 'ru'])
  lang?: 'uz' | 'ru';
}

export class VerifyCodeDto {
  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MaxLength(12)
  code!: string;
}

export class LanguageDto {
  @IsIn(['uz', 'ru'])
  lang!: 'uz' | 'ru';
}

export class DeclineDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const isTest = process.env.NODE_ENV === 'test';

/** Patient cabinet: phone + one-time code login, then the patient's own data only. */
@Controller('portal')
@Public()
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  @Post('auth/request-code')
  @HttpCode(200)
  @Throttle({ default: { limit: isTest ? 1000 : 5, ttl: 60000 } })
  requestCode(@Body() dto: RequestCodeDto, @Req() req: Request) {
    return this.auth.requestCode(dto.phone, dto.lang || 'uz', req.ip || null);
  }

  @Post('auth/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: isTest ? 1000 : 10, ttl: 60000 } })
  async verify(@Body() dto: VerifyCodeDto, @Res({ passthrough: true }) res: Response) {
    const token = await this.auth.verifyCode(dto.phone, dto.code);
    res.cookie(PORTAL_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: PORTAL_SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: '/api/portal',
    });
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(PORTAL_COOKIE, { path: '/api/portal' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(PortalSessionGuard)
  me(@PortalUser() session: PortalSession) {
    return this.portal.me(session);
  }

  @Get('overview')
  @UseGuards(PortalSessionGuard)
  overview(@PortalUser() session: PortalSession, @Query('patientId') patientId?: string) {
    return this.portal.overview(session, patientId);
  }

  @Post('plans/:id/accept')
  @HttpCode(200)
  @UseGuards(PortalSessionGuard)
  accept(@PortalUser() session: PortalSession, @Param('id') id: string, @Req() req: Request) {
    return this.portal.acceptPlan(session, id, req.ip || null);
  }

  @Post('plans/:id/decline')
  @HttpCode(200)
  @UseGuards(PortalSessionGuard)
  decline(@PortalUser() session: PortalSession, @Param('id') id: string, @Body() dto: DeclineDto) {
    return this.portal.declinePlan(session, id, dto.reason);
  }

  @Get('invoices/:id/payment-links')
  @UseGuards(PortalSessionGuard)
  links(@PortalUser() session: PortalSession, @Param('id') id: string) {
    return this.portal.paymentLinks(session, id);
  }

  @Post('language')
  @HttpCode(200)
  @UseGuards(PortalSessionGuard)
  language(@PortalUser() session: PortalSession, @Body() dto: LanguageDto) {
    return this.portal.setLanguage(session, dto.lang);
  }
}

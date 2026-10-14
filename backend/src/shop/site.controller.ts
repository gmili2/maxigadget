import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { AppError } from '../common/http';
import { SITE_COOKIE, SiteAccess } from './site-access';

class UnlockDto { @IsString() @MaxLength(100) code: string; }

@Public()
@Controller('site')
export class SiteController {
  constructor(private access: SiteAccess, private config: ConfigService) {}

  /** État de l'accès pour le front (boutique privée ? accès déjà accordé ?) et pixel Meta éventuel. */
  @Get()
  info(@Req() req: Request) {
    return { data: { private: this.access.enabled, unlocked: this.access.granted(req), pixelId: this.config.get<string>('FB_PIXEL_ID') ?? null } };
  }

  /** Vérifie le code d'accès et pose le cookie (httpOnly, 30 jours). Tentatives limitées. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('unlock') @HttpCode(200)
  unlock(@Body() { code }: UnlockDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.access.enabled) return { data: { unlocked: true } };
    const value = this.access.check(code);
    if (!value) throw new AppError(HttpStatus.UNAUTHORIZED, 'BAD_ACCESS_CODE', 'رمز الدخول غير صحيح');
    res.cookie(SITE_COOKIE, value, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/api', maxAge: 30 * 86_400_000 });
    return { data: { unlocked: true } };
  }
}

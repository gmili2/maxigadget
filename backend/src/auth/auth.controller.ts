import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public, type AuthUser } from '../common/decorators';
import { AuthService, REFRESH_TTL_DAYS } from './auth.service';

class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

const COOKIE = 'refresh_token';
/** Cookie « Secure » dès que la requête arrive en HTTPS (derrière le proxy de l'hébergeur : voir trust proxy). */
const cookieOptions = (req: Request): CookieOptions => ({
  httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/api/v1/auth',
  maxAge: REFRESH_TTL_DAYS * 86_400_000,
});
const meta = (req: Request) => ({ userAgent: req.header('user-agent'), ip: req.ip });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...data } = await this.auth.login(dto.email, dto.password, meta(req));
    res.cookie(COOKIE, refreshToken, cookieOptions(req));
    return { data };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { refreshToken, ...data } = await this.auth.refresh(req.cookies?.[COOKIE], meta(req));
      res.cookie(COOKIE, refreshToken, cookieOptions(req));
      return { data };
    } catch (e) {
      res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
      throw e;
    }
  }

  /** Public : un access token expiré ne doit pas empêcher de se déconnecter. */
  @Public()
  @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { data: await this.auth.me(user.id) };
  }
}

import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppError } from '../common/http';

export const SITE_COOKIE = 'site_access';

/**
 * Boutique en accès privé (SITE_ACCESS_CODE). Le cookie d'accès contient une signature du code :
 * changer le code dans .env invalide immédiatement tous les accès donnés.
 */
@Injectable()
export class SiteAccess {
  constructor(private config: ConfigService) {}

  /** Accès privé actif ? */
  get enabled() { return !!this.code; }

  private get code() { return this.config.get<string>('SITE_ACCESS_CODE')?.trim() || null; }

  private sign(code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(`site-access:${code.toLowerCase()}`).digest('base64url');
  }

  /** Vérifie un code saisi ; renvoie la valeur du cookie à poser, ou null. */
  check(input: string) {
    const code = this.code;
    if (!code) return null;
    const a = Buffer.from(this.sign(input.trim())), b = Buffer.from(this.sign(code));
    return a.length === b.length && timingSafeEqual(a, b) ? this.sign(code) : null;
  }

  /** La requête porte-t-elle un accès valide (ou le site est-il public) ? */
  granted(req: Request) {
    if (!this.code) return true;
    const got = Buffer.from(String(req.cookies?.[SITE_COOKIE] ?? ''));
    const want = Buffer.from(this.sign(this.code));
    return got.length === want.length && timingSafeEqual(got, want);
  }
}

/** Protège le catalogue et la commande quand l'accès privé est actif. */
@Injectable()
export class SiteAccessGuard implements CanActivate {
  constructor(private access: SiteAccess) {}

  canActivate(ctx: ExecutionContext) {
    if (this.access.granted(ctx.switchToHttp().getRequest<Request>())) return true;
    throw new AppError(HttpStatus.FORBIDDEN, 'SITE_LOCKED', 'Boutique en accès privé : saisissez le code d’accès.');
  }
}
